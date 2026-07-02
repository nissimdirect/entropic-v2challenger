"""Tests for fx.edge_pixel_wind — Sobel-tangent flow as displacement field."""

import numpy as np
import pytest

from effects.fx.edge_pixel_wind import EFFECT_ID, PARAMS, apply

pytestmark = pytest.mark.smoke


def _frame(h=64, w=64, seed=42):
    """Random RGBA frame with alpha=255 — has edges everywhere for flow."""
    rng = np.random.default_rng(seed)
    f = rng.integers(0, 256, (h, w, 4), dtype=np.uint8)
    f[:, :, 3] = 255
    return f


def _edge_frame(h=64, w=64):
    """Frame with a hard vertical edge (left=black, right=white).

    Sobel gx is large here, gy≈0, so gradient points horizontally and the
    tangent flow (-gy, gx) is vertical — pixels move across the edge band.
    """
    f = np.zeros((h, w, 4), dtype=np.uint8)
    f[:, : w // 2, :3] = 0
    f[:, w // 2 :, :3] = 255
    f[:, :, 3] = 255
    return f


KW = {"frame_index": 0, "seed": 42, "resolution": (64, 64)}


# ----- Contract / shape -----


def test_basic_returns_frame_and_no_state_in_pure_mode():
    """Default mode (accumulate=False) is a pure function — state_out is None."""
    f = _frame()
    out, state = apply(f, {}, None, **KW)
    assert out.shape == f.shape
    assert out.dtype == np.uint8
    assert state is None  # pure function in default mode


def test_alpha_preserved():
    """Alpha channel must round-trip unchanged."""
    f = _frame()
    f[:, :, 3] = 200
    out, _ = apply(f, {}, None, **KW)
    np.testing.assert_array_equal(out[:, :, 3], 200)


def test_effect_id():
    assert EFFECT_ID == "fx.edge_pixel_wind"


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


def test_strength_zero_is_identity():
    """strength_px=0 must short-circuit to exact passthrough."""
    f = _frame()
    out, _ = apply(f, {"strength_px": 0.0}, None, **KW)
    np.testing.assert_array_equal(out, f)


def test_intensity_zero_is_passthrough():
    """intensity=0 (full dry) means RGB == input RGB."""
    f = _frame()
    out, _ = apply(f, {"intensity": 0.0, "strength_px": 20.0}, None, **KW)
    np.testing.assert_array_equal(out[:, :, :3], f[:, :, :3])


def test_default_produces_visible_change():
    """With non-zero default strength, output must visibly differ from input."""
    f = _frame()
    out, _ = apply(f, {}, None, **KW)
    diff = np.mean(np.abs(out[:, :, :3].astype(int) - f[:, :, :3].astype(int)))
    assert diff > 0.5, f"expected visible change with defaults, got mean diff={diff}"


# ----- Determinism -----


def test_deterministic_given_same_inputs():
    """Same input + same params must produce identical output."""
    f = _frame()
    out1, _ = apply(f, {}, None, **KW)
    out2, _ = apply(f, {}, None, **KW)
    np.testing.assert_array_equal(out1, out2)


# ----- Edge / boundary cases -----


def test_param_clamping_at_trust_boundary():
    """Out-of-range values must clamp (PLAY-005)."""
    f = _frame()
    bad = {
        "strength_px": 9999.0,
        "smoothing_sigma": -10.0,
        "edge_threshold": 99.0,
        "persistence": -1.0,
        "intensity": 5.0,
    }
    out, _ = apply(f, bad, None, **KW)
    assert out.dtype == np.uint8
    assert not np.isnan(out).any()


def test_invalid_boundary_mode_falls_back():
    """Bogus boundary string must default to clamp without raising."""
    f = _frame()
    out, _ = apply(f, {"boundary_mode": "garbage"}, None, **KW)
    assert out.shape == f.shape
    assert out.dtype == np.uint8


def test_all_black_frame_no_nan():
    """Flat frame → magnitude≈0 → no flow, no NaN."""
    f = np.zeros((64, 64, 4), dtype=np.uint8)
    f[:, :, 3] = 255
    out, _ = apply(f, {}, None, **KW)
    assert not np.isnan(out).any()
    np.testing.assert_array_equal(out[:, :, 3], 255)


def test_all_white_frame_no_nan():
    """Saturated flat frame → magnitude≈0 → no flow, no NaN."""
    f = np.full((64, 64, 4), 255, dtype=np.uint8)
    out, _ = apply(f, {}, None, **KW)
    assert not np.isnan(out).any()


@pytest.mark.parametrize("boundary_mode", ["clamp", "wrap", "mirror", "black"])
def test_all_boundary_modes(boundary_mode):
    """Every boundary mode must run without error and preserve shape."""
    f = _edge_frame()
    out, _ = apply(f, {"strength_px": 30.0, "boundary_mode": boundary_mode}, None, **KW)
    assert out.shape == f.shape
    assert out.dtype == np.uint8
    assert not np.isnan(out).any()


# ----- Accumulator mode -----


def test_accumulator_state_initializes():
    """First call with accumulate=True must seed state buffers."""
    f = _frame()
    out, state = apply(f, {"accumulate": True}, None, **KW)
    assert state is not None
    assert "acc_dx" in state and "acc_dy" in state
    assert state["acc_dx"].shape == (64, 64)
    assert state["acc_dy"].shape == (64, 64)
    assert state["acc_dx"].dtype == np.float32


def test_accumulator_persists_drift_over_frames():
    """Persistent advection: |acc| must grow when persistence > 0."""
    f = _frame()
    params = {
        "accumulate": True,
        "persistence": 0.9,
        "strength_px": 20.0,
        "smoothing_sigma": 0.0,
    }
    _, st1 = apply(f, params, None, **KW)
    _, st2 = apply(f, params, st1, **KW)
    _, st3 = apply(f, params, st2, **KW)
    # Accumulator magnitude must grow over time
    m1 = float(np.mean(np.abs(st1["acc_dx"])))
    m3 = float(np.mean(np.abs(st3["acc_dx"])))
    assert m3 > m1, f"accumulator did not grow: m1={m1}, m3={m3}"


def test_accumulator_resets_on_resolution_change():
    """Dim change must drop and re-init accumulator buffers."""
    f1 = _frame(h=64, w=64)
    _, st1 = apply(f1, {"accumulate": True}, None, **KW)
    f2 = _frame(h=80, w=120)
    KW2 = {"frame_index": 1, "seed": 42, "resolution": (80, 120)}
    out, st2 = apply(f2, {"accumulate": True}, st1, **KW2)
    assert out.shape == (80, 120, 4)
    assert st2 is not None and st2["acc_dx"].shape == (80, 120)


def test_accumulator_clamped_to_safe_range():
    """Long sequences in accumulate mode must not run away to infinity."""
    f = _frame()
    params = {
        "accumulate": True,
        "persistence": 0.99,
        "strength_px": 50.0,
        "smoothing_sigma": 0.0,
    }
    state = None
    for _ in range(200):
        _, state = apply(f, params, state, **KW)
    assert state is not None
    assert np.all(np.isfinite(state["acc_dx"]))
    # Hard cap is 100 px in the implementation
    assert float(np.max(np.abs(state["acc_dx"]))) <= 100.0 + 1e-3
    assert float(np.max(np.abs(state["acc_dy"]))) <= 100.0 + 1e-3


def test_accumulator_off_drops_state():
    """Toggling accumulate=False mid-clip must drop accumulator buffers."""
    f = _frame()
    _, st = apply(f, {"accumulate": True}, None, **KW)
    assert st is not None
    out, st2 = apply(f, {"accumulate": False}, st, **KW)
    assert out.shape == f.shape
    assert st2 is None  # state cleared


# ----- Visual sanity on hard edge -----


def test_strength_increases_displacement():
    """Higher strength_px must produce more visible deformation than lower."""
    f = _frame()
    out_low, _ = apply(f, {"strength_px": 1.0}, None, **KW)
    out_high, _ = apply(f, {"strength_px": 40.0}, None, **KW)
    diff_low = float(
        np.mean(np.abs(out_low[:, :, :3].astype(int) - f[:, :, :3].astype(int)))
    )
    diff_high = float(
        np.mean(np.abs(out_high[:, :, :3].astype(int) - f[:, :, :3].astype(int)))
    )
    assert diff_high > diff_low, (
        f"high strength ({diff_high}) should deform more than low ({diff_low})"
    )
