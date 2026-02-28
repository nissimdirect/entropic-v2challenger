"""Lens Flare — cinematic light flare with radial glow and streaks."""

import cv2
import numpy as np

EFFECT_ID = "fx.lens_flare"
EFFECT_NAME = "Lens Flare"
EFFECT_CATEGORY = "whimsy"

PARAMS: dict = {
    "position_x": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.3,
        "label": "Position X",
        "curve": "linear",
        "unit": "%",
        "description": "Horizontal flare position",
    },
    "position_y": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.3,
        "label": "Position Y",
        "curve": "linear",
        "unit": "%",
        "description": "Vertical flare position",
    },
    "intensity": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.7,
        "label": "Intensity",
        "curve": "exponential",
        "unit": "%",
        "description": "Flare brightness",
    },
    "size": {
        "type": "float",
        "min": 0.05,
        "max": 0.5,
        "default": 0.15,
        "label": "Size",
        "curve": "linear",
        "unit": "%",
        "description": "Flare radius relative to frame",
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
    """Lens flare — radial glow with anamorphic streaks."""
    position_x = max(0.0, min(1.0, float(params.get("position_x", 0.3))))
    position_y = max(0.0, min(1.0, float(params.get("position_y", 0.3))))
    intensity = max(0.0, min(1.0, float(params.get("intensity", 0.7))))
    size = max(0.05, min(0.5, float(params.get("size", 0.15))))

    rgb = frame[:, :, :3]
    alpha = frame[:, :, 3:4]
    h, w = rgb.shape[:2]

    px = int(position_x * w)
    py = int(position_y * h)
    flare_size = int(min(h, w) * size)

    # Radial glow
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
    dist = np.sqrt((xs - px) ** 2 + (ys - py) ** 2)
    sigma = max(1.0, flare_size * 0.5)
    glow = np.exp(-(dist**2) / (2 * sigma**2))

    overlay = np.zeros((h, w, 3), dtype=np.float32)
    color = np.array([255.0, 200.0, 100.0])  # warm golden
    for c in range(3):
        overlay[:, :, c] = glow * color[c]

    # Horizontal streak
    streak_overlay = np.zeros((h, w, 3), dtype=np.uint8)
    streak_w = max(1, flare_size // 8)
    x_end = min(w - 1, px + flare_size * 3)
    x_start = max(0, px - flare_size * 3)
    streak_color = (int(color[0] * 0.6), int(color[1] * 0.6), int(color[2] * 0.6))
    cv2.line(streak_overlay, (x_start, py), (x_end, py), streak_color, streak_w)
    streak_blur = cv2.GaussianBlur(
        streak_overlay, (0, 0), sigmaX=max(1.0, flare_size * 0.3)
    )
    overlay = overlay + streak_blur.astype(np.float32)

    result = np.clip(
        rgb.astype(np.float32) + overlay * intensity,
        0,
        255,
    ).astype(np.uint8)

    output = np.concatenate([result, alpha], axis=2)
    return output, None
