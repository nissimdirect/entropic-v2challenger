"""Pixel Singularity — black hole, elastic springs, quantum tunneling."""

import numpy as np
import cv2

from effects.shared.displacement import make_physics_state, remap_frame
from engine.determinism import make_rng

EFFECT_ID = "fx.pixel_singularity"
EFFECT_NAME = "Pixel Singularity"
EFFECT_CATEGORY = "physics"

PARAMS: dict = {
    "mode": {
        "type": "choice",
        "options": ["blackhole", "elastic", "quantum"],
        "default": "blackhole",
        "label": "Mode",
        "description": "Singularity type: blackhole, elastic springs, quantum tunneling",
    },
    "intensity": {
        "type": "float",
        "min": 1.0,
        "max": 30.0,
        "default": 10.0,
        "label": "Intensity",
        "curve": "linear",
        "description": "Primary force strength",
        "unit": "",
    },
    "spin": {
        "type": "float",
        "min": 0.0,
        "max": 10.0,
        "default": 3.0,
        "label": "Spin",
        "curve": "linear",
        "description": "Rotational force (blackhole frame-dragging)",
        "unit": "",
    },
    "event_horizon": {
        "type": "float",
        "min": 0.02,
        "max": 0.3,
        "default": 0.08,
        "label": "Event Horizon",
        "curve": "linear",
        "description": "Singularity radius as fraction of frame (blackhole)",
        "unit": "",
    },
    "spaghettify": {
        "type": "float",
        "min": 0.0,
        "max": 15.0,
        "default": 5.0,
        "label": "Spaghettify",
        "curve": "linear",
        "description": "Radial stretch inside horizon (blackhole)",
        "unit": "",
    },
    "accretion_glow": {
        "type": "float",
        "min": 0.0,
        "max": 2.0,
        "default": 0.8,
        "label": "Accretion Glow",
        "curve": "linear",
        "description": "Brightness of ring around event horizon (blackhole)",
        "unit": "",
    },
    "hawking": {
        "type": "float",
        "min": 0.0,
        "max": 3.0,
        "default": 0.0,
        "label": "Hawking Radiation",
        "curve": "linear",
        "description": "Noise emission near horizon (blackhole)",
        "unit": "",
    },
    "position": {
        "type": "choice",
        "options": ["center", "random", "wander"],
        "default": "center",
        "label": "Position",
        "description": "Singularity location (blackhole)",
    },
    "stiffness": {
        "type": "float",
        "min": 0.05,
        "max": 0.8,
        "default": 0.3,
        "label": "Stiffness",
        "curve": "linear",
        "description": "Spring stiffness (elastic mode)",
        "unit": "",
    },
    "mass": {
        "type": "float",
        "min": 0.5,
        "max": 3.0,
        "default": 1.0,
        "label": "Mass",
        "curve": "linear",
        "description": "Pixel mass / inertia (elastic mode)",
        "unit": "",
    },
    "force_type": {
        "type": "choice",
        "options": [
            "turbulence",
            "brightness",
            "edges",
            "radial",
            "vortex",
            "wave",
            "shatter",
            "pulse",
            "gravity",
            "magnetic",
            "wind",
            "explosion",
        ],
        "default": "turbulence",
        "label": "Force Type",
        "description": "What drives displacement (elastic mode)",
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
    "tunnel_prob": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.3,
        "label": "Tunnel Probability",
        "curve": "linear",
        "description": "Chance of tunneling through barrier (quantum)",
        "unit": "",
    },
    "barrier_count": {
        "type": "int",
        "min": 1,
        "max": 10,
        "default": 4,
        "label": "Barriers",
        "description": "Number of quantum barriers (quantum)",
        "curve": "linear",
        "unit": "",
    },
    "uncertainty": {
        "type": "float",
        "min": 1.0,
        "max": 15.0,
        "default": 5.0,
        "label": "Uncertainty",
        "curve": "linear",
        "description": "Heisenberg position spread (quantum)",
        "unit": "",
    },
    "superposition": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.4,
        "label": "Superposition",
        "curve": "linear",
        "description": "Ghost copy strength (quantum)",
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
    """Pixel singularity — blackhole, elastic, quantum."""
    mode = str(params.get("mode", "blackhole"))
    boundary = str(params.get("boundary", "black"))

    h, w = frame.shape[:2]
    state = dict(state_in) if state_in else {}
    if "dx" not in state:
        state.update(make_physics_state(h, w))

    alpha = frame[:, :, 3:4].copy()
    rng = make_rng(seed)
    t = frame_index / 30.0

    if mode == "blackhole":
        result = _apply_blackhole(
            state, frame, h, w, t, params, rng, seed, frame_index, boundary
        )
        result[:, :, 3:4] = alpha
        return result, state
    elif mode == "elastic":
        _apply_elastic(state, frame, h, w, t, params, rng, seed, frame_index)
    elif mode == "quantum":
        result = _apply_quantum(
            state, frame, h, w, t, params, rng, seed, frame_index, boundary
        )
        result[:, :, 3:4] = alpha
        return result, state

    max_disp = max(h, w) * 0.3
    state["dx"] = np.clip(state["dx"], -max_disp, max_disp)
    state["dy"] = np.clip(state["dy"], -max_disp, max_disp)

    result = remap_frame(frame, state["dx"], state["dy"], boundary)
    result[:, :, 3:4] = alpha
    return result, state


def _apply_blackhole(state, frame, h, w, t, params, rng, seed, frame_index, boundary):
    mass = max(1.0, min(30.0, float(params.get("intensity", 10.0))))
    spin = max(0.0, min(10.0, float(params.get("spin", 3.0))))
    event_horizon = max(0.02, min(0.3, float(params.get("event_horizon", 0.08))))
    spaghettify = max(0.0, min(15.0, float(params.get("spaghettify", 5.0))))
    accretion_glow = max(0.0, min(2.0, float(params.get("accretion_glow", 0.8))))
    hawking = max(0.0, min(3.0, float(params.get("hawking", 0.0))))
    position = str(params.get("position", "center"))

    if position == "center":
        cx, cy = w / 2, h / 2
    elif position == "random":
        srng = make_rng(seed)
        cx, cy = srng.random() * w, srng.random() * h
    else:  # wander
        cx = w / 2 + np.sin(t * 0.3) * w * 0.2
        cy = h / 2 + np.cos(t * 0.4) * h * 0.2

    y_grid, x_grid = np.mgrid[0:h, 0:w].astype(np.float32)
    dx = x_grid - cx
    dy = y_grid - cy
    dist = np.sqrt(dx * dx + dy * dy) + 0.1
    horizon_px = event_horizon * max(h, w)

    grav_force = mass * 500.0 / (dist * dist + horizon_px * 0.5)
    fx = -dx / dist * grav_force * 0.02
    fy = -dy / dist * grav_force * 0.02

    spin_factor = spin * np.exp(-dist / (horizon_px * 3))
    fx += -dy / dist * spin_factor * 0.5
    fy += dx / dist * spin_factor * 0.5

    inside_horizon = (dist < horizon_px * 2).astype(np.float32)
    stretch = spaghettify * inside_horizon * (1.0 - dist / (horizon_px * 2))
    stretch = np.clip(stretch, 0, spaghettify)
    fx += dx / dist * stretch * 0.3
    fy += dy / dist * stretch * 0.3

    state["vx"] = state["vx"] * 0.92 + fx
    state["vy"] = state["vy"] * 0.92 + fy
    state["dx"] += state["vx"]
    state["dy"] += state["vy"]

    max_disp = max(h, w) * 0.5
    state["dx"] = np.clip(state["dx"], -max_disp, max_disp)
    state["dy"] = np.clip(state["dy"], -max_disp, max_disp)

    result = remap_frame(frame, state["dx"], state["dy"], boundary).astype(np.float32)

    if accretion_glow > 0:
        ring = np.exp(
            -((dist - horizon_px * 1.5) ** 2) / (horizon_px * horizon_px * 0.5)
        )
        glow = ring * accretion_glow * 80
        result[:, :, 2] += glow
        result[:, :, 1] += glow * 0.5
        result[:, :, 0] += glow * 0.2

    if hawking > 0:
        hawking_zone = np.exp(
            -((dist - horizon_px) ** 2) / (horizon_px * horizon_px * 0.3)
        )
        noise = rng.random((h, w)).astype(np.float32) * hawking * 60 * hawking_zone
        for c in range(3):
            result[:, :, c] += noise

    return np.clip(result, 0, 255).astype(np.uint8)


def _apply_elastic(state, frame, h, w, t, params, rng, seed, frame_index):
    stiffness = max(0.05, min(0.8, float(params.get("stiffness", 0.3))))
    mass_val = max(0.1, min(5.0, float(params.get("mass", 1.0))))
    force_type = str(params.get("force_type", "turbulence"))
    force_strength = max(1.0, min(20.0, float(params.get("intensity", 5.0))))
    damping = max(0.8, min(0.99, float(params.get("damping", 0.9))))

    phase_x = rng.random() * 100
    phase_y = rng.random() * 100

    y_grid, x_grid = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = w / 2, h / 2

    if force_type == "turbulence":
        fx = (
            force_strength
            * np.sin(x_grid / 30.0 + t * 3 + phase_x)
            * np.cos(y_grid / 25.0 + t * 2 + phase_y)
        )
        fy = (
            force_strength
            * np.cos(x_grid / 25.0 + t * 2.5 + phase_x)
            * np.sin(y_grid / 30.0 + t * 3.5 + phase_y)
        )
    elif force_type == "brightness":
        gray = np.mean(frame[:, :, :3].astype(np.float32), axis=2)
        grad_x = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=5)
        grad_y = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=5)
        fx = grad_x * force_strength * 0.01
        fy = grad_y * force_strength * 0.01
    elif force_type == "edges":
        gray = cv2.cvtColor(frame[:, :, :3], cv2.COLOR_RGB2GRAY)
        edges = cv2.Canny(gray, 50, 150).astype(np.float32) / 255.0
        edge_rng = make_rng(seed + frame_index)
        rand_x = (edge_rng.random((h, w)).astype(np.float32) - 0.5) * 2
        rand_y = (edge_rng.random((h, w)).astype(np.float32) - 0.5) * 2
        fx = edges * rand_x * force_strength
        fy = edges * rand_y * force_strength
    elif force_type == "radial":
        dx = x_grid - cx
        dy = y_grid - cy
        dist = np.sqrt(dx * dx + dy * dy) + 1.0
        pulse = np.sin(t * 3) * force_strength
        fx = dx / dist * pulse * 0.3
        fy = dy / dist * pulse * 0.3
    elif force_type == "vortex":
        dx = x_grid - cx
        dy = y_grid - cy
        dist = np.sqrt(dx * dx + dy * dy) + 1.0
        spin_speed = np.sin(t * 2) * force_strength
        fx = -dy / dist * spin_speed * 0.3
        fy = dx / dist * spin_speed * 0.3
    elif force_type == "wave":
        fx = force_strength * np.sin(y_grid / 20.0 + t * 4 + phase_x)
        fy = force_strength * 0.3 * np.cos(x_grid / 25.0 + t * 3 + phase_y)
    elif force_type == "pulse":
        dx = x_grid - cx
        dy = y_grid - cy
        dist = np.sqrt(dx * dx + dy * dy) + 1.0
        ring = np.sin(dist * 0.05 - t * 6) * force_strength
        fx = dx / dist * ring * 0.4
        fy = dy / dist * ring * 0.4
    elif force_type == "gravity":
        grav_rng = make_rng(seed + frame_index)
        fx = grav_rng.normal(0, 0.1, (h, w)).astype(np.float32) * force_strength
        fy = np.full((h, w), force_strength * 0.5, dtype=np.float32)
    elif force_type == "wind":
        turb = np.sin(y_grid / 20.0 + t * 2 + phase_y) * np.cos(
            x_grid / 40.0 + t + phase_x
        )
        fx = (
            np.full((h, w), force_strength, dtype=np.float32)
            + turb * force_strength * 0.3
        )
        fy = turb * force_strength * 0.15
    else:
        fx = np.zeros((h, w), dtype=np.float32)
        fy = np.zeros((h, w), dtype=np.float32)

    spring_fx = -stiffness * state["dx"]
    spring_fy = -stiffness * state["dy"]
    mass_factor = 1.0 / mass_val
    ax = (fx * 0.15 + spring_fx) * mass_factor
    ay = (fy * 0.15 + spring_fy) * mass_factor

    state["vx"] = (state["vx"] + ax) * damping
    state["vy"] = (state["vy"] + ay) * damping
    state["dx"] += state["vx"]
    state["dy"] += state["vy"]


