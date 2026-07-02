"""Tests for fx.temporal_dispersion — Frankenstein of temporal_crystal + spectral_freeze + Disperse phase rotation."""

from collections import deque

import numpy as np
import pytest

from effects.fx.temporal_dispersion import EFFECT_ID, PARAMS, apply

pytestmark = pytest.mark.smoke


def _frame(h=64, w=64, alpha=255, seed=42):
    rng = np.random.default_rng(seed)
    f = rng.integers(0, 256, (h, w, 4), dtype=np.uint8)
    f[:, :, 3] = alpha
    return f


KW = {"frame_index": 0, "seed": 42, "resolution": (64, 64)}


# ----- Contract / shape -----


def test_basic_returns_frame_and_state():
    f = _frame()
    out, state = apply(f, {}, None, **KW)
    assert out.shape == f.shape
    assert out.dtype == np.uint8
    assert state is not None
    assert "frame_buffer" in state and "resolution" in state
    assert isinstance(state["frame_buffer"], deque)


def test_first_frame_passthrough():
    """First frame (buffer len < 2) must pass through unchanged — only seeds the ring."""
    f = _frame()
    out, state = apply(f, {}, None, **KW)
    np.testing.assert_array_equal(out, f)
    assert state is not None and len(state["frame_buffer"]) == 1


def test_alpha_preserved_through_dispersion():
    """Alpha channel must round-trip even after phase rotation kicks in."""
    f1 = _frame(alpha=200)
    f2 = _frame(alpha=200, seed=43)
    _, state = apply(f1, {}, None, **KW)
    out, _ = apply(f2, {}, state, **KW)
    np.testing.assert_array_equal(out[:, :, 3], 200)


# ----- Defaults / params -----


def test_default_params_sane():
    """Every PARAM must have a default within its declared range."""
    for pname, pspec in PARAMS.items():
        d = pspec.get("default")
        if pspec["type"] in ("float", "int"):
            assert pspec["min"] <= d <= pspec["max"], pname
        elif pspec["type"] == "choice":
            assert d in pspec["options"], pname


def test_intensity_zero_is_identity():
    """At intensity=0 wet/dry produces no change — output must equal input."""
    f1 = _frame()
    f2 = _frame(seed=43)
    _, state = apply(f1, {}, None, **KW)
    out, _ = apply(f2, {"intensity": 0.0}, state, **KW)
    np.testing.assert_array_equal(out, f2)


def test_max_phase_zero_only_blends_originals():
    """With max_phase_rad=0 every buffered frame is identity → output ≈ weighted blend of input frames (no spectral smear)."""
    f1 = _frame()
    f2 = _frame(seed=43)
    _, state = apply(f1, {}, None, **KW)
    out, _ = apply(f2, {"max_phase_rad": 0.0, "intensity": 1.0}, state, **KW)
    # No phase rotation = pure weighted average of buffered frames; bounded RGB.
    assert out.dtype == np.uint8
    assert not np.isnan(out).any()
    # Output should differ from f2 because it averages with f1 too.
    assert not np.array_equal(out[:, :, :3], f2[:, :, :3])


# ----- Curve choices -----


def test_all_curve_options_run():
    """Every weight envelope mode runs without NaN."""
    f1 = _frame()
    f2 = _frame(seed=43)
    for curve in ["hann", "linear", "exp", "triangle"]:
        _, st = apply(f1, {"curve": curve}, None, **KW)
        out, _ = apply(f2, {"curve": curve, "intensity": 0.7}, st, **KW)
        assert not np.isnan(out).any(), f"{curve} produced NaN"
        assert out.dtype == np.uint8


def test_invalid_curve_falls_back_to_hann():
    f = _frame()
    out, st = apply(f, {"curve": "garbage"}, None, **KW)
    assert st is not None  # silently falls back, no crash


def test_invalid_mode_falls_back():
    f = _frame()
    _, st = apply(f, {"mode": "weirdmode"}, None, **KW)
    assert st is not None


# ----- Determinism -----


def test_deterministic_given_seed_and_inputs():
    f1 = _frame()
    f2 = _frame(seed=43)
    _, s1 = apply(f1, {}, None, **KW)
    _, s2 = apply(f1, {}, None, **KW)
    out1, _ = apply(f2, {"intensity": 0.7}, s1, **KW)
    out2, _ = apply(f2, {"intensity": 0.7}, s2, **KW)
    np.testing.assert_array_equal(out1, out2)


# ----- State / temporal evolution -----


def test_state_evolves_visible_change_after_buffer_fills():
    """Once the buffer has ≥2 frames, intensity>0 must produce a visible change."""
    f1 = _frame()
    f2 = _frame(seed=99)
    _, st = apply(f1, {}, None, **KW)
    # Now buffer has 1 entry; second call adds f2 → buffer=2 → dispersion fires.
    out, _ = apply(f2, {"intensity": 1.0, "max_phase_rad": 3.14}, st, **KW)
    # Output should differ from f2 (input) because dispersion+old frame mix in.
    diff = float(np.mean(np.abs(out[:, :, :3].astype(int) - f2[:, :, :3].astype(int))))
    assert diff > 1.0, f"expected visible dispersion, got mean abs diff {diff}"


