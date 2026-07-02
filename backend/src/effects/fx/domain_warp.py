"""Domain Warp — warp coordinates through fractal noise displacement."""

import numpy as np

from effects.shared.displacement import remap_frame
from effects.shared.noise_generators import fractal_noise_2d

EFFECT_ID = "fx.domain_warp"
EFFECT_NAME = "Domain Warp"
EFFECT_CATEGORY = "warping"

PARAMS: dict = {
    "scale": {
        "type": "float",
        "min": 10.0,
        "max": 200.0,
        "default": 50.0,
        "label": "Scale",
        "curve": "linear",
        "unit": "px",
        "description": "Noise feature size",
    },
    "octaves": {
        "type": "int",
        "min": 1,
        "max": 6,
        "default": 3,
        "label": "Octaves",
        "curve": "linear",
        "unit": "",
        "description": "Fractal noise layers",
    },
    "amplitude": {
        "type": "float",
        "min": 1.0,
        "max": 100.0,
        "default": 30.0,
        "label": "Amplitude",
        "curve": "linear",
        "unit": "px",
        "description": "Maximum pixel displacement",
    },
    "speed": {
        "type": "float",
        "min": 0.0,
        "max": 5.0,
        "default": 1.0,
        "label": "Speed",
        "curve": "linear",
        "unit": "",
        "description": "Animation speed (seed offset per frame)",
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
    """Warp pixel coordinates through fractal noise fields."""
    scale = max(10.0, min(200.0, float(params.get("scale", 50.0))))
    octaves = max(1, min(6, int(params.get("octaves", 3))))
    amplitude = max(1.0, min(100.0, float(params.get("amplitude", 30.0))))
    speed = max(0.0, min(5.0, float(params.get("speed", 1.0))))

    h, w = frame.shape[:2]

    # Deterministic seed with frame-based animation
    time_seed = seed + int(frame_index * speed * 100)

    # Generate independent noise fields for dx and dy
    dx = fractal_noise_2d(h, w, octaves=octaves, base_scale=scale, seed=time_seed)
    dy = fractal_noise_2d(
        h, w, octaves=octaves, base_scale=scale, seed=time_seed + 50000
    )

    # Center noise around 0 and scale by amplitude
    dx = (dx - 0.5) * 2.0 * amplitude
    dy = (dy - 0.5) * 2.0 * amplitude

    result = remap_frame(frame, dx.astype(np.float32), dy.astype(np.float32))
    return result, None
