"""Tests for util.levels effect."""

import numpy as np
import pytest

from effects.util.levels import apply

pytestmark = pytest.mark.smoke

KW = {"frame_index": 0, "seed": 42, "resolution": (100, 100)}


def _frame(r=128, g=128, b=128, a=255, size=100):
    frame = np.zeros((size, size, 4), dtype=np.uint8)
    frame[:, :, 0] = r
    frame[:, :, 1] = g
    frame[:, :, 2] = b
    frame[:, :, 3] = a
    return frame


def test_identity_defaults_unchanged():
    """Default params (all identity) should return frame unchanged."""
    frame = _frame(100, 150, 200)
    result, state = apply(frame, {}, None, **KW)
    assert state is None
    np.testing.assert_array_equal(result, frame)


def test_inverted_output():
    """output_black=255, output_white=0 should invert the mapping."""
    frame = _frame(0, 128, 255)
    params = {"output_black": 255, "output_white": 0}
    result, _ = apply(frame, params, None, **KW)
    # Black (0) should map to output_black (255)
    assert result[0, 0, 0] == 255
    # White (255) should map to output_white (0)
    assert result[0, 0, 2] == 0


def test_gamma_above_one_brightens_midtones():
    """Gamma > 1 raises midtones (pow(x, 1/gamma) where 1/gamma < 1)."""
    frame = _frame(128, 128, 128)
    params = {"gamma": 2.0}
    result, _ = apply(frame, params, None, **KW)
    assert result[0, 0, 0] > 128


def test_gamma_below_one_darkens_midtones():
    """Gamma < 1 lowers midtones (pow(x, 1/gamma) where 1/gamma > 1)."""
    frame = _frame(128, 128, 128)
    params = {"gamma": 0.5}
    result, _ = apply(frame, params, None, **KW)
    assert result[0, 0, 0] < 128


def test_per_channel_r():
    """Per-channel 'r' mode only changes red channel."""
    frame = _frame(128, 128, 128)
    params = {"gamma": 2.0, "channel": "r"}
    result, _ = apply(frame, params, None, **KW)
    assert result[0, 0, 0] > 128  # Red brightened (gamma > 1)
    assert result[0, 0, 1] == 128  # Green unchanged
    assert result[0, 0, 2] == 128  # Blue unchanged


def test_per_channel_g():
    """Per-channel 'g' mode only changes green channel."""
    frame = _frame(128, 128, 128)
    params = {"gamma": 2.0, "channel": "g"}
    result, _ = apply(frame, params, None, **KW)
    assert result[0, 0, 0] == 128
    assert result[0, 0, 1] > 128
    assert result[0, 0, 2] == 128


def test_alpha_preserved():
    """Alpha channel should never be modified."""
    frame = _frame(128, 128, 128, a=200)
    params = {"gamma": 0.5}
    result, _ = apply(frame, params, None, **KW)
    np.testing.assert_array_equal(result[:, :, 3], 200)


def test_extreme_params_no_crash():
    """All params at min and max values should not crash."""
    frame = _frame(128, 128, 128)
    # All min
    params_min = {
        "input_black": 0,
        "input_white": 0,
        "gamma": 0.1,
        "output_black": 0,
        "output_white": 0,
    }
    result, _ = apply(frame, params_min, None, **KW)
    assert result.shape == frame.shape

    # All max
    params_max = {
        "input_black": 255,
        "input_white": 255,
        "gamma": 10.0,
        "output_black": 255,
        "output_white": 255,
    }
    result, _ = apply(frame, params_max, None, **KW)
    assert result.shape == frame.shape


def test_determinism():
    """Same input produces same output."""
    rng = np.random.default_rng(42)
    frame = rng.integers(0, 256, (50, 50, 4), dtype=np.uint8)
    params = {"gamma": 0.7, "input_black": 20, "input_white": 230}
    result1, _ = apply(frame, params, None, **KW)
    result2, _ = apply(frame, params, None, **KW)
    np.testing.assert_array_equal(result1, result2)


def test_empty_frame():
    """Empty frame should not crash."""
    frame = np.zeros((0, 0, 4), dtype=np.uint8)
    result, _ = apply(frame, {}, None, **KW)
    assert result.shape == frame.shape


def test_1x1_frame():
    """1x1 frame should work."""
    frame = np.array([[[128, 64, 200, 255]]], dtype=np.uint8)
    params = {"gamma": 0.5}
    result, _ = apply(frame, params, None, **KW)
    assert result.shape == (1, 1, 4)
    assert result[0, 0, 3] == 255  # Alpha preserved
