"""Contour Lines — topographic luminance contour map effect."""

import numpy as np

EFFECT_ID = "fx.contour_lines"
EFFECT_NAME = "Contour Lines"
EFFECT_CATEGORY = "distortion"

PARAMS: dict = {
    "levels": {
        "type": "int",
        "min": 2,
        "max": 16,
        "default": 8,
        "label": "Levels",
        "curve": "linear",
        "unit": "count",
        "description": "Number of luminance bands",
    },
    "outline_only": {
        "type": "choice",
        "options": ["false", "true"],
        "default": "false",
        "label": "Outline Only",
        "description": "Overlay on original (true) or darkened frame (false)",
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
    """Contour lines — topographic map of luminance boundaries."""
    num_levels = max(2, min(16, int(params.get("levels", 8))))
    outline_only = str(params.get("outline_only", "false")).lower() == "true"

    rgb = frame[:, :, :3].astype(np.float32)
    alpha = frame[:, :, 3:4]

    gray = np.mean(rgb, axis=2)
    step = 256.0 / num_levels
    quantized = (gray // step) * step
    dx = np.abs(np.diff(quantized, axis=1, prepend=quantized[:, :1]))
    dy = np.abs(np.diff(quantized, axis=0, prepend=quantized[:1, :]))
    edges = ((dx > 0) | (dy > 0)).astype(np.float32)

    if outline_only:
        lines = edges[:, :, np.newaxis] * 255
        result = rgb + lines
    else:
        dark = rgb * 0.3
        lines = edges[:, :, np.newaxis] * 255
        result = dark + lines

    result_rgb = np.clip(result, 0, 255).astype(np.uint8)
    output = np.concatenate([result_rgb, alpha], axis=2)
    return output, None
