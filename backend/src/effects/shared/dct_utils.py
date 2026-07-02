"""DCT/IDCT utilities for codec archaeology effects."""

import cv2
import numpy as np
from scipy.fft import dctn, idctn

# Threshold: frames larger than this get half-res processing
_HALFRES_PIXEL_THRESHOLD = 1024 * 768


def halfres_wrap(frame: np.ndarray, process_fn):
    """Run process_fn at half resolution if frame is large, then upscale.

    Args:
        frame: RGBA uint8 (H, W, 4).
        process_fn: Callable(frame_rgba) -> frame_rgba, processes at given resolution.

    Returns:
        Processed frame at original resolution.
    """
    h, w = frame.shape[:2]
    if h * w <= _HALFRES_PIXEL_THRESHOLD:
        return process_fn(frame)

    # Downscale
    half_h, half_w = h // 2, w // 2
    small = cv2.resize(frame, (half_w, half_h), interpolation=cv2.INTER_AREA)
    # Process
    result_small = process_fn(small)
    # Upscale back
    result = cv2.resize(result_small, (w, h), interpolation=cv2.INTER_LINEAR)
    return np.clip(result, 0, 255).astype(np.uint8)


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


# --- Vectorized batch DCT (20-50x faster than per-block loop) ---


def batch_dct(channel: np.ndarray, block_size: int = 8) -> np.ndarray:
    """Apply 2D DCT to all blocks at once using 4D tensor reshape.

    Returns 4D array (nby, nbx, block_size, block_size) of DCT coefficients.
    """
    h, w = channel.shape[:2]
    pad_h = (block_size - h % block_size) % block_size
    pad_w = (block_size - w % block_size) % block_size
    if pad_h or pad_w:
        channel = np.pad(channel, ((0, pad_h), (0, pad_w)), mode="constant")
    ph, pw = channel.shape
    blocks = channel.reshape(ph // block_size, block_size, pw // block_size, block_size)
    blocks = blocks.transpose(0, 2, 1, 3).astype(np.float32)
    return dctn(blocks, type=2, norm="ortho", axes=(2, 3))


def batch_idct(coeffs: np.ndarray, block_size: int = 8) -> np.ndarray:
    """Apply 2D inverse DCT to all blocks at once.

    Returns 2D array (H, W) float32 reassembled from inverse-transformed blocks.
    """
    result = idctn(coeffs.astype(np.float32), type=2, norm="ortho", axes=(2, 3))
    nby, nbx = result.shape[:2]
    return result.transpose(0, 2, 1, 3).reshape(nby * block_size, nbx * block_size)


def apply_per_block_vectorized(
    channel: np.ndarray,
    block_size: int,
    transform_fn_batch,
) -> np.ndarray:
    """Vectorized apply_per_block. Transform operates on entire 4D coefficient tensor.

    Args:
        channel: 2D array (H, W) float32.
        block_size: Block size (typically 8).
        transform_fn_batch: Callable(coeffs_4d) -> coeffs_4d.
    """
    h, w = channel.shape[:2]
    coeffs = batch_dct(channel, block_size)
    transformed = transform_fn_batch(coeffs)
    result = batch_idct(transformed, block_size)
    return result[:h, :w]
