"""Audio follower operator — generates 0.0-1.0 signals from audio analysis."""

import math

import numpy as np


def evaluate_audio(
    pcm: np.ndarray | None,
    method: str,
    params: dict,
    sample_rate: int,
    state_in: dict | None = None,
) -> tuple[float, dict]:
    """Evaluate audio follower at a given frame.

    Args:
        pcm: Audio samples for the current frame window (mono float32).
             None if no audio is available.
        method: Analysis method — 'rms', 'frequency_band', or 'onset'.
        params: Method-specific parameters.
        sample_rate: Audio sample rate in Hz.
        state_in: Persistent state (for onset detection).

    Returns:
        (value, state_out) where value is 0.0-1.0.
    """
    state = dict(state_in) if state_in else {}

    if pcm is None or len(pcm) == 0:
        return 0.0, state

    # Ensure float
    pcm = pcm.astype(np.float32)

    if method == "rms":
        value = _evaluate_rms(pcm, params)
    elif method == "frequency_band":
        value = _evaluate_frequency_band(pcm, params, sample_rate)
    elif method == "onset":
        value, state = _evaluate_onset(pcm, params, sample_rate, state)
    else:
        value = 0.0

    # Clamp
    if not math.isfinite(value):
        return 0.0, state
    return max(0.0, min(1.0, value)), state


def _evaluate_rms(pcm: np.ndarray, params: dict) -> float:
    """RMS envelope follower."""
    window = int(params.get("window", len(pcm)))
    window = max(1, min(window, len(pcm)))
    samples = pcm[-window:]
    rms = float(np.sqrt(np.mean(samples**2)))
    # Scale: full-scale sine has RMS ~0.707, normalize so it maps close to 1.0
    sensitivity = float(params.get("sensitivity", 1.4))
    return rms * sensitivity


def _evaluate_frequency_band(pcm: np.ndarray, params: dict, sample_rate: int) -> float:
    """Energy in a specific frequency band via FFT."""
    low_hz = float(params.get("low_hz", 20))
    high_hz = float(params.get("high_hz", 200))

    if low_hz >= high_hz or sample_rate <= 0:
        return 0.0

    # FFT
    n = len(pcm)
    if n == 0:
        return 0.0
    spectrum = np.abs(np.fft.rfft(pcm))
    freqs = np.fft.rfftfreq(n, d=1.0 / sample_rate)

    # Band energy
    mask = (freqs >= low_hz) & (freqs <= high_hz)
    if not np.any(mask):
        return 0.0

    # Share of total energy that falls inside the band. Bounded 0..1 by
    # construction, so disjoint bands behave like shares of one whole.
    #
    # This previously divided the band's MEAN per-bin energy by the spectrum's
    # MEAN per-bin energy. That is a bin-density ratio, not a proportion, and it
    # is unbounded: because the high end of a musical spectrum is nearly silent,
    # it dragged the denominator down until every musically-relevant band
    # exceeded 1.0 and clamped. Every band then read a constant 1.000 — a dead
    # modulation control. Pure-tone tests missed it (one bin holds all the energy,
    # so the ratio is large either way); broadband material exposed it.
    band_energy = float(np.sum(spectrum[mask] ** 2))
    total_energy = float(np.sum(spectrum**2))

    if total_energy <= 0:
        return 0.0

    # sensitivity is a plain gain on the proportion. Default 1.0 maps "all the
    # energy is in this band" to full scale; the old 4.0 exists only to
    # compensate for the broken denominator above and would re-introduce
    # saturation for any band holding more than a quarter of the energy.
    sensitivity = float(params.get("sensitivity", 1.0))
    return (band_energy / total_energy) * sensitivity


def _evaluate_onset(
    pcm: np.ndarray, params: dict, sample_rate: int, state: dict
) -> tuple[float, dict]:
    """Onset / transient detection via spectral flux."""
    n = len(pcm)
    if n == 0:
        return 0.0, state

    spectrum = np.abs(np.fft.rfft(pcm))
    prev_spectrum = state.get("prev_spectrum")

    if prev_spectrum is None or len(prev_spectrum) != len(spectrum):
        state["prev_spectrum"] = spectrum.tolist()
        return 0.0, state

    prev = np.array(prev_spectrum)
    # Spectral flux: sum of positive differences
    diff = spectrum - prev
    flux = float(np.sum(np.maximum(diff, 0)))

    # Express flux as a PROPORTION of the frame's own magnitude, so the reading
    # is "how much of this frame is new energy" rather than "how loud is it".
    #
    # Raw flux scales with absolute level: measured on real audio it runs in the
    # hundreds (mean 603, max 2406), so the old `flux * 0.1` sat far above the
    # 0.5 threshold on every frame and the detector reported a constant 1.000 —
    # it fired continuously, carrying no transient information. Normalizing also
    # makes a quiet passage's transients register the same as a loud one's.
    magnitude = float(np.sum(spectrum))
    if magnitude <= 0.0:
        state["prev_spectrum"] = spectrum.tolist()
        return 0.0, state

    sensitivity = float(params.get("sensitivity", 1.0))
    threshold = float(params.get("threshold", 0.5))
    value = (flux / magnitude) * sensitivity

    # Apply threshold: below threshold = 0
    if value < threshold:
        value = 0.0

    state["prev_spectrum"] = spectrum.tolist()
    return value, state
