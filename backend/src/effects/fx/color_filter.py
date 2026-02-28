"""Color Filter — preset color grades as a single dropdown."""

import numpy as np

EFFECT_ID = "fx.color_filter"
EFFECT_NAME = "Color Filter"
EFFECT_CATEGORY = "color"

PARAMS: dict = {
    "preset": {
        "type": "choice",
        "options": ["sepia", "cool", "warm"],
        "default": "sepia",
        "label": "Preset",
        "description": "Color grade preset",
    },
    "intensity": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.7,
        "label": "Intensity",
        "curve": "linear",
        "unit": "%",
        "description": "Filter strength",
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
    """Apply preset color grade filter."""
    preset = str(params.get("preset", "sepia"))
    intensity = max(0.0, min(1.0, float(params.get("intensity", 0.7))))

    if intensity == 0.0:
        return frame.copy(), None

    rgb = frame[:, :, :3].astype(np.float32)
    alpha = frame[:, :, 3:4]

    if preset == "sepia":
        gray = np.mean(rgb, axis=2)
        r = np.clip(gray * 1.1 + 20, 0, 255)
        g = np.clip(gray * 0.9, 0, 255)
        b = np.clip(gray * 0.7, 0, 255)
        filtered = np.stack([r, g, b], axis=2)
    elif preset == "cool":
        filtered = rgb.copy()
        filtered[:, :, 2] = np.clip(rgb[:, :, 2] * (1 + 0.3 * intensity), 0, 255)
        filtered[:, :, 0] = np.clip(rgb[:, :, 0] * (1 - 0.15 * intensity), 0, 255)
    elif preset == "warm":
        filtered = rgb.copy()
        filtered[:, :, 0] = np.clip(rgb[:, :, 0] * (1 + 0.3 * intensity), 0, 255)
        filtered[:, :, 2] = np.clip(rgb[:, :, 2] * (1 - 0.15 * intensity), 0, 255)
    else:
        return frame.copy(), None

    result = rgb * (1.0 - intensity) + filtered * intensity
    result_rgb = np.clip(result, 0, 255).astype(np.uint8)
    return np.concatenate([result_rgb, alpha], axis=2), None
