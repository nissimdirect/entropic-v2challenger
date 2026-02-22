"""Blur effect — gaussian blur using scipy.ndimage."""

import numpy as np
from scipy.ndimage import gaussian_filter

EFFECT_ID = "fx.blur"
EFFECT_NAME = "Blur"
EFFECT_CATEGORY = "distortion"

PARAMS: dict = {
    "radius": {
        "type": "float",
        "min": 0.0,
        "max": 50.0,
        "default": 5.0,
        "label": "Blur Radius",
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
    """Apply gaussian blur. Stateless."""
    radius = float(params.get("radius", 5.0))
    radius = max(0.0, min(50.0, radius))

    if radius == 0.0:
        return frame.copy(), None

    output = frame.copy()
    # Blur RGB channels, preserve alpha
    for ch in range(3):
        output[:, :, ch] = gaussian_filter(
            output[:, :, ch].astype(np.float32), sigma=radius
        ).astype(np.uint8)

    return output, None
