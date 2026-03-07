"""Sidechain Cross Blend — crossfade and additive bleed between main and key frames."""

import numpy as np

from engine.determinism import make_rng

EFFECT_ID = "fx.sidechain_cross_blend"
EFFECT_NAME = "Sidechain Cross Blend"
EFFECT_CATEGORY = "sidechain"

PARAMS: dict = {
    "mode": {
        "type": "choice",
        "options": ["cross", "crossfeed"],
        "default": "cross",
        "label": "Mode",
        "description": "Cross: lerp between main and key. Crossfeed: additive bleed.",
    },
    "crossfade_amount": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.5,
        "label": "Crossfade Amount",
        "curve": "linear",
        "unit": "",
        "description": "Blend ratio between main (0) and key (1) — cross mode",
    },
    "bleed_amount": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.3,
        "label": "Bleed Amount",
        "curve": "linear",
        "unit": "",
        "description": "How much key bleeds into main — crossfeed mode",
    },
    "feedback": {
        "type": "float",
        "min": 0.0,
        "max": 0.5,
        "default": 0.0,
        "label": "Feedback",
        "curve": "linear",
        "unit": "",
        "description": "Feed previous output back into the blend — crossfeed mode",
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
    """Blend main and key frames via crossfade or additive bleed."""
    mode = str(params.get("mode", "cross"))

    h, w = frame.shape[:2]
    rgb = frame[:, :, :3].astype(np.float32)
    alpha = frame[:, :, 3:4]

    # Get sidechain key frame
    key_frame = params.get("_sidechain_frame")
    if key_frame is None:
        key_frame = frame[:, :, :3]
    elif key_frame.shape[2] == 4:
        key_frame = key_frame[:, :, :3]

    # Resize key to match main if needed
    if key_frame.shape[:2] != (h, w):
        import cv2

        key_frame = cv2.resize(key_frame, (w, h))

    key_f = key_frame.astype(np.float32)

    if mode == "cross":
        amount = max(0.0, min(1.0, float(params.get("crossfade_amount", 0.5))))
        result_rgb = rgb * (1.0 - amount) + key_f * amount
        state_out = None
    else:  # crossfeed
        bleed = max(0.0, min(1.0, float(params.get("bleed_amount", 0.3))))
        feedback = max(0.0, min(0.5, float(params.get("feedback", 0.0))))

        result_rgb = rgb + key_f * bleed

        # Apply feedback from previous output
        if feedback > 0 and state_in is not None:
            prev_output = state_in.get("prev_output")
            if prev_output is not None and prev_output.shape == rgb.shape:
                result_rgb = result_rgb + prev_output.astype(np.float32) * feedback

        result_rgb_u8 = np.clip(result_rgb, 0, 255).astype(np.uint8)
        state_out = {"prev_output": result_rgb_u8} if feedback > 0 else None
        result_rgb = result_rgb

    result_rgb = np.clip(result_rgb, 0, 255).astype(np.uint8)
    return np.concatenate([result_rgb, alpha], axis=2), state_out
