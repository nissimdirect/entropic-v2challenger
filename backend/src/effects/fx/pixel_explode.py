"""Pixel Explode — radial blast from origin point."""

import numpy as np

from effects.shared.displacement import make_physics_state, remap_frame
from engine.determinism import make_rng

EFFECT_ID = "fx.pixel_explode"
EFFECT_NAME = "Pixel Explode"
EFFECT_CATEGORY = "physics"

PARAMS: dict = {
    "origin": {
        "type": "choice",
        "options": ["center", "random", "top", "bottom"],
        "default": "center",
        "label": "Origin",
        "description": "Explosion center point",
    },
    "force": {
        "type": "float",
        "min": 1.0,
        "max": 30.0,
        "default": 10.0,
        "label": "Force",
        "curve": "linear",
        "description": "Initial blast force",
        "unit": "",
    },
    "damping": {
        "type": "float",
        "min": 0.80,
        "max": 0.99,
        "default": 0.96,
        "label": "Damping",
        "curve": "linear",
        "description": "How fast explosion energy decays",
        "unit": "",
    },
    "gravity": {
        "type": "float",
        "min": 0.0,
        "max": 5.0,
        "default": 0.0,
        "label": "Gravity",
        "curve": "linear",
        "description": "Downward pull after explosion",
        "unit": "",
    },
    "scatter": {
        "type": "float",
        "min": 0.0,
        "max": 5.0,
        "default": 0.0,
        "label": "Scatter",
        "curve": "linear",
        "description": "Random turbulence during flight",
        "unit": "",
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
    """Pixel explode — radial blast from origin."""
    origin = str(params.get("origin", "center"))
    force = max(1.0, min(30.0, float(params.get("force", 10.0))))
    damping = max(0.80, min(0.99, float(params.get("damping", 0.96))))
    gravity_val = max(0.0, min(5.0, float(params.get("gravity", 0.0))))
    scatter = max(0.0, min(5.0, float(params.get("scatter", 0.0))))
    boundary = str(params.get("boundary", "black"))

    h, w = frame.shape[:2]
    state = dict(state_in) if state_in else {}
    if "dx" not in state:
        state.update(make_physics_state(h, w))

    alpha = frame[:, :, 3:4].copy()
    rng = make_rng(seed + frame_index)

    if origin == "center":
        ox, oy = w / 2, h / 2
    elif origin == "random":
        srng = make_rng(seed)
        ox, oy = srng.random() * w, srng.random() * h
    elif origin == "top":
        ox, oy = w / 2, 0
    elif origin == "bottom":
        ox, oy = w / 2, h
    else:
        ox, oy = w / 2, h / 2

    y_grid, x_grid = np.mgrid[0:h, 0:w].astype(np.float32)

    # On first frame, apply initial blast
    if frame_index == 0:
        dx = x_grid - ox
        dy = y_grid - oy
        dist = np.sqrt(dx * dx + dy * dy) + 1.0
        blast = force * 50.0 / (dist + 10.0)
        state["vx"] = dx / dist * blast * 0.1
        state["vy"] = dy / dist * blast * 0.1

    state["vx"] *= damping
    state["vy"] *= damping

    if gravity_val > 0:
        state["vy"] += gravity_val * 0.1

    if scatter > 0:
        state["vx"] += (rng.random((h, w)).astype(np.float32) - 0.5) * scatter * 0.5
        state["vy"] += (rng.random((h, w)).astype(np.float32) - 0.5) * scatter * 0.5

    state["dx"] += state["vx"]
    state["dy"] += state["vy"]

    max_disp = max(h, w) * 0.5
    state["dx"] = np.clip(state["dx"], -max_disp, max_disp)
    state["dy"] = np.clip(state["dy"], -max_disp, max_disp)

    result = remap_frame(frame, state["dx"], state["dy"], boundary)
    result[:, :, 3:4] = alpha
    return result, state
