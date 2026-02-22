"""Wave Distort effect — sinusoidal displacement of pixels."""

import numpy as np

EFFECT_ID = "fx.wave_distort"
EFFECT_NAME = "Wave Distort"
EFFECT_CATEGORY = "distortion"

PARAMS: dict = {
    "amplitude": {
        "type": "float",
        "min": 0.0,
        "max": 50.0,
        "default": 10.0,
        "label": "Amplitude",
    },
    "frequency": {
        "type": "float",
        "min": 0.1,
        "max": 10.0,
        "default": 2.0,
        "label": "Frequency",
    },
    "direction": {
        "type": "choice",
        "choices": ["horizontal", "vertical"],
        "default": "horizontal",
        "label": "Direction",
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
    """Apply sinusoidal wave displacement. Stateless."""
    amplitude = float(params.get("amplitude", 10.0))
    frequency = float(params.get("frequency", 2.0))
    direction = params.get("direction", "horizontal")

    amplitude = max(0.0, min(50.0, amplitude))
    frequency = max(0.1, min(10.0, frequency))

    if amplitude == 0.0:
        return frame.copy(), None

    h, w = frame.shape[:2]
    output = np.zeros_like(frame)

    if direction == "horizontal":
        # Displace each row horizontally by a sine wave based on y position
        for y in range(h):
            shift = int(amplitude * np.sin(2 * np.pi * frequency * y / h))
            output[y] = np.roll(frame[y], shift, axis=0)
    else:
        # Displace each column vertically by a sine wave based on x position
        for x in range(w):
            shift = int(amplitude * np.sin(2 * np.pi * frequency * x / w))
            output[:, x] = np.roll(frame[:, x], shift, axis=0)

    return output, None
