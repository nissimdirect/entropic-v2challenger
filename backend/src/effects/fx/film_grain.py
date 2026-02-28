"""Film Grain — realistic grain texture that responds to image brightness."""

import numpy as np

from engine.determinism import make_rng

EFFECT_ID = "fx.film_grain"
EFFECT_NAME = "Film Grain"
EFFECT_CATEGORY = "destruction"

PARAMS: dict = {
    "intensity": {
        "type": "float",
        "min": 0.0,
        "max": 2.0,
        "default": 0.4,
        "label": "Intensity",
        "curve": "exponential",
        "unit": "%",
        "description": "Grain strength — above 1.0 is extreme",
    },
    "grain_size": {
        "type": "int",
        "min": 1,
        "max": 8,
        "default": 2,
        "label": "Grain Size",
        "curve": "linear",
        "unit": "px",
        "description": "Grain particle size in pixels",
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
    """Realistic film grain — more grain in midtones, less in shadows/highlights."""
    intensity = max(0.0, min(2.0, float(params.get("intensity", 0.4))))
    grain_size = max(1, min(8, int(params.get("grain_size", 2))))
    rng = make_rng(seed)

    if intensity == 0.0:
        return frame.copy(), None

    h, w = frame.shape[:2]
    f = frame.astype(np.float32)

    # Generate grain at reduced resolution then upscale
    gh, gw = max(1, -(-h // grain_size)), max(1, -(-w // grain_size))  # ceil division
    grain = rng.standard_normal((gh, gw)).astype(np.float32)

    if grain_size > 1:
        grain = np.repeat(np.repeat(grain, grain_size, axis=0), grain_size, axis=1)
    grain = grain[:h, :w]

    # Midtone-weighted: more grain in midtones, less in shadows/highlights
    luminance = np.mean(f[:, :, :3], axis=2) / 255.0
    midtone_mask = 1.0 - 4.0 * (luminance - 0.5) ** 2
    midtone_mask = np.clip(midtone_mask, 0.2, 1.0)

    grain_scaled = grain * intensity * 120.0 * midtone_mask
    for c in range(3):
        f[:, :, c] += grain_scaled

    output = np.clip(f, 0, 255).astype(np.uint8)
    return output, None
