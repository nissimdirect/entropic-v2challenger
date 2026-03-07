"""Pixel Superfluid — zero-friction flow with quantized vortices."""

import numpy as np

from effects.shared.displacement import make_physics_state, remap_frame
from engine.determinism import make_rng

EFFECT_ID = "fx.pixel_superfluid"
EFFECT_NAME = "Pixel Superfluid"
EFFECT_CATEGORY = "physics"

PARAMS: dict = {
    "flow_speed": {
        "type": "float",
        "min": 1.0,
        "max": 15.0,
        "default": 6.0,
        "label": "Flow Speed",
        "curve": "linear",
        "description": "Base flow velocity",
        "unit": "",
    },
    "quantized_vortices": {
        "type": "int",
        "min": 1,
        "max": 12,
        "default": 5,
        "label": "Vortices",
        "description": "Number of quantized vortex cores",
        "curve": "linear",
        "unit": "",
    },
    "vortex_strength": {
        "type": "float",
        "min": 1.0,
        "max": 10.0,
        "default": 4.0,
        "label": "Vortex Strength",
        "curve": "linear",
        "description": "Strength per vortex (integer units)",
        "unit": "",
    },
    "climb_force": {
        "type": "float",
        "min": 0.0,
        "max": 5.0,
        "default": 2.0,
        "label": "Climb Force",
        "curve": "linear",
        "description": "How strongly flow climbs frame edges",
        "unit": "",
    },
    "viscosity": {
        "type": "float",
        "min": 0.0,
        "max": 0.5,
        "default": 0.0,
        "label": "Viscosity",
        "curve": "linear",
        "description": "0 for true superfluid, >0 adds drag",
        "unit": "",
    },
    "thermal_noise": {
        "type": "float",
        "min": 0.0,
        "max": 3.0,
        "default": 0.5,
        "label": "Thermal Noise",
        "curve": "linear",
        "description": "Phonon excitation perturbation",
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
    """Pixel superfluid — zero-friction flow with quantized vortices."""
    flow_speed = max(1.0, min(15.0, float(params.get("flow_speed", 6.0))))
    num_vortices = max(1, min(12, int(params.get("quantized_vortices", 5))))
    vortex_strength = max(1.0, min(10.0, float(params.get("vortex_strength", 4.0))))
    climb_force = max(0.0, min(5.0, float(params.get("climb_force", 2.0))))
    viscosity = max(0.0, min(0.5, float(params.get("viscosity", 0.0))))
    thermal_noise = max(0.0, min(3.0, float(params.get("thermal_noise", 0.5))))
    boundary = str(params.get("boundary", "wrap"))

    h, w = frame.shape[:2]
    state = dict(state_in) if state_in else {}
    if "dx" not in state:
        state.update(make_physics_state(h, w))

    alpha = frame[:, :, 3:4].copy()
    rng = make_rng(seed)
    t = frame_index / 30.0

    y_grid, x_grid = np.mgrid[0:h, 0:w].astype(np.float32)

    # Base laminar flow
    base_angle = rng.random() * np.pi * 2
    base_fx = np.cos(base_angle) * flow_speed * 0.02
    base_fy = np.sin(base_angle) * flow_speed * 0.02

    fx_total = np.full((h, w), base_fx, dtype=np.float32)
    fy_total = np.full((h, w), base_fy, dtype=np.float32)

    # Quantized vortices with integer circulation
    vortex_positions = rng.random((num_vortices, 2))
    vortex_charges = rng.choice([-1, 1], size=num_vortices)

    for i in range(num_vortices):
        vx = vortex_positions[i, 0] * w + np.sin(t * 0.3 + i * 1.7) * w * 0.05
        vy = vortex_positions[i, 1] * h + np.cos(t * 0.4 + i * 2.3) * h * 0.05

        ddx = x_grid - vx
        ddy = y_grid - vy
        dist = np.sqrt(ddx * ddx + ddy * ddy) + 1.0

        quant = int(round(vortex_strength)) * vortex_charges[i]
        circ = quant / (dist + 5.0) * 50.0

        fx_total += -ddy / dist * circ * 0.02
        fy_total += ddx / dist * circ * 0.02

    # Edge climbing
    if climb_force > 0:
        near_left = np.exp(-x_grid / (w * 0.05))
        near_right = np.exp(-(w - x_grid) / (w * 0.05))
        near_top = np.exp(-y_grid / (h * 0.05))
        near_bottom = np.exp(-(h - y_grid) / (h * 0.05))

        fx_total += -(near_top + near_bottom) * climb_force * 0.3
        fy_total += -(near_left + near_right) * climb_force * 0.3

    # Thermal noise
    if thermal_noise > 0:
        noise_rng = make_rng(seed + frame_index * 3)
        fx_total += (
            (noise_rng.random((h, w)).astype(np.float32) - 0.5) * thermal_noise * 0.3
        )
        fy_total += (
            (noise_rng.random((h, w)).astype(np.float32) - 0.5) * thermal_noise * 0.3
        )

    # Zero viscosity = no damping
    effective_damping = 1.0 - viscosity * 0.1
    state["vx"] = state["vx"] * effective_damping + fx_total * 0.03
    state["vy"] = state["vy"] * effective_damping + fy_total * 0.03
    state["dx"] += state["vx"]
    state["dy"] += state["vy"]

    max_disp = max(h, w) * 0.5
    state["dx"] = np.clip(state["dx"], -max_disp, max_disp)
    state["dy"] = np.clip(state["dy"], -max_disp, max_disp)

    result = remap_frame(frame, state["dx"], state["dy"], boundary).astype(np.float32)

    # Vortex core glow
    for i in range(num_vortices):
        vx_pos = vortex_positions[i, 0] * w + np.sin(t * 0.3 + i * 1.7) * w * 0.05
        vy_pos = vortex_positions[i, 1] * h + np.cos(t * 0.4 + i * 2.3) * h * 0.05
        cdx = x_grid - vx_pos
        cdy = y_grid - vy_pos
        cdist = np.sqrt(cdx * cdx + cdy * cdy) + 0.1
        core_glow = np.exp(-(cdist**2) / 100.0) * 40
        if vortex_charges[i] > 0:
            result[:, :, 0] += core_glow * 0.4
            result[:, :, 1] += core_glow * 0.6
            result[:, :, 2] += core_glow
        else:
            result[:, :, 2] += core_glow
            result[:, :, 1] += core_glow * 0.3

    result = np.clip(result, 0, 255).astype(np.uint8)
    result[:, :, 3:4] = alpha
    return result, state
