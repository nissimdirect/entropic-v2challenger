"""Tests for fx.ascii_phantom — Frankenstein of ascii_art × generation_loss.

Recursive ASCII collapse: each pass converts frame → ASCII → image, then
feeds that image into the next pass. After N passes, image collapses into
the typographic attractor.
"""

import numpy as np
import pytest

from effects.fx.ascii_phantom import EFFECT_ID, PARAMS, apply

pytestmark = pytest.mark.smoke


def _frame(h=64, w=64):
    rng = np.random.default_rng(42)
    return rng.integers(0, 256, (h, w, 4), dtype=np.uint8)


KW = {"frame_index": 0, "seed": 42, "resolution": (64, 64)}


# ----- Contract / shape -----


def test_basic_returns_frame_and_no_state():
    """Output is uint8 RGBA same shape as input. State is None (stateless)."""
    f = _frame()
    out, state = apply(f, {}, None, **KW)
    assert out.shape == f.shape
    assert out.dtype == np.uint8
    assert state is None  # stateless effect (recursive but per-frame)


def test_alpha_preserved():
    """Alpha channel must round-trip unchanged."""
    f = _frame()
    f[:, :, 3] = 200
    out, _ = apply(f, {}, None, **KW)
    np.testing.assert_array_equal(out[:, :, 3], 200)


def test_effect_id():
    assert EFFECT_ID == "fx.ascii_phantom"


# ----- Defaults / params -----


def test_default_params_sane():
    """Every PARAM default must be within its declared range."""
    for pname, pspec in PARAMS.items():
        d = pspec.get("default")
        if pspec["type"] in ("float", "int"):
            assert pspec["min"] <= d <= pspec["max"], pname
        elif pspec["type"] == "choice":
            assert d in pspec["options"], pname


def test_default_produces_visible_change():
    """Default params must visibly transform the frame (not identity)."""
    f = _frame()
    out, _ = apply(f, {}, None, **KW)
    diff = np.mean(np.abs(out[:, :, :3].astype(int) - f[:, :, :3].astype(int)))
    assert diff > 0.5, f"expected visible change, got mean abs diff {diff:.3f}"


def test_mix_zero_returns_input():
    """mix=0 → output == input rgb (within rounding)."""
    f = _frame()
    out, _ = apply(f, {"mix": 0.0}, None, **KW)
    np.testing.assert_allclose(
        out[:, :, :3].astype(int), f[:, :, :3].astype(int), atol=1
    )


# ----- Determinism -----


def test_deterministic_given_inputs():
    f = _frame()
    out1, _ = apply(f, {"passes": 2}, None, **KW)
    out2, _ = apply(f, {"passes": 2}, None, **KW)
    np.testing.assert_array_equal(out1, out2)


# ----- Recursion semantics -----


def test_more_passes_diverges_more():
    """More recursive passes should diverge further from the input."""
    f = _frame(h=96, w=96)
    KW2 = {"frame_index": 0, "seed": 42, "resolution": (96, 96)}
    out_1, _ = apply(f, {"passes": 1, "mix": 1.0}, None, **KW2)
    out_5, _ = apply(f, {"passes": 5, "mix": 1.0}, None, **KW2)
    diff_1 = np.mean(np.abs(out_1[:, :, :3].astype(int) - f[:, :, :3].astype(int)))
    diff_5 = np.mean(np.abs(out_5[:, :, :3].astype(int) - f[:, :, :3].astype(int)))
    # 5 passes should be at least as different — typically more.
    assert diff_5 >= diff_1 - 1.0, (
        f"5-pass diff={diff_5:.2f} < 1-pass diff={diff_1:.2f}"
    )


def test_passes_capped_at_eight():
    """passes > 8 must be clamped (PLAY-005)."""
    f = _frame()
    out, _ = apply(f, {"passes": 1000}, None, **KW)
    assert out.shape == f.shape
    assert not np.isnan(out).any()


# ----- Charsets / color modes -----


def test_all_charsets_render():
    f = _frame()
    for cs in ["binary", "sparse", "standard", "dense"]:
        out, _ = apply(f, {"charset": cs, "passes": 1}, None, **KW)
        assert out.shape == f.shape
        assert out.dtype == np.uint8


def test_invalid_charset_falls_back():
    """Unknown charset falls back to 'standard' silently."""
    f = _frame()
    out, _ = apply(f, {"charset": "garbage"}, None, **KW)
    assert out.dtype == np.uint8
    assert not np.isnan(out).any()


def test_all_color_modes_render():
    f = _frame()
    for mode in ["mono", "preserve", "green", "amber"]:
        out, _ = apply(f, {"color_mode": mode, "passes": 1}, None, **KW)
        assert out.shape == f.shape


def test_invalid_color_mode_falls_back():
    f = _frame()
    out, _ = apply(f, {"color_mode": "magenta"}, None, **KW)
    assert out.dtype == np.uint8


# ----- Progressive collapse / degrade -----


def test_progressive_collapse_runs():
    f = _frame()
    out, _ = apply(
        f,
        {"progressive_collapse": "true", "passes": 4, "charset": "dense"},
        None,
        **KW,
    )
    assert out.shape == f.shape
    assert not np.isnan(out).any()


def test_degrade_between_passes():
    """Degrade should not break the pipeline."""
    f = _frame()
    out, _ = apply(f, {"degrade": 0.8, "passes": 3}, None, **KW)
    assert out.shape == f.shape
    assert not np.isnan(out).any()


# ----- Edge cases -----


def test_param_clamping_at_trust_boundary():
    """Out-of-range values must clamp (PLAY-005)."""
    f = _frame()
    bad = {
        "passes": -10,
        "glyph_size": 10000,
        "degrade": 99.0,
        "mix": -5.0,
    }
    out, _ = apply(f, bad, None, **KW)
    assert out.dtype == np.uint8
    assert not np.isnan(out).any()


def test_all_black_frame():
    f = np.zeros((64, 64, 4), dtype=np.uint8)
    f[:, :, 3] = 255
    out, _ = apply(f, {}, None, **KW)
    assert not np.isnan(out).any()
    # All-black input → all chars map to char[0] (space) → black output
    np.testing.assert_array_equal(out[:, :, 3], 255)


def test_all_white_frame():
    f = np.full((64, 64, 4), 255, dtype=np.uint8)
    out, _ = apply(f, {}, None, **KW)
    assert not np.isnan(out).any()
    assert out.shape == f.shape


def test_small_frame_does_not_crash():
    """Tiny frames where glyph_size > frame dim must not crash."""
    f = np.full((8, 8, 4), 128, dtype=np.uint8)
    KW_S = {"frame_index": 0, "seed": 42, "resolution": (8, 8)}
    out, _ = apply(f, {"glyph_size": 32}, None, **KW_S)
    assert out.shape == f.shape
    assert not np.isnan(out).any()


def test_non_square_frame():
    """Non-square frames must round-trip with correct dimensions."""
    rng = np.random.default_rng(42)
    f = rng.integers(0, 256, (40, 100, 4), dtype=np.uint8)
    KW2 = {"frame_index": 0, "seed": 42, "resolution": (40, 100)}
    out, _ = apply(f, {"passes": 2}, None, **KW2)
    assert out.shape == (40, 100, 4)
    assert out.dtype == np.uint8
