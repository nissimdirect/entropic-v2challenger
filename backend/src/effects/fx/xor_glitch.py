"""XOR Glitch — bitwise XOR corruption, digital-only aesthetic."""

import numpy as np

from engine.determinism import make_rng

EFFECT_ID = "fx.xor_glitch"
EFFECT_NAME = "XOR Glitch"
EFFECT_CATEGORY = "destruction"

PARAMS: dict = {
    "pattern": {
        "type": "int",
        "min": 0,
        "max": 255,
        "default": 128,
        "label": "Pattern",
        "curve": "linear",
        "unit": "",
        "description": "XOR byte value (fixed mode) or shift amount (shift_self mode)",
    },
    "mode": {
        "type": "choice",
        "options": ["fixed", "random", "gradient", "shift_self", "invert_self"],
        "default": "fixed",
        "label": "Mode",
        "description": "XOR mode",
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
    """Bitwise XOR pixels with a pattern — digital-only aesthetic."""
    pattern = max(0, min(255, int(params.get("pattern", 128))))
    mode = str(params.get("mode", "fixed"))
    rng = make_rng(seed)

    output = frame.copy()
    h, w = frame.shape[:2]

    if mode == "random":
        mask = rng.integers(0, 256, (h, w, 3), dtype=np.uint8)
        output[:, :, :3] = np.bitwise_xor(frame[:, :, :3], mask)
    elif mode == "gradient":
        gradient = np.tile(np.arange(w, dtype=np.uint8), (h, 1))
        gradient_3ch = np.stack([gradient] * 3, axis=2)
        output[:, :, :3] = np.bitwise_xor(frame[:, :, :3], gradient_3ch)
    elif mode == "shift_self":
        shift = max(1, min(w // 2, pattern))
        shifted = np.roll(frame[:, :, :3], shift, axis=1)
        output[:, :, :3] = np.bitwise_xor(frame[:, :, :3], shifted)
    elif mode == "invert_self":
        inverted = 255 - frame[:, :, :3]
        output[:, :, :3] = np.bitwise_xor(frame[:, :, :3], inverted)
    else:  # fixed
        output[:, :, :3] = np.bitwise_xor(frame[:, :, :3], np.uint8(pattern))

    return output, None
