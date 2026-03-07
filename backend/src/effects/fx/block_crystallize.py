"""Block Crystallize — replace each block with its average color."""

import numpy as np

from engine.determinism import make_rng

EFFECT_ID = "fx.block_crystallize"
EFFECT_NAME = "Block Crystallize"
EFFECT_CATEGORY = "codec_archaeology"

PARAMS: dict = {
    "block_size": {
        "type": "int",
        "min": 4,
        "max": 64,
        "default": 8,
        "label": "Block Size",
        "curve": "linear",
        "unit": "px",
        "description": "Size of each crystallized block",
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
    """Replace each block with its average color."""
    block_size = max(4, min(64, int(params.get("block_size", 8))))

    h, w = frame.shape[:2]
    rgb = frame[:, :, :3].copy()
    alpha = frame[:, :, 3:4]

    for y in range(0, h, block_size):
        for x in range(0, w, block_size):
            by = min(y + block_size, h)
            bx = min(x + block_size, w)
            block = rgb[y:by, x:bx]
            avg = block.mean(axis=(0, 1)).astype(np.uint8)
            rgb[y:by, x:bx] = avg

    return np.concatenate([rgb, alpha], axis=2), None
