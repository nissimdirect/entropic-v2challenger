"""Histogram Equalize — reveals hidden detail in over/underexposed footage."""

import cv2
import numpy as np

EFFECT_ID = "fx.histogram_eq"
EFFECT_NAME = "Histogram EQ"
EFFECT_CATEGORY = "enhance"

PARAMS: dict = {
    "strength": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 1.0,
        "label": "Strength",
        "curve": "linear",
        "unit": "%",
        "description": "Blend between original and equalized",
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
    """Equalize histogram per channel — reveals hidden detail."""
    strength = max(0.0, min(1.0, float(params.get("strength", 1.0))))

    output = frame.copy()
    for i in range(3):
        output[:, :, i] = cv2.equalizeHist(frame[:, :, i])

    if strength < 1.0:
        blended = (
            frame.astype(np.float32) * (1.0 - strength)
            + output.astype(np.float32) * strength
        )
        output = np.clip(blended, 0, 255).astype(np.uint8)

    return output, None
