"""Color Temperature — warm/cool white balance shift."""

import numpy as np

EFFECT_ID = "fx.color_temperature"
EFFECT_NAME = "Color Temperature"
EFFECT_CATEGORY = "color"

PARAMS: dict = {
    "temp": {
        "type": "float",
        "min": -100.0,
        "max": 100.0,
        "default": 30.0,
        "label": "Temperature",
        "curve": "linear",
        "unit": "K",
        "description": "Color temp (-100 cool/blue to +100 warm/orange)",
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
    """White balance shift — warm orange to cool blue."""
    temp = max(-100.0, min(100.0, float(params.get("temp", 30.0))))

    rgb = frame[:, :, :3].astype(np.float32)
    alpha = frame[:, :, 3:4]

    shift = temp / 100.0 * 40
    rgb[:, :, 0] = np.clip(rgb[:, :, 0] + shift, 0, 255)  # Red
    rgb[:, :, 2] = np.clip(rgb[:, :, 2] - shift, 0, 255)  # Blue
    rgb[:, :, 1] = np.clip(rgb[:, :, 1] + shift * 0.1, 0, 255)  # Green slight

    result_rgb = rgb.astype(np.uint8)
    output = np.concatenate([result_rgb, alpha], axis=2)
    return output, None
