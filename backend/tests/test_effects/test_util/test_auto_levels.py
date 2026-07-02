"""Tests for util.auto_levels effect."""

import numpy as np
import pytest

from effects.util.auto_levels import apply

pytestmark = pytest.mark.smoke

KW = {"frame_index": 0, "seed": 42, "resolution": (100, 100)}


def test_low_contrast_expands_range():
    """Low-contrast input should get a wider dynamic range."""
    frame = np.zeros((100, 100, 4), dtype=np.uint8)
    frame[:, :, 0] = 100
    frame[:, :, 1] = 120
    frame[:, :, 2] = 110
    frame[:, :, 3] = 255
    # Add some variation
    frame[50:, :, 0] = 150
    frame[50:, :, 1] = 170
    frame[50:, :, 2] = 160

    params = {"clip_percent": 0.0}
    result, state = apply(frame, params, None, **KW)
    assert state is None
    # Output range should be wider than input range
    for ch in range(3):
        in_range = frame[:, :, ch].max() - frame[:, :, ch].min()
        out_range = result[:, :, ch].max() - result[:, :, ch].min()
        assert out_range >= in_range


def test_uniform_frame_unchanged():
    """All-same-value frame can't be stretched, should stay close to original."""
    frame = np.full((50, 50, 4), 128, dtype=np.uint8)
    frame[:, :, 3] = 255
    result, _ = apply(frame, {"clip_percent": 1.0}, None, **KW)
    # Can't stretch a flat channel
    np.testing.assert_array_equal(result[:, :, :3], frame[:, :, :3])


def test_clip_percent_zero():
    """clip_percent=0 maps min pixel to 0, max pixel to 255."""
    frame = np.zeros((100, 100, 4), dtype=np.uint8)
    frame[:, :, 3] = 255
    frame[:50, :, 0] = 50
    frame[50:, :, 0] = 200
    frame[:, :, 1] = 100
    frame[:, :, 2] = 100

    params = {"clip_percent": 0.0}
    result, _ = apply(frame, params, None, **KW)
    # Red channel: 50 -> 0, 200 -> 255
    assert result[:50, :, 0].min() == 0
    assert result[50:, :, 0].max() == 255


def test_alpha_preserved():
    """Alpha should not change."""
    frame = np.full((50, 50, 4), 128, dtype=np.uint8)
    frame[:, :, 3] = 180
    frame[:25, :, 0] = 50
    result, _ = apply(frame, {"clip_percent": 1.0}, None, **KW)
    np.testing.assert_array_equal(result[:, :, 3], 180)


def test_empty_frame():
    """Empty frame should not crash."""
    frame = np.zeros((0, 0, 4), dtype=np.uint8)
    result, _ = apply(frame, {"clip_percent": 1.0}, None, **KW)
    assert result.shape == frame.shape


def test_determinism():
    """Same input produces same output."""
    rng = np.random.default_rng(42)
    frame = rng.integers(0, 256, (50, 50, 4), dtype=np.uint8)
    result1, _ = apply(frame, {"clip_percent": 2.0}, None, **KW)
    result2, _ = apply(frame, {"clip_percent": 2.0}, None, **KW)
    np.testing.assert_array_equal(result1, result2)
