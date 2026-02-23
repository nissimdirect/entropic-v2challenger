"""Noise effect — random noise overlay on frame."""

import numpy as np

from engine.determinism import make_rng

EFFECT_ID = "fx.noise"
EFFECT_NAME = "Noise"
EFFECT_CATEGORY = "texture"

PARAMS: dict = {
    "intensity": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.3,
        "label": "Intensity",
        "curve": "exponential",
        "unit": "%",
        "description": "Noise intensity — low values give subtle grain, high values overwhelm",
    }
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
    """Add gaussian noise overlay. Uses seeded RNG for determinism."""
    intensity = float(params.get("intensity", 0.3))
    intensity = max(0.0, min(1.0, intensity))

    if intensity == 0.0:
        return frame.copy(), None

    rng = make_rng(seed)
    output = frame.copy()
    h, w = output.shape[:2]

    # Generate noise for RGB channels only, preserve alpha
    noise = rng.normal(0, 50 * intensity, (h, w, 3)).astype(np.float32)
    rgb = output[:, :, :3].astype(np.float32) + noise
    output[:, :, :3] = np.clip(rgb, 0, 255).astype(np.uint8)

    return output, None
