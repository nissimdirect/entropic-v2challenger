"""Temporal Freeze — stutter and tape stop modes."""

import numpy as np

EFFECT_ID = "fx.temporal_freeze"
EFFECT_NAME = "Temporal Freeze"
EFFECT_CATEGORY = "temporal"

PARAMS: dict = {
    "mode": {
        "type": "choice",
        "options": ["stutter", "tape_stop"],
        "default": "stutter",
        "label": "Mode",
        "description": "Stutter (periodic freeze) or tape stop (decelerate + freeze)",
    },
    "interval": {
        "type": "int",
        "min": 2,
        "max": 30,
        "default": 8,
        "label": "Interval",
        "description": "Frames between stutters (stutter mode)",
        "curve": "linear",
        "unit": "",
    },
    "repeat": {
        "type": "int",
        "min": 1,
        "max": 10,
        "default": 3,
        "label": "Repeat",
        "description": "How many frames to hold per stutter",
        "curve": "linear",
        "unit": "",
    },
    "stop_speed": {
        "type": "float",
        "min": 0.01,
        "max": 0.5,
        "default": 0.1,
        "label": "Stop Speed",
        "curve": "linear",
        "unit": "",
        "description": "Deceleration rate (tape_stop mode)",
    },
    "fade_to_black": {
        "type": "choice",
        "options": ["false", "true"],
        "default": "false",
        "label": "Fade to Black",
        "description": "Darken during tape stop",
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
    """Temporal freeze — stutter hold or tape-stop deceleration."""
    mode = str(params.get("mode", "stutter"))
    alpha = frame[:, :, 3:4]
    rgb = frame[:, :, :3]

    state = dict(state_in) if state_in else {}

    if mode == "stutter":
        interval = max(2, min(30, int(params.get("interval", 8))))
        repeat = max(1, min(10, int(params.get("repeat", 3))))

        held = state.get("held_frame")
        hold_until = state.get("hold_until", -1)

        if frame_index <= hold_until and held is not None and held.shape == rgb.shape:
            return np.concatenate([held.copy(), alpha], axis=2), state

        if frame_index % interval == 0:
            state["held_frame"] = rgb.copy()
            state["hold_until"] = frame_index + repeat - 1
            return np.concatenate([rgb.copy(), alpha], axis=2), state

        # Clear stale held frame if hold expired
        if frame_index > hold_until:
            state.pop("held_frame", None)
            state["hold_until"] = -1

        return np.concatenate([rgb.copy(), alpha], axis=2), state

    else:  # tape_stop
        stop_speed = max(0.01, min(0.5, float(params.get("stop_speed", 0.1))))
        fade = str(params.get("fade_to_black", "false")).lower() == "true"

        speed = state.get("speed", 1.0)
        frozen = state.get("frozen_frame")

        speed = max(0.0, speed - stop_speed)
        state["speed"] = speed

        if speed <= 0.0:
            if frozen is None or frozen.shape != rgb.shape:
                frozen = rgb.copy()
                state["frozen_frame"] = frozen
            out_rgb = frozen.copy()
            if fade:
                frames_frozen = frame_index - state.get("freeze_start", frame_index)
                brightness = max(0.0, 1.0 - frames_frozen * 0.02)
                out_rgb = np.clip(
                    out_rgb.astype(np.float32) * brightness, 0, 255
                ).astype(np.uint8)
            if "freeze_start" not in state:
                state["freeze_start"] = frame_index
            return np.concatenate([out_rgb, alpha], axis=2), state

        # Still moving — pass through, capture for potential freeze
        state["frozen_frame"] = rgb.copy()
        return np.concatenate([rgb.copy(), alpha], axis=2), state
