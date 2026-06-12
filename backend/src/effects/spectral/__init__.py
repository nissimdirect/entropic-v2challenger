"""A4 Spectral Frame Warper package (PR #17).

Six primitives operating on frame DCT or FFT:
  shift, comb, smear, formant, parity, inversion

Per SPEC-7 §A4. Ships as Vision Tier 2 effect; uses SG-1 GPUResourcePool
when Metal lands (post PR #16).
"""

from .primitives import (
    SUPPORTED_PRIMITIVES,
    SUPPORTED_TRANSFORMS,
    SpectralWarpError,
    warp_frame,
)

__all__ = [
    "SUPPORTED_PRIMITIVES",
    "SUPPORTED_TRANSFORMS",
    "SpectralWarpError",
    "warp_frame",
]
