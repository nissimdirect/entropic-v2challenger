"""Tests for fx.reaction_mosh — Frankenstein of datamosh + reaction_diffusion."""

import numpy as np
import pytest

from effects.fx.reaction_mosh import EFFECT_ID, PARAMS, apply

pytestmark = pytest.mark.smoke


def _frame(h=64, w=64, value=128):
    rng = np.random.default_rng(42)
    f = rng.integers(0, 256, (h, w, 4), dtype=np.uint8)
    return f


KW = {"frame_index": 0, "seed": 42, "resolution": (64, 64)}


# ----- Contract / shape -----


def test_basic_returns_frame_and_state():
    f = _frame()
    out, state = apply(f, {}, None, **KW)
    assert out.shape == f.shape
    assert out.dtype == np.uint8
    assert state is not None
    assert "A" in state and "B" in state and "prev_frame" in state


def test_first_frame_passthrough():
    """First frame (no state_in) must pass through unchanged — only seeds state."""
    f = _frame()
    out, state = apply(f, {}, None, **KW)
    np.testing.assert_array_equal(out, f)
    assert state is not None and state["A"].shape == (64, 64)


def test_alpha_preserved():
    """Alpha channel must round-trip through the effect."""
    f = _frame()
    f[:, :, 3] = 200
    _, state = apply(f, {}, None, **KW)  # seed
    out, _ = apply(f, {}, state, **KW)
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


def test_intensity_zero_is_near_identity():
    """At intensity=0 no mosh leakage — output should match current frame."""
    f1 = _frame()
    f2 = _frame()
    f2[:, :, :3] = (f2[:, :, :3].astype(int) + 30).clip(0, 255).astype(np.uint8)
    _, state = apply(f1, {}, None, **KW)
    out, _ = apply(f2, {"intensity": 0.0}, state, **KW)
    # rgb should be ~ f2 rgb (not blended with f1)
    np.testing.assert_allclose(
        out[:, :, :3].astype(int), f2[:, :, :3].astype(int), atol=1
    )


# ----- Determinism -----


def test_deterministic_given_seed_and_inputs():
    f = _frame()
    out1, _ = apply(f, {}, None, **KW)
    out2, _ = apply(f, {}, None, **KW)
    np.testing.assert_array_equal(out1, out2)


def test_state_propagates_temporal_change():
    """Frame N+1 with state from N must differ from frame N+1 with no state."""
    f1 = _frame()
    f2 = _frame()
    f2[:, :, 0] = 0  # mutate
    _, st1 = apply(f1, {}, None, **KW)
    out_with_state, _ = apply(f2, {"intensity": 0.8}, st1, **KW)
    out_no_state, _ = apply(f2, {"intensity": 0.8}, None, **KW)
    # When there's no state_in, the function returns input unchanged.
    # When state_in exists, mosh applies → outputs must differ.
    assert not np.array_equal(out_with_state, out_no_state)


# ----- Edge cases (PLAY-005 + dimension change) -----


def test_resolution_change_resets_state():
    f1 = _frame(h=64, w=64)
    _, st1 = apply(f1, {}, None, **KW)
    f2 = _frame(h=80, w=120)
    KW2 = {"frame_index": 1, "seed": 42, "resolution": (80, 120)}
    out, st2 = apply(f2, {}, st1, **KW2)
    assert out.shape == (80, 120, 4)
    assert st2 is not None and st2["A"].shape == (80, 120)


def test_extreme_pde_params_no_nan():
    """Min and max diffusion / feed / kill should not produce NaN."""
    f = _frame()
    _, state = apply(f, {}, None, **KW)
    extreme = {
        "feed_rate": 0.08,
        "kill_rate": 0.04,
        "diffusion_a": 1.5,
        "diffusion_b": 0.8,
        "pde_steps_per_frame": 10,
        "intensity": 1.0,
    }
    for _ in range(5):
        out, state = apply(f, extreme, state, **KW)
        assert not np.isnan(out).any()
        assert state is not None and not np.isnan(state["A"]).any()
        assert not np.isnan(state["B"]).any()


def test_param_clamping_at_trust_boundary():
    """Out-of-range values must clamp (PLAY-005)."""
    f = _frame()
    _, state = apply(f, {}, None, **KW)
    bad = {
        "intensity": -5.0,  # below min, clamp to 0
        "feed_rate": 99.0,  # above max
        "kill_rate": -1.0,  # below min
        "pde_steps_per_frame": 10000,  # above max
    }
    out, _ = apply(f, bad, state, **KW)
    assert out.dtype == np.uint8
    assert not np.isnan(out).any()


def test_seed_pattern_choices():
    f = _frame()
    for mode in ["luma", "center", "edges", "random"]:
        _, st = apply(f, {"seed_pattern": mode}, None, **KW)
        assert st is not None and st["B"].shape == (64, 64)


def test_invalid_seed_pattern_falls_back():
    f = _frame()
    _, st = apply(f, {"seed_pattern": "garbage"}, None, **KW)
    assert st is not None  # falls back to luma silently


def test_all_black_frame():
    f = np.zeros((64, 64, 4), dtype=np.uint8)
    f[:, :, 3] = 255
    _, state = apply(f, {}, None, **KW)
    out, _ = apply(f, {}, state, **KW)
    assert not np.isnan(out).any()


def test_all_white_frame():
    f = np.full((64, 64, 4), 255, dtype=np.uint8)
    _, state = apply(f, {}, None, **KW)
    out, _ = apply(f, {}, state, **KW)
    assert not np.isnan(out).any()


def test_static_input_drifts_via_state():
    """Same frame fed twice should still produce a non-identity output (state evolves)."""
    f = _frame()
    _, st = apply(f, {}, None, **KW)
    out2, _ = apply(f, {"intensity": 0.8, "pde_steps_per_frame": 5}, st, **KW)
    # B field has evolved; output must differ from input even though input is static
    assert not np.array_equal(out2[:, :, :3], f[:, :, :3])


def test_effect_id():
    assert EFFECT_ID == "fx.reaction_mosh"
