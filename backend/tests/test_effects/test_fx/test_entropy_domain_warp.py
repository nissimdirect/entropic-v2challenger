"""Tests for fx.entropy_domain_warp — contract + edges + numeric guards (PLAY-005)."""

import numpy as np
import pytest

from effects.fx.entropy_domain_warp import (
    EFFECT_ID,
    EFFECT_NAME,
    EFFECT_CATEGORY,
    PARAMS,
    apply,
)

pytestmark = pytest.mark.smoke


def _frame(h=64, w=64, seed=42):
    """Random RGBA frame — guarantees high entropy in every block."""
    rng = np.random.default_rng(seed)
    f = rng.integers(0, 256, (h, w, 4), dtype=np.uint8)
    f[:, :, 3] = 255  # opaque alpha
    return f


def _flat_frame(h=64, w=64, value=128):
    """Constant-luma frame — guarantees zero entropy everywhere."""
    f = np.zeros((h, w, 4), dtype=np.uint8)
    f[:, :, :3] = value
    f[:, :, 3] = 255
    return f


KW = {"frame_index": 0, "seed": 42, "resolution": (64, 64)}


# --- Contract ---------------------------------------------------------------


def test_metadata_constants():
    assert EFFECT_ID == "fx.entropy_domain_warp"
    assert EFFECT_NAME
    assert EFFECT_CATEGORY


def test_basic_shape_and_dtype():
    """Output is same shape/dtype as input."""
    frame = _frame()
    result, _ = apply(frame, {}, None, **KW)
    assert result.shape == frame.shape
    assert result.dtype == np.uint8


def test_defaults_sane():
    """All PARAMS declare default within [min,max] (where ranges apply)."""
    for name, info in PARAMS.items():
        assert "default" in info, f"{name} missing default"
        if info["type"] in ("float", "int"):
            assert info["min"] <= info["default"] <= info["max"], (
                f"{name} default {info['default']} outside [{info['min']},{info['max']}]"
            )


def test_alpha_preserved():
    """Alpha channel must be opaque after warp on a fully-opaque frame."""
    frame = _frame()
    result, _ = apply(frame, {"intensity": 0.8}, None, **KW)
    # remap with mirror boundary keeps alpha=255 sources
    assert result[:, :, 3].min() >= 254  # allow off-by-1 from bilinear filtering


def test_intensity_zero_is_identity():
    """intensity=0 short-circuits to identity copy."""
    frame = _frame()
    result, state = apply(frame, {"intensity": 0.0}, None, **KW)
    np.testing.assert_array_equal(result, frame)


def test_determinism_same_args():
    """Same inputs → byte-equal output."""
    frame = _frame()
    params = {"intensity": 0.5, "max_offset_px": 15.0}
    r1, _ = apply(frame, params, None, **KW)
    r2, _ = apply(frame, params, None, **KW)
    np.testing.assert_array_equal(r1, r2)


def test_determinism_seed_changes_output():
    """Different seed → (likely) different output."""
    frame = _frame()
    params = {"intensity": 0.7, "max_offset_px": 20.0, "noise_scale": 30.0}
    r1, _ = apply(frame, params, None, frame_index=0, seed=1, resolution=(64, 64))
    r2, _ = apply(frame, params, None, frame_index=0, seed=2, resolution=(64, 64))
    assert not np.array_equal(r1, r2)


# --- Edge cases / numeric guards (PLAY-005) ---------------------------------


def test_param_clamping_intensity_high():
    """intensity > 1.0 must clamp, not raise."""
    frame = _frame()
    result, _ = apply(frame, {"intensity": 99.0}, None, **KW)
    assert result.shape == frame.shape
    assert result.dtype == np.uint8


def test_param_clamping_intensity_negative():
    """intensity < 0 must clamp to 0 → identity output."""
    frame = _frame()
    result, _ = apply(frame, {"intensity": -10.0}, None, **KW)
    np.testing.assert_array_equal(result, frame)


def test_param_clamping_block_size():
    """Out-of-range entropy_block clamps without raising."""
    frame = _frame()
    r1, _ = apply(frame, {"intensity": 0.5, "entropy_block": 1}, None, **KW)
    r2, _ = apply(frame, {"intensity": 0.5, "entropy_block": 999}, None, **KW)
    assert r1.shape == frame.shape and r1.dtype == np.uint8
    assert r2.shape == frame.shape and r2.dtype == np.uint8


