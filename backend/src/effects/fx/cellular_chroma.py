"""Cellular Chroma — chromatic aberration driven by 3 independent cellular automata.

Each RGB channel has its own Conway-style CA grid. Alive cells push the channel
pixel by `+max_offset_px` along that channel's direction; dead cells push by
`-max_offset_px` (the opposite). The three CAs evolve independently with their
own rules / seeds, so red drifts one way, green another, blue a third — living
chromatic aberration. The aberration map itself is alive.

Frankenstein recipe:
- `effects/fx/chromatic_aberration.py` — per-channel offset architecture
- `effects/fx/cellular_automata.py` — Game-of-Life CA step (3 instances)
- `effects/shared/displacement.py::remap_frame` — sub-pixel channel sampling
"""

import numpy as np
from scipy.signal import convolve2d

from effects.shared.displacement import remap_frame

EFFECT_ID = "fx.cellular_chroma"
EFFECT_NAME = "Cellular Chroma"
EFFECT_CATEGORY = "color"

_RULES = ("life", "highlife", "seeds", "daynight", "replicator")
_BOUNDARIES = ("wrap", "clamp", "mirror")

PARAMS: dict = {
    "r_rule": {
        "type": "choice",
        "options": list(_RULES),
        "default": "life",
        "label": "R Rule",
        "description": "Conway-style rule for the red-channel CA",
    },
    "g_rule": {
        "type": "choice",
        "options": list(_RULES),
        "default": "highlife",
        "label": "G Rule",
        "description": "Conway-style rule for the green-channel CA",
    },
    "b_rule": {
        "type": "choice",
        "options": list(_RULES),
        "default": "replicator",
        "label": "B Rule",
        "description": "Conway-style rule for the blue-channel CA",
    },
    "r_dir": {
        "type": "float",
        "min": 0.0,
        "max": 360.0,
        "default": 45.0,
        "label": "R Direction",
        "curve": "linear",
        "unit": "deg",
        "description": "Drift angle for the red channel (0=east, 90=south)",
    },
    "g_dir": {
        "type": "float",
        "min": 0.0,
        "max": 360.0,
        "default": 180.0,
        "label": "G Direction",
        "curve": "linear",
        "unit": "deg",
        "description": "Drift angle for the green channel",
    },
    "b_dir": {
        "type": "float",
        "min": 0.0,
        "max": 360.0,
        "default": 270.0,
        "label": "B Direction",
        "curve": "linear",
        "unit": "deg",
        "description": "Drift angle for the blue channel",
    },
    "r_strength": {
        "type": "float",
        "min": 0.0,
        "max": 40.0,
        "default": 8.0,
        "label": "R Strength",
        "curve": "linear",
        "unit": "px",
        "description": "Maximum red-channel offset magnitude",
    },
    "g_strength": {
        "type": "float",
        "min": 0.0,
        "max": 40.0,
        "default": 8.0,
        "label": "G Strength",
        "curve": "linear",
        "unit": "px",
        "description": "Maximum green-channel offset magnitude",
    },
    "b_strength": {
        "type": "float",
        "min": 0.0,
        "max": 40.0,
        "default": 8.0,
        "label": "B Strength",
        "curve": "linear",
        "unit": "px",
        "description": "Maximum blue-channel offset magnitude",
    },
    "ca_scale": {
        "type": "int",
        "min": 1,
        "max": 8,
        "default": 4,
        "label": "CA Scale",
        "curve": "linear",
        "unit": "x",
        "description": "Downsample factor for the CA grids — larger = chunkier cells",
    },
    "steps_per_frame": {
        "type": "int",
        "min": 1,
        "max": 6,
        "default": 1,
        "label": "Steps/Frame",
        "curve": "linear",
        "unit": "",
        "description": "CA iterations per video frame",
    },
    "seed_density": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.4,
        "label": "Seed Density",
        "curve": "linear",
        "unit": "%",
        "description": "Initial alive-cell ratio per channel",
    },
    "reseed_interval": {
        "type": "int",
        "min": 0,
        "max": 999,
        "default": 0,
        "label": "Reseed Interval",
        "curve": "linear",
        "unit": "frames",
        "description": "Re-randomise CAs every N frames (0 = never)",
    },
    "boundary": {
        "type": "choice",
        "options": list(_BOUNDARIES),
        "default": "clamp",
        "label": "Boundary",
        "description": "Edge behaviour for channel remap",
    },
    "mix": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 1.0,
        "label": "Mix",
        "curve": "linear",
        "unit": "%",
        "description": "Wet/dry blend (1=full effect, 0=identity)",
    },
}

