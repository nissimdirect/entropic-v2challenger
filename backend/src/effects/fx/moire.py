"""Moire — interference patterns from overlapping sine gratings."""

import numpy as np

EFFECT_ID = "fx.moire"
EFFECT_NAME = "Moire"
EFFECT_CATEGORY = "misc"

PARAMS: dict = {
    "freq_1": {
        "type": "float",
        "min": 5.0,
        "max": 100.0,
        "default": 20.0,
        "label": "Frequency 1",
        "curve": "linear",
        "unit": "",
        "description": "First grating frequency",
    },
    "freq_2": {
        "type": "float",
        "min": 5.0,
        "max": 100.0,
        "default": 22.0,
        "label": "Frequency 2",
        "curve": "linear",
        "unit": "",
        "description": "Second grating frequency",
    },
    "angle": {
        "type": "float",
        "min": 0.0,
        "max": 180.0,
        "default": 15.0,
        "label": "Angle",
        "curve": "linear",
        "unit": "deg",
        "description": "Angle between gratings",
    },
    "mix": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.3,
        "label": "Mix",
        "curve": "linear",
        "unit": "%",
        "description": "Blend between moire pattern and original",
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
    """Moire interference from two overlapping sine gratings."""
    freq_1 = max(5.0, min(100.0, float(params.get("freq_1", 20.0))))
    freq_2 = max(5.0, min(100.0, float(params.get("freq_2", 22.0))))
    angle = max(0.0, min(180.0, float(params.get("angle", 15.0))))
    mix = max(0.0, min(1.0, float(params.get("mix", 0.3))))

    h, w = frame.shape[:2]
    rgb = frame[:, :, :3]
    alpha = frame[:, :, 3:4]

    y_coords, x_coords = np.mgrid[0:h, 0:w].astype(np.float32)
    x_norm = x_coords / max(w, 1)
    y_norm = y_coords / max(h, 1)

    # First grating (vertical)
    grating_1 = np.sin(2.0 * np.pi * freq_1 * x_norm)

    # Second grating (rotated by angle)
    angle_rad = np.deg2rad(angle)
    rotated = x_norm * np.cos(angle_rad) + y_norm * np.sin(angle_rad)
    grating_2 = np.sin(2.0 * np.pi * freq_2 * rotated)

    # Moire = product of two gratings, normalize to 0-1
    moire = (grating_1 * grating_2 + 1.0) * 0.5

    # Apply moire as modulation
    moire_rgb = moire[:, :, np.newaxis] * 255.0
    moire_3ch = np.broadcast_to(moire_rgb, (h, w, 3))

    result = rgb.astype(np.float32) * (1.0 - mix) + moire_3ch * mix
    result_rgb = np.clip(result, 0, 255).astype(np.uint8)

    return np.concatenate([result_rgb, alpha], axis=2), None
