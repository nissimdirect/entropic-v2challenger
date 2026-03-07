"""Pixel Force Field — gravity wells, antigravity zones, magnetic fields, dark energy."""

import numpy as np
import cv2

from effects.shared.displacement import make_physics_state, remap_frame
from engine.determinism import make_rng

EFFECT_ID = "fx.pixel_force_field"
EFFECT_NAME = "Pixel Force Field"
EFFECT_CATEGORY = "physics"

PARAMS: dict = {
    "mode": {
        "type": "choice",
        "options": ["gravity", "antigravity", "magnetic", "darkenergy"],
        "default": "gravity",
        "label": "Mode",
        "description": "Force type: gravity, antigravity, magnetic field lines, dark energy expansion",
    },
    "intensity": {
        "type": "float",
        "min": 1.0,
        "max": 20.0,
        "default": 8.0,
        "label": "Intensity",
        "curve": "linear",
        "description": "Force strength",
        "unit": "",
    },
    "num_sources": {
        "type": "int",
        "min": 1,
        "max": 12,
        "default": 5,
        "label": "Sources",
        "description": "Number of attractor/repulsion/expansion centers",
        "curve": "linear",
        "unit": "",
    },
    "radius": {
        "type": "float",
        "min": 0.1,
        "max": 1.0,
        "default": 0.3,
        "label": "Radius",
        "curve": "linear",
        "description": "Influence radius as fraction of frame",
        "unit": "",
    },
    "damping": {
        "type": "float",
        "min": 0.80,
        "max": 0.99,
        "default": 0.93,
        "label": "Damping",
        "curve": "linear",
        "description": "Velocity decay per frame",
        "unit": "",
    },
    "wander": {
        "type": "float",
        "min": 0.0,
        "max": 2.0,
        "default": 0.5,
        "label": "Wander",
        "curve": "linear",
        "description": "How much sources drift over time",
        "unit": "",
    },
    "field_type": {
        "type": "choice",
        "options": ["dipole", "quadrupole", "toroidal", "chaotic"],
        "default": "dipole",
        "label": "Field Type",
        "description": "Magnetic field pattern (magnetic mode only)",
    },
    "rotation_speed": {
        "type": "float",
        "min": 0.0,
        "max": 2.0,
        "default": 0.5,
        "label": "Rotation Speed",
        "curve": "linear",
        "description": "Field rotation rate (magnetic mode)",
        "unit": "",
    },
    "acceleration": {
        "type": "float",
        "min": 0.0,
        "max": 0.2,
        "default": 0.05,
        "label": "Acceleration",
        "curve": "linear",
        "description": "Expansion acceleration (darkenergy mode)",
        "unit": "",
    },
    "structure": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.5,
        "label": "Structure",
        "curve": "linear",
        "description": "Cosmic web resistance (darkenergy mode)",
        "unit": "",
    },
    "oscillate": {
        "type": "float",
        "min": 0.0,
        "max": 3.0,
        "default": 1.0,
        "label": "Oscillate",
        "curve": "linear",
        "description": "Gravity flip rate in Hz (antigravity mode)",
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
    """Pixel force field — gravity, antigravity, magnetic, dark energy."""
    mode = str(params.get("mode", "gravity"))
    intensity = max(1.0, min(20.0, float(params.get("intensity", 8.0))))
    num_sources = max(1, min(12, int(params.get("num_sources", 5))))
    radius = max(0.1, min(1.0, float(params.get("radius", 0.3))))
    damping = max(0.80, min(0.99, float(params.get("damping", 0.93))))
    wander = max(0.0, min(2.0, float(params.get("wander", 0.5))))
    boundary = str(params.get("boundary", "black"))

    h, w = frame.shape[:2]
    state = dict(state_in) if state_in else {}
    if "dx" not in state:
        state.update(make_physics_state(h, w))

    alpha = frame[:, :, 3:4].copy()
    rng = make_rng(seed)
    t = frame_index / 30.0

    if mode == "gravity":
        _apply_gravity(
            state, h, w, t, intensity, damping, num_sources, radius, wander, rng
        )
    elif mode == "antigravity":
        oscillate = max(0.0, min(3.0, float(params.get("oscillate", 1.0))))
        _apply_antigravity(
            state, h, w, t, intensity, damping, num_sources, radius, oscillate, rng
        )
    elif mode == "magnetic":
        field_type = str(params.get("field_type", "dipole"))
        rotation_speed = max(0.0, min(2.0, float(params.get("rotation_speed", 0.5))))
        _apply_magnetic(
            state,
            h,
            w,
            t,
            intensity,
            damping,
            num_sources,
            field_type,
            rotation_speed,
            rng,
            frame_index,
        )
    elif mode == "darkenergy":
        accel = max(0.0, min(0.2, float(params.get("acceleration", 0.05))))
        structure = max(0.0, min(1.0, float(params.get("structure", 0.5))))
        _apply_darkenergy(
            state, h, w, intensity, damping, num_sources, accel, structure, frame, rng
        )

    max_disp = max(h, w) * 0.4
    state["dx"] = np.clip(state["dx"], -max_disp, max_disp)
    state["dy"] = np.clip(state["dy"], -max_disp, max_disp)

    result = remap_frame(frame, state["dx"], state["dy"], boundary)

    # Dark energy void fill
    if mode == "darkenergy":
        disp_magnitude = np.sqrt(state["dx"] ** 2 + state["dy"] ** 2)
        void_threshold = max(h, w) * 0.05
        void_mask = np.clip(
            (disp_magnitude - void_threshold) / (void_threshold * 2), 0, 1
        )
        if void_mask.max() > 0.01:
            result = result.astype(np.float32)
            result[:, :, 0] = result[:, :, 0] * (1 - void_mask) + 5 * void_mask
            result[:, :, 1] = result[:, :, 1] * (1 - void_mask) + 0 * void_mask
            result[:, :, 2] = result[:, :, 2] * (1 - void_mask) + 15 * void_mask
            result = np.clip(result, 0, 255).astype(np.uint8)

    result[:, :, 3:4] = alpha
    return result, state


def _apply_gravity(
    state, h, w, t, strength, damping, num_attractors, radius, wander, rng
):
    y_grid, x_grid = np.mgrid[0:h, 0:w].astype(np.float32)
    radius_px = radius * max(h, w)

    _rng = make_rng(int(rng.integers(0, 2**31)))
    base_positions = _rng.random((num_attractors, 2))
    ax = base_positions[:, 0] * w
    ay = base_positions[:, 1] * h

    if wander > 0:
        for i in range(num_attractors):
            ax[i] += np.sin(t * 0.5 + i * 2.1) * w * wander * 0.1
            ay[i] += np.cos(t * 0.7 + i * 1.7) * h * wander * 0.1

    fx_total = np.zeros((h, w), dtype=np.float32)
    fy_total = np.zeros((h, w), dtype=np.float32)

    for i in range(num_attractors):
        dx = ax[i] - x_grid
        dy = ay[i] - y_grid
        dist = np.sqrt(dx * dx + dy * dy) + 1.0
        force = strength / (dist * dist) * np.exp(-dist / radius_px) * 1000
        fx_total += dx / dist * force
        fy_total += dy / dist * force

    state["vx"] = state["vx"] * damping + fx_total * 0.01
    state["vy"] = state["vy"] * damping + fy_total * 0.01
    state["dx"] += state["vx"]
    state["dy"] += state["vy"]


def _apply_antigravity(
    state, h, w, t, repulsion, damping, num_zones, radius, oscillate, rng
):
    positions = rng.random((num_zones, 2))
    y_grid, x_grid = np.mgrid[0:h, 0:w].astype(np.float32)
    radius_px = radius * max(h, w)

    if oscillate > 0:
        grav_dir = np.sin(t * oscillate * np.pi * 2)
        if abs(grav_dir) < 0.1:
            grav_dir = -1.0
    else:
        grav_dir = -1.0

    fx_total = np.zeros((h, w), dtype=np.float32)
    fy_total = np.zeros((h, w), dtype=np.float32)

    for i in range(num_zones):
        zx = positions[i, 0] * w
        zy = positions[i, 1] * h
        dx = x_grid - zx
        dy = y_grid - zy
        dist = np.sqrt(dx * dx + dy * dy) + 1.0
        force = repulsion * grav_dir * np.exp(-dist / radius_px) * 100.0 / (dist + 10.0)
        fx_total += dx / dist * force
        fy_total += dy / dist * force

    state["vx"] = state["vx"] * damping + fx_total * 0.01
    state["vy"] = state["vy"] * damping + fy_total * 0.01
    state["dx"] += state["vx"]
    state["dy"] += state["vy"]


def _apply_magnetic(
    state,
    h,
    w,
    t,
    strength,
    damping,
    poles,
    field_type,
    rotation_speed,
    rng,
    frame_index,
):
    seed_offset_x = (rng.random() - 0.5) * 0.15
    seed_offset_y = (rng.random() - 0.5) * 0.15
    seed_angle = rng.random() * 0.5

    angle = t * rotation_speed + seed_angle

    y_grid, x_grid = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = w / 2, h / 2
    nx = (x_grid - cx) / max(w, 1) - seed_offset_x
    ny = (y_grid - cy) / max(h, 1) - seed_offset_y

    rnx = nx * np.cos(angle) - ny * np.sin(angle)
    rny = nx * np.sin(angle) + ny * np.cos(angle)

    field_max = strength * 50.0

    if field_type == "dipole":
        bx = np.zeros((h, w), dtype=np.float32)
        by = np.zeros((h, w), dtype=np.float32)
        pole_spread = 0.35
        for p in range(max(1, poles)):
            theta = p * 2 * np.pi / max(1, poles)
            px = pole_spread * np.cos(theta) if poles > 1 else 0.0
            py = pole_spread * np.sin(theta) if poles > 1 else 0.0
            ddx = rnx - px
            ddy = rny - py
            r = np.sqrt(ddx * ddx + ddy * ddy) + 0.05
            sign = (-1) ** p
            bx += sign * 3.0 * ddx * ddy / (r**3) * strength
            by += sign * (2.0 * ddy * ddy - ddx * ddx) / (r**3) * strength
        bx = np.clip(bx, -field_max, field_max)
        by = np.clip(by, -field_max, field_max)
    elif field_type == "quadrupole":
        bx = np.zeros((h, w), dtype=np.float32)
        by = np.zeros((h, w), dtype=np.float32)
        pole_spread = 0.35
        for p in range(poles):
            theta = p * 2 * np.pi / poles
            px = pole_spread * np.cos(theta)
            py = pole_spread * np.sin(theta)
            ddx = rnx - px
            ddy = rny - py
            r = np.sqrt(ddx * ddx + ddy * ddy) + 0.05
            sign = (-1) ** p
            bx += sign * ddx / (r**2.5) * strength
            by += sign * ddy / (r**2.5) * strength
        bx = np.clip(bx, -field_max, field_max)
        by = np.clip(by, -field_max, field_max)
    elif field_type == "toroidal":
        r = np.sqrt(rnx * rnx + rny * rny) + 0.01
        ring_radius = 0.3
        ring_dist = np.abs(r - ring_radius)
        ring_force = np.exp(-ring_dist * 10) * strength
        theta_field = np.arctan2(rny, rnx)
        lobe_mod = 0.5 + 0.5 * np.cos(theta_field * poles)
        bx = -rny / r * ring_force * lobe_mod
        by = rnx / r * ring_force * lobe_mod
    else:  # chaotic
        field_rng = make_rng(int(rng.integers(0, 2**31)))
        bx = np.zeros((h, w), dtype=np.float32)
        by = np.zeros((h, w), dtype=np.float32)
        for _ in range(5):
            rpx = (field_rng.random() - 0.5) * 0.8
            rpy = (field_rng.random() - 0.5) * 0.8
            ddx = rnx - rpx
            ddy = rny - rpy
            r = np.sqrt(ddx * ddx + ddy * ddy) + 0.05
            bx += ddy / (r**2.5) * strength * 0.3
            by += -ddx / (r**2.5) * strength * 0.3
        bx = np.clip(bx, -field_max, field_max)
        by = np.clip(by, -field_max, field_max)

    vel_max = 50.0
    state["vx"] = np.clip(state["vx"], -vel_max, vel_max)
    state["vy"] = np.clip(state["vy"], -vel_max, vel_max)

    if frame_index == 0:
        state["vx"] = bx * 0.08
        state["vy"] = by * 0.08
    else:
        b_mag = np.sqrt(bx * bx + by * by) + 0.01
        b_mag = np.minimum(b_mag, field_max)
        fx = state["vy"] * b_mag * 0.2 + bx * 0.08
        fy = -state["vx"] * b_mag * 0.2 + by * 0.08
        state["vx"] = state["vx"] * damping + fx
        state["vy"] = state["vy"] * damping + fy

    state["dx"] += state["vx"]
    state["dy"] += state["vy"]


def _apply_darkenergy(
    state,
    h,
    w,
    expansion_rate,
    damping,
    hubble_zones,
    acceleration,
    structure,
    frame,
    rng,
):
    if "expansion_factor" not in state:
        state["expansion_factor"] = 1.0

    y_grid, x_grid = np.mgrid[0:h, 0:w].astype(np.float32)
    zone_positions = rng.random((hubble_zones, 2))

    resistance = None
    if structure > 0:
        gray = np.mean(frame[:, :, :3].astype(np.float32), axis=2)
        edges = (
            cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3) ** 2
            + cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3) ** 2
        )
        edges = np.sqrt(edges)
        edges = edges / (edges.max() + 0.01)
        resistance = 1.0 - edges * structure

    state["expansion_factor"] += acceleration
    current_rate = expansion_rate * state["expansion_factor"]

    fx_total = np.zeros((h, w), dtype=np.float32)
    fy_total = np.zeros((h, w), dtype=np.float32)

    # FIX from v1: dy update was outside for-loop at line 1519
    for i in range(hubble_zones):
        zx = zone_positions[i, 0] * w
        zy = zone_positions[i, 1] * h
        dx = x_grid - zx
        dy = y_grid - zy
        dist = np.sqrt(dx * dx + dy * dy) + 1.0
        expand = current_rate * dist * 0.0001
        fx_total += dx / dist * expand
        fy_total += dy / dist * expand

    if resistance is not None:
        fx_total *= resistance
        fy_total *= resistance

    state["vx"] = state["vx"] * 0.95 + fx_total
    state["vy"] = state["vy"] * 0.95 + fy_total
    state["dx"] += state["vx"]
    state["dy"] += state["vy"]  # FIX: now inside same scope as dx update
