"""Pixel Haunt — ghostly slow drift with afterimage persistence."""

import numpy as np
import cv2

from effects.shared.displacement import make_physics_state, remap_frame
from engine.determinism import make_rng

EFFECT_ID = "fx.pixel_haunt"
EFFECT_NAME = "Pixel Haunt"
EFFECT_CATEGORY = "physics"

PARAMS: dict = {
    "force_type": {
        "type": "choice",
        "options": ["turbulence", "radial", "drift"],
        "default": "turbulence",
        "label": "Force Type",
        "description": "What drives the displacement",
    },
    "force_strength": {
        "type": "float",
        "min": 1.0,
        "max": 15.0,
        "default": 4.0,
        "label": "Force Strength",
        "curve": "linear",
        "description": "How hard pixels get pushed",
        "unit": "",
    },
    "ghost_persistence": {
        "type": "float",
        "min": 0.80,
        "max": 0.99,
        "default": 0.95,
        "label": "Ghost Persistence",
        "curve": "linear",
        "description": "How slowly ghosts fade (higher = longer haunting)",
        "unit": "",
    },
    "ghost_opacity": {
        "type": "float",
        "min": 0.1,
        "max": 1.0,
        "default": 0.4,
        "label": "Ghost Opacity",
        "curve": "linear",
        "description": "Peak ghost brightness",
        "unit": "",
    },
    "crackle": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.3,
        "label": "Crackle",
        "curve": "linear",
        "description": "Medium-memory noise at ghost edges",
        "unit": "",
    },
    "damping": {
        "type": "float",
        "min": 0.80,
        "max": 0.99,
        "default": 0.9,
        "label": "Damping",
        "curve": "linear",
        "description": "Velocity decay per frame",
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
    """Pixel haunt — ghostly afterimages linger where pixels used to be."""
    force_type = str(params.get("force_type", "turbulence"))
    force_strength = max(1.0, min(15.0, float(params.get("force_strength", 4.0))))
    ghost_persistence = max(
        0.80, min(0.99, float(params.get("ghost_persistence", 0.95)))
    )
    ghost_opacity = max(0.1, min(1.0, float(params.get("ghost_opacity", 0.4))))
    crackle = max(0.0, min(1.0, float(params.get("crackle", 0.3))))
    damping = max(0.80, min(0.99, float(params.get("damping", 0.9))))
    boundary = str(params.get("boundary", "wrap"))

    h, w = frame.shape[:2]
    state = dict(state_in) if state_in else {}
    if "dx" not in state:
        state.update(make_physics_state(h, w))

    if "ghost" not in state:
        state["ghost"] = np.zeros((h, w, 3), dtype=np.float32)

    alpha = frame[:, :, 3:4].copy()
    rng = make_rng(seed)

    y_grid, x_grid = np.mgrid[0:h, 0:w].astype(np.float32)
    t = frame_index / 30.0

    if force_type == "turbulence":
        phase_x = rng.random() * 100
        phase_y = rng.random() * 100
        fx = (
            force_strength
            * np.sin(x_grid / 35.0 + t * 1.5 + phase_x)
            * np.cos(y_grid / 30.0 + t * 1.2 + phase_y)
        )
        fy = (
            force_strength
            * np.cos(x_grid / 30.0 + t * 1.8 + phase_x)
            * np.sin(y_grid / 35.0 + t * 2.0 + phase_y)
        )
    elif force_type == "radial":
        cx, cy = w / 2, h / 2
        ddx = x_grid - cx
        ddy = y_grid - cy
        dist = np.sqrt(ddx * ddx + ddy * ddy) + 1.0
        pulse = np.sin(t * 2) * force_strength
        fx = ddx / dist * pulse * 0.2
        fy = ddy / dist * pulse * 0.2
    else:  # drift
        angle = t * 0.3
        fx = np.full((h, w), np.cos(angle) * force_strength * 0.3, dtype=np.float32)
        fy = np.full((h, w), np.sin(angle) * force_strength * 0.3, dtype=np.float32)

    state["vx"] = state["vx"] * damping + fx * 0.03
    state["vy"] = state["vy"] * damping + fy * 0.03
    state["dx"] += state["vx"]
    state["dy"] += state["vy"]

    # Update ghost buffer
    state["ghost"] = (
        state["ghost"] * ghost_persistence
        + frame[:, :, :3].astype(np.float32) * (1.0 - ghost_persistence) * ghost_opacity
    )

    max_disp = max(h, w) * 0.35
    state["dx"] = np.clip(state["dx"], -max_disp, max_disp)
    state["dy"] = np.clip(state["dy"], -max_disp, max_disp)

    result = remap_frame(frame, state["dx"], state["dy"], boundary).astype(np.float32)

    # Composite: displaced pixels on top of ghost afterimage
    disp_mag = np.sqrt(state["dx"] ** 2 + state["dy"] ** 2)
    ghost_reveal = np.clip(disp_mag / (max(h, w) * 0.1), 0, 1)

    for c in range(3):
        result[:, :, c] = (
            result[:, :, c] * (1.0 - ghost_reveal * ghost_opacity)
            + state["ghost"][:, :, c] * ghost_reveal
        )

    # Crackle noise at ghost boundaries
    if crackle > 0:
        crackle_rng = make_rng(seed + frame_index * 5)
        grad = (
            cv2.Sobel(ghost_reveal, cv2.CV_32F, 1, 0, ksize=3) ** 2
            + cv2.Sobel(ghost_reveal, cv2.CV_32F, 0, 1, ksize=3) ** 2
        )
        grad = np.sqrt(grad)
        grad = grad / (grad.max() + 0.01)
        noise = (
            (crackle_rng.random((h, w)).astype(np.float32) - 0.5) * crackle * 80 * grad
        )
        for c in range(3):
            result[:, :, c] += noise

    result = np.clip(result, 0, 255).astype(np.uint8)
    result[:, :, 3:4] = alpha
    return result, state
