"""Grid Scale Mix — mix image at different block scales (dual pixelation)."""

import numpy as np

from engine.determinism import make_rng

EFFECT_ID = "fx.grid_scale_mix"
EFFECT_NAME = "Grid Scale Mix"
EFFECT_CATEGORY = "codec_archaeology"

PARAMS: dict = {
    "scale_a": {
        "type": "int",
        "min": 4,
        "max": 32,
        "default": 8,
        "label": "Scale A",
        "curve": "linear",
        "unit": "px",
        "description": "Block size for first pixelation scale",
    },
    "scale_b": {
        "type": "int",
        "min": 4,
        "max": 32,
        "default": 16,
        "label": "Scale B",
        "curve": "linear",
        "unit": "px",
        "description": "Block size for second pixelation scale",
    },
    "mix": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.5,
        "label": "Mix",
        "curve": "linear",
        "unit": "",
        "description": "Blend between scale A (0) and scale B (1)",
    },
}


def _pixelate(rgb: np.ndarray, block_size: int) -> np.ndarray:
    """Pixelate an image at the given block size."""
    h, w = rgb.shape[:2]
    result = rgb.copy()
    for y in range(0, h, block_size):
        for x in range(0, w, block_size):
            by = min(y + block_size, h)
            bx = min(x + block_size, w)
            avg = result[y:by, x:bx].mean(axis=(0, 1)).astype(np.uint8)
            result[y:by, x:bx] = avg
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
    """Mix image pixelated at two different block scales."""
    scale_a = max(4, min(32, int(params.get("scale_a", 8))))
    scale_b = max(4, min(32, int(params.get("scale_b", 16))))
    mix_amount = max(0.0, min(1.0, float(params.get("mix", 0.5))))

    rgb = frame[:, :, :3]
    alpha = frame[:, :, 3:4]

    pix_a = _pixelate(rgb, scale_a).astype(np.float32)
    pix_b = _pixelate(rgb, scale_b).astype(np.float32)

    result = pix_a * (1.0 - mix_amount) + pix_b * mix_amount
    result_rgb = np.clip(result, 0, 255).astype(np.uint8)

    return np.concatenate([result_rgb, alpha], axis=2), None
