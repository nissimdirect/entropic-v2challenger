"""Auto Levels effect — one-click percentile-based level stretching."""

import numpy as np

EFFECT_ID = "util.auto_levels"
EFFECT_NAME = "Auto Levels"
EFFECT_CATEGORY = "util"

PARAMS: dict = {
    "clip_percent": {
        "type": "float",
        "min": 0.0,
        "max": 25.0,
        "default": 1.0,
        "label": "Clip %",
        "unit": "%",
        "curve": "exponential",
        "description": "Percentage of extreme pixels to clip before stretching",
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
    """Apply auto levels stretch. Stateless."""
    if frame.size == 0:
        return frame.copy(), None

    clip_percent = float(params.get("clip_percent", 1.0))
    clip_percent = max(0.0, min(25.0, clip_percent))

    output = frame.copy()

    for ch in range(3):  # R, G, B — preserve alpha
        channel = frame[:, :, ch].ravel().astype(np.float32)
        lo = np.percentile(channel, clip_percent)
        hi = np.percentile(channel, 100.0 - clip_percent)

        if hi <= lo:
            # Can't stretch — channel is uniform or near-uniform
            continue

        # Build LUT: map [lo, hi] -> [0, 255]
        lut = np.arange(256, dtype=np.float32)
        lut = np.clip(lut, lo, hi)
        lut = (lut - lo) / (hi - lo) * 255.0
        lut = np.clip(lut, 0, 255).astype(np.uint8)

        output[:, :, ch] = np.take(lut, frame[:, :, ch])

    return output, None
