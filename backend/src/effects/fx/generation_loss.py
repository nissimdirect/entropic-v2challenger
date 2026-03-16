"""Generation Loss — JPEG encode/decode N times to simulate multi-gen copying."""

import io

import numpy as np
from PIL import Image

EFFECT_ID = "fx.generation_loss"
EFFECT_NAME = "Generation Loss"
EFFECT_CATEGORY = "codec_archaeology"

PARAMS: dict = {
    "generations": {
        "type": "int",
        "min": 1,
        "max": 50,
        "default": 10,
        "label": "Generations",
        "curve": "linear",
        "unit": "",
        "description": "Number of encode/decode cycles",
    },
    "quality": {
        "type": "int",
        "min": 1,
        "max": 95,
        "default": 30,
        "label": "Quality",
        "curve": "linear",
        "unit": "",
        "description": "JPEG quality per generation",
    },
    "mix": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 1.0,
        "label": "Mix",
        "curve": "linear",
        "unit": "%",
        "description": "Blend between degraded and original",
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
    """Repeatedly JPEG encode/decode to accumulate generation loss."""
    generations = max(1, min(50, int(params.get("generations", 10))))
    quality = max(1, min(95, int(params.get("quality", 30))))
    mix = max(0.0, min(1.0, float(params.get("mix", 1.0))))

    rgb = frame[:, :, :3]
    alpha = frame[:, :, 3:4]

    # Iterative JPEG encode/decode
    current = rgb
    for _ in range(generations):
        img = Image.fromarray(current)
        with io.BytesIO() as buf:
            img.save(buf, format="JPEG", quality=quality)
            buf.seek(0)
            current = np.array(Image.open(buf).convert("RGB"))

    # Mix with original
    if mix < 1.0:
        result = current.astype(np.float32) * mix + rgb.astype(np.float32) * (1.0 - mix)
        result_rgb = np.clip(result, 0, 255).astype(np.uint8)
    else:
        result_rgb = current

    return np.concatenate([result_rgb, alpha], axis=2), None
