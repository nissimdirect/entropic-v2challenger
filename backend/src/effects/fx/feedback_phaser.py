"""Feedback Phaser — complex feedback chain phaser with escalation."""

import numpy as np

EFFECT_ID = "fx.feedback_phaser"
EFFECT_NAME = "Feedback Phaser"
EFFECT_CATEGORY = "modulation"

PARAMS: dict = {
    "rate": {
        "type": "float",
        "min": 0.05,
        "max": 2.0,
        "default": 0.3,
        "label": "Rate",
        "curve": "linear",
        "unit": "Hz",
        "description": "Sweep speed",
    },
    "stages": {
        "type": "int",
        "min": 2,
        "max": 8,
        "default": 4,
        "label": "Stages",
        "description": "Number of all-pass stages",
        "curve": "linear",
        "unit": "",
    },
    "feedback": {
        "type": "float",
        "min": 0.0,
        "max": 0.8,
        "default": 0.4,
        "label": "Feedback",
        "curve": "linear",
        "unit": "",
        "description": "Self-feed amount (above 0.6 = self-oscillation territory)",
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
    """Feedback phaser — self-feeding 2D FFT phase sweep."""
    rate = max(0.05, min(2.0, float(params.get("rate", 0.3))))
    stages = max(2, min(8, int(params.get("stages", 4))))
    feedback = max(0.0, min(0.8, float(params.get("feedback", 0.4))))

    alpha = frame[:, :, 3:4]
    rgb = frame[:, :, :3]

    state = dict(state_in) if state_in else {}

    f = rgb.astype(np.float32)

    # Mix with previous output for feedback
    prev = state.get("prev_output")
    if prev is not None and prev.shape == f.shape and feedback > 0:
        f = f * (1.0 - feedback) + prev * feedback

    h, w = f.shape[:2]
    fy = np.fft.fftfreq(h)[:, np.newaxis]
    fx = np.fft.fftfreq(w)[np.newaxis, :]
    radius = np.sqrt(fx**2 + fy**2)

    # Escalating depth based on frame_index
    depth = min(5.0, 1.0 + frame_index * 0.01)
    phase = frame_index * rate * 0.1
    sweep = np.sin(2.0 * np.pi * phase) * depth

    result = np.zeros_like(f)
    for ch in range(3):
        freq = np.fft.fft2(f[:, :, ch])
        phase_shift = np.zeros_like(radius)
        for stage in range(stages):
            center = 0.03 + stage * 0.06 + sweep * 0.03
            ring = np.exp(-((radius - center) ** 2) / 0.002)
            phase_shift += ring * np.pi * 1.8
        freq = freq * np.exp(1j * phase_shift)
        result[:, :, ch] = np.real(np.fft.ifft2(freq))

    output = f * 0.25 + result * 0.75
    state["prev_output"] = np.clip(output, 0, 255)

    out_rgb = np.clip(output, 0, 255).astype(np.uint8)
    return np.concatenate([out_rgb, alpha], axis=2), state
