"""Wavefold — audio wavefolding applied to pixel brightness."""

import numpy as np

EFFECT_ID = "fx.wavefold"
EFFECT_NAME = "Wavefold"
EFFECT_CATEGORY = "modulation"

PARAMS: dict = {
    "threshold": {
        "type": "float",
        "min": 0.1,
        "max": 0.95,
        "default": 0.7,
        "label": "Threshold",
        "curve": "linear",
        "unit": "%",
        "description": "Fold-back point",
    },
    "folds": {
        "type": "int",
        "min": 1,
        "max": 8,
        "default": 3,
        "label": "Folds",
        "curve": "linear",
        "unit": "count",
        "description": "Number of folding passes",
    },
    "brightness": {
        "type": "float",
        "min": 0.5,
        "max": 2.0,
        "default": 1.0,
        "label": "Brightness",
        "curve": "linear",
        "unit": "%",
        "description": "Post-fold brightness",
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
    """Wavefold — values exceeding threshold fold back, creating banding."""
    threshold = max(0.1, min(0.95, float(params.get("threshold", 0.7))))
    folds = max(1, min(8, int(params.get("folds", 3))))
    brightness = max(0.5, min(2.0, float(params.get("brightness", 1.0))))

    rgb = frame[:, :, :3].astype(np.float32) / 255.0
    alpha = frame[:, :, 3:4]

    for _ in range(folds):
        rgb = np.where(rgb > threshold, 2.0 * threshold - rgb, rgb)
        rgb = np.abs(rgb)

    rgb *= brightness
    result_rgb = np.clip(rgb * 255, 0, 255).astype(np.uint8)
    output = np.concatenate([result_rgb, alpha], axis=2)
    return output, None
