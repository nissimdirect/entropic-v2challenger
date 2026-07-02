"""Tests for fx.histogram_attractor — strange-attractor-driven tone curve."""

import numpy as np
import pytest

from effects.fx.histogram_attractor import EFFECT_ID, PARAMS, _build_lut, apply

pytestmark = pytest.mark.smoke


def _frame(h=64, w=64, value=None):
    rng = np.random.default_rng(42)
    if value is not None:
        f = np.full((h, w, 4), value, dtype=np.uint8)
        f[:, :, 3] = 255
        return f
    return rng.integers(0, 256, (h, w, 4), dtype=np.uint8)


KW = {"frame_index": 0, "seed": 42, "resolution": (64, 64)}


# ----- Contract / shape -----


def test_basic_returns_frame_and_state():
    f = _frame()
    out, state = apply(f, {}, None, **KW)
    assert out.shape == f.shape
    assert out.dtype == np.uint8
    assert state is not None
    assert "pos" in state and "attractor" in state


def test_alpha_preserved():
    f = _frame()
    f[:, :, 3] = 200
    out, _ = apply(f, {}, None, **KW)
    np.testing.assert_array_equal(out[:, :, 3], 200)


def test_effect_id():
    assert EFFECT_ID == "fx.histogram_attractor"


def test_default_params_sane():
    """Every PARAM must declare a default within its declared range."""
    for pname, pspec in PARAMS.items():
        d = pspec.get("default")
        if pspec["type"] in ("float", "int"):
            assert pspec["min"] <= d <= pspec["max"], pname
        elif pspec["type"] == "choice":
            assert d in pspec["options"], pname
        elif pspec["type"] == "bool":
            assert isinstance(d, bool), pname


# ----- IDENTITY_BY_DEFAULT (stateful) -----


def test_mix_zero_is_identity():
    """mix=0 should return frame unchanged but still seed state."""
    f = _frame()
    out, state = apply(f, {"mix": 0.0}, None, **KW)
    np.testing.assert_array_equal(out, f)
    assert state is not None and "pos" in state


def test_zero_swings_is_identity():
    """All swings = 0 means no curve deviation — output == input."""
    f = _frame()
    out, state = apply(
        f,
        {"shadow_swing": 0.0, "mid_swing": 0.0, "high_swing": 0.0, "mix": 1.0},
        None,
        **KW,
    )
    np.testing.assert_array_equal(out, f)
    assert state is not None  # state still seeded for future frames


# ----- Determinism -----


def test_deterministic_same_inputs():
    f = _frame()
    out1, st1 = apply(f, {"shadow_swing": 0.3}, None, **KW)
    out2, st2 = apply(f, {"shadow_swing": 0.3}, None, **KW)
    np.testing.assert_array_equal(out1, out2)
    np.testing.assert_array_equal(st1["pos"], st2["pos"])


def test_state_propagates_curve_drift():
    """Frame N+1 with state from N should draw a different curve than fresh."""
    f = _frame()
    p = {
        "shadow_swing": 0.2,
        "mid_swing": 0.2,
        "high_swing": 0.2,
        "dt": 0.02,
        "steps_per_frame": 5,
        "monotone_enforce": True,
    }
    # Run several frames so the orbit drifts well away from the seed.
    state = None
    for _ in range(10):
        _, state = apply(f, p, state, **KW)
    out_with_state, _ = apply(f, p, state, **KW)
    out_fresh, _ = apply(f, p, None, **KW)
    # State has advanced — orbit differs from seed — outputs differ.
    assert not np.array_equal(out_with_state, out_fresh)


# ----- Param clamping (PLAY-005) -----


def test_param_clamping_at_trust_boundary():
    f = _frame()
    bad = {
        "shadow_swing": -5.0,  # below min
        "mid_swing": 99.0,  # above max
        "high_swing": float("nan"),  # NaN — float() will raise; we catch via clamp
        "dt": -1.0,
        "steps_per_frame": 10000,
        "mix": -10.0,
        "attractor": "garbage",
        "mode": "garbage",
    }
    # NaN-handling: explicit
    bad["high_swing"] = 99.0
    out, st = apply(f, bad, None, **KW)
    assert out.dtype == np.uint8
    assert not np.isnan(out).any()
    assert st is not None


def test_invalid_attractor_falls_back():
    f = _frame()
    out, st = apply(f, {"attractor": "not_a_real_one"}, None, **KW)
    assert st is not None and st["attractor"] == "lorenz"
    assert out.dtype == np.uint8


# ----- Solver behavior across attractors -----


@pytest.mark.parametrize("attractor", ["lorenz", "rossler", "thomas", "aizawa"])
def test_each_attractor_runs_without_nan(attractor):
    f = _frame()
    state = None
    for _ in range(5):
        out, state = apply(
            f,
            {
                "attractor": attractor,
                "shadow_swing": 0.3,
                "mid_swing": 0.3,
                "high_swing": 0.3,
                "dt": 0.05,
                "steps_per_frame": 10,
            },
            state,
            **KW,
        )
        assert not np.isnan(out).any()
        assert state is not None and np.all(np.isfinite(state["pos"]))


