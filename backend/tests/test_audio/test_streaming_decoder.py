"""Tests for StreamingDecoder — lazy PyAV-based audio decoder."""

from __future__ import annotations

import math
import wave
from pathlib import Path

import numpy as np
import pytest

from audio.streaming_decoder import (
    PROJECT_CHANNELS,
    PROJECT_SAMPLE_RATE,
    StreamingDecoder,
)


# --- Fixtures ---


def _write_wav(
    path: Path, samples: np.ndarray, sample_rate: int, channels: int
) -> None:
    """Write float32 samples [-1, 1] (shape (N,) mono or (N, C)) as PCM s16 WAV."""
    if samples.ndim == 1:
        assert channels == 1
        pcm_samples = samples
    else:
        assert samples.shape[1] == channels
        pcm_samples = samples
    pcm = (np.clip(pcm_samples, -1.0, 1.0) * 32767).astype(np.int16)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(channels)
        w.setsampwidth(2)
        w.setframerate(sample_rate)
        w.writeframes(pcm.tobytes())


def _make_sine(
    duration_s: float, freq: float, rate: int, channels: int = 2
) -> np.ndarray:
    n = int(duration_s * rate)
    t = np.arange(n) / rate
    sig = (0.5 * np.sin(2 * np.pi * freq * t)).astype(np.float32)
    if channels == 1:
        return sig
    return np.stack([sig] * channels, axis=1)


@pytest.fixture
def sine_wav_48k_stereo(home_tmp_path):
    path = home_tmp_path / "sine_48k_stereo.wav"
    samples = _make_sine(0.5, 440.0, 48000, channels=2)
    _write_wav(path, samples, 48000, 2)
    return path


@pytest.fixture
def sine_wav_44_1k_stereo(home_tmp_path):
    path = home_tmp_path / "sine_44100_stereo.wav"
    samples = _make_sine(0.5, 440.0, 44100, channels=2)
    _write_wav(path, samples, 44100, 2)
    return path


@pytest.fixture
def sine_wav_8k_mono(home_tmp_path):
    path = home_tmp_path / "sine_8k_mono.wav"
    samples = _make_sine(0.5, 440.0, 8000, channels=1)
    _write_wav(path, samples, 8000, 1)
    return path


# --- Lifecycle ---


class TestLifecycle:
    def test_open_valid_wav(self, sine_wav_48k_stereo):
        d = StreamingDecoder(str(sine_wav_48k_stereo))
        assert not d.is_closed
        assert d.project_rate == PROJECT_SAMPLE_RATE
        d.close()

    def test_close_is_idempotent(self, sine_wav_48k_stereo):
        d = StreamingDecoder(str(sine_wav_48k_stereo))
        d.close()
        d.close()
        assert d.is_closed

    def test_context_manager(self, sine_wav_48k_stereo):
        with StreamingDecoder(str(sine_wav_48k_stereo)) as d:
            assert not d.is_closed
        assert d.is_closed

    def test_read_after_close_returns_silence(self, sine_wav_48k_stereo):
        d = StreamingDecoder(str(sine_wav_48k_stereo))
        d.close()
        out = d.read(0, 1024)
        assert out.shape == (1024, PROJECT_CHANNELS)
        assert np.all(out == 0)


# --- Output shape + dtype ---


class TestOutputShape:
    def test_read_returns_stereo_float32(self, sine_wav_48k_stereo):
        with StreamingDecoder(str(sine_wav_48k_stereo)) as d:
            out = d.read(0, 4800)  # 0.1s
            assert out.dtype == np.float32
            assert out.shape == (4800, 2)

    def test_read_zero_samples_returns_empty(self, sine_wav_48k_stereo):
        with StreamingDecoder(str(sine_wav_48k_stereo)) as d:
            out = d.read(0, 0)
            assert out.shape == (0, 2)


# --- Resample correctness ---


