"""Tilt Shift — simulated tilt-shift selective focus effect."""

import numpy as np
import cv2

EFFECT_ID = "fx.tilt_shift"
EFFECT_NAME = "Tilt Shift"
EFFECT_CATEGORY = "optics"

PARAMS: dict = {
    "focus_y": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.5,
        "label": "Focus Y",
        "curve": "linear",
        "unit": "",
        "description": "Vertical position of the focus strip",
    },
    "focus_width": {
        "type": "float",
        "min": 0.05,
        "max": 0.5,
        "default": 0.15,
        "label": "Focus Width",
        "curve": "linear",
        "unit": "",
        "description": "Width of the in-focus region",
    },
    "blur_amount": {
        "type": "int",
        "min": 3,
        "max": 51,
        "default": 15,
        "label": "Blur Amount",
        "curve": "linear",
        "unit": "px",
        "description": "Maximum blur radius for out-of-focus areas",
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
    """Tilt-shift — sharp center strip with blurred top and bottom."""
    focus_y = max(0.0, min(1.0, float(params.get("focus_y", 0.5))))
    focus_width = max(0.05, min(0.5, float(params.get("focus_width", 0.15))))
    blur_amount = max(3, min(51, int(params.get("blur_amount", 15))))
    blur_amount = blur_amount | 1  # ensure odd

    h, w = frame.shape[:2]
    rgb = frame[:, :, :3]
    alpha = frame[:, :, 3:4]

    blurred = cv2.GaussianBlur(rgb, (blur_amount, blur_amount), 0)

    # Create gradient mask: 1.0 = sharp, 0.0 = blurred
    center_px = int(focus_y * h)
    half_w = int(focus_width * h * 0.5)

    y_coords = np.arange(h, dtype=np.float32)
    dist = np.abs(y_coords - center_px).astype(np.float32)
    mask_1d = 1.0 - np.clip((dist - half_w) / max(half_w, 1), 0, 1)
    mask = mask_1d[:, np.newaxis, np.newaxis]

    result = rgb.astype(np.float32) * mask + blurred.astype(np.float32) * (1.0 - mask)
    result_rgb = np.clip(result, 0, 255).astype(np.uint8)

    return np.concatenate([result_rgb, alpha], axis=2), None
