"""Median Filter — watercolor/noise reduction effect."""

import numpy as np
from PIL import Image, ImageFilter

EFFECT_ID = "fx.median_filter"
EFFECT_NAME = "Median Filter"
EFFECT_CATEGORY = "enhance"

PARAMS: dict = {
    "size": {
        "type": "int",
        "min": 3,
        "max": 15,
        "default": 5,
        "label": "Size",
        "curve": "linear",
        "unit": "px",
        "description": "Filter kernel size (odd, 3-15). Larger = more painted",
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
    """Median filter — painted look at large sizes, noise reduction at small."""
    size = max(3, min(15, int(params.get("size", 5))))
    if size % 2 == 0:
        size += 1

    rgb = frame[:, :, :3]
    alpha = frame[:, :, 3:4]

    img = Image.fromarray(rgb)
    result_rgb = np.array(img.filter(ImageFilter.MedianFilter(size=size)))

    output = np.concatenate([result_rgb, alpha], axis=2)
    return output, None
