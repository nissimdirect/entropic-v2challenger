"""Tests for audio meter — RMS + peak + clipping math.

F-0516-6 (parallel-session UAT 2026-05-16). The meter is the math
backbone for the upcoming GainMeter component.
"""

from __future__ import annotations

import math

import numpy as np
import pytest

from audio.meter import (
    CLIP_THRESHOLD,
    METER_FLOOR_DB,
    compute_meter,
)

pytestmark = pytest.mark.smoke


def _sine(
    amplitude: float, samples: int = 4096, freq: float = 440.0, sr: int = 48000
) -> np.ndarray:
    t = np.arange(samples) / sr
    return (amplitude * np.sin(2 * np.pi * freq * t)).astype(np.float32)


class TestSilenceAndEmpty:
    def test_silence_returns_floor(self):
        reading = compute_meter(np.zeros(2048, dtype=np.float32))
        assert reading["rms_db"] == METER_FLOOR_DB
        assert reading["peak_db"] == METER_FLOOR_DB
        assert reading["clipped"] is False

    def test_empty_array_returns_floor(self):
        reading = compute_meter(np.array([], dtype=np.float32))
        assert reading["rms_db"] == METER_FLOOR_DB
        assert reading["peak_db"] == METER_FLOOR_DB
        assert reading["clipped"] is False

    def test_non_numeric_input_returns_floor_without_raising(self):
        reading = compute_meter("not-an-array")  # type: ignore[arg-type]
        assert reading["rms_db"] == METER_FLOOR_DB
        assert reading["clipped"] is False


class TestRmsAndPeak:
    def test_full_scale_sine_rms_is_minus_3_db(self):
        # A pure sine at amplitude 1.0 has RMS = 1/sqrt(2) ≈ 0.7071 → -3.01 dB.
        reading = compute_meter(_sine(1.0))
        assert math.isclose(reading["rms_db"], -3.01, abs_tol=0.05)
        assert math.isclose(reading["peak_db"], 0.0, abs_tol=0.05)
        # Sample peak at exactly 1.0 trips the clip threshold.
        assert reading["clipped"] is True

    def test_half_scale_sine_rms_is_minus_9_db(self):
        # amp 0.5 → RMS = 0.5 / sqrt(2) ≈ 0.3536 → -9.03 dB
        reading = compute_meter(_sine(0.5))
        assert math.isclose(reading["rms_db"], -9.03, abs_tol=0.05)
        assert math.isclose(reading["peak_db"], -6.02, abs_tol=0.05)
        assert reading["clipped"] is False

    def test_quarter_scale_sine_rms_is_minus_15_db(self):
        reading = compute_meter(_sine(0.25))
        assert math.isclose(reading["rms_db"], -15.05, abs_tol=0.1)
        assert math.isclose(reading["peak_db"], -12.04, abs_tol=0.1)
        assert reading["clipped"] is False


class TestClipping:
    def test_exact_full_scale_clips(self):
        pcm = np.array([0.0, 1.0, -0.5], dtype=np.float32)
        assert compute_meter(pcm)["clipped"] is True

    def test_just_below_full_scale_does_not_clip(self):
        pcm = np.array([0.0, CLIP_THRESHOLD - 1e-4, -0.5], dtype=np.float32)
        assert compute_meter(pcm)["clipped"] is False

    def test_negative_full_scale_also_clips(self):
        pcm = np.array([0.0, -1.0, 0.5], dtype=np.float32)
        assert compute_meter(pcm)["clipped"] is True

    def test_supra_full_scale_clips(self):
        # Encoder bugs or modulation runaway can produce >1.0 samples
        pcm = np.array([0.0, 1.5, -0.5], dtype=np.float32)
        assert compute_meter(pcm)["clipped"] is True


class TestRobustness:
    def test_multichannel_input_aggregates_correctly(self):
        # Two channels at different amplitudes; meter should report the
        # worst-case peak across both.
        ch_l = _sine(0.5).reshape(-1, 1)
        ch_r = _sine(0.9).reshape(-1, 1)
        pcm = np.hstack([ch_l, ch_r])
        reading = compute_meter(pcm)
        # Peak is dominated by 0.9 channel ≈ -0.92 dBFS
        assert math.isclose(reading["peak_db"], -0.92, abs_tol=0.1)
        assert reading["clipped"] is False

    def test_nan_samples_are_scrubbed_not_propagated(self):
        pcm = np.array([0.5, float("nan"), 0.5, float("inf"), -0.5], dtype=np.float32)
        reading = compute_meter(pcm)
        # NaN/Inf treated as 0 — does not crash, returns finite values.
        assert math.isfinite(reading["rms_db"])
        assert math.isfinite(reading["peak_db"])

    def test_floor_db_is_minus_120(self):
        # Documented floor for caller assumptions.
        assert METER_FLOOR_DB == -120.0

    def test_clip_threshold_is_unity(self):
        assert CLIP_THRESHOLD == 1.0
