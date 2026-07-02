"""Block Corrupt — macroblock displacement simulating codec errors."""

import numpy as np

from engine.determinism import make_rng

EFFECT_ID = "fx.block_corrupt"
EFFECT_NAME = "Block Corrupt"
EFFECT_CATEGORY = "destruction"

PARAMS: dict = {
    "num_blocks": {
        "type": "int",
        "min": 1,
        "max": 200,
        "default": 15,
        "label": "Blocks",
        "curve": "linear",
        "unit": "count",
        "description": "Number of blocks to corrupt",
    },
    "block_size": {
        "type": "int",
        "min": 4,
        "max": 256,
        "default": 32,
        "label": "Block Size",
        "curve": "linear",
        "unit": "px",
        "description": "Size of each block in pixels",
    },
    "mode": {
        "type": "choice",
        "options": ["shift", "noise", "repeat", "invert", "zero", "smear", "random"],
        "default": "shift",
        "label": "Mode",
        "description": "Corruption mode",
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
    """Corrupt random rectangular blocks — simulates codec macroblock errors."""
    num_blocks = max(1, min(200, int(params.get("num_blocks", 15))))
    block_size = max(4, min(256, int(params.get("block_size", 32))))
    mode = str(params.get("mode", "shift"))
    rng = make_rng(seed)

    corruption_modes = ["shift", "noise", "repeat", "invert", "zero", "smear"]
    h, w = frame.shape[:2]
    channels = frame.shape[2]
    result = frame.copy()

    # Generate random block positions
    positions = [
        (
            int(rng.integers(0, max(1, h - block_size))),
            int(rng.integers(0, max(1, w - block_size))),
        )
        for _ in range(num_blocks)
    ]

    for y, x in positions:
        bh = min(block_size, h - y)
        bw = min(block_size, w - x)

        m = (
            mode
            if mode != "random"
            else corruption_modes[int(rng.integers(0, len(corruption_modes)))]
        )

        if m == "shift":
            sy = int(rng.integers(0, max(1, h - bh)))
            sx = int(rng.integers(0, max(1, w - bw)))
            result[y : y + bh, x : x + bw, :3] = frame[sy : sy + bh, sx : sx + bw, :3]
        elif m == "noise":
            result[y : y + bh, x : x + bw, :3] = rng.integers(
                0, 256, (bh, bw, 3), dtype=np.uint8
            )
        elif m == "repeat":
            row = result[y, x : x + bw, :3].copy()
            result[y : y + bh, x : x + bw, :3] = row[np.newaxis, :, :]
        elif m == "invert":
            result[y : y + bh, x : x + bw, :3] = (
                255 - result[y : y + bh, x : x + bw, :3]
            )
        elif m == "zero":
            result[y : y + bh, x : x + bw, :3] = 0
        elif m == "smear":
            col_idx = int(rng.integers(x, max(x + 1, x + bw)))
            col = result[y : y + bh, col_idx : col_idx + 1, :3].copy()
            result[y : y + bh, x : x + bw, :3] = col

    return result, None
