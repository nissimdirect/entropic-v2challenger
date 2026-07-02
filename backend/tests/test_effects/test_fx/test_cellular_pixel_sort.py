"""Tests for fx.cellular_pixel_sort — pixelsort gated by Conway-style CA mask."""

import numpy as np
import pytest

from effects.fx.cellular_pixel_sort import EFFECT_ID, PARAMS, apply

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
    assert "ca_grid" in state
    assert "ca_age" in state


def test_first_frame_passthrough():
    """First frame (no state_in) must pass through unchanged — only seeds state."""
    f = _frame()
    out, state = apply(f, {}, None, **KW)
    np.testing.assert_array_equal(out, f)
    assert state is not None and state["ca_grid"].ndim == 2


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
        elif pspec["type"] == "bool":
            assert isinstance(d, bool), pname


def test_effect_id_and_metadata():
    assert EFFECT_ID == "fx.cellular_pixel_sort"
    # Required PARAMS per PRD
    for pname in (
        "direction",
        "sort_key",
        "ca_rule",
        "ca_steps_per_frame",
        "ca_scale",
        "seed_density",
        "reseed_interval",
        "mix",
    ):
        assert pname in PARAMS, f"missing param {pname}"


# ----- Determinism -----


def test_deterministic_given_seed_and_inputs():
    f = _frame()
    out1, st1 = apply(f, {}, None, **KW)
    out2, st2 = apply(f, {}, None, **KW)
    np.testing.assert_array_equal(out1, out2)
    np.testing.assert_array_equal(st1["ca_grid"], st2["ca_grid"])


def test_state_propagates_temporal_change():
    """Frame N+1 with state from N must produce a non-identity output."""
    f = _frame()
    _, st1 = apply(f, {}, None, **KW)
    out, st2 = apply(f, {"mix": 1.0, "ca_steps_per_frame": 2}, st1, **KW)
    # With state, sort should fire and produce a different RGB image (mask isn't all-dead)
    assert not np.array_equal(out[:, :, :3], f[:, :, :3])
    assert st2 is not None and "ca_grid" in st2


# ----- Edge cases (PLAY-005 + dimension change) -----


def test_resolution_change_resets_state():
    f1 = _frame(h=64, w=64)
    _, st1 = apply(f1, {}, None, **KW)
    f2 = _frame(h=80, w=120)
    KW2 = {"frame_index": 1, "seed": 42, "resolution": (120, 80)}
    out, st2 = apply(f2, {}, st1, **KW2)
    assert out.shape == (80, 120, 4)
    assert st2 is not None and st2["ca_grid"].ndim == 2


def test_param_clamping_at_trust_boundary():
    """Out-of-range values must clamp without crash (PLAY-005)."""
    f = _frame()
    _, state = apply(f, {}, None, **KW)
    bad = {
        "ca_steps_per_frame": -5,  # below min, clamp to 1
        "ca_scale": 9999,  # above max
        "seed_density": -1.0,  # below min
        "reseed_interval": 999999,  # above max
        "mix": 99.0,  # above max
    }
    out, _ = apply(f, bad, state, **KW)
    assert out.dtype == np.uint8
    assert out.shape == f.shape
    assert not np.isnan(out).any()


def test_invalid_choice_falls_back():
    f = _frame()
    _, state = apply(f, {}, None, **KW)
    out, _ = apply(
        f,
        {"direction": "garbage", "sort_key": "garbage", "ca_rule": "garbage"},
        state,
        **KW,
    )
    assert out.shape == f.shape
    assert out.dtype == np.uint8


def test_all_ca_rules_run():
    f = _frame()
    for rule in ["life", "highlife", "seeds", "daynight", "replicator"]:
        _, st = apply(f, {"ca_rule": rule}, None, **KW)
        out, _ = apply(f, {"ca_rule": rule}, st, **KW)
        assert out.shape == f.shape
        assert out.dtype == np.uint8


def test_all_sort_keys_run():
    f = _frame()
    _, st = apply(f, {}, None, **KW)
    for key in ["luminance", "hue", "saturation", "red", "green", "blue"]:
        out, _ = apply(f, {"sort_key": key}, st, **KW)
        assert out.shape == f.shape
        assert out.dtype == np.uint8


