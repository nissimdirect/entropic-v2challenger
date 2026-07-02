"""Parallel Compression — blend original with heavily compressed version."""

import numpy as np

EFFECT_ID = "fx.parallel_compression"
EFFECT_NAME = "Parallel Compression"
EFFECT_CATEGORY = "enhance"

PARAMS: dict = {
    "crush": {
        "type": "float",
        "min": 0.1,
        "max": 1.0,
        "default": 0.5,
        "label": "Crush",
        "curve": "exponential",
        "unit": "",
        "description": "Gamma compression (lower = more crushed)",
    },
    "blend": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.5,
        "label": "Blend",
        "curve": "linear",
        "unit": "%",
        "description": "Mix between original and crushed",
    },
    "mode": {
        "type": "choice",
        "options": ["luminance", "per_channel", "saturation"],
        "default": "luminance",
        "label": "Mode",
        "description": "Compression target",
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
    """NY-style parallel compression for video — punch without losing dynamics."""
    crush = max(0.1, min(1.0, float(params.get("crush", 0.5))))
    blend = max(0.0, min(1.0, float(params.get("blend", 0.5))))
    mode = str(params.get("mode", "luminance"))

    f = frame[:, :, :3].astype(np.float32) / 255.0
    alpha = frame[:, :, 3:4]

    if mode == "per_channel":
        crushed = np.power(f, crush)
    elif mode == "saturation":
        gray = np.mean(f, axis=2, keepdims=True)
        diff = f - gray
        crushed = gray + diff * crush
    else:
        crushed = np.power(f, crush)

    result = f * (1.0 - blend) + crushed * blend
    result_rgb = np.clip(result * 255, 0, 255).astype(np.uint8)

    output = np.concatenate([result_rgb, alpha], axis=2)
    return output, None
