"""Solarize — partially invert pixels above threshold (Sabattier/Man Ray effect)."""

import numpy as np
from PIL import Image, ImageOps

EFFECT_ID = "fx.solarize"
EFFECT_NAME = "Solarize"
EFFECT_CATEGORY = "enhance"

PARAMS: dict = {
    "threshold": {
        "type": "int",
        "min": 0,
        "max": 255,
        "default": 128,
        "label": "Threshold",
        "curve": "linear",
        "unit": "",
        "description": "Inversion threshold (0-255)",
    },
    "brightness": {
        "type": "float",
        "min": 0.5,
        "max": 2.0,
        "default": 1.0,
        "label": "Brightness",
        "curve": "linear",
        "unit": "%",
        "description": "Brightness compensation",
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
    """Partially invert pixels above threshold — psychedelic color shifts."""
    threshold = max(0, min(255, int(params.get("threshold", 128))))
    brightness = max(0.5, min(2.0, float(params.get("brightness", 1.0))))

    rgb = frame[:, :, :3]
    alpha = frame[:, :, 3:4]

    img = Image.fromarray(rgb)
    solarized = np.array(ImageOps.solarize(img, threshold=threshold)).astype(np.float32)
    solarized = np.clip(solarized * brightness, 0, 255).astype(np.uint8)

    output = np.concatenate([solarized, alpha], axis=2)
    return output, None
