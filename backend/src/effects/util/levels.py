"""Levels effect — 5-point tonal control with per-channel mode."""

import math

import numpy as np

EFFECT_ID = "util.levels"
EFFECT_NAME = "Levels"
EFFECT_CATEGORY = "util"

PARAMS: dict = {
    "input_black": {
        "type": "int",
        "min": 0,
        "max": 255,
        "default": 0,
        "label": "Input Black",
        "unit": "",
        "curve": "linear",
        "description": "Black point input level",
    },
    "input_white": {
        "type": "int",
        "min": 0,
        "max": 255,
        "default": 255,
        "label": "Input White",
        "unit": "",
        "curve": "linear",
        "description": "White point input level",
    },
    "gamma": {
        "type": "float",
        "min": 0.1,
        "max": 10.0,
        "default": 1.0,
        "label": "Gamma",
        "unit": "",
        "curve": "logarithmic",
        "description": "Midtone gamma correction",
    },
    "output_black": {
        "type": "int",
        "min": 0,
        "max": 255,
        "default": 0,
        "label": "Output Black",
        "unit": "",
        "curve": "linear",
        "description": "Black point output level",
    },
    "output_white": {
        "type": "int",
        "min": 0,
        "max": 255,
        "default": 255,
        "label": "Output White",
        "unit": "",
        "curve": "linear",
        "description": "White point output level",
    },
    "channel": {
        "type": "choice",
        "options": ["master", "r", "g", "b"],
        "default": "master",
        "label": "Channel",
        "description": "Which channel(s) to affect",
    },
}

CHANNEL_MAP = {"r": 0, "g": 1, "b": 2}


def _build_lut(
    input_black: int,
    input_white: int,
    gamma: float,
    output_black: int,
    output_white: int,
) -> np.ndarray:
    """Build a 256-entry LUT from levels parameters."""
    # Ensure input_black < input_white to avoid division by zero
    if input_black >= input_white:
        input_white = input_black + 1

    lut = np.arange(256, dtype=np.float32)
    lut = np.clip(lut, input_black, input_white)
    lut = (lut - input_black) / (input_white - input_black)
    lut = np.power(lut, 1.0 / gamma)
    lut = lut * (output_white - output_black) + output_black
    return np.clip(lut, 0, 255).astype(np.uint8)


def apply(
    frame: np.ndarray,
    params: dict,
    state_in: dict | None = None,
    *,
    frame_index: int,
    seed: int,
    resolution: tuple[int, int],
) -> tuple[np.ndarray, dict | None]:
    """Apply levels adjustment. Stateless."""
    if frame.size == 0:
        return frame.copy(), None

    _ib = float(params.get("input_black", 0))
    input_black = int(_ib if math.isfinite(_ib) else 0)
    _iw = float(params.get("input_white", 255))
    input_white = int(_iw if math.isfinite(_iw) else 255)
    gamma = float(params.get("gamma", 1.0))
    if not math.isfinite(gamma):
        gamma = 1.0
    _ob = float(params.get("output_black", 0))
    output_black = int(_ob if math.isfinite(_ob) else 0)
    _ow = float(params.get("output_white", 255))
    output_white = int(_ow if math.isfinite(_ow) else 255)
    channel = str(params.get("channel", "master"))

    # Identity check — skip processing
    if (
        input_black == 0
        and input_white == 255
        and gamma == 1.0
        and output_black == 0
        and output_white == 255
    ):
        return frame.copy(), None

    lut = _build_lut(input_black, input_white, gamma, output_black, output_white)
    output = frame.copy()

    if channel == "master":
        # Apply to R, G, B (preserve alpha)
        output[:, :, :3] = np.take(lut, frame[:, :, :3])
    elif channel in CHANNEL_MAP:
        ch = CHANNEL_MAP[channel]
        output[:, :, ch] = np.take(lut, frame[:, :, ch])

    return output, None
