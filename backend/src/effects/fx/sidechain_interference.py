"""Sidechain Interference — moire-like pattern from combining main and key frames."""

import numpy as np

from engine.determinism import make_rng

EFFECT_ID = "fx.sidechain_interference"
EFFECT_NAME = "Sidechain Interference"
EFFECT_CATEGORY = "sidechain"

PARAMS: dict = {
    "frequency": {
        "type": "float",
        "min": 1.0,
        "max": 50.0,
        "default": 10.0,
        "label": "Frequency",
        "curve": "linear",
        "unit": "Hz",
        "description": "Interference pattern frequency",
    },
    "angle": {
        "type": "float",
        "min": 0.0,
        "max": 180.0,
        "default": 45.0,
        "label": "Angle",
        "curve": "linear",
        "unit": "deg",
        "description": "Angle of interference pattern",
    },
    "mix": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.5,
        "label": "Mix",
        "curve": "linear",
        "unit": "",
        "description": "Blend between original and interference result",
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
    """Generate moire interference between main and key frames."""
    frequency = max(1.0, min(50.0, float(params.get("frequency", 10.0))))
    angle = max(0.0, min(180.0, float(params.get("angle", 45.0))))
    mix_amount = max(0.0, min(1.0, float(params.get("mix", 0.5))))

    h, w = frame.shape[:2]
    rgb = frame[:, :, :3].astype(np.float32)
    alpha = frame[:, :, 3:4]

    # Get sidechain key frame
    key_frame = params.get("_sidechain_frame")
    if key_frame is None:
        key_frame = frame[:, :, :3]
    elif key_frame.shape[2] == 4:
        key_frame = key_frame[:, :, :3]

    if key_frame.shape[:2] != (h, w):
        import cv2

        key_frame = cv2.resize(key_frame, (w, h))

    key_f = key_frame.astype(np.float32)

    # Generate directional interference pattern
    angle_rad = np.radians(angle)
    y_coords, x_coords = np.mgrid[0:h, 0:w].astype(np.float32)
    # Rotated coordinate for pattern direction
    rotated = x_coords * np.cos(angle_rad) + y_coords * np.sin(angle_rad)
    pattern = np.sin(rotated * frequency * 2.0 * np.pi / w) * 0.5 + 0.5
    pattern_3d = pattern[:, :, np.newaxis]

    # Interference: modulate difference between main and key by pattern
    diff = np.abs(rgb - key_f)
    interference = rgb + diff * pattern_3d * 2.0 - diff * 0.5

    # Mix
    result = rgb * (1.0 - mix_amount) + interference * mix_amount
    result_rgb = np.clip(result, 0, 255).astype(np.uint8)

    return np.concatenate([result_rgb, alpha], axis=2), None
