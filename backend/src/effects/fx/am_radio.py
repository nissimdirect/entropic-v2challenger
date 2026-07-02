"""AM Radio — amplitude modulation interference bands on pixel rows."""

import numpy as np

EFFECT_ID = "fx.am_radio"
EFFECT_NAME = "AM Radio"
EFFECT_CATEGORY = "modulation"

PARAMS: dict = {
    "carrier_freq": {
        "type": "float",
        "min": 1.0,
        "max": 100.0,
        "default": 10.0,
        "label": "Carrier Freq",
        "curve": "logarithmic",
        "unit": "Hz",
        "description": "Number of bands across frame height",
    },
    "depth": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.8,
        "label": "Depth",
        "curve": "linear",
        "unit": "%",
        "description": "Modulation depth",
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
    """AM radio interference — sine carrier on pixel rows, animated."""
    carrier_freq = max(1.0, min(100.0, float(params.get("carrier_freq", 10.0))))
    depth = max(0.0, min(1.0, float(params.get("depth", 0.8))))

    rgb = frame[:, :, :3]
    alpha = frame[:, :, 3:4]
    h = rgb.shape[0]

    phase = frame_index * 0.15
    rows = np.arange(h, dtype=np.float32)
    carrier = (
        1.0
        - depth
        + depth * (0.5 + 0.5 * np.sin(2.0 * np.pi * carrier_freq * rows / h + phase))
    )
    carrier = carrier.reshape(-1, 1, 1)

    result = np.clip(rgb.astype(np.float32) * carrier, 0, 255).astype(np.uint8)
    output = np.concatenate([result, alpha], axis=2)
    return output, None
