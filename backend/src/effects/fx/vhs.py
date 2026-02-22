"""VHS effect — simulates VHS tape degradation."""

import numpy as np

from engine.determinism import make_rng

EFFECT_ID = "fx.vhs"
EFFECT_NAME = "VHS"
EFFECT_CATEGORY = "texture"

PARAMS: dict = {
    "tracking": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.5,
        "label": "Tracking Error",
    },
    "noise": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.2,
        "label": "Noise",
    },
    "chromatic": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.3,
        "label": "Chromatic Aberration",
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
    """Simulate VHS tape degradation. Uses seeded RNG for determinism."""
    tracking = float(params.get("tracking", 0.5))
    noise_amount = float(params.get("noise", 0.2))
    chromatic = float(params.get("chromatic", 0.3))

    tracking = max(0.0, min(1.0, tracking))
    noise_amount = max(0.0, min(1.0, noise_amount))
    chromatic = max(0.0, min(1.0, chromatic))

    rng = make_rng(seed)
    output = frame.copy()
    h, w = output.shape[:2]
    result = output[:, :, :3].astype(np.float32)

    # 1. Tracking lines — horizontal shifts at random rows
    if tracking > 0:
        num_glitch_rows = int(h * tracking * 0.1)
        for _ in range(num_glitch_rows):
            row = int(rng.integers(0, h))
            band_h = int(rng.integers(1, max(2, int(h * 0.02))))
            max_shift = max(1, int(w * tracking * 0.1))
            shift = int(rng.integers(-max_shift, max_shift + 1))
            end_row = min(row + band_h, h)
            result[row:end_row] = np.roll(result[row:end_row], shift, axis=1)

    # 2. Chromatic aberration — shift R and B channels horizontally
    if chromatic > 0:
        shift_px = int(chromatic * 10)
        if shift_px > 0:
            result[:, :, 0] = np.roll(result[:, :, 0], shift_px, axis=1)
            result[:, :, 2] = np.roll(result[:, :, 2], -shift_px, axis=1)

    # 3. Noise overlay
    if noise_amount > 0:
        noise = rng.normal(0, 25 * noise_amount, (h, w, 3)).astype(np.float32)
        result = result + noise

    output[:, :, :3] = np.clip(result, 0, 255).astype(np.uint8)
    return output, None
