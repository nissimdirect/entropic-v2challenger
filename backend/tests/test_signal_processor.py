"""Tests for signal processing chain."""

import math

from modulation.processor import process_signal


def _val(value: float, chain: list[dict], state=None) -> float:
    """Helper: call process_signal and return just the value."""
    result, _ = process_signal(value, chain, state)
    return result


class TestThreshold:
    def test_below_threshold(self):
        val = _val(0.3, [{"type": "threshold", "params": {"level": 0.5}}])
        assert val == 0.0

    def test_above_threshold(self):
        val = _val(0.8, [{"type": "threshold", "params": {"level": 0.5}}])
        # (0.8 - 0.5) / (1.0 - 0.5) = 0.6
        assert abs(val - 0.6) < 0.01

    def test_at_threshold(self):
        val = _val(0.5, [{"type": "threshold", "params": {"level": 0.5}}])
        assert val == 0.0


class TestSmooth:
    def test_smooth_blend_with_state(self):
        """Smooth across two calls: first at 0, second at 1 → blended."""
        chain = [{"type": "smooth", "params": {"factor": 0.5}}]
        val1, state = process_signal(0.0, chain, None)
        assert abs(val1 - 0.0) < 0.01

        val2, state = process_signal(1.0, chain, state)
        # prev=0.0, new=1.0, factor=0.5 → 0.0 + (1.0 - 0.0) * 0.5 = 0.5
        assert abs(val2 - 0.5) < 0.01

    def test_smooth_factor_one(self):
        """Factor 1.0 = no smoothing (pass through)."""
        chain = [{"type": "smooth", "params": {"factor": 1.0}}]
        _, state = process_signal(0.0, chain, None)
        val, _ = process_signal(0.8, chain, state)
        assert abs(val - 0.8) < 0.01

    def test_smooth_without_state_uses_input_as_prev(self):
        """First call with no state: prev defaults to current value."""
        val, state = process_signal(
            0.7, [{"type": "smooth", "params": {"factor": 0.5}}]
        )
        assert abs(val - 0.7) < 0.01  # prev=0.7, val=0.7 → 0.7


class TestQuantize:
    def test_quantize_4_levels(self):
        """4 levels: 0, 0.333, 0.667, 1.0."""
        val = _val(0.4, [{"type": "quantize", "params": {"levels": 4}}])
        assert abs(val - 1.0 / 3.0) < 0.01

    def test_quantize_2_levels(self):
        """2 levels: 0 and 1."""
        assert _val(0.3, [{"type": "quantize", "params": {"levels": 2}}]) == 0.0
        assert _val(0.7, [{"type": "quantize", "params": {"levels": 2}}]) == 1.0

    def test_quantize_1_level(self):
        """1 level returns 0."""
        assert _val(0.5, [{"type": "quantize", "params": {"levels": 1}}]) == 0.0


class TestInvert:
    def test_invert(self):
        val = _val(0.3, [{"type": "invert", "params": {}}])
        assert abs(val - 0.7) < 0.01

    def test_invert_zero(self):
        assert _val(0.0, [{"type": "invert", "params": {}}]) == 1.0

    def test_invert_one(self):
        assert _val(1.0, [{"type": "invert", "params": {}}]) == 0.0


class TestScale:
    def test_scale_remap(self):
        val = _val(0.5, [{"type": "scale", "params": {"out_min": 0.2, "out_max": 0.8}}])
        assert abs(val - 0.5) < 0.01

    def test_scale_narrow_input(self):
        val = _val(
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
        val = _val(
            0.2,
            [
                {"type": "invert", "params": {}},  # 0.2 → 0.8
                {"type": "threshold", "params": {"level": 0.5}},  # (0.8-0.5)/0.5 = 0.6
            ],
        )
        assert abs(val - 0.6) < 0.01


class TestGuards:
    def test_nan_input(self):
        val = _val(float("nan"), [{"type": "invert", "params": {}}])
        assert val == 1.0  # NaN → 0.0, invert → 1.0

    def test_empty_chain(self):
        val = _val(0.7, [])
        assert val == 0.7


class TestStateThreading:
    def test_state_returned_as_dict(self):
        """process_signal returns (value, state) tuple."""
        val, state = process_signal(0.5, [])
        assert isinstance(state, dict)

    def test_smooth_state_persists_across_calls(self):
        """Smooth step uses state to track previous value across frames."""
        chain = [{"type": "smooth", "params": {"factor": 0.3}}]

        # Frame 1: input 0.0
        v1, state = process_signal(0.0, chain, None)
        assert abs(v1 - 0.0) < 0.01

        # Frame 2: input 1.0, smooth with prev=0.0, factor=0.3 → 0.3
        v2, state = process_signal(1.0, chain, state)
        assert abs(v2 - 0.3) < 0.05

        # Frame 3: input 1.0, smooth with prev≈0.3, factor=0.3 → ~0.51
        v3, state = process_signal(1.0, chain, state)
        assert v3 > v2  # converging toward 1.0

    def test_backward_compatible_no_state(self):
        """Calling without state arg works (default None)."""
        val, state = process_signal(0.5, [{"type": "invert", "params": {}}])
        assert abs(val - 0.5) < 0.01
        assert isinstance(state, dict)
