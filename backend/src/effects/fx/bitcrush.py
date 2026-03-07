"""Bitcrush — color depth reduction and resolution scaling."""

import numpy as np

from engine.determinism import make_rng

EFFECT_ID = "fx.bitcrush"
EFFECT_NAME = "Bitcrush"
EFFECT_CATEGORY = "destruction"

PARAMS: dict = {
    "color_depth": {
        "type": "int",
        "min": 1,
        "max": 8,
        "default": 4,
        "label": "Color Depth",
        "curve": "linear",
        "unit": "bits",
        "description": "Bits per channel (1 = black/white, 8 = no change)",
    },
    "resolution_scale": {
        "type": "float",
        "min": 0.05,
        "max": 1.0,
        "default": 0.5,
        "label": "Resolution Scale",
        "curve": "linear",
        "unit": "x",
        "description": "Downscale factor — lower = blockier pixels",
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
    """Reduce color depth and/or resolution."""
    color_depth = max(1, min(8, int(params.get("color_depth", 4))))
    resolution_scale = max(0.05, min(1.0, float(params.get("resolution_scale", 0.5))))

    h, w = frame.shape[:2]
    rgb = frame[:, :, :3].copy()
    alpha = frame[:, :, 3:4]

    # Color depth reduction (posterization)
    if color_depth < 8:
        levels = 2**color_depth
        step = 256.0 / levels
        rgb = (np.floor(rgb.astype(np.float32) / step) * step).astype(np.uint8)

    # Resolution reduction via nearest-neighbor downsample + upsample
    if resolution_scale < 1.0:
        new_w = max(2, int(w * resolution_scale))
        new_h = max(2, int(h * resolution_scale))
        # Downsample with block averaging, upsample with nearest neighbor
        small = rgb[:: max(1, h // new_h), :: max(1, w // new_w)]
        # Repeat pixels to fill original size
        repeat_y = int(np.ceil(h / small.shape[0]))
        repeat_x = int(np.ceil(w / small.shape[1]))
        big = np.repeat(np.repeat(small, repeat_y, axis=0), repeat_x, axis=1)
        rgb = big[:h, :w, :3]

    return np.concatenate([rgb, alpha], axis=2), None
