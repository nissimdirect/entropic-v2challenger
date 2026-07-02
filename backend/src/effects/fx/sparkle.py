"""Sparkle — animated glitter/sparkle point overlay."""

import cv2
import numpy as np

from engine.determinism import make_rng

EFFECT_ID = "fx.sparkle"
EFFECT_NAME = "Sparkle"
EFFECT_CATEGORY = "whimsy"

PARAMS: dict = {
    "density": {
        "type": "float",
        "min": 0.0005,
        "max": 0.01,
        "default": 0.002,
        "label": "Density",
        "curve": "exponential",
        "unit": "%",
        "description": "Sparkle density per pixel",
    },
    "size": {
        "type": "int",
        "min": 1,
        "max": 10,
        "default": 3,
        "label": "Size",
        "curve": "linear",
        "unit": "px",
        "description": "Sparkle point size",
    },
    "brightness": {
        "type": "float",
        "min": 0.1,
        "max": 2.0,
        "default": 1.0,
        "label": "Brightness",
        "curve": "linear",
        "unit": "%",
        "description": "Sparkle brightness",
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
    """Sparkle — random glitter points with cross pattern."""
    density = max(0.0005, min(0.01, float(params.get("density", 0.002))))
    size = max(1, min(10, int(params.get("size", 3))))
    brightness = max(0.1, min(2.0, float(params.get("brightness", 1.0))))

    rgb = frame[:, :, :3]
    alpha = frame[:, :, 3:4]
    h, w = rgb.shape[:2]

    rng = make_rng(seed)
    num_sparkles = min(10_000, max(1, int(h * w * density)))

    result = rgb.copy()
    ys = rng.integers(0, h, num_sparkles)
    xs = rng.integers(0, w, num_sparkles)

    color = (
        int(min(255, 255 * brightness)),
        int(min(255, 255 * brightness)),
        int(min(255, 255 * brightness)),
    )

    for i in range(num_sparkles):
        x, y = int(xs[i]), int(ys[i])
        cv2.line(result, (x - size, y), (x + size, y), color, 1)
        cv2.line(result, (x, y - size), (x, y + size), color, 1)

    output = np.concatenate([result, alpha], axis=2)
    return output, None
