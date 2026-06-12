"""Chroma Key — green screen / color-based keying to transparency.

MK.8: the keying math lives in ``masking.key_kernels`` (single source of truth,
SPEC §13-5). This effect is a thin adapter that maps PARAMS → the kernel and
writes the result into the alpha channel. The ``spill`` param (default 0) adds
spill suppression; at spill=0 the output is byte-identical to the pre-refactor
effect (back-compat golden ``test_spill_zero_matches_legacy_effect_output``).
"""

import numpy as np

from masking.key_kernels import chroma_alpha

EFFECT_ID = "fx.chroma_key"
EFFECT_NAME = "Chroma Key"
EFFECT_CATEGORY = "key"

PARAMS: dict = {
    "hue": {
        "type": "float",
        "min": 0.0,
        "max": 360.0,
        "default": 120.0,
        "label": "Hue",
        "curve": "linear",
        "unit": "deg",
        "description": "Target hue in degrees (120=green, 0=red, 240=blue)",
    },
    "tolerance": {
        "type": "float",
        "min": 1.0,
        "max": 180.0,
        "default": 30.0,
        "label": "Tolerance",
        "curve": "linear",
        "unit": "deg",
        "description": "Hue range to key out",
    },
    "softness": {
        "type": "float",
        "min": 0.0,
        "max": 50.0,
        "default": 10.0,
        "label": "Softness",
        "curve": "linear",
        "unit": "px",
        "description": "Edge feathering amount",
    },
    "spill": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.0,
        "label": "Spill",
        "curve": "linear",
        "unit": "",
        "description": "Spill suppression: desaturate key-colour fringe toward "
        "luma (0 = off, legacy behavior)",
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
    """Chroma key — make a specific hue range transparent.

    Single source of truth: ``masking.key_kernels.chroma_alpha`` (MK.8).
    At ``spill=0`` (default) this is byte-identical to the pre-refactor effect.
    """
    rgb = frame[:, :, :3]

    # Kernel finite-guards + clamps every param internally; pass raw values.
    alpha_f01, rgb_out = chroma_alpha(
        rgb,
        params.get("hue", 120.0),
        params.get("tolerance", 30.0),
        params.get("softness", 10.0),
        params.get("spill", 0.0),
    )

    new_alpha = (alpha_f01 * 255).astype(np.uint8)
    # Multiply with incoming alpha so upstream transparency is preserved
    incoming_alpha = frame[:, :, 3]
    combined_alpha = np.minimum(new_alpha, incoming_alpha)
    output = np.concatenate([rgb_out, combined_alpha[:, :, np.newaxis]], axis=2)
    return output, None