class TestResample:
    def test_44_1k_source_returns_48k(self, sine_wav_44_1k_stereo):
        """A 440 Hz sine at 44.1 kHz, read at project rate, should still carry 440 Hz energy."""
        with StreamingDecoder(str(sine_wav_44_1k_stereo)) as d:
            out = d.read(0, 4800)  # 0.1s at 48kHz
            # Rough check: FFT peak near 440 Hz
            mono = out.mean(axis=1)
            spectrum = np.abs(np.fft.rfft(mono))
            peak_bin = int(np.argmax(spectrum))
            peak_freq = peak_bin * (48000 / len(mono))
            assert abs(peak_freq - 440.0) < 20.0

    def test_8k_mono_upsamples_to_48k_stereo(self, sine_wav_8k_mono):
        """Source mono + 8 kHz → output stereo @ 48 kHz."""
        with StreamingDecoder(str(sine_wav_8k_mono)) as d:
            out = d.read(0, 4800)
            assert out.shape == (4800, 2)
            # Stereo channels should be identical (mono upmix)
            np.testing.assert_allclose(out[:, 0], out[:, 1], atol=1e-5)
            # Output is non-silent
            assert np.any(np.abs(out) > 0.01)


# --- Seek / EOF ---


class TestSeekAndEOF:
    def test_seek_past_eof_returns_silence(self, sine_wav_48k_stereo):
        """Fixture is 0.5s; reading at 10s should give silence."""
        with StreamingDecoder(str(sine_wav_48k_stereo)) as d:
            out = d.read(10.0, 1024)
            assert out.shape == (1024, 2)
            assert np.all(out == 0)

    def test_partial_read_at_eof(self, sine_wav_48k_stereo):
        """Reading across the end yields partial signal + silence tail."""
        with StreamingDecoder(str(sine_wav_48k_stereo)) as d:
            # Last 50ms of a 500ms file: read 100ms starting at 450ms
            out = d.read(0.45, 4800)
            # First half should have signal, second half silence-ish
            assert np.any(np.abs(out[:2400]) > 0.01)
            # Tail mostly silence
            tail_energy = np.abs(out[2400:]).mean()
            # Don't be too strict — a little padding/ringing is OK
            assert tail_energy < 0.05

    def test_seek_backward_re_reads(self, sine_wav_48k_stereo):
        """After reading forward, seeking back should return the original samples."""
        with StreamingDecoder(str(sine_wav_48k_stereo)) as d:
            first = d.read(0.0, 4800)
            _mid = d.read(0.3, 4800)
            back = d.read(0.0, 4800)
            # Signals from same offset should be nearly identical after re-seek
            # (allow small decode/seek drift)
            corr = np.corrcoef(first.mean(axis=1), back.mean(axis=1))[0, 1]
            assert corr > 0.95


# --- Error handling ---


class TestErrors:
    def test_nonexistent_file_raises(self, home_tmp_path):
        with pytest.raises(Exception):
            StreamingDecoder(str(home_tmp_path / "does-not-exist.wav"))

    def test_invalid_path_raises(self, home_tmp_path):
        # Create a fake file with random bytes; PyAV should reject
        f = home_tmp_path / "not-audio.wav"
        f.write_bytes(b"this is not a valid audio file" * 100)
        with pytest.raises(Exception):
            StreamingDecoder(str(f))

    def test_negative_offset_clamps_to_zero(self, sine_wav_48k_stereo):
        with StreamingDecoder(str(sine_wav_48k_stereo)) as d:
            out = d.read(-5.0, 1024)
            # Should not crash; reads from 0
            assert out.shape == (1024, 2)

    def test_nan_offset_clamps_to_zero(self, sine_wav_48k_stereo):
        with StreamingDecoder(str(sine_wav_48k_stereo)) as d:
            out = d.read(float("nan"), 1024)
            assert out.shape == (1024, 2)


# --- Amplitude sanity ---


class TestAmplitude:
    def test_sine_peak_below_1(self, sine_wav_48k_stereo):
        """0.5-amplitude sine should read back near 0.5 peak (no clipping)."""
        with StreamingDecoder(str(sine_wav_48k_stereo)) as d:
            out = d.read(0.1, 9600)
            peak = float(np.max(np.abs(out)))
            assert 0.3 < peak < 0.7  # int16 roundtrip tolerance

    def test_silence_stays_silent(self, home_tmp_path):
        # Write a silent WAV
        path = home_tmp_path / "silent.wav"
        samples = np.zeros(24000, dtype=np.float32)  # 0.5s mono
        _write_wav(path, samples, 48000, 1)
        with StreamingDecoder(str(path)) as d:
            out = d.read(0.0, 4800)
            assert np.max(np.abs(out)) < 0.001
