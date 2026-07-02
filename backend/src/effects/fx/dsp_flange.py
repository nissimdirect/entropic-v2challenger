"""DSP Flange — video, spatial, hue, and frequency flanger modes."""

import numpy as np

EFFECT_ID = "fx.dsp_flange"
EFFECT_NAME = "DSP Flange"
EFFECT_CATEGORY = "modulation"

PARAMS: dict = {
    "mode": {
        "type": "choice",
        "options": ["video_flanger", "spatial_flanger", "hue_flanger", "freq_flanger"],
        "default": "video_flanger",
        "label": "Mode",
        "description": "Flanger algorithm",
    },
    "rate": {
        "type": "float",
        "min": 0.05,
        "max": 3.0,
        "default": 0.5,
        "label": "Rate",
        "curve": "linear",
        "unit": "Hz",
        "description": "LFO speed",
    },
    "depth": {
        "type": "int",
        "min": 1,
        "max": 30,
        "default": 10,
        "label": "Depth",
        "description": "Max delay in frames (video) or pixel shift (spatial)",
        "curve": "linear",
        "unit": "",
    },
    "feedback": {
        "type": "float",
        "min": 0.0,
        "max": 0.95,
        "default": 0.4,
        "label": "Feedback",
        "curve": "linear",
        "unit": "",
        "description": "Output-to-input feedback amount (video mode)",
    },
    "wet": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.5,
        "label": "Wet",
        "curve": "linear",
        "unit": "",
        "description": "Dry/wet mix",
    },
    "hue_range": {
        "type": "int",
        "min": 0,
        "max": 180,
        "default": 60,
        "label": "Hue Range",
        "description": "Hue rotation range in degrees (hue mode)",
        "curve": "linear",
        "unit": "",
    },
    "freq_shift": {
        "type": "int",
        "min": 1,
        "max": 100,
        "default": 20,
        "label": "Freq Shift",
        "description": "Frequency shift amount (freq mode)",
        "curve": "linear",
        "unit": "",
    },
    "buffer_depth": {
        "type": "int",
        "min": 5,
        "max": 60,
        "default": 30,
        "label": "Buffer Depth",
        "description": "Max frames stored (video/freq modes)",
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
    """DSP flanger — temporal, spatial, hue, or frequency domain flanging."""
    mode = str(params.get("mode", "video_flanger"))
    rate = max(0.05, min(3.0, float(params.get("rate", 0.5))))
    wet = max(0.0, min(1.0, float(params.get("wet", 0.5))))

    alpha = frame[:, :, 3:4]
    rgb = frame[:, :, :3]

    phase = frame_index * rate * 0.1
    lfo = (np.sin(2.0 * np.pi * phase) + 1.0) / 2.0

    if mode == "video_flanger":
        return _video_flanger(rgb, alpha, params, state_in, lfo, frame_index)
    elif mode == "spatial_flanger":
        return _spatial_flanger(rgb, alpha, params, lfo, frame_index, rate)
    elif mode == "hue_flanger":
        return _hue_flanger(rgb, alpha, params, lfo)
    else:  # freq_flanger
        return _freq_flanger(rgb, alpha, params, state_in, lfo)


def _video_flanger(
    rgb: np.ndarray,
    alpha: np.ndarray,
    params: dict,
    state_in: dict | None,
    lfo: float,
    frame_index: int,
) -> tuple[np.ndarray, dict | None]:
    depth = max(1, min(30, int(params.get("depth", 10))))
    feedback = max(0.0, min(0.95, float(params.get("feedback", 0.4))))
    wet = max(0.0, min(1.0, float(params.get("wet", 0.5))))
    buffer_depth = max(5, min(60, int(params.get("buffer_depth", 30))))

    state = dict(state_in) if state_in else {}
    buf = state.get("buffer", [])

    f = rgb.astype(np.float32)
    buf.append(f.copy())
    if len(buf) > buffer_depth:
        buf = buf[-buffer_depth:]
    state["buffer"] = buf

    delay_frames = max(1, int(lfo * depth))
    delay_idx = max(0, len(buf) - 1 - delay_frames)
    delayed = buf[delay_idx]

    if delayed.shape != f.shape:
        return np.concatenate([rgb.copy(), alpha], axis=2), state

    mixed = f * (1.0 - wet) + (f + delayed) * 0.5 * wet

    if feedback > 0 and len(buf) > 1:
        buf[-1] = buf[-1] * (1.0 - feedback) + mixed * feedback

    out_rgb = np.clip(mixed, 0, 255).astype(np.uint8)
    return np.concatenate([out_rgb, alpha], axis=2), state


def _spatial_flanger(
    rgb: np.ndarray,
    alpha: np.ndarray,
    params: dict,
    lfo: float,
    frame_index: int,
    rate: float,
) -> tuple[np.ndarray, dict | None]:
    max_shift = max(1, min(50, int(params.get("depth", 15))))

    f = rgb.astype(np.float32)
    h, w = f.shape[:2]
    result = np.zeros_like(f)

    for y in range(h):
        row_lfo = np.sin(2.0 * np.pi * rate * frame_index * 0.1 + y * 0.02)
        shift = int(row_lfo * max_shift)
        shifted_row = np.roll(f[y], shift, axis=0)
        result[y] = (f[y] + shifted_row) / 2.0

    out_rgb = np.clip(result, 0, 255).astype(np.uint8)
    return np.concatenate([out_rgb, alpha], axis=2), None


def _hue_flanger(
    rgb: np.ndarray,
    alpha: np.ndarray,
    params: dict,
    lfo: float,
) -> tuple[np.ndarray, dict | None]:
    import cv2

    hue_range = max(0, min(180, int(params.get("hue_range", 60))))

    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV).astype(np.float32)
    shift = (lfo * 2.0 - 1.0) * hue_range
    shifted_hsv = hsv.copy()
    shifted_hsv[:, :, 0] = (shifted_hsv[:, :, 0] + shift) % 180.0

    blended = (hsv + shifted_hsv) / 2.0
    blended[:, :, 0] = blended[:, :, 0] % 180.0
    blended = np.clip(blended, 0, [180, 255, 255]).astype(np.uint8)
    out_rgb = cv2.cvtColor(blended, cv2.COLOR_HSV2RGB)
    return np.concatenate([out_rgb, alpha], axis=2), None


