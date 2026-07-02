"""Frequency Mosh — datamosh's flow-accumulator architecture in the FFT domain.

Pixel datamosh moves *pixels* via accumulated optical flow.
Frequency Mosh moves *frequency content* — bins drift around the spectrum,
producing wide-band warping artifacts that have no pixel-domain analog.

Frankenstein recipe:
- `effects/fx/datamosh.py` — flow-accumulator architecture (deque + persistent flow).
- `effects/fx/spectral_freeze.py` — per-channel `fft2` per frame.
- `effects/fx/dsp_flange::_freq_flanger` — spectral cross-frame blending.

Algorithm:
1. luma (or per-channel) -> rfft2 -> spec
2. push spec to ring buffer; if <2 frames buffered -> identity (seed state).
3. compute "spectral flow" via phase correlation between consecutive specs
   -> integer (dy, dx) bin shift estimate.
4. warp current spec by flow_field via bilinear interpolation in bin space.
5. optional accumulator with persistence decay (the "P-frames in FFT" mode).
6. irfft2 -> luma_out, clamp -> apply_luma -> output.

PLAY-005: every numeric param clamped at the trust boundary.
"""

import numpy as np

EFFECT_ID = "fx.frequency_mosh"
EFFECT_NAME = "Frequency Mosh"
EFFECT_CATEGORY = "destruction"

PARAMS: dict = {
    "buffer_size": {
        "type": "int",
        "min": 2,
        "max": 16,
        "default": 4,
        "label": "Buffer Size",
        "curve": "linear",
        "unit": "frames",
        "description": "Spectral history depth — how many past spectra are retained",
    },
    "strength": {
        "type": "float",
        "min": 0.0,
        "max": 10.0,
        "default": 1.0,
        "label": "Strength",
        "curve": "exponential",
        "unit": "bins",
        "description": "Bin-displacement magnitude — higher = more aggressive frequency drift",
    },
    "accumulate": {
        "type": "choice",
        "options": ["true", "false"],
        "default": "false",
        "label": "Accumulate",
        "description": "Persist flow across frames (true datamosh-in-FFT behavior)",
    },
    "persistence": {
        "type": "float",
        "min": 0.0,
        "max": 0.99,
        "default": 0.7,
        "label": "Persistence",
        "curve": "linear",
        "unit": "",
        "description": "Accumulator decay (only when accumulate=true) — higher = longer flow memory",
    },
    "band_focus": {
        "type": "choice",
        "options": ["all", "low", "mid", "high"],
        "default": "all",
        "label": "Band Focus",
        "description": "Which frequency band moshes — 'low' blurs heavily, 'high' damages edges",
    },
    "mode": {
        "type": "choice",
        "options": ["luma", "rgb"],
        "default": "luma",
        "label": "Mode",
        "description": "luma = 3x faster, color preserved. rgb = per-channel (chroma drift)",
    },
    "mix": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.7,
        "label": "Mix",
        "curve": "linear",
        "unit": "%",
        "description": "Wet/dry blend",
    },
}


# Luma weights (BT.601)
_LUMA_R = 0.299
_LUMA_G = 0.587
_LUMA_B = 0.114


def _rgb_to_luma(rgb: np.ndarray) -> np.ndarray:
    """RGB uint8 (h,w,3) -> luma float32 (h,w)."""
    r = rgb[:, :, 0].astype(np.float32)
    g = rgb[:, :, 1].astype(np.float32)
    b = rgb[:, :, 2].astype(np.float32)
    return _LUMA_R * r + _LUMA_G * g + _LUMA_B * b


def _apply_luma(rgb: np.ndarray, new_luma: np.ndarray) -> np.ndarray:
    """Replace luma in RGB while preserving chroma (Y'CbCr-style remap).

    Uses ratio scaling: new_rgb = rgb * (new_luma / old_luma). Falls back to
    monochrome where old_luma is near zero to avoid division noise.
    """
    rgb_f = rgb.astype(np.float32)
    old_luma = (
        _LUMA_R * rgb_f[:, :, 0] + _LUMA_G * rgb_f[:, :, 1] + _LUMA_B * rgb_f[:, :, 2]
    )
    # Avoid divide-by-zero. Where old_luma is dark, use monochrome (new_luma).
    safe = np.maximum(old_luma, 1e-3)
    ratio = new_luma / safe
    out = rgb_f * ratio[:, :, np.newaxis]
    # Where source was effectively black, fall back to grayscale of new_luma.
    dark = old_luma < 1.0
    out[dark, 0] = new_luma[dark]
    out[dark, 1] = new_luma[dark]
    out[dark, 2] = new_luma[dark]
    return out


