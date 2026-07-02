"""Tests for fx.attractor_kaleidoscope — Lorenz/Rossler/Thomas/Aizawa-driven kaleidoscope."""

import math

import numpy as np
import pytest

from effects.fx.attractor_kaleidoscope import EFFECT_ID, PARAMS, apply

pytestmark = pytest.mark.smoke


def _frame(h=64, w=64):
    rng = np.random.default_rng(42)
    return rng.integers(0, 256, (h, w, 4), dtype=np.uint8)


KW = {"frame_index": 0, "seed": 42, "resolution": (64, 64)}

ALL_SYSTEMS = ("lorenz", "rossler", "thomas", "aizawa")


# ----- Contract / shape -----


def test_basic_returns_frame_and_state():
    f = _frame()
    out, state = apply(f, {}, None, **KW)
    assert out.shape == f.shape
    assert out.dtype == np.uint8
    assert state is not None
    for k in ("system", "x", "y", "z"):
        assert k in state


def test_alpha_preserved():
    f = _frame()
    f[:, :, 3] = 200
    out, _ = apply(f, {}, None, **KW)
    np.testing.assert_array_equal(out[:, :, 3], 200)


def test_effect_id():
    assert EFFECT_ID == "fx.attractor_kaleidoscope"


def test_default_params_sane():
    for pname, pspec in PARAMS.items():
        d = pspec.get("default")
        if pspec["type"] in ("float", "int"):
            assert pspec["min"] <= d <= pspec["max"], pname
        elif pspec["type"] == "choice":
            assert d in pspec["options"], pname


# ----- All four attractor systems -----


@pytest.mark.parametrize("system", ALL_SYSTEMS)
def test_each_attractor_system_runs(system):
    """Every supported attractor must produce a finite, uint8 output."""
    f = _frame()
    out, state = apply(f, {"system": system}, None, **KW)
    assert out.shape == f.shape
    assert out.dtype == np.uint8
    assert not np.isnan(out).any()
    assert state is not None and state["system"] == system
    assert math.isfinite(state["x"])
    assert math.isfinite(state["y"])
    assert math.isfinite(state["z"])


@pytest.mark.parametrize("system", ALL_SYSTEMS)
def test_each_attractor_state_evolves(system):
    """Solver state must advance between calls when state_in is reused."""
    f = _frame()
    out1, st1 = apply(f, {"system": system, "steps_per_frame": 5}, None, **KW)
    out2, st2 = apply(f, {"system": system, "steps_per_frame": 5}, st1, **KW)
    # Solver must move
    assert (st1["x"], st1["y"], st1["z"]) != (st2["x"], st2["y"], st2["z"])


# ----- System change resets solver -----


def test_system_change_resets_state():
    f = _frame()
    _, st = apply(f, {"system": "lorenz"}, None, **KW)
    # Switch to Rossler — should restart from rossler init, not reuse Lorenz coords.
    out, st2 = apply(f, {"system": "rossler"}, st, **KW)
    assert st2["system"] == "rossler"
    assert math.isfinite(st2["x"])


def test_invalid_system_falls_back_to_lorenz():
    f = _frame()
    out, st = apply(f, {"system": "garbage"}, None, **KW)
    assert st is not None and st["system"] == "lorenz"
    assert not np.isnan(out).any()


# ----- Dimension change -----


def test_resolution_change_handled():
    f1 = _frame(h=64, w=64)
    _, st1 = apply(f1, {}, None, **KW)
    f2 = _frame(h=80, w=120)
    KW2 = {"frame_index": 1, "seed": 42, "resolution": (80, 120)}
    out, st2 = apply(f2, {}, st1, **KW2)
    assert out.shape == (80, 120, 4)
    assert out.dtype == np.uint8
    # Solver state is dimension-independent so it can be reused across resizes.
    assert st2 is not None


# ----- NaN / Inf / extremes -----


def test_nan_state_recovers():
    """Corrupt solver state with NaN — effect must reset rather than crash or propagate."""
    f = _frame()
    bad_state = {"system": "lorenz", "x": float("nan"), "y": 0.0, "z": 0.0}
    out, st = apply(f, {}, bad_state, **KW)
    assert not np.isnan(out).any()
    assert math.isfinite(st["x"])
    assert math.isfinite(st["y"])
    assert math.isfinite(st["z"])


