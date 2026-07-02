"""Mirror — reflect one half of the image onto the other."""

import numpy as np

EFFECT_ID = "fx.mirror"
EFFECT_NAME = "Mirror"
EFFECT_CATEGORY = "distortion"

PARAMS: dict = {
    "axis": {
        "type": "choice",
        "options": ["vertical", "horizontal"],
        "default": "vertical",
        "label": "Axis",
        "description": "Mirror axis (vertical=left-right, horizontal=top-bottom)",
    },
    "position": {
        "type": "float",
        "min": 0.1,
        "max": 0.9,
        "default": 0.5,
        "label": "Position",
        "curve": "linear",
        "unit": "%",
        "description": "Split position (0.1-0.9)",
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
    """Mirror one half onto the other — vertical or horizontal axis."""
    axis = str(params.get("axis", "vertical"))
    position = max(0.1, min(0.9, float(params.get("position", 0.5))))

    h, w = frame.shape[:2]
    rgb = frame[:, :, :3].copy()
    alpha = frame[:, :, 3:4]

    if axis == "horizontal":
        split = int(h * position)
        top = rgb[:split]
        fill = top[::-1][: h - split]
        rgb[split : split + fill.shape[0]] = fill
    else:
        split = int(w * position)
        left = rgb[:, :split]
        fill = left[:, ::-1][:, : w - split]
        rgb[:, split : split + fill.shape[1]] = fill

    return np.concatenate([rgb, alpha], axis=2), None
