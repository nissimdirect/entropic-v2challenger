"""Afterimage — opponent-process afterimage (inverted ghost of previous stimulus)."""

import numpy as np

EFFECT_ID = "fx.afterimage"
EFFECT_NAME = "Afterimage"
EFFECT_CATEGORY = "misc"

PARAMS: dict = {
    "adaptation_rate": {
        "type": "float",
        "min": 0.01,
        "max": 0.2,
        "default": 0.05,
        "label": "Adaptation Rate",
        "curve": "linear",
        "unit": "",
        "description": "How fast the eye adapts to the stimulus",
    },
    "strength": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.5,
        "label": "Strength",
        "curve": "linear",
        "unit": "",
        "description": "Afterimage intensity",
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
    """Opponent-process afterimage — inverted ghost from adaptation."""
    adaptation_rate = max(0.01, min(0.2, float(params.get("adaptation_rate", 0.05))))
    strength = max(0.0, min(1.0, float(params.get("strength", 0.5))))

    h, w = frame.shape[:2]
    rgb = frame[:, :, :3].astype(np.float32) / 255.0
    alpha = frame[:, :, 3:4]

    # Initialize or restore adaptation buffer
    if state_in is not None and "adaptation" in state_in:
        adaptation = state_in["adaptation"]
        if adaptation.shape != (h, w, 3):
            adaptation = rgb.copy()
    else:
        adaptation = rgb.copy()

    # Slowly adapt toward current frame
    adaptation = adaptation + adaptation_rate * (rgb - adaptation)

    # Afterimage = inverted difference between adapted state and current
    diff = adaptation - rgb
    afterimage = 0.5 + diff  # center around mid-gray

    # Blend afterimage with original
    result = rgb * (1.0 - strength) + afterimage * strength
    result_rgb = np.clip(result * 255, 0, 255).astype(np.uint8)

    return np.concatenate([result_rgb, alpha], axis=2), {"adaptation": adaptation}
