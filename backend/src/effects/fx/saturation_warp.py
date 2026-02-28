"""Saturation Warp — boost or kill saturation, globally or per-channel."""

import cv2
import numpy as np

EFFECT_ID = "fx.saturation_warp"
EFFECT_NAME = "Saturation Warp"
EFFECT_CATEGORY = "color"

PARAMS: dict = {
    "amount": {
        "type": "float",
        "min": 0.0,
        "max": 5.0,
        "default": 1.5,
        "label": "Amount",
        "curve": "s-curve",
        "unit": "%",
        "description": "Saturation multiplier (0=grayscale, 1=unchanged, 5=hyper)",
    },
    "channel": {
        "type": "choice",
        "options": ["all", "r", "g", "b"],
        "default": "all",
        "label": "Channel",
        "description": "Target channel for saturation change",
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
    """Saturation warp — grayscale to hypersaturated, global or per-channel."""
    amount = max(0.0, min(5.0, float(params.get("amount", 1.5))))
    channel = str(params.get("channel", "all"))

    rgb = frame[:, :, :3]
    alpha = frame[:, :, 3:4]

    if channel == "all":
        hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV).astype(np.float32)
        hsv[:, :, 1] = np.clip(hsv[:, :, 1] * amount, 0, 255)
        result_rgb = cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2RGB)
    else:
        ch_map = {"r": 0, "g": 1, "b": 2}
        ch_idx = ch_map.get(channel, 0)
        result = rgb.copy().astype(np.float32)
        gray = np.mean(result, axis=2, keepdims=True)
        result[:, :, ch_idx] = np.clip(
            gray[:, :, 0] + (result[:, :, ch_idx] - gray[:, :, 0]) * amount,
            0,
            255,
        )
        result_rgb = result.astype(np.uint8)

    output = np.concatenate([result_rgb, alpha], axis=2)
    return output, None
