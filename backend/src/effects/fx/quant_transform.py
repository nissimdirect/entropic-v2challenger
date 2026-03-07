"""Quant Transform — quantization table manipulation for codec archaeology."""

import numpy as np

from effects.shared.dct_utils import (
    JPEG_CHROMA_QT,
    JPEG_LUMA_QT,
    apply_per_block,
    block_dct,
    block_idct,
)
from engine.determinism import make_rng

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


def _make_quant_amplify_fn(qt: np.ndarray, amplification: float):
    """Requantize with amplified QT values."""
    amplified_qt = qt * amplification

    def fn(block: np.ndarray) -> np.ndarray:
        coeffs = block_dct(block)
        # Quantize then dequantize with amplified table
        quantized = np.round(coeffs / amplified_qt)
        return block_idct(quantized * amplified_qt)

    return fn


def _make_quant_morph_fn(morph: float):
    """Requantize with lerped luma/chroma QTs."""
    morphed_qt = JPEG_LUMA_QT * (1.0 - morph) + JPEG_CHROMA_QT * morph

    def fn(block: np.ndarray) -> np.ndarray:
        coeffs = block_dct(block)
        quantized = np.round(coeffs / morphed_qt)
        return block_idct(quantized * morphed_qt)

    return fn


def _make_quant_lerp_fn(flatness: float):
    """Requantize with lerp between standard and flat QT."""
    flat_qt = np.ones((8, 8), dtype=np.float32) * np.mean(JPEG_LUMA_QT)
    lerped_qt = JPEG_LUMA_QT * (1.0 - flatness) + flat_qt * flatness
    lerped_qt = np.maximum(lerped_qt, 1.0)  # Avoid division by zero

    def fn(block: np.ndarray) -> np.ndarray:
        coeffs = block_dct(block)
        quantized = np.round(coeffs / lerped_qt)
        return block_idct(quantized * lerped_qt)

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
    """Apply quantization table manipulation per 8x8 block."""
    mode = str(params.get("mode", "quant_amplify"))

    rgb = frame[:, :, :3].astype(np.float32)
    alpha = frame[:, :, 3:4]

    if mode == "quant_amplify":
        amp = max(0.1, min(50.0, float(params.get("amplification", 5.0))))
        transform_fn = _make_quant_amplify_fn(JPEG_LUMA_QT, amp)
    elif mode == "quant_morph":
        morph = max(0.0, min(1.0, float(params.get("morph_amount", 0.5))))
        transform_fn = _make_quant_morph_fn(morph)
    else:  # quant_table_lerp
        flatness = max(0.0, min(1.0, float(params.get("flatness", 0.5))))
        transform_fn = _make_quant_lerp_fn(flatness)

    channels = []
    for c in range(3):
        ch = apply_per_block(rgb[:, :, c], _BLOCK_SIZE, transform_fn)
        channels.append(ch)

    result = np.stack(channels, axis=2)
    result_rgb = np.clip(result, 0, 255).astype(np.uint8)
    return np.concatenate([result_rgb, alpha], axis=2), None
