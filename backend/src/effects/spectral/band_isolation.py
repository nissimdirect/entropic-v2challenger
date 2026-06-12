"""C4 Spectral-Band-Isolated Effects (SPEC-7 §C4).

Wraps A4 primitives so each can be applied to a specific frequency band
only. Builds on PR #17's `effects.spectral` module.

Use cases:
- Apply spectral shift to high frequencies only (preserves low-freq color)
- Smear only mid-band (preserves edges)
- Comb only the DC component cluster (rhythmic exposure modulation)

The band mask is built in spectrum-space coordinates: `low_bin` and
`high_bin` are integers in [0, max(H, W)) defining the radial range
that gets warped. Outside this band, the original spectrum passes through.
"""

from __future__ import annotations

from typing import Literal

import numpy as np

from .primitives import (
    SUPPORTED_PRIMITIVES,
    PrimitiveName,
    TransformName,
    SpectralWarpError,
    _validate_frame,
)


def _radial_mask(h: int, w: int, low_bin: int, high_bin: int) -> np.ndarray:
    """Build a binary mask over the spectrum: 1 inside [low_bin, high_bin]."""
    if low_bin < 0 or high_bin <= low_bin:
        raise SpectralWarpError(
            f"invalid band: low_bin={low_bin}, high_bin={high_bin}; "
            "require 0 <= low_bin < high_bin"
        )
    max_bin = max(h, w)
    if high_bin > max_bin:
        raise SpectralWarpError(
            f"high_bin={high_bin} exceeds spectrum extent {max_bin}"
        )
    yy = np.arange(h)[:, None]
    xx = np.arange(w)[None, :]
    radial = np.sqrt(yy**2 + xx**2)
    return ((radial >= low_bin) & (radial < high_bin)).astype(np.float32)


def bandwise_warp(
    frame: np.ndarray,
    primitive: PrimitiveName,
    low_bin: int,
    high_bin: int,
    params: dict | None = None,
    transform: TransformName = "dct",
) -> np.ndarray:
    """Apply A4 primitive to a radial spectral band only.

    Parameters
    ----------
    frame : np.ndarray
        HxWx3 uint8
    primitive : str
        One of SUPPORTED_PRIMITIVES (from PR #17 A4)
    low_bin, high_bin : int
        Radial band [low, high) in spectrum-space; bins outside this
        pass through unchanged
    params : dict | None
        Primitive-specific params (see primitives.py)
    transform : str
        'dct' (default) or 'fft' — only DCT supported in PR #18 (FFT
        band-isolation has tricky symmetry constraints; deferred)
    """
    _validate_frame(frame)
    if primitive not in SUPPORTED_PRIMITIVES:
        raise SpectralWarpError(
            f"unknown primitive {primitive!r}; supported: {SUPPORTED_PRIMITIVES}"
        )
    if transform != "dct":
        raise SpectralWarpError(
            f"band-isolation supports transform='dct' only in PR #18; got {transform!r}. "
            "FFT band-isolation requires symmetric mask handling — deferred."
        )

    params = params or {}
    h, w, _ = frame.shape
    mask = _radial_mask(h, w, low_bin, high_bin)

    try:
        from scipy.fft import dctn, idctn
    except ImportError as exc:  # pragma: no cover
        raise RuntimeError("DCT band-isolation needs scipy") from exc

    from .dct_warper import _PRIMITIVE_DISPATCH

    primitive_fn = _PRIMITIVE_DISPATCH[primitive]
    out = np.zeros_like(frame)

    for c in range(3):
        ch = frame[:, :, c].astype(np.float32)
        spectrum = dctn(ch, norm="ortho")
        warped_full = primitive_fn(spectrum, h=h, w=w, **params)
        # Where mask=1, use warped; where mask=0, use original spectrum.
        merged = warped_full * mask + spectrum * (1.0 - mask)
        reconstructed = idctn(merged, norm="ortho")
        out[:, :, c] = np.clip(reconstructed, 0, 255).astype(np.uint8)
    return out


def split_into_bands(
    frame: np.ndarray, n_bands: int = 3, transform: TransformName = "dct"
) -> list[np.ndarray]:
    """Decompose a frame into n_bands frequency components.

    Returns a list of n_bands frames, each containing only the energy
    from one radial band. Sum should approximate the original frame.

    Useful for processing each band with a different effect, then
    recombining.
    """
    _validate_frame(frame)
    if transform != "dct":
        raise SpectralWarpError("split_into_bands supports DCT only in PR #18")
    if n_bands < 1:
        raise SpectralWarpError(f"n_bands must be >= 1, got {n_bands}")

    h, w, _ = frame.shape
    try:
        from scipy.fft import dctn, idctn
    except ImportError as exc:  # pragma: no cover
        raise RuntimeError("DCT band split needs scipy") from exc

    max_bin = max(h, w)
    edges = np.linspace(0, max_bin, n_bands + 1, dtype=int)

    bands: list[np.ndarray] = []
    for b in range(n_bands):
        low_bin = int(edges[b])
        high_bin = int(edges[b + 1])
        mask = _radial_mask(h, w, low_bin, high_bin)
        band_frame = np.zeros_like(frame)
        for c in range(3):
            ch = frame[:, :, c].astype(np.float32)
            spectrum = dctn(ch, norm="ortho")
            masked_spec = spectrum * mask
            recon = idctn(masked_spec, norm="ortho")
            band_frame[:, :, c] = np.clip(recon, 0, 255).astype(np.uint8)
        bands.append(band_frame)
    return bands
