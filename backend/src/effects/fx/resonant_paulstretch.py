"""ResonantPaulstretch — frozen 2D-FFT magnitude swept by a biquad on the radial axis.

Frankenstein recipe:
- `effects/fx/spectral_freeze.py` — capture & hold magnitude, apply with live phase.
- `effects/fx/resonant_filter.py` — IIR biquad on spatial frequencies (Q sweep).
- combination: the IIR runs on the held magnitude bins along the radial frequency
  axis of the FFT, not on pixel rows. Optional phase jitter per-frame keeps a held
  still image visibly "ringing" — paulstretch's infinite-stretch crossed with a Moog
  filter, in pixel space.

Algorithm:
  1. Build/refresh frozen luma magnitude + phase (rfft2) when freeze toggles or refresh fires.
  2. Compute radial frequency r = sqrt(kx**2 + ky**2) per bin.
  3. Apply biquad-shape (lowpass / bandpass / highpass / notch / peak) along the radial
     axis to the frozen magnitude.
  4. Optionally jitter phase per-frame for "ringing" pulsations.
  5. Optional feedback: mag_{t+1} = mag_t + filtered_t * feedback (clamped) — true
     infinite ring.
  6. IFFT back to luma; chroma kept from the input frame.
"""

from __future__ import annotations

import numpy as np

EFFECT_ID = "fx.resonant_paulstretch"
EFFECT_NAME = "Resonant Paulstretch"
EFFECT_CATEGORY = "modulation"


PARAMS: dict = {
    "freeze_now": {
        "type": "choice",
        "options": ["true", "false"],
        "default": "true",
        "label": "Freeze",
        "description": "Hold the captured spectrum (toggle off to clear)",
    },
    "refresh": {
        "type": "choice",
        "options": ["true", "false"],
        "default": "false",
        "label": "Refresh",
        "description": "Snap a fresh spectrum on the next frame",
    },
    "cutoff_norm": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.3,
        "label": "Cutoff",
        "curve": "linear",
        "unit": "",
        "description": "Normalized radial cutoff (peak / corner frequency)",
    },
    "resonance_q": {
        "type": "float",
        "min": 0.5,
        "max": 30.0,
        "default": 5.0,
        "label": "Q",
        "curve": "linear",
        "unit": "",
        "description": "Resonance Q — high Q = ringing single band",
    },
    "filter_mode": {
        "type": "choice",
        "options": ["lowpass", "bandpass", "highpass", "notch", "peak"],
        "default": "peak",
        "label": "Mode",
        "description": "Biquad shape on the radial magnitude axis",
    },
    "sweep_lfo_rate": {
        "type": "float",
        "min": 0.0,
        "max": 5.0,
        "default": 0.2,
        "label": "Sweep Rate",
        "curve": "linear",
        "unit": "Hz",
        "description": "Self-sweep LFO on cutoff (cycles per second @ 30fps)",
    },
    "phase_jitter": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.1,
        "label": "Phase Jitter",
        "curve": "linear",
        "unit": "",
        "description": "Per-frame uniform phase scramble (0 = static)",
    },
    "feedback_resonance": {
        "type": "float",
        "min": 0.0,
        "max": 0.95,
        "default": 0.0,
        "label": "Feedback",
        "curve": "linear",
        "unit": "",
        "description": "Recirculate filtered magnitude into next frame's freeze",
    },
    "mix": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 1.0,
        "label": "Mix",
        "curve": "linear",
        "unit": "",
        "description": "Wet/dry blend (0 = passthrough)",
    },
}


_FILTER_MODES = ("lowpass", "bandpass", "highpass", "notch", "peak")
_MAG_CLAMP = 1.0e9  # hard clip to prevent feedback runaway → inf
_FEEDBACK_HARD_MAX = 0.95


