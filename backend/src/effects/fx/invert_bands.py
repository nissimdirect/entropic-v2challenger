"""Invert Bands — alternating row/column inversion, CRT/VHS damage simulation."""

import numpy as np

EFFECT_ID = "fx.invert_bands"
EFFECT_NAME = "Invert Bands"
EFFECT_CATEGORY = "destruction"

PARAMS: dict = {
    "band_height": {
        "type": "int",
        "min": 2,
        "max": 100,
        "default": 10,
        "label": "Band Height",
        "curve": "linear",
        "unit": "px",
        "description": "Size of each band in pixels",
    },
    "offset": {
        "type": "int",
        "min": 0,
        "max": 200,
        "default": 0,
        "label": "Offset",
        "curve": "linear",
        "unit": "px",
        "description": "Band position offset",
    },
    "direction": {
        "type": "choice",
        "options": ["horizontal", "vertical"],
        "default": "horizontal",
        "label": "Direction",
        "description": "Band orientation",
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
    """Invert alternating bands — CRT/VHS damage simulation."""
    band_height = max(2, min(100, int(params.get("band_height", 10))))
    offset = int(params.get("offset", 0))
    direction = str(params.get("direction", "horizontal"))

    result = frame.copy()
    h, w = frame.shape[:2]
    anim_offset = (offset + frame_index * 2) % (band_height * 2)

    if direction == "vertical":
        for x in range(0, w, band_height * 2):
            start = (x + anim_offset) % w
            end = min(start + band_height, w)
            result[:, start:end, :3] = 255 - result[:, start:end, :3]
    else:
        for y in range(0, h, band_height * 2):
            start = (y + anim_offset) % h
            end = min(start + band_height, h)
            result[start:end, :, :3] = 255 - result[start:end, :, :3]

    return result, None
