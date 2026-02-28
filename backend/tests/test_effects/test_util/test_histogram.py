"""Tests for histogram utility."""

import numpy as np
import pytest

from effects.util.histogram import compute_histogram

pytestmark = pytest.mark.smoke


def test_returns_correct_keys():
    """Should return dict with r, g, b, a, luma keys."""
    frame = np.zeros((50, 50, 4), dtype=np.uint8)
    frame[:, :, 3] = 255
    result = compute_histogram(frame)
    assert set(result.keys()) == {"r", "g", "b", "a", "luma"}


def test_each_channel_256_bins():
    """Each histogram should have exactly 256 bins."""
    frame = np.zeros((50, 50, 4), dtype=np.uint8)
    result = compute_histogram(frame)
    for key in ["r", "g", "b", "a", "luma"]:
        assert len(result[key]) == 256


def test_sum_equals_pixel_count():
    """Sum of bins should equal total pixel count."""
    frame = np.zeros((30, 40, 4), dtype=np.uint8)
    frame[:, :, 3] = 255
    result = compute_histogram(frame)
    pixel_count = 30 * 40
    for key in ["r", "g", "b", "a", "luma"]:
        assert sum(result[key]) == pixel_count


def test_all_black_frame():
    """All-black frame should have all weight in bin 0 for RGB."""
    frame = np.zeros((50, 50, 4), dtype=np.uint8)
    frame[:, :, 3] = 255
    result = compute_histogram(frame)
    assert result["r"][0] == 2500
    assert result["g"][0] == 2500
    assert result["b"][0] == 2500
    assert result["luma"][0] == 2500


def test_all_white_frame():
    """All-white frame should have all weight in bin 255 for RGB."""
    frame = np.full((50, 50, 4), 255, dtype=np.uint8)
    result = compute_histogram(frame)
    assert result["r"][255] == 2500
    assert result["g"][255] == 2500
    assert result["b"][255] == 2500
    assert result["luma"][255] == 2500


def test_single_channel_value():
    """Frame with R=100 should have all R weight in bin 100."""
    frame = np.zeros((20, 20, 4), dtype=np.uint8)
    frame[:, :, 0] = 100
    frame[:, :, 3] = 255
    result = compute_histogram(frame)
    assert result["r"][100] == 400
    assert sum(result["r"]) == 400


def test_empty_frame():
    """Empty frame should return all-zero histograms."""
    frame = np.zeros((0, 0, 4), dtype=np.uint8)
    result = compute_histogram(frame)
    for key in ["r", "g", "b", "a", "luma"]:
        assert len(result[key]) == 256
        assert sum(result[key]) == 0
