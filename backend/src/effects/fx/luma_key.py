"""Luma Key — make dark or bright areas transparent based on luminance."""

import cv2
import numpy as np

EFFECT_ID = "fx.luma_key"
EFFECT_NAME = "Luma Key"
EFFECT_CATEGORY = "key"

PARAMS: dict = {
    "threshold": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.3,
        "label": "Threshold",
        "curve": "linear",
        "unit": "%",
        "description": "Brightness cutoff (0-1)",
    },
    "mode": {
        "type": "choice",
        "options": ["dark", "bright"],
        "default": "dark",
        "label": "Mode",
        "description": "Key out dark or bright areas",
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
    """Luma key — make dark or bright areas transparent."""
    threshold = max(0.0, min(1.0, float(params.get("threshold", 0.3))))
    mode = str(params.get("mode", "dark"))
    softness = max(0.0, min(50.0, float(params.get("softness", 10.0))))

    rgb = frame[:, :, :3]
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY).astype(np.float32) / 255.0

    if mode == "dark":
        mask = (gray < threshold).astype(np.float32)
    else:
        mask = (gray > threshold).astype(np.float32)

    if softness > 0:
        ksize = int(softness * 2) | 1
        mask = cv2.GaussianBlur(mask, (ksize, ksize), 0)

    new_alpha = ((1.0 - mask) * 255).astype(np.uint8)
    output = np.concatenate([rgb, new_alpha[:, :, np.newaxis]], axis=2)
    return output, None
