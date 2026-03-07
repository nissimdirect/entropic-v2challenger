"""Frame Drop — randomly drop frames to black, simulating signal dropout."""

import numpy as np

from engine.determinism import make_rng

EFFECT_ID = "fx.frame_drop"
EFFECT_NAME = "Frame Drop"
EFFECT_CATEGORY = "temporal"

PARAMS: dict = {
    "drop_rate": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.3,
        "label": "Drop Rate",
        "curve": "linear",
        "unit": "",
        "description": "Probability of dropping each frame to black",
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
    """Drop frames to black based on seeded probability."""
    drop_rate = max(0.0, min(1.0, float(params.get("drop_rate", 0.3))))

    rng = make_rng(seed + frame_index)
    if rng.random() < drop_rate:
        result = frame.copy()
        result[:, :, :3] = 0
        return result, None

    return frame.copy(), None
