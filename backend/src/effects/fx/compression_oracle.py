"""Compression Oracle — JPEG compress and subtract to reveal codec-invisible data."""

import io

import numpy as np
from PIL import Image

EFFECT_ID = "fx.compression_oracle"
EFFECT_NAME = "Compression Oracle"
EFFECT_CATEGORY = "info_theory"

PARAMS: dict = {
    "quality": {
        "type": "int",
        "min": 1,
        "max": 100,
        "default": 10,
        "label": "Quality",
        "curve": "linear",
        "unit": "",
        "description": "JPEG quality level (lower = more visible residual)",
    },
    "amplify": {
        "type": "float",
        "min": 1.0,
        "max": 50.0,
        "default": 10.0,
        "label": "Amplify",
        "curve": "linear",
        "unit": "x",
        "description": "Amplification of the difference signal",
    },
    "show_original_weight": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.0,
        "label": "Original Blend",
        "curve": "linear",
        "unit": "%",
        "description": "Blend weight of original frame (0 = pure residual)",
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
    """Compress via JPEG, subtract from original, amplify the residual."""
    quality = max(1, min(100, int(params.get("quality", 10))))
    amplify = max(1.0, min(50.0, float(params.get("amplify", 10.0))))
    blend = max(0.0, min(1.0, float(params.get("show_original_weight", 0.0))))

    rgb = frame[:, :, :3]
    alpha = frame[:, :, 3:4]

    # JPEG compress in memory
    img = Image.fromarray(rgb, "RGB")
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=quality)
    buf.seek(0)
    compressed = np.array(Image.open(buf).convert("RGB"), dtype=np.float32)

    # Compute amplified residual
    original_f = rgb.astype(np.float32)
    diff = (original_f - compressed) * amplify + 128.0

    # Blend with original
    if blend > 0.0:
        result = diff * (1.0 - blend) + original_f * blend
    else:
        result = diff

    result_rgb = np.clip(result, 0, 255).astype(np.uint8)
    return np.concatenate([result_rgb, alpha], axis=2), None
