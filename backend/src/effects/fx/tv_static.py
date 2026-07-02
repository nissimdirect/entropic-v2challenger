"""TV Static — full-screen noise with horizontal sync drift."""

import numpy as np

from engine.determinism import make_rng

EFFECT_ID = "fx.tv_static"
EFFECT_NAME = "TV Static"
EFFECT_CATEGORY = "distortion"

PARAMS: dict = {
    "intensity": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.8,
        "label": "Intensity",
        "curve": "exponential",
        "unit": "%",
        "description": "Static overlay amount",
    },
    "sync_drift": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.3,
        "label": "Sync Drift",
        "curve": "linear",
        "unit": "%",
        "description": "Horizontal sync error amount",
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
    """TV static — channel-between-stations noise with sync drift."""
    intensity = max(0.0, min(1.0, float(params.get("intensity", 0.8))))
    sync_drift = max(0.0, min(1.0, float(params.get("sync_drift", 0.3))))

    rgb = frame[:, :, :3]
    alpha = frame[:, :, 3:4]
    h, w = rgb.shape[:2]

    rng = make_rng(seed)
    static = rng.integers(0, 256, (h, w), dtype=np.uint8)
    static_rgb = np.stack([static] * 3, axis=2)

    result = rgb.copy()
    if sync_drift > 0:
        num_rows = int(h * sync_drift * 0.2)
        for _ in range(num_rows):
            row = int(rng.integers(0, h))
            shift = int(rng.integers(-w // 4, w // 4 + 1))
            result[row] = np.roll(result[row], shift, axis=0)

    blended = (
        result.astype(np.float32) * (1 - intensity)
        + static_rgb.astype(np.float32) * intensity
    )
    result_rgb = np.clip(blended, 0, 255).astype(np.uint8)

    output = np.concatenate([result_rgb, alpha], axis=2)
    return output, None