def test_inf_state_recovers():
    f = _frame()
    bad_state = {"system": "rossler", "x": 0.0, "y": float("inf"), "z": 0.0}
    out, st = apply(f, {}, bad_state, **KW)
    assert not np.isnan(out).any()
    assert math.isfinite(st["x"])


def test_extreme_params_no_nan():
    """Max solver_speed + max steps_per_frame on every system — must remain finite."""
    f = _frame()
    extreme = {
        "solver_speed": 0.1,
        "steps_per_frame": 10,
        "center_drift_px": 500.0,
        "angle_drift_rad": 6.28,
        "intensity": 1.0,
        "symmetry_count": 32,
    }
    state = None
    for system in ALL_SYSTEMS:
        params = {**extreme, "system": system}
        for _ in range(8):
            out, state = apply(f, params, state, **KW)
            assert not np.isnan(out).any()
            assert state is not None
            assert math.isfinite(state["x"])
            assert math.isfinite(state["y"])
            assert math.isfinite(state["z"])


def test_param_clamping_at_trust_boundary():
    """Out-of-range numeric values must clamp (PLAY-005)."""
    f = _frame()
    bad = {
        "solver_speed": -5.0,  # below min, clamp to 0.001
        "steps_per_frame": 99999,  # above max
        "center_drift_px": -100.0,
        "angle_drift_rad": 999.0,
        "intensity": -1.0,
        "symmetry_count": 99999,
    }
    out, _ = apply(f, bad, None, **KW)
    assert out.dtype == np.uint8
    assert not np.isnan(out).any()


def test_non_finite_param_falls_back_to_default():
    f = _frame()
    bad = {
        "solver_speed": float("nan"),
        "center_drift_px": float("inf"),
        "angle_drift_rad": float("-inf"),
        "intensity": float("nan"),
    }
    out, _ = apply(f, bad, None, **KW)
    assert not np.isnan(out).any()


# ----- Determinism / seed -----


def test_deterministic_given_seed_and_inputs():
    f = _frame()
    out1, st1 = apply(f, {}, None, **KW)
    out2, st2 = apply(f, {}, None, **KW)
    np.testing.assert_array_equal(out1, out2)
    assert st1 == st2


def test_different_seeds_diverge():
    """Different seeds → different jitter → different orbits → different state."""
    f = _frame()
    kw_a = {"frame_index": 0, "seed": 1, "resolution": (64, 64)}
    kw_b = {"frame_index": 0, "seed": 2, "resolution": (64, 64)}
    _, st_a = apply(f, {}, None, **kw_a)
    _, st_b = apply(f, {}, None, **kw_b)
    assert (st_a["x"], st_a["y"], st_a["z"]) != (st_b["x"], st_b["y"], st_b["z"])


# ----- Visual / wet-dry -----


def test_intensity_zero_passthrough():
    """Intensity=0 → output identical to input RGB (no warp blended in)."""
    f = _frame()
    out, _ = apply(f, {"intensity": 0.0}, None, **KW)
    np.testing.assert_array_equal(out[:, :, :3], f[:, :, :3])


def test_intensity_one_visible_change():
    """Intensity=1 with non-zero drift on a noisy frame should change pixels."""
    # Use a frame that's *not* radially symmetric so kaleidoscope warp is visible
    f = _frame()
    out, _ = apply(
        f,
        {
            "intensity": 1.0,
            "center_drift_px": 50.0,
            "angle_drift_rad": 1.5,
            "symmetry_count": 6,
            "steps_per_frame": 5,
        },
        None,
        **KW,
    )
    diff = np.mean(np.abs(out[:, :, :3].astype(int) - f[:, :, :3].astype(int)))
    assert diff > 0.5


def test_all_black_frame():
    f = np.zeros((64, 64, 4), dtype=np.uint8)
    f[:, :, 3] = 255
    out, _ = apply(f, {}, None, **KW)
    assert not np.isnan(out).any()
    np.testing.assert_array_equal(out[:, :, :3], 0)


def test_all_white_frame():
    f = np.full((64, 64, 4), 255, dtype=np.uint8)
    out, _ = apply(f, {}, None, **KW)
    assert not np.isnan(out).any()
