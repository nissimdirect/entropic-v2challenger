"""JPEG Artifacts — synthetic codec compression damage."""

import io

import numpy as np
from PIL import Image

from engine.determinism import make_rng

EFFECT_ID = "fx.jpeg_artifacts"
EFFECT_NAME = "JPEG Artifacts"
EFFECT_CATEGORY = "destruction"

PARAMS: dict = {
    "quality": {
        "type": "int",
        "min": 1,
        "max": 30,
        "default": 5,
        "label": "Quality",
        "curve": "linear",
        "unit": "%",
        "description": "JPEG quality (lower = more artifacts)",
    },
    "block_damage": {
        "type": "int",
        "min": 0,
        "max": 200,
        "default": 20,
        "label": "Block Damage",
        "curve": "linear",
        "unit": "count",
        "description": "Number of 8x8 blocks to additionally corrupt",
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
    """Simulate heavy JPEG compression artifacts."""
    quality = max(1, min(30, int(params.get("quality", 5))))
    block_damage = max(0, min(200, int(params.get("block_damage", 20))))
    rng = make_rng(seed)

    rgb = frame[:, :, :3]
    alpha = frame[:, :, 3:4]
    img = Image.fromarray(rgb)

    # Triple-compress at very low quality
    for _ in range(3):
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=quality)
        buf.seek(0)
        img = Image.open(buf)
    result_rgb = np.array(img.convert("RGB"))

    # Additional 8x8 block corruption
    if block_damage > 0:
        h, w = result_rgb.shape[:2]
        for _ in range(block_damage):
            by = int(rng.integers(0, max(1, h - 8))) & ~7
            bx = int(rng.integers(0, max(1, w - 8))) & ~7
            block = result_rgb[by : by + 8, bx : bx + 8].copy()
            mean_val = block.mean(axis=(0, 1)).astype(np.uint8)
            bright = block.mean(axis=2) > block.mean(axis=2).mean()
            result_rgb[by : by + 8, bx : bx + 8][bright] = np.minimum(
                mean_val + 60, 255
            )
            result_rgb[by : by + 8, bx : bx + 8][~bright] = np.maximum(mean_val - 60, 0)

    output = np.concatenate([result_rgb, alpha], axis=2)
    return output, None
