"""C4 Spectral-Band-Isolated effect (SPEC-7 §C4) as a registered effect.

Wraps `effects.spectral.band_isolation.bandwise_warp` in the app's pure-function
effect contract, reusing the A4 RGBA-bridge idiom. Applies one A4 spectral
primitive to ONLY a radial frequency band; bins outside the band pass through
unchanged.

Bands are expressed as fractions of the spectrum extent (max(H, W)) so the
effect is resolution-independent: `low_frac` / `high_frac` in [0, 1]. A `mix`
param blends the band-isolated result back over the original frame.

CPU-only (numpy/scipy); no GPU/SG-1 resources.

DEFERRED (documented known-gaps, NOT built here):
  * "wrap ANY registered effect" generalization (only the 6 A4 primitives)
  * `band_isolated_multi` 5-parallel-stream variant
  * add / subtract recombine modes (only the band-mask blend)
  * FFT / wavelet basis (DCT only)
  * band-picker UI with perceptual labels (rough / mid / edge / smooth)
"""

from __future__ import annotations

import numpy as np

from .band_isolation import bandwise_warp
from .primitives import SUPPORTED_PRIMITIVES

EFFECT_ID = "fx.band_isolated"
EFFECT_NAME = "Band-Isolated Spectral"
EFFECT_CATEGORY = "spectral"

PARAMS: dict = {
    "primitive": {
        "type": "enum",
        "options": list(SUPPORTED_PRIMITIVES),
        "default": "smear",
        "label": "Primitive",
        "curve": "linear",
        "unit": "",
        "description": "A4 spectral primitive applied within the band",
    },
    "low_frac": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.2,
        "label": "Band Low",
        "curve": "linear",
        "unit": "",
        "description": "Lower edge of the affected radial band (fraction of Nyquist)",
    },
    "high_frac": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.4,
        "label": "Band High",
        "curve": "linear",
        "unit": "",
        "description": "Upper edge of the affected radial band (fraction of Nyquist)",
    },
    "mix": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 1.0,
        "label": "Mix",
        "curve": "linear",
        "unit": "",
        "description": "Blend of band-isolated result over the original (1 = full)",
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
    """Band-isolated spectral effect. Stateless (DCT-only; deferred per docstring)."""
    primitive = params.get("primitive", "smear")
    if primitive not in SUPPORTED_PRIMITIVES:
        primitive = "smear"

    low_frac = float(params.get("low_frac", 0.2))
    high_frac = float(params.get("high_frac", 0.4))
    low_frac = min(max(low_frac, 0.0), 1.0)
    high_frac = min(max(high_frac, 0.0), 1.0)
    mix = float(params.get("mix", 1.0))
    mix = min(max(mix, 0.0), 1.0)

    h, w = frame.shape[:2]
    max_bin = max(h, w)
    low_bin = int(round(low_frac * max_bin))
    high_bin = int(round(high_frac * max_bin))

    # Guard the band so bandwise_warp's preconditions hold: 0 <= low < high <= max.
    low_bin = max(0, min(low_bin, max_bin - 1))
    high_bin = max(low_bin + 1, min(high_bin, max_bin))

    rgb = np.ascontiguousarray(frame[:, :, :3])
    warped = bandwise_warp(rgb, primitive, low_bin, high_bin, transform="dct")

    if mix < 1.0:
        blended = rgb.astype(np.float32) * (1.0 - mix) + warped.astype(np.float32) * mix
        warped = np.clip(blended, 0, 255).astype(np.uint8)

    output = frame.copy()
    output[:, :, :3] = warped
    return output, None
