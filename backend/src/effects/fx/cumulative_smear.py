"""Cumulative Smear — directional paint-smear / light-trail effect."""

import numpy as np

EFFECT_ID = "fx.cumulative_smear"
EFFECT_NAME = "Cumulative Smear"
EFFECT_CATEGORY = "distortion"

PARAMS: dict = {
    "direction": {
        "type": "choice",
        "options": ["horizontal", "vertical", "diagonal_left", "diagonal_right"],
        "default": "horizontal",
        "label": "Direction",
        "description": "Smear direction",
    },
    "decay": {
        "type": "float",
        "min": 0.5,
        "max": 0.999,
        "default": 0.95,
        "label": "Decay",
        "curve": "logarithmic",
        "unit": "%",
        "description": "Smear trail length (higher = longer trails)",
    },
    "animate": {
        "type": "choice",
        "options": ["false", "true"],
        "default": "false",
        "label": "Animate",
        "description": "Cycle direction over time",
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
    """Directional paint-smear — each pixel takes max of itself or decayed neighbor."""
    direction = str(params.get("direction", "horizontal"))
    decay = max(0.5, min(0.999, float(params.get("decay", 0.95))))
    animate = str(params.get("animate", "false")).lower() == "true"

    rgb = frame[:, :, :3].astype(np.float32) / 255.0
    alpha = frame[:, :, 3:4]
    h, w = rgb.shape[:2]

    if animate:
        directions = ["horizontal", "vertical", "diagonal_left", "diagonal_right"]
        direction = directions[(frame_index // 15) % 4]

    if direction == "vertical":
        for y in range(1, h):
            rgb[y] = np.maximum(rgb[y], rgb[y - 1] * decay)
    elif direction == "diagonal_left":
        for y in range(1, h):
            rgb[y, 1:] = np.maximum(rgb[y, 1:], rgb[y - 1, :-1] * decay)
    elif direction == "diagonal_right":
        for y in range(1, h):
            rgb[y, :-1] = np.maximum(rgb[y, :-1], rgb[y - 1, 1:] * decay)
    else:  # horizontal
        for x in range(1, w):
            rgb[:, x] = np.maximum(rgb[:, x], rgb[:, x - 1] * decay)

    result_rgb = np.clip(rgb * 255, 0, 255).astype(np.uint8)
    return np.concatenate([result_rgb, alpha], axis=2), None
