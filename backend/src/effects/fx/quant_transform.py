"""Quant Transform — quantization table manipulation for codec archaeology."""

import numpy as np

from effects.shared.dct_utils import (
    JPEG_CHROMA_QT,
    JPEG_LUMA_QT,
    apply_per_block_vectorized,
    halfres_wrap,
)

EFFECT_ID = "fx.quant_transform"
EFFECT_NAME = "Quant Transform"
EFFECT_CATEGORY = "codec_archaeology"

PARAMS: dict = {
    "mode": {
        "type": "choice",
        "options": ["quant_amplify", "quant_morph", "quant_table_lerp"],
        "default": "quant_amplify",
        "label": "Mode",
        "description": "Amplify: boost QT values. Morph: lerp luma/chroma QTs. Table Lerp: standard to flat.",
    },
    "amplification": {
        "type": "float",
        "min": 0.1,
        "max": 50.0,
        "default": 5.0,
        "label": "Amplification",
        "curve": "exponential",
        "unit": "x",
        "description": "QT multiplier (quant_amplify mode)",
    },
    "morph_amount": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.5,
        "label": "Morph Amount",
        "curve": "linear",
        "unit": "",
        "description": "Lerp between luma and chroma QTs (quant_morph mode)",
    },
    "flatness": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.5,
        "label": "Flatness",
        "curve": "linear",
        "unit": "",
        "description": "Lerp between standard QT and flat QT (quant_table_lerp mode)",
    },
}

_BLOCK_SIZE = 8


def _quant_amplify_batch(
    coeffs: np.ndarray, qt: np.ndarray, amplification: float
) -> np.ndarray:
    """Requantize with amplified QT values — vectorized over all blocks."""
    amplified_qt = (qt * amplification)[np.newaxis, np.newaxis, :, :]
    quantized = np.round(coeffs / amplified_qt)
    return quantized * amplified_qt


def _quant_morph_batch(coeffs: np.ndarray, morph: float) -> np.ndarray:
    """Requantize with lerped luma/chroma QTs — vectorized."""
    morphed_qt = (JPEG_LUMA_QT * (1.0 - morph) + JPEG_CHROMA_QT * morph)[
        np.newaxis, np.newaxis, :, :
    ]
    quantized = np.round(coeffs / morphed_qt)
    return quantized * morphed_qt


def _quant_lerp_batch(coeffs: np.ndarray, flatness: float) -> np.ndarray:
    """Requantize with lerp between standard and flat QT — vectorized."""
    flat_qt = np.ones((8, 8), dtype=np.float32) * np.mean(JPEG_LUMA_QT)
    lerped_qt = JPEG_LUMA_QT * (1.0 - flatness) + flat_qt * flatness
    lerped_qt = np.maximum(lerped_qt, 1.0)[np.newaxis, np.newaxis, :, :]
    quantized = np.round(coeffs / lerped_qt)
    return quantized * lerped_qt


def apply(
    frame: np.ndarray,
    params: dict,
    state_in: dict | None = None,
    *,
    frame_index: int,
    seed: int,
    resolution: tuple[int, int],
) -> tuple[np.ndarray, dict | None]:
    """Apply quantization table manipulation per 8x8 block (vectorized batch DCT)."""
    mode = str(params.get("mode", "quant_amplify"))

    if mode == "quant_amplify":
        amp = max(0.1, min(50.0, float(params.get("amplification", 5.0))))
        batch_fn = lambda c: _quant_amplify_batch(c, JPEG_LUMA_QT, amp)
    elif mode == "quant_morph":
        morph = max(0.0, min(1.0, float(params.get("morph_amount", 0.5))))
        batch_fn = lambda c: _quant_morph_batch(c, morph)
    else:  # quant_table_lerp
        flatness = max(0.0, min(1.0, float(params.get("flatness", 0.5))))
        batch_fn = lambda c: _quant_lerp_batch(c, flatness)

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
