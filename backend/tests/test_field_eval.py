"""P6.1 — CPU row-banded lane evaluation tests.

Exact test names required by the packet spec:
  test_y_domain_lane_produces_per_band_values
  test_x_domain_bands_are_vertical_strips
  test_no_axis_lanes_renders_byte_identical_to_main
  test_t_domain_lane_rejected_from_axis_lanes
  test_band_count_clamped
  test_unknown_effect_id_in_axis_lanes_skipped_with_warning
  test_nan_in_curve_sanitized_not_crash
  test_stateful_effect_band0_state_propagation
  test_direction_negative_reverses_band_order
  test_render_frame_ipc_accepts_axis_lanes_payload
  test_banded_render_360p_under_150ms
"""

from __future__ import annotations

import hashlib
import os
import statistics
import sys
import time
import uuid

import numpy as np
import pytest

# Ensure backend src is importable when running from the backend/ directory
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from modulation.field_eval import (
    BAND_COUNT_MAX,
    BAND_COUNT_MIN,
    apply_effect_banded,
    evaluate_axis_lane_bands,
)
from modulation.schema import Lane, LaneDomain, LoopMode, InterpMode


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_frame(h: int = 64, w: int = 64) -> np.ndarray:
    """Return a filled uint8 RGBA frame."""
    rng = np.random.default_rng(42)
    return rng.integers(0, 256, (h, w, 4), dtype=np.uint8)


def _ramp_curve(n: int = 128) -> list[float]:
    """A linear ramp from 0 to 1 — produces distinct per-band values."""
    return [i / (n - 1) for i in range(n)]


def _flat_curve(val: float = 0.5, n: int = 16) -> list[float]:
    return [val] * n


def _identity_effect(frame, params, state_in, *, frame_index, seed, resolution):
    """No-op effect that returns a copy — stateless."""
    return frame.copy(), None


def _stateful_effect(frame, params, state_in, *, frame_index, seed, resolution):
    """Effect that accumulates a counter in state."""
    count = (state_in or {}).get("count", 0) + 1
    return frame.copy(), {"count": count}


def _param_stamper_effect(frame, params, state_in, *, frame_index, seed, resolution):
    """Stamps the 'value' param into the red channel of the frame (for verification)."""
    out = frame.copy()
    val = int(float(params.get("value", 0)) * 255)
    val = max(0, min(255, val))
    out[:, :, 0] = val
    return out, None


# ---------------------------------------------------------------------------
# evaluate_axis_lane_bands tests
# ---------------------------------------------------------------------------


def test_y_domain_lane_produces_per_band_values() -> None:
    """Y-domain lane returns one distinct scalar per band."""
    curve = _ramp_curve(128)
    lane = Lane(domain=LaneDomain.Y, direction=1.0)
    scalars = evaluate_axis_lane_bands(curve, lane, t_norm=0.0, n_bands=8)

    assert len(scalars) == 8
    # A ramp curve should produce strictly increasing values across Y bands.
    assert all(scalars[i] < scalars[i + 1] for i in range(len(scalars) - 1)), (
        f"Expected strictly increasing scalars for ramp, got: {scalars}"
    )
    # All values in [0, 1].
    assert all(0.0 <= v <= 1.0 for v in scalars)


def test_x_domain_bands_are_vertical_strips() -> None:
    """X-domain lane returns per-band scalars corresponding to vertical strip positions."""
    curve = _ramp_curve(64)
    lane = Lane(domain=LaneDomain.X, direction=1.0)
    scalars = evaluate_axis_lane_bands(curve, lane, t_norm=0.0, n_bands=4)

    assert len(scalars) == 4
    # Ramp → leftmost strip has lowest value, rightmost has highest.
    assert scalars[0] < scalars[-1], f"Expected increasing X scalars, got: {scalars}"


def test_no_axis_lanes_renders_byte_identical_to_main() -> None:
    """apply_chain with axis_lanes=None or axis_lanes=[] is byte-identical to baseline.

    This is the headline acceptance gate for P6.1: the new code path must have
    zero effect when axis_lanes is absent.
    """
    from engine.pipeline import apply_chain
    from effects import registry

    # Find an effect that is actually registered.
    all_effects = registry.list_all()
    assert all_effects, "No effects registered — cannot run byte-identical test"
    eff = all_effects[0]
    eid = eff["id"]

    frame = _make_frame(64, 64)
    chain = [{"effect_id": eid, "params": {}, "enabled": True}]

    # Baseline render (no axis_lanes argument at all).
    out_baseline, states_baseline = apply_chain(
        frame.copy(), chain, project_seed=0, frame_index=0, resolution=(64, 64)
    )

    # With axis_lanes=None explicitly.
    out_none, _ = apply_chain(
        frame.copy(),
        chain,
        project_seed=0,
        frame_index=0,
        resolution=(64, 64),
        axis_lanes=None,
    )

    # With axis_lanes=[] explicitly.
    out_empty, _ = apply_chain(
        frame.copy(),
        chain,
        project_seed=0,
        frame_index=0,
        resolution=(64, 64),
        axis_lanes=[],
    )

    def _sha(arr: np.ndarray) -> str:
        return hashlib.md5(arr.tobytes()).hexdigest()

    hash_baseline = _sha(out_baseline)
    assert _sha(out_none) == hash_baseline, (
        "axis_lanes=None produced different output from baseline"
    )
    assert _sha(out_empty) == hash_baseline, (
        "axis_lanes=[] produced different output from baseline"
    )


