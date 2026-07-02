"""Brightness Exposure — push exposure in photographic stops."""

import numpy as np

EFFECT_ID = "fx.brightness_exposure"
EFFECT_NAME = "Brightness Exposure"
EFFECT_CATEGORY = "color"

PARAMS: dict = {
    "stops": {
        "type": "float",
        "min": -3.0,
        "max": 3.0,
        "default": 1.0,
        "label": "Stops",
        "curve": "linear",
        "unit": "stops",
        "description": "Exposure adjustment in stops (-3 dark to +3 bright)",
    },
    "clip_mode": {
        "type": "choice",
        "options": ["clip", "wrap", "mirror"],
        "default": "clip",
        "label": "Clip Mode",
        "description": "Overflow behavior (clip/wrap/mirror)",
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
    """Exposure in photographic stops — clip, wrap, or mirror overflow."""
    stops = max(-3.0, min(3.0, float(params.get("stops", 1.0))))
    clip_mode = str(params.get("clip_mode", "clip"))

    rgb = frame[:, :, :3].astype(np.float32)
    alpha = frame[:, :, 3:4]

    multiplier = 2.0**stops
    f = rgb * multiplier

    if clip_mode == "wrap":
        f = np.mod(f, 256)
    elif clip_mode == "mirror":
        f = np.abs(np.mod(f, 510) - 255)
        f = 255 - np.abs(f - 255)
    else:
        f = np.clip(f, 0, 255)

    result_rgb = f.astype(np.uint8)
    output = np.concatenate([result_rgb, alpha], axis=2)
    return output, None
