"""Pixel Dimension Warp — folding space and wormhole portals."""

import numpy as np

from effects.shared.displacement import make_physics_state, remap_frame
from engine.determinism import make_rng

EFFECT_ID = "fx.pixel_dimension_warp"
EFFECT_NAME = "Pixel Dimension Warp"
EFFECT_CATEGORY = "physics"

PARAMS: dict = {
    "mode": {
        "type": "choice",
        "options": ["dimensionfold", "wormhole"],
        "default": "dimensionfold",
        "label": "Mode",
        "description": "Warp type: dimensionfold (rotating fold axes), wormhole (paired portals)",
    },
    "intensity": {
        "type": "float",
        "min": 1.0,
        "max": 20.0,
        "default": 8.0,
        "label": "Intensity",
        "curve": "linear",
        "description": "Fold depth / tunnel strength",
        "unit": "",
    },
    "num_folds": {
        "type": "int",
        "min": 1,
        "max": 8,
        "default": 3,
        "label": "Folds",
        "description": "Number of fold axes (dimensionfold mode)",
        "curve": "linear",
        "unit": "",
    },
    "fold_width": {
        "type": "float",
        "min": 0.05,
        "max": 0.5,
        "default": 0.15,
        "label": "Fold Width",
        "curve": "linear",
        "description": "Width of fold zone as fraction of frame (dimensionfold)",
        "unit": "",
    },
    "rotation_speed": {
        "type": "float",
        "min": 0.0,
        "max": 2.0,
        "default": 0.3,
        "label": "Rotation Speed",
        "curve": "linear",
        "description": "How fast fold axes / portal mouth spins",
        "unit": "",
    },
    "portal_radius": {
        "type": "float",
        "min": 0.03,
        "max": 0.3,
        "default": 0.1,
        "label": "Portal Radius",
        "curve": "linear",
        "description": "Size of each wormhole portal (wormhole mode)",
        "unit": "",
    },
    "spin": {
        "type": "float",
        "min": 0.0,
        "max": 10.0,
        "default": 2.0,
        "label": "Spin",
        "curve": "linear",
        "description": "Rotational distortion at portal mouth (wormhole)",
        "unit": "",
    },
    "wander": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.3,
        "label": "Wander",
        "curve": "linear",
        "description": "How much portals drift over time (wormhole)",
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
    """Pixel dimension warp — dimensionfold and wormhole."""
    mode = str(params.get("mode", "dimensionfold"))
    boundary = str(params.get("boundary", "wrap"))
    damping = max(0.80, min(0.99, float(params.get("damping", 0.9))))

    h, w = frame.shape[:2]
    state = dict(state_in) if state_in else {}
    if "dx" not in state:
        state.update(make_physics_state(h, w))

    alpha = frame[:, :, 3:4].copy()
    rng = make_rng(seed)
    t = frame_index / 30.0

    if mode == "wormhole":
        result = _apply_wormhole(state, frame, h, w, t, params, rng, seed, boundary)
        result[:, :, 3:4] = alpha
        return result, state
    else:
        _apply_dimensionfold(state, h, w, t, params, rng)

    max_disp = max(h, w) * 0.4
    state["dx"] = np.clip(state["dx"], -max_disp, max_disp)
    state["dy"] = np.clip(state["dy"], -max_disp, max_disp)

    result = remap_frame(frame, state["dx"], state["dy"], boundary)
    result[:, :, 3:4] = alpha
    return result, state


def _apply_dimensionfold(state, h, w, t, params, rng):
    num_folds = max(1, min(8, int(params.get("num_folds", 3))))
    fold_depth = max(1.0, min(20.0, float(params.get("intensity", 8.0))))
    fold_width = max(0.05, min(0.5, float(params.get("fold_width", 0.15))))
    rotation_speed = max(0.0, min(2.0, float(params.get("rotation_speed", 0.3))))
    mirror_folds = True

    y_grid, x_grid = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = w / 2, h / 2

    fold_offsets = rng.random(num_folds) - 0.5
    fold_base_angles = rng.random(num_folds) * np.pi
    fold_width_px = fold_width * max(h, w)

    fx_total = np.zeros((h, w), dtype=np.float32)
    fy_total = np.zeros((h, w), dtype=np.float32)

    for i in range(num_folds):
        angle = fold_base_angles[i] + t * rotation_speed * ((-1) ** i)
        cos_a = np.cos(angle)
        sin_a = np.sin(angle)

        offset_px = fold_offsets[i] * max(h, w)
        signed_dist = (x_grid - cx) * cos_a + (y_grid - cy) * sin_a - offset_px
        fold_zone = np.exp(-(signed_dist**2) / (fold_width_px**2 + 1))

        if mirror_folds:
            fold_force = -2.0 * signed_dist / (fold_width_px + 1) * fold_depth
        else:
            fold_force = fold_depth * np.sign(signed_dist)

        fx_total += cos_a * fold_force * fold_zone * 0.3
        fy_total += sin_a * fold_force * fold_zone * 0.3

    state["vx"] = state["vx"] * 0.88 + fx_total * 0.05
    state["vy"] = state["vy"] * 0.88 + fy_total * 0.05
    state["dx"] += state["vx"]
    state["dy"] += state["vy"]


def _apply_wormhole(state, frame, h, w, t, params, rng, seed, boundary):
    portal_radius = max(0.03, min(0.3, float(params.get("portal_radius", 0.1))))
    tunnel_strength = max(1.0, min(20.0, float(params.get("intensity", 8.0))))
    spin = max(0.0, min(10.0, float(params.get("spin", 2.0))))
    distortion_ring = 1.5
    wander = max(0.0, min(1.0, float(params.get("wander", 0.3))))
    damping = max(0.80, min(0.99, float(params.get("damping", 0.9))))

    spread_x = rng.random() * 0.2 + 0.1
    spread_y = rng.random() * 0.2 + 0.1
    p1x = (0.5 - spread_x) * w
    p1y = (0.5 - spread_y) * h
    p2x = (0.5 + spread_x) * w
    p2y = (0.5 + spread_y) * h

    if wander > 0:
        p1x += np.sin(t * 0.4) * w * wander * 0.15
        p1y += np.cos(t * 0.5) * h * wander * 0.15
        p2x += np.sin(t * 0.3 + 2.0) * w * wander * 0.15
        p2y += np.cos(t * 0.45 + 1.5) * h * wander * 0.15

    y_grid, x_grid = np.mgrid[0:h, 0:w].astype(np.float32)
    radius_px = portal_radius * max(h, w)

    fx_total = np.zeros((h, w), dtype=np.float32)
    fy_total = np.zeros((h, w), dtype=np.float32)

    portals = [(p1x, p1y, p2x, p2y), (p2x, p2y, p1x, p1y)]
    for src_x, src_y, dst_x, dst_y in portals:
        dx = x_grid - src_x
        dy = y_grid - src_y
        dist = np.sqrt(dx * dx + dy * dy) + 0.1

        proximity = np.exp(
            -(dist * dist) / (radius_px * radius_px * distortion_ring * distortion_ring)
        )
        tunnel_dx = (dst_x - x_grid) * proximity * tunnel_strength * 0.01
        tunnel_dy = (dst_y - y_grid) * proximity * tunnel_strength * 0.01

        spin_factor = spin * np.exp(-dist / (radius_px * 2))
        spin_fx = -dy / dist * spin_factor * 0.3
        spin_fy = dx / dist * spin_factor * 0.3

        fx_total += tunnel_dx + spin_fx
        fy_total += tunnel_dy + spin_fy

    state["vx"] = state["vx"] * damping + fx_total
    state["vy"] = state["vy"] * damping + fy_total
    state["dx"] += state["vx"]
    state["dy"] += state["vy"]

    max_disp = max(h, w) * 0.5
    state["dx"] = np.clip(state["dx"], -max_disp, max_disp)
    state["dy"] = np.clip(state["dy"], -max_disp, max_disp)

    result = remap_frame(frame, state["dx"], state["dy"], boundary).astype(np.float32)

    # Portal glow
    for px, py in [(p1x, p1y), (p2x, p2y)]:
        pdx = x_grid - px
        pdy = y_grid - py
        pdist = np.sqrt(pdx * pdx + pdy * pdy) + 0.1
        ring = np.exp(-((pdist - radius_px) ** 2) / (radius_px * radius_px * 0.2))
        glow = ring * 60
        result[:, :, 0] += glow * 0.3
        result[:, :, 1] += glow * 0.6
        result[:, :, 2] += glow * 1.0

    return np.clip(result, 0, 255).astype(np.uint8)
