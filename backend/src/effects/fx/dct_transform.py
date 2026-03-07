"""DCT Transform — sculpt, swap, and destroy DCT coefficients."""

import numpy as np

from effects.shared.dct_utils import apply_per_block, block_dct, block_idct
from engine.determinism import make_rng

EFFECT_ID = "fx.dct_transform"
EFFECT_NAME = "DCT Transform"
EFFECT_CATEGORY = "codec_archaeology"

PARAMS: dict = {
    "mode": {
        "type": "choice",
        "options": ["dct_sculpt", "dct_swap", "dct_phase_destroy"],
        "default": "dct_sculpt",
        "label": "Mode",
        "description": "DCT manipulation mode",
    },
    "freq_band_low": {
        "type": "int",
        "min": 0,
        "max": 7,
        "default": 0,
        "label": "Freq Band Low",
        "curve": "linear",
        "unit": "",
        "description": "Low frequency band cutoff (sculpt mode)",
    },
    "freq_band_high": {
        "type": "int",
        "min": 0,
        "max": 7,
        "default": 3,
        "label": "Freq Band High",
        "curve": "linear",
        "unit": "",
        "description": "High frequency band cutoff (sculpt mode)",
    },
    "swap_probability": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.3,
        "label": "Swap Probability",
        "curve": "linear",
        "unit": "%",
        "description": "Chance of swapping coefficient positions (swap mode)",
    },
    "destroy_probability": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.5,
        "label": "Destroy Probability",
        "curve": "linear",
        "unit": "%",
        "description": "Chance of randomizing coefficient sign (destroy mode)",
    },
    "affect_dc": {
        "type": "choice",
        "options": ["true", "false"],
        "default": "false",
        "label": "Affect DC",
        "description": "Whether to destroy the DC coefficient (destroy mode)",
    },
}

_BLOCK_SIZE = 8


def _make_sculpt_fn(low: int, high: int):
    """Return transform that zeroes coefficients outside freq band."""

    def fn(block: np.ndarray) -> np.ndarray:
        coeffs = block_dct(block)
        mask = np.zeros_like(coeffs)
        mask[low : high + 1, low : high + 1] = 1.0
        return block_idct(coeffs * mask)

    return fn


def _make_swap_fn(rng: np.random.Generator, prob: float):
    """Return transform that randomly swaps coefficient positions."""

    def fn(block: np.ndarray) -> np.ndarray:
        coeffs = block_dct(block)
        flat = coeffs.flatten()
        n = len(flat)
        for i in range(n):
            if rng.random() < prob:
                j = rng.integers(0, n)
                flat[i], flat[j] = flat[j], flat[i]
        return block_idct(flat.reshape(coeffs.shape))

    return fn


def _make_destroy_fn(rng: np.random.Generator, prob: float, affect_dc: bool):
    """Return transform that randomizes coefficient signs."""

    def fn(block: np.ndarray) -> np.ndarray:
        coeffs = block_dct(block)
        mask = rng.random(coeffs.shape) < prob
        if not affect_dc:
            mask[0, 0] = False
        signs = np.where(mask, -1.0, 1.0)
        return block_idct(coeffs * signs)

    return fn


def apply(
    frame: np.ndarray,
    params: dict,
    state_in: dict | None = None,
    *,
    frame_index: int,
    seed: int,
    resolution: tuple[int, int],
) -> tuple[np.ndarray, dict | None]:
    """Apply DCT-domain manipulation per 8x8 block."""
    mode = str(params.get("mode", "dct_sculpt"))
    rng = make_rng(seed + frame_index)

    rgb = frame[:, :, :3].astype(np.float32)
    alpha = frame[:, :, 3:4]

    if mode == "dct_sculpt":
        low = max(0, min(7, int(params.get("freq_band_low", 0))))
        high = max(0, min(7, int(params.get("freq_band_high", 3))))
        if low > high:
            low, high = high, low
        transform_fn = _make_sculpt_fn(low, high)
    elif mode == "dct_swap":
        prob = max(0.0, min(1.0, float(params.get("swap_probability", 0.3))))
        transform_fn = _make_swap_fn(rng, prob)
    else:  # dct_phase_destroy
        prob = max(0.0, min(1.0, float(params.get("destroy_probability", 0.5))))
        affect_dc = str(params.get("affect_dc", "false")) == "true"
        transform_fn = _make_destroy_fn(rng, prob, affect_dc)

    # Process each channel independently
    channels = []
    for c in range(3):
        ch = apply_per_block(rgb[:, :, c], _BLOCK_SIZE, transform_fn)
        channels.append(ch)

    result = np.stack(channels, axis=2)
    result_rgb = np.clip(result, 0, 255).astype(np.uint8)
    return np.concatenate([result_rgb, alpha], axis=2), None
