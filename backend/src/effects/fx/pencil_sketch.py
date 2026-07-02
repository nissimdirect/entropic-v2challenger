"""Pencil Sketch — illustration effect using OpenCV's pencilSketch."""

import cv2
import numpy as np

EFFECT_ID = "fx.pencil_sketch"
EFFECT_NAME = "Pencil Sketch"
EFFECT_CATEGORY = "distortion"

PARAMS: dict = {
    "sigma_s": {
        "type": "float",
        "min": 1.0,
        "max": 200.0,
        "default": 60.0,
        "label": "Spatial Sigma",
        "curve": "linear",
        "unit": "",
        "description": "Edge-preserving filter spatial sigma",
    },
    "sigma_r": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.07,
        "label": "Range Sigma",
        "curve": "linear",
        "unit": "",
        "description": "Edge-preserving filter range sigma",
    },
    "shade": {
        "type": "float",
        "min": 0.0,
        "max": 0.1,
        "default": 0.05,
        "label": "Shade Factor",
        "curve": "linear",
        "unit": "%",
        "description": "Pencil shading texture intensity",
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
    """Pencil sketch — instant drawing/illustration effect."""
    sigma_s = max(1.0, min(200.0, float(params.get("sigma_s", 60.0))))
    sigma_r = max(0.0, min(1.0, float(params.get("sigma_r", 0.07))))
    shade = max(0.0, min(0.1, float(params.get("shade", 0.05))))

    rgb = frame[:, :, :3]
    alpha = frame[:, :, 3:4]

    bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    _, color_sketch = cv2.pencilSketch(
        bgr, sigma_s=sigma_s, sigma_r=sigma_r, shade_factor=shade
    )
    result_rgb = cv2.cvtColor(color_sketch, cv2.COLOR_BGR2RGB)

    output = np.concatenate([result_rgb, alpha], axis=2)
    return output, None
