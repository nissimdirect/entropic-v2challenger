"""Grid Moire — overlay grid pattern that interferes with image structure."""

import numpy as np

from engine.determinism import make_rng

EFFECT_ID = "fx.grid_moire"
EFFECT_NAME = "Grid Moire"
EFFECT_CATEGORY = "codec_archaeology"

PARAMS: dict = {
    "grid_size": {
        "type": "int",
        "min": 4,
        "max": 64,
        "default": 8,
        "label": "Grid Size",
        "curve": "linear",
        "unit": "px",
        "description": "Distance between grid lines",
    },
    "line_width": {
        "type": "int",
        "min": 1,
        "max": 4,
        "default": 1,
        "label": "Line Width",
        "curve": "linear",
        "unit": "px",
        "description": "Width of grid lines",
    },
    "angle": {
        "type": "float",
        "min": 0.0,
        "max": 90.0,
        "default": 0.0,
        "label": "Angle",
        "curve": "linear",
        "unit": "deg",
        "description": "Rotation angle of the grid",
    },
    "opacity": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.5,
        "label": "Opacity",
        "curve": "linear",
        "unit": "",
        "description": "Opacity of the grid overlay",
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
    """Overlay a grid pattern to create moire interference."""
    grid_size = max(4, min(64, int(params.get("grid_size", 8))))
    line_width = max(1, min(4, int(params.get("line_width", 1))))
    angle = max(0.0, min(90.0, float(params.get("angle", 0.0))))
    opacity = max(0.0, min(1.0, float(params.get("opacity", 0.5))))

    h, w = frame.shape[:2]
    rgb = frame[:, :, :3].astype(np.float32)
    alpha = frame[:, :, 3:4]

    # Generate grid pattern
    if angle == 0.0:
        # Axis-aligned grid (fast path)
        grid = np.ones((h, w), dtype=np.float32)
        for lw in range(line_width):
            grid[lw::grid_size, :] = 0.0
            grid[:, lw::grid_size] = 0.0
    else:
        # Rotated grid
        angle_rad = np.radians(angle)
        y_coords, x_coords = np.mgrid[0:h, 0:w].astype(np.float32)
        # Center rotation
        cx, cy = w / 2.0, h / 2.0
        rx = (x_coords - cx) * np.cos(angle_rad) - (y_coords - cy) * np.sin(angle_rad)
        ry = (x_coords - cx) * np.sin(angle_rad) + (y_coords - cy) * np.cos(angle_rad)
        # Grid lines where modulo is within line_width
        grid_h = (np.mod(rx, grid_size) >= line_width).astype(np.float32)
        grid_v = (np.mod(ry, grid_size) >= line_width).astype(np.float32)
        grid = grid_h * grid_v

    # Apply grid: where grid is 0, darken the image
    grid_3d = grid[:, :, np.newaxis]
    darkened = rgb * grid_3d
    result = rgb * (1.0 - opacity) + darkened * opacity
    result_rgb = np.clip(result, 0, 255).astype(np.uint8)

    return np.concatenate([result_rgb, alpha], axis=2), None
