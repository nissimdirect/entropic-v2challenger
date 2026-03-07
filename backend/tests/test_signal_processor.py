"""Tests for signal processing chain."""

import math

from modulation.processor import process_signal


class TestThreshold:
    def test_below_threshold(self):
        val = process_signal(0.3, [{"type": "threshold", "params": {"level": 0.5}}])
        assert val == 0.0

    def test_above_threshold(self):
        val = process_signal(0.8, [{"type": "threshold", "params": {"level": 0.5}}])
        # (0.8 - 0.5) / (1.0 - 0.5) = 0.6
        assert abs(val - 0.6) < 0.01

    def test_at_threshold(self):
        val = process_signal(0.5, [{"type": "threshold", "params": {"level": 0.5}}])
        assert val == 0.0


class TestSmooth:
    def test_smooth_blend(self):
        val = process_signal(
            1.0, [{"type": "smooth", "params": {"factor": 0.5, "_prev": 0.0}}]
        )
        assert abs(val - 0.5) < 0.01

    def test_smooth_factor_one(self):
        """Factor 1.0 = no smoothing (pass through)."""
        val = process_signal(
            0.8, [{"type": "smooth", "params": {"factor": 1.0, "_prev": 0.0}}]
        )
        assert abs(val - 0.8) < 0.01


class TestQuantize:
    def test_quantize_4_levels(self):
        """4 levels: 0, 0.333, 0.667, 1.0."""
        val = process_signal(0.4, [{"type": "quantize", "params": {"levels": 4}}])
        assert abs(val - 1.0 / 3.0) < 0.01

    def test_quantize_2_levels(self):
        """2 levels: 0 and 1."""
        assert (
            process_signal(0.3, [{"type": "quantize", "params": {"levels": 2}}]) == 0.0
        )
        assert (
            process_signal(0.7, [{"type": "quantize", "params": {"levels": 2}}]) == 1.0
        )

    def test_quantize_1_level(self):
        """1 level returns 0."""
        assert (
            process_signal(0.5, [{"type": "quantize", "params": {"levels": 1}}]) == 0.0
        )


class TestInvert:
    def test_invert(self):
        val = process_signal(0.3, [{"type": "invert", "params": {}}])
        assert abs(val - 0.7) < 0.01

    def test_invert_zero(self):
        assert process_signal(0.0, [{"type": "invert", "params": {}}]) == 1.0

    def test_invert_one(self):
        assert process_signal(1.0, [{"type": "invert", "params": {}}]) == 0.0


class TestScale:
    def test_scale_remap(self):
        val = process_signal(
            0.5, [{"type": "scale", "params": {"out_min": 0.2, "out_max": 0.8}}]
        )
        assert abs(val - 0.5) < 0.01

    def test_scale_narrow_input(self):
        val = process_signal(
            0.75,
            [
                {
                    "type": "scale",
                    "params": {
                        "in_min": 0.5,
                        "in_max": 1.0,
                        "out_min": 0.0,
                        "out_max": 1.0,
                    },
                }
            ],
        )
        assert abs(val - 0.5) < 0.01


class TestChain:
    def test_multi_step_chain(self):
        """Invert then threshold."""
        val = process_signal(
            0.2,
            [
                {"type": "invert", "params": {}},  # 0.2 → 0.8
                {"type": "threshold", "params": {"level": 0.5}},  # (0.8-0.5)/0.5 = 0.6
            ],
        )
        assert abs(val - 0.6) < 0.01


class TestGuards:
    def test_nan_input(self):
        val = process_signal(float("nan"), [{"type": "invert", "params": {}}])
        assert val == 1.0  # NaN → 0.0, invert → 1.0

    def test_empty_chain(self):
        val = process_signal(0.7, [])
        assert val == 0.7
