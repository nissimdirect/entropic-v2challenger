"""Strobe — flash white or black on interval."""

import numpy as np

EFFECT_ID = "fx.strobe"
EFFECT_NAME = "Strobe"
EFFECT_CATEGORY = "temporal"

PARAMS: dict = {
    "interval": {
        "type": "int",
        "min": 2,
        "max": 30,
        "default": 4,
        "label": "Interval",
        "description": "Flash every N frames",
        "curve": "linear",
        "unit": "",
    },
    "color": {
        "type": "choice",
        "options": ["white", "black"],
        "default": "white",
        "label": "Color",
        "description": "Flash color",
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
    """Flash white or black at regular intervals."""
    interval = max(2, min(30, int(params.get("interval", 4))))
    color = str(params.get("color", "white"))

    if frame_index % interval == 0:
        result = frame.copy()
        fill = 255 if color == "white" else 0
        result[:, :, :3] = fill
        return result, None

    return frame.copy(), None
