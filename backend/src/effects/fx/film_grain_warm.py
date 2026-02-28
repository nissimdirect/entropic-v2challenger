"""Film Grain Warm — warm cinematic grain with mood presets."""

import numpy as np

from engine.determinism import make_rng

EFFECT_ID = "fx.film_grain_warm"
EFFECT_NAME = "Film Grain Warm"
EFFECT_CATEGORY = "texture"

PARAMS: dict = {
    "amount": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.15,
        "label": "Amount",
        "curve": "exponential",
        "unit": "%",
        "description": "Grain intensity",
    },
    "size": {
        "type": "float",
        "min": 0.5,
        "max": 4.0,
        "default": 1.0,
        "label": "Size",
        "curve": "linear",
        "unit": "px",
        "description": "Grain texture size (>1.5 = coarse upscaled grain)",
    },
    "warmth": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.3,
        "label": "Warmth",
        "curve": "linear",
        "unit": "%",
        "description": "Color warmth bias toward red/orange",
    },
    "mood": {
        "type": "choice",
        "options": ["vintage", "kodak", "expired"],
        "default": "vintage",
        "label": "Mood",
        "description": "Grain character preset",
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
    """Warm cinematic grain with mood presets — vintage, kodak, expired."""
    amount = max(0.0, min(1.0, float(params.get("amount", 0.15))))
    size = max(0.5, min(4.0, float(params.get("size", 1.0))))
    warmth = max(0.0, min(1.0, float(params.get("warmth", 0.3))))
    mood = str(params.get("mood", "vintage"))

    if amount == 0.0:
        return frame.copy(), None

    rgb = frame[:, :, :3].astype(np.float32)
    alpha = frame[:, :, 3:4]
    h, w = rgb.shape[:2]

    rng = make_rng(seed + frame_index)

    # Generate grain — coarse at large sizes
    if size > 1.5:
        sh, sw = max(1, -(-h // int(size))), max(1, -(-w // int(size)))
        grain_small = rng.standard_normal((sh, sw)).astype(np.float32)
        grain = np.repeat(np.repeat(grain_small, int(size), axis=0), int(size), axis=1)
        grain = grain[:h, :w]
    else:
        grain = rng.standard_normal((h, w)).astype(np.float32)

    grain = grain * amount * 128

    # Apply grain with warmth bias (more grain in blue, less in red)
    warm_bias = np.array([1.0 + warmth * 0.3, 1.0, 1.0 - warmth * 0.3])
    for c in range(3):
        rgb[:, :, c] += grain * warm_bias[c]

    # Mood-specific color adjustments
    if mood == "kodak":
        rgb[:, :, 0] += 8  # R boost
        rgb[:, :, 1] += 3  # G slight
        rgb[:, :, 2] -= 5  # B reduce
    elif mood == "expired":
        leak_w = max(1, w // 3)
        leak_x = int(rng.integers(0, max(1, w - leak_w)))
        leak_grad = np.linspace(0, 1, leak_w).reshape(1, -1)
        leak_strength = amount * 80
        end_x = min(leak_x + leak_w, w)
        actual_w = end_x - leak_x
        rgb[:, leak_x:end_x, 0] += leak_grad[:, :actual_w] * leak_strength
        rgb[:, leak_x:end_x, 1] += leak_grad[:, :actual_w] * leak_strength * 0.3
        rgb[:, :, 2] -= 10
        rgb[:, :, 0] += 5

    result_rgb = np.clip(rgb, 0, 255).astype(np.uint8)
    return np.concatenate([result_rgb, alpha], axis=2), None
