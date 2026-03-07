"""Resonant Filter — IIR filter sweep on pixel values."""

import numpy as np

EFFECT_ID = "fx.resonant_filter"
EFFECT_NAME = "Resonant Filter"
EFFECT_CATEGORY = "modulation"

PARAMS: dict = {
    "cutoff": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.5,
        "label": "Cutoff",
        "curve": "linear",
        "unit": "",
        "description": "Filter cutoff frequency (0 = low, 1 = high)",
    },
    "resonance": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.5,
        "label": "Resonance",
        "curve": "linear",
        "unit": "",
        "description": "Filter resonance / Q factor",
    },
    "mode": {
        "type": "choice",
        "options": ["lowpass", "highpass", "bandpass"],
        "default": "lowpass",
        "label": "Mode",
        "description": "Filter type",
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
    """Resonant filter sweep on spatial frequencies."""
    cutoff = max(0.0, min(1.0, float(params.get("cutoff", 0.5))))
    resonance = max(0.0, min(1.0, float(params.get("resonance", 0.5))))
    mode = str(params.get("mode", "lowpass"))

    alpha = frame[:, :, 3:4]
    rgb = frame[:, :, :3]

    state = dict(state_in) if state_in else {}

    h, w = rgb.shape[:2]
    fy = np.fft.fftfreq(h)[:, np.newaxis]
    fx = np.fft.fftfreq(w)[np.newaxis, :]
    radius = np.sqrt(fx**2 + fy**2)

    # Map cutoff to frequency range
    cutoff_freq = 0.01 + cutoff * 0.45
    q = 5.0 + resonance * 295.0  # Q from 5 to 300
    gain = 1.0 + resonance * 5.0  # Resonance peak gain

    # Build filter response
    if mode == "lowpass":
        base = np.exp(-(radius**2) * q * 0.5 / max(cutoff_freq**2, 1e-6))
        resonance_peak = np.exp(-((radius - cutoff_freq) ** 2) * q) * gain
        filt = base + resonance_peak
    elif mode == "highpass":
        base = 1.0 - np.exp(-(radius**2) * q * 0.5 / max(cutoff_freq**2, 1e-6))
        resonance_peak = np.exp(-((radius - cutoff_freq) ** 2) * q) * gain
        filt = base + resonance_peak
    else:  # bandpass
        filt = np.exp(-((radius - cutoff_freq) ** 2) * q) * gain

    # Normalize filter to prevent blowup
    filt = filt / max(np.max(filt), 1e-6) * (1.0 + gain * 0.2)

    result = np.zeros_like(rgb, dtype=np.float32)
    for ch in range(3):
        fft = np.fft.fft2(rgb[:, :, ch].astype(np.float32))
        result[:, :, ch] = np.real(np.fft.ifft2(fft * filt))

    # Store IIR state for continuity
    prev = state.get("prev_output")
    if prev is not None and prev.shape == result.shape:
        iir_mix = resonance * 0.3
        result = result * (1.0 - iir_mix) + prev * iir_mix

    state["prev_output"] = result.copy()

    out_rgb = np.clip(result, 0, 255).astype(np.uint8)
    return np.concatenate([out_rgb, alpha], axis=2), state
