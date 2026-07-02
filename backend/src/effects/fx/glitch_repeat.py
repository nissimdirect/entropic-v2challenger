"""Glitch Repeat — random horizontal slice copy and repeat."""

import numpy as np

from engine.determinism import make_rng

EFFECT_ID = "fx.glitch_repeat"
EFFECT_NAME = "Glitch Repeat"
EFFECT_CATEGORY = "destruction"

PARAMS: dict = {
    "block_height": {
        "type": "int",
        "min": 8,
        "max": 128,
        "default": 32,
        "label": "Block Height",
        "curve": "linear",
        "unit": "px",
        "description": "Maximum height of each repeated slice",
    },
    "probability": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.3,
        "label": "Probability",
        "curve": "linear",
        "unit": "%",
        "description": "Chance of each slice being repeated",
    },
    "max_offset": {
        "type": "int",
        "min": 1,
        "max": 200,
        "default": 50,
        "label": "Max Offset",
        "curve": "linear",
        "unit": "px",
        "description": "Maximum horizontal shift of repeated slices",
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
    """Repeat random horizontal slices with optional shift."""
    block_height = max(8, min(128, int(params.get("block_height", 32))))
    probability = max(0.0, min(1.0, float(params.get("probability", 0.3))))
    max_offset = max(1, min(200, int(params.get("max_offset", 50))))

    h, w = frame.shape[:2]
    rng = make_rng(seed + frame_index)
    result = frame.copy()

    num_slices = max(1, int(h / block_height))
    for _ in range(num_slices):
        if rng.random() > probability:
            continue

        slice_h = int(rng.integers(4, max(5, block_height + 1)))
        src_y = int(rng.integers(0, max(1, h - slice_h)))
        source_slice = frame[src_y : src_y + slice_h].copy()

        # Horizontal shift
        shift_px = int(rng.integers(-max_offset, max_offset + 1))
        source_slice = np.roll(source_slice, shift_px, axis=1)

        dst_y = int(rng.integers(0, max(1, h - slice_h)))
        end_y = min(dst_y + slice_h, h)
        actual_h = end_y - dst_y
        result[dst_y:end_y] = source_slice[:actual_h]

    return result, None
