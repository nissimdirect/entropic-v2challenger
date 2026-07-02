"""DCT-based A4 spectral primitives.

Each primitive operates on the 2D DCT of each color channel independently.
DCT-II + DCT-III inverse via scipy.fft.dctn. CPU reference; Metal kernel
ships in a later PR when GPU codegen lands.
"""

from __future__ import annotations

import numpy as np


def _per_channel_dct(frame: np.ndarray, primitive: str, params: dict) -> np.ndarray:
    """Apply DCT primitive to each color channel; recombine."""
    try:
        from scipy.fft import dctn, idctn
    except ImportError as exc:  # pragma: no cover
        raise RuntimeError(
            "DCT spectral warper needs scipy. Install via project pyproject.toml deps."
        ) from exc

    h, w, _ = frame.shape
    out = np.zeros_like(frame)
    primitive_fn = _PRIMITIVE_DISPATCH[primitive]

    for c in range(3):
        ch = frame[:, :, c].astype(np.float32)
        spectrum = dctn(ch, norm="ortho")
        warped = primitive_fn(spectrum, h=h, w=w, **params)
        reconstructed = idctn(warped, norm="ortho")
        out[:, :, c] = np.clip(reconstructed, 0, 255).astype(np.uint8)
    return out


def dct_warp(frame: np.ndarray, primitive: str, params: dict) -> np.ndarray:
    return _per_channel_dct(frame, primitive, params)


# ---------------------------------------------------------------------------
# Primitive implementations — each takes the 2D spectrum + h/w + params
# ---------------------------------------------------------------------------


def _shift(spectrum: np.ndarray, *, h: int, w: int, **params) -> np.ndarray:
    """Translate spectrum by (dy, dx) bins (default: 1, 1). Wraps around."""
    dy = int(params.get("dy", 1))
    dx = int(params.get("dx", 1))
    return np.roll(spectrum, shift=(dy, dx), axis=(0, 1))


def _comb(spectrum: np.ndarray, *, h: int, w: int, **params) -> np.ndarray:
    """Zero every Nth bin (default N=3) → rhythmic frequency dropouts."""
    n = max(2, int(params.get("period", 3)))
    out = spectrum.copy()
    # Zero out a row + column pattern
    out[::n, :] = 0
    out[:, ::n] = 0
    return out


def _smear(spectrum: np.ndarray, *, h: int, w: int, **params) -> np.ndarray:
    """Box-blur the spectrum (kernel default=3) — spectral smoothing."""
    k = max(1, int(params.get("kernel", 3)))
    if k == 1:
        return spectrum
    from scipy.ndimage import uniform_filter

    return uniform_filter(spectrum, size=k, mode="nearest")


def _formant(spectrum: np.ndarray, *, h: int, w: int, **params) -> np.ndarray:
    """Multiplicative envelope reshape — emphasizes low or high freqs.

    `tilt` > 0 boosts high freqs; tilt < 0 boosts low. Default: 0.5.
    """
    tilt = float(params.get("tilt", 0.5))
    yy = np.arange(h)[:, None] / max(h - 1, 1)
    xx = np.arange(w)[None, :] / max(w - 1, 1)
    radial = np.sqrt(yy**2 + xx**2)
    # Envelope: 1 + tilt*radial (low freqs at radial=0 → 1.0; high at radial=1 → 1+tilt)
    envelope = 1.0 + tilt * radial
    return spectrum * envelope


def _parity(spectrum: np.ndarray, *, h: int, w: int, **params) -> np.ndarray:
    """Negate every other bin (checkerboard pattern). Default sign = -1."""
    sign = float(params.get("sign", -1.0))
    yy = np.arange(h)[:, None]
    xx = np.arange(w)[None, :]
    mask = ((yy + xx) % 2 == 0).astype(np.float32)
    # mask=1 keeps; mask=0 multiplies by sign
    return spectrum * (mask + (1 - mask) * sign)


def _inversion(spectrum: np.ndarray, *, h: int, w: int, **params) -> np.ndarray:
    """Reverse spectrum axes → low freqs ↔ high freqs."""
    return spectrum[::-1, ::-1].copy()


_PRIMITIVE_DISPATCH = {
    "shift": _shift,
    "comb": _comb,
    "smear": _smear,
    "formant": _formant,
    "parity": _parity,
    "inversion": _inversion,
}
