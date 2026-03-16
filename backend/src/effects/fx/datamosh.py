"""Datamosh — simulated I-frame removal via optical flow accumulation."""

import cv2
import numpy as np

from effects.shared.displacement import remap_frame
from engine.determinism import make_rng

EFFECT_ID = "fx.datamosh"
EFFECT_NAME = "Datamosh"
EFFECT_CATEGORY = "destruction"

PARAMS: dict = {
    "mode": {
        "type": "choice",
        "options": ["melt", "bloom", "freeze"],
        "default": "melt",
        "label": "Mode",
        "description": "Melt: accumulate displacement. Bloom: displacement + channel bleed. Freeze: hold reference, apply motion.",
    },
    "intensity": {
        "type": "float",
        "min": 0.1,
        "max": 10.0,
        "default": 1.0,
        "label": "Intensity",
        "curve": "exponential",
        "unit": "x",
        "description": "Flow multiplier — higher = more extreme pixel drift",
    },
    "decay": {
        "type": "float",
        "min": 0.0,
        "max": 0.999,
        "default": 0.95,
        "label": "Decay",
        "curve": "linear",
        "unit": "",
        "description": "How fast accumulated flow fades (higher = longer persistence)",
    },
    "accumulate": {
        "type": "choice",
        "options": ["true", "false"],
        "default": "true",
        "label": "Accumulate",
        "description": "Whether flow compounds over time (true datamosh behavior)",
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
    """Simulated datamosh using optical flow accumulation."""
    mode = str(params.get("mode", "melt"))
    intensity = max(0.1, min(10.0, float(params.get("intensity", 1.0))))
    decay = max(0.0, min(0.999, float(params.get("decay", 0.95))))
    accumulate = str(params.get("accumulate", "true")) == "true"

    h, w = frame.shape[:2]
    rgb = frame[:, :, :3]
    alpha = frame[:, :, 3:4]

    # Initialize or restore state
    if state_in is None or state_in.get("prev_frame") is None:
        state_out = {
            "prev_frame": rgb.copy(),
            "displacement_field": np.zeros((h, w, 2), dtype=np.float32),
            "reference_frame": rgb.copy(),
        }
        return frame.copy(), state_out

    prev_frame = state_in["prev_frame"]
    displacement = state_in["displacement_field"]
    reference_frame = state_in["reference_frame"]

    # Handle resolution changes
    if prev_frame.shape[:2] != (h, w):
        prev_frame = cv2.resize(prev_frame, (w, h))
        displacement = np.zeros((h, w, 2), dtype=np.float32)
        reference_frame = cv2.resize(reference_frame, (w, h))

    # Compute optical flow between previous and current
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

    # Accumulate or replace displacement
    if accumulate:
        displacement = displacement * decay + flow * intensity
    else:
        displacement = flow * intensity

    dx = displacement[:, :, 0].astype(np.float32)
    dy = displacement[:, :, 1].astype(np.float32)

    if mode == "melt":
        # Warp previous frame by accumulated displacement — classic pixel melt
        src = np.concatenate([prev_frame, alpha], axis=2)
        result = remap_frame(src, dx, dy, boundary="wrap")
        new_prev = result[:, :, :3].copy()
    elif mode == "bloom":
        # Displacement + channel separation bleeding
        src = np.concatenate([prev_frame, alpha], axis=2)
        result = remap_frame(src, dx, dy, boundary="wrap")
        # Channel separation proportional to intensity
        if intensity > 0.5:
            shift = int(intensity * 3)
            result_rgb = result[:, :, :3].copy()
            result_rgb[:, :, 0] = np.roll(result_rgb[:, :, 0], shift, axis=1)
            result_rgb[:, :, 2] = np.roll(result_rgb[:, :, 2], -shift, axis=1)
            result = np.concatenate([result_rgb, result[:, :, 3:4]], axis=2)
        new_prev = result[:, :, :3].copy()
    else:  # freeze
        # Hold reference frame, apply subsequent motion vectors to it
        src = np.concatenate([reference_frame, alpha], axis=2)
        result = remap_frame(src, dx, dy, boundary="clamp")
        new_prev = rgb.copy()

    state_out = {
        "prev_frame": new_prev,
        "displacement_field": displacement,
        "reference_frame": reference_frame,
    }
    return np.clip(result, 0, 255).astype(np.uint8), state_out
