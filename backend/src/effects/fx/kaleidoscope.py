"""Kaleidoscope — mirror segments radiating from center."""

import cv2
import numpy as np

EFFECT_ID = "fx.kaleidoscope"
EFFECT_NAME = "Kaleidoscope"
EFFECT_CATEGORY = "whimsy"

PARAMS: dict = {
    "segments": {
        "type": "int",
        "min": 2,
        "max": 16,
        "default": 6,
        "label": "Segments",
        "curve": "linear",
        "unit": "count",
        "description": "Number of mirror segments",
    },
    "rotation": {
        "type": "float",
        "min": 0.0,
        "max": 360.0,
        "default": 0.0,
        "label": "Rotation",
        "curve": "linear",
        "unit": "deg",
        "description": "Rotation angle in degrees",
    },
    "zoom": {
        "type": "float",
        "min": 0.5,
        "max": 3.0,
        "default": 1.0,
        "label": "Zoom",
        "curve": "linear",
        "unit": "%",
        "description": "Zoom into kaleidoscope pattern",
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
    """Kaleidoscope — mirrored radial segments."""
    segments = max(2, min(16, int(params.get("segments", 6))))
    rotation = float(params.get("rotation", 0.0))
    zoom = max(0.5, min(3.0, float(params.get("zoom", 1.0))))

    rgb = frame[:, :, :3]
    alpha = frame[:, :, 3:4]
    h, w = rgb.shape[:2]
    cx, cy = w // 2, h // 2

    ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
    dx = xs - cx
    dy = ys - cy
    angle = np.arctan2(dy, dx) + np.radians(rotation)
    radius = np.sqrt(dx * dx + dy * dy)

    seg_angle = 2 * np.pi / segments
    folded = np.abs(np.mod(angle, seg_angle) - seg_angle / 2)

    map_x = (cx + radius * np.cos(folded) / zoom).astype(np.float32)
    map_y = (cy + radius * np.sin(folded) / zoom).astype(np.float32)
    map_x = np.clip(map_x, 0, w - 1)
    map_y = np.clip(map_y, 0, h - 1)

    result_rgb = cv2.remap(rgb, map_x, map_y, cv2.INTER_LINEAR)
    output = np.concatenate([result_rgb, alpha], axis=2)
    return output, None
