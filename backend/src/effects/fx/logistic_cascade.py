"""Logistic Cascade — map pixel brightness through iterated logistic map."""

import numpy as np

EFFECT_ID = "fx.logistic_cascade"
EFFECT_NAME = "Logistic Cascade"
EFFECT_CATEGORY = "info_theory"

PARAMS: dict = {
    "r": {
        "type": "float",
        "min": 2.5,
        "max": 4.0,
        "default": 3.7,
        "label": "R",
        "curve": "linear",
        "unit": "",
        "description": "Logistic map parameter (3.57+ = chaos)",
    },
    "iterations": {
        "type": "int",
        "min": 1,
        "max": 20,
        "default": 5,
        "label": "Iterations",
        "curve": "linear",
        "unit": "",
        "description": "Number of logistic map iterations",
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
    """Iterate logistic map on pixel brightness: x -> r*x*(1-x)."""
    r = max(2.5, min(4.0, float(params.get("r", 3.7))))
    iterations = max(1, min(20, int(params.get("iterations", 5))))

    rgb = frame[:, :, :3].astype(np.float32) / 255.0
    alpha = frame[:, :, 3:4]

    # Clamp to (0, 1) exclusive to avoid fixed points at 0/1
    x = np.clip(rgb, 0.001, 0.999)

    for _ in range(iterations):
        x = r * x * (1.0 - x)

    x = np.clip(x, 0.0, 1.0)
    result_rgb = (x * 255).astype(np.uint8)
    return np.concatenate([result_rgb, alpha], axis=2), None
