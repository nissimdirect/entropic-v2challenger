"""Watercolor — paint-like effect with soft edges and paper texture."""

import cv2
import numpy as np

from engine.determinism import make_rng

EFFECT_ID = "fx.watercolor"
EFFECT_NAME = "Watercolor"
EFFECT_CATEGORY = "whimsy"

PARAMS: dict = {
    "edge_strength": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.5,
        "label": "Edge Strength",
        "curve": "linear",
        "unit": "%",
        "description": "Paint boundary visibility",
    },
    "blur_radius": {
        "type": "int",
        "min": 1,
        "max": 15,
        "default": 7,
        "label": "Blur Radius",
        "curve": "exponential",
        "unit": "px",
        "description": "Softening amount",
    },
    "paper_texture": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.3,
        "label": "Paper Texture",
        "curve": "linear",
        "unit": "%",
        "description": "Paper grain overlay amount",
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
    """Watercolor paint — bilateral filter + edge detection + paper grain."""
    edge_strength = max(0.0, min(1.0, float(params.get("edge_strength", 0.5))))
    blur_radius = max(1, min(15, int(params.get("blur_radius", 7))))
    paper_texture = max(0.0, min(1.0, float(params.get("paper_texture", 0.3))))

    rgb = frame[:, :, :3]
    alpha = frame[:, :, 3:4]
    h, w = rgb.shape[:2]

    # Bilateral filter for paint-like smoothing
    smooth = cv2.bilateralFilter(rgb, d=9, sigmaColor=75, sigmaSpace=75)

    # Edge detection for paint boundaries
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    edges = cv2.adaptiveThreshold(
        gray,
        255,
        cv2.ADAPTIVE_THRESH_MEAN_C,
        cv2.THRESH_BINARY,
        9,
        2,
    )
    edges_3 = cv2.merge([edges] * 3)

    result = cv2.bitwise_and(smooth, edges_3)

    # Softening
    ksize = max(3, blur_radius * 2 + 1)
    if ksize % 2 == 0:
        ksize += 1
    result = cv2.GaussianBlur(result, (ksize, ksize), 0)

    # Blend edges back
    if edge_strength > 0:
        edge_inv = 255 - edges
        edge_color = cv2.merge([edge_inv] * 3).astype(np.float32)
        result = np.clip(
            result.astype(np.float32) - edge_color * edge_strength * 0.3,
            0,
            255,
        ).astype(np.uint8)

    # Paper texture
    if paper_texture > 0:
        rng = make_rng(seed)
        paper = rng.integers(200, 256, (h, w), dtype=np.uint8)
        paper = cv2.GaussianBlur(paper, (5, 5), 0)
        paper_3 = cv2.merge([paper] * 3).astype(np.float32) / 255.0
        result = np.clip(
            result.astype(np.float32) * (1 - paper_texture * 0.3)
            + result.astype(np.float32) * paper_3 * paper_texture * 0.3,
            0,
            255,
        ).astype(np.uint8)

    output = np.concatenate([result, alpha], axis=2)
    return output, None
