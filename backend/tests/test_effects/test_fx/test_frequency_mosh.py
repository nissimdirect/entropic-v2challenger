"""Tests for fx.frequency_mosh — datamosh's flow accumulator in the FFT domain."""

import numpy as np
import pytest

from effects.fx.frequency_mosh import EFFECT_ID, PARAMS, apply

pytestmark = pytest.mark.smoke


def _frame(h=64, w=64, value=128):
    rng = np.random.default_rng(42)
    return rng.integers(0, 256, (h, w, 4), dtype=np.uint8)


KW = {"frame_index": 0, "seed": 42, "resolution": (64, 64)}


# ----- Contract / shape -----


def test_basic_returns_frame_and_state():
    f = _frame()
    out, state = apply(f, {}, None, **KW)
    assert out.shape == f.shape
    assert out.dtype == np.uint8
    assert state is not None
    assert "spec_buffer" in state
    assert "frame_shape" in state


def test_first_frame_passthrough():
    """First frame (no state_in) must pass through unchanged — only seeds buffer."""
    f = _frame()
    out, state = apply(f, {}, None, **KW)
    np.testing.assert_array_equal(out, f)
    assert state is not None and len(state["spec_buffer"]) == 1


def test_alpha_preserved():
    """Alpha channel must round-trip through the effect."""
    f = _frame()
    f[:, :, 3] = 200
    _, state = apply(f, {}, None, **KW)  # seed
    out, _ = apply(f, {}, state, **KW)
    np.testing.assert_array_equal(out[:, :, 3], 200)


def test_effect_id():
    assert EFFECT_ID == "fx.frequency_mosh"


# ----- Defaults / params -----


def test_default_params_sane():
    """Every PARAM must have a default within its declared range."""
    for pname, pspec in PARAMS.items():
        d = pspec.get("default")
        if pspec["type"] in ("float", "int"):
            assert pspec["min"] <= d <= pspec["max"], pname
        elif pspec["type"] == "choice":
            assert d in pspec["options"], pname


def test_strength_zero_with_no_band_is_near_identity():
    """strength=0 -> no warp -> output should match dry input (mix dependent)."""
    f1 = _frame()
    f2 = _frame()
    f2[:, :, :3] = (f2[:, :, :3].astype(int) + 30).clip(0, 255).astype(np.uint8)
    _, state = apply(f1, {}, None, **KW)
    out, _ = apply(f2, {"strength": 0.0, "mix": 1.0}, state, **KW)
    # strength=0 -> moshed spec == cur spec -> ifft round-trip ~ original luma.
    # _apply_luma reapplies the original chroma so RGB should match within FFT noise.
    diff = np.abs(out[:, :, :3].astype(int) - f2[:, :, :3].astype(int)).mean()
    assert diff < 4.0, f"strength=0 should be near-identity, got diff={diff}"


def test_mix_zero_is_dry_passthrough():
    """mix=0 -> 100% dry signal -> output equals input (post-buffer-fill)."""
    f1 = _frame()
    f2 = _frame()
    f2[:, :, 0] = (f2[:, :, 0].astype(int) + 50).clip(0, 255).astype(np.uint8)
    _, st = apply(f1, {}, None, **KW)
    out, _ = apply(f2, {"mix": 0.0, "strength": 5.0}, st, **KW)
    np.testing.assert_allclose(
        out[:, :, :3].astype(int), f2[:, :, :3].astype(int), atol=1
    )


# ----- Determinism -----


def test_deterministic_given_seed_and_inputs():
    f = _frame()
    out1, _ = apply(f, {}, None, **KW)
    out2, _ = apply(f, {}, None, **KW)
    np.testing.assert_array_equal(out1, out2)


def test_state_propagates_across_frames():
    """Without state, output is input. With state and motion, output differs."""
    f1 = _frame()
    f2 = _frame()
    # Simulate motion by shifting f2's content
    f2[:, :, :3] = np.roll(f2[:, :, :3], shift=4, axis=1)
    _, st1 = apply(f1, {}, None, **KW)
    out_with_state, _ = apply(f2, {"strength": 2.0, "mix": 1.0}, st1, **KW)
    out_no_state, _ = apply(f2, {"strength": 2.0, "mix": 1.0}, None, **KW)
    # No state -> identity (first frame). With state -> warped.
    assert not np.array_equal(out_with_state, out_no_state)


# ----- Resolution change (PLAY-005 + edge case) -----


def test_resolution_change_resets_buffer():
    f1 = _frame(h=64, w=64)
    _, st1 = apply(f1, {}, None, **KW)
    f2 = _frame(h=80, w=120)
    KW2 = {"frame_index": 1, "seed": 42, "resolution": (80, 120)}
    out, st2 = apply(f2, {}, st1, **KW2)
    assert out.shape == (80, 120, 4)
    assert st2 is not None
    # Buffer should have been flushed and refilled with the new-shape spec.
    assert st2["frame_shape"] == (80, 120)
    assert len(st2["spec_buffer"]) == 1  # flushed + appended new


# ----- Edge cases / robustness -----


