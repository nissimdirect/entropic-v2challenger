"""Infrared — simulate infrared film photography (Kodak Aerochrome look)."""

import numpy as np

EFFECT_ID = "fx.infrared"
EFFECT_NAME = "Infrared"
EFFECT_CATEGORY = "color"

PARAMS: dict = {
    "vegetation_glow": {
        "type": "float",
        "min": 0.0,
        "max": 2.0,
        "default": 1.0,
        "label": "Vegetation Glow",
        "curve": "linear",
        "unit": "%",
        "description": "How bright greens become (IR film response)",
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
    """Infrared film — greens glow white, sky darkens, reds shift to green."""
    vegetation_glow = max(0.0, min(2.0, float(params.get("vegetation_glow", 1.0))))

    rgb = frame[:, :, :3].astype(np.float32)
    alpha = frame[:, :, 3:4]

    r = np.clip(rgb[:, :, 1] * vegetation_glow + rgb[:, :, 0] * 0.3, 0, 255)
    g = np.clip(rgb[:, :, 0] * 0.8, 0, 255)
    b = np.clip(rgb[:, :, 2] * 0.3, 0, 255)

    result_rgb = np.stack([r, g, b], axis=2).astype(np.uint8)
    output = np.concatenate([result_rgb, alpha], axis=2)
    return output, None
