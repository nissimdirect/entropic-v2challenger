"""Pixel Ink Drop — expanding ring displacement with tendrils."""

import numpy as np

from effects.shared.displacement import make_physics_state, remap_frame
from engine.determinism import make_rng

EFFECT_ID = "fx.pixel_inkdrop"
EFFECT_NAME = "Pixel Ink Drop"
EFFECT_CATEGORY = "physics"

PARAMS: dict = {
    "num_drops": {
        "type": "int",
        "min": 1,
        "max": 12,
        "default": 4,
        "label": "Drops",
        "description": "Number of ink drops",
        "curve": "linear",
        "unit": "",
    },
    "diffusion_rate": {
        "type": "float",
        "min": 0.5,
        "max": 8.0,
        "default": 3.0,
        "label": "Diffusion Rate",
        "curve": "linear",
        "description": "How fast ink spreads",
        "unit": "",
    },
    "surface_tension": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.6,
        "label": "Surface Tension",
        "curve": "linear",
        "description": "Resistance at diffusion front",
        "unit": "",
    },
    "marangoni": {
        "type": "float",
        "min": 0.0,
        "max": 5.0,
        "default": 2.0,
        "label": "Marangoni",
        "curve": "linear",
        "description": "Tendril/finger instability strength",
        "unit": "",
    },
    "tendrils": {
        "type": "int",
        "min": 3,
        "max": 16,
        "default": 8,
        "label": "Tendrils",
        "description": "Number of fingers per drop",
        "curve": "linear",
        "unit": "",
    },
    "drop_interval": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.3,
        "label": "Drop Interval",
        "curve": "linear",
        "description": "Time between drops (0 = all at once)",
        "unit": "",
    },
    "color_shift": {
        "type": "float",
        "min": 0.0,
        "max": 2.0,
        "default": 0.5,
        "label": "Color Shift",
        "curve": "linear",
        "description": "Hue shift as ink spreads",
        "unit": "",
    },
    "boundary": {
        "type": "choice",
        "options": ["clamp", "wrap", "mirror", "black"],
        "default": "wrap",
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
    """Pixel ink drop — expanding ring displacement with tendrils."""
    num_drops = max(1, min(12, int(params.get("num_drops", 4))))
    diffusion_rate = max(0.5, min(8.0, float(params.get("diffusion_rate", 3.0))))
    surface_tension = max(0.0, min(1.0, float(params.get("surface_tension", 0.6))))
    marangoni = max(0.0, min(5.0, float(params.get("marangoni", 2.0))))
    tendrils = max(3, min(16, int(params.get("tendrils", 8))))
    drop_interval = max(0.0, min(1.0, float(params.get("drop_interval", 0.3))))
    color_shift = max(0.0, min(2.0, float(params.get("color_shift", 0.5))))
    boundary = str(params.get("boundary", "wrap"))

    h, w = frame.shape[:2]
    state = dict(state_in) if state_in else {}
    if "dx" not in state:
        state.update(make_physics_state(h, w))

    alpha = frame[:, :, 3:4].copy()
    rng = make_rng(seed)

    y_grid, x_grid = np.mgrid[0:h, 0:w].astype(np.float32)
    drop_positions = rng.random((num_drops, 2))
    drop_phases = rng.random(num_drops) * np.pi * 2

    t = frame_index / 30.0
    progress = min(1.0, frame_index / 60.0)

    fx_total = np.zeros((h, w), dtype=np.float32)
    fy_total = np.zeros((h, w), dtype=np.float32)

    for i in range(num_drops):
        drop_start = i * drop_interval / max(num_drops - 1, 1) if num_drops > 1 else 0
        if progress < drop_start:
            continue

        drop_age = (progress - drop_start) / max(1.0 - drop_start, 0.01)
        drop_age = min(drop_age, 1.0)

        dx_pos = drop_positions[i, 0] * w
        dy_pos = drop_positions[i, 1] * h

        dx = x_grid - dx_pos
        dy = y_grid - dy_pos
        dist = np.sqrt(dx * dx + dy * dy) + 0.1

        front_radius = drop_age * max(h, w) * 0.2 * diffusion_rate
        front_width = front_radius * 0.15 + 5.0
        dist_from_front = dist - front_radius
        at_front = np.exp(-(dist_from_front**2) / (front_width**2))

        expand_force = at_front * diffusion_rate * 0.5
        fx_total += dx / dist * expand_force
        fy_total += dy / dist * expand_force

        if surface_tension > 0:
            tension_force = -surface_tension * at_front * np.sign(dist_from_front) * 0.3
            fx_total += dx / dist * tension_force
            fy_total += dy / dist * tension_force

        if marangoni > 0 and tendrils > 0:
            angle = np.arctan2(dy, dx)
            tendril_pattern = np.sin(angle * tendrils + drop_phases[i] + t * 0.5)
            tendril_force = tendril_pattern * at_front * marangoni * 0.4

            fx_total += dx / dist * tendril_force * 0.3
            fy_total += dy / dist * tendril_force * 0.3

            swirl = tendril_pattern * at_front * marangoni * 0.2
            fx_total += -dy / dist * swirl * 0.15
            fy_total += dx / dist * swirl * 0.15

    state["vx"] = state["vx"] * 0.88 + fx_total * 0.04
    state["vy"] = state["vy"] * 0.88 + fy_total * 0.04
    state["dx"] += state["vx"]
    state["dy"] += state["vy"]

    max_disp = max(h, w) * 0.4
    state["dx"] = np.clip(state["dx"], -max_disp, max_disp)
    state["dy"] = np.clip(state["dy"], -max_disp, max_disp)

    result = remap_frame(frame, state["dx"], state["dy"], boundary)

    if color_shift > 0:
        disp_mag = np.sqrt(state["dx"] ** 2 + state["dy"] ** 2)
        shift_mask = np.clip(disp_mag / (max(h, w) * 0.1), 0, 1) * color_shift

        if shift_mask.max() > 0.01:
            result = result.astype(np.float32)
            r, g, b = result[:, :, 0], result[:, :, 1], result[:, :, 2]
            cos_a = np.cos(shift_mask * np.pi * 0.5)
            sin_a = np.sin(shift_mask * np.pi * 0.5)
            new_r = r * cos_a + g * sin_a
            new_g = g * cos_a - r * sin_a * 0.5 + b * sin_a * 0.5
            new_b = b * cos_a - g * sin_a
            result[:, :, 0] = new_r
            result[:, :, 1] = new_g
            result[:, :, 2] = new_b
            result = np.clip(result, 0, 255).astype(np.uint8)

    result[:, :, 3:4] = alpha
    return result, state
