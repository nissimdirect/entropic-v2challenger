"""Granulator — cut frame into time grains, rearrange playback."""

import numpy as np

from engine.determinism import make_rng

EFFECT_ID = "fx.granulator"
EFFECT_NAME = "Granulator"
EFFECT_CATEGORY = "temporal"

PARAMS: dict = {
    "grain_size": {
        "type": "int",
        "min": 2,
        "max": 30,
        "default": 8,
        "label": "Grain Size",
        "description": "Length of each grain in frames",
        "curve": "linear",
        "unit": "",
    },
    "spray": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.3,
        "label": "Spray",
        "curve": "linear",
        "unit": "",
        "description": "Random offset range from read position",
    },
    "reverse_prob": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.2,
        "label": "Reverse Prob",
        "curve": "linear",
        "unit": "",
        "description": "Probability of playing a grain in reverse",
    },
    "buffer_depth": {
        "type": "int",
        "min": 10,
        "max": 60,
        "default": 30,
        "label": "Buffer Depth",
        "description": "Max frames stored in grain buffer",
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
    """Video granulator — rearrange video slices like granular synthesis."""
    grain_size = max(2, min(30, int(params.get("grain_size", 8))))
    spray = max(0.0, min(1.0, float(params.get("spray", 0.3))))
    reverse_prob = max(0.0, min(1.0, float(params.get("reverse_prob", 0.2))))
    buffer_depth = max(10, min(60, int(params.get("buffer_depth", 30))))

    state = dict(state_in) if state_in else {}
    alpha = frame[:, :, 3:4]
    rgb = frame[:, :, :3]

    buf = state.get("grain_buffer", [])
    buf.append(rgb.copy())
    if len(buf) > buffer_depth:
        buf = buf[-buffer_depth:]
    state["grain_buffer"] = buf

    position = state.get("position", 0)

    if len(buf) < grain_size + 1:
        state["position"] = position
        return frame.copy(), state

    rng = make_rng(seed + frame_index)

    # Apply spray: randomize read position
    spray_offset = int(rng.uniform(-spray, spray) * len(buf) * 0.5)
    read_base = max(0, min(len(buf) - grain_size, len(buf) // 2 + spray_offset))

    # Determine which frame within the grain to show
    grain_phase = frame_index % grain_size
    if rng.random() < reverse_prob:
        grain_phase = grain_size - 1 - grain_phase

    read_idx = min(read_base + grain_phase, len(buf) - 1)
    read_idx = max(0, read_idx)

    grain_frame = buf[read_idx]
    if grain_frame.shape != rgb.shape:
        return frame.copy(), state

    state["position"] = (position + 1) % buffer_depth
    return np.concatenate([grain_frame.copy(), alpha], axis=2), state
