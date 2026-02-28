"""Emboss — 3D embossed/stamped look by highlighting directional edges."""

import numpy as np
from PIL import Image, ImageFilter

EFFECT_ID = "fx.emboss"
EFFECT_NAME = "Emboss"
EFFECT_CATEGORY = "enhance"

PARAMS: dict = {
    "amount": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 1.0,
        "label": "Amount",
        "curve": "linear",
        "unit": "%",
        "description": "Blend amount (0 = original, 1 = fully embossed)",
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
    """3D embossed/stamped look."""
    amount = max(0.0, min(1.0, float(params.get("amount", 1.0))))

    rgb = frame[:, :, :3]
    alpha = frame[:, :, 3:4]

    img = Image.fromarray(rgb)
    embossed_arr = np.array(img.filter(ImageFilter.EMBOSS))

    if amount >= 1.0:
        result_rgb = embossed_arr
    elif amount <= 0.0:
        result_rgb = rgb.copy()
    else:
        result_rgb = np.clip(
            rgb.astype(np.float32) * (1.0 - amount)
            + embossed_arr.astype(np.float32) * amount,
            0,
            255,
        ).astype(np.uint8)

    output = np.concatenate([result_rgb, alpha], axis=2)
    return output, None
