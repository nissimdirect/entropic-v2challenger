"""Oracle for the transitions v2 effects family (#370, UAT #427):
fx.transition_column_cascade, fx.transition_column_cascade_reverse,
fx.transition_row_waterfall.

Contract (see each module's docstring): real two-layer compositing doesn't
exist yet, so these run inside the single-frame effect contract — frame_a
(the "outgoing" layer) is solid black, frame_b (the "incoming" layer) is the
frame argument passed in, and progress = frame_index / duration_frames,
clamped to [0, 1].

Boundary-frame checks (the CU+ORACLE row asks for this): at t=0 the output
must equal frame_a (black); at t=1 it must equal frame_b (the input frame,
byte-identical); the midpoint must differ from both.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest

from .conftest import per_pixel_l1_distance, run_cli_apply

EFFECT_IDS = [
    "fx.transition_column_cascade",
    "fx.transition_column_cascade_reverse",
    "fx.transition_row_waterfall",
]
MIN_L1 = 2.0
DURATION_FRAMES = 30  # default


@pytest.mark.oracle
@pytest.mark.parametrize("effect_id", EFFECT_IDS)
def test_transition_visible_at_defaults(
    testsrc_clip: Path, tmp_path: Path, effect_id: str
) -> None:
    out = tmp_path / f"{effect_id}.mp4"
    run_cli_apply(testsrc_clip, out, effect_id)

    l1 = per_pixel_l1_distance(testsrc_clip, out)

    assert l1 >= MIN_L1, (
        f"{effect_id} at DEFAULTS produced no visible change at frame 0 "
        f"(L1={l1:.2f}, need >= {MIN_L1}) — invisible-at-defaults finding "
        f"(NOTE: frame 0 is expected to be solid black per contract, so this "
        f"failing would mean the reveal never even starts)"
    )


def _make_frame() -> np.ndarray:
    frame = np.zeros((90, 120, 4), dtype=np.uint8)
    frame[:, :, 0] = 180
    frame[:, :, 1] = 60
    frame[:, :, 2] = 200
    frame[:, :, 3] = 255
    return frame


@pytest.mark.parametrize("effect_id", EFFECT_IDS)
def test_transition_boundary_frames(effect_id: str) -> None:
    """t=0 -> frame_a (black); t=1 (and beyond) -> frame_b (== input, exact);
    midpoint -> differs from both (partial reveal)."""
    from effects import registry

    fn = registry.get(effect_id)["fn"]
    frame = _make_frame()
    params = {"duration_frames": DURATION_FRAMES}
    resolution = (120, 90)

    out_t0, _ = fn(frame, params, None, frame_index=0, seed=7, resolution=resolution)
    out_mid, _ = fn(
        frame,
        params,
        None,
        frame_index=DURATION_FRAMES // 2,
        seed=7,
        resolution=resolution,
    )
    out_t1, _ = fn(
        frame, params, None, frame_index=DURATION_FRAMES, seed=7, resolution=resolution
    )

    # t=0: solid black RGB (frame_a), alpha carried through from the source.
    assert np.array_equal(out_t0[:, :, :3], np.zeros_like(out_t0[:, :, :3])), (
        f"{effect_id} at t=0 is not solid black (frame_a) — reveal starts pre-advanced"
    )
    assert np.array_equal(out_t0[:, :, 3], frame[:, :, 3]), (
        f"{effect_id} at t=0 altered alpha, contract says alpha passes through"
    )

    # t=1 (frame_index == duration_frames): fully revealed, byte-identical to
    # the source frame (frame_b).
    assert np.array_equal(out_t1, frame), (
        f"{effect_id} at t=1 (frame_index={DURATION_FRAMES}) does not equal "
        f"the source frame byte-for-byte — reveal incomplete at nominal end"
    )

    # Midpoint must differ from both boundaries (a real partial reveal, not a
    # step function landing early/late).
    assert not np.array_equal(out_mid, out_t0), (
        f"{effect_id} midpoint is identical to t=0 — reveal not progressing"
    )
    assert not np.array_equal(out_mid, out_t1), (
        f"{effect_id} midpoint is identical to t=1 — reveal completes too early"
    )


@pytest.mark.parametrize("effect_id", EFFECT_IDS)
def test_transition_deterministic_across_two_runs(effect_id: str) -> None:
    from effects import registry

    fn = registry.get(effect_id)["fn"]
    frame = _make_frame()
    params = {"duration_frames": DURATION_FRAMES, "columns": 20}
    resolution = (120, 90)

    out1, _ = fn(
        frame,
        params,
        None,
        frame_index=DURATION_FRAMES // 2,
        seed=7,
        resolution=resolution,
    )
    out2, _ = fn(
        frame,
        params,
        None,
        frame_index=DURATION_FRAMES // 2,
        seed=7,
        resolution=resolution,
    )
    assert np.array_equal(out1, out2), (
        f"{effect_id} is non-deterministic for identical inputs"
    )
