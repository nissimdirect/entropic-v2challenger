"""Luma Key — make dark or bright areas transparent based on luminance.

MK.8: the keying math lives in ``masking.key_kernels`` (single source of truth,
SPEC §13-5). This effect is a thin adapter; output is byte-identical to the
pre-refactor effect (back-compat golden ``test_spill_zero_matches_legacy_effect_output``
sibling for luma).
"""

import numpy as np

from masking.key_kernels import luma_alpha

EFFECT_ID = "fx.luma_key"
EFFECT_NAME = "Luma Key"
EFFECT_CATEGORY = "key"

PARAMS: dict = {
    "threshold": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.3,
        "label": "Threshold",
        "curve": "linear",
        "unit": "%",
        "description": "Brightness cutoff (0-1)",
    },
    "mode": {
        "type": "choice",
        "options": ["dark", "bright"],
        "default": "dark",
        "label": "Mode",
        "description": "Key out dark or bright areas",
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
    """Luma key — make dark or bright areas transparent.

    Single source of truth: ``masking.key_kernels.luma_alpha`` (MK.8).
    Byte-identical to the pre-refactor effect.
    """
    rgb = frame[:, :, :3]

    # Kernel finite-guards + clamps every param internally; pass raw values.
    alpha_f01 = luma_alpha(
        rgb,
        params.get("threshold", 0.3),
        params.get("mode", "dark"),
        params.get("softness", 10.0),
    )

    new_alpha = (alpha_f01 * 255).astype(np.uint8)
    # Multiply with incoming alpha so upstream transparency is preserved
    incoming_alpha = frame[:, :, 3]
    combined_alpha = np.minimum(new_alpha, incoming_alpha)
    output = np.concatenate([rgb, combined_alpha[:, :, np.newaxis]], axis=2)
    return output, None
