"""Pixel Melt — gravity and viscosity dripping."""

import numpy as np

from effects.shared.displacement import make_physics_state, remap_frame
from engine.determinism import make_rng

EFFECT_ID = "fx.pixel_melt"
EFFECT_NAME = "Pixel Melt"
EFFECT_CATEGORY = "physics"

PARAMS: dict = {
    "heat": {
        "type": "float",
        "min": 0.0,
        "max": 10.0,
        "default": 3.0,
        "label": "Heat",
        "curve": "linear",
        "description": "Horizontal turbulence during melting",
        "unit": "",
    },
    "gravity": {
        "type": "float",
        "min": 0.5,
        "max": 10.0,
        "default": 2.0,
        "label": "Gravity",
        "curve": "linear",
        "description": "Downward pull strength",
        "unit": "",
    },
    "viscosity": {
        "type": "float",
        "min": 0.85,
        "max": 0.99,
        "default": 0.95,
        "label": "Viscosity",
        "curve": "linear",
        "description": "Flow resistance (higher = flows longer)",
        "unit": "",
    },
    "melt_source": {
        "type": "choice",
        "options": ["top", "bottom", "edges", "all"],
        "default": "top",
        "label": "Melt Source",
        "description": "Where melting starts",
    },
    "boundary": {
        "type": "choice",
        "options": ["clamp", "wrap", "mirror", "black"],
        "default": "black",
        "label": "Boundary",
        "description": "Edge behavior for displaced pixels",
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
    """Pixel melt — gravity and viscosity dripping."""
    heat = max(0.0, min(10.0, float(params.get("heat", 3.0))))
    gravity_val = max(0.5, min(10.0, float(params.get("gravity", 2.0))))
    viscosity = max(0.85, min(0.99, float(params.get("viscosity", 0.95))))
    melt_source = str(params.get("melt_source", "top"))
    boundary = str(params.get("boundary", "black"))

    h, w = frame.shape[:2]
    state = dict(state_in) if state_in else {}
    if "dx" not in state:
        state.update(make_physics_state(h, w))

    alpha = frame[:, :, 3:4].copy()
    rng = make_rng(seed)

    y_grid, x_grid = np.mgrid[0:h, 0:w].astype(np.float32)
    phase = rng.random() * 100
    t = frame_index / 30.0
    progress = min(1.0, frame_index / 60.0)

    if melt_source == "top":
        melt_mask = np.clip((progress * h * 1.5 - y_grid) / (h * 0.2), 0, 1)
    elif melt_source == "bottom":
        melt_mask = np.clip((progress * h * 1.5 - (h - y_grid)) / (h * 0.2), 0, 1)
    elif melt_source == "edges":
        dist_x = np.minimum(x_grid, w - x_grid) / (w * 0.5)
        dist_y = np.minimum(y_grid, h - y_grid) / (h * 0.5)
        dist_edge = np.minimum(dist_x, dist_y)
        melt_mask = np.clip((progress * 1.5 - dist_edge) / 0.2, 0, 1)
    else:  # "all"
        melt_mask = np.full((h, w), progress, dtype=np.float32)

    fy_force = gravity_val * melt_mask * 0.3
    fx_force = heat * np.sin(x_grid / 20.0 + t * 2 + phase) * melt_mask * 0.2

    state["vx"] = state["vx"] * viscosity + fx_force
    state["vy"] = state["vy"] * viscosity + fy_force
    state["dx"] += state["vx"] * melt_mask
    state["dy"] += state["vy"] * melt_mask

    max_disp = max(h, w) * 0.5
    state["dx"] = np.clip(state["dx"], -max_disp, max_disp)
    state["dy"] = np.clip(state["dy"], -max_disp, max_disp)

    result = remap_frame(frame, state["dx"], state["dy"], boundary)
    result[:, :, 3:4] = alpha
    return result, state
