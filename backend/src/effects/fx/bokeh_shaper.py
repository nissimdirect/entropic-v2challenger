"""Bokeh Shaper — shape bright highlights into bokeh patterns."""

import numpy as np
import cv2

EFFECT_ID = "fx.bokeh_shaper"
EFFECT_NAME = "Bokeh Shaper"
EFFECT_CATEGORY = "optics"

PARAMS: dict = {
    "threshold": {
        "type": "float",
        "min": 0.5,
        "max": 1.0,
        "default": 0.8,
        "label": "Threshold",
        "curve": "linear",
        "unit": "",
        "description": "Brightness threshold for bokeh extraction",
    },
    "shape": {
        "type": "choice",
        "options": ["circle", "hexagon", "heart"],
        "default": "circle",
        "label": "Shape",
        "description": "Bokeh highlight shape",
    },
    "size": {
        "type": "int",
        "min": 5,
        "max": 50,
        "default": 15,
        "label": "Size",
        "curve": "linear",
        "unit": "px",
        "description": "Size of bokeh shapes",
    },
    "intensity": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.7,
        "label": "Intensity",
        "curve": "linear",
        "unit": "",
        "description": "Blend intensity of bokeh overlay",
    },
}


def _make_kernel(shape: str, size: int) -> np.ndarray:
    """Create a shaped kernel for dilation."""
    s = max(3, size | 1)
    kernel = np.zeros((s, s), dtype=np.uint8)
    center = s // 2

    if shape == "hexagon":
        pts = []
        for i in range(6):
            angle = np.pi / 3 * i - np.pi / 6
            px = int(center + center * 0.9 * np.cos(angle))
            py = int(center + center * 0.9 * np.sin(angle))
            pts.append([px, py])
        pts_arr = np.array(pts, dtype=np.int32)
        cv2.fillConvexPoly(kernel, pts_arr, 1)
    elif shape == "heart":
        for y in range(s):
            for x in range(s):
                xn = (x - center) / max(center, 1)
                yn = (center - y) / max(center, 1)
                val = (xn**2 + yn**2 - 1) ** 3 - xn**2 * yn**3
                if val <= 0:
                    kernel[y, x] = 1
        if kernel.sum() == 0:
            cv2.circle(kernel, (center, center), center, 1, -1)
    else:  # circle
        cv2.circle(kernel, (center, center), center, 1, -1)

    if kernel.sum() == 0:
        kernel[center, center] = 1
    return kernel


def apply(
    frame: np.ndarray,
    params: dict,
    state_in: dict | None = None,
    *,
    frame_index: int,
    seed: int,
    resolution: tuple[int, int],
) -> tuple[np.ndarray, dict | None]:
    """Shape bright highlights into bokeh patterns."""
    threshold = max(0.5, min(1.0, float(params.get("threshold", 0.8))))
    shape = str(params.get("shape", "circle"))
    size = max(5, min(50, int(params.get("size", 15))))
    intensity = max(0.0, min(1.0, float(params.get("intensity", 0.7))))

    h, w = frame.shape[:2]
    rgb = frame[:, :, :3]
    alpha = frame[:, :, 3:4]

    # Extract bright spots
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    bright_mask = (gray.astype(np.float32) / 255.0 > threshold).astype(np.uint8)
    bright_pixels = rgb.astype(np.float32) * bright_mask[:, :, np.newaxis]

    # Dilate with shaped kernel
    kernel = _make_kernel(shape, size)
    bokeh_r = cv2.dilate(bright_pixels[:, :, 0], kernel)
    bokeh_g = cv2.dilate(bright_pixels[:, :, 1], kernel)
    bokeh_b = cv2.dilate(bright_pixels[:, :, 2], kernel)
    bokeh = np.stack([bokeh_r, bokeh_g, bokeh_b], axis=2)

    # Blend with original using screen-like mode
    original_f = rgb.astype(np.float32)
    result = original_f + bokeh * intensity
    result_rgb = np.clip(result, 0, 255).astype(np.uint8)

    return np.concatenate([result_rgb, alpha], axis=2), None
