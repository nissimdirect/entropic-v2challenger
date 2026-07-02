"""Ring Mod — multiply frame by a carrier signal (AM/FM/phase modulation)."""

import numpy as np

EFFECT_ID = "fx.ring_mod"
EFFECT_NAME = "Ring Mod"
EFFECT_CATEGORY = "modulation"

PARAMS: dict = {
    "frequency": {
        "type": "float",
        "min": 0.5,
        "max": 50.0,
        "default": 4.0,
        "label": "Frequency",
        "curve": "logarithmic",
        "unit": "Hz",
        "description": "Carrier frequency (cycles across frame)",
    },
    "depth": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 1.0,
        "label": "Depth",
        "curve": "linear",
        "unit": "%",
        "description": "Modulation depth",
    },
    "direction": {
        "type": "choice",
        "options": ["horizontal", "vertical", "radial"],
        "default": "horizontal",
        "label": "Direction",
        "description": "Carrier wave direction",
    },
    "waveform": {
        "type": "choice",
        "options": ["sine", "square", "triangle", "saw"],
        "default": "sine",
        "label": "Waveform",
        "description": "Carrier wave shape",
    },
}


def _waveform(theta: np.ndarray, shape: str) -> np.ndarray:
    """Generate carrier waveform in [0, 1] range."""
    if shape == "square":
        return (np.sin(theta) >= 0).astype(np.float32)
    elif shape == "triangle":
        return np.abs(2.0 * (theta / (2.0 * np.pi) % 1.0) - 1.0).astype(np.float32)
    elif shape == "saw":
        return (theta / (2.0 * np.pi) % 1.0).astype(np.float32)
    else:
        return (0.5 + 0.5 * np.sin(theta)).astype(np.float32)


def apply(
    frame: np.ndarray,
    params: dict,
    state_in: dict | None = None,
    *,
    frame_index: int,
    seed: int,
    resolution: tuple[int, int],
) -> tuple[np.ndarray, dict | None]:
    """Ring modulation — multiply pixels by carrier signal."""
    frequency = max(0.5, min(50.0, float(params.get("frequency", 4.0))))
    depth = max(0.0, min(1.0, float(params.get("depth", 1.0))))
    direction = str(params.get("direction", "horizontal"))
    waveform = str(params.get("waveform", "sine"))

    rgb = frame[:, :, :3]
    alpha = frame[:, :, 3:4]
    h, w = rgb.shape[:2]

    phase = frame_index * 0.1

    if direction == "vertical":
        coords = np.arange(h, dtype=np.float32).reshape(-1, 1)
        theta = np.broadcast_to(2.0 * np.pi * frequency * coords / h + phase, (h, w))
    elif direction == "radial":
        cy, cx = h / 2.0, w / 2.0
        y = np.arange(h, dtype=np.float32).reshape(-1, 1) - cy
        x = np.arange(w, dtype=np.float32).reshape(1, -1) - cx
        dist = np.sqrt(x**2 + y**2)
        max_dist = np.sqrt(cx**2 + cy**2) + 0.01
        theta = 2.0 * np.pi * frequency * dist / max_dist + phase
    else:
        coords = np.arange(w, dtype=np.float32).reshape(1, -1)
        theta = np.broadcast_to(2.0 * np.pi * frequency * coords / w + phase, (h, w))

    carrier = _waveform(theta.astype(np.float32), waveform)
    carrier = (1.0 - depth) + depth * carrier
    carrier = carrier[:, :, np.newaxis]

    result = np.clip(rgb.astype(np.float32) * carrier, 0, 255).astype(np.uint8)
    output = np.concatenate([result, alpha], axis=2)
    return output, None
