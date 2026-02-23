"""Wave Distort effect — sinusoidal displacement of pixels.

Vectorized using numpy fancy indexing to replace the per-row Python loops
that blocked the ZMQ server at 1080p (BUG-4). Integer shifts via fancy
indexing match the original np.roll behavior exactly and process 1080p
in ~40ms vs 200-500ms with the original for-loop.
"""

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
        "curve": "exponential",
        "unit": "px",
        "description": "Wave displacement size — small values give subtle ripple",
    },
    "frequency": {
        "type": "float",
        "min": 0.1,
        "max": 10.0,
        "default": 2.0,
        "label": "Frequency",
        "curve": "logarithmic",
        "unit": "Hz",
        "description": "Number of wave cycles across the frame",
    },
    "direction": {
        "type": "choice",
        "options": ["horizontal", "vertical"],
        "default": "horizontal",
        "label": "Direction",
        "description": "Wave displacement direction",
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
    """Apply sinusoidal wave displacement. Stateless.

    Uses vectorized fancy indexing to shift rows/columns by integer offsets.
    This matches the original np.roll semantics exactly (integer truncation
    of the sinusoidal shift) while eliminating the per-row Python loop.
    """
    amplitude = float(params.get("amplitude", 10.0))
    frequency = float(params.get("frequency", 2.0))
    direction = params.get("direction", "horizontal")

    amplitude = max(0.0, min(50.0, amplitude))
    frequency = max(0.1, min(10.0, frequency))

    if amplitude == 0.0:
        return frame.copy(), None

    h, w = frame.shape[:2]

    if direction == "horizontal":
        # Compute integer shift per row (vectorized, matching original int() truncation)
        y_indices = np.arange(h)
        shifts = (amplitude * np.sin(2 * np.pi * frequency * y_indices / h)).astype(
            np.intp
        )
        # Build source column lookup: output[y, x] = frame[y, (x - shift[y]) % w]
        col_indices = np.arange(w)
        src_cols = (col_indices[np.newaxis, :] - shifts[:, np.newaxis]) % w
        output = frame[np.arange(h)[:, np.newaxis], src_cols]
    else:
        # Compute integer shift per column (vectorized)
        x_indices = np.arange(w)
        shifts = (amplitude * np.sin(2 * np.pi * frequency * x_indices / w)).astype(
            np.intp
        )
        # Build source row lookup: output[y, x] = frame[(y - shift[x]) % h, x]
        row_indices = np.arange(h)
        src_rows = (row_indices[:, np.newaxis] - shifts[np.newaxis, :]) % h
        output = frame[src_rows, np.arange(w)[np.newaxis, :]]

    return output, None
