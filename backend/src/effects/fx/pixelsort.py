"""Pixel Sort effect — sorts pixels in rows/columns by brightness."""

import numpy as np

EFFECT_ID = "fx.pixelsort"
EFFECT_NAME = "Pixel Sort"
EFFECT_CATEGORY = "glitch"

PARAMS: dict = {
    "threshold": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.5,
        "label": "Threshold",
    },
    "direction": {
        "type": "choice",
        "choices": ["horizontal", "vertical"],
        "default": "horizontal",
        "label": "Direction",
    },
    "reverse": {
        "type": "bool",
        "default": False,
        "label": "Reverse Sort",
    },
}


def _brightness(pixels: np.ndarray) -> np.ndarray:
    """Luminance: 0.299R + 0.587G + 0.114B"""
    return 0.299 * pixels[:, 0] + 0.587 * pixels[:, 1] + 0.114 * pixels[:, 2]


def apply(
    frame: np.ndarray,
    params: dict,
    state_in: dict | None = None,
    *,
    frame_index: int,
    seed: int,
    resolution: tuple[int, int],
) -> tuple[np.ndarray, dict | None]:
    """Sort pixels in rows or columns by brightness within threshold intervals."""
    threshold = float(params.get("threshold", 0.5))
    threshold = max(0.0, min(1.0, threshold))
    direction = params.get("direction", "horizontal")
    reverse = bool(params.get("reverse", False))

    output = frame.copy()

    # Work on a view that treats vertical as horizontal via transpose
    if direction == "vertical":
        work = output.transpose(1, 0, 2)
    else:
        work = output

    h, w, c = work.shape
    threshold_val = threshold * 255

    for row_idx in range(h):
        row = work[row_idx]
        keys = _brightness(row[:, :3])  # Use RGB for brightness (skip alpha)

        # Find pixels above threshold
        mask = keys > threshold_val

        # Find contiguous runs of True in mask
        changes = np.diff(mask.astype(np.int8))
        starts = np.where(changes == 1)[0] + 1
        ends = np.where(changes == -1)[0] + 1

        if mask[0]:
            starts = np.concatenate([[0], starts])
        if mask[-1]:
            ends = np.concatenate([ends, [w]])

        if len(starts) == 0 or len(ends) == 0:
            continue

        # Match starts and ends
        n = min(len(starts), len(ends))

        for i in range(n):
            s, e = starts[i], ends[i]
            if e - s < 2:
                continue
            segment = row[s:e].copy()
            seg_keys = _brightness(segment[:, :3])
            if reverse:
                order = np.argsort(-seg_keys)
            else:
                order = np.argsort(seg_keys)
            work[row_idx, s:e] = segment[order]

    if direction == "vertical":
        output = work.transpose(1, 0, 2)

    return output, None
