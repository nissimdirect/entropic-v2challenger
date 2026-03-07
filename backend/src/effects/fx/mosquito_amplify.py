"""Mosquito Amplify — amplify ringing artifacts near sharp edges."""

import cv2
import numpy as np

from engine.determinism import make_rng

EFFECT_ID = "fx.mosquito_amplify"
EFFECT_NAME = "Mosquito Amplify"
EFFECT_CATEGORY = "codec_archaeology"

PARAMS: dict = {
    "amplify": {
        "type": "float",
        "min": 1.0,
        "max": 20.0,
        "default": 5.0,
        "label": "Amplify",
        "curve": "exponential",
        "unit": "x",
        "description": "How much to amplify ringing near edges",
    },
    "edge_threshold": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.3,
        "label": "Edge Threshold",
        "curve": "linear",
        "unit": "",
        "description": "Edge detection sensitivity",
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
    """Amplify ringing artifacts near sharp edges (mosquito noise)."""
    amplify = max(1.0, min(20.0, float(params.get("amplify", 5.0))))
    edge_threshold = max(0.0, min(1.0, float(params.get("edge_threshold", 0.3))))

    h, w = frame.shape[:2]
    rgb = frame[:, :, :3]
    alpha = frame[:, :, 3:4]
    rgb_f = rgb.astype(np.float32)

    # Detect edges
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    canny_lo = int(edge_threshold * 100)
    canny_hi = int(edge_threshold * 255)
    edges = (
        cv2.Canny(gray, max(1, canny_lo), max(2, canny_hi)).astype(np.float32) / 255.0
    )
    # Dilate edges to create influence zone
    kernel = np.ones((5, 5), np.uint8)
    edge_zone = cv2.dilate(edges, kernel, iterations=2)

    # Compute difference between original and blurred (the "ringing")
    blurred = cv2.GaussianBlur(rgb_f, (7, 7), 0)
    ringing = rgb_f - blurred

    # Amplify ringing only near edges
    edge_zone_3d = edge_zone[:, :, np.newaxis]
    amplified_ringing = ringing * amplify * edge_zone_3d

    result = rgb_f + amplified_ringing
    result_rgb = np.clip(result, 0, 255).astype(np.uint8)

    return np.concatenate([result_rgb, alpha], axis=2), None
