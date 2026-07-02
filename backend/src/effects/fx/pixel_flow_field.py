"""Pixel Flow Field — turbulent flow, time-warping echoes, and vortex spirals."""

import numpy as np

from effects.shared.displacement import make_physics_state, remap_frame
from engine.determinism import make_rng

EFFECT_ID = "fx.pixel_flow_field"
EFFECT_NAME = "Pixel Flow Field"
EFFECT_CATEGORY = "physics"

PARAMS: dict = {
    "mode": {
        "type": "choice",
        "options": ["liquify", "timewarp", "vortex"],
        "default": "liquify",
        "label": "Mode",
        "description": "Flow type: liquify (turbulence), timewarp (echo reversal), vortex (spiral)",
    },
    "intensity": {
        "type": "float",
        "min": 0.5,
        "max": 15.0,
        "default": 5.0,
        "label": "Intensity",
        "curve": "linear",
        "description": "Strength of flow forces",
        "unit": "",
    },
    "speed": {
        "type": "float",
        "min": 0.1,
        "max": 5.0,
        "default": 1.0,
        "label": "Speed",
        "curve": "linear",
        "description": "Time evolution rate",
        "unit": "",
    },
    "damping": {
        "type": "float",
        "min": 0.80,
        "max": 0.99,
        "default": 0.92,
        "label": "Damping",
        "curve": "linear",
        "description": "Velocity decay per frame",
        "unit": "",
    },
    "echo_count": {
        "type": "int",
        "min": 1,
        "max": 8,
        "default": 3,
        "label": "Echo Count",
        "description": "Displacement echoes (timewarp mode)",
        "curve": "linear",
        "unit": "",
    },
    "echo_decay": {
        "type": "float",
        "min": 0.2,
        "max": 0.9,
        "default": 0.6,
        "label": "Echo Decay",
        "curve": "linear",
        "description": "How much each echo fades (timewarp mode)",
        "unit": "",
    },
    "reverse_probability": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.3,
        "label": "Reverse Probability",
        "curve": "linear",
        "description": "Chance of direction flip per frame (timewarp mode)",
        "unit": "",
    },
    "num_vortices": {
        "type": "int",
        "min": 1,
        "max": 10,
        "default": 3,
        "label": "Vortices",
        "description": "Number of vortex centers (vortex mode)",
        "curve": "linear",
        "unit": "",
    },
    "pull_strength": {
        "type": "float",
        "min": 0.0,
        "max": 10.0,
        "default": 2.0,
        "label": "Pull Strength",
        "curve": "linear",
        "description": "Inward pull toward vortex centers (vortex mode)",
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
    """Pixel flow field — turbulent flows, time-warping echoes, vortex spirals."""
    mode = str(params.get("mode", "liquify"))
    intensity = max(0.5, min(15.0, float(params.get("intensity", 5.0))))
    speed = max(0.1, min(5.0, float(params.get("speed", 1.0))))
    damping = max(0.80, min(0.99, float(params.get("damping", 0.92))))
    boundary = str(params.get("boundary", "wrap"))

    h, w = frame.shape[:2]
    state = dict(state_in) if state_in else {}
    if "dx" not in state:
        state.update(make_physics_state(h, w))

    alpha = frame[:, :, 3:4].copy()
    rng = make_rng(seed)
    t = frame_index * speed / 30.0

    if mode == "liquify":
        _apply_liquify(state, h, w, t, intensity, damping, rng)
    elif mode == "timewarp":
        echo_count = max(1, min(8, int(params.get("echo_count", 3))))
        echo_decay = max(0.2, min(0.9, float(params.get("echo_decay", 0.6))))
        reverse_prob = max(0.0, min(1.0, float(params.get("reverse_probability", 0.3))))
        _apply_timewarp(
            state,
            h,
            w,
            t,
            intensity,
            damping,
            echo_count,
            reverse_prob,
            seed,
            frame_index,
        )
        # Composite echoes
        max_disp = max(h, w) * 0.4
        state["dx"] = np.clip(state["dx"], -max_disp, max_disp)
        state["dy"] = np.clip(state["dy"], -max_disp, max_disp)
        result = remap_frame(frame, state["dx"], state["dy"], boundary).astype(
            np.float32
        )
        total_weight = 1.0
        for i in range(echo_count):
            weight = echo_decay ** (i + 1)
            echo_r = remap_frame(
                frame, state["echoes_dx"][i], state["echoes_dy"][i], boundary
            )
            result += echo_r.astype(np.float32) * weight
            total_weight += weight
        result = result / total_weight
        result = np.clip(result, 0, 255).astype(np.uint8)
        result[:, :, 3:4] = alpha
        return result, state
    elif mode == "vortex":
        num_vortices = max(1, min(10, int(params.get("num_vortices", 3))))
        pull = max(0.0, min(10.0, float(params.get("pull_strength", 2.0))))
        _apply_vortex(state, h, w, intensity, damping, num_vortices, pull, rng)
    else:
        _apply_liquify(state, h, w, t, intensity, damping, rng)

    max_disp = max(h, w) * 0.4
    state["dx"] = np.clip(state["dx"], -max_disp, max_disp)
    state["dy"] = np.clip(state["dy"], -max_disp, max_disp)

    result = remap_frame(frame, state["dx"], state["dy"], boundary)
    result[:, :, 3:4] = alpha
    return result, state


def _apply_liquify(
    state: dict, h: int, w: int, t: float, turbulence: float, damping: float, rng
):
    y_grid, x_grid = np.mgrid[0:h, 0:w].astype(np.float32)
    flow_scale = 40.0
    x_norm = x_grid / flow_scale
    y_norm = y_grid / flow_scale

    fx = np.zeros((h, w), dtype=np.float32)
    fy = np.zeros((h, w), dtype=np.float32)
    for octave in range(3):
        freq = 2**octave
        amp = turbulence / freq
        phase_x = rng.random() * 100
        phase_y = rng.random() * 100
        fx += (
            amp
            * np.sin(x_norm * freq + t * 2.0 + phase_x)
            * np.cos(y_norm * freq * 0.7 + t * 1.5 + phase_y)
        )
        fy += (
            amp
            * np.cos(x_norm * freq * 0.8 + t * 1.8 + phase_x)
            * np.sin(y_norm * freq + t * 2.2 + phase_y)
        )

    state["vx"] = state["vx"] * damping + fx * 0.1
    state["vy"] = state["vy"] * damping + fy * 0.1
    state["dx"] += state["vx"]
    state["dy"] += state["vy"]


def _apply_timewarp(
    state: dict,
    h: int,
    w: int,
    t: float,
    warp_speed: float,
    damping: float,
    echo_count: int,
    reverse_probability: float,
    seed: int,
    frame_index: int,
):
    if "echoes_dx" not in state:
        state["echoes_dx"] = [
            np.zeros((h, w), dtype=np.float32) for _ in range(echo_count)
        ]
        state["echoes_dy"] = [
            np.zeros((h, w), dtype=np.float32) for _ in range(echo_count)
        ]
        state["time_dir"] = 1.0

    y_grid, x_grid = np.mgrid[0:h, 0:w].astype(np.float32)
    rng = make_rng(seed + frame_index)

    if rng.random() < reverse_probability * 0.1:
        state["time_dir"] *= -1.0

    time_factor = state["time_dir"] * (1.0 + np.sin(t * warp_speed * np.pi) * 0.5)

    phase = rng.random() * 100
    fx = 3.0 * np.sin(x_grid / 30.0 + t * 2 + phase) * np.cos(y_grid / 25.0 + t * 1.5)
    fy = 3.0 * np.cos(x_grid / 25.0 + t * 1.8) * np.sin(y_grid / 30.0 + t * 2.2 + phase)

    state["vx"] = state["vx"] * damping + fx * time_factor * 0.08
    state["vy"] = state["vy"] * damping + fy * time_factor * 0.08

    for i in range(echo_count - 1, 0, -1):
        state["echoes_dx"][i] = state["echoes_dx"][i - 1].copy()
        state["echoes_dy"][i] = state["echoes_dy"][i - 1].copy()
    state["echoes_dx"][0] = state["dx"].copy()
    state["echoes_dy"][0] = state["dy"].copy()

    state["dx"] += state["vx"]
    state["dy"] += state["vy"]


def _apply_vortex(
    state: dict,
    h: int,
    w: int,
    spin_strength: float,
    damping: float,
    num_vortices: int,
    pull_strength: float,
    rng,
):
    positions = rng.random((num_vortices, 2))
    spins = np.array([(-1) ** i for i in range(num_vortices)], dtype=np.float32)

    y_grid, x_grid = np.mgrid[0:h, 0:w].astype(np.float32)
    radius_px = 0.25 * max(h, w)

    fx_total = np.zeros((h, w), dtype=np.float32)
    fy_total = np.zeros((h, w), dtype=np.float32)

    for i in range(num_vortices):
        cx = positions[i, 0] * w
        cy = positions[i, 1] * h
        dx = x_grid - cx
        dy = y_grid - cy
        dist = np.sqrt(dx * dx + dy * dy) + 1.0
        falloff = np.exp(-dist / radius_px)

        fx_spin = -dy / dist * spin_strength * spins[i] * falloff
        fy_spin = dx / dist * spin_strength * spins[i] * falloff
        fx_pull = -dx / dist * pull_strength * falloff
        fy_pull = -dy / dist * pull_strength * falloff

        fx_total += fx_spin + fx_pull
        fy_total += fy_spin + fy_pull

    state["vx"] = state["vx"] * damping + fx_total * 0.05
    state["vy"] = state["vy"] * damping + fy_total * 0.05
    state["dx"] += state["vx"]
    state["dy"] += state["vy"]
