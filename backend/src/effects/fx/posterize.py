"""Posterize effect — reduce color levels per channel."""

import numpy as np

EFFECT_ID = "fx.posterize"
EFFECT_NAME = "Posterize"
EFFECT_CATEGORY = "enhance"

PARAMS: dict = {
    "levels": {
        "type": "int",
        "min": 2,
        "max": 32,
        "default": 4,
        "label": "Color Levels",
        "curve": "linear",
        "unit": "",
        "description": "Number of distinct color levels per channel",
    }
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
    """Reduce color levels. Stateless."""
    levels = int(params.get("levels", 4))
    levels = max(2, min(32, levels))

    output = frame.copy()
    # Posterize RGB channels, preserve alpha
    step = 256.0 / levels
    rgb = output[:, :, :3].astype(np.float32)
    posterized = np.floor(rgb / step) * step + step / 2
    output[:, :, :3] = np.clip(posterized, 0, 255).astype(np.uint8)

    return output, None