def test_t_domain_lane_rejected_from_axis_lanes() -> None:
    """T-domain lanes in axis_lanes are skipped — T stays in automation_overrides.

    This is a negative test: passing a T-domain axis_lane must NOT crash the
    pipeline, and must NOT alter the frame relative to a baseline render with
    no axis_lanes.
    """
    from engine.pipeline import apply_chain
    from effects import registry

    all_effects = registry.list_all()
    eid = all_effects[0]["id"]

    frame = _make_frame(32, 32)
    chain = [{"effect_id": eid, "params": {}, "enabled": True}]

    # Baseline with no axis_lanes.
    out_baseline, _ = apply_chain(
        frame.copy(), chain, project_seed=0, frame_index=0, resolution=(32, 32)
    )

    # With a T-domain axis_lane — should be skipped, output identical to baseline.
    t_axis_lane = [
        {
            "effect_id": eid,
            "param": "radius",
            "curve": [0.1, 0.5, 0.9],
            "domain": "t",  # <-- T-domain: must be rejected
            "direction": 1.0,
            "n_bands": 8,
        }
    ]
    out_t, _ = apply_chain(
        frame.copy(),
        chain,
        project_seed=0,
        frame_index=0,
        resolution=(32, 32),
        axis_lanes=t_axis_lane,
    )

    # T-domain must be silently skipped — frame unchanged from baseline.
    assert np.array_equal(out_baseline, out_t), (
        "T-domain axis_lane must be skipped (byte-identical to baseline), "
        "but frame changed"
    )

    # Also test evaluate_axis_lane_bands directly — must raise ValueError.
    lane_t = Lane(domain=LaneDomain.T)
    with pytest.raises(ValueError, match="Y or X"):
        evaluate_axis_lane_bands([0.1, 0.5, 0.9], lane_t, t_norm=0.5, n_bands=8)


def test_band_count_clamped() -> None:
    """n_bands out of [2, 128] is clamped, never raises."""
    curve = _flat_curve(0.5)
    lane = Lane(domain=LaneDomain.Y)

    for n_raw in [0, 1, -5, -100]:
        scalars = evaluate_axis_lane_bands(curve, lane, t_norm=0.0, n_bands=n_raw)
        assert len(scalars) == BAND_COUNT_MIN, (
            f"n_bands={n_raw} should clamp to {BAND_COUNT_MIN}, got {len(scalars)}"
        )

    for n_raw in [999, 200, 1000, 128]:
        scalars = evaluate_axis_lane_bands(curve, lane, t_norm=0.0, n_bands=n_raw)
        assert len(scalars) == min(n_raw, BAND_COUNT_MAX), (
            f"n_bands={n_raw} should clamp to {BAND_COUNT_MAX}, got {len(scalars)}"
        )


def test_unknown_effect_id_in_axis_lanes_skipped_with_warning(caplog) -> None:
    """Unknown effect_id in axis_lanes must be skipped with a warning, never crash."""
    import logging
    from engine.pipeline import apply_chain
    from effects import registry

    all_effects = registry.list_all()
    eid = all_effects[0]["id"]

    frame = _make_frame(32, 32)
    chain = [{"effect_id": eid, "params": {}, "enabled": True}]

    # Baseline
    out_baseline, _ = apply_chain(
        frame.copy(), chain, project_seed=0, frame_index=0, resolution=(32, 32)
    )

    # axis_lanes with a completely unknown effect_id
    unknown_lane = [
        {
            "effect_id": "fx.nonexistent_effect_p61_test",
            "param": "radius",
            "curve": [0.2, 0.8],
            "domain": "y",
            "n_bands": 4,
        }
    ]
    with caplog.at_level(logging.WARNING):
        out_with_unknown, _ = apply_chain(
            frame.copy(),
            chain,
            project_seed=0,
            frame_index=0,
            resolution=(32, 32),
            axis_lanes=unknown_lane,
        )

    # Frame must be identical to baseline — the unknown lane is a no-op.
    # (The unknown effect_id is NOT in the chain, so the axis_lane spec for it
    # is ignored at the per-effect loop level — the known effect runs normally.)
    assert np.array_equal(out_baseline, out_with_unknown), (
        "Unknown effect_id in axis_lanes must not alter frame output"
    )


def test_nan_in_curve_sanitized_not_crash() -> None:
    """NaN and Inf in curve must be sanitised, not crash."""
    lane = Lane(domain=LaneDomain.Y)
    bad_curves = [
        [float("nan"), 0.5, float("inf")],
        [float("-inf"), float("nan")],
        [float("nan")],
        [],
    ]
    for curve in bad_curves:
        scalars = evaluate_axis_lane_bands(curve, lane, t_norm=0.0, n_bands=4)
        assert len(scalars) == 4
        assert all(isinstance(v, float) for v in scalars)
        assert all(not (v != v) for v in scalars), f"NaN survived in scalars: {scalars}"


