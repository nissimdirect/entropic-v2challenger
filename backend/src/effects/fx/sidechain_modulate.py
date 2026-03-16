"""Sidechain Modulate — brightness ducking and rhythmic pump from key frame."""

import numpy as np

from engine.determinism import make_rng

EFFECT_ID = "fx.sidechain_modulate"
EFFECT_NAME = "Sidechain Modulate"
EFFECT_CATEGORY = "sidechain"

PARAMS: dict = {
    "mode": {
        "type": "choice",
        "options": ["duck", "pump"],
        "default": "duck",
        "label": "Mode",
        "description": "Duck: brightness reduction from key luminance. Pump: exaggerated rhythmic pump.",
    },
    "threshold": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.5,
        "label": "Threshold",
        "curve": "linear",
        "unit": "",
        "description": "Signal level to trigger ducking (duck mode)",
    },
    "ratio": {
        "type": "float",
        "min": 1.0,
        "max": 20.0,
        "default": 4.0,
        "label": "Ratio",
        "curve": "exponential",
        "unit": ":1",
        "description": "Compression ratio — higher = harder duck (duck mode)",
    },
    "attack": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.3,
        "label": "Attack",
        "curve": "linear",
        "unit": "",
        "description": "How fast ducking engages (0 = instant)",
    },
    "release": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.7,
        "label": "Release",
        "curve": "linear",
        "unit": "",
        "description": "How fast ducking releases (0 = instant)",
    },
    "pump_depth": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.5,
        "label": "Pump Depth",
        "curve": "linear",
        "unit": "",
        "description": "How deep the pump goes (pump mode)",
    },
    "pump_curve": {
        "type": "float",
        "min": 1.0,
        "max": 5.0,
        "default": 2.0,
        "label": "Pump Curve",
        "curve": "linear",
        "unit": "",
        "description": "Envelope sharpness (pump mode, higher = snappier)",
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
    """Apply sidechain ducking or pump modulation."""
    mode = str(params.get("mode", "duck"))

    h, w = frame.shape[:2]
    rgb = frame[:, :, :3].astype(np.float32)
    alpha = frame[:, :, 3:4]

    # Get sidechain key frame (injected by pipeline, or self-sidechain)
    key_frame = params.get("_sidechain_frame")
    if key_frame is None:
        key_frame = frame[:, :, :3]
    elif key_frame.shape[2] == 4:
        key_frame = key_frame[:, :, :3]

    if mode == "duck":
        threshold = max(0.0, min(1.0, float(params.get("threshold", 0.5))))
        ratio = max(1.0, min(20.0, float(params.get("ratio", 4.0))))
        attack = max(0.0, min(1.0, float(params.get("attack", 0.3))))
        release = max(0.0, min(1.0, float(params.get("release", 0.7))))

        # Extract brightness signal from key
        signal = np.mean(key_frame.astype(np.float32), axis=2) / 255.0

        # Compressor-style gain reduction
        above = np.maximum(signal - threshold, 0)
        gain_reduction = above * (1.0 - 1.0 / max(ratio, 1.0))

        # Apply attack/release envelope smoothing
        prev_envelope = None
        if state_in is not None:
            prev_envelope = state_in.get("envelope")

        if prev_envelope is not None and prev_envelope.shape == gain_reduction.shape:
            attack_mask = gain_reduction > prev_envelope
            gain_reduction = np.where(
                attack_mask,
                prev_envelope + (gain_reduction - prev_envelope) * (1.0 - attack),
                prev_envelope + (gain_reduction - prev_envelope) * (1.0 - release),
            )

        gain = (1.0 - gain_reduction)[:, :, np.newaxis]
        result_rgb = np.clip(rgb * gain, 0, 255).astype(np.uint8)
        state_out = {"envelope": gain_reduction}

    else:  # pump
        pump_depth = max(0.0, min(1.0, float(params.get("pump_depth", 0.5))))
        pump_curve = max(1.0, min(5.0, float(params.get("pump_curve", 2.0))))

        # Compute pump envelope from key frame global brightness
        key_brightness = np.mean(key_frame.astype(np.float32)) / 255.0
        # Envelope: brightness drives the pump — brighter key = more ducking
        envelope = 1.0 - (key_brightness**pump_curve) * pump_depth

        result_rgb = np.clip(rgb * envelope, 0, 255).astype(np.uint8)
        state_out = {"envelope": np.full((h, w), 1.0 - envelope, dtype=np.float32)}

    return np.concatenate([result_rgb, alpha], axis=2), state_out
