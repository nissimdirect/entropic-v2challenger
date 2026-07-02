"""Comb Filter — delayed feedback addition in spatial domain."""

import numpy as np

EFFECT_ID = "fx.comb_filter"
EFFECT_NAME = "Comb Filter"
EFFECT_CATEGORY = "modulation"

PARAMS: dict = {
    "delay_px": {
        "type": "int",
        "min": 1,
        "max": 50,
        "default": 10,
        "label": "Delay (px)",
        "description": "Pixel offset between comb teeth",
        "curve": "linear",
        "unit": "",
    },
    "feedback": {
        "type": "float",
        "min": 0.0,
        "max": 0.95,
        "default": 0.5,
        "label": "Feedback",
        "curve": "linear",
        "unit": "",
        "description": "Feedback amount per tooth",
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
    """Spatial comb filter — pixel-shifted copies with alternating add/subtract."""
    delay_px = max(1, min(50, int(params.get("delay_px", 10))))
    feedback = max(0.0, min(0.95, float(params.get("feedback", 0.5))))

    alpha = frame[:, :, 3:4]
    rgb = frame[:, :, :3]

    f = rgb.astype(np.float32)
    result = f.copy()

    # Apply multiple comb teeth with decaying feedback
    teeth = 5
    for tooth in range(1, teeth + 1):
        offset = delay_px * tooth
        weight = feedback**tooth
        sign = 1.0 if tooth % 2 == 0 else -1.0

        shifted = np.roll(f, offset, axis=1)
        result = result + shifted * weight * sign

    out_rgb = np.clip(result, 0, 255).astype(np.uint8)
    return np.concatenate([out_rgb, alpha], axis=2), None
