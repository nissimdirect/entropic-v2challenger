"""Color Invert — per-channel blendable color inversion."""

import numpy as np

EFFECT_ID = "fx.color_invert"
EFFECT_NAME = "Color Invert"
EFFECT_CATEGORY = "color"

PARAMS: dict = {
    "channel": {
        "type": "choice",
        "options": ["all", "r", "g", "b"],
        "default": "all",
        "label": "Channel",
        "description": "Which channel(s) to invert",
    },
    "amount": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 1.0,
        "label": "Amount",
        "curve": "linear",
        "unit": "%",
        "description": "Inversion blend (0=original, 1=fully inverted)",
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
    """Per-channel blendable inversion."""
    channel = str(params.get("channel", "all"))
    amount = max(0.0, min(1.0, float(params.get("amount", 1.0))))

    if amount == 0.0:
        return frame.copy(), None

    rgb = frame[:, :, :3].astype(np.float32)
    alpha = frame[:, :, 3:4]

    if channel == "all":
        inverted = 255.0 - rgb
        rgb = rgb * (1.0 - amount) + inverted * amount
    else:
        ch_map = {"r": 0, "g": 1, "b": 2}
        ch_idx = ch_map.get(channel, 0)
        inverted = 255.0 - rgb[:, :, ch_idx]
        rgb[:, :, ch_idx] = rgb[:, :, ch_idx] * (1.0 - amount) + inverted * amount

    result_rgb = np.clip(rgb, 0, 255).astype(np.uint8)
    return np.concatenate([result_rgb, alpha], axis=2), None