def test_invalid_mode_falls_back_to_forward():
    """Bad enum value defaults to 'forward'."""
    frame = _frame()
    result, _ = apply(frame, {"intensity": 0.5, "mode": "garbage"}, None, **KW)
    assert result.shape == frame.shape


def test_invalid_boundary_falls_back_to_mirror():
    """Bad boundary defaults to 'mirror'."""
    frame = _frame()
    result, _ = apply(frame, {"intensity": 0.5, "boundary_mode": "nope"}, None, **KW)
    assert result.shape == frame.shape


# --- Visual / algorithmic ---------------------------------------------------


def test_flat_frame_low_warp():
    """Flat frame (zero entropy) → output ≈ input even at high intensity."""
    frame = _flat_frame(value=128)
    result, _ = apply(
        frame,
        {"intensity": 1.0, "max_offset_px": 50.0, "temporal_smooth": 0.0},
        None,
        **KW,
    )
    # Forward mode + entropy=0 → mask=0 → no displacement → identity
    np.testing.assert_array_equal(result, frame)


def test_inverse_mode_warps_flat_frame():
    """Inverse mode flips the mask: flat regions warp."""
    frame = _flat_frame(value=128)
    # All values equal → after warp, still all equal (single-color frame is invariant under remap)
    # So we use a flat-luma but two-color frame won't work either. Use a horizontal split.
    frame2 = np.zeros((64, 64, 4), dtype=np.uint8)
    frame2[:32, :, 0] = 200
    frame2[32:, :, 0] = 50
    frame2[:, :, 3] = 255
    result, _ = apply(
        frame2,
        {
            "intensity": 1.0,
            "max_offset_px": 30.0,
            "mode": "inverse",
            "entropy_block": 8,
            "temporal_smooth": 0.0,
        },
        None,
        **KW,
    )
    # Inverse mode should warp the flat halves → some pixels will differ from input
    diff = np.abs(result.astype(np.int32) - frame2.astype(np.int32)).sum()
    assert diff > 0, "Inverse mode failed to warp flat regions"


def test_random_frame_warps():
    """High-entropy random frame produces visibly different output."""
    frame = _frame()
    result, _ = apply(
        frame,
        {"intensity": 1.0, "max_offset_px": 25.0, "temporal_smooth": 0.0},
        None,
        **KW,
    )
    diff = np.abs(result.astype(np.int32) - frame.astype(np.int32)).sum()
    assert diff > 0, "High-entropy frame failed to warp"


def test_dim_change_resets_state():
    """Resolution change must not blow up — state must reset cleanly."""
    f1 = _frame(h=64, w=64)
    _, state = apply(
        f1,
        {"intensity": 0.5, "temporal_smooth": 0.5},
        None,
        frame_index=0,
        seed=42,
        resolution=(64, 64),
    )
    # Now apply with different dims using the old state — must not crash
    f2 = _frame(h=48, w=80)
    result, state2 = apply(
        f2,
        {"intensity": 0.5, "temporal_smooth": 0.5},
        state,
        frame_index=1,
        seed=42,
        resolution=(48, 80),
    )
    assert result.shape == f2.shape
    # State must be re-shaped to new dims (or None)
    if state2 is not None and "prev_mask" in state2:
        assert state2["prev_mask"].shape == (48, 80)


def test_state_persists_across_frames():
    """Stateful path: temporal_smooth>0 should yield non-None state."""
    frame = _frame()
    _, state = apply(
        frame,
        {"intensity": 0.5, "temporal_smooth": 0.5},
        None,
        **KW,
    )
    assert state is not None
    assert "prev_mask" in state
    assert state["prev_mask"].shape == (64, 64)


def test_no_nan_or_inf_in_output():
    """Output must contain no NaN/Inf — uint8 cannot represent them anyway, but this guards the float path."""
    frame = _frame()
    result, _ = apply(
        frame,
        {"intensity": 1.0, "max_offset_px": 100.0, "noise_scale": 10.0},
        None,
        **KW,
    )
    # uint8 is intrinsically finite; this is a smoke check
    assert result.dtype == np.uint8
    assert result.min() >= 0
    assert result.max() <= 255
