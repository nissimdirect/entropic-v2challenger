"""Entropy Map — visualize local information density per block."""

import numpy as np

from effects.shared.dct_utils import halfres_wrap

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

    def _process(f: np.ndarray) -> np.ndarray:
        rgb = f[:, :, :3]
        alpha = f[:, :, 3:4]
        h, w = rgb.shape[:2]

        luma = (
            0.299 * rgb[:, :, 0].astype(np.float32)
            + 0.587 * rgb[:, :, 1].astype(np.float32)
            + 0.114 * rgb[:, :, 2].astype(np.float32)
        ).astype(np.uint8)

        # Vectorized entropy computation via reshape
        pad_h = (block_size - h % block_size) % block_size
        pad_w = (block_size - w % block_size) % block_size
        luma_padded = (
            np.pad(luma, ((0, pad_h), (0, pad_w)), mode="edge")
            if (pad_h or pad_w)
            else luma
        )
        ph, pw = luma_padded.shape
        nby, nbx = ph // block_size, pw // block_size
        blocks = luma_padded.reshape(nby, block_size, nbx, block_size).transpose(
            0, 2, 1, 3
        )
        # Compute entropy per block (flatten blocks, histogram per block)
        flat_blocks = blocks.reshape(nby, nbx, -1)  # (nby, nbx, bs*bs)
        entropy_vals = np.zeros((nby, nbx), dtype=np.float32)
        for i in range(nby):
            for j in range(nbx):
                entropy_vals[i, j] = _shannon_entropy(flat_blocks[i, j]) / 8.0
        # Tile entropy values back to full resolution
        entropy_tiled = np.repeat(
            np.repeat(entropy_vals, block_size, axis=0), block_size, axis=1
        )
        entropy_blocks = entropy_tiled[:h, :w]

        entropy_rgb = _apply_colormap(entropy_blocks, colormap)

        original_f = rgb.astype(np.float32)
        entropy_f = entropy_rgb.astype(np.float32)
        result = entropy_f * overlay + original_f * (1.0 - overlay)
        result_rgb = np.clip(result, 0, 255).astype(np.uint8)
        return np.concatenate([result_rgb, alpha], axis=2)

    return halfres_wrap(frame, _process), None