def _freq_flanger(
    rgb: np.ndarray,
    alpha: np.ndarray,
    params: dict,
    state_in: dict | None,
    lfo: float,
) -> tuple[np.ndarray, dict | None]:
    freq_shift = max(1, min(100, int(params.get("freq_shift", 20))))
    buffer_depth = max(5, min(60, int(params.get("buffer_depth", 30))))

    state = dict(state_in) if state_in else {}
    buf = state.get("buffer", [])
    buf.append(rgb.copy())
    if len(buf) > buffer_depth:
        buf = buf[-buffer_depth:]
    state["buffer"] = buf

    delay = max(1, int(lfo * min(len(buf) - 1, 15)))
    past_idx = max(0, len(buf) - 1 - delay)
    past = buf[past_idx]

    if past.shape != rgb.shape:
        return np.concatenate([rgb.copy(), alpha], axis=2), state

    blend = 0.4 * lfo
    result = np.zeros_like(rgb, dtype=np.float32)

    for ch in range(3):
        cur_fft = np.fft.fft2(rgb[:, :, ch].astype(np.float32))
        past_fft = np.fft.fft2(past[:, :, ch].astype(np.float32))
        mag = np.abs(cur_fft) * (1.0 - blend) + np.abs(past_fft) * blend
        phase = np.angle(cur_fft)
        result[:, :, ch] = np.real(np.fft.ifft2(mag * np.exp(1j * phase)))

    out_rgb = np.clip(result, 0, 255).astype(np.uint8)
    return np.concatenate([out_rgb, alpha], axis=2), state
