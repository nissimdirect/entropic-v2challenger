"""Channel Shift effect — offsets RGB channels independently."""

import numpy as np

EFFECT_ID = "fx.channelshift"
EFFECT_NAME = "Channel Shift"
EFFECT_CATEGORY = "glitch"

PARAMS: dict = {
    "r_offset": {
        "type": "int",
        "min": -50,
        "max": 50,
        "default": 10,
        "label": "Red Offset",
    },
    "g_offset": {
        "type": "int",
        "min": -50,
        "max": 50,
        "default": 0,
        "label": "Green Offset",
    },
    "b_offset": {
        "type": "int",
        "min": -50,
        "max": 50,
        "default": -10,
        "label": "Blue Offset",
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
    """Shift R, G, B channels by independent horizontal pixel offsets. Stateless."""
    r_offset = int(params.get("r_offset", 10))
    g_offset = int(params.get("g_offset", 0))
    b_offset = int(params.get("b_offset", -10))

    r_offset = max(-50, min(50, r_offset))
    g_offset = max(-50, min(50, g_offset))
    b_offset = max(-50, min(50, b_offset))

    output = frame.copy()

    # Roll each RGB channel horizontally, preserve alpha
    if r_offset != 0:
        output[:, :, 0] = np.roll(frame[:, :, 0], r_offset, axis=1)
    if g_offset != 0:
        output[:, :, 1] = np.roll(frame[:, :, 1], g_offset, axis=1)
    if b_offset != 0:
        output[:, :, 2] = np.roll(frame[:, :, 2], b_offset, axis=1)

    return output, None
