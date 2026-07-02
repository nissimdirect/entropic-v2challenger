"""Gate — noise gate for pixels, blacks out below brightness threshold."""

import numpy as np

EFFECT_ID = "fx.gate"
EFFECT_NAME = "Gate"
EFFECT_CATEGORY = "modulation"

PARAMS: dict = {
    "threshold": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.3,
        "label": "Threshold",
        "curve": "linear",
        "unit": "%",
        "description": "Brightness cutoff (0-1)",
    },
    "mode": {
        "type": "choice",
        "options": ["brightness", "channel"],
        "default": "brightness",
        "label": "Mode",
        "description": "Gate by luminance or per-channel",
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
    """Noise gate — black out pixels below brightness threshold."""
    threshold = max(0.0, min(1.0, float(params.get("threshold", 0.3))))
    mode = str(params.get("mode", "brightness"))

    result = frame.copy()
    threshold_val = threshold * 255.0

    if mode == "channel":
        result[:, :, :3][result[:, :, :3] < threshold_val] = 0
    else:
        luminance = (
            0.299 * frame[:, :, 0].astype(np.float32)
            + 0.587 * frame[:, :, 1].astype(np.float32)
            + 0.114 * frame[:, :, 2].astype(np.float32)
        )
        mask = luminance < threshold_val
        result[:, :, 0][mask] = 0
        result[:, :, 1][mask] = 0
        result[:, :, 2][mask] = 0

    return result, None
