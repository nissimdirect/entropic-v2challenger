"""Shape Overlay — floating geometric shapes overlaid on video."""

import cv2
import numpy as np

from engine.determinism import make_rng

EFFECT_ID = "fx.shape_overlay"
EFFECT_NAME = "Shape Overlay"
EFFECT_CATEGORY = "whimsy"

PARAMS: dict = {
    "shape": {
        "type": "choice",
        "options": ["circle", "triangle", "square", "star", "hexagon"],
        "default": "circle",
        "label": "Shape",
        "description": "Geometric shape type",
    },
    "count": {
        "type": "int",
        "min": 1,
        "max": 20,
        "default": 5,
        "label": "Count",
        "curve": "linear",
        "unit": "count",
        "description": "Number of shapes",
    },
    "size": {
        "type": "float",
        "min": 0.02,
        "max": 0.3,
        "default": 0.1,
        "label": "Size",
        "curve": "linear",
        "unit": "%",
        "description": "Shape size relative to frame",
    },
    "opacity": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.4,
        "label": "Opacity",
        "curve": "linear",
        "unit": "%",
        "description": "Shape transparency",
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
    """Floating geometric shapes overlaid on video."""
    shape = str(params.get("shape", "circle"))
    count = max(1, min(20, int(params.get("count", 5))))
    size = max(0.02, min(0.3, float(params.get("size", 0.1))))
    opacity = max(0.0, min(1.0, float(params.get("opacity", 0.4))))

    rgb = frame[:, :, :3]
    alpha = frame[:, :, 3:4]
    h, w = rgb.shape[:2]
    rng = make_rng(seed)

    overlay = rgb.copy()
    base_size = int(min(h, w) * size)
    color = (
        int(rng.integers(100, 256)),
        int(rng.integers(100, 256)),
        int(rng.integers(100, 256)),
    )

    for i in range(count):
        px = int(rng.integers(0, w))
        py = int(rng.integers(0, h))
        s = max(2, base_size + int(rng.integers(-base_size // 4, base_size // 4 + 1)))

        if shape == "circle":
            cv2.circle(overlay, (px, py), s, color, -1)
        elif shape == "square":
            cv2.rectangle(overlay, (px - s, py - s), (px + s, py + s), color, -1)
        elif shape == "triangle":
            pts = np.array(
                [
                    [px, py - s],
                    [px - int(s * 0.87), py + s // 2],
                    [px + int(s * 0.87), py + s // 2],
                ],
                dtype=np.int32,
            )
            cv2.fillPoly(overlay, [pts], color)
        elif shape == "hexagon":
            pts = np.array(
                [
                    [px + int(s * np.cos(a)), py + int(s * np.sin(a))]
                    for a in np.linspace(0, 2 * np.pi, 7)[:-1]
                ],
                dtype=np.int32,
            )
            cv2.fillPoly(overlay, [pts], color)
        elif shape == "star":
            pts = []
            for j in range(10):
                a = j * np.pi / 5 - np.pi / 2
                r = s if j % 2 == 0 else s // 2
                pts.append([px + int(r * np.cos(a)), py + int(r * np.sin(a))])
            cv2.fillPoly(overlay, [np.array(pts, dtype=np.int32)], color)

    result = np.clip(
        rgb.astype(np.float32) * (1 - opacity) + overlay.astype(np.float32) * opacity,
        0,
        255,
    ).astype(np.uint8)

    output = np.concatenate([result, alpha], axis=2)
    return output, None
