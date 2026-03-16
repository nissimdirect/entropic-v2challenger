"""Tests for audio follower operator."""

import numpy as np

from modulation.audio_follower import evaluate_audio


class TestRMS:
    def test_silence_returns_zero(self):
        pcm = np.zeros(1024, dtype=np.float32)
        val, _ = evaluate_audio(pcm, "rms", {}, 44100)
        assert val == 0.0

    def test_full_scale_sine(self):
        """Full-scale sine RMS should be ~0.707 * sensitivity."""
        t = np.linspace(0, 1, 44100, dtype=np.float32)
        pcm = np.sin(2 * np.pi * 440 * t).astype(np.float32)
        val, _ = evaluate_audio(pcm, "rms", {"sensitivity": 1.4}, 44100)
        # 0.707 * 1.4 ≈ 0.99
        assert val > 0.9

    def test_none_pcm_returns_zero(self):
        val, _ = evaluate_audio(None, "rms", {}, 44100)
        assert val == 0.0

    def test_empty_pcm_returns_zero(self):
        val, _ = evaluate_audio(np.array([], dtype=np.float32), "rms", {}, 44100)
        assert val == 0.0


class TestFrequencyBand:
    def test_440hz_in_band(self):
        """440Hz sine should have high energy in [400, 500] band."""
        t = np.linspace(0, 1, 44100, dtype=np.float32)
        pcm = np.sin(2 * np.pi * 440 * t).astype(np.float32)
        val, _ = evaluate_audio(
            pcm,
            "frequency_band",
            {"low_hz": 400, "high_hz": 500, "sensitivity": 4.0},
            44100,
        )
        assert val > 0.5

    def test_440hz_out_of_band(self):
        """440Hz sine should have low energy in [1000, 2000] band."""
        t = np.linspace(0, 1, 44100, dtype=np.float32)
        pcm = np.sin(2 * np.pi * 440 * t).astype(np.float32)
        val, _ = evaluate_audio(
            pcm,
            "frequency_band",
            {"low_hz": 1000, "high_hz": 2000, "sensitivity": 4.0},
            44100,
        )
        assert val < 0.1


class TestOnset:
    def test_transient_detected(self):
        """Sudden transient after silence should produce onset signal."""
        silence = np.zeros(1024, dtype=np.float32)
        state = {}
        # First frame: silence (baseline)
        _, state = evaluate_audio(
            silence, "onset", {"sensitivity": 0.1, "threshold": 0.0}, 44100, state
        )

        # Second frame: loud transient
        transient = np.random.randn(1024).astype(np.float32)
        val, _ = evaluate_audio(
            transient, "onset", {"sensitivity": 0.1, "threshold": 0.0}, 44100, state
        )
        assert val > 0.0

    def test_no_prev_returns_zero(self):
        """First call (no previous spectrum) returns 0."""
        pcm = np.random.randn(1024).astype(np.float32)
        val, _ = evaluate_audio(pcm, "onset", {}, 44100)
        assert val == 0.0
