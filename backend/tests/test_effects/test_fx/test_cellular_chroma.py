"""Tests for fx.cellular_chroma — chromatic aberration driven by 3 CAs."""

import numpy as np
import pytest

from effects.fx.cellular_chroma import EFFECT_ID, PARAMS, apply

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
    assert "ca_r" in state and "ca_g" in state and "ca_b" in state


def test_effect_id():
    assert EFFECT_ID == "fx.cellular_chroma"


def test_alpha_preserved():
    """Alpha channel must round-trip through the effect untouched."""
    f = _frame()
    f[:, :, 3] = 200
    out, _ = apply(f, {}, None, **KW)
    np.testing.assert_array_equal(out[:, :, 3], 200)


def test_default_params_sane():
    """Every PARAM has a default within its declared range."""
    for pname, pspec in PARAMS.items():
        d = pspec.get("default")
        if pspec["type"] in ("float", "int"):
            assert pspec["min"] <= d <= pspec["max"], pname
        elif pspec["type"] == "choice":
            assert d in pspec["options"], pname


# ----- Determinism -----


def test_deterministic_given_seed_and_inputs():
    """Same frame + same seed + no state in => identical output."""
    f = _frame()
    out1, st1 = apply(f, {}, None, **KW)
    out2, st2 = apply(f, {}, None, **KW)
    np.testing.assert_array_equal(out1, out2)
    np.testing.assert_array_equal(st1["ca_r"], st2["ca_r"])
    np.testing.assert_array_equal(st1["ca_g"], st2["ca_g"])
    np.testing.assert_array_equal(st1["ca_b"], st2["ca_b"])


def test_different_seeds_give_different_grids():
    """seed shifts the CA initial state — outputs must differ."""
    f = _frame()
    _, st_a = apply(f, {}, None, frame_index=0, seed=1, resolution=(64, 64))
    _, st_b = apply(f, {}, None, frame_index=0, seed=999, resolution=(64, 64))
    assert not np.array_equal(st_a["ca_r"], st_b["ca_r"])


# ----- State / temporal evolution -----


def test_state_propagates_temporal_change():
    """A second call with state_in evolves the CA further than the first call."""
    f = _frame()
    out1, st1 = apply(f, {}, None, **KW)
    out2, st2 = apply(f, {}, st1, **KW)
    # CA should evolve at least one cell across one step under default rule.
    grids_changed = (
        not np.array_equal(st1["ca_r"], st2["ca_r"])
        or not np.array_equal(st1["ca_g"], st2["ca_g"])
        or not np.array_equal(st1["ca_b"], st2["ca_b"])
    )
    assert grids_changed
    # And the rendered output should differ too (CA evolved -> offset map evolved)
    assert not np.array_equal(out1, out2)


def test_resolution_change_resets_state():
    """Dimension change must reseed all three CAs."""
    f1 = _frame(h=64, w=64)
    _, st1 = apply(f1, {}, None, **KW)
    f2 = _frame(h=80, w=120)
    KW2 = {"frame_index": 1, "seed": 42, "resolution": (80, 120)}
    out, st2 = apply(f2, {}, st1, **KW2)
    assert out.shape == (80, 120, 4)
    # New CA grids should be at the new (downsampled) shape, not the old one.
    assert st2["ca_r"].shape != st1["ca_r"].shape


# ----- Param semantics -----


def test_zero_strength_is_identity_rgb():
    """All three strengths = 0 => no offset => RGB matches input exactly."""
    f = _frame()
    p = {"r_strength": 0.0, "g_strength": 0.0, "b_strength": 0.0}
    out, _ = apply(f, p, None, **KW)
    np.testing.assert_array_equal(out[:, :, :3], f[:, :, :3])


def test_mix_zero_is_identity_rgb():
    """mix=0 returns the original RGB regardless of CA state."""
    f = _frame()
    out, _ = apply(f, {"mix": 0.0}, None, **KW)
    np.testing.assert_array_equal(out[:, :, :3], f[:, :, :3])


def test_visible_change_with_state():
    """With state_in (so CA has seeded + stepped) and non-zero strength, RGB changes."""
    f = _frame()
    _, state = apply(f, {}, None, **KW)
    out, _ = apply(f, {}, state, **KW)
    diff = np.mean(np.abs(out[:, :, :3].astype(float) - f[:, :, :3].astype(float)))
    assert diff > 0.5


