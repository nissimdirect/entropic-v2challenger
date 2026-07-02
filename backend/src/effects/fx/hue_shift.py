"""Hue Shift effect — rotates the hue wheel in HSV space.

Uses cv2.cvtColor for HSV conversion (C-optimized).
At 1080p: manual numpy ~232ms -> cv2 ~15ms (15x speedup).
"""

import cv2
import numpy as np

EFFECT_ID = "fx.hue_shift"
EFFECT_NAME = "Hue Shift"
EFFECT_CATEGORY = "color"

PARAMS: dict = {
    "amount": {
        "type": "float",
        "min": 0.0,
        "max": 360.0,
        "default": 180.0,
        "label": "Hue Rotation",
        "curve": "linear",
        "unit": "\u00b0",
        "description": "Hue rotation in degrees around the color wheel",
    }
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
    """Rotate hue by N degrees using cv2 HSV conversion. Stateless."""
    amount = max(0.0, min(360.0, float(params.get("amount", 180.0))))
    output = frame.copy()

    # cv2 HSV: H is 0-180 (half-degree), S and V are 0-255
    hsv = cv2.cvtColor(output[:, :, :3], cv2.COLOR_RGB2HSV)
    hsv[:, :, 0] = ((hsv[:, :, 0].astype(np.int16) + int(amount / 2)) % 180).astype(
        np.uint8
    )
    output[:, :, :3] = cv2.cvtColor(hsv, cv2.COLOR_HSV2RGB)

    return output, None
