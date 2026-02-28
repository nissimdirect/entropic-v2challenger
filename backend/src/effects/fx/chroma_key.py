"""Chroma Key — green screen / color-based keying to transparency."""

import cv2
import numpy as np

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
    """Chroma key — make a specific hue range transparent."""
    hue = float(params.get("hue", 120.0)) % 360
    tolerance = max(1.0, min(180.0, float(params.get("tolerance", 30.0))))
    softness = max(0.0, min(50.0, float(params.get("softness", 10.0))))

    rgb = frame[:, :, :3]
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)

    h_center = hue / 2.0
    h_low = (h_center - tolerance / 2.0) % 180
    h_high = (h_center + tolerance / 2.0) % 180

    h = hsv[:, :, 0].astype(np.float32)
    s = hsv[:, :, 1].astype(np.float32)

    if h_low < h_high:
        hue_mask = (h >= h_low) & (h <= h_high)
    else:
        hue_mask = (h >= h_low) | (h <= h_high)

    sat_mask = s > 30
    mask = (hue_mask & sat_mask).astype(np.float32)

    if softness > 0:
        ksize = int(softness * 2) | 1
        mask = cv2.GaussianBlur(mask, (ksize, ksize), 0)

    new_alpha = ((1.0 - mask) * 255).astype(np.uint8)
    output = np.concatenate([rgb, new_alpha[:, :, np.newaxis]], axis=2)
    return output, None
