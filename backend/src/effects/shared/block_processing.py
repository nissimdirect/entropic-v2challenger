"""Block iteration utilities for codec and information theory effects."""

import numpy as np


def iter_blocks(channel: np.ndarray, block_size: int = 8):
    """Iterate over blocks of a 2D array, yielding (y, x, block).

    Edge blocks may be smaller than block_size.
    """
    h, w = channel.shape[:2]
    for y in range(0, h, block_size):
        for x in range(0, w, block_size):
            by = min(y + block_size, h)
            bx = min(x + block_size, w)
            yield y, x, channel[y:by, x:bx]


def reassemble_blocks(
    blocks: list[tuple[int, int, np.ndarray]], h: int, w: int
) -> np.ndarray:
    """Reassemble blocks into a full 2D array.

    Args:
        blocks: List of (y, x, block) tuples.
        h: Output height.
        w: Output width.

    Returns:
        Reassembled 2D array.
    """
    result = np.zeros((h, w), dtype=np.float32)
    for y, x, block in blocks:
        by = min(y + block.shape[0], h)
        bx = min(x + block.shape[1], w)
        result[y:by, x:bx] = block[: by - y, : bx - x]
    return result
