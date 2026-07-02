"""Tests for util.color_balance effect."""

import numpy as np
import pytest

from effects.util.color_balance import apply

pytestmark = pytest.mark.smoke

KW = {"frame_index": 0, "seed": 42, "resolution": (100, 100)}


def _frame(r=128, g=128, b=128, a=255, size=100):
    frame = np.zeros((size, size, 4), dtype=np.uint8)
    frame[:, :, 0] = r
    frame[:, :, 1] = g
    frame[:, :, 2] = b
    frame[:, :, 3] = a
    return frame


def test_identity_defaults():
    """Default params (all zeros) should return frame unchanged."""
    frame = _frame(100, 150, 200)
    result, state = apply(frame, {}, None, **KW)
    assert state is None
    np.testing.assert_array_equal(result, frame)


def test_shadows_r_on_dark_frame():
    """shadows_r +80 on a dark frame should increase red channel."""
    frame = _frame(30, 30, 30)  # Dark = shadow region
    params = {"shadows_r": 80, "preserve_luma": False}
    result, _ = apply(frame, params, None, **KW)
    assert result[0, 0, 0] > 30  # Red increased


def test_highlights_b_on_bright_frame():
    """highlights_b +80 on a bright frame should increase blue channel."""
    frame = _frame(220, 220, 220)  # Bright = highlight region
    params = {"highlights_b": 80, "preserve_luma": False}
    result, _ = apply(frame, params, None, **KW)
    assert result[0, 0, 2] > 220  # Blue increased


def test_preserve_luminosity():
    """With preserve_luma, mean brightness should stay close."""
    frame = _frame(128, 128, 128)
    params = {"midtones_r": 80, "midtones_g": -40, "preserve_luma": True}
    result, _ = apply(frame, params, None, **KW)
    orig_luma = frame[:, :, :3].astype(float).mean()
    new_luma = result[:, :, :3].astype(float).mean()
    assert abs(orig_luma - new_luma) < 20  # Within reasonable range


def test_all_params_max_no_crash():
    """All params at +100 should not crash."""
    frame = _frame(128, 128, 128)
    params = {
        "shadows_r": 100,
        "shadows_g": 100,
        "shadows_b": 100,
        "midtones_r": 100,
        "midtones_g": 100,
        "midtones_b": 100,
        "highlights_r": 100,
        "highlights_g": 100,
        "highlights_b": 100,
        "preserve_luma": False,
    }
    result, _ = apply(frame, params, None, **KW)
    assert result.shape == frame.shape
    assert result.dtype == np.uint8


def test_all_params_min_no_crash():
    """All params at -100 should not crash."""
    frame = _frame(128, 128, 128)
    params = {
        "shadows_r": -100,
        "shadows_g": -100,
        "shadows_b": -100,
        "midtones_r": -100,
        "midtones_g": -100,
        "midtones_b": -100,
        "highlights_r": -100,
        "highlights_g": -100,
        "highlights_b": -100,
        "preserve_luma": False,
    }
    result, _ = apply(frame, params, None, **KW)
    assert result.shape == frame.shape


def test_alpha_preserved():
    """Alpha should never change."""
    frame = _frame(128, 128, 128, a=180)
    params = {"shadows_r": 80, "highlights_b": -50}
    result, _ = apply(frame, params, None, **KW)
    np.testing.assert_array_equal(result[:, :, 3], 180)


def test_determinism():
    """Same input produces same output."""
    rng = np.random.default_rng(42)
    frame = rng.integers(0, 256, (50, 50, 4), dtype=np.uint8)
    params = {"shadows_r": 40, "midtones_g": -20, "highlights_b": 60}
    result1, _ = apply(frame, params, None, **KW)
    result2, _ = apply(frame, params, None, **KW)
    np.testing.assert_array_equal(result1, result2)


def test_empty_frame():
    """Empty frame should not crash."""
    frame = np.zeros((0, 0, 4), dtype=np.uint8)
    result, _ = apply(frame, {"shadows_r": 50}, None, **KW)
    assert result.shape == frame.shape


def test_preserve_luma_extreme_shifts():
    """Preserve luminosity with extreme shifts should not overflow."""
    frame = _frame(200, 200, 200)
    params = {
        "shadows_r": 100,
        "shadows_g": 100,
        "shadows_b": 100,
        "highlights_r": 100,
        "highlights_g": 100,
        "highlights_b": 100,
        "preserve_luma": True,
    }
    result, _ = apply(frame, params, None, **KW)
    assert result.dtype == np.uint8
    assert result.max() <= 255
    assert result.min() >= 0
