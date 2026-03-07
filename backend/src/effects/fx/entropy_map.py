"""Entropy Map — visualize local information density per block."""

import numpy as np

EFFECT_ID = "fx.entropy_map"
EFFECT_NAME = "Entropy Map"
EFFECT_CATEGORY = "info_theory"

PARAMS: dict = {
    "block_size": {
        "type": "int",
        "min": 4,
        "max": 32,
        "default": 8,
        "label": "Block Size",
        "curve": "linear",
        "unit": "px",
        "description": "Size of entropy computation blocks",
    },
    "colormap": {
        "type": "choice",
        "options": ["heat", "cool", "gray"],
        "default": "heat",
        "label": "Colormap",
        "description": "Visualization palette for entropy values",
    },
    "overlay": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.5,
        "label": "Overlay",
        "curve": "linear",
        "unit": "%",
        "description": "Blend weight of entropy visualization",
    },
}


def _shannon_entropy(block: np.ndarray) -> float:
    """Compute Shannon entropy of a pixel block."""
    values = block.flatten()
    hist, _ = np.histogram(values, bins=256, range=(0, 256))
    probs = hist[hist > 0].astype(np.float32)
    probs = probs / probs.sum()
    return float(-np.sum(probs * np.log2(probs)))


def _apply_colormap(entropy_img: np.ndarray, colormap: str) -> np.ndarray:
    """Map normalized entropy values [0,1] to RGB."""
    h, w = entropy_img.shape
    result = np.zeros((h, w, 3), dtype=np.uint8)

    if colormap == "heat":
        # Black -> Red -> Yellow -> White
        result[:, :, 0] = np.clip(entropy_img * 3.0 * 255, 0, 255).astype(np.uint8)
        result[:, :, 1] = np.clip((entropy_img - 0.33) * 3.0 * 255, 0, 255).astype(
            np.uint8
        )
        result[:, :, 2] = np.clip((entropy_img - 0.66) * 3.0 * 255, 0, 255).astype(
            np.uint8
        )
    elif colormap == "cool":
        # Blue -> Cyan -> White
        result[:, :, 2] = np.clip(entropy_img * 2.0 * 255, 0, 255).astype(np.uint8)
        result[:, :, 1] = np.clip((entropy_img - 0.33) * 3.0 * 255, 0, 255).astype(
            np.uint8
        )
        result[:, :, 0] = np.clip((entropy_img - 0.66) * 3.0 * 255, 0, 255).astype(
            np.uint8
        )
    else:  # gray
        g = (entropy_img * 255).astype(np.uint8)
        result[:, :, 0] = g
        result[:, :, 1] = g
        result[:, :, 2] = g

    return result


def apply(
    frame: np.ndarray,
    params: dict,
    state_in: dict | None = None,
    *,
    frame_index: int,
    seed: int,
    resolution: tuple[int, int],
) -> tuple[np.ndarray, dict | None]:
    """Compute per-block Shannon entropy and visualize as heatmap."""
    block_size = max(4, min(32, int(params.get("block_size", 8))))
    colormap = str(params.get("colormap", "heat"))
    overlay = max(0.0, min(1.0, float(params.get("overlay", 0.5))))

    rgb = frame[:, :, :3]
    alpha = frame[:, :, 3:4]
    h, w = rgb.shape[:2]

    # Compute luminance for entropy calculation
    luma = (
        0.299 * rgb[:, :, 0].astype(np.float32)
        + 0.587 * rgb[:, :, 1].astype(np.float32)
        + 0.114 * rgb[:, :, 2].astype(np.float32)
    ).astype(np.uint8)

    # Compute entropy per block (max Shannon entropy for 8-bit = 8.0)
    entropy_blocks = np.zeros((h, w), dtype=np.float32)
    for y in range(0, h, block_size):
        for x in range(0, w, block_size):
            by = min(y + block_size, h)
            bx = min(x + block_size, w)
            block = luma[y:by, x:bx]
            e = _shannon_entropy(block) / 8.0  # Normalize to [0, 1]
            entropy_blocks[y:by, x:bx] = e

    # Apply colormap
    entropy_rgb = _apply_colormap(entropy_blocks, colormap)

    # Blend with original
    original_f = rgb.astype(np.float32)
    entropy_f = entropy_rgb.astype(np.float32)
    result = entropy_f * overlay + original_f * (1.0 - overlay)
    result_rgb = np.clip(result, 0, 255).astype(np.uint8)

    return np.concatenate([result_rgb, alpha], axis=2), None