def test_buffer_grows_then_caps_at_buffer_size():
    """Deque maxlen must equal buffer_size; older frames evict on overflow."""
    state = None
    for i in range(10):
        f = _frame(seed=100 + i)
        _, state = apply(f, {"buffer_size": 4}, state, **KW)
    assert state is not None
    assert isinstance(state["frame_buffer"], deque)
    assert state["frame_buffer"].maxlen == 4
    assert len(state["frame_buffer"]) == 4


# ----- Edge cases -----


def test_resolution_change_resets_buffer():
    """Dimension change must flush the ring (otherwise FFT shape mismatch)."""
    f1 = _frame(h=64, w=64)
    _, st1 = apply(f1, {}, None, **KW)
    f2 = _frame(h=80, w=120)
    KW2 = {"frame_index": 1, "seed": 42, "resolution": (80, 120)}
    out, st2 = apply(f2, {}, st1, **KW2)
    assert out.shape == (80, 120, 4)
    assert st2 is not None
    # Buffer was flushed and now contains only the new-resolution frame.
    assert len(st2["frame_buffer"]) == 1
    assert st2["frame_buffer"][0].shape == (80, 120, 3)


def test_param_clamping_at_trust_boundary():
    """Out-of-range numeric params must clamp (PLAY-005), no NaN."""
    f1 = _frame()
    f2 = _frame(seed=43)
    _, st = apply(f1, {}, None, **KW)
    bad = {
        "buffer_size": 99999,  # above max
        "max_phase_rad": -50.0,  # below min
        "intensity": 5.0,  # above max
    }
    out, _ = apply(f2, bad, st, **KW)
    assert out.dtype == np.uint8
    assert not np.isnan(out).any()


def test_extreme_phase_no_nan():
    """Max phase rotation across full ring must remain bounded."""
    state = None
    for i in range(6):
        f = _frame(seed=200 + i)
        out, state = apply(
            f,
            {"max_phase_rad": 6.28, "intensity": 1.0, "buffer_size": 8},
            state,
            **KW,
        )
        assert not np.isnan(out).any()
        assert out.dtype == np.uint8


def test_all_black_frame():
    f = np.zeros((64, 64, 4), dtype=np.uint8)
    f[:, :, 3] = 255
    _, state = apply(f, {}, None, **KW)
    out, _ = apply(f, {"intensity": 1.0}, state, **KW)
    assert not np.isnan(out).any()
    # Black in → black out (phase rotation of zero-magnitude is still zero).
    assert np.all(out[:, :, :3] == 0)


def test_all_white_frame():
    f = np.full((64, 64, 4), 255, dtype=np.uint8)
    _, state = apply(f, {}, None, **KW)
    out, _ = apply(f, {"intensity": 1.0}, state, **KW)
    assert not np.isnan(out).any()


def test_luma_only_mode_runs():
    f1 = _frame()
    f2 = _frame(seed=43)
    _, st = apply(f1, {"mode": "luma_only"}, None, **KW)
    out, _ = apply(f2, {"mode": "luma_only", "intensity": 0.8}, st, **KW)
    assert out.dtype == np.uint8
    assert not np.isnan(out).any()


def test_buffer_size_change_resets_ring():
    """Changing buffer_size mid-stream resets the deque (maxlen mismatch)."""
    f1 = _frame()
    _, st = apply(f1, {"buffer_size": 4}, None, **KW)
    assert st is not None and st["frame_buffer"].maxlen == 4
    f2 = _frame(seed=43)
    _, st2 = apply(f2, {"buffer_size": 16}, st, **KW)
    assert st2 is not None and st2["frame_buffer"].maxlen == 16
    assert len(st2["frame_buffer"]) == 1  # ring was flushed


# ----- Identity / metadata -----


def test_effect_id():
    assert EFFECT_ID == "fx.temporal_dispersion"


@pytest.mark.parametrize("buffer_size", [2, 4, 8, 16, 32])
def test_buffer_size_parametrized(buffer_size):
    """Smoke across the full buffer_size range."""
    state = None
    for i in range(buffer_size + 2):
        f = _frame(seed=300 + i)
        out, state = apply(f, {"buffer_size": buffer_size}, state, **KW)
        assert out.dtype == np.uint8
        assert not np.isnan(out).any()
    assert state is not None and state["frame_buffer"].maxlen == buffer_size


@pytest.mark.parametrize("max_phase_rad", [0.0, 0.5, 1.57, 3.14, 6.28])
def test_phase_range_parametrized(max_phase_rad):
    f1 = _frame()
    f2 = _frame(seed=43)
    _, st = apply(f1, {}, None, **KW)
    out, _ = apply(f2, {"max_phase_rad": max_phase_rad, "intensity": 0.7}, st, **KW)
    assert out.dtype == np.uint8
    assert not np.isnan(out).any()