def _phase_correlation_shift(
    spec_prev: np.ndarray, spec_cur: np.ndarray
) -> tuple[float, float]:
    """Estimate integer (dy, dx) bin-shift between two 2D rfft2 spectra via phase correlation.

    Returns (dy, dx) in spectrum-bin units. The shift is wrapped to be the
    smaller-magnitude representative (centered around 0).
    """
    # Cross-power spectrum, normalized
    cross = spec_cur * np.conj(spec_prev)
    mag = np.abs(cross)
    cross_norm = cross / (mag + 1e-8)

    # Inverse FFT to get phase-correlation surface in image-space.
    # We need full irfft2 with original spatial shape — but we only have rfft2.
    # Use irfft2 with target shape derived from the rfft2 size.
    # rfft2 of (H, W) -> (H, W//2 + 1). We'll use the H from spec.
    h = spec_cur.shape[0]
    w_full = (spec_cur.shape[1] - 1) * 2
    if w_full <= 0:
        return 0.0, 0.0
    pc = np.fft.irfft2(cross_norm, s=(h, w_full))
    # Peak position
    flat_idx = int(np.argmax(pc))
    dy_raw, dx_raw = divmod(flat_idx, w_full)
    # Wrap to centered representation
    dy = dy_raw - h if dy_raw > h // 2 else dy_raw
    dx = dx_raw - w_full if dx_raw > w_full // 2 else dx_raw
    return float(dy), float(dx)


def _warp_spec_by_shift(spec: np.ndarray, dy: float, dx: float) -> np.ndarray:
    """Warp a complex 2D spectrum by bilinear-interpolated bin shift (dy, dx).

    Uses np.roll for integer parts and a bilinear blend for fractional shifts.
    Roll wraps — that's the spectrum-domain analog of macroblock shift wrap-around.
    """
    if dy == 0.0 and dx == 0.0:
        return spec.copy()

    iy, fy = int(np.floor(dy)), float(dy - np.floor(dy))
    ix, fx = int(np.floor(dx)), float(dx - np.floor(dx))

    # 4 integer-shifted copies for bilinear corners
    s00 = np.roll(spec, shift=(iy, ix), axis=(0, 1))
    s10 = np.roll(spec, shift=(iy + 1, ix), axis=(0, 1))
    s01 = np.roll(spec, shift=(iy, ix + 1), axis=(0, 1))
    s11 = np.roll(spec, shift=(iy + 1, ix + 1), axis=(0, 1))

    # Bilinear blend (treats complex as 2-vector componentwise; valid for linear ops)
    out = (
        s00 * (1.0 - fy) * (1.0 - fx)
        + s10 * fy * (1.0 - fx)
        + s01 * (1.0 - fy) * fx
        + s11 * fy * fx
    )
    return out


def _band_mask(shape: tuple[int, int], band: str) -> np.ndarray | None:
    """Build a soft 2D band mask sized for an rfft2 spectrum (h, w_rfft).

    Spectrum bin 0 = DC = lowest freq; bins toward Nyquist = highest. We use
    radial distance from (0, 0) in the rfft2 grid (k=0 corner is DC).
    Returns None for 'all' (no masking — caller skips multiplication).
    """
    if band == "all":
        return None
    h, w = shape
    ky = np.fft.fftfreq(h).reshape(h, 1)  # signed, range [-0.5, 0.5)
    kx = np.fft.rfftfreq(2 * (w - 1) if w > 1 else 2).reshape(1, w)  # [0, 0.5]
    ky_abs = np.abs(ky)
    radius = np.sqrt(ky_abs * ky_abs + kx * kx)  # 0 at DC, sqrt(0.5) at corner
    # Normalize to [0,1]
    rmax = float(np.max(radius)) if radius.size else 1.0
    if rmax <= 0:
        return None
    rn = radius / rmax  # 0=DC, 1=corner
    if band == "low":
        # Emphasis where rn small. Smoothstep falloff.
        m = np.clip(1.0 - rn / 0.33, 0.0, 1.0)
    elif band == "high":
        m = np.clip((rn - 0.5) / 0.5, 0.0, 1.0)
    else:  # mid
        # Bandpass centered at rn=0.4
        m = np.clip(1.0 - np.abs(rn - 0.4) / 0.25, 0.0, 1.0)
    return m.astype(np.float32)


