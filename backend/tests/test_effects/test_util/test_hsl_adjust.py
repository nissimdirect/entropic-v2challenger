"""Tests for util.hsl_adjust effect."""

import numpy as np
import pytest

from effects.util.hsl_adjust import apply

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
    """Default params (all zeros) should produce near-identity output."""
    frame = _frame(100, 150, 200)
    result, state = apply(frame, {}, None, **KW)
    assert state is None
    np.testing.assert_array_equal(result, frame)


def test_target_reds_on_red_frame():
    """Targeting 'reds' on a red frame should change it."""
    frame = _frame(255, 0, 0)
    params = {"target_hue": "reds", "saturation": -50.0}
    result, _ = apply(frame, params, None, **KW)
    # Red channel should decrease (desaturated)
    assert not np.array_equal(result[:, :, :3], frame[:, :, :3])


def test_target_blues_on_red_frame():
    """Targeting 'blues' on a red frame should have minimal effect."""
    frame = _frame(255, 0, 0)
    params = {"target_hue": "blues", "saturation": -100.0}
    result, _ = apply(frame, params, None, **KW)
    # Should be very close to original (blues mask near 0 on red pixels)
    diff = np.abs(result[:, :, :3].astype(int) - frame[:, :, :3].astype(int))
    assert diff.max() <= 5  # Allow small HSV roundtrip error


def test_hue_shift_red_to_green():
    """Hue shift +120 on red should shift toward green."""
    frame = _frame(255, 0, 0)
    params = {"hue_shift": 120.0}
    result, _ = apply(frame, params, None, **KW)
    # Green channel should be dominant after +120 shift
    assert result[0, 0, 1] > result[0, 0, 0]  # G > R


def test_lightness_positive_brighter():
    """Positive lightness should make frame brighter."""
    frame = _frame(100, 100, 100)
    params = {"lightness": 50.0}
    result, _ = apply(frame, params, None, **KW)
    mean_before = frame[:, :, :3].astype(float).mean()
    mean_after = result[:, :, :3].astype(float).mean()
    assert mean_after > mean_before


def test_lightness_negative_darker():
    """Negative lightness should make frame darker."""
    frame = _frame(150, 150, 150)
    params = {"lightness": -50.0}
    result, _ = apply(frame, params, None, **KW)
    mean_before = frame[:, :, :3].astype(float).mean()
    mean_after = result[:, :, :3].astype(float).mean()
    assert mean_after < mean_before


def test_alpha_preserved():
    """Alpha channel should never change."""
    frame = _frame(200, 100, 50, a=180)
    params = {"hue_shift": 90.0, "saturation": 50.0}
    result, _ = apply(frame, params, None, **KW)
    np.testing.assert_array_equal(result[:, :, 3], 180)


def test_determinism():
    """Same input produces same output."""
    rng = np.random.default_rng(42)
    frame = rng.integers(0, 256, (50, 50, 4), dtype=np.uint8)
    params = {"hue_shift": 45.0, "saturation": 30.0, "lightness": -10.0}
    result1, _ = apply(frame, params, None, **KW)
    result2, _ = apply(frame, params, None, **KW)
    np.testing.assert_array_equal(result1, result2)


def test_empty_frame():
    """Empty frame should not crash."""
    frame = np.zeros((0, 0, 4), dtype=np.uint8)
    result, _ = apply(frame, {"hue_shift": 90.0}, None, **KW)
    assert result.shape == frame.shape


def test_hue_wraps_around_360():
    """Hue shift should wrap correctly around 360."""
    # Blue pixel (hue ~240) + shift 180 = ~420 -> wraps to ~60 (yellow)
    frame = _frame(0, 0, 255)
    params = {"hue_shift": 180.0}
    result, _ = apply(frame, params, None, **KW)
    # Should be yellowish (R and G high, B low)
    assert result[0, 0, 0] > 100  # Red present
    assert result[0, 0, 1] > 100  # Green present


def test_all_8_ranges_max_shifts():
    """All 8 hue ranges at max params should not crash."""
    frame = np.random.default_rng(42).integers(0, 256, (50, 50, 4), dtype=np.uint8)
    for target in [
        "reds",
        "oranges",
        "yellows",
        "greens",
        "cyans",
        "blues",
        "purples",
        "magentas",
    ]:
        params = {
            "target_hue": target,
            "hue_shift": 180.0,
            "saturation": 100.0,
            "lightness": 100.0,
        }
        result, _ = apply(frame, params, None, **KW)
        assert result.shape == frame.shape
