"""Chroma Control — chroma subsampling simulation (4:2:0 etc)."""

import cv2
import numpy as np

from engine.determinism import make_rng

EFFECT_ID = "fx.chroma_control"
EFFECT_NAME = "Chroma Control"
EFFECT_CATEGORY = "codec_archaeology"

PARAMS: dict = {
    "chroma_subsample": {
        "type": "int",
        "min": 1,
        "max": 8,
        "default": 2,
        "label": "Chroma Subsample",
        "curve": "linear",
        "unit": "x",
        "description": "Chroma downsampling factor (2 = 4:2:0, 4 = extreme)",
    },
    "chroma_blur": {
        "type": "float",
        "min": 0.0,
        "max": 10.0,
        "default": 2.0,
        "label": "Chroma Blur",
        "curve": "linear",
        "unit": "",
        "description": "Additional Gaussian blur on chroma channels",
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
    """Reduce chroma resolution to simulate codec subsampling."""
    subsample = max(1, min(8, int(params.get("chroma_subsample", 2))))
    chroma_blur = max(0.0, min(10.0, float(params.get("chroma_blur", 2.0))))

    h, w = frame.shape[:2]
    rgb = frame[:, :, :3]
    alpha = frame[:, :, 3:4]

    # Convert to YCrCb
    ycrcb = cv2.cvtColor(rgb, cv2.COLOR_RGB2YCrCb).astype(np.float32)
    y_ch = ycrcb[:, :, 0]
    cr = ycrcb[:, :, 1]
    cb = ycrcb[:, :, 2]

    # Downsample chroma channels then upsample back (nearest neighbor)
    if subsample > 1:
        new_h = max(2, h // subsample)
        new_w = max(2, w // subsample)
        cr_small = cv2.resize(cr, (new_w, new_h), interpolation=cv2.INTER_AREA)
        cb_small = cv2.resize(cb, (new_w, new_h), interpolation=cv2.INTER_AREA)
        cr = cv2.resize(cr_small, (w, h), interpolation=cv2.INTER_NEAREST)
        cb = cv2.resize(cb_small, (w, h), interpolation=cv2.INTER_NEAREST)

    # Additional chroma blur
    if chroma_blur > 0.5:
        ksize = int(chroma_blur * 2) * 2 + 1
        cr = cv2.GaussianBlur(cr, (ksize, ksize), 0)
        cb = cv2.GaussianBlur(cb, (ksize, ksize), 0)

    # Reconstruct
    ycrcb_out = np.stack([y_ch, cr, cb], axis=2)
    result_rgb = cv2.cvtColor(
        np.clip(ycrcb_out, 0, 255).astype(np.uint8), cv2.COLOR_YCrCb2RGB
    )

    return np.concatenate([result_rgb, alpha], axis=2), None
