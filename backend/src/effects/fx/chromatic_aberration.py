"""Chromatic Aberration — RGB channel splitting to simulate lens fringing."""

import numpy as np
from PIL import Image

EFFECT_ID = "fx.chromatic_aberration"
EFFECT_NAME = "Chromatic Aberration"
EFFECT_CATEGORY = "distortion"

PARAMS: dict = {
    "offset": {
        "type": "int",
        "min": 1,
        "max": 50,
        "default": 5,
        "label": "Offset",
        "curve": "logarithmic",
        "unit": "px",
        "description": "Pixel offset for R and B channels",
    },
    "direction": {
        "type": "choice",
        "options": ["horizontal", "vertical", "radial"],
        "default": "horizontal",
        "label": "Direction",
        "description": "Channel split direction",
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
    """Chromatic aberration — split RGB channels for lens fringing."""
    offset = max(1, min(50, int(params.get("offset", 5))))
    direction = str(params.get("direction", "horizontal"))

    rgb = frame[:, :, :3]
    alpha = frame[:, :, 3:4]
    h, w = rgb.shape[:2]

    result = np.zeros_like(rgb)

    if direction == "radial":
        for ch_idx, mult in enumerate([-1, 0, 1]):
            channel = rgb[:, :, ch_idx]
            if mult == 0:
                result[:, :, ch_idx] = channel
            else:
                scale = 1.0 + mult * offset * 0.002
                img = Image.fromarray(channel)
                new_w, new_h = int(w * scale), int(h * scale)
                if new_w < 1 or new_h < 1:
                    result[:, :, ch_idx] = channel
                    continue
                scaled = np.array(img.resize((new_w, new_h), Image.BILINEAR))
                # Center-crop or center-pad the scaled channel
                if new_h >= h and new_w >= w:
                    sy = (new_h - h) // 2
                    sx = (new_w - w) // 2
                    result[:, :, ch_idx] = scaled[sy : sy + h, sx : sx + w]
                else:
                    # Scaled image is smaller — paste into center of result
                    dy = (h - new_h) // 2
                    dx = (w - new_w) // 2
                    result[dy : dy + new_h, dx : dx + new_w, ch_idx] = scaled
    else:
        ax = 0 if direction == "vertical" else 1
        result[:, :, 0] = np.roll(rgb[:, :, 0], offset, axis=ax)
        result[:, :, 1] = rgb[:, :, 1]
        result[:, :, 2] = np.roll(rgb[:, :, 2], -offset, axis=ax)

    output = np.concatenate([result, alpha], axis=2)
    return output, None
