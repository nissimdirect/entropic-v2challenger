"""CLAHE — Contrast Limited Adaptive Histogram Equalization."""

import cv2
import numpy as np

EFFECT_ID = "fx.clahe"
EFFECT_NAME = "CLAHE"
EFFECT_CATEGORY = "enhance"

PARAMS: dict = {
    "clip_limit": {
        "type": "float",
        "min": 1.0,
        "max": 10.0,
        "default": 2.0,
        "label": "Clip Limit",
        "curve": "linear",
        "unit": "",
        "description": "Contrast limit — higher = more contrast",
    },
    "grid_size": {
        "type": "int",
        "min": 2,
        "max": 16,
        "default": 8,
        "label": "Grid Size",
        "curve": "linear",
        "unit": "px",
        "description": "Tile grid size — smaller = more local adaptation",
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
    """CLAHE — local contrast enhancement, night-vision quality."""
    clip_limit = max(1.0, min(10.0, float(params.get("clip_limit", 2.0))))
    grid_size = max(2, min(16, int(params.get("grid_size", 8))))

    cl = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=(grid_size, grid_size))
    output = frame.copy()
    for i in range(3):
        output[:, :, i] = cl.apply(frame[:, :, i])

    return output, None
