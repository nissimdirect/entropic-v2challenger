"""Cellular Automata — Game of Life and other CA rules on pixel brightness."""

import numpy as np
from scipy.signal import convolve2d

EFFECT_ID = "fx.cellular_automata"
EFFECT_NAME = "Cellular Automata"
EFFECT_CATEGORY = "emergent"

PARAMS: dict = {
    "rule": {
        "type": "choice",
        "options": ["life", "highlife", "seeds"],
        "default": "life",
        "label": "Rule",
        "description": "Cellular automaton rule set",
    },
    "threshold": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.5,
        "label": "Threshold",
        "curve": "linear",
        "unit": "",
        "description": "Brightness threshold for alive/dead",
    },
    "steps_per_frame": {
        "type": "int",
        "min": 1,
        "max": 5,
        "default": 1,
        "label": "Steps/Frame",
        "curve": "linear",
        "unit": "",
        "description": "CA iterations per video frame",
    },
    "mix": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.5,
        "label": "Mix",
        "curve": "linear",
        "unit": "%",
        "description": "Blend between CA pattern and original",
    },
}

_NEIGHBOR_KERNEL = np.array([[1, 1, 1], [1, 0, 1], [1, 1, 1]], dtype=np.int32)


def _step_ca(grid: np.ndarray, rule: str) -> np.ndarray:
    """Run one CA step. Grid is binary int32."""
    neighbors = convolve2d(grid, _NEIGHBOR_KERNEL, mode="same", boundary="wrap")
    if rule == "highlife":
        # B36/S23
        birth = ((neighbors == 3) | (neighbors == 6)) & (grid == 0)
        survive = ((neighbors == 2) | (neighbors == 3)) & (grid == 1)
    elif rule == "seeds":
        # B2/S (no survival)
        birth = (neighbors == 2) & (grid == 0)
        survive = np.zeros_like(grid, dtype=bool)
    else:
        # Conway's Game of Life B3/S23
        birth = (neighbors == 3) & (grid == 0)
        survive = ((neighbors == 2) | (neighbors == 3)) & (grid == 1)
    return (birth | survive).astype(np.int32)


def apply(
    frame: np.ndarray,
    params: dict,
    state_in: dict | None = None,
    *,
    frame_index: int,
    seed: int,
    resolution: tuple[int, int],
) -> tuple[np.ndarray, dict | None]:
    """Cellular automata evolving on frame brightness."""
    rule = str(params.get("rule", "life"))
    threshold = max(0.0, min(1.0, float(params.get("threshold", 0.5))))
    steps = max(1, min(5, int(params.get("steps_per_frame", 1))))
    mix = max(0.0, min(1.0, float(params.get("mix", 0.5))))

    h, w = frame.shape[:2]
    rgb = frame[:, :, :3]
    alpha = frame[:, :, 3:4]

    # Initialize or restore grid
    if state_in is not None and "grid" in state_in:
        grid = state_in["grid"]
        if grid.shape != (h, w):
            luma = (
                0.299 * rgb[:, :, 0].astype(np.float32)
                + 0.587 * rgb[:, :, 1].astype(np.float32)
                + 0.114 * rgb[:, :, 2].astype(np.float32)
            ) / 255.0
            grid = (luma > threshold).astype(np.int32)
    else:
        luma = (
            0.299 * rgb[:, :, 0].astype(np.float32)
            + 0.587 * rgb[:, :, 1].astype(np.float32)
            + 0.114 * rgb[:, :, 2].astype(np.float32)
        ) / 255.0
        grid = (luma > threshold).astype(np.int32)

    # Run CA steps
    for _ in range(steps):
        grid = _step_ca(grid, rule)

    # Map grid back: alive = original pixel, dead = darkened
    alive_mask = grid.astype(np.float32)[:, :, np.newaxis]
    dark = rgb.astype(np.float32) * 0.1
    ca_image = rgb.astype(np.float32) * alive_mask + dark * (1.0 - alive_mask)

    # Mix with original
    result = ca_image * mix + rgb.astype(np.float32) * (1.0 - mix)
    result_rgb = np.clip(result, 0, 255).astype(np.uint8)

    return np.concatenate([result_rgb, alpha], axis=2), {"grid": grid}
