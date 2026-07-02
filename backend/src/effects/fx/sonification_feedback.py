"""Sonification Feedback — treat rows as audio waveforms with feedback delay."""

import numpy as np

EFFECT_ID = "fx.sonification_feedback"
EFFECT_NAME = "Sonification Feedback"
EFFECT_CATEGORY = "misc"

PARAMS: dict = {
    "delay_rows": {
        "type": "int",
        "min": 1,
        "max": 100,
        "default": 20,
        "label": "Delay Rows",
        "curve": "linear",
        "unit": "rows",
        "description": "Feedback delay in number of rows",
    },
    "feedback": {
        "type": "float",
        "min": 0.0,
        "max": 0.95,
        "default": 0.5,
        "label": "Feedback",
        "curve": "linear",
        "unit": "",
        "description": "Feedback amount (higher = more echo)",
    },
    "mix": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.5,
        "label": "Mix",
        "curve": "linear",
        "unit": "%",
        "description": "Blend between feedback and original",
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
    """Audio-style feedback delay applied to image rows."""
    delay_rows = max(1, min(100, int(params.get("delay_rows", 20))))
    feedback = max(0.0, min(0.95, float(params.get("feedback", 0.5))))
    mix = max(0.0, min(1.0, float(params.get("mix", 0.5))))

    h, w = frame.shape[:2]
    rgb = frame[:, :, :3].astype(np.float32)
    alpha = frame[:, :, 3:4]

    # Apply feedback: each row gets added delayed row * feedback
    result = rgb.copy()
    for y in range(delay_rows, h):
        result[y] = result[y] + result[y - delay_rows] * feedback

    # Normalize to prevent overflow accumulation
    max_val = result.max()
    if max_val > 255:
        result = result * (255.0 / max_val)

    # Mix with original
    output = rgb * (1.0 - mix) + result * mix
    result_rgb = np.clip(output, 0, 255).astype(np.uint8)

    return np.concatenate([result_rgb, alpha], axis=2), None
