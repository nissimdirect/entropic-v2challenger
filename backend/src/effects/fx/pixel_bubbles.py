"""Pixel Bubbles — multiple portals with void interiors."""

import numpy as np

from effects.shared.displacement import make_physics_state, remap_frame
from engine.determinism import make_rng

EFFECT_ID = "fx.pixel_bubbles"
EFFECT_NAME = "Pixel Bubbles"
EFFECT_CATEGORY = "physics"

PARAMS: dict = {
    "num_portals": {
        "type": "int",
        "min": 1,
        "max": 20,
        "default": 6,
        "label": "Portals",
        "description": "Number of bubble portals",
        "curve": "linear",
        "unit": "",
    },
    "min_radius": {
        "type": "float",
        "min": 0.01,
        "max": 0.1,
        "default": 0.03,
        "label": "Min Radius",
        "curve": "linear",
        "description": "Smallest portal as fraction of frame",
        "unit": "",
    },
    "max_radius": {
        "type": "float",
        "min": 0.05,
        "max": 0.3,
        "default": 0.12,
        "label": "Max Radius",
        "curve": "linear",
        "description": "Largest portal as fraction of frame",
        "unit": "",
    },
    "pull_strength": {
        "type": "float",
        "min": 1.0,
        "max": 15.0,
        "default": 6.0,
        "label": "Pull Strength",
        "curve": "linear",
        "description": "Inward pull toward each portal center",
        "unit": "",
    },
    "spin": {
        "type": "float",
        "min": 0.0,
        "max": 8.0,
        "default": 1.5,
        "label": "Spin",
        "curve": "linear",
        "description": "Rotational distortion at each mouth",
        "unit": "",
    },
    "void_mode": {
        "type": "choice",
        "options": ["black", "white", "invert"],
        "default": "black",
        "label": "Void Mode",
        "description": "What fills the portal interior",
    },
    "wander": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.4,
        "label": "Wander",
        "curve": "linear",
        "description": "How much portals drift over time",
        "unit": "",
    },
    "damping": {
        "type": "float",
        "min": 0.80,
        "max": 0.99,
        "default": 0.91,
        "label": "Damping",
        "curve": "linear",
        "description": "Velocity decay per frame",
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
    """Pixel bubbles — multiple portals with void interiors."""
    num_portals = max(1, min(20, int(params.get("num_portals", 6))))
    min_radius = max(0.01, min(0.1, float(params.get("min_radius", 0.03))))
    max_radius = max(0.05, min(0.3, float(params.get("max_radius", 0.12))))
    pull_strength = max(1.0, min(15.0, float(params.get("pull_strength", 6.0))))
    spin = max(0.0, min(8.0, float(params.get("spin", 1.5))))
    void_mode = str(params.get("void_mode", "black"))
    wander = max(0.0, min(1.0, float(params.get("wander", 0.4))))
    damping = max(0.80, min(0.99, float(params.get("damping", 0.91))))
    boundary = str(params.get("boundary", "black"))

    h, w = frame.shape[:2]
    state = dict(state_in) if state_in else {}
    if "dx" not in state:
        state.update(make_physics_state(h, w))

    alpha = frame[:, :, 3:4].copy()
    rng = make_rng(seed)
    t = frame_index / 30.0

    positions = rng.random((num_portals, 2))
    safe_min = min(min_radius, max_radius)
    safe_max = max(min_radius, max_radius)
    if safe_max <= safe_min:
        safe_max = safe_min + 0.01
    radii_frac = rng.uniform(safe_min, safe_max, num_portals)

    y_grid, x_grid = np.mgrid[0:h, 0:w].astype(np.float32)
    fx_total = np.zeros((h, w), dtype=np.float32)
    fy_total = np.zeros((h, w), dtype=np.float32)

    portal_data = []
    for i in range(num_portals):
        px = positions[i, 0] * w
        py = positions[i, 1] * h
        radius_px = radii_frac[i] * max(h, w)

        if wander > 0:
            px += np.sin(t * (0.3 + i * 0.1) + i * 2.1) * w * wander * 0.1
            py += np.cos(t * (0.4 + i * 0.15) + i * 1.7) * h * wander * 0.1

        portal_data.append((px, py, radius_px))

        dx = x_grid - px
        dy = y_grid - py
        dist = np.sqrt(dx * dx + dy * dy) + 0.1

        proximity = np.exp(-(dist * dist) / (radius_px * radius_px * 4))
        fx_total += -dx / dist * pull_strength * proximity * 0.3
        fy_total += -dy / dist * pull_strength * proximity * 0.3

        spin_factor = spin * np.exp(-dist / (radius_px * 1.5))
        fx_total += -dy / dist * spin_factor * 0.2
        fy_total += dx / dist * spin_factor * 0.2

    state["vx"] = state["vx"] * damping + fx_total * 0.05
    state["vy"] = state["vy"] * damping + fy_total * 0.05
    state["dx"] += state["vx"]
    state["dy"] += state["vy"]

    max_disp = max(h, w) * 0.5
    state["dx"] = np.clip(state["dx"], -max_disp, max_disp)
    state["dy"] = np.clip(state["dy"], -max_disp, max_disp)

    result = remap_frame(frame, state["dx"], state["dy"], boundary).astype(np.float32)

    # Void inside each portal + glow ring
    for px, py, radius_px in portal_data:
        dx = x_grid - px
        dy = y_grid - py
        dist = np.sqrt(dx * dx + dy * dy) + 0.1

        void_mask = 1.0 / (
            1.0 + np.exp((dist - radius_px * 0.7) / (radius_px * 0.1 + 0.1))
        )

        if void_mode == "black":
            for c in range(3):
                result[:, :, c] *= 1.0 - void_mask
        elif void_mode == "white":
            for c in range(3):
                result[:, :, c] = (
                    result[:, :, c] * (1.0 - void_mask) + 255.0 * void_mask
                )
        elif void_mode == "invert":
            for c in range(3):
                result[:, :, c] = (
                    result[:, :, c] * (1.0 - void_mask)
                    + (255.0 - result[:, :, c]) * void_mask
                )

        ring = np.exp(-((dist - radius_px) ** 2) / (radius_px * radius_px * 0.08))
        result[:, :, 0] += ring * 25
        result[:, :, 1] += ring * 40
        result[:, :, 2] += ring * 50

    result = np.clip(result, 0, 255).astype(np.uint8)
    result[:, :, 3:4] = alpha
    return result, state
