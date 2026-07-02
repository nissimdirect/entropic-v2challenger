"""DSP Phaser — video, channel, and brightness phaser modes."""

import numpy as np

EFFECT_ID = "fx.dsp_phaser"
EFFECT_NAME = "DSP Phaser"
EFFECT_CATEGORY = "modulation"

PARAMS: dict = {
    "mode": {
        "type": "choice",
        "options": ["video_phaser", "channel_phaser", "brightness_phaser"],
        "default": "video_phaser",
        "label": "Mode",
        "description": "Phaser algorithm",
    },
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
        "max": 12,
        "default": 4,
        "label": "Stages",
        "description": "Number of all-pass stages (video mode)",
        "curve": "linear",
        "unit": "",
    },
    "depth": {
        "type": "float",
        "min": 0.1,
        "max": 5.0,
        "default": 1.0,
        "label": "Depth",
        "curve": "linear",
        "unit": "",
        "description": "Sweep range (video mode)",
    },
    "offset": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.3,
        "label": "Offset",
        "curve": "linear",
        "unit": "",
        "description": "Per-channel phase offset (channel mode)",
    },
    "band_width": {
        "type": "float",
        "min": 0.05,
        "max": 0.5,
        "default": 0.2,
        "label": "Band Width",
        "curve": "linear",
        "unit": "",
        "description": "Inversion band width (brightness mode)",
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
    """DSP phaser — FFT phase sweep, per-channel offset, or brightness bands."""
    mode = str(params.get("mode", "video_phaser"))

    alpha = frame[:, :, 3:4]
    rgb = frame[:, :, :3]

    if mode == "video_phaser":
        return _video_phaser(rgb, alpha, params, frame_index)
    elif mode == "channel_phaser":
        return _channel_phaser(rgb, alpha, params, frame_index)
    else:  # brightness_phaser
        return _brightness_phaser(rgb, alpha, params, frame_index)


def _video_phaser(
    rgb: np.ndarray,
    alpha: np.ndarray,
    params: dict,
    frame_index: int,
) -> tuple[np.ndarray, dict | None]:
    rate = max(0.05, min(2.0, float(params.get("rate", 0.3))))
    stages = max(2, min(12, int(params.get("stages", 4))))
    depth = max(0.1, min(5.0, float(params.get("depth", 1.0))))

    f = rgb.astype(np.float32)
    result = np.zeros_like(f)
    phase = frame_index * rate * 0.1
    sweep = np.sin(2.0 * np.pi * phase) * depth

    for ch in range(3):
        channel = f[:, :, ch]
        freq = np.fft.fft(channel, axis=1)
        w = channel.shape[1]
        freqs = np.fft.fftfreq(w)

        phase_shift = np.zeros(w)
        for stage in range(stages):
            center = 0.1 + (stage / max(stages, 1)) * 0.4 + sweep * 0.1
            notch = np.exp(-((np.abs(freqs) - center) ** 2) / (0.02 + stage * 0.01))
            phase_shift += notch * np.pi

        shifted = freq * np.exp(1j * phase_shift[np.newaxis, :])
        result[:, :, ch] = np.real(np.fft.ifft(shifted, axis=1))

    mixed = (f + result) / 2.0
    out_rgb = np.clip(mixed, 0, 255).astype(np.uint8)
    return np.concatenate([out_rgb, alpha], axis=2), None


def _channel_phaser(
    rgb: np.ndarray,
    alpha: np.ndarray,
    params: dict,
    frame_index: int,
) -> tuple[np.ndarray, dict | None]:
    offset = max(0.0, min(1.0, float(params.get("offset", 0.3))))
    rate = max(0.05, min(2.0, float(params.get("rate", 0.3))))

    f = rgb.astype(np.float32)
    result = np.zeros_like(f)
    h, w = f.shape[:2]
    fy = np.fft.fftfreq(h)[:, np.newaxis]
    fx = np.fft.fftfreq(w)[np.newaxis, :]
    radius = np.sqrt(fx**2 + fy**2)

    phase = frame_index * rate * 0.1
    channel_rates = [1.0, 1.0 + offset, 1.0 + offset * 2.0]

    for ch in range(3):
        ch_sweep = np.sin(2.0 * np.pi * phase * channel_rates[ch])
        freq = np.fft.fft2(f[:, :, ch])
        phase_shift = np.zeros_like(radius)
        for stage in range(4):
            center = 0.02 + stage * 0.05 + ch_sweep * 0.06
            ring = np.exp(-((radius - center) ** 2) / 0.002)
            phase_shift += ring * np.pi * 2.0
        freq = freq * np.exp(1j * phase_shift)
        result[:, :, ch] = np.real(np.fft.ifft2(freq))

    mixed = f * 0.5 + result * 0.5
    out_rgb = np.clip(mixed, 0, 255).astype(np.uint8)
    return np.concatenate([out_rgb, alpha], axis=2), None


def _brightness_phaser(
    rgb: np.ndarray,
    alpha: np.ndarray,
    params: dict,
    frame_index: int,
) -> tuple[np.ndarray, dict | None]:
    rate = max(0.05, min(2.0, float(params.get("rate", 0.3))))
    band_width = max(0.05, min(0.5, float(params.get("band_width", 0.2))))

    f = rgb.astype(np.float32)
    brightness = np.mean(f, axis=2, keepdims=True) / 255.0

    phase = frame_index * rate * 0.1
    sweep = np.sin(2.0 * np.pi * phase) * 0.3

    bands = 6
    band_spacing = 0.9 / max(bands, 1)
    transfer = brightness.copy()

    for band in range(bands):
        center = 0.05 + band * band_spacing + sweep
        mask = np.exp(-((brightness - center) ** 2) / (2 * band_width**2))
        transfer = transfer * (1.0 - mask * 0.8) + (1.0 - brightness) * mask * 0.8

    # F-0514-15: np.where evaluates BOTH branches, so `transfer / brightness`
    # produced runtime warnings (divide by zero / invalid value) on all-black
    # frames even though the where-mask masked them out. np.divide with the
    # `where=` clause skips the dangerous slots entirely and seeds them from
    # `out=`, eliminating both the warning AND any latent NaN/Inf leaks.
    scale = np.divide(
        transfer,
        brightness,
        out=np.ones_like(transfer),
        where=brightness > 0.005,
    )
    out_rgb = np.clip(f * scale, 0, 255).astype(np.uint8)
    return np.concatenate([out_rgb, alpha], axis=2), None
