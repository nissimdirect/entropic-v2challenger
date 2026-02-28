"""Pixel Annihilate — dissolve, threshold-kill, edge-kill, or rip color channels."""

import numpy as np

from engine.determinism import make_rng

EFFECT_ID = "fx.pixel_annihilate"
EFFECT_NAME = "Pixel Annihilate"
EFFECT_CATEGORY = "destruction"

PARAMS: dict = {
    "threshold": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.5,
        "label": "Threshold",
        "curve": "linear",
        "unit": "%",
        "description": "Kill probability or brightness cutoff",
    },
    "mode": {
        "type": "choice",
        "options": ["dissolve", "threshold", "edge_kill", "channel_rip"],
        "default": "dissolve",
        "label": "Mode",
        "description": "How pixels are selected for destruction",
    },
    "replacement": {
        "type": "choice",
        "options": ["black", "white", "noise", "invert"],
        "default": "black",
        "label": "Replacement",
        "description": "What replaces dead pixels",
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
    """Kill pixels by various criteria — dissolve, threshold, edge, or channel rip."""
    threshold = max(0.0, min(1.0, float(params.get("threshold", 0.5))))
    mode = str(params.get("mode", "dissolve"))
    replacement = str(params.get("replacement", "black"))
    rng = make_rng(seed)

    h, w = frame.shape[:2]
    result = frame.copy()

    if mode == "dissolve":
        kill_mask = rng.random((h, w)) < threshold
    elif mode == "threshold":
        gray = np.mean(frame[:, :, :3].astype(np.float32), axis=2) / 255.0
        kill_mask = gray > threshold
    elif mode == "edge_kill":
        gray = np.mean(frame[:, :, :3].astype(np.float32), axis=2)
        gx = np.zeros_like(gray)
        gy = np.zeros_like(gray)
        gx[:, 1:-1] = np.abs(gray[:, 2:] - gray[:, :-2])
        gy[1:-1, :] = np.abs(gray[2:, :] - gray[:-2, :])
        edges = np.sqrt(gx**2 + gy**2)
        if edges.max() > 0:
            edges = edges / edges.max()
        kill_mask = edges > (1.0 - threshold)
    elif mode == "channel_rip":
        block = max(4, int(32 * (1.0 - threshold)))
        for by in range(0, h, block):
            for bx in range(0, w, block):
                ch = int(rng.integers(0, 3))
                bh = min(block, h - by)
                bw = min(block, w - bx)
                result[by : by + bh, bx : bx + bw, ch] = 0
        return result, None
    else:
        kill_mask = rng.random((h, w)) < threshold

    # Apply replacement to RGB only, preserve alpha
    kill_3d = kill_mask[:, :, np.newaxis]
    if replacement == "white":
        fill_rgb = np.full((h, w, 3), 255, dtype=np.uint8)
    elif replacement == "noise":
        fill_rgb = rng.integers(0, 256, (h, w, 3), dtype=np.uint8)
    elif replacement == "invert":
        fill_rgb = 255 - frame[:, :, :3]
    else:  # black
        fill_rgb = np.zeros((h, w, 3), dtype=np.uint8)

    result[:, :, :3] = np.where(kill_3d, fill_rgb, frame[:, :, :3])
    return result, None
