"""Tests for video analyzer operator — proxy downscale + 5 analysis methods."""

import numpy as np
import pytest

from modulation.video_analyzer import (
    PROXY_SIZE,
    analyze_color,
    analyze_edges,
    analyze_histogram_peak,
    analyze_luminance,
    analyze_motion,
    downscale_proxy,
    evaluate_video_analyzer,
)


def _white_frame(h=480, w=640):
    return np.full((h, w, 3), 255, dtype=np.uint8)


def _black_frame(h=480, w=640):
    return np.zeros((h, w, 3), dtype=np.uint8)


def _gradient_frame(h=480, w=640):
    """Left-to-right gradient 0-255."""
    row = np.linspace(0, 255, w, dtype=np.uint8)
    frame = np.tile(row, (h, 1))
    return np.stack([frame, frame, frame], axis=-1)


def _red_frame(h=480, w=640):
    frame = np.zeros((h, w, 3), dtype=np.uint8)
    frame[:, :, 0] = 255  # R channel
    return frame


class TestDownscaleProxy:
    def test_output_shape(self):
        proxy = downscale_proxy(_white_frame())
        assert proxy.shape == (PROXY_SIZE, PROXY_SIZE, 3)

    def test_already_correct_size(self):
        small = _white_frame(PROXY_SIZE, PROXY_SIZE)
        proxy = downscale_proxy(small)
        assert proxy.shape == (PROXY_SIZE, PROXY_SIZE, 3)
        assert np.array_equal(proxy, small)

    def test_none_frame(self):
        proxy = downscale_proxy(None)
        assert proxy.shape == (PROXY_SIZE, PROXY_SIZE, 3)
        assert np.all(proxy == 0)

    def test_empty_frame(self):
        proxy = downscale_proxy(np.array([]))
        assert proxy.shape == (PROXY_SIZE, PROXY_SIZE, 3)

    def test_preserves_brightness(self):
        proxy = downscale_proxy(_white_frame())
        assert np.mean(proxy) > 250  # Should stay nearly white


class TestLuminance:
    def test_white_is_bright(self):
        proxy = downscale_proxy(_white_frame())
        val = analyze_luminance(proxy)
        assert val > 0.95

    def test_black_is_dark(self):
        proxy = downscale_proxy(_black_frame())
        val = analyze_luminance(proxy)
        assert val < 0.05

    def test_gradient_is_mid(self):
        proxy = downscale_proxy(_gradient_frame())
        val = analyze_luminance(proxy)
        assert 0.3 < val < 0.7

    def test_clamped_01(self):
        proxy = downscale_proxy(_white_frame())
        val = analyze_luminance(proxy)
        assert 0.0 <= val <= 1.0


class TestMotion:
    def test_no_previous(self):
        proxy = downscale_proxy(_white_frame())
        assert analyze_motion(proxy, None) == 0.0

    def test_same_frame_no_motion(self):
        proxy = downscale_proxy(_white_frame())
        assert analyze_motion(proxy, proxy) == 0.0

    def test_black_to_white_max_motion(self):
        black = downscale_proxy(_black_frame())
        white = downscale_proxy(_white_frame())
        val = analyze_motion(white, black)
        assert val > 0.8

    def test_small_change(self):
        a = downscale_proxy(_black_frame())
        b = a.copy()
        b[:10, :10, :] = 50  # Small region changes
        val = analyze_motion(b, a)
        assert 0.0 < val < 0.5


class TestColor:
    def test_red_hue(self):
        proxy = downscale_proxy(_red_frame())
        val = analyze_color(proxy)
        # Red hue is near 0.0 or 1.0 (wraps around)
        assert val < 0.1 or val > 0.9

    def test_achromatic_zero(self):
        proxy = downscale_proxy(_white_frame())
        val = analyze_color(proxy)
        assert val == 0.0

    def test_black_zero(self):
        proxy = downscale_proxy(_black_frame())
        val = analyze_color(proxy)
        assert val == 0.0

    def test_empty_zero(self):
        assert analyze_color(np.array([])) == 0.0


class TestEdges:
    def test_uniform_no_edges(self):
        proxy = downscale_proxy(_white_frame())
        val = analyze_edges(proxy)
        assert val < 0.05

    def test_gradient_has_edges(self):
        proxy = downscale_proxy(_gradient_frame())
        val = analyze_edges(proxy)
        assert val > 0.01

    def test_clamped_01(self):
        proxy = downscale_proxy(_gradient_frame())
        val = analyze_edges(proxy)
        assert 0.0 <= val <= 1.0


class TestHistogramPeak:
    def test_white_peak_high(self):
        proxy = downscale_proxy(_white_frame())
        val = analyze_histogram_peak(proxy)
        assert val > 0.9

    def test_black_peak_low(self):
        proxy = downscale_proxy(_black_frame())
        val = analyze_histogram_peak(proxy)
        assert val < 0.1

    def test_clamped_01(self):
        proxy = downscale_proxy(_gradient_frame())
        val = analyze_histogram_peak(proxy)
        assert 0.0 <= val <= 1.0


class TestEvaluateVideoAnalyzer:
    def test_luminance_method(self):
        proxy = downscale_proxy(_white_frame())
        val, state = evaluate_video_analyzer("luminance", proxy)
        assert val > 0.9
        assert "prev_proxy" in state

    def test_motion_first_frame(self):
        proxy = downscale_proxy(_white_frame())
        val, state = evaluate_video_analyzer("motion", proxy)
        assert val == 0.0  # No previous

    def test_motion_with_state(self):
        black = downscale_proxy(_black_frame())
        white = downscale_proxy(_white_frame())
        _, state1 = evaluate_video_analyzer("motion", black)
        val, _ = evaluate_video_analyzer("motion", white, state1)
        assert val > 0.5

    def test_unknown_method(self):
        proxy = downscale_proxy(_white_frame())
        val, _ = evaluate_video_analyzer("nonexistent", proxy)
        assert val == 0.0

    def test_none_proxy(self):
        val, _ = evaluate_video_analyzer("luminance", None)
        assert val == 0.0

    def test_color_method(self):
        proxy = downscale_proxy(_red_frame())
        val, _ = evaluate_video_analyzer("color", proxy)
        assert isinstance(val, float)

    def test_edges_method(self):
        proxy = downscale_proxy(_gradient_frame())
        val, _ = evaluate_video_analyzer("edges", proxy)
        assert val > 0.0

    def test_histogram_peak_method(self):
        proxy = downscale_proxy(_white_frame())
        val, _ = evaluate_video_analyzer("histogram_peak", proxy)
        assert val > 0.9
