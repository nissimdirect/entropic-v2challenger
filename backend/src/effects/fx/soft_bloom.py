"""Soft Bloom — dreamy glow from bright areas bleeding outward."""

import cv2
import numpy as np

EFFECT_ID = "fx.soft_bloom"
EFFECT_NAME = "Soft Bloom"
EFFECT_CATEGORY = "whimsy"

PARAMS: dict = {
    "radius": {
        "type": "int",
        "min": 3,
        "max": 50,
        "default": 15,
        "label": "Radius",
        "curve": "exponential",
        "unit": "px",
        "description": "Bloom glow radius",
    },
    "intensity": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.6,
        "label": "Intensity",
        "curve": "exponential",
        "unit": "%",
        "description": "Bloom brightness",
    },
    "threshold": {
        "type": "int",
        "min": 50,
        "max": 250,
        "default": 180,
        "label": "Threshold",
        "curve": "linear",
        "unit": "",
        "description": "Brightness cutoff for bloom source",
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
    """Soft bloom — bright areas bleed soft light outward."""
    radius = max(3, min(50, int(params.get("radius", 15))))
    intensity = max(0.0, min(1.0, float(params.get("intensity", 0.6))))
    threshold = max(50, min(250, int(params.get("threshold", 180))))

    rgb = frame[:, :, :3]
    alpha = frame[:, :, 3:4]

    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    _, bright_mask = cv2.threshold(gray, threshold, 255, cv2.THRESH_BINARY)
    bright_mask_3 = cv2.merge([bright_mask] * 3)

    bloom = cv2.bitwise_and(rgb, bright_mask_3)

    ksize = max(3, radius * 2 + 1)
    if ksize % 2 == 0:
        ksize += 1
    bloom = cv2.GaussianBlur(bloom, (ksize, ksize), 0)

    result = np.clip(
        rgb.astype(np.float32) + bloom.astype(np.float32) * intensity,
        0,
        255,
    ).astype(np.uint8)

    output = np.concatenate([result, alpha], axis=2)
    return output, None