def apply(
    frame: np.ndarray,
    params: dict,
    state_in: dict | None = None,
    *,
    frame_index: int,
    seed: int,
    resolution: tuple[int, int],
) -> tuple[np.ndarray, dict | None]:
    """FrequencyMosh: warp spectrum bins by phase-correlation flow across a buffer.

    Returns identity on the first frame (seeds state). Once buffer has >=2
    spectra, the spectral flow drives bin warps that bleed into image space
    via IFFT.
    """
    # PLAY-005: clamp every numeric param at the trust boundary.
    buffer_size = max(2, min(16, int(params.get("buffer_size", 4))))
    strength = max(0.0, min(10.0, float(params.get("strength", 1.0))))
    accumulate = str(params.get("accumulate", "false")).lower() == "true"
    persistence = max(0.0, min(0.99, float(params.get("persistence", 0.7))))
    band = str(params.get("band_focus", "all"))
    if band not in {"all", "low", "mid", "high"}:
        band = "all"
    mode = str(params.get("mode", "luma"))
    if mode not in {"luma", "rgb"}:
        mode = "luma"
    mix = max(0.0, min(1.0, float(params.get("mix", 0.7))))

    h, w = frame.shape[:2]
    rgb = frame[:, :, :3]
    alpha = frame[:, :, 3:4]
    _ = (frame_index, seed, resolution)  # part of contract; not used here

    # ---- Initialize / restore state ----
    if state_in is None:
        spec_buffer: list[np.ndarray] = []
        accumulator = None
        prev_shape: tuple[int, int] | None = None
    else:
        spec_buffer = list(state_in.get("spec_buffer") or [])
        accumulator = state_in.get("accumulator")
        prev_shape = state_in.get("frame_shape")

    # Resolution change -> flush buffer + accumulator.
    if prev_shape is not None and prev_shape != (h, w):
        spec_buffer = []
        accumulator = None

    # ---- Compute current spectrum (luma or per-channel) ----
    if mode == "luma":
        luma = _rgb_to_luma(rgb)
        spec_cur: np.ndarray | tuple = np.fft.rfft2(luma)
    else:  # rgb
        ch_specs = []
        for ch in range(3):
            ch_specs.append(np.fft.rfft2(rgb[:, :, ch].astype(np.float32)))
        spec_cur = tuple(ch_specs)  # tuple of 3 complex arrays

    # ---- Buffer management ----
    spec_buffer.append(spec_cur)
    if len(spec_buffer) > buffer_size:
        spec_buffer = spec_buffer[-buffer_size:]

    # ---- Identity-by-default: need >=2 frames to compute flow ----
    if len(spec_buffer) < 2:
        state_out = {
            "spec_buffer": spec_buffer,
            "accumulator": accumulator,
            "frame_shape": (h, w),
        }
        return frame.copy(), state_out

    # ---- Compute spectral flow via phase correlation (consecutive specs) ----
    # Use luma representative even in RGB mode to get a single shift estimate.
    if mode == "luma":
        prev_repr = spec_buffer[-2]
        cur_repr = spec_buffer[-1]
    else:
        # Use channel 1 (G ~ luma proxy) as the shift estimator for RGB mode
        prev_repr = spec_buffer[-2][1]
        cur_repr = spec_buffer[-1][1]

    dy, dx = _phase_correlation_shift(prev_repr, cur_repr)

    # Scale by strength (bins of displacement)
    flow_dy = dy * strength
    flow_dx = dx * strength

    # ---- Optional accumulator (datamosh-style persistent flow in FFT domain) ----
    if accumulate:
        if accumulator is None:
            accumulator = (flow_dy, flow_dx)
        else:
            acc_dy, acc_dx = accumulator
            acc_dy = acc_dy * persistence + flow_dy
            acc_dx = acc_dx * persistence + flow_dx
            # Hard cap to prevent runaway: clamp accumulated bin shift to half of dim.
            cap_y = h // 2
            cap_x = max(2, (w // 2))
            acc_dy = max(-cap_y, min(cap_y, float(acc_dy)))
            acc_dx = max(-cap_x, min(cap_x, float(acc_dx)))
            accumulator = (acc_dy, acc_dx)
        warp_dy, warp_dx = accumulator
    else:
        warp_dy, warp_dx = flow_dy, flow_dx

    # ---- Warp current spectrum by flow ----
    if mode == "luma":
        moshed = _warp_spec_by_shift(spec_cur, warp_dy, warp_dx)
        # Optional band mask: only apply mosh in selected band.
        mask = _band_mask(spec_cur.shape, band)
        if mask is not None:
            moshed = spec_cur * (1.0 - mask) + moshed * mask
        luma_out = np.fft.irfft2(moshed, s=(h, w))
        luma_out = np.clip(luma_out, 0.0, 255.0)
        result_f = _apply_luma(rgb, luma_out)
    else:  # rgb mode — per-channel warp using same flow vector
        result_f = np.zeros_like(rgb, dtype=np.float32)
        for ch in range(3):
            moshed = _warp_spec_by_shift(spec_cur[ch], warp_dy, warp_dx)
            mask = _band_mask(spec_cur[ch].shape, band)
            if mask is not None:
                moshed = spec_cur[ch] * (1.0 - mask) + moshed * mask
            ch_out = np.fft.irfft2(moshed, s=(h, w))
            result_f[:, :, ch] = ch_out

    # ---- Wet/dry blend ----
    rgb_f = rgb.astype(np.float32)
    blended = result_f * mix + rgb_f * (1.0 - mix)
    out_rgb = np.clip(blended, 0.0, 255.0).astype(np.uint8)

    state_out = {
        "spec_buffer": spec_buffer,
        "accumulator": accumulator,
        "frame_shape": (h, w),
    }
    return np.concatenate([out_rgb, alpha], axis=2), state_out
