"""Frame Smash — mix multiple offset copies of the frame with corruption."""

import numpy as np

from engine.determinism import make_rng

EFFECT_ID = "fx.frame_smash"
EFFECT_NAME = "Frame Smash"
EFFECT_CATEGORY = "destruction"

PARAMS: dict = {
    "copies": {
        "type": "int",
        "min": 2,
        "max": 8,
        "default": 3,
        "label": "Copies",
        "curve": "linear",
        "unit": "",
        "description": "Number of offset copies to blend",
    },
    "offset_range": {
        "type": "int",
        "min": 1,
        "max": 100,
        "default": 30,
        "label": "Offset Range",
        "curve": "linear",
        "unit": "px",
        "description": "Maximum pixel offset for each copy",
    },
    "blend_mode": {
        "type": "choice",
        "options": ["average", "max", "xor"],
        "default": "average",
        "label": "Blend Mode",
        "description": "How copies are combined",
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
    """Mix multiple offset copies of the frame."""
    copies = max(2, min(8, int(params.get("copies", 3))))
    offset_range = max(1, min(100, int(params.get("offset_range", 30))))
    blend_mode = str(params.get("blend_mode", "average"))

    h, w = frame.shape[:2]
    rng = make_rng(seed + frame_index)
    alpha = frame[:, :, 3:4]

    if blend_mode == "average":
        accum = frame[:, :, :3].astype(np.float32)
        for _ in range(copies - 1):
            dy = int(rng.integers(-offset_range, offset_range + 1))
            dx = int(rng.integers(-offset_range, offset_range + 1))
            shifted = np.roll(np.roll(frame[:, :, :3], dy, axis=0), dx, axis=1)
            accum += shifted.astype(np.float32)
        result_rgb = np.clip(accum / copies, 0, 255).astype(np.uint8)
    elif blend_mode == "max":
        result_rgb = frame[:, :, :3].copy()
        for _ in range(copies - 1):
            dy = int(rng.integers(-offset_range, offset_range + 1))
            dx = int(rng.integers(-offset_range, offset_range + 1))
            shifted = np.roll(np.roll(frame[:, :, :3], dy, axis=0), dx, axis=1)
            result_rgb = np.maximum(result_rgb, shifted)
    else:  # xor
        result_rgb = frame[:, :, :3].copy()
        for _ in range(copies - 1):
            dy = int(rng.integers(-offset_range, offset_range + 1))
            dx = int(rng.integers(-offset_range, offset_range + 1))
            shifted = np.roll(np.roll(frame[:, :, :3], dy, axis=0), dx, axis=1)
            result_rgb = np.bitwise_xor(result_rgb, shifted)

    return np.concatenate([result_rgb, alpha], axis=2), None
