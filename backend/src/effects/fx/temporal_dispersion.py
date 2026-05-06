"""Temporal Dispersion — frozen frame buffer with phase-rotated FFT mix.

temporal_crystal × spectral_freeze × Disperse-style phase rotation. A rolling
ring of frozen frames; each one's spectrum is rotated by a phase proportional
to its buffer position, then weighted by an envelope curve and summed. Time
stops, but the frequencies keep walking.

Frankenstein recipe:
- `effects/fx/temporal_crystal.py` — state machine for capture/hold of N frozen frames
- `effects/fx/spectral_freeze.py` — per-channel `np.fft.rfft2`, magnitude/phase split
- `effects/fx/reaction_diffusion.py` — PARAMS pattern with clamping at the boundary
- Brain stem: phase shift `θ(i) = (i / N) * max_phase_rad` per buffered frame

Algorithm (per render):
1. Push current frame's RGB onto a deque of size `buffer_size`.
2. For each frame in the buffer: rfft2 each channel → rotate phase by θ(i)
   → irfft2 → weight by envelope curve(i, N) → sum.
3. Divide by sum of weights → energy-preserving mix.
4. Blend with original frame by `intensity`.

State: `state["frame_buffer"]: list[np.ndarray]`, `state["resolution"]: (h, w)`.
Reset on dimension change. Ring is FIFO with maxlen = `buffer_size`.

PLAY-005: every numeric param clamped at the trust boundary.
PLAY-002: derived state (resolution) recomputed from current frame.
"""

from collections import deque

import numpy as np

EFFECT_ID = "fx.temporal_dispersion"
EFFECT_NAME = "Temporal Dispersion"
EFFECT_CATEGORY = "modulation"

PARAMS: dict = {
    "buffer_size": {
        "type": "int",
        "min": 2,
        "max": 32,
        "default": 8,
        "label": "Buffer Size",
        "curve": "linear",
        "unit": "",
        "description": "Number of frozen frames to combine",
    },
    "max_phase_rad": {
        "type": "float",
        "min": 0.0,
        "max": 6.28,
        "default": 1.57,
        "label": "Max Phase",
        "curve": "linear",
        "unit": "rad",
        "description": "Total phase rotation across the buffer",
    },
    "curve": {
        "type": "choice",
        "options": ["hann", "linear", "exp", "triangle"],
        "default": "hann",
        "label": "Curve",
        "description": "Frame-weight envelope across the buffer",
    },
    "intensity": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.7,
        "label": "Intensity",
        "curve": "linear",
        "unit": "%",
        "description": "Wet/dry blend between dispersed and original",
    },
    "mode": {
        "type": "choice",
        "options": ["all_channels", "luma_only"],
        "default": "all_channels",
        "label": "Mode",
        "description": "Apply phase rotation to all RGB channels or luma only",
    },
}


def _weight_envelope(n: int, mode: str) -> np.ndarray:
    """Build a length-n weight curve. Always strictly positive (sum > 0)."""
    if n <= 1:
        return np.ones(1, dtype=np.float32)
    if mode == "linear":
        # Ramp from small to 1.0 — newer frames dominate but oldest still contributes.
        w = np.linspace(0.1, 1.0, n, dtype=np.float32)
    elif mode == "exp":
        # Exponential decay toward older frames; newest frame weighted highest.
        idx = np.arange(n, dtype=np.float32)
        w = np.exp(idx / max(1, n - 1) * 2.0)
    elif mode == "triangle":
        # Symmetric triangle peaking at the middle of the buffer.
        half = (n - 1) / 2.0
        w = 1.0 - np.abs(np.arange(n, dtype=np.float32) - half) / max(half, 1.0)
        w = np.maximum(w, 0.05)  # floor so sum stays positive
    else:  # hann (default)
        # Hann window — smooth, centered, energy-preserving feel.
        w = 0.5 - 0.5 * np.cos(2.0 * np.pi * np.arange(n) / max(1, n - 1))
        w = np.maximum(w, 0.05).astype(np.float32)
    return w


def _phase_rotate_channel(ch_f32: np.ndarray, phase: float) -> np.ndarray:
    """rfft2 → constant phase shift across all bins → irfft2."""
    spec = np.fft.rfft2(ch_f32)
    rotated = spec * np.exp(1j * phase)
    out = np.fft.irfft2(rotated, s=ch_f32.shape)
    return out.astype(np.float32)


def apply(
    frame: np.ndarray,
    params: dict,
    state_in: dict | None = None,
    *,
    frame_index: int,
    seed: int,
    resolution: tuple[int, int],
) -> tuple[np.ndarray, dict | None]:
    """Phase-rotated frozen-frame buffer mix."""
    # PLAY-005: clamp every numeric param at the trust boundary
    buffer_size = max(2, min(32, int(params.get("buffer_size", 8))))
    max_phase_rad = max(0.0, min(6.28, float(params.get("max_phase_rad", 1.57))))
    intensity = max(0.0, min(1.0, float(params.get("intensity", 0.7))))
    curve = str(params.get("curve", "hann"))
    if curve not in {"hann", "linear", "exp", "triangle"}:
        curve = "hann"
    mode = str(params.get("mode", "all_channels"))
    if mode not in {"all_channels", "luma_only"}:
        mode = "all_channels"

    h, w = frame.shape[:2]
    rgb = frame[:, :, :3]
    alpha = frame[:, :, 3:4]
    _ = (frame_index, seed, resolution)  # part of contract; not used

    # Initialize / restore frame buffer (deque). Reset on dimension change.
    state = dict(state_in) if state_in else {}
    prev_res = state.get("resolution")
    buf = state.get("frame_buffer")
    if (
        buf is None
        or not isinstance(buf, deque)
        or prev_res != (h, w)
        or buf.maxlen != buffer_size
    ):
        buf = deque(maxlen=buffer_size)

    buf.append(rgb.copy())
    state["frame_buffer"] = buf
    state["resolution"] = (h, w)

    # IDENTITY_BY_DEFAULT: fewer than 2 frames buffered → pass through unchanged.
    # Also pass through if intensity is 0.
    if len(buf) < 2 or intensity <= 0.0:
        return frame.copy(), state

    n = len(buf)
    weights = _weight_envelope(n, curve)
    weight_sum = float(np.sum(weights))
    if weight_sum <= 0.0:
        return frame.copy(), state

    # Sum phase-rotated frames weighted by envelope.
    out = np.zeros((h, w, 3), dtype=np.float32)
    for i, fr in enumerate(buf):
        phase = (i / max(1, n - 1)) * max_phase_rad
        weight = float(weights[i])
        fr_f = fr.astype(np.float32)

        if mode == "luma_only":
            # Compute luma → phase rotate → re-broadcast as displacement on each channel.
            luma = 0.299 * fr_f[:, :, 0] + 0.587 * fr_f[:, :, 1] + 0.114 * fr_f[:, :, 2]
            rotated_luma = _phase_rotate_channel(luma, phase)
            delta = (rotated_luma - luma)[:, :, np.newaxis]
            rotated = fr_f + delta
        else:
            rotated = np.empty_like(fr_f)
            for c in range(3):
                rotated[:, :, c] = _phase_rotate_channel(fr_f[:, :, c], phase)

        out += rotated * weight

    out /= weight_sum  # energy-preserving mix

    # Wet/dry blend
    cur_f = rgb.astype(np.float32)
    blended = cur_f * (1.0 - intensity) + out * intensity
    out_rgb = np.clip(blended, 0, 255).astype(np.uint8)

    return np.concatenate([out_rgb, alpha], axis=2), state
