"""DCT/IDCT utilities for codec archaeology effects."""

import numpy as np
from scipy.fft import dctn, idctn


# Standard JPEG luminance quantization table (8x8)
JPEG_LUMA_QT = np.array(
    [
        [16, 11, 10, 16, 24, 40, 51, 61],
        [12, 12, 14, 19, 26, 58, 60, 55],
        [14, 13, 16, 24, 40, 57, 69, 56],
        [14, 17, 22, 29, 51, 87, 80, 62],
        [18, 22, 37, 56, 68, 109, 103, 77],
        [24, 35, 55, 64, 81, 104, 113, 92],
        [49, 64, 78, 87, 103, 121, 120, 101],
        [72, 92, 95, 98, 112, 100, 103, 99],
    ],
    dtype=np.float32,
)

# Standard JPEG chrominance quantization table (8x8)
JPEG_CHROMA_QT = np.array(
    [
        [17, 18, 24, 47, 99, 99, 99, 99],
        [18, 21, 26, 66, 99, 99, 99, 99],
        [24, 26, 56, 99, 99, 99, 99, 99],
        [47, 66, 99, 99, 99, 99, 99, 99],
        [99, 99, 99, 99, 99, 99, 99, 99],
        [99, 99, 99, 99, 99, 99, 99, 99],
        [99, 99, 99, 99, 99, 99, 99, 99],
        [99, 99, 99, 99, 99, 99, 99, 99],
    ],
    dtype=np.float32,
)


def block_dct(block: np.ndarray) -> np.ndarray:
    """Apply 2D DCT to an 8x8 block (or any size)."""
    return dctn(block.astype(np.float32), type=2, norm="ortho")


def block_idct(coeffs: np.ndarray) -> np.ndarray:
    """Apply 2D inverse DCT to coefficient block."""
    return idctn(coeffs.astype(np.float32), type=2, norm="ortho")


def apply_per_block(
    channel: np.ndarray,
    block_size: int,
    transform_fn,
) -> np.ndarray:
    """Apply a transform function to each block_size x block_size block.

    Args:
        channel: 2D array (H, W) float32.
        block_size: Block size (typically 8).
        transform_fn: Callable(block) -> block, operates on each block.

    Returns:
        Transformed channel, same shape as input.
    """
    h, w = channel.shape[:2]
    result = np.zeros_like(channel)

    for y in range(0, h, block_size):
        for x in range(0, w, block_size):
            by = min(y + block_size, h)
            bx = min(x + block_size, w)
            block = channel[y:by, x:bx]

            # Pad to block_size if needed (edge blocks)
            if block.shape[0] < block_size or block.shape[1] < block_size:
                padded = np.zeros((block_size, block_size), dtype=np.float32)
                padded[: block.shape[0], : block.shape[1]] = block
                transformed = transform_fn(padded)
                result[y:by, x:bx] = transformed[: block.shape[0], : block.shape[1]]
            else:
                result[y:by, x:bx] = transform_fn(block)

    return result
