"""Tape Saturation — analog magnetic tape modeling with harmonics and HF rolloff."""

import cv2
import numpy as np

from engine.determinism import make_rng

EFFECT_ID = "fx.tape_saturation"
EFFECT_NAME = "Tape Saturation"
EFFECT_CATEGORY = "color"

PARAMS: dict = {
    "drive": {
        "type": "float",
        "min": 0.5,
        "max": 5.0,
        "default": 1.5,
        "label": "Drive",
        "curve": "exponential",
        "unit": "%",
        "description": "Input gain before saturation (higher = more harmonics)",
    },
    "warmth": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.3,
        "label": "Warmth",
        "curve": "linear",
        "unit": "%",
        "description": "Warm color tint amount",
    },
    "mode": {
        "type": "choice",
        "options": ["vintage", "hot", "lo-fi"],
        "default": "vintage",
        "label": "Mode",
        "description": "Tape character (vintage/hot/lo-fi)",
    },
    "output_level": {
        "type": "float",
        "min": 0.5,
        "max": 1.5,
        "default": 1.0,
        "label": "Output Level",
        "curve": "linear",
        "unit": "%",
        "description": "Output gain compensation",
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
    """Tape saturation — harmonic generation, HF rolloff, gentle compression."""
    drive = max(0.5, min(5.0, float(params.get("drive", 1.5))))
    warmth = max(0.0, min(1.0, float(params.get("warmth", 0.3))))
    mode = str(params.get("mode", "vintage"))
    output_level = max(0.5, min(1.5, float(params.get("output_level", 1.0))))

    rgb = frame[:, :, :3]
    alpha = frame[:, :, 3:4]
    f = rgb.astype(np.float32) / 255.0

    # Step 1: HF rolloff (head bump)
    blur_k = 5 if mode == "lo-fi" else 3
    blur_sigma = 1.5 if mode == "lo-fi" else 0.7 + drive * 0.15
    low_freq = cv2.GaussianBlur(f, (blur_k, blur_k), blur_sigma)
    high_freq = f - low_freq
    hf_retention = max(0.1, 1.0 - drive * 0.15)
    if mode == "lo-fi":
        hf_retention = max(0.05, 1.0 - drive * 0.25)
    f = low_freq + high_freq * hf_retention

    # Step 2: Soft-clip saturation (odd harmonic generation)
    mid = 0.5
    centered = (f - mid) * drive
    if mode == "hot":
        saturated = np.tanh(centered * 1.3)
        f = mid + saturated * 0.5 / max(np.tanh(1.3), 0.1)
    elif mode == "lo-fi":
        saturated = np.tanh(centered)
        f = mid + saturated * 0.5
    else:
        saturated = np.tanh(centered * 0.8)
        f = mid + saturated * 0.5 / max(np.tanh(0.8), 0.1)

    # Step 3: Gentle compression
    compress = min(drive * 0.08, 0.3)
    f = f * (1.0 - compress) + 0.5 * compress

    # Step 4: Mode-specific character
    if mode == "hot":
        r, g, b = f[:, :, 0].copy(), f[:, :, 1].copy(), f[:, :, 2].copy()
        f[:, :, 0] = r * 0.88 + g * 0.08 + b * 0.04
        f[:, :, 1] = r * 0.06 + g * 0.88 + b * 0.06
        f[:, :, 2] = r * 0.04 + g * 0.08 + b * 0.88
    elif mode == "lo-fi":
        rng = make_rng(seed)
        noise = rng.standard_normal(f.shape).astype(np.float32) * (
            0.025 + drive * 0.008
        )
        f += noise

    # Step 5: Warmth tint
    if warmth > 0:
        f[:, :, 0] = f[:, :, 0] + warmth * 0.05
        f[:, :, 1] = f[:, :, 1] + warmth * 0.015
        f[:, :, 2] = f[:, :, 2] - warmth * 0.05

    f *= output_level
    result_rgb = np.clip(f * 255, 0, 255).astype(np.uint8)
    output = np.concatenate([result_rgb, alpha], axis=2)
    return output, None
