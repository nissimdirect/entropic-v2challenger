"""Duotone — map grayscale to a two-color gradient."""

import numpy as np
from PIL import Image, ImageOps

EFFECT_ID = "fx.duotone"
EFFECT_NAME = "Duotone"
EFFECT_CATEGORY = "enhance"

PARAMS: dict = {
    "shadow_r": {
        "type": "int",
        "min": 0,
        "max": 255,
        "default": 0,
        "label": "Shadow R",
        "curve": "linear",
        "unit": "",
    },
    "shadow_g": {
        "type": "int",
        "min": 0,
        "max": 255,
        "default": 0,
        "label": "Shadow G",
        "curve": "linear",
        "unit": "",
    },
    "shadow_b": {
        "type": "int",
        "min": 0,
        "max": 255,
        "default": 80,
        "label": "Shadow B",
        "curve": "linear",
        "unit": "",
    },
    "highlight_r": {
        "type": "int",
        "min": 0,
        "max": 255,
        "default": 255,
        "label": "Highlight R",
        "curve": "linear",
        "unit": "",
    },
    "highlight_g": {
        "type": "int",
        "min": 0,
        "max": 255,
        "default": 200,
        "label": "Highlight G",
        "curve": "linear",
        "unit": "",
    },
    "highlight_b": {
        "type": "int",
        "min": 0,
        "max": 255,
        "default": 100,
        "label": "Highlight B",
        "curve": "linear",
        "unit": "",
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
    """Map grayscale to two-color gradient — classic risograph aesthetic."""
    _c = lambda v, d: max(0, min(255, int(params.get(v, d))))
    shadow = (_c("shadow_r", 0), _c("shadow_g", 0), _c("shadow_b", 80))
    highlight = (_c("highlight_r", 255), _c("highlight_g", 200), _c("highlight_b", 100))

    rgb = frame[:, :, :3]
    alpha = frame[:, :, 3:4]

    img = Image.fromarray(rgb)
    gray = ImageOps.grayscale(img)
    result_rgb = np.array(ImageOps.colorize(gray, black=shadow, white=highlight))

    output = np.concatenate([result_rgb, alpha], axis=2)
    return output, None
