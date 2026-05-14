"""Tests for fx.resonant_paulstretch — frozen 2D-FFT magnitude swept by a radial biquad."""

import numpy as np
import pytest

from effects.fx.resonant_paulstretch import EFFECT_ID, PARAMS, apply

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


def test_alpha_preserved():
    """Alpha channel must round-trip — effect only touches luma + RGB."""
    f = _frame()
    f[:, :, 3] = 200
    out, _ = apply(f, {}, None, **KW)
    np.testing.assert_array_equal(out[:, :, 3], 200)


def test_effect_id():
    assert EFFECT_ID == "fx.resonant_paulstretch"


# ----- Defaults / params -----


def test_default_params_sane():
    """Every PARAM must have a default within its declared range."""
    for pname, pspec in PARAMS.items():
        d = pspec.get("default")
        if pspec["type"] in ("float", "int"):
            assert pspec["min"] <= d <= pspec["max"], pname
        elif pspec["type"] == "choice":
            assert d in pspec["options"], pname


def test_freeze_off_passthrough_and_state_cleared():
    """freeze_now=false → output equals input AND any frozen state is cleared."""
    f = _frame()
    # First seed some state
    _, st = apply(f, {"freeze_now": "true", "phase_jitter": 0.0}, None, **KW)
    assert "frozen_mag" in st
    # Toggle freeze off — must clear and pass through.
    out, st2 = apply(f, {"freeze_now": "false"}, st, **KW)
    np.testing.assert_array_equal(out, f)
    assert "frozen_mag" not in st2


def test_mix_zero_is_passthrough():
    """mix=0 → output equals input regardless of filter settings."""
    f = _frame()
    out, _ = apply(
        f,
        {
            "freeze_now": "true",
            "mix": 0.0,
            "phase_jitter": 0.0,
            "resonance_q": 30.0,
            "filter_mode": "peak",
        },
        None,
        **KW,
    )
    np.testing.assert_allclose(
        out[:, :, :3].astype(int), f[:, :, :3].astype(int), atol=1
    )


# ----- Determinism (PLAY-005, RNG keyed on seed^frame_index) -----


def test_deterministic_given_seed_and_inputs():
    f = _frame()
    out1, _ = apply(f, {}, None, **KW)
    out2, _ = apply(f, {}, None, **KW)
    np.testing.assert_array_equal(out1, out2)


def test_phase_jitter_zero_is_static_after_freeze():
    """phase_jitter=0 → frozen state, repeated calls produce identical output."""
    f = _frame()
    params = {
        "freeze_now": "true",
        "phase_jitter": 0.0,
        "feedback_resonance": 0.0,
        "sweep_lfo_rate": 0.0,
    }
    out1, st = apply(f, params, None, **KW)
    out2, _ = apply(f, params, st, **KW)
    np.testing.assert_array_equal(out1, out2)


def test_phase_jitter_nonzero_evolves_per_frame():
    """phase_jitter>0 with frame_index advance → output drifts even on identical input."""
    f = _frame()
    params = {"freeze_now": "true", "phase_jitter": 0.5}
    _, st = apply(f, params, None, frame_index=0, seed=42, resolution=(64, 64))
    out_a, _ = apply(f, params, st, frame_index=1, seed=42, resolution=(64, 64))
    out_b, _ = apply(f, params, st, frame_index=2, seed=42, resolution=(64, 64))
    assert not np.array_equal(out_a, out_b)


# ----- Filter modes (5 of them) -----


@pytest.mark.parametrize("mode", ["lowpass", "bandpass", "highpass", "notch", "peak"])
def test_each_filter_mode_runs_clean(mode):
    """All 5 modes must produce finite uint8 output."""
    f = _frame()
    out, _ = apply(
        f,
        {
            "freeze_now": "true",
            "filter_mode": mode,
            "phase_jitter": 0.0,
            "resonance_q": 5.0,
        },
        None,
        **KW,
    )
    assert out.dtype == np.uint8
    assert not np.isnan(out).any()


def test_invalid_filter_mode_falls_back():
    """Bad filter_mode value must not raise (PLAY-001 trust boundary)."""
    f = _frame()
    out, _ = apply(f, {"filter_mode": "garbage"}, None, **KW)
    assert out.dtype == np.uint8


# ----- Refresh / freeze cycle -----


def test_refresh_resnaps_spectrum_on_content_change():
    """When the input changes and refresh fires, the captured spectrum updates."""
    f1 = _frame()
    f2 = _frame()
    f2[:, :, :3] = 0  # all-black RGB, alpha kept
    _, st1 = apply(f1, {"freeze_now": "true", "phase_jitter": 0.0}, None, **KW)
    mag1 = st1["frozen_mag"].copy()
    _, st2 = apply(
        f2,
        {"freeze_now": "true", "refresh": "true", "phase_jitter": 0.0},
        st1,
        **KW,
    )
    # Black-frame spectrum should differ from random-frame spectrum.
    assert not np.allclose(st2["frozen_mag"], mag1)


