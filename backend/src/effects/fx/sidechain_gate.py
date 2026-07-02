"""Sidechain Gate — gate open/close based on key frame brightness or motion."""

import cv2
import numpy as np

from engine.determinism import make_rng

EFFECT_ID = "fx.sidechain_gate"
EFFECT_NAME = "Sidechain Gate"
EFFECT_CATEGORY = "sidechain"

PARAMS: dict = {
    "threshold": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.3,
        "label": "Threshold",
        "curve": "linear",
        "unit": "",
        "description": "Signal level to open the gate",
    },
    "attack": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.1,
        "label": "Attack",
        "curve": "linear",
        "unit": "",
        "description": "How fast the gate opens (0 = instant)",
    },
    "mode": {
        "type": "choice",
        "options": ["brightness", "motion"],
        "default": "brightness",
        "label": "Mode",
        "description": "What signal drives the gate",
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
    """Gate frame visibility based on key frame signal."""
    threshold = max(0.0, min(1.0, float(params.get("threshold", 0.3))))
    attack = max(0.0, min(1.0, float(params.get("attack", 0.1))))
    mode = str(params.get("mode", "brightness"))

    h, w = frame.shape[:2]
    alpha = frame[:, :, 3:4]

    # Get sidechain key frame
    key_frame = params.get("_sidechain_frame")
    if key_frame is None:
        key_frame = frame[:, :, :3]
    elif key_frame.shape[2] == 4:
        key_frame = key_frame[:, :, :3]

    # Extract signal
    if mode == "motion":
        gray = cv2.cvtColor(key_frame, cv2.COLOR_RGB2GRAY)
        edges = cv2.Canny(gray, 50, 150).astype(np.float32) / 255.0
        signal = cv2.GaussianBlur(edges, (31, 31), 0)
        level = float(np.mean(signal))
    else:  # brightness
        level = float(np.mean(key_frame.astype(np.float32))) / 255.0

    # Gate logic with attack smoothing
    prev_gate = 0.0
    if state_in is not None:
        prev_gate = float(state_in.get("gate_state", 0.0))

    target_gate = 1.0 if level > threshold else 0.0

    # Smooth gate transition
    if attack > 0:
        gate_state = prev_gate + (target_gate - prev_gate) * (1.0 - attack)
    else:
        gate_state = target_gate

    # Apply gate: lerp between black and frame
    rgb = frame[:, :, :3].astype(np.float32)
    result_rgb = np.clip(rgb * gate_state, 0, 255).astype(np.uint8)

    state_out = {"gate_state": gate_state}
    return np.concatenate([result_rgb, alpha], axis=2), state_out
