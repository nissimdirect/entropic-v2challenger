"""Displacement — randomly displace blocks of the image (glitch block effect)."""

import numpy as np

from engine.determinism import make_rng

EFFECT_ID = "fx.displacement"
EFFECT_NAME = "Displacement"
EFFECT_CATEGORY = "distortion"

PARAMS: dict = {
    "block_size": {
        "type": "int",
        "min": 4,
        "max": 128,
        "default": 16,
        "label": "Block Size",
        "curve": "linear",
        "unit": "px",
        "description": "Size of each displaced block in pixels",
    },
    "intensity": {
        "type": "float",
        "min": 0.0,
        "max": 100.0,
        "default": 10.0,
        "label": "Intensity",
        "curve": "exponential",
        "unit": "%",
        "description": "Maximum displacement in pixels",
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
    """Randomly displace blocks — glitch block effect."""
    block_size = max(4, min(128, int(params.get("block_size", 16))))
    intensity = max(0.0, min(100.0, float(params.get("intensity", 10.0))))

    h, w = frame.shape[:2]
    block_size = min(block_size, min(h, w))
    intensity = min(intensity, max(h, w) // 2)
    rng = make_rng(seed)
    rgb = frame[:, :, :3].copy()
    alpha = frame[:, :, 3:4]

    for y in range(0, h, block_size):
        for x in range(0, w, block_size):
            if rng.random() > 0.6:
                dy = int(rng.integers(-int(intensity), int(intensity) + 1))
                dx = int(rng.integers(-int(intensity), int(intensity) + 1))
                by = min(y + block_size, h)
                bx = min(x + block_size, w)
                sy = max(0, min(y + dy, h - block_size))
                sx = max(0, min(x + dx, w - block_size))
                sby = min(sy + (by - y), h)
                sbx = min(sx + (bx - x), w)
                bh = min(by - y, sby - sy)
                bw = min(bx - x, sbx - sx)
                if bh > 0 and bw > 0:
                    rgb[y : y + bh, x : x + bw] = frame[sy : sy + bh, sx : sx + bw, :3]

    return np.concatenate([rgb, alpha], axis=2), None
