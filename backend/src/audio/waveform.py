"""Waveform peak computation from PCM audio data."""

import numpy as np


def compute_peaks(
    samples: np.ndarray,
    num_bins: int = 800,
) -> np.ndarray:
    """Downsample PCM audio to min/max peak pairs for waveform display.

    Args:
        samples: PCM float32 array of shape (num_samples, channels).
        num_bins: Number of output bins (width of waveform in pixels).

    Returns:
        np.ndarray of shape (num_bins, channels, 2) where [:, :, 0] = min, [:, :, 1] = max.
        Values are float32 in [-1, 1].
    """
    num_samples, channels = samples.shape

    if num_samples == 0:
        return np.zeros((num_bins, channels, 2), dtype=np.float32)

    # If fewer samples than bins, pad with zeros
    if num_samples < num_bins:
        peaks = np.zeros((num_bins, channels, 2), dtype=np.float32)
        for i in range(num_samples):
            for ch in range(channels):
                val = samples[i, ch]
                peaks[i, ch, 0] = val  # min
                peaks[i, ch, 1] = val  # max
        return peaks

    # Compute bin boundaries — evenly divide samples across bins
    bin_edges = np.linspace(0, num_samples, num_bins + 1, dtype=np.int64)

    peaks = np.empty((num_bins, channels, 2), dtype=np.float32)
    for i in range(num_bins):
        start = bin_edges[i]
        end = bin_edges[i + 1]
        if end <= start:
            end = start + 1
        chunk = samples[start:end]
        peaks[i, :, 0] = chunk.min(axis=0)
        peaks[i, :, 1] = chunk.max(axis=0)

    return peaks
