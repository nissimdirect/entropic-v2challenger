"""Sharpen — unsharp mask sharpening effect."""

import numpy as np
from PIL import Image, ImageFilter

EFFECT_ID = "fx.sharpen"
EFFECT_NAME = "Sharpen"
EFFECT_CATEGORY = "enhance"

PARAMS: dict = {
    "amount": {
        "type": "float",
        "min": 0.0,
        "max": 3.0,
        "default": 1.0,
        "label": "Amount",
        "curve": "linear",
        "unit": "%",
        "description": "Sharpening intensity (0-3, multiple passes)",
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
    """Sharpen — multi-pass unsharp mask."""
    amount = max(0.0, min(3.0, float(params.get("amount", 1.0))))

    rgb = frame[:, :, :3]
    alpha = frame[:, :, 3:4]

    img = Image.fromarray(rgb)
    passes = max(1, int(amount))
    for _ in range(passes):
        img = img.filter(ImageFilter.SHARPEN)

    result_rgb = np.array(img)
    output = np.concatenate([result_rgb, alpha], axis=2)
    return output, None
