"""Flow Distort — optical flow displacement without accumulation."""

import cv2
import numpy as np

from effects.shared.displacement import remap_frame
from engine.determinism import make_rng

EFFECT_ID = "fx.flow_distort"
EFFECT_NAME = "Flow Distort"
EFFECT_CATEGORY = "destruction"

PARAMS: dict = {
    "intensity": {
        "type": "float",
        "min": 0.1,
        "max": 20.0,
        "default": 5.0,
        "label": "Intensity",
        "curve": "exponential",
        "unit": "x",
        "description": "Flow displacement multiplier",
    },
    "smooth": {
        "type": "float",
        "min": 0.0,
        "max": 10.0,
        "default": 2.0,
        "label": "Smooth",
        "curve": "linear",
        "unit": "",
        "description": "Gaussian blur radius applied to flow field",
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
    """Apply current optical flow as direct displacement."""
    intensity = max(0.1, min(20.0, float(params.get("intensity", 5.0))))
    smooth = max(0.0, min(10.0, float(params.get("smooth", 2.0))))

    h, w = frame.shape[:2]
    rgb = frame[:, :, :3]
    alpha = frame[:, :, 3:4]

    # Need previous frame for flow computation
    if state_in is None or state_in.get("prev_frame") is None:
        state_out = {"prev_frame": rgb.copy()}
        return frame.copy(), state_out

    prev_frame = state_in["prev_frame"]
    if prev_frame.shape[:2] != (h, w):
        prev_frame = cv2.resize(prev_frame, (w, h))

    gray_prev = cv2.cvtColor(prev_frame, cv2.COLOR_RGB2GRAY)
    gray_curr = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    flow = cv2.calcOpticalFlowFarneback(
        gray_prev,
        gray_curr,
        None,
        pyr_scale=0.5,
        levels=3,
        winsize=15,
        iterations=3,
        poly_n=5,
        poly_sigma=1.2,
        flags=0,
    )

    dx = (flow[:, :, 0] * intensity).astype(np.float32)
    dy = (flow[:, :, 1] * intensity).astype(np.float32)

    # Smooth the flow field
    if smooth > 0.5:
        ksize = int(smooth * 2) * 2 + 1
        dx = cv2.GaussianBlur(dx, (ksize, ksize), 0)
        dy = cv2.GaussianBlur(dy, (ksize, ksize), 0)

    result = remap_frame(frame, dx, dy, boundary="clamp")
    state_out = {"prev_frame": rgb.copy()}
    return np.clip(result, 0, 255).astype(np.uint8), state_out
