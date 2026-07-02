"""Data Bend — treat pixel data as audio signal, apply DSP effects."""

import numpy as np

from engine.determinism import make_rng

EFFECT_ID = "fx.data_bend"
EFFECT_NAME = "Data Bend"
EFFECT_CATEGORY = "destruction"

PARAMS: dict = {
    "effect": {
        "type": "choice",
        "options": ["echo", "distort", "bitcrush_audio", "reverse", "feedback"],
        "default": "echo",
        "label": "Effect",
        "description": "DSP effect to apply to pixel data",
    },
    "intensity": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.5,
        "label": "Intensity",
        "curve": "exponential",
        "unit": "%",
        "description": "Effect strength",
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
    """Treat pixel data as audio and apply DSP effects."""
    effect = str(params.get("effect", "echo"))
    intensity = max(0.0, min(1.0, float(params.get("intensity", 0.5))))
    rng = make_rng(seed)

    if intensity == 0.0:
        return frame.copy(), None

    # Work on RGB channels only, preserve alpha
    alpha = frame[:, :, 3:4].copy()
    rgb = frame[:, :, :3]

    # Flatten RGB to 1D "audio signal"
    flat = rgb.flatten().astype(np.float32) / 255.0
    row_width = frame.shape[1] * 3

    if effect == "echo":
        delay = int(row_width * intensity * 10)
        delay = max(1, min(len(flat) // 2, delay))
        echo_signal = np.zeros_like(flat)
        echo_signal[delay:] = flat[:-delay] * intensity * 0.7
        flat = flat + echo_signal

    elif effect == "distort":
        threshold = max(0.05, 1.0 - intensity * 0.95)
        flat = np.clip(flat / threshold, 0.0, 1.0)

    elif effect == "bitcrush_audio":
        levels = max(2, int(256 * (1.0 - intensity * 0.98)))
        flat = np.round(flat * levels) / levels

    elif effect == "reverse":
        chunk_size = max(100, int(len(flat) * intensity * 0.1))
        num_chunks = max(1, int(intensity * 40))
        for _ in range(num_chunks):
            start = int(rng.integers(0, max(1, len(flat) - chunk_size)))
            flat[start : start + chunk_size] = flat[start : start + chunk_size][::-1]

    elif effect == "feedback":
        num_taps = max(3, int(intensity * 8))
        for _ in range(num_taps):
            delay = int(rng.integers(100, max(101, int(len(flat) * 0.1))))
            gain = 0.3 + intensity * 0.6
            echo = np.zeros_like(flat)
            echo[delay:] = flat[:-delay] * gain
            flat = flat + echo

    # Reshape back and recombine with alpha
    result_rgb = np.clip(flat * 255.0, 0, 255).astype(np.uint8).reshape(rgb.shape)
    output = np.concatenate([result_rgb, alpha], axis=2)
    return output, None
