"""Rainbow Shift — animated rainbow gradient sweep across the frame."""

import cv2
import numpy as np

EFFECT_ID = "fx.rainbow_shift"
EFFECT_NAME = "Rainbow Shift"
EFFECT_CATEGORY = "whimsy"

PARAMS: dict = {
    "speed": {
        "type": "float",
        "min": 0.1,
        "max": 5.0,
        "default": 1.0,
        "label": "Speed",
        "curve": "linear",
        "unit": "%",
        "description": "Rainbow animation speed",
    },
    "opacity": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.4,
        "label": "Opacity",
        "curve": "linear",
        "unit": "%",
        "description": "Rainbow overlay blend amount",
    },
    "direction": {
        "type": "choice",
        "options": ["horizontal", "vertical", "diagonal", "radial"],
        "default": "horizontal",
        "label": "Direction",
        "description": "Gradient direction",
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
    """Rainbow gradient sweep — animated color wash."""
    speed = max(0.1, min(5.0, float(params.get("speed", 1.0))))
    opacity = max(0.0, min(1.0, float(params.get("opacity", 0.4))))
    direction = str(params.get("direction", "horizontal"))

    rgb = frame[:, :, :3]
    alpha = frame[:, :, 3:4]
    h, w = rgb.shape[:2]

    t = frame_index * speed * 0.02

    if direction == "vertical":
        gradient = np.linspace(0, 180, h, dtype=np.float32)
        hue = np.tile(gradient.reshape(-1, 1), (1, w))
    elif direction == "diagonal":
        ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
        hue = ((xs / w + ys / h) * 90).astype(np.float32)
    elif direction == "radial":
        ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
        cx, cy = w / 2.0, h / 2.0
        dist = np.sqrt((xs - cx) ** 2 + (ys - cy) ** 2)
        hue = (dist / max(h, w) * 360).astype(np.float32)
    else:
        gradient = np.linspace(0, 180, w, dtype=np.float32)
        hue = np.tile(gradient, (h, 1))

    hue = np.mod(hue + t * 180, 180).astype(np.float32)
    sat = np.full((h, w), 255, dtype=np.float32)
    val = np.full((h, w), 255, dtype=np.float32)

    hsv = np.stack([hue, sat, val], axis=2).astype(np.uint8)
    rainbow = cv2.cvtColor(hsv, cv2.COLOR_HSV2RGB)

    result = np.clip(
        rgb.astype(np.float32) * (1 - opacity) + rainbow.astype(np.float32) * opacity,
        0,
        255,
    ).astype(np.uint8)

    output = np.concatenate([result, alpha], axis=2)
    return output, None
