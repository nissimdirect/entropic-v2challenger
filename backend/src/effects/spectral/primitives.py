"""A4 Spectral primitive dispatcher (PR #17).

`warp_frame(frame, primitive, params, transform='auto')` applies one
of the six spectral primitives. The actual DSP lives in dct_warper.py
or fft_warper.py based on the chosen transform.

Frames are HxWx3 uint8. Each color channel is transformed independently.
For Y-axis spectral effects, the frame is transposed before transform.
"""

from __future__ import annotations

from typing import Literal

import numpy as np

SUPPORTED_PRIMITIVES = (
    "shift",
    "comb",
    "smear",
    "formant",
    "parity",
    "inversion",
)
SUPPORTED_TRANSFORMS = ("dct", "fft", "auto")

PrimitiveName = Literal["shift", "comb", "smear", "formant", "parity", "inversion"]
TransformName = Literal["dct", "fft", "auto"]


class SpectralWarpError(Exception):
    """Raised for invalid primitive / transform / frame shape."""


def _validate_frame(frame: np.ndarray) -> None:
    if frame.ndim != 3 or frame.shape[2] != 3:
        raise SpectralWarpError(f"frame must be HxWx3 (got shape {frame.shape})")
    if frame.dtype != np.uint8:
        raise SpectralWarpError(f"frame must be uint8 (got {frame.dtype})")


def warp_frame(
    frame: np.ndarray,
    primitive: PrimitiveName,
    params: dict | None = None,
    transform: TransformName = "auto",
) -> np.ndarray:
    """Apply a spectral primitive to a frame.

    Parameters
    ----------
    frame : np.ndarray
        HxWx3 uint8 BGR frame
    primitive : str
        One of `SUPPORTED_PRIMITIVES`
    params : dict | None
        Primitive-specific parameters (see each primitive's docstring)
    transform : str
        'dct' (default — fast, real-valued, used for image compression),
        'fft' (complex spectrum; reveals phase info), or
        'auto' (picks DCT for performance)

    Returns
    -------
    np.ndarray
        HxWx3 uint8 frame of the same shape as input
    """
    _validate_frame(frame)
    if primitive not in SUPPORTED_PRIMITIVES:
        raise SpectralWarpError(
            f"unknown primitive {primitive!r}; supported: {SUPPORTED_PRIMITIVES}"
        )
    if transform not in SUPPORTED_TRANSFORMS:
        raise SpectralWarpError(
            f"unknown transform {transform!r}; supported: {SUPPORTED_TRANSFORMS}"
        )

    resolved_transform = "dct" if transform == "auto" else transform
    if resolved_transform == "dct":
        from .dct_warper import dct_warp

        return dct_warp(frame, primitive, params or {})
    from .fft_warper import fft_warp

    return fft_warp(frame, primitive, params or {})