def test_vertical_direction():
    f = _frame()
    _, st = apply(f, {"direction": "vertical"}, None, **KW)
    out, _ = apply(f, {"direction": "vertical", "mix": 1.0}, st, **KW)
    assert out.shape == f.shape
    assert out.dtype == np.uint8
    # Vertical sort should change the frame
    assert not np.array_equal(out[:, :, :3], f[:, :, :3])


def test_mix_zero_is_identity_rgb():
    """mix=0 → output rgb equals input rgb regardless of mask."""
    f = _frame()
    _, st = apply(f, {}, None, **KW)
    out, _ = apply(f, {"mix": 0.0}, st, **KW)
    np.testing.assert_allclose(
        out[:, :, :3].astype(int), f[:, :, :3].astype(int), atol=1
    )


def test_reverse_differs_from_forward():
    f = _frame()
    _, st = apply(f, {}, None, **KW)
    fwd, _ = apply(f, {"reverse": False, "mix": 1.0}, st, **KW)
    rev, _ = apply(f, {"reverse": True, "mix": 1.0}, st, **KW)
    assert not np.array_equal(fwd, rev)


def test_dead_colony_auto_reseeds():
    """All-dead grid must auto-reseed so effect doesn't go silent."""
    f = _frame()
    # Construct state with explicit all-dead grid
    h_ds = max(2, 64 // 4)
    dead_grid = np.zeros((h_ds, h_ds), dtype=np.int32)
    state = {"ca_grid": dead_grid, "ca_age": 0}
    out, st_out = apply(f, {"ca_rule": "life", "mix": 1.0}, state, **KW)
    # Post-step, auto-reseed kicks in → grid must have at least one live cell
    assert st_out is not None and st_out["ca_grid"].any()
    assert out.dtype == np.uint8


def test_reseed_interval_resets_age():
    """When reseed_interval triggers, ca_age resets to 0 (then increments to 1)."""
    f = _frame()
    state = {
        "ca_grid": np.ones((16, 16), dtype=np.int32),
        "ca_age": 5,
    }
    _, st_out = apply(f, {"reseed_interval": 3, "ca_scale": 4}, state, **KW)
    # Age was 5, interval was 3 → should reseed → reset to 0, then post-step +1
    assert st_out is not None and st_out["ca_age"] == 1


def test_extreme_params_no_nan():
    """Min and max ca_steps / ca_scale should not produce NaN."""
    f = _frame()
    _, state = apply(f, {}, None, **KW)
    extreme = {
        "ca_steps_per_frame": 8,
        "ca_scale": 8,
        "seed_density": 1.0,
        "reseed_interval": 1,
        "mix": 1.0,
    }
    for _ in range(5):
        out, state = apply(f, extreme, state, **KW)
        assert not np.isnan(out).any()
        assert state is not None


def test_all_black_frame():
    f = np.zeros((64, 64, 4), dtype=np.uint8)
    f[:, :, 3] = 255
    _, state = apply(f, {}, None, **KW)
    out, _ = apply(f, {}, state, **KW)
    assert not np.isnan(out).any()
    assert out.shape == f.shape


def test_all_white_frame():
    f = np.full((64, 64, 4), 255, dtype=np.uint8)
    _, state = apply(f, {}, None, **KW)
    out, _ = apply(f, {}, state, **KW)
    assert not np.isnan(out).any()
    assert out.shape == f.shape


def test_tiny_frame_handles_min_ca_size():
    """2x2 frame should still work — CA grid must clamp to >=2x2."""
    f = np.full((2, 2, 4), 128, dtype=np.uint8)
    f[:, :, 3] = 255
    KW_tiny = {"frame_index": 0, "seed": 42, "resolution": (2, 2)}
    _, state = apply(f, {"ca_scale": 8}, None, **KW_tiny)
    out, _ = apply(f, {"ca_scale": 8}, state, **KW_tiny)
    assert out.shape == (2, 2, 4)
    assert out.dtype == np.uint8