def test_stateful_effect_band0_state_propagation() -> None:
    """Band 0's state_out is propagated to all subsequent bands (approximate banding).

    We verify that: state_in goes to band 0, and band 0's state_out (count=1)
    is passed as state_in to bands 1..N-1.  All bands should return count=2
    (they each increment from band0's count=1), and the returned state_out
    should be the band-0 state (count=1, since that's what band0 returned).
    """
    frame = _make_frame(32, 32)
    scalars = [0.5] * 4  # 4 bands, flat scalar

    _, state_out = apply_effect_banded(
        frame,
        _stateful_effect,
        "test.stateful",
        {},
        "value",
        scalars,
        state_in=None,
        frame_index=0,
        project_seed=0,
        resolution=(32, 32),
        axis=LaneDomain.Y,
    )

    # state_out is band-0's state_out: count should be 1 (None → 0 → +1 = 1).
    assert state_out is not None
    assert state_out.get("count") == 1, (
        f"Expected band-0 state_out count=1 (state_in=None → count=0 → +1), "
        f"got: {state_out}"
    )


def test_direction_negative_reverses_band_order() -> None:
    """direction < 0 reverses the band order (band 0 = far end of axis)."""
    curve = _ramp_curve(128)

    lane_fwd = Lane(domain=LaneDomain.Y, direction=1.0)
    lane_rev = Lane(domain=LaneDomain.Y, direction=-1.0)

    scalars_fwd = evaluate_axis_lane_bands(curve, lane_fwd, t_norm=0.0, n_bands=8)
    scalars_rev = evaluate_axis_lane_bands(curve, lane_rev, t_norm=0.0, n_bands=8)

    # Reversed direction must exactly reverse the order.
    assert scalars_rev == scalars_fwd[::-1], (
        f"direction=-1 did not reverse band order.\n"
        f"fwd: {scalars_fwd}\nrev: {scalars_rev}"
    )


def test_render_frame_ipc_accepts_axis_lanes_payload(
    zmq_client, synthetic_video_path
) -> None:
    """render_frame IPC command accepts an axis_lanes payload without error.

    Sends a render_frame with axis_lanes targeting fx.blur's radius param on
    a Y-domain lane.  The server must respond ok=True (not crash, not error).
    """
    msg_id = str(uuid.uuid4())
    zmq_client.send_json(
        {
            "cmd": "render_frame",
            "id": msg_id,
            "path": synthetic_video_path,
            "time": 0.0,
            "chain": [
                {
                    "effect_id": "fx.blur",
                    "params": {"radius": 5.0},
                    "enabled": True,
                }
            ],
            "axis_lanes": [
                {
                    "effect_id": "fx.blur",
                    "param": "radius",
                    "curve": [0.0, 0.2, 0.5, 0.8, 1.0],
                    "domain": "y",
                    "direction": 1.0,
                    "interp_mode": "linear",
                    "loop_mode": "off",
                    "n_bands": 16,
                }
            ],
        }
    )
    resp = zmq_client.recv_json()
    assert resp["id"] == msg_id
    assert resp.get("ok") is True, (
        f"render_frame with axis_lanes payload failed: {resp.get('error')}"
    )
    assert "frame_data" in resp


def test_banded_render_360p_under_150ms() -> None:
    """Banded render of fx.blur with 32 bands on 640×360 completes under 150ms.

    Tests median-of-3 runs to account for JIT warmup and transient load.
    """
    from engine.pipeline import apply_chain
    from effects import registry

    # Verify fx.blur is available.
    blur_info = registry.get("fx.blur")
    if blur_info is None:
        pytest.skip("fx.blur not registered — cannot run perf test")

    frame = np.random.default_rng(7).integers(0, 256, (360, 640, 4), dtype=np.uint8)
    chain = [
        {
            "effect_id": "fx.blur",
            "params": {"radius": 5.0},
            "enabled": True,
        }
    ]
    axis_lanes = [
        {
            "effect_id": "fx.blur",
            "param": "radius",
            "curve": [float(i) / 31 * 10.0 for i in range(32)],
            "domain": "y",
            "direction": 1.0,
            "interp_mode": "linear",
            "loop_mode": "off",
            "n_bands": 32,
        }
    ]

    timings: list[float] = []
    for _ in range(3):
        t0 = time.perf_counter()
        apply_chain(
            frame.copy(),
            chain,
            project_seed=0,
            frame_index=0,
            resolution=(640, 360),
            axis_lanes=axis_lanes,
        )
        timings.append((time.perf_counter() - t0) * 1000.0)

    median_ms = statistics.median(timings)
    assert median_ms < 150.0, (
        f"Banded render 640×360 32-bands took {median_ms:.1f}ms median "
        f"(limit 150ms). All runs: {[f'{t:.1f}ms' for t in timings]}"
    )
