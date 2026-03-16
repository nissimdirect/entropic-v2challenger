"""Temporal Blend — feedback, delay, and visual reverb modes."""

import numpy as np

EFFECT_ID = "fx.temporal_blend"
EFFECT_NAME = "Temporal Blend"
EFFECT_CATEGORY = "temporal"

PARAMS: dict = {
    "mode": {
        "type": "choice",
        "options": ["feedback", "delay", "visual_reverb"],
        "default": "feedback",
        "label": "Mode",
        "description": "Blend algorithm: feedback trails, delay echo, or multi-tap reverb",
    },
    "decay": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.7,
        "label": "Decay",
        "curve": "linear",
        "unit": "",
        "description": "How much previous frames persist (feedback/reverb)",
    },
    "mix": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.5,
        "label": "Mix",
        "curve": "linear",
        "unit": "",
        "description": "Dry/wet blend (feedback mode)",
    },
    "delay_frames": {
        "type": "int",
        "min": 1,
        "max": 30,
        "default": 5,
        "label": "Delay Frames",
        "description": "How many frames back to echo (delay mode)",
        "curve": "linear",
        "unit": "",
    },
    "taps": {
        "type": "int",
        "min": 2,
        "max": 8,
        "default": 4,
        "label": "Taps",
        "description": "Number of echo taps (visual_reverb mode)",
        "curve": "linear",
        "unit": "",
    },
    "buffer_depth": {
        "type": "int",
        "min": 2,
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
    """Temporal blend — feedback trails, delay echo, or multi-tap reverb."""
    mode = str(params.get("mode", "feedback"))
    decay = max(0.0, min(1.0, float(params.get("decay", 0.7))))
    mix = max(0.0, min(1.0, float(params.get("mix", 0.5))))
    delay_frames = max(1, min(30, int(params.get("delay_frames", 5))))
    taps = max(2, min(8, int(params.get("taps", 4))))
    buffer_depth = max(2, min(60, int(params.get("buffer_depth", 30))))

    alpha = frame[:, :, 3:4]
    rgb = frame[:, :, :3]

    state = dict(state_in) if state_in else {}

    if mode == "feedback":
        prev = state.get("prev_frame")
        if prev is not None and prev.shape == rgb.shape:
            blended = (
                rgb.astype(np.float32) * (1.0 - mix)
                + prev.astype(np.float32) * mix * decay
                + rgb.astype(np.float32) * mix * (1.0 - decay)
            )
            out_rgb = np.clip(blended, 0, 255).astype(np.uint8)
        else:
            out_rgb = rgb.copy()
        state["prev_frame"] = out_rgb.copy()
        return np.concatenate([out_rgb, alpha], axis=2), state

    elif mode == "delay":
        buf = state.get("buffer", [])
        buf.append(rgb.copy())
        if len(buf) > buffer_depth:
            buf = buf[-buffer_depth:]
        state["buffer"] = buf

        if len(buf) > delay_frames:
            delayed = buf[-(delay_frames + 1)]
            if delayed.shape == rgb.shape:
                blended = (
                    rgb.astype(np.float32) * (1.0 - mix)
                    + delayed.astype(np.float32) * mix
                )
                out_rgb = np.clip(blended, 0, 255).astype(np.uint8)
                return np.concatenate([out_rgb, alpha], axis=2), state
        return np.concatenate([rgb, alpha], axis=2), state

    else:  # visual_reverb
        buf = state.get("buffer", [])
        buf.append(rgb.copy())
        if len(buf) > buffer_depth:
            buf = buf[-buffer_depth:]
        state["buffer"] = buf

        if len(buf) < taps + 1:
            return frame.copy(), state

        result = rgb.astype(np.float32)
        total_weight = 1.0
        for tap_i in range(1, taps + 1):
            tap_decay = decay**tap_i
            idx = max(0, len(buf) - 1 - tap_i * max(1, len(buf) // (taps + 1)))
            tap_frame = buf[idx]
            if tap_frame.shape == rgb.shape:
                result += tap_frame.astype(np.float32) * tap_decay
                total_weight += tap_decay

        out_rgb = np.clip(result / total_weight, 0, 255).astype(np.uint8)
        return np.concatenate([out_rgb, alpha], axis=2), state
