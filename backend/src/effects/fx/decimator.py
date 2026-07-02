"""Decimator — reduce effective frame rate by holding frames."""

import numpy as np

EFFECT_ID = "fx.decimator"
EFFECT_NAME = "Decimator"
EFFECT_CATEGORY = "temporal"

PARAMS: dict = {
    "factor": {
        "type": "int",
        "min": 2,
        "max": 16,
        "default": 4,
        "label": "Factor",
        "description": "Hold every Nth frame (2 = half framerate, 4 = quarter)",
        "curve": "linear",
        "unit": "",
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
    """Reduce effective framerate by holding every Nth frame."""
    factor = max(2, min(16, int(params.get("factor", 4))))

    state = dict(state_in) if state_in else {}

    alpha = frame[:, :, 3:4]
    rgb = frame[:, :, :3]

    if frame_index % factor == 0:
        state["held_frame"] = rgb.copy()
        state["counter"] = 0
        return np.concatenate([rgb.copy(), alpha], axis=2), state

    held = state.get("held_frame")
    if held is not None and held.shape == rgb.shape:
        state["counter"] = state.get("counter", 0) + 1
        return np.concatenate([held.copy(), alpha], axis=2), state

    return np.concatenate([rgb.copy(), alpha], axis=2), state
