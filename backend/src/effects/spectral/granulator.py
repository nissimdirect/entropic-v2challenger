"""A5 Spectral Granulator (SPEC-7 §A5).

Combines A1 granulator pattern with A4 spectral primitives. Each grain
is a rectangular slice of the spectrum; per-grain processing applies an
A4 primitive, then grains are recombined with optional overlap +
positional jitter.

Use cases:
- Granulate the spectrum and shift each grain by a small amount → glittery,
  spectrally-decorrelated outputs
- Apply different primitives to different grains → chaotic spectral collage
- Jitter grain positions → noise-like spectral texture
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

import numpy as np

from .primitives import (
    SUPPORTED_PRIMITIVES,
    PrimitiveName,
    SpectralWarpError,
    _validate_frame,
)


@dataclass(frozen=True)
class GrainConfig:
    """Parameters governing the grain decomposition."""

    grain_size: int = 16  # bins per grain (both dims)
    overlap: float = 0.0  # 0 = no overlap; 0.5 = 50% overlap
    jitter: float = 0.0  # 0 = no jitter; positive shifts grain origins randomly
    seed: int = 0  # RNG seed for jitter

    def validate(self) -> None:
        if self.grain_size < 1:
            raise SpectralWarpError(f"grain_size must be >= 1, got {self.grain_size}")
        if not 0.0 <= self.overlap < 1.0:
            raise SpectralWarpError(
                f"overlap must be in [0.0, 1.0), got {self.overlap}"
            )
        if self.jitter < 0.0:
            raise SpectralWarpError(f"jitter must be >= 0.0, got {self.jitter}")


def _grain_origins(h: int, w: int, config: GrainConfig) -> list[tuple[int, int]]:
    """Return (y, x) origins for grain windows. Handles overlap + jitter."""
    step = max(1, int(config.grain_size * (1.0 - config.overlap)))
    rng = np.random.default_rng(config.seed)
    origins: list[tuple[int, int]] = []
    max_y = h - config.grain_size
    max_x = w - config.grain_size
    if max_y < 0 or max_x < 0:
        raise SpectralWarpError(
            f"grain_size {config.grain_size} exceeds spectrum extent ({h}x{w})"
        )
    for y in range(0, max_y + 1, step):
        for x in range(0, max_x + 1, step):
            if config.jitter > 0.0:
                jy = int(rng.uniform(-config.jitter, config.jitter) * config.grain_size)
                jx = int(rng.uniform(-config.jitter, config.jitter) * config.grain_size)
                y_adj = int(np.clip(y + jy, 0, max_y))
                x_adj = int(np.clip(x + jx, 0, max_x))
                origins.append((y_adj, x_adj))
            else:
                origins.append((y, x))
    return origins


def granulate_spectrum(
    spectrum: np.ndarray,
    primitive: PrimitiveName,
    config: GrainConfig,
    params: dict | None = None,
) -> np.ndarray:
    """Process each grain with a primitive, then recombine via averaging.

    Where grains overlap, output = mean of per-grain warped values.
    Where no grain covers a bin, the original spectrum passes through.
    """
    params = params or {}
    if primitive not in SUPPORTED_PRIMITIVES:
        raise SpectralWarpError(
            f"unknown primitive {primitive!r}; supported: {SUPPORTED_PRIMITIVES}"
        )
    config.validate()

    from .dct_warper import _PRIMITIVE_DISPATCH

    primitive_fn = _PRIMITIVE_DISPATCH[primitive]
    h, w = spectrum.shape
    origins = _grain_origins(h, w, config)
    g = config.grain_size

    # Accumulator + count for overlapping grains
    accumulator = np.zeros_like(spectrum, dtype=np.float64)
    count = np.zeros_like(spectrum, dtype=np.float64)

    for y, x in origins:
        grain = spectrum[y : y + g, x : x + g]
        warped = primitive_fn(grain, h=g, w=g, **params)
        accumulator[y : y + g, x : x + g] += warped
        count[y : y + g, x : x + g] += 1.0

    # For bins covered by at least one grain: take mean; else passthrough
    out = np.where(count > 0, accumulator / np.maximum(count, 1.0), spectrum)
    return out.astype(spectrum.dtype)


def granulate_frame(
    frame: np.ndarray,
    primitive: PrimitiveName,
    config: GrainConfig | None = None,
    params: dict | None = None,
    transform: Literal["dct"] = "dct",
) -> np.ndarray:
    """Spectral granulator: granulate each channel's DCT independently."""
    _validate_frame(frame)
    config = config or GrainConfig()
    config.validate()
    if transform != "dct":
        raise SpectralWarpError("A5 granulator supports transform='dct' only in PR #19")

    try:
        from scipy.fft import dctn, idctn
    except ImportError as exc:  # pragma: no cover
        raise RuntimeError("A5 granulator needs scipy") from exc

    h, w, _ = frame.shape
    out = np.zeros_like(frame)
    for c in range(3):
        ch = frame[:, :, c].astype(np.float32)
        spectrum = dctn(ch, norm="ortho")
        warped_spec = granulate_spectrum(spectrum, primitive, config, params)
        reconstructed = idctn(warped_spec, norm="ortho")
        out[:, :, c] = np.clip(reconstructed, 0, 255).astype(np.uint8)
    return out