def _apply_quantum(state, frame, h, w, t, params, rng, seed, frame_index, boundary):
    tunnel_prob = max(0.0, min(1.0, float(params.get("tunnel_prob", 0.3))))
    barrier_count = max(1, min(10, int(params.get("barrier_count", 4))))
    barrier_width = 0.05
    uncertainty = max(1.0, min(15.0, float(params.get("uncertainty", 5.0))))
    superposition = max(0.0, min(1.0, float(params.get("superposition", 0.4))))
    decoherence = 0.02

    y_grid, x_grid = np.mgrid[0:h, 0:w].astype(np.float32)

    barrier_positions = []
    for i in range(barrier_count):
        bx = (i + 1) * w / (barrier_count + 1)
        bx += np.sin(t * 0.5 + i * 1.3) * w * 0.03
        barrier_positions.append(bx)

    barrier_width_px = barrier_width * w

    fx_total = np.zeros((h, w), dtype=np.float32)
    fy_total = np.zeros((h, w), dtype=np.float32)

    for bx in barrier_positions:
        dist_to_barrier = x_grid - bx
        in_barrier = np.exp(-(dist_to_barrier**2) / (barrier_width_px**2))
        tunnel_rng = make_rng(seed + frame_index + int(bx))
        tunnel_mask = tunnel_rng.random((h, w)).astype(np.float32) < tunnel_prob
        tunnel_push = (
            in_barrier * tunnel_mask * np.sign(dist_to_barrier) * barrier_width_px * 2
        )
        fx_total += tunnel_push * 0.3

    uncertainty_t = uncertainty * (0.4 + 0.6 * min(1.0, frame_index / 30.0))
    unc_rng = make_rng(seed + frame_index * 7)
    fx_total += (unc_rng.random((h, w)).astype(np.float32) - 0.5) * uncertainty_t * 1.2
    fy_total += (unc_rng.random((h, w)).astype(np.float32) - 0.5) * uncertainty_t * 1.2

    state["vx"] = state["vx"] * 0.85 + fx_total * 0.2
    state["vy"] = state["vy"] * 0.85 + fy_total * 0.2
    state["dx"] += state["vx"]
    state["dy"] += state["vy"]

    max_disp = max(h, w) * 0.4
    state["dx"] = np.clip(state["dx"], -max_disp, max_disp)
    state["dy"] = np.clip(state["dy"], -max_disp, max_disp)

    result = remap_frame(frame, state["dx"], state["dy"], boundary)

    if superposition > 0:
        if decoherence > 0:
            ghost_decay_frames = max(1.0, 1.0 / decoherence)
            ghost_strength = superposition * max(
                0.0, 1.0 - frame_index / ghost_decay_frames
            )
        else:
            ghost_strength = superposition
        if ghost_strength > 0.01:
            result = result.astype(np.float32)
            ghost_spread = max(uncertainty_t * 6, 12.0)
            ghost_weight = ghost_strength * 0.7
            for copy_i in range(3):
                offset_x = np.sin(t * (1.5 + copy_i) + copy_i * 2.5) * ghost_spread
                offset_y = np.cos(t * (1.2 + copy_i) + copy_i * 1.8) * ghost_spread
                ghost = remap_frame(
                    frame, state["dx"] + offset_x, state["dy"] + offset_y, boundary
                )
                result += ghost.astype(np.float32) * ghost_weight
            result /= 1.0 + ghost_weight * 3

    # Barrier visualization
    result = result.astype(np.float32)
    for bx in barrier_positions:
        dist = np.abs(x_grid - bx)
        barrier_vis = np.exp(-(dist**2) / (barrier_width_px**2 * 0.3))
        result[:, :, 1] += barrier_vis * 30
        result[:, :, 2] += barrier_vis * 15

    return np.clip(result, 0, 255).astype(np.uint8)
