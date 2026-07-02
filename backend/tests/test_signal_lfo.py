"""Tests for LFO operator."""

import math

import pytest

from modulation.lfo import evaluate_lfo


class TestLFOSine:
    def test_sine_zero_phase(self):
        """Sine at phase 0 should be 0.5 (midpoint of unipolar)."""
        val, _ = evaluate_lfo("sine", 1.0, 0.0, 0, 30.0)
        assert abs(val - 0.5) < 0.01

    def test_sine_quarter_cycle(self):
        """Sine at 1/4 cycle should be 1.0 (peak)."""
        # 1Hz at 30fps: quarter cycle = frame 7.5
        # At frame 7: phase = 7/30 ≈ 0.233, sin(2π*0.233) ≈ 0.999
        val, _ = evaluate_lfo("sine", 1.0, 0.0, 7, 30.0)
        assert val > 0.95

    def test_sine_half_cycle(self):
        """Sine at 1/2 cycle should be back near 0.5."""
        val, _ = evaluate_lfo("sine", 1.0, 0.0, 15, 30.0)
        assert abs(val - 0.5) < 0.05

    def test_sine_three_quarter_cycle(self):
        """Sine at 3/4 cycle should be near 0.0 (trough)."""
        val, _ = evaluate_lfo("sine", 1.0, 0.0, 22, 30.0)
        assert val < 0.1


class TestLFOSquare:
    def test_square_first_half(self):
        """Square wave first half should be 1.0."""
        val, _ = evaluate_lfo("square", 1.0, 0.0, 0, 30.0)
        assert val == 1.0

    def test_square_second_half(self):
        """Square wave second half should be 0.0."""
        val, _ = evaluate_lfo("square", 1.0, 0.0, 20, 30.0)
        assert val == 0.0


class TestLFOSaw:
    def test_saw_ramp(self):
        """Saw ramps linearly from 0 to 1 over one cycle."""
        val_start, _ = evaluate_lfo("saw", 1.0, 0.0, 0, 30.0)
        val_mid, _ = evaluate_lfo("saw", 1.0, 0.0, 15, 30.0)
        assert val_start < 0.05
        assert abs(val_mid - 0.5) < 0.05


class TestLFOTriangle:
    def test_triangle_symmetric(self):
        """Triangle: 0→1→0 symmetric. Peak at phase 0.5 (frame 15)."""
        val_start, _ = evaluate_lfo("triangle", 1.0, 0.0, 0, 30.0)
        val_peak, _ = evaluate_lfo("triangle", 1.0, 0.0, 15, 30.0)
        val_end, _ = evaluate_lfo("triangle", 1.0, 0.0, 29, 30.0)
        assert val_start < 0.1
        assert val_peak == 1.0
        assert val_end < 0.1


class TestLFOPhaseOffset:
    def test_phase_offset_shifts_waveform(self):
        """Phase offset should shift the waveform."""
        val_no_offset, _ = evaluate_lfo("sine", 1.0, 0.0, 0, 30.0)
        val_with_offset, _ = evaluate_lfo("sine", 1.0, math.pi / 2, 0, 30.0)
        assert abs(val_no_offset - val_with_offset) > 0.3


class TestLFOEdgeCases:
    def test_extreme_low_rate(self):
        """Very low rate should not crash."""
        val, _ = evaluate_lfo("sine", 0.01, 0.0, 0, 30.0)
        assert 0.0 <= val <= 1.0

    def test_extreme_high_rate(self):
        """Very high rate should not crash."""
        val, _ = evaluate_lfo("sine", 50.0, 0.0, 0, 30.0)
        assert 0.0 <= val <= 1.0

    def test_nan_rate_returns_zero(self):
        val, _ = evaluate_lfo("sine", float("nan"), 0.0, 0, 30.0)
        assert val == 0.0

    def test_zero_rate_returns_zero(self):
        val, _ = evaluate_lfo("sine", 0.0, 0.0, 0, 30.0)
        assert val == 0.0


class TestLFORandom:
    def test_random_same_within_cycle(self):
        """Random waveform holds same value within one cycle."""
        _, state1 = evaluate_lfo("random", 1.0, 0.0, 0, 30.0)
        val1, _ = evaluate_lfo("random", 1.0, 0.0, 0, 30.0, state1)
        val2, _ = evaluate_lfo("random", 1.0, 0.0, 5, 30.0, state1)
        # Both in cycle 0, should be same
        assert val1 == val2

    def test_random_different_per_cycle(self):
        """Random waveform changes each cycle."""
        val0, state0 = evaluate_lfo("random", 1.0, 0.0, 0, 30.0)
        val1, _ = evaluate_lfo("random", 1.0, 0.0, 30, 30.0, state0)
        # Different cycles — values should differ (deterministic but different)
        assert val0 != val1


class TestLFOSampleHold:
    def test_sh_holds_per_cycle(self):
        """S&H holds value for duration of cycle."""
        val0, state0 = evaluate_lfo("sample_hold", 1.0, 0.0, 0, 30.0)
        val1, _ = evaluate_lfo("sample_hold", 1.0, 0.0, 10, 30.0, state0)
        assert val0 == val1


class TestLFONoise:
    def test_noise_varies_per_frame(self):
        """Noise should produce different values per frame."""
        val0, _ = evaluate_lfo("noise", 1.0, 0.0, 0, 30.0)
        val1, _ = evaluate_lfo("noise", 1.0, 0.0, 1, 30.0)
        assert val0 != val1
