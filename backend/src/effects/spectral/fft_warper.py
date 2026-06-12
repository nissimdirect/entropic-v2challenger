"""FFT-based A4 spectral primitives (opt-in).

Complex spectrum — preserves phase. Heavier than DCT but reveals
oscillatory structure that DCT can hide. Used when `transform='fft'`.

For PR #17 the FFT primitives apply the same shape-level transformation
as their DCT counterparts but in complex space (the magnitude AND phase
get rolled, comb'd, etc.). Visually divergent from DCT — that's intended.
"""

from __future__ import annotations

import numpy as np


def fft_warp(frame: np.ndarray, primitive: str, params: dict) -> np.ndarray:
    h, w, _ = frame.shape
    out = np.zeros_like(frame)
    primitive_fn = _PRIMITIVE_DISPATCH[primitive]

    for c in range(3):
        ch = frame[:, :, c].astype(np.float32)
        spectrum = np.fft.fft2(ch)
        warped = primitive_fn(spectrum, h=h, w=w, **params)
        reconstructed = np.real(np.fft.ifft2(warped))
        out[:, :, c] = np.clip(reconstructed, 0, 255).astype(np.uint8)
    return out


def _shift(spectrum: np.ndarray, *, h: int, w: int, **params) -> np.ndarray:
    dy = int(params.get("dy", 1))
    dx = int(params.get("dx", 1))
    return np.roll(spectrum, shift=(dy, dx), axis=(0, 1))


def _comb(spectrum: np.ndarray, *, h: int, w: int, **params) -> np.ndarray:
    n = max(2, int(params.get("period", 3)))
    out = spectrum.copy()
    out[::n, :] = 0
    out[:, ::n] = 0
    return out


def _smear(spectrum: np.ndarray, *, h: int, w: int, **params) -> np.ndarray:
    k = max(1, int(params.get("kernel", 3)))
    if k == 1:
        return spectrum
    from scipy.ndimage import uniform_filter

    # Complex spectrum: filter real + imag separately
    real = uniform_filter(spectrum.real, size=k, mode="nearest")
    imag = uniform_filter(spectrum.imag, size=k, mode="nearest")
    return real + 1j * imag


def _formant(spectrum: np.ndarray, *, h: int, w: int, **params) -> np.ndarray:
    tilt = float(params.get("tilt", 0.5))
    yy = np.arange(h)[:, None] / max(h - 1, 1)
    xx = np.arange(w)[None, :] / max(w - 1, 1)
    radial = np.sqrt(yy**2 + xx**2)
    envelope = 1.0 + tilt * radial
    return spectrum * envelope


def _parity(spectrum: np.ndarray, *, h: int, w: int, **params) -> np.ndarray:
    sign = float(params.get("sign", -1.0))
    yy = np.arange(h)[:, None]
    xx = np.arange(w)[None, :]
    mask = ((yy + xx) % 2 == 0).astype(np.float32)
    return spectrum * (mask + (1 - mask) * sign)


def _inversion(spectrum: np.ndarray, *, h: int, w: int, **params) -> np.ndarray:
    return spectrum[::-1, ::-1].copy()


_PRIMITIVE_DISPATCH = {
    "shift": _shift,
    "comb": _comb,
    "smear": _smear,
    "formant": _formant,
    "parity": _parity,
    "inversion": _inversion,
}
