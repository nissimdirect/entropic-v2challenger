"""Chromatic Aberration Pro — radial chromatic aberration from configurable center."""

import numpy as np
import cv2

EFFECT_ID = "fx.chromatic_aberration_pro"
EFFECT_NAME = "Chromatic Aberration Pro"
EFFECT_CATEGORY = "optics"

PARAMS: dict = {
    "red_shift": {
        "type": "float",
        "min": 0.0,
        "max": 20.0,
        "default": 5.0,
        "label": "Red Shift",
        "curve": "linear",
        "unit": "px",
        "description": "Radial shift of the red channel",
    },
    "blue_shift": {
        "type": "float",
        "min": 0.0,
        "max": 20.0,
        "default": 5.0,
        "label": "Blue Shift",
        "curve": "linear",
        "unit": "px",
        "description": "Radial shift of the blue channel",
    },
    "center_x": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.5,
        "label": "Center X",
        "curve": "linear",
        "unit": "",
        "description": "Horizontal center of aberration",
    },
    "center_y": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.5,
        "label": "Center Y",
        "curve": "linear",
        "unit": "",
        "description": "Vertical center of aberration",
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
    """Radial chromatic aberration — shift R and B channels from center."""
    red_shift = max(0.0, min(20.0, float(params.get("red_shift", 5.0))))
    blue_shift = max(0.0, min(20.0, float(params.get("blue_shift", 5.0))))
    center_x = max(0.0, min(1.0, float(params.get("center_x", 0.5))))
    center_y = max(0.0, min(1.0, float(params.get("center_y", 0.5))))

    h, w = frame.shape[:2]
    alpha = frame[:, :, 3:4]

    cx = center_x * w
    cy = center_y * h

    y_coords, x_coords = np.mgrid[0:h, 0:w].astype(np.float32)
    dx = x_coords - cx
    dy = y_coords - cy
    r = np.sqrt(dx**2 + dy**2)
    max_r = max(np.sqrt(cx**2 + cy**2), 1.0)
    r_norm = r / max_r

    # Direction vectors (normalized)
    safe_r = np.where(r > 0, r, 1.0)
    dir_x = dx / safe_r
    dir_y = dy / safe_r

    # Shift red outward, blue inward (or vice versa for visual effect)
    red_map_x = (x_coords + dir_x * r_norm * red_shift).astype(np.float32)
    red_map_y = (y_coords + dir_y * r_norm * red_shift).astype(np.float32)
    blue_map_x = (x_coords - dir_x * r_norm * blue_shift).astype(np.float32)
    blue_map_y = (y_coords - dir_y * r_norm * blue_shift).astype(np.float32)

    r_ch = cv2.remap(
        frame[:, :, 0],
        red_map_x,
        red_map_y,
        cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_REFLECT,
    )
    g_ch = frame[:, :, 1]
    b_ch = cv2.remap(
        frame[:, :, 2],
        blue_map_x,
        blue_map_y,
        cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_REFLECT,
    )

    result_rgb = np.stack([r_ch, g_ch, b_ch], axis=2)
    return np.concatenate([result_rgb, alpha], axis=2), None