def _radial_filter_curve(
    radius: np.ndarray,
    cutoff: float,
    q: float,
    mode: str,
) -> np.ndarray:
    """1D-style biquad-flavored gain across the 2D radial axis.

    Returns a (h, w/2+1) gain map applied multiplicatively to magnitude bins.
    Cutoff is normalized to [0, ~0.5] (Nyquist on radial axis).
    """
    # Map cutoff_norm 0..1 → useful spatial range. Avoid the DC bin.
    fc = max(1.0e-4, min(0.5, 0.005 + cutoff * 0.495))
    # Bandwidth shrinks as Q grows.
    bw = max(1.0e-4, fc / max(q, 0.5))

    if mode == "lowpass":
        # Smooth roll-off + resonant peak at fc.
        roll = 1.0 / (1.0 + (radius / fc) ** (2.0 * max(q, 1.0)))
        peak = np.exp(-((radius - fc) ** 2) / (2.0 * bw * bw)) * (q / 5.0)
        gain = roll + peak
    elif mode == "highpass":
        roll = 1.0 - 1.0 / (1.0 + (radius / fc) ** (2.0 * max(q, 1.0)))
        peak = np.exp(-((radius - fc) ** 2) / (2.0 * bw * bw)) * (q / 5.0)
        gain = roll + peak
    elif mode == "bandpass":
        gain = np.exp(-((radius - fc) ** 2) / (2.0 * bw * bw))
    elif mode == "notch":
        gain = 1.0 - np.exp(-((radius - fc) ** 2) / (2.0 * bw * bw))
    else:  # peak
        # Unity floor + resonant boost at fc.
        boost = q / 5.0
        gain = 1.0 + boost * np.exp(-((radius - fc) ** 2) / (2.0 * bw * bw))

    # Always protect DC bin so global brightness doesn't drift.
    gain = np.where(radius < 1.0e-6, 1.0, gain)
    # Scrub any non-finite values from edge cases (q≈0, fc≈0).
    return np.nan_to_num(gain, nan=1.0, posinf=1.0, neginf=0.0).astype(np.float32)


def _luma_from_rgb(rgb: np.ndarray) -> np.ndarray:
    """ITU-R BT.601 luma."""
    r = rgb[:, :, 0].astype(np.float32)
    g = rgb[:, :, 1].astype(np.float32)
    b = rgb[:, :, 2].astype(np.float32)
    return 0.299 * r + 0.587 * g + 0.114 * b


