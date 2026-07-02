"""DCT Transform — sculpt, swap, and destroy DCT coefficients."""

import numpy as np

from effects.shared.dct_utils import (
    apply_per_block_vectorized,
    halfres_wrap,
)
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


def _sculpt_batch(coeffs: np.ndarray, low: int, high: int) -> np.ndarray:
    """Zero coefficients outside freq band — vectorized over all blocks."""
    mask = np.zeros((_BLOCK_SIZE, _BLOCK_SIZE), dtype=np.float32)
    mask[low : high + 1, low : high + 1] = 1.0
    return coeffs * mask[np.newaxis, np.newaxis, :, :]


def _swap_batch(
    coeffs: np.ndarray, rng: np.random.Generator, prob: float
) -> np.ndarray:
    """Randomly swap coefficient positions — vectorized."""
    nby, nbx, bs, bs2 = coeffs.shape
    flat = coeffs.reshape(nby, nbx, bs * bs2)
    n = bs * bs2
    swap_mask = rng.random((nby, nbx, n)) < prob
    swap_targets = rng.integers(0, n, size=(nby, nbx, n))
    for i in range(n):
        should_swap = swap_mask[:, :, i]
        targets = swap_targets[:, :, i]
        target_vals = np.take_along_axis(
            flat, targets[:, :, np.newaxis], axis=2
        ).squeeze(2)
        orig_vals = flat[:, :, i].copy()
        flat[:, :, i] = np.where(should_swap, target_vals, orig_vals)
    return flat.reshape(nby, nbx, bs, bs2)


def _destroy_batch(
    coeffs: np.ndarray, rng: np.random.Generator, prob: float, affect_dc: bool
) -> np.ndarray:
    """Randomize coefficient signs — fully vectorized."""
    mask = rng.random(coeffs.shape) < prob
    if not affect_dc:
        mask[:, :, 0, 0] = False
    signs = np.where(mask, -1.0, 1.0).astype(np.float32)
    return coeffs * signs


def apply(
    frame: np.ndarray,
    params: dict,
    state_in: dict | None = None,
    *,
    frame_index: int,
    seed: int,
    resolution: tuple[int, int],
) -> tuple[np.ndarray, dict | None]:
    """Apply DCT-domain manipulation per 8x8 block (vectorized batch DCT)."""
    mode = str(params.get("mode", "dct_sculpt"))
    rng = make_rng(seed + frame_index)

    if mode == "dct_sculpt":
        low = max(0, min(7, int(params.get("freq_band_low", 0))))
        high = max(0, min(7, int(params.get("freq_band_high", 3))))
        if low > high:
            low, high = high, low
        batch_fn = lambda c: _sculpt_batch(c, low, high)
    elif mode == "dct_swap":
        prob = max(0.0, min(1.0, float(params.get("swap_probability", 0.3))))
        batch_fn = lambda c: _swap_batch(c, rng, prob)
    else:  # dct_phase_destroy
        prob = max(0.0, min(1.0, float(params.get("destroy_probability", 0.5))))
        affect_dc = str(params.get("affect_dc", "false")) == "true"
        batch_fn = lambda c: _destroy_batch(c, rng, prob, affect_dc)

    def _process(f: np.ndarray) -> np.ndarray:
        rgb = f[:, :, :3].astype(np.float32)
        alpha = f[:, :, 3:4]
        channels = []
        for ch in range(3):
            result_ch = apply_per_block_vectorized(rgb[:, :, ch], _BLOCK_SIZE, batch_fn)
            channels.append(result_ch)
        result = np.stack(channels, axis=2)
        result_rgb = np.clip(result, 0, 255).astype(np.uint8)
        return np.concatenate([result_rgb, alpha], axis=2)

    return halfres_wrap(frame, _process), None
