"""Tests for fx.logistic_generation_loss — recursive JPEG generation-loss driven by the logistic map."""

import numpy as np
import pytest

from effects.fx.logistic_generation_loss import EFFECT_ID, PARAMS, apply

pytestmark = pytest.mark.smoke


def _frame(h=64, w=64):
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
    assert "x" in state


def test_alpha_preserved():
    """Alpha channel must round-trip through the effect."""
    f = _frame()
    f[:, :, 3] = 200
    out, _ = apply(f, {}, None, **KW)
    np.testing.assert_array_equal(out[:, :, 3], 200)


def test_effect_id_and_params_consistent():
    assert EFFECT_ID == "fx.logistic_generation_loss"
    # Every PARAM must have a default within its declared range / option set.
    for pname, pspec in PARAMS.items():
        d = pspec.get("default")
        if pspec["type"] in ("float", "int"):
            assert pspec["min"] <= d <= pspec["max"], pname
        elif pspec["type"] == "choice":
            assert d in pspec["options"], pname


# ----- Defaults / params / determinism -----


def test_default_params_visible_change():
    """Default params should produce some compression artifact vs the input."""
    f = _frame()
    params = {pname: spec.get("default") for pname, spec in PARAMS.items()}
    out, _ = apply(f, params, None, **KW)
    diff = np.mean(np.abs(out[:, :, :3].astype(float) - f[:, :, :3].astype(float)))
    assert diff > 0.5, f"expected visible degradation, got mean-abs-diff={diff}"


def test_determinism_same_inputs_same_outputs():
    """Pure function: same frame + params + state => identical output and state."""
    f = _frame()
    state0 = {"x": 0.5}
    o1, s1 = apply(f, {}, dict(state0), **KW)
    o2, s2 = apply(f, {}, dict(state0), **KW)
    np.testing.assert_array_equal(o1, o2)
    assert s1 == s2


def test_state_advances_each_call():
    """State.x should evolve across consecutive calls (logistic-map iteration)."""
    f = _frame()
    out1, s1 = apply(f, {}, None, **KW)
    _, s2 = apply(f, {}, s1, **KW)
    _, s3 = apply(f, {}, s2, **KW)
    # At default r=3.95 we are in chaotic regime — values must differ.
    assert s1["x"] != s2["x"]
    assert s2["x"] != s3["x"]


def test_state_x_stays_in_open_interval():
    """x must stay in (0,1) across many iterations even at r=4.0."""
    f = _frame()
    state = None
    for _ in range(50):
        _, state = apply(f, {"r": 4.0}, state, **KW)
        assert 0.0 < state["x"] < 1.0
        assert np.isfinite(state["x"])


# ----- Edge / boundary cases -----


def test_intensity_zero_is_identity():
    """intensity=0 => output equals input (state still advances)."""
    f = _frame()
    out, state = apply(f, {"intensity": 0.0}, None, **KW)
    np.testing.assert_array_equal(out, f)
    assert state is not None and "x" in state


def test_quality_mode_high_q_is_cleaner_than_low_q():
    """In quality mode, a high q range (95) must produce less degradation than low q (5).

    Validates that the codec parameters actually flow through into JPEG quality.
    """
    f = _frame()
    params_clean = {
        "mode": "quality",
        "max_passes": 4,
        "q_min": 95,
        "q_max": 95,
        "intensity": 1.0,
    }
    params_dirty = {
        "mode": "quality",
        "max_passes": 4,
        "q_min": 5,
        "q_max": 5,
        "intensity": 1.0,
    }
    out_clean, _ = apply(f, params_clean, None, **KW)
    out_dirty, _ = apply(f, params_dirty, None, **KW)
    diff_clean = np.mean(
        np.abs(out_clean[:, :, :3].astype(float) - f[:, :, :3].astype(float))
    )
    diff_dirty = np.mean(
        np.abs(out_dirty[:, :, :3].astype(float) - f[:, :, :3].astype(float))
    )
    assert diff_dirty > diff_clean


def test_invalid_mode_falls_back():
    """Unknown mode strings must fall back to 'passes' without crashing."""
    f = _frame()
    out, _ = apply(f, {"mode": "garbage"}, None, **KW)
    assert out.shape == f.shape
    assert out.dtype == np.uint8


def test_r_out_of_range_clamped():
    """r outside [1,4] must be clamped — no overflow, x stays bounded."""
    f = _frame()
    _, s_low = apply(f, {"r": -10.0}, None, **KW)
    _, s_high = apply(f, {"r": 99.0}, None, **KW)
    assert 0.0 < s_low["x"] < 1.0
    assert 0.0 < s_high["x"] < 1.0


def test_swapped_q_range_handled():
    """q_min > q_max must not crash and still produce uint8 output."""
    f = _frame()
    out, _ = apply(f, {"q_min": 90, "q_max": 10}, None, **KW)
    assert out.shape == f.shape
    assert out.dtype == np.uint8


def test_recovers_from_corrupt_state():
    """If state.x is NaN / out-of-range, we must reseed — not crash."""
    f = _frame()
    out, state = apply(f, {}, {"x": float("nan")}, **KW)
    assert out.shape == f.shape
    assert state is not None
    assert 0.0 < state["x"] < 1.0


def test_quality_mode_changes_output():
    """mode='quality' should still produce visible degradation at default settings."""
    f = _frame()
    params = {pname: spec.get("default") for pname, spec in PARAMS.items()}
    params["mode"] = "quality"
    out, _ = apply(f, params, None, **KW)
    diff = np.mean(np.abs(out[:, :, :3].astype(float) - f[:, :, :3].astype(float)))
    assert diff > 0.5


def test_seed_x_determines_initial_trajectory():
    """Different seed_x => different state.x after first iteration."""
    f = _frame()
    _, s_a = apply(f, {"seed_x": 0.1}, None, **KW)
    _, s_b = apply(f, {"seed_x": 0.9}, None, **KW)
    assert s_a["x"] != s_b["x"]
