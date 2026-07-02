"""Contrast Crush — extreme contrast manipulation with curve shaping."""

import numpy as np

EFFECT_ID = "fx.contrast_crush"
EFFECT_NAME = "Contrast Crush"
EFFECT_CATEGORY = "color"

PARAMS: dict = {
    "amount": {
        "type": "float",
        "min": -100.0,
        "max": 100.0,
        "default": 50.0,
        "label": "Amount",
        "curve": "linear",
        "unit": "%",
        "description": "Contrast level (-100 flatten to 100 extreme)",
    },
    "curve": {
        "type": "choice",
        "options": ["linear", "s_curve", "hard"],
        "default": "linear",
        "label": "Curve",
        "description": "Contrast curve shape",
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
    """Extreme contrast — linear, S-curve, or hard threshold."""
    amount = max(-100.0, min(100.0, float(params.get("amount", 50.0))))
    curve = str(params.get("curve", "linear"))

    rgb = frame[:, :, :3].astype(np.float32) / 255.0
    alpha = frame[:, :, 3:4]

    if curve == "hard":
        threshold = 0.5 - (amount / 200)
        rgb = np.where(rgb > threshold, 1.0, 0.0)
    elif curve == "s_curve":
        strength = 1 + abs(amount) / 20
        if amount >= 0:
            rgb = 1.0 / (1.0 + np.exp(-strength * (rgb - 0.5) * 10))
        else:
            rgb = 0.5 + (rgb - 0.5) * (1 - abs(amount) / 100)
    else:
        factor = (259 * (amount + 255)) / (255 * (259 - amount))
        rgb = factor * (rgb - 0.5) + 0.5

    result_rgb = np.clip(rgb * 255, 0, 255).astype(np.uint8)
    output = np.concatenate([result_rgb, alpha], axis=2)
    return output, None