def test_freeze_off_then_on_resets():
    """off→on cycle must rebuild fresh state, not reuse stale spectrum."""
    f1 = _frame()
    _, st = apply(f1, {"freeze_now": "true", "phase_jitter": 0.0}, None, **KW)
    # Toggle off — clears.
    _, st_off = apply(f1, {"freeze_now": "false"}, st, **KW)
    assert "frozen_mag" not in st_off
    # Toggle back on with new content.
    f2 = _frame()
    f2[:, :, :3] = 255
    _, st_on = apply(f2, {"freeze_now": "true", "phase_jitter": 0.0}, st_off, **KW)
    assert "frozen_mag" in st_on


# ----- Edge cases (PLAY-005 + PLAY-001) -----


def test_param_clamping_at_trust_boundary():
    """Out-of-range values must clamp without raising or producing NaN."""
    f = _frame()
    bad = {
        "cutoff_norm": -5.0,  # below min, clamp to 0
        "resonance_q": 9999.0,  # above max
        "phase_jitter": 99.0,
        "feedback_resonance": -1.0,
        "sweep_lfo_rate": 100.0,
        "mix": 50.0,
    }
    out, _ = apply(f, bad, None, **KW)
    assert out.dtype == np.uint8
    assert not np.isnan(out).any()


def test_resolution_change_invalidates_state():
    """Frozen spectrum captured at one size must not be reused at a different size."""
    f1 = _frame(h=64, w=64)
    _, st1 = apply(f1, {"freeze_now": "true", "phase_jitter": 0.0}, None, **KW)
    f2 = _frame(h=80, w=120)
    KW2 = {"frame_index": 1, "seed": 42, "resolution": (120, 80)}
    out, st2 = apply(f2, {"freeze_now": "true", "phase_jitter": 0.0}, st1, **KW2)
    assert out.shape == (80, 120, 4)
    assert st2["frozen_mag"].shape == (80, 120 // 2 + 1)


def test_tiny_frame_passes_through():
    """1×1 / 2×2 frames are FFT-degenerate — must pass through, no crash."""
    for h, w in [(1, 1), (2, 2), (3, 3)]:
        f = np.full((h, w, 4), 128, dtype=np.uint8)
        out, st = apply(f, {}, None, frame_index=0, seed=42, resolution=(w, h))
        assert out.shape == f.shape
        assert out.dtype == np.uint8
        assert st is not None


def test_extreme_q_no_explosion():
    """Q=30 with full feedback must not produce NaN / inf even after many frames."""
    f = _frame()
    state = None
    params = {
        "freeze_now": "true",
        "resonance_q": 30.0,
        "feedback_resonance": 0.95,
        "filter_mode": "peak",
        "phase_jitter": 0.1,
    }
    for i in range(8):
        out, state = apply(
            f, params, state, frame_index=i, seed=42, resolution=(64, 64)
        )
        assert out.dtype == np.uint8
        assert not np.isnan(out).any()
        assert not np.isinf(out).any()
        assert not np.isnan(state["frozen_mag"]).any()


def test_all_black_and_all_white_frames():
    """DC-only / saturated inputs must not crash or produce NaN."""
    for fill in (0, 255):
        f = np.full((32, 32, 4), fill, dtype=np.uint8)
        f[:, :, 3] = 255
        out, _ = apply(
            f,
            {"freeze_now": "true", "phase_jitter": 0.0},
            None,
            frame_index=0,
            seed=42,
            resolution=(32, 32),
        )
        assert out.dtype == np.uint8
        assert not np.isnan(out).any()


def test_lfo_sweep_changes_output_over_frames():
    """sweep_lfo_rate > 0 must produce different outputs across frame indices."""
    f = _frame()
    _, st = apply(
        f,
        {"freeze_now": "true", "sweep_lfo_rate": 1.0, "phase_jitter": 0.0},
        None,
        **KW,
    )
    out_a, _ = apply(
        f,
        {"freeze_now": "true", "sweep_lfo_rate": 1.0, "phase_jitter": 0.0},
        st,
        frame_index=0,
        seed=42,
        resolution=(64, 64),
    )
    # Frame 7 at 1Hz / 30fps → sin(2π·7/30) ≈ 0.95 → cutoff biases high.
    # Frame 0 → sin(0) = 0 → cutoff at user-set base. Choose phases that don't alias.
    out_b, _ = apply(
        f,
        {"freeze_now": "true", "sweep_lfo_rate": 1.0, "phase_jitter": 0.0},
        st,
        frame_index=7,
        seed=42,
        resolution=(64, 64),
    )
    assert not np.array_equal(out_a, out_b)
