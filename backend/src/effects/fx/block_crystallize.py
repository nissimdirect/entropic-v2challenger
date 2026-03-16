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
    rgb = frame[:, :, :3].astype(np.float32)
    alpha = frame[:, :, 3:4]
    bs = block_size

    # Vectorized: pad, reshape to blocks, mean, tile back
    pad_h = (bs - h % bs) % bs
    pad_w = (bs - w % bs) % bs
    if pad_h or pad_w:
        rgb = np.pad(rgb, ((0, pad_h), (0, pad_w), (0, 0)), mode="edge")
    ph, pw = rgb.shape[:2]
    nby, nbx = ph // bs, pw // bs
    blocks = rgb.reshape(nby, bs, nbx, bs, 3).transpose(0, 2, 1, 3, 4)
    avgs = blocks.mean(axis=(2, 3), keepdims=True)
    filled = np.broadcast_to(avgs, blocks.shape)
    result = filled.transpose(0, 2, 1, 3, 4).reshape(ph, pw, 3)
    result_rgb = np.clip(result[:h, :w], 0, 255).astype(np.uint8)

    return np.concatenate([result_rgb, alpha], axis=2), None
