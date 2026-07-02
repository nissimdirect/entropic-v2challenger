"""Scanlines — CRT/VHS-style horizontal scan line overlay."""

import numpy as np

from engine.determinism import make_rng

EFFECT_ID = "fx.scanlines"
EFFECT_NAME = "Scanlines"
EFFECT_CATEGORY = "distortion"

PARAMS: dict = {
    "line_width": {
        "type": "int",
        "min": 1,
        "max": 10,
        "default": 2,
        "label": "Line Width",
        "curve": "linear",
        "unit": "px",
        "description": "Width of each dark scan line in pixels",
    },
    "opacity": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.3,
        "label": "Opacity",
        "curve": "linear",
        "unit": "%",
        "description": "Line darkness (0=invisible, 1=fully black)",
    },
    "flicker": {
        "type": "choice",
        "options": ["false", "true"],
        "default": "false",
        "label": "Flicker",
        "description": "Randomize opacity per line for CRT flicker",
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
    """Scanlines — horizontal dark bands like a CRT monitor."""
    line_width = max(1, min(10, int(params.get("line_width", 2))))
    opacity = max(0.0, min(1.0, float(params.get("opacity", 0.3))))
    flicker = str(params.get("flicker", "false")).lower() == "true"

    rgb = frame[:, :, :3].astype(np.float32)
    alpha = frame[:, :, 3:4]
    h = rgb.shape[0]

    rng = make_rng(seed) if flicker else None
    spacing = line_width * 2

    for y in range(0, h, spacing):
        end_y = min(y + line_width, h)
        line_opacity = opacity
        if flicker and rng is not None:
            line_opacity = opacity * (0.5 + 0.5 * float(rng.random()))
        rgb[y:end_y] = rgb[y:end_y] * (1 - line_opacity)

    result_rgb = np.clip(rgb, 0, 255).astype(np.uint8)
    output = np.concatenate([result_rgb, alpha], axis=2)
    return output, None
