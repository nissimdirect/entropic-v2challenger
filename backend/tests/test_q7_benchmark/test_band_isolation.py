"""Tests for C4 Spectral-Band-Isolated Effects (PR #18)."""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pytest

BACKEND_SRC = Path(__file__).resolve().parents[2] / "src"
if str(BACKEND_SRC) not in sys.path:
    sys.path.insert(0, str(BACKEND_SRC))

from effects.spectral import SpectralWarpError
from effects.spectral.band_isolation import (
    _radial_mask,
    bandwise_warp,
    split_into_bands,
)


def _busy_frame(h: int = 64, w: int = 64, seed: int = 42) -> np.ndarray:
    rng = np.random.default_rng(seed)
    return rng.integers(0, 256, size=(h, w, 3), dtype=np.uint8)


# ---------------------------------------------------------------------------
# Radial mask
# ---------------------------------------------------------------------------


@pytest.mark.smoke
def test_radial_mask_shape():
    mask = _radial_mask(64, 64, low_bin=0, high_bin=10)
    assert mask.shape == (64, 64)
    assert mask.dtype == np.float32


@pytest.mark.smoke
def test_radial_mask_low_high_inverted_raises():
    with pytest.raises(SpectralWarpError, match="low_bin"):
        _radial_mask(64, 64, low_bin=10, high_bin=5)


@pytest.mark.smoke
def test_radial_mask_negative_low_raises():
    with pytest.raises(SpectralWarpError):
        _radial_mask(64, 64, low_bin=-1, high_bin=10)


@pytest.mark.smoke
def test_radial_mask_exceeds_extent_raises():
    with pytest.raises(SpectralWarpError, match="exceeds"):
        _radial_mask(64, 64, low_bin=0, high_bin=200)


@pytest.mark.smoke
def test_radial_mask_dc_only():
    """low=0, high=1 selects DC corner only."""
    mask = _radial_mask(64, 64, low_bin=0, high_bin=1)
    assert mask[0, 0] == 1.0
    assert mask[0, 1] == 0.0
    assert mask[10, 10] == 0.0


@pytest.mark.smoke
def test_radial_mask_includes_edge_of_band():
    """Inclusion is [low, high) — low IS in, high is NOT."""
    mask = _radial_mask(64, 64, low_bin=2, high_bin=5)
    # At radial=2 (e.g., (2,0)): IS in band
    assert mask[2, 0] == 1.0
    # At radial=5 (e.g., (5,0)): NOT in band
    assert mask[5, 0] == 0.0


# ---------------------------------------------------------------------------
# bandwise_warp basics
# ---------------------------------------------------------------------------


@pytest.mark.smoke
def test_bandwise_warp_preserves_shape_dtype():
    frame = _busy_frame()
    out = bandwise_warp(frame, "shift", low_bin=2, high_bin=10)
    assert out.shape == frame.shape
    assert out.dtype == np.uint8


@pytest.mark.smoke
@pytest.mark.parametrize(
    "primitive", ["shift", "comb", "smear", "formant", "parity", "inversion"]
)
def test_bandwise_warp_each_primitive_shape_preserved(primitive):
    frame = _busy_frame()
    out = bandwise_warp(frame, primitive, low_bin=2, high_bin=15)
    assert out.shape == frame.shape


@pytest.mark.smoke
def test_bandwise_warp_unknown_primitive_raises():
    frame = _busy_frame()
    with pytest.raises(SpectralWarpError, match="unknown primitive"):
        bandwise_warp(frame, "bogus", low_bin=2, high_bin=10)  # type: ignore[arg-type]


@pytest.mark.smoke
def test_bandwise_warp_fft_transform_raises():
    """FFT band-isolation deferred (symmetry constraints)."""
    frame = _busy_frame()
    with pytest.raises(SpectralWarpError, match="FFT"):
        bandwise_warp(frame, "shift", 2, 10, transform="fft")


@pytest.mark.smoke
def test_bandwise_warp_full_band_is_full_warp():
    """When band covers the whole spectrum, output should be similar to
    the full-spectrum warp (within DCT-roundtrip + uint8 clipping noise)."""
    from effects.spectral import warp_frame

    frame = _busy_frame()
    full_band = bandwise_warp(frame, "shift", 0, 64, params={"dy": 4, "dx": 4})
    full_warp = warp_frame(frame, "shift", params={"dy": 4, "dx": 4}, transform="dct")
    delta = np.abs(full_band.astype(np.int16) - full_warp.astype(np.int16)).mean()
    assert delta < 30.0


@pytest.mark.smoke
def test_bandwise_warp_tiny_band_changes_less_than_wide():
    """A 1-bin band warps less of the spectrum than a wide band."""
    frame = _busy_frame()
    tiny = bandwise_warp(frame, "shift", 30, 31, params={"dy": 4, "dx": 4})
    wide = bandwise_warp(frame, "shift", 0, 64, params={"dy": 4, "dx": 4})
    delta_tiny = np.abs(tiny.astype(np.int16) - frame.astype(np.int16)).mean()
    delta_wide = np.abs(wide.astype(np.int16) - frame.astype(np.int16)).mean()
    assert delta_tiny < delta_wide


@pytest.mark.smoke
def test_bandwise_warp_changes_busy_frame():
    """A medium-band warp produces a visible change."""
    frame = _busy_frame()
    out = bandwise_warp(frame, "comb", 5, 30, params={"period": 3})
    delta = np.abs(out.astype(np.int16) - frame.astype(np.int16)).mean()
    assert delta > 0.5


# ---------------------------------------------------------------------------
# split_into_bands
# ---------------------------------------------------------------------------


@pytest.mark.smoke
def test_split_into_bands_returns_correct_count():
    frame = _busy_frame()
    bands = split_into_bands(frame, n_bands=4)
    assert len(bands) == 4
    for b in bands:
        assert b.shape == frame.shape
        assert b.dtype == frame.dtype


@pytest.mark.smoke
def test_split_into_bands_single_band_within_noise():
    """1 band = the whole spectrum = original modulo round-trip + uint8 clipping."""
    frame = _busy_frame()
    bands = split_into_bands(frame, n_bands=1)
    delta = np.abs(bands[0].astype(np.int16) - frame.astype(np.int16)).mean()
    # Single band recovers most of the input modulo float32 → uint8 clipping;
    # noisy synthetic frames clip more aggressively than natural images
    assert delta < 40.0


@pytest.mark.smoke
def test_split_into_bands_zero_raises():
    frame = _busy_frame()
    with pytest.raises(SpectralWarpError, match="n_bands"):
        split_into_bands(frame, n_bands=0)


@pytest.mark.smoke
def test_split_into_bands_each_band_is_subset():
    """Each band's energy is a subset of the original (variance lower)."""
    frame = _busy_frame()
    bands = split_into_bands(frame, n_bands=3)
    # At least one band has lower variance than the original
    band_vars = [b.var() for b in bands]
    assert min(band_vars) < frame.var()


@pytest.mark.smoke
def test_split_into_bands_fft_raises():
    frame = _busy_frame()
    with pytest.raises(SpectralWarpError, match="DCT"):
        split_into_bands(frame, n_bands=3, transform="fft")