_NEIGHBOR_KERNEL = np.array([[1, 1, 1], [1, 0, 1], [1, 1, 1]], dtype=np.int32)


def _step_ca(grid: np.ndarray, rule: str) -> np.ndarray:
    """Run one CA step with the named rule. Grid is binary int32, wrap boundary."""
    neighbors = convolve2d(grid, _NEIGHBOR_KERNEL, mode="same", boundary="wrap")
    if rule == "highlife":
        # B36/S23
        birth = ((neighbors == 3) | (neighbors == 6)) & (grid == 0)
        survive = ((neighbors == 2) | (neighbors == 3)) & (grid == 1)
    elif rule == "seeds":
        # B2/S
        birth = (neighbors == 2) & (grid == 0)
        survive = np.zeros_like(grid, dtype=bool)
    elif rule == "daynight":
        # B3678/S34678
        birth = (
            (neighbors == 3) | (neighbors == 6) | (neighbors == 7) | (neighbors == 8)
        ) & (grid == 0)
        survive = (
            (neighbors == 3)
            | (neighbors == 4)
            | (neighbors == 6)
            | (neighbors == 7)
            | (neighbors == 8)
        ) & (grid == 1)
    elif rule == "replicator":
        # B1357/S1357
        odd = (neighbors == 1) | (neighbors == 3) | (neighbors == 5) | (neighbors == 7)
        birth = odd & (grid == 0)
        survive = odd & (grid == 1)
    else:
        # life — Conway B3/S23
        birth = (neighbors == 3) & (grid == 0)
        survive = ((neighbors == 2) | (neighbors == 3)) & (grid == 1)
    return (birth | survive).astype(np.int32)


def _seed_grid(h: int, w: int, density: float, seed: int) -> np.ndarray:
    """Random binary grid at the given alive-density using a seeded RNG."""
    rng = np.random.default_rng(int(seed) & 0xFFFFFFFF)
    return (rng.random((h, w)) < density).astype(np.int32)


def _upsample_nearest(grid: np.ndarray, h: int, w: int) -> np.ndarray:
    """Nearest-neighbour upsample a downsampled CA grid back to (h, w).

    Preserves cell edges (no bilinear smearing — chunky cells stay chunky).
    """
    gh, gw = grid.shape
    if (gh, gw) == (h, w):
        return grid.astype(np.float32)
    # repeat then crop to exact (h, w)
    sy = max(1, int(np.ceil(h / gh)))
    sx = max(1, int(np.ceil(w / gw)))
    big = np.repeat(np.repeat(grid, sy, axis=0), sx, axis=1)
    return big[:h, :w].astype(np.float32)