# ----- PLAY-005: trust-boundary clamping + edge cases -----


def test_param_clamping_at_trust_boundary():
    """Out-of-range numeric values must clamp; choice fields must fall back."""
    f = _frame()
    bad = {
        "r_strength": -100.0,
        "g_strength": 9999.0,
        "b_strength": float("nan"),  # finite-guard early-out
        "ca_scale": 99,
        "steps_per_frame": -5,
        "seed_density": 5.0,
        "reseed_interval": -1,
        "mix": 2.5,
        "r_rule": "garbage",
        "boundary": "not-a-mode",
    }
    out, _ = apply(f, bad, None, **KW)
    assert out.dtype == np.uint8
    assert out.shape == f.shape
    assert not np.isnan(out).any()


def test_extreme_strengths_no_nan():
    """Max strength on every channel for several frames produces no NaN."""
    f = _frame()
    extreme = {
        "r_strength": 40.0,
        "g_strength": 40.0,
        "b_strength": 40.0,
        "ca_scale": 1,
        "steps_per_frame": 6,
        "boundary": "wrap",
    }
    state = None
    for _ in range(5):
        out, state = apply(f, extreme, state, **KW)
        assert out.dtype == np.uint8
        assert not np.isnan(out).any()
        assert state is not None
    assert state is not None
    assert state["ca_r"].dtype.kind in ("i", "b", "u")


def test_all_rules_run():
    """Every Conway rule choice must produce a valid frame + state."""
    f = _frame()
    for rule in ("life", "highlife", "seeds", "daynight", "replicator"):
        out, st = apply(
            f,
            {"r_rule": rule, "g_rule": rule, "b_rule": rule},
            None,
            **KW,
        )
        assert out.dtype == np.uint8
        assert st is not None


def test_all_boundaries_run():
    """Every boundary mode must produce a valid frame."""
    f = _frame()
    for b in ("wrap", "clamp", "mirror"):
        out, _ = apply(f, {"boundary": b}, None, **KW)
        assert out.shape == f.shape


def test_reseed_interval_changes_grid():
    """When frame_index hits a reseed boundary, CA grids should be replaced."""
    f = _frame()
    # First, evolve normally for a few frames.
    state = None
    for fi in range(3):
        _, state = apply(
            f,
            {"reseed_interval": 0},
            state,
            frame_index=fi,
            seed=42,
            resolution=(64, 64),
        )
    pre = {k: v.copy() for k, v in state.items() if k.startswith("ca_")}
    # Now hit a reseed at frame_index=4 with reseed_interval=4.
    _, post_state = apply(
        f,
        {"reseed_interval": 4},
        state,
        frame_index=4,
        seed=42,
        resolution=(64, 64),
    )
    # At least one channel grid must differ from the pre-reseed state — reseed
    # uses (seed + frame_index) so it cannot equal the evolved grid.
    any_diff = (
        not np.array_equal(pre["ca_r"], post_state["ca_r"])
        or not np.array_equal(pre["ca_g"], post_state["ca_g"])
        or not np.array_equal(pre["ca_b"], post_state["ca_b"])
    )
    assert any_diff


def test_all_black_frame_is_finite():
    f = np.zeros((64, 64, 4), dtype=np.uint8)
    f[:, :, 3] = 255
    _, state = apply(f, {}, None, **KW)
    out, _ = apply(f, {}, state, **KW)
    assert not np.isnan(out).any()
    # An all-black input remains all-black after any chromatic shift (no data
    # to displace).
    assert (out[:, :, :3] == 0).all()


def test_all_white_frame_is_finite():
    f = np.full((64, 64, 4), 255, dtype=np.uint8)
    _, state = apply(f, {}, None, **KW)
    out, _ = apply(f, {}, state, **KW)
    assert not np.isnan(out).any()


def test_tiny_frame_does_not_crash():
    """8x8 frame with ca_scale=8 still has to produce a valid output (min grid 4x4)."""
    f = np.full((8, 8, 4), 127, dtype=np.uint8)
    out, st = apply(f, {"ca_scale": 8}, None, frame_index=0, seed=42, resolution=(8, 8))
    assert out.shape == f.shape
    assert st is not None and st["ca_r"].shape == (4, 4)
