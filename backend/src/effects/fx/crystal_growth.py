"""Crystal Growth — simulated dendrite/crystal growth from seed points."""

import numpy as np

from engine.determinism import make_rng

EFFECT_ID = "fx.crystal_growth"
EFFECT_NAME = "Crystal Growth"
EFFECT_CATEGORY = "emergent"

PARAMS: dict = {
    "seed_count": {
        "type": "int",
        "min": 1,
        "max": 20,
        "default": 5,
        "label": "Seeds",
        "curve": "linear",
        "unit": "",
        "description": "Number of crystal seed points",
    },
    "growth_rate": {
        "type": "float",
        "min": 0.1,
        "max": 1.0,
        "default": 0.3,
        "label": "Growth Rate",
        "curve": "linear",
        "unit": "",
        "description": "Speed of crystal expansion per frame",
    },
    "branch_prob": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.4,
        "label": "Branch Prob",
        "curve": "linear",
        "unit": "",
        "description": "Probability of branching at growth sites",
    },
    "mix": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.5,
        "label": "Mix",
        "curve": "linear",
        "unit": "%",
        "description": "Blend between crystal overlay and original",
    },
}

_NEIGHBORS = [(-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (-1, 1), (1, -1), (1, 1)]


def apply(
    frame: np.ndarray,
    params: dict,
    state_in: dict | None = None,
    *,
    frame_index: int,
    seed: int,
    resolution: tuple[int, int],
) -> tuple[np.ndarray, dict | None]:
    """Crystal/dendrite growth from seed points overlaid on frame."""
    seed_count = max(1, min(20, int(params.get("seed_count", 5))))
    growth_rate = max(0.1, min(1.0, float(params.get("growth_rate", 0.3))))
    branch_prob = max(0.0, min(1.0, float(params.get("branch_prob", 0.4))))
    mix = max(0.0, min(1.0, float(params.get("mix", 0.5))))

    h, w = frame.shape[:2]
    rgb = frame[:, :, :3]
    alpha = frame[:, :, 3:4]
    rng = make_rng(seed + frame_index)

    # Initialize or restore state
    if state_in is not None and "crystal_map" in state_in:
        crystal_map = state_in["crystal_map"]
        growth_sites = state_in.get("growth_sites", [])
        if crystal_map.shape != (h, w):
            crystal_map = np.zeros((h, w), dtype=np.uint8)
            growth_sites = []
    else:
        crystal_map = np.zeros((h, w), dtype=np.uint8)
        growth_sites = []

    # Seed initial points from bright spots on first frame
    if len(growth_sites) == 0:
        luma = (
            0.299 * rgb[:, :, 0].astype(np.float32)
            + 0.587 * rgb[:, :, 1].astype(np.float32)
            + 0.114 * rgb[:, :, 2].astype(np.float32)
        ) / 255.0
        bright_ys, bright_xs = np.where(luma > 0.7)
        if len(bright_ys) > 0:
            indices = rng.choice(
                len(bright_ys), size=min(seed_count, len(bright_ys)), replace=False
            )
            for idx in indices:
                sy, sx = int(bright_ys[idx]), int(bright_xs[idx])
                crystal_map[sy, sx] = 255
                growth_sites.append((sy, sx))
        else:
            # Fallback: random seeds
            for _ in range(seed_count):
                sy = int(rng.integers(0, h))
                sx = int(rng.integers(0, w))
                crystal_map[sy, sx] = 255
                growth_sites.append((sy, sx))

    # Grow crystals
    growth_steps = max(1, int(growth_rate * 50))
    new_sites = []
    for _ in range(growth_steps):
        if len(growth_sites) == 0:
            break
        next_sites = []
        for gy, gx in growth_sites:
            for dy, dx in _NEIGHBORS:
                ny, nx = gy + dy, gx + dx
                if 0 <= ny < h and 0 <= nx < w and crystal_map[ny, nx] == 0:
                    if rng.random() < branch_prob:
                        crystal_map[ny, nx] = 255
                        next_sites.append((ny, nx))
        growth_sites = next_sites
        new_sites.extend(next_sites)

    # Keep only frontier for next frame (limit size)
    if len(growth_sites) > 5000:
        indices = rng.choice(len(growth_sites), size=5000, replace=False)
        growth_sites = [growth_sites[i] for i in indices]

    # Overlay crystal on frame
    crystal_mask = crystal_map.astype(np.float32) / 255.0
    crystal_color = np.ones_like(rgb, dtype=np.float32) * 255.0
    overlay = crystal_color * crystal_mask[:, :, np.newaxis]
    result = (
        rgb.astype(np.float32) * (1.0 - mix * crystal_mask[:, :, np.newaxis])
        + overlay * mix
    )
    result_rgb = np.clip(result, 0, 255).astype(np.uint8)

    state_out = {"crystal_map": crystal_map, "growth_sites": growth_sites}
    return np.concatenate([result_rgb, alpha], axis=2), state_out
