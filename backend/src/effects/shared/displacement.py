"""Shared displacement field utilities for physics effects."""

import numpy as np
import cv2


def remap_frame(
    frame: np.ndarray, dx: np.ndarray, dy: np.ndarray, boundary: str = "clamp"
) -> np.ndarray:
    """Remap frame through displacement field.

    Args:
        frame: Input frame (H, W, C) uint8 or float32.
        dx: X displacement field (H, W) float32.
        dy: Y displacement field (H, W) float32.
        boundary: Edge behavior — "clamp", "black", "wrap", or "mirror".

    Returns:
        Remapped frame, same shape/dtype as input.
    """
    h, w = frame.shape[:2]
    y_coords, x_coords = np.mgrid[0:h, 0:w].astype(np.float32)
    raw_x = x_coords + dx
    raw_y = y_coords + dy

    if boundary == "wrap":
        map_x = (raw_x % w).astype(np.float32)
        map_y = (raw_y % h).astype(np.float32)
    elif boundary == "mirror":
        map_x = raw_x % (2 * w)
        map_x = np.where(map_x >= w, 2 * w - map_x - 1, map_x)
        map_x = np.clip(map_x, 0, w - 1).astype(np.float32)
        map_y = raw_y % (2 * h)
        map_y = np.where(map_y >= h, 2 * h - map_y - 1, map_y)
        map_y = np.clip(map_y, 0, h - 1).astype(np.float32)
    elif boundary == "black":
        map_x = raw_x.astype(np.float32)
        map_y = raw_y.astype(np.float32)
        return (
            cv2.remap(
                frame.astype(np.float32),
                map_x,
                map_y,
                cv2.INTER_LINEAR,
                borderMode=cv2.BORDER_CONSTANT,
                borderValue=(0, 0, 0, 255) if frame.shape[2] == 4 else (0, 0, 0),
            ).astype(frame.dtype)
            if frame.dtype == np.float32
            else np.clip(
                cv2.remap(
                    frame.astype(np.float32),
                    map_x,
                    map_y,
                    cv2.INTER_LINEAR,
                    borderMode=cv2.BORDER_CONSTANT,
                    borderValue=(0, 0, 0, 255) if frame.shape[2] == 4 else (0, 0, 0),
                ),
                0,
                255,
            ).astype(np.uint8)
        )
    else:  # clamp
        map_x = np.clip(raw_x, 0, w - 1).astype(np.float32)
        map_y = np.clip(raw_y, 0, h - 1).astype(np.float32)

    result = cv2.remap(frame.astype(np.float32), map_x, map_y, cv2.INTER_LINEAR)
    return np.clip(result, 0, 255).astype(np.uint8)


def make_physics_state(h: int, w: int) -> dict:
    """Create a fresh physics state dict with displacement and velocity fields."""
    return {
        "dx": np.zeros((h, w), dtype=np.float32),
        "dy": np.zeros((h, w), dtype=np.float32),
        "vx": np.zeros((h, w), dtype=np.float32),
        "vy": np.zeros((h, w), dtype=np.float32),
    }
