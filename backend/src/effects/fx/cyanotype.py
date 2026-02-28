"""Cyanotype — Prussian blue photographic print simulation."""

import numpy as np

EFFECT_ID = "fx.cyanotype"
EFFECT_NAME = "Cyanotype"
EFFECT_CATEGORY = "color"

PARAMS: dict = {
    "intensity": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 1.0,
        "label": "Intensity",
        "curve": "linear",
        "unit": "%",
        "description": "Effect strength (0=original, 1=full cyanotype)",
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
    """Cyanotype — 19th century blueprint blue-and-white tones."""
    intensity = max(0.0, min(1.0, float(params.get("intensity", 1.0))))

    rgb = frame[:, :, :3].astype(np.float32)
    alpha = frame[:, :, 3:4]

    gray = np.mean(rgb, axis=2)
    r = np.clip(gray * 0.3, 0, 255)
    g = np.clip(gray * 0.5, 0, 255)
    b = np.clip(gray * 0.9 + 30, 0, 255)
    cyan = np.stack([r, g, b], axis=2)

    result = rgb * (1 - intensity) + cyan * intensity
    result_rgb = np.clip(result, 0, 255).astype(np.uint8)

    output = np.concatenate([result_rgb, alpha], axis=2)
    return output, None