def test_extreme_params_no_nan():
    """Maximal strength + accumulate + persistence should not produce NaN."""
    f = _frame()
    state = None
    extreme = {
        "strength": 10.0,
        "buffer_size": 16,
        "accumulate": "true",
        "persistence": 0.99,
        "mix": 1.0,
    }
    for _ in range(8):
        # Mutate frame slightly to drive flow
        f = (
            (f.astype(int) + np.random.default_rng(0).integers(-5, 5, f.shape))
            .clip(0, 255)
            .astype(np.uint8)
        )
        out, state = apply(f, extreme, state, **KW)
        assert not np.isnan(out).any()
        assert out.dtype == np.uint8


def test_param_clamping_at_trust_boundary():
    """Out-of-range values must clamp (PLAY-005)."""
    f = _frame()
    _, state = apply(f, {}, None, **KW)
    bad = {
        "strength": -5.0,  # below min, clamp to 0
        "buffer_size": 9999,  # above max
        "persistence": -1.0,  # below min
        "mix": 99.0,  # above max
        "band_focus": "garbage",  # invalid choice -> falls back
        "mode": "trash",  # invalid choice -> falls back
    }
    out, _ = apply(f, bad, state, **KW)
    assert out.dtype == np.uint8
    assert not np.isnan(out).any()
    assert out.shape == f.shape


def test_band_focus_choices_run_clean():
    """All band_focus modes must produce valid output."""
    f1 = _frame()
    f2 = _frame()
    f2[:, :, :3] = np.roll(f2[:, :, :3], shift=2, axis=0)
    for band in ["all", "low", "mid", "high"]:
        _, st = apply(f1, {"band_focus": band}, None, **KW)
        out, _ = apply(f2, {"band_focus": band, "strength": 2.0}, st, **KW)
        assert out.shape == f1.shape
        assert not np.isnan(out).any()


def test_rgb_mode_runs_clean():
    """RGB mode (per-channel) must complete without error."""
    f1 = _frame()
    f2 = _frame()
    f2[:, :, :3] = np.roll(f2[:, :, :3], shift=3, axis=1)
    _, st = apply(f1, {"mode": "rgb"}, None, **KW)
    out, _ = apply(f2, {"mode": "rgb", "strength": 1.5, "mix": 1.0}, st, **KW)
    assert out.shape == f1.shape
    assert out.dtype == np.uint8
    assert not np.isnan(out).any()


def test_all_black_frame():
    f = np.zeros((64, 64, 4), dtype=np.uint8)
    f[:, :, 3] = 255
    _, state = apply(f, {}, None, **KW)
    out, _ = apply(f, {"strength": 5.0, "mix": 1.0}, state, **KW)
    assert not np.isnan(out).any()
    # All-black should remain near black.
    assert out[:, :, :3].max() < 5


def test_all_white_frame():
    f = np.full((64, 64, 4), 255, dtype=np.uint8)
    _, state = apply(f, {}, None, **KW)
    out, _ = apply(f, {"strength": 5.0, "mix": 1.0}, state, **KW)
    assert not np.isnan(out).any()


def test_buffer_size_caps_history():
    """Buffer must not exceed declared buffer_size frames."""
    f = _frame()
    state = None
    bs = 3
    for _ in range(10):
        f = (f.astype(int) + 5).clip(0, 255).astype(np.uint8)
        _, state = apply(f, {"buffer_size": bs}, state, **KW)
    assert state is not None
    assert len(state["spec_buffer"]) <= bs


def test_off_on_off_trigger_transitions():
    """Mix=0 -> mix=1 -> mix=0 must produce clean transitions (no NaN, no leakage)."""
    f1 = _frame()
    f2 = _frame()
    f2[:, :, :3] = np.roll(f2[:, :, :3], shift=4, axis=1)
    f3 = _frame()
    f3[:, :, :3] = np.roll(f3[:, :, :3], shift=8, axis=1)
    # OFF (mix=0) seeds buffer, output = input
    _, s1 = apply(f1, {"mix": 0.0}, None, **KW)
    # ON (mix=1) -> warped
    out_on, s2 = apply(f2, {"mix": 1.0, "strength": 2.0}, s1, **KW)
    # OFF (mix=0) again -> dry passthrough of f3 (identical to input)
    out_off, _ = apply(f3, {"mix": 0.0, "strength": 2.0}, s2, **KW)
    np.testing.assert_allclose(
        out_off[:, :, :3].astype(int), f3[:, :, :3].astype(int), atol=1
    )
    assert not np.isnan(out_on).any()


def test_accumulator_persists_across_frames():
    """With accumulate=true, the accumulator must be carried in state."""
    f1 = _frame()
    f2 = _frame()
    f2[:, :, :3] = np.roll(f2[:, :, :3], shift=4, axis=1)
    _, s1 = apply(f1, {"accumulate": "true"}, None, **KW)
    _, s2 = apply(f2, {"accumulate": "true", "strength": 1.0}, s1, **KW)
    assert s2 is not None
    # On the second frame (buffer has 2), accumulator should be populated.
    assert s2.get("accumulator") is not None


def test_static_input_minimal_drift():
    """Static frames -> phase correlation should yield ~zero shift -> low drift."""
    f = _frame()
    _, st = apply(f, {}, None, **KW)
    out, _ = apply(f, {"strength": 1.0, "mix": 1.0}, st, **KW)
    # With zero motion, output should be very close to input (within FFT round-trip noise).
    diff = np.abs(out[:, :, :3].astype(int) - f[:, :, :3].astype(int)).mean()
    assert diff < 4.0, f"static input should drift minimally, got diff={diff}"
