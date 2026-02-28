"""Row Shift — scanline displacement / horizontal tearing."""

import numpy as np

from engine.determinism import make_rng

EFFECT_ID = "fx.row_shift"
EFFECT_NAME = "Row Shift"
EFFECT_CATEGORY = "destruction"

PARAMS: dict = {
    "max_shift": {
        "type": "int",
        "min": 1,
        "max": 500,
        "default": 30,
        "label": "Max Shift",
        "curve": "linear",
        "unit": "px",
        "description": "Maximum pixel displacement",
    },
    "density": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.3,
        "label": "Density",
        "curve": "linear",
        "unit": "%",
        "description": "Fraction of rows to shift",
    },
    "direction": {
        "type": "choice",
        "options": ["horizontal", "vertical", "both"],
        "default": "horizontal",
        "label": "Direction",
        "description": "Shift direction",
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
    """Shift random rows/columns — creates torn signal interference look."""
    h, w = frame.shape[:2]
    max_shift = max(1, min(max(h, w), int(params.get("max_shift", 30))))
    density = max(0.0, min(1.0, float(params.get("density", 0.3))))
    direction = str(params.get("direction", "horizontal"))
    rng = make_rng(seed)

    rgb = frame[:, :, :3].copy()
    alpha = frame[:, :, 3:4]

    if direction in ("horizontal", "both"):
        # Vectorized: generate all random values at once, then apply shifts
        row_rand = rng.random(h)
        row_shifts = rng.integers(-max_shift, max_shift + 1, size=h)
        affected = row_rand < density
        for y in np.nonzero(affected)[0]:
            rgb[y] = np.roll(rgb[y], int(row_shifts[y]), axis=0)

    if direction in ("vertical", "both"):
        col_rand = rng.random(w)
        col_shifts = rng.integers(-max_shift, max_shift + 1, size=w)
        affected = col_rand < density
        for x in np.nonzero(affected)[0]:
            rgb[:, x] = np.roll(rgb[:, x], int(col_shifts[x]), axis=0)

    return np.concatenate([rgb, alpha], axis=2), None