def apply(
    frame: np.ndarray,
    params: dict,
    state_in: dict | None = None,
    *,
    frame_index: int,
    seed: int,
    resolution: tuple[int, int],
) -> tuple[np.ndarray, dict | None]:
    """Resonant paulstretch on a frozen 2D-FFT magnitude (radial-axis biquad)."""
    # PLAY-001 / PLAY-005: clamp every numeric param at the trust boundary.
    freeze_now = str(params.get("freeze_now", "true")).lower() == "true"
    refresh = str(params.get("refresh", "false")).lower() == "true"
    cutoff = max(0.0, min(1.0, float(params.get("cutoff_norm", 0.3))))
    q = max(0.5, min(30.0, float(params.get("resonance_q", 5.0))))
    mode = str(params.get("filter_mode", "peak"))
    if mode not in _FILTER_MODES:
        mode = "peak"
    lfo_rate = max(0.0, min(5.0, float(params.get("sweep_lfo_rate", 0.2))))
    phase_jitter = max(0.0, min(1.0, float(params.get("phase_jitter", 0.1))))
    feedback = max(
        0.0, min(_FEEDBACK_HARD_MAX, float(params.get("feedback_resonance", 0.0)))
    )
    mix = max(0.0, min(1.0, float(params.get("mix", 1.0))))

    h, w = frame.shape[:2]
    rgb = frame[:, :, :3]
    alpha = frame[:, :, 3:4]

    state = dict(state_in) if state_in else {}

    # If freeze is off: clear stale state and pass through. (Reset on off→on cycle.)
    if not freeze_now:
        state.pop("frozen_mag", None)
        state.pop("frozen_phase", None)
        state.pop("filtered_mag", None)
        state.pop("ref_shape", None)
        return frame.copy(), state

    # Detect resolution change → invalidate frozen spectrum.
    ref_shape = state.get("ref_shape")
    if ref_shape is not None and tuple(ref_shape) != (h, w):
        state.pop("frozen_mag", None)
        state.pop("frozen_phase", None)
        state.pop("filtered_mag", None)

    # Tiny frames: rfft2 is meaningless for 1×1 / 2×2; fall back to passthrough but
    # still allow tests to seed a state dict so contract holds.
    if h < 4 or w < 4:
        state["ref_shape"] = (h, w)
        return frame.copy(), state

    luma = _luma_from_rgb(rgb)

    # Capture / refresh frozen spectrum.
    frozen_mag = state.get("frozen_mag")
    frozen_phase = state.get("frozen_phase")
    if frozen_mag is None or frozen_phase is None or refresh:
        spec = np.fft.rfft2(luma)
        frozen_mag = np.abs(spec).astype(np.float32)
        frozen_phase = np.angle(spec).astype(np.float32)
        state["frozen_mag"] = frozen_mag
        state["frozen_phase"] = frozen_phase
        state["ref_shape"] = (h, w)

    # Build radial coordinate grid for rfft2 layout: shape (h, w/2+1).
    fy = np.fft.fftfreq(h)[:, np.newaxis]
    # rfft uses non-negative half of the spectrum on the last axis.
    fx_full = np.fft.fftfreq(w)
    fx = fx_full[: w // 2 + 1][np.newaxis, :]
    radius = np.sqrt(fx * fx + fy * fy).astype(np.float32)

    # Optional self-sweep LFO on cutoff. Frame-rate-independent at ~30fps assumption.
    if lfo_rate > 0.0:
        # Triangle/sine LFO ±10% around the user-set cutoff.
        sweep = 0.5 + 0.5 * np.sin(2.0 * np.pi * lfo_rate * frame_index / 30.0)
        cutoff_eff = max(0.0, min(1.0, cutoff * 0.9 + sweep * 0.1))
    else:
        cutoff_eff = cutoff

    gain = _radial_filter_curve(radius, cutoff_eff, q, mode)

    # Apply filter on frozen magnitude.
    filtered_mag = frozen_mag * gain
    filtered_mag = np.clip(filtered_mag, 0.0, _MAG_CLAMP)

    # Feedback: blend filtered into frozen magnitude for next call. Clamp + soft cap.
    if feedback > 0.0:
        new_frozen = frozen_mag + filtered_mag * feedback
        # Soft compress max bin energy so a runaway resonance doesn't blow up.
        peak = float(np.max(new_frozen)) if new_frozen.size else 0.0
        if peak > _MAG_CLAMP:
            new_frozen = new_frozen * (_MAG_CLAMP / peak)
        state["frozen_mag"] = np.clip(new_frozen, 0.0, _MAG_CLAMP).astype(np.float32)

    # Per-frame phase: optionally scramble for "ringing" evolution.
    if phase_jitter > 0.0:
        rng = np.random.default_rng((int(seed) ^ int(frame_index)) & 0xFFFFFFFF)
        jitter = rng.uniform(
            -phase_jitter * np.pi,
            phase_jitter * np.pi,
            size=frozen_phase.shape,
        ).astype(np.float32)
        phase_t = frozen_phase + jitter
    else:
        phase_t = frozen_phase

    # IFFT back to luma.
    spec_out = filtered_mag.astype(np.complex64) * np.exp(
        1j * phase_t.astype(np.float32)
    )
    luma_out = np.fft.irfft2(spec_out, s=(h, w)).astype(np.float32)

    # Replace luma in input frame: shift = (luma_out - luma_in), apply equally to RGB.
    luma_diff = luma_out - luma
    out_rgb = rgb.astype(np.float32) + luma_diff[:, :, np.newaxis]

    # Wet/dry mix.
    if mix < 1.0:
        out_rgb = rgb.astype(np.float32) * (1.0 - mix) + out_rgb * mix

    out_rgb = np.clip(
        np.nan_to_num(out_rgb, nan=0.0, posinf=255.0, neginf=0.0), 0.0, 255.0
    )
    out_u8 = out_rgb.astype(np.uint8)

    return np.concatenate([out_u8, alpha], axis=2), state
