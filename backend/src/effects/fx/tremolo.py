"""Tremolo — sine-modulate brightness over time."""

import numpy as np

EFFECT_ID = "fx.tremolo"
EFFECT_NAME = "Tremolo"
EFFECT_CATEGORY = "temporal"

PARAMS: dict = {
    "rate": {
        "type": "float",
        "min": 0.1,
        "max": 10.0,
        "default": 2.0,
        "label": "Rate",
        "curve": "linear",
        "unit": "Hz",
        "description": "Oscillation speed",
    },
    "depth": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.5,
        "label": "Depth",
        "curve": "linear",
        "unit": "",
        "description": "Modulation depth (0 = no effect, 1 = full black at trough)",
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
    """Brightness oscillation over time, like an audio tremolo."""
    rate = max(0.1, min(10.0, float(params.get("rate", 2.0))))
    depth = max(0.0, min(1.0, float(params.get("depth", 0.5))))

    alpha = frame[:, :, 3:4]
    rgb = frame[:, :, :3]

    # Use frame_index * rate as phase (no fps hardcoding)
    phase = frame_index * rate * 0.1
    mod = 1.0 - depth * 0.5 * (1.0 - np.sin(2.0 * np.pi * phase))

    out_rgb = np.clip(rgb.astype(np.float32) * mod, 0, 255).astype(np.uint8)
    return np.concatenate([out_rgb, alpha], axis=2), None
