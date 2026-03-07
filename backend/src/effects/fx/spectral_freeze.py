"""Spectral Freeze — FFT freeze, hold spectral content."""

import numpy as np

EFFECT_ID = "fx.spectral_freeze"
EFFECT_NAME = "Spectral Freeze"
EFFECT_CATEGORY = "modulation"

PARAMS: dict = {
    "freeze_frame": {
        "type": "choice",
        "options": ["true", "false"],
        "default": "false",
        "label": "Freeze",
        "description": "Capture and hold current spectrum",
    },
    "mix": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.5,
        "label": "Mix",
        "curve": "linear",
        "unit": "",
        "description": "Blend between live and frozen spectrum",
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
    """FFT spectral freeze — hold magnitude spectrum, use live phase."""
    freeze = str(params.get("freeze_frame", "false")).lower() == "true"
    mix = max(0.0, min(1.0, float(params.get("mix", 0.5))))

    alpha = frame[:, :, 3:4]
    rgb = frame[:, :, :3]

    state = dict(state_in) if state_in else {}

    frozen = state.get("frozen_spectrum")

    # Capture spectrum when freeze is enabled and we don't have one yet
    if freeze and frozen is None:
        frozen_mags = []
        for ch in range(3):
            frozen_mags.append(np.abs(np.fft.fft2(rgb[:, :, ch].astype(np.float32))))
        state["frozen_spectrum"] = frozen_mags

    # Clear frozen spectrum when freeze is disabled
    if not freeze:
        state.pop("frozen_spectrum", None)
        return frame.copy(), state

    frozen = state.get("frozen_spectrum")
    if frozen is None:
        return frame.copy(), state

    # Apply frozen magnitude with live phase
    result = np.zeros_like(rgb, dtype=np.float32)
    for ch in range(3):
        cur_fft = np.fft.fft2(rgb[:, :, ch].astype(np.float32))
        cur_mag = np.abs(cur_fft)
        cur_phase = np.angle(cur_fft)

        if ch < len(frozen) and frozen[ch].shape == cur_mag.shape:
            blended_mag = cur_mag * (1.0 - mix) + frozen[ch] * mix
        else:
            blended_mag = cur_mag

        result[:, :, ch] = np.real(np.fft.ifft2(blended_mag * np.exp(1j * cur_phase)))

    out_rgb = np.clip(result, 0, 255).astype(np.uint8)
    return np.concatenate([out_rgb, alpha], axis=2), state