def apply(
    frame: np.ndarray,
    params: dict,
    state_in: dict | None = None,
    *,
    frame_index: int,
    seed: int,
    resolution: tuple[int, int],
) -> tuple[np.ndarray, dict | None]:
    """Cellular Chroma: chromatic aberration whose per-channel offset map is
    driven by three independent cellular automata.
    """

    # PLAY-005: clamp every numeric param at the trust boundary.
    def _rule(name: str, default: str) -> str:
        v = str(params.get(name, default))
        return v if v in _RULES else default

    r_rule = _rule("r_rule", "life")
    g_rule = _rule("g_rule", "highlife")
    b_rule = _rule("b_rule", "replicator")

    r_dir = float(params.get("r_dir", 45.0)) % 360.0
    g_dir = float(params.get("g_dir", 180.0)) % 360.0
    b_dir = float(params.get("b_dir", 270.0)) % 360.0

    r_strength = max(0.0, min(40.0, float(params.get("r_strength", 8.0))))
    g_strength = max(0.0, min(40.0, float(params.get("g_strength", 8.0))))
    b_strength = max(0.0, min(40.0, float(params.get("b_strength", 8.0))))

    ca_scale = max(1, min(8, int(params.get("ca_scale", 4))))
    steps = max(1, min(6, int(params.get("steps_per_frame", 1))))

    seed_density = max(0.0, min(1.0, float(params.get("seed_density", 0.4))))
    reseed_interval = max(0, min(999, int(params.get("reseed_interval", 0))))

    boundary = str(params.get("boundary", "clamp"))
    if boundary not in _BOUNDARIES:
        boundary = "clamp"

    mix = max(0.0, min(1.0, float(params.get("mix", 1.0))))

    # Guard against malformed external floats (NaN, inf) before they hit numpy.
    for v in (r_dir, g_dir, b_dir, r_strength, g_strength, b_strength, mix):
        if not np.isfinite(v):
            # Defensive fallback — caller must not crash on garbage.
            return frame.copy(), state_in

    h, w = frame.shape[:2]
    rgb = frame[:, :, :3]
    alpha = frame[:, :, 3:4]

    # Downsampled CA dimensions (at least 4x4 so neighbour kernels are meaningful).
    gh = max(4, h // ca_scale)
    gw = max(4, w // ca_scale)

    # Determine whether we (re)initialise the CA grids.
    needs_init = False
    if state_in is None:
        needs_init = True
    else:
        cr = state_in.get("ca_r")
        cg = state_in.get("ca_g")
        cb = state_in.get("ca_b")
        if cr is None or cg is None or cb is None:
            needs_init = True
        elif cr.shape != (gh, gw) or cg.shape != (gh, gw) or cb.shape != (gh, gw):
            needs_init = True

    if needs_init:
        ca_r = _seed_grid(gh, gw, seed_density, int(seed) + 0)
        ca_g = _seed_grid(gh, gw, seed_density, int(seed) + 1)
        ca_b = _seed_grid(gh, gw, seed_density, int(seed) + 2)
    else:
        assert state_in is not None
        ca_r = state_in["ca_r"]
        ca_g = state_in["ca_g"]
        ca_b = state_in["ca_b"]

    # Periodic reseed (independent per channel — keeps colonies alive).
    if (
        reseed_interval > 0
        and frame_index > 0
        and (int(frame_index) % reseed_interval) == 0
    ):
        ca_r = _seed_grid(gh, gw, seed_density, int(seed) + int(frame_index) + 0)
        ca_g = _seed_grid(gh, gw, seed_density, int(seed) + int(frame_index) + 1)
        ca_b = _seed_grid(gh, gw, seed_density, int(seed) + int(frame_index) + 2)

    # Step each CA forward `steps` iterations.
    for _ in range(steps):
        ca_r = _step_ca(ca_r, r_rule)
        ca_g = _step_ca(ca_g, g_rule)
        ca_b = _step_ca(ca_b, b_rule)

    state_out = {"ca_r": ca_r, "ca_g": ca_g, "ca_b": ca_b}

    # Upsample CA grids to full frame size with nearest-neighbour (chunky cells).
    field_r = _upsample_nearest(ca_r, h, w)
    field_g = _upsample_nearest(ca_g, h, w)
    field_b = _upsample_nearest(ca_b, h, w)

    # Convert {0,1} into {-1,+1} so alive cells push +offset, dead cells push -offset.
    sign_r = field_r * 2.0 - 1.0
    sign_g = field_g * 2.0 - 1.0
    sign_b = field_b * 2.0 - 1.0

    # Build per-channel (dx, dy) fields. Direction is degrees, screen-space
    # (0 deg = east / +x, 90 deg = south / +y).
    rad_r = np.deg2rad(r_dir)
    rad_g = np.deg2rad(g_dir)
    rad_b = np.deg2rad(b_dir)

    dx_r = (sign_r * (np.cos(rad_r) * r_strength)).astype(np.float32)
    dy_r = (sign_r * (np.sin(rad_r) * r_strength)).astype(np.float32)
    dx_g = (sign_g * (np.cos(rad_g) * g_strength)).astype(np.float32)
    dy_g = (sign_g * (np.sin(rad_g) * g_strength)).astype(np.float32)
    dx_b = (sign_b * (np.cos(rad_b) * b_strength)).astype(np.float32)
    dy_b = (sign_b * (np.sin(rad_b) * b_strength)).astype(np.float32)

    # Sample each channel through its own displacement field.
    # remap_frame collapses single-channel input to 2D — keep that shape and
    # restack at the end.
    def _remap_channel(chan: np.ndarray, dx: np.ndarray, dy: np.ndarray) -> np.ndarray:
        single = chan[:, :, np.newaxis]
        out = remap_frame(single, dx, dy, boundary=boundary)
        if out.ndim == 3:
            out = out[:, :, 0]
        return out

    out_r = _remap_channel(rgb[:, :, 0], dx_r, dy_r)
    out_g = _remap_channel(rgb[:, :, 1], dx_g, dy_g)
    out_b = _remap_channel(rgb[:, :, 2], dx_b, dy_b)

    aberrated = np.stack([out_r, out_g, out_b], axis=2).astype(np.float32)

    # Wet/dry mix against the original RGB.
    if mix < 1.0:
        original = rgb.astype(np.float32)
        result = aberrated * mix + original * (1.0 - mix)
    else:
        result = aberrated

    result_rgb = np.clip(result, 0, 255).astype(np.uint8)

    _ = (frame_index, resolution)  # part of the contract, only frame_index used above
    return np.concatenate([result_rgb, alpha], axis=2), state_out