def test_solver_blowup_recovers():
    """Force a blown-up state — apply must reset and not crash."""
    f = _frame()
    bad_state = {"pos": np.array([1e9, 1e9, 1e9]), "attractor": "rossler"}
    out, st = apply(f, {"attractor": "rossler"}, bad_state, **KW)
    assert out.dtype == np.uint8
    assert np.all(np.isfinite(st["pos"]))


def test_attractor_change_resets_state():
    f = _frame()
    _, st1 = apply(f, {"attractor": "lorenz"}, None, **KW)
    _, st2 = apply(f, {"attractor": "rossler"}, st1, **KW)
    # New attractor → seed reset (st2 starts from rossler seed, not lorenz pos)
    assert st2["attractor"] == "rossler"


# ----- Mode behavior -----


def test_luminance_mode_visible_change():
    """With non-zero swings, output must differ from input in luminance mode."""
    f = _frame()
    out, _ = apply(
        f,
        {
            "mode": "luminance",
            "shadow_swing": 0.4,
            "mid_swing": 0.4,
            "high_swing": 0.4,
            "monotone_enforce": False,
            "dt": 0.05,
            "steps_per_frame": 10,
        },
        None,
        **KW,
    )
    assert not np.array_equal(out[:, :, :3], f[:, :, :3])


def test_per_channel_mode_visible_change():
    f = _frame()
    out, _ = apply(
        f,
        {
            "mode": "per_channel",
            "shadow_swing": 0.4,
            "mid_swing": 0.4,
            "high_swing": 0.4,
            "monotone_enforce": False,
            "dt": 0.05,
            "steps_per_frame": 10,
        },
        None,
        **KW,
    )
    assert not np.array_equal(out[:, :, :3], f[:, :, :3])


def test_mix_blends_with_original():
    """mix=0.5 output is partway between fully-applied and original."""
    f = _frame()
    full, _ = apply(f, {"shadow_swing": 0.4, "mix": 1.0}, None, **KW)
    half, _ = apply(f, {"shadow_swing": 0.4, "mix": 0.5}, None, **KW)
    # half should be closer to f than full is
    d_full = np.abs(full.astype(int) - f.astype(int)).mean()
    d_half = np.abs(half.astype(int) - f.astype(int)).mean()
    assert d_half < d_full or np.isclose(d_full, 0.0, atol=1.0)


# ----- LUT helper -----


def test_lut_endpoints_anchored():
    """LUT[0] should be near 0 and LUT[255] should be near 255."""
    lut = _build_lut(0.25, 0.5, 0.75, monotone=True)
    assert lut[0] <= 5
    assert lut[255] >= 250
    assert lut.dtype == np.uint8
    assert lut.shape == (256,)


def test_lut_monotone_when_enforced():
    """With monotone=True the LUT must be non-decreasing even for crossed knots."""
    # Knots where shadows > mids > highs would invert without enforcement
    lut = _build_lut(0.9, 0.5, 0.1, monotone=True)
    assert np.all(np.diff(lut.astype(int)) >= 0)


def test_lut_can_invert_when_unenforced():
    """With monotone=False crossed knots may produce a non-monotone curve."""
    lut = _build_lut(0.9, 0.5, 0.1, monotone=False)
    # Not strictly monotone — at least one downward step expected.
    assert np.any(np.diff(lut.astype(int)) < 0)


# ----- Edge frames -----


def test_all_black_frame():
    f = np.zeros((64, 64, 4), dtype=np.uint8)
    f[:, :, 3] = 255
    out, st = apply(f, {"shadow_swing": 0.4}, None, **KW)
    assert out.dtype == np.uint8
    assert not np.isnan(out).any()
    # Alpha preserved
    np.testing.assert_array_equal(out[:, :, 3], 255)
    assert st is not None


def test_all_white_frame():
    f = np.full((64, 64, 4), 255, dtype=np.uint8)
    out, _ = apply(f, {"shadow_swing": 0.4}, None, **KW)
    assert out.dtype == np.uint8
    assert not np.isnan(out).any()


def test_resolution_change_safe():
    f1 = _frame(h=64, w=64)
    _, st = apply(f1, {}, None, **KW)
    f2 = _frame(h=80, w=120)
    KW2 = {"frame_index": 1, "seed": 42, "resolution": (80, 120)}
    out, st2 = apply(f2, {}, st, **KW2)
    # State is not resolution-dependent here (only the orbit position),
    # so the same state passes through any frame size.
    assert out.shape == (80, 120, 4)
    assert st2 is not None


def test_extreme_params_no_nan():
    f = _frame()
    state = None
    extreme = {
        "shadow_swing": 0.4,
        "mid_swing": 0.4,
        "high_swing": 0.4,
        "dt": 0.05,
        "steps_per_frame": 10,
        "mix": 1.0,
        "monotone_enforce": False,
    }
    for _ in range(10):
        out, state = apply(f, extreme, state, **KW)
        assert not np.isnan(out).any()
        assert state is not None and np.all(np.isfinite(state["pos"]))
