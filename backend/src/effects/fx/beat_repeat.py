"""Beat Repeat — repeat last N frames in a pattern."""

import numpy as np

EFFECT_ID = "fx.beat_repeat"
EFFECT_NAME = "Beat Repeat"
EFFECT_CATEGORY = "temporal"

PARAMS: dict = {
    "repeat_length": {
        "type": "int",
        "min": 2,
        "max": 16,
        "default": 4,
        "label": "Repeat Length",
        "description": "Number of frames in the repeat buffer",
        "curve": "linear",
        "unit": "",
    },
    "pattern": {
        "type": "choice",
        "options": ["1111", "1010", "1001"],
        "default": "1111",
        "label": "Pattern",
        "description": "Binary gate pattern (1 = play repeat, 0 = pass through)",
    },
    "buffer_depth": {
        "type": "int",
        "min": 4,
        "max": 60,
        "default": 30,
        "label": "Buffer Depth",
        "description": "Max frames stored in circular buffer",
        "curve": "linear",
        "unit": "",
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
    """Repeat last N frames in a rhythmic pattern."""
    repeat_length = max(2, min(16, int(params.get("repeat_length", 4))))
    pattern = str(params.get("pattern", "1111"))
    buffer_depth = max(4, min(60, int(params.get("buffer_depth", 30))))

    state = dict(state_in) if state_in else {}
    alpha = frame[:, :, 3:4]
    rgb = frame[:, :, :3]

    buf = state.get("buffer", [])
    buf.append(rgb.copy())
    if len(buf) > buffer_depth:
        buf = buf[-buffer_depth:]
    state["buffer"] = buf

    pattern_pos = state.get("pattern_pos", 0)

    if len(buf) < repeat_length:
        state["pattern_pos"] = pattern_pos
        return frame.copy(), state

    # Check pattern gate
    pat_idx = pattern_pos % len(pattern)
    is_repeat = pattern[pat_idx] == "1"

    state["pattern_pos"] = pattern_pos + 1

    if is_repeat:
        # Read from the repeat buffer (last repeat_length frames, cycling)
        repeat_idx = pattern_pos % repeat_length
        buf_idx = len(buf) - repeat_length + repeat_idx
        buf_idx = max(0, min(len(buf) - 1, buf_idx))
        repeated = buf[buf_idx]
        if repeated.shape == rgb.shape:
            return np.concatenate([repeated.copy(), alpha], axis=2), state

    return np.concatenate([rgb.copy(), alpha], axis=2), state
