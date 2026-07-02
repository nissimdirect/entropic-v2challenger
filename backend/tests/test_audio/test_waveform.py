"""Tests for waveform peak computation."""

import numpy as np
import pytest

from audio.waveform import compute_peaks


@pytest.mark.smoke
def test_stereo_peaks_shape():
    """Stereo PCM → correct shape (num_bins, channels, 2)."""
    samples = np.random.uniform(-1, 1, (44100, 2)).astype(np.float32)
    peaks = compute_peaks(samples, num_bins=400)
    assert peaks.shape == (400, 2, 2)
    assert peaks.dtype == np.float32


@pytest.mark.smoke
def test_mono_peaks_shape():
    """Mono PCM → correct shape (num_bins, 1, 2)."""
    samples = np.random.uniform(-1, 1, (22050, 1)).astype(np.float32)
    peaks = compute_peaks(samples, num_bins=200)
    assert peaks.shape == (200, 1, 2)


def test_peaks_bounded():
    """Peaks bounded within [-1, 1] for normalized input."""
    samples = np.random.uniform(-0.8, 0.8, (44100, 2)).astype(np.float32)
    peaks = compute_peaks(samples, num_bins=800)
    assert peaks[:, :, 0].min() >= -1.0
    assert peaks[:, :, 1].max() <= 1.0


def test_min_leq_max():
    """Min peak is always <= max peak for each bin."""
    samples = np.random.uniform(-1, 1, (44100, 2)).astype(np.float32)
    peaks = compute_peaks(samples, num_bins=500)
    assert np.all(peaks[:, :, 0] <= peaks[:, :, 1])


def test_different_resolutions():
    """Different num_bins produces different bin counts."""
    samples = np.random.uniform(-1, 1, (44100, 1)).astype(np.float32)
    peaks_200 = compute_peaks(samples, num_bins=200)
    peaks_800 = compute_peaks(samples, num_bins=800)
    assert peaks_200.shape[0] == 200
    assert peaks_800.shape[0] == 800


def test_empty_samples():
    """Empty samples → zeros."""
    samples = np.empty((0, 2), dtype=np.float32)
    peaks = compute_peaks(samples, num_bins=100)
    assert peaks.shape == (100, 2, 2)
    assert np.all(peaks == 0)


def test_fewer_samples_than_bins():
    """Fewer samples than bins → zero-padded output."""
    samples = np.array([[0.5, -0.3], [-0.2, 0.7]], dtype=np.float32)
    peaks = compute_peaks(samples, num_bins=10)
    assert peaks.shape == (10, 2, 2)
    # First two bins should have data, rest should be zero
    assert peaks[0, 0, 0] == pytest.approx(0.5)
    assert peaks[0, 0, 1] == pytest.approx(0.5)
    assert peaks[2, 0, 0] == 0.0
    assert peaks[2, 0, 1] == 0.0


def test_sine_wave_peaks():
    """Sine wave should produce expected peak range."""
    t = np.arange(44100, dtype=np.float32) / 44100
    sine = np.sin(2 * np.pi * 440 * t).reshape(-1, 1).astype(np.float32)
    peaks = compute_peaks(sine, num_bins=100)
    # Max peaks should be close to 1.0, min close to -1.0
    assert peaks[:, 0, 1].max() > 0.9
    assert peaks[:, 0, 0].min() < -0.9
