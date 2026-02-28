"""Channel Destroy — violently separate, swap, crush, or eliminate color channels."""

import numpy as np

from engine.determinism import make_rng

EFFECT_ID = "fx.channel_destroy"
EFFECT_NAME = "Channel Destroy"
EFFECT_CATEGORY = "destruction"

PARAMS: dict = {
    "mode": {
        "type": "choice",
        "options": [
            "separate",
            "swap",
            "crush",
            "eliminate",
            "invert_ch",
            "xor_channels",
        ],
        "default": "separate",
        "label": "Mode",
        "description": "Channel destruction mode",
    },
    "intensity": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.5,
        "label": "Intensity",
        "curve": "exponential",
        "unit": "%",
        "description": "How extreme the destruction",
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
    """Violently manipulate color channels."""
    mode = str(params.get("mode", "separate"))
    intensity = max(0.0, min(1.0, float(params.get("intensity", 0.5))))
    rng = make_rng(seed)

    h, w = frame.shape[:2]
    result = frame.copy()

    if mode == "separate":
        shift_x = int(w * intensity * 0.3)
        shift_y = int(h * intensity * 0.3)
        result[:, :, 0] = np.roll(
            np.roll(frame[:, :, 0], shift_x, axis=1), shift_y, axis=0
        )
        result[:, :, 1] = np.roll(
            np.roll(frame[:, :, 1], -shift_x, axis=1), -shift_y // 2, axis=0
        )
        result[:, :, 2] = np.roll(
            np.roll(frame[:, :, 2], shift_x // 2, axis=1), -shift_y, axis=0
        )

    elif mode == "swap":
        channels = [0, 1, 2]
        shuffled = list(rng.permutation(channels))
        result[:, :, 0] = frame[:, :, shuffled[0]]
        result[:, :, 1] = frame[:, :, shuffled[1]]
        result[:, :, 2] = frame[:, :, shuffled[2]]
        if intensity > 0.5:
            shift = int(w * (intensity - 0.5) * 0.4)
            result[:, :, 0] = np.roll(result[:, :, 0], shift, axis=1)

    elif mode == "crush":
        num_channels = max(1, int(intensity * 3))
        channels_to_crush = rng.choice(3, size=min(num_channels, 3), replace=False)
        for ch in channels_to_crush:
            result[:, :, ch] = np.where(
                result[:, :, ch] > 128, np.uint8(255), np.uint8(0)
            )

    elif mode == "eliminate":
        num_channels = max(1, int(intensity * 2.5))
        channels_to_kill = rng.choice(3, size=min(num_channels, 3), replace=False)
        for ch in channels_to_kill:
            result[:, :, ch] = 0

    elif mode == "invert_ch":
        num_channels = max(1, int(intensity * 3))
        channels_to_invert = rng.choice(3, size=min(num_channels, 3), replace=False)
        for ch in channels_to_invert:
            result[:, :, ch] = 255 - result[:, :, ch]

    elif mode == "xor_channels":
        result[:, :, 0] = np.bitwise_xor(frame[:, :, 0], frame[:, :, 1])
        result[:, :, 1] = np.bitwise_xor(frame[:, :, 1], frame[:, :, 2])
        result[:, :, 2] = np.bitwise_xor(frame[:, :, 2], frame[:, :, 0])

    return result, None
