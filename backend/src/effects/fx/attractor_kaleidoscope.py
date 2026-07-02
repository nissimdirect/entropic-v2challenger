"""Attractor Kaleidoscope — kaleidoscope whose center + angle are driven by a strange-attractor solver.

Frankenstein of:
- effects/fx/kaleidoscope.py — n-fold radial mirror via cv2.remap
- effects/fx/strange_attractor.py — Lorenz/Rossler/Thomas/Aizawa ODE step
- effects/fx/reaction_diffusion.py — PARAMS schema + state contract

Each frame the solver advances via RK4 and outputs a single (x, y, z) point that
is rescaled to roughly [-1, 1] using per-system bounds. (x, y) drives the
kaleidoscope center offset, z drives angle drift. The fold count is fixed.
"""

import math

import cv2
import numpy as np

EFFECT_ID = "fx.attractor_kaleidoscope"
EFFECT_NAME = "Attractor Kaleidoscope"
EFFECT_CATEGORY = "warping"

# System name → (deriv fn, default initial state, normalization scale)
# Normalization scales chosen so |x|, |y|, |z| roughly land in [-1, 1] for
# typical orbits (used to map solver state → kaleidoscope coords).
_SYSTEMS = ("lorenz", "rossler", "thomas", "aizawa")
_NORM_SCALE = {
    # Lorenz attractor — x,y span ~[-20,20], z ~[0,50]; centered.
    "lorenz": (20.0, 25.0, 25.0),  # divide by these (z offset handled below)
    "rossler": (12.0, 12.0, 25.0),
    "thomas": (4.0, 4.0, 4.0),
    "aizawa": (1.5, 1.5, 1.5),
}
_INIT_STATE = {
    "lorenz": (0.1, 0.0, 0.0),
    "rossler": (0.1, 0.0, 0.0),
    "thomas": (0.1, 0.0, 0.0),
    "aizawa": (0.1, 0.0, 0.0),
}


PARAMS: dict = {
    "system": {
        "type": "choice",
        "options": list(_SYSTEMS),
        "default": "lorenz",
        "label": "Attractor",
        "description": "Strange attractor that drives kaleidoscope center + angle",
    },
    "symmetry_count": {
        "type": "int",
        "min": 2,
        "max": 32,
        "default": 8,
        "label": "Symmetry",
        "curve": "linear",
        "unit": "folds",
        "description": "Number of mirror segments (fixed per frame)",
    },
    "solver_speed": {
        "type": "float",
        "min": 0.001,
        "max": 0.1,
        "default": 0.01,
        "label": "Solver Speed",
        "curve": "linear",
        "unit": "dt",
        "description": "RK4 step size — lower = smoother, higher = chaotic",
    },
    "steps_per_frame": {
        "type": "int",
        "min": 1,
        "max": 10,
        "default": 3,
        "label": "Steps/Frame",
        "curve": "linear",
        "unit": "",
        "description": "Solver iterations per video frame — more = faster orbit traversal",
    },
    "center_drift_px": {
        "type": "float",
        "min": 0.0,
        "max": 500.0,
        "default": 100.0,
        "label": "Center Drift",
        "curve": "linear",
        "unit": "px",
        "description": "How far the kaleidoscope center wanders from frame center",
    },
    "angle_drift_rad": {
        "type": "float",
        "min": 0.0,
        "max": 6.28,
        "default": 1.57,
        "label": "Angle Drift",
        "curve": "linear",
        "unit": "rad",
        "description": "Rotation angle range driven by attractor z component",
    },
    "intensity": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 1.0,
        "label": "Intensity",
        "curve": "linear",
        "unit": "%",
        "description": "Wet/dry blend with original frame",
    },
}


def _deriv(system: str, x: float, y: float, z: float) -> tuple[float, float, float]:
    """Compute dx/dt, dy/dt, dz/dt for the chosen attractor."""
    if system == "lorenz":
        sigma, rho, beta = 10.0, 28.0, 8.0 / 3.0
        return (sigma * (y - x), x * (rho - z) - y, x * y - beta * z)
    if system == "rossler":
        a, b, c = 0.2, 0.2, 5.7
        return (-y - z, x + a * y, b + z * (x - c))
    if system == "thomas":
        b = 0.208186
        return (math.sin(y) - b * x, math.sin(z) - b * y, math.sin(x) - b * z)
    # aizawa
    a, b, c, d, e, f = 0.95, 0.7, 0.6, 3.5, 0.25, 0.1
    return (
        (z - b) * x - d * y,
        d * x + (z - b) * y,
        c + a * z - (z**3) / 3.0 - (x * x + y * y) * (1.0 + e * z) + f * z * (x**3),
    )


def _rk4_step(
    system: str, x: float, y: float, z: float, dt: float
) -> tuple[float, float, float]:
    """Runge-Kutta 4 step on the chosen attractor."""
    k1 = _deriv(system, x, y, z)
    k2 = _deriv(
        system, x + 0.5 * dt * k1[0], y + 0.5 * dt * k1[1], z + 0.5 * dt * k1[2]
    )
    k3 = _deriv(
        system, x + 0.5 * dt * k2[0], y + 0.5 * dt * k2[1], z + 0.5 * dt * k2[2]
    )
    k4 = _deriv(system, x + dt * k3[0], y + dt * k3[1], z + dt * k3[2])
    nx = x + (dt / 6.0) * (k1[0] + 2.0 * k2[0] + 2.0 * k3[0] + k4[0])
    ny = y + (dt / 6.0) * (k1[1] + 2.0 * k2[1] + 2.0 * k3[1] + k4[1])
    nz = z + (dt / 6.0) * (k1[2] + 2.0 * k2[2] + 2.0 * k3[2] + k4[2])
    return nx, ny, nz


