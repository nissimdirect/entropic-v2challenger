"""Shared adapter that turns an A4 spectral primitive into a registered effect.

The A4 core (`effects.spectral.warp_frame`) operates on HxWx3 uint8 frames.
Registered effects in this app receive HxWx4 RGBA uint8 frames and must follow
the pure-function contract:

    apply(frame, params, state_in=None, *, frame_index, seed, resolution)
        -> (output, state_out)

This module provides `make_apply(primitive)` which returns a contract-conforming
`apply` callable for a single spectral primitive. The wrapper:
  * splits RGB from alpha, runs the primitive on RGB, re-attaches alpha,
  * threads the `transform` param ('dct' default | 'fft' opt-in) through,
  * forwards primitive-specific params (e.g. dy/dx, period, kernel, tilt, sign),
  * is stateless (returns state_out=None) — recursive F-modulation is a
    documented deferred gap (SPEC-7 §2.6), not wired here.
"""

from __future__ import annotations

import numpy as np

from .primitives import warp_frame

# Params common to every spectral effect: which basis to transform in.
TRANSFORM_PARAM = {
    "transform": {
        "type": "enum",
        "options": ["dct", "fft"],
        "default": "dct",
        "label": "Transform",
        "curve": "linear",
        "unit": "",
        "description": "Spectral basis: DCT (fast, real) or FFT (complex, phase-aware)",
    }
}


def _passthrough_keys(params: dict, keys: tuple[str, ...]) -> dict:
    """Collect only the primitive-specific params that are present + non-None."""
    out: dict = {}
    for k in keys:
        if k in params and params[k] is not None:
            out[k] = params[k]
    return out


def make_apply(primitive: str, primitive_param_keys: tuple[str, ...]):
    """Build a contract-conforming `apply` for one A4 primitive."""

    def apply(
        frame: np.ndarray,
        params: dict,
        state_in: dict | None = None,
        *,
        frame_index: int,
        seed: int,
        resolution: tuple[int, int],
    ) -> tuple[np.ndarray, dict | None]:
        transform = params.get("transform", "dct")
        if transform not in ("dct", "fft"):
            transform = "dct"

        prim_params = _passthrough_keys(params, primitive_param_keys)

        rgb = np.ascontiguousarray(frame[:, :, :3])
        warped_rgb = warp_frame(rgb, primitive, prim_params, transform=transform)

        output = frame.copy()
        output[:, :, :3] = warped_rgb
        return output, None

    apply.__name__ = f"apply_spectral_{primitive}"
    apply.__doc__ = f"A4 spectral '{primitive}' primitive as a registered effect."
    return apply
