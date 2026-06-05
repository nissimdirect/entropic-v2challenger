"""A5 Spectral Granulator as a registered effect (SPEC-7 §A5).

Wraps `effects.spectral.granulator.granulate_frame` in the app's pure-function
effect contract, reusing the A4 RGBA-bridge idiom: split RGB from alpha, run the
spectral granulator on RGB, re-attach the original alpha.

The granulator slices each channel's DCT into overlapping grain windows, applies
an A4 primitive per grain, and recombines by averaging. CPU-only (numpy/scipy);
no GPU/SG-1 resources allocated.

DEFERRED (documented known-gaps, NOT built here):
  * identity-preservation-over-density curve (SPEC-7 §4.1 signature behaviour)
  * multi-frame grain sourcing (grains are single-frame spectrum tiles)
  * wavelet basis (DCT only)
  * shared UI with A1/B8 granulator
"""

from __future__ import annotations

import numpy as np

from .granulator import GrainConfig, granulate_frame
from .primitives import SUPPORTED_PRIMITIVES

EFFECT_ID = "fx.spectral_granulator"
EFFECT_NAME = "Spectral Granulator"
EFFECT_CATEGORY = "spectral"

PARAMS: dict = {
    "primitive": {
        "type": "enum",
        "options": list(SUPPORTED_PRIMITIVES),
        "default": "shift",
        "label": "Primitive",
        "curve": "linear",
        "unit": "",
        "description": "A4 spectral primitive applied per grain",
    },
    "grain_size": {
        "type": "int",
        "min": 2,
        "max": 64,
        "default": 16,
        "label": "Grain Size",
        "curve": "linear",
        "unit": "bins",
        "description": "Size (both dims) of each spectral grain window",
    },
    "overlap": {
        "type": "float",
        "min": 0.0,
        "max": 0.95,
        "default": 0.0,
        "label": "Overlap",
        "curve": "linear",
        "unit": "",
        "description": "Grain overlap fraction (0 = tiled, 0.5 = 50% overlap)",
    },
    "jitter": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.0,
        "label": "Jitter",
        "curve": "linear",
        "unit": "",
        "description": "Random grain-origin displacement (0 = aligned)",
    },
}


def apply(
    frame: np.ndarray,
    params: dict,
    state_in: dict | None = None,
    *,
    frame_index: int,
    seed: int,
    resolution: tuple[int, int],
) -> tuple[np.ndarray, dict | None]:
    """Spectral granulator effect. Stateless (deferred: identity-density curve)."""
    primitive = params.get("primitive", "shift")
    if primitive not in SUPPORTED_PRIMITIVES:
        primitive = "shift"

    grain_size = int(params.get("grain_size", 16))
    grain_size = max(2, min(64, grain_size))
    overlap = float(params.get("overlap", 0.0))
    overlap = min(max(overlap, 0.0), 0.95)
    jitter = float(params.get("jitter", 0.0))
    jitter = max(jitter, 0.0)

    h, w = frame.shape[:2]
    # Guard: a grain must fit within the frame's spectrum. The smallest viable
    # grain is 2x2; if the frame is smaller than that on either axis (e.g. the
    # 1x1 fuzz frame), no grain can tile it — passthrough unchanged.
    if h < 2 or w < 2:
        return frame.copy(), None
    grain_size = max(2, min(grain_size, h, w))

    config = GrainConfig(
        grain_size=grain_size,
        overlap=overlap,
        jitter=jitter,
        seed=int(seed),
    )

    rgb = np.ascontiguousarray(frame[:, :, :3])
    granulated = granulate_frame(rgb, primitive, config, transform="dct")

    output = frame.copy()
    output[:, :, :3] = granulated
    return output, None
