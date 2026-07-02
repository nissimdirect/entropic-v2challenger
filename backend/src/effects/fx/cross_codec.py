"""Cross Codec — multi-pass JPEG encode/decode at different qualities."""

import io

import numpy as np
from PIL import Image

from engine.determinism import make_rng

EFFECT_ID = "fx.cross_codec"
EFFECT_NAME = "Cross Codec"
EFFECT_CATEGORY = "codec_archaeology"

PARAMS: dict = {
    "quality_a": {
        "type": "int",
        "min": 1,
        "max": 95,
        "default": 90,
        "label": "Quality A",
        "curve": "linear",
        "unit": "%",
        "description": "JPEG quality for first pass",
    },
    "quality_b": {
        "type": "int",
        "min": 1,
        "max": 95,
        "default": 10,
        "label": "Quality B",
        "curve": "linear",
        "unit": "%",
        "description": "JPEG quality for second pass",
    },
    "iterations": {
        "type": "int",
        "min": 1,
        "max": 5,
        "default": 2,
        "label": "Iterations",
        "curve": "linear",
        "unit": "",
        "description": "Number of encode/decode round-trips",
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
    """Encode with one quality, decode, re-encode with different quality."""
    quality_a = max(1, min(95, int(params.get("quality_a", 90))))
    quality_b = max(1, min(95, int(params.get("quality_b", 10))))
    iterations = max(1, min(5, int(params.get("iterations", 2))))

    rgb = frame[:, :, :3]
    alpha = frame[:, :, 3:4]

    img = Image.fromarray(rgb)

    for _ in range(iterations):
        # Pass A
        buf_a = io.BytesIO()
        img.save(buf_a, format="JPEG", quality=quality_a)
        buf_a.seek(0)
        img = Image.open(buf_a)

        # Pass B
        buf_b = io.BytesIO()
        img.save(buf_b, format="JPEG", quality=quality_b)
        buf_b.seek(0)
        img = Image.open(buf_b)

    result_rgb = np.array(img.convert("RGB"))

    return np.concatenate([result_rgb, alpha], axis=2), None