def _normalize(system: str, x: float, y: float, z: float) -> tuple[float, float, float]:
    """Rescale solver state to ~[-1, 1] with safe clamps."""
    sx, sy, sz = _NORM_SCALE[system]
    if system == "lorenz":
        # z is non-negative for Lorenz orbits — center it.
        nz = (z - 25.0) / sz
    else:
        nz = z / sz
    nx = x / sx
    ny = y / sy
    return (
        max(-1.0, min(1.0, nx)),
        max(-1.0, min(1.0, ny)),
        max(-1.0, min(1.0, nz)),
    )


def _kaleidoscope_warp(
    rgb: np.ndarray,
    cx: float,
    cy: float,
    angle_rad: float,
    segments: int,
) -> np.ndarray:
    """N-fold radial mirror about (cx, cy) with rotation. Same kernel as kaleidoscope.py."""
    h, w = rgb.shape[:2]
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
    dx = xs - cx
    dy = ys - cy
    angle = np.arctan2(dy, dx) + np.float32(angle_rad)
    radius = np.sqrt(dx * dx + dy * dy)

    seg_angle = 2.0 * np.pi / max(1, segments)
    folded = np.abs(np.mod(angle, seg_angle) - seg_angle / 2.0)

    map_x = (cx + radius * np.cos(folded)).astype(np.float32)
    map_y = (cy + radius * np.sin(folded)).astype(np.float32)
    np.clip(map_x, 0, w - 1, out=map_x)
    np.clip(map_y, 0, h - 1, out=map_y)
    return cv2.remap(rgb, map_x, map_y, cv2.INTER_LINEAR)


def apply(
    frame: np.ndarray,
    params: dict,
    state_in: dict | None = None,
    *,
    frame_index: int,
    seed: int,
    resolution: tuple[int, int],
) -> tuple[np.ndarray, dict | None]:
    """Step strange-attractor solver, drive kaleidoscope center+angle, render."""
    # PLAY-005: clamp every numeric param at the trust boundary.
    system = str(params.get("system", "lorenz")).lower()
    if system not in _SYSTEMS:
        system = "lorenz"

    raw_segments = params.get("symmetry_count", 8)
    try:
        segments = int(raw_segments)
    except (TypeError, ValueError):
        segments = 8
    if not math.isfinite(segments):
        segments = 8
    segments = max(2, min(32, segments))

    def _fclamp(name: str, default: float, lo: float, hi: float) -> float:
        try:
            v = float(params.get(name, default))
        except (TypeError, ValueError):
            v = default
        if not math.isfinite(v):
            v = default
        return max(lo, min(hi, v))

    solver_speed = _fclamp("solver_speed", 0.01, 0.001, 0.1)
    raw_steps = params.get("steps_per_frame", 3)
    try:
        steps = int(raw_steps)
    except (TypeError, ValueError):
        steps = 3
    steps = max(1, min(10, steps))
    center_drift = _fclamp("center_drift_px", 100.0, 0.0, 500.0)
    angle_drift = _fclamp("angle_drift_rad", 1.57, 0.0, 6.28)
    intensity = _fclamp("intensity", 1.0, 0.0, 1.0)

    h, w = frame.shape[:2]
    rgb = frame[:, :, :3]
    alpha = frame[:, :, 3:4]

    # Init or reuse solver state. Reset on system change or NaN/Inf.
    needs_init = (
        state_in is None
        or "system" not in state_in
        or state_in.get("system") != system
        or any(k not in state_in for k in ("x", "y", "z"))
    )
    if not needs_init:
        x0 = state_in["x"]
        y0 = state_in["y"]
        z0 = state_in["z"]
        if not (math.isfinite(x0) and math.isfinite(y0) and math.isfinite(z0)):
            needs_init = True

    if needs_init:
        ix, iy, iz = _INIT_STATE[system]
        # Light per-seed jitter so different seeds give different orbits.
        rng = np.random.default_rng(int(seed) & 0xFFFFFFFF)
        jitter = rng.uniform(-0.05, 0.05, 3)
        x = float(ix + jitter[0])
        y = float(iy + jitter[1])
        z = float(iz + jitter[2])
    else:
        x = float(state_in["x"])
        y = float(state_in["y"])
        z = float(state_in["z"])

    # Step solver forward
    for _ in range(steps):
        x, y, z = _rk4_step(system, x, y, z, solver_speed)

    # Bound check — if solver blew up, reset to seeded init.
    if not (math.isfinite(x) and math.isfinite(y) and math.isfinite(z)) or (
        abs(x) > 1e3 or abs(y) > 1e3 or abs(z) > 1e3
    ):
        ix, iy, iz = _INIT_STATE[system]
        x, y, z = float(ix), float(iy), float(iz)

    nx, ny, nz = _normalize(system, x, y, z)

    cx = w / 2.0 + nx * center_drift
    cy = h / 2.0 + ny * center_drift
    angle_rad = nz * angle_drift

    warped = _kaleidoscope_warp(rgb, cx, cy, angle_rad, segments)

    if intensity >= 0.999:
        out_rgb = warped
    else:
        cur_f = rgb.astype(np.float32)
        warped_f = warped.astype(np.float32)
        out_rgb = np.clip(
            cur_f * (1.0 - intensity) + warped_f * intensity, 0, 255
        ).astype(np.uint8)

    state_out = {"system": system, "x": x, "y": y, "z": z}
    return np.concatenate([out_rgb, alpha], axis=2), state_out
