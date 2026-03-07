"""Sample and Hold — hold frame for N ticks, then update."""

import numpy as np

from engine.determinism import make_rng

EFFECT_ID = "fx.sample_and_hold"
EFFECT_NAME = "Sample and Hold"
EFFECT_CATEGORY = "temporal"

PARAMS: dict = {
    "hold_frames": {
        "type": "int",
        "min": 2,
        "max": 30,
        "default": 8,
        "label": "Hold Frames",
        "description": "How many frames to hold before sampling next",
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
    """Hold frame for N ticks, then capture next."""
    hold_frames = max(2, min(30, int(params.get("hold_frames", 8))))

    state = dict(state_in) if state_in else {}
    alpha = frame[:, :, 3:4]
    rgb = frame[:, :, :3]

    held = state.get("held_frame")
    tick = state.get("tick", 0)

    if held is None or tick >= hold_frames or held.shape != rgb.shape:
        state["held_frame"] = rgb.copy()
        state["tick"] = 1
        return np.concatenate([rgb.copy(), alpha], axis=2), state

    state["tick"] = tick + 1
    return np.concatenate([held.copy(), alpha], axis=2), state
