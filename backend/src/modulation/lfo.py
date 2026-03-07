"""LFO operator — generates 0.0-1.0 control signals from waveforms."""

import math
import hashlib


def evaluate_lfo(
    waveform: str,
    rate_hz: float,
    phase_offset: float,
    frame_index: int,
    fps: float,
    state_in: dict | None = None,
) -> tuple[float, dict]:
    """Evaluate LFO at a given frame.

    Args:
        waveform: One of sine, saw, square, triangle, random, noise, sample_hold.
        rate_hz: Frequency in Hz.
        phase_offset: Phase offset in radians (0 to 2*pi).
        frame_index: Current frame number.
        fps: Frames per second.
        state_in: Persistent state for random/S&H waveforms.

    Returns:
        (value, state_out) where value is 0.0-1.0.
    """
    state = dict(state_in) if state_in else {}

    # Guard: NaN/Inf rate or zero/negative rate
    if not math.isfinite(rate_hz) or rate_hz <= 0:
        return 0.0, state
    if not math.isfinite(fps) or fps <= 0:
        return 0.0, state

    # Phase position within cycle (0.0 to 1.0)
    frames_per_cycle = fps / rate_hz
    phase = ((frame_index / frames_per_cycle) + (phase_offset / (2 * math.pi))) % 1.0

    # Current cycle index (for random/S&H)
    cycle_index = int(frame_index / frames_per_cycle)

    if waveform == "sine":
        value = 0.5 + 0.5 * math.sin(2 * math.pi * phase)
    elif waveform == "saw":
        value = phase
    elif waveform == "square":
        value = 1.0 if phase < 0.5 else 0.0
    elif waveform == "triangle":
        value = 2.0 * phase if phase < 0.5 else 2.0 * (1.0 - phase)
    elif waveform == "random":
        # Same random value for entire cycle, changes each cycle
        last_cycle = state.get("last_random_cycle", -1)
        if cycle_index != last_cycle:
            # Deterministic random from cycle index for reproducibility
            h = hashlib.md5(f"lfo_random_{cycle_index}".encode()).hexdigest()
            state["last_random_value"] = int(h[:8], 16) / 0xFFFFFFFF
            state["last_random_cycle"] = cycle_index
        value = state.get("last_random_value", 0.0)
    elif waveform == "noise":
        # Different value every frame
        h = hashlib.md5(f"lfo_noise_{frame_index}".encode()).hexdigest()
        value = int(h[:8], 16) / 0xFFFFFFFF
    elif waveform == "sample_hold":
        # Hold value at start of each cycle
        last_sh_cycle = state.get("last_sh_cycle", -1)
        if cycle_index != last_sh_cycle:
            h = hashlib.md5(f"lfo_sh_{cycle_index}".encode()).hexdigest()
            state["last_sh_value"] = int(h[:8], 16) / 0xFFFFFFFF
            state["last_sh_cycle"] = cycle_index
        value = state.get("last_sh_value", 0.0)
    else:
        value = 0.0

    # Clamp to 0.0-1.0
    value = max(0.0, min(1.0, value))
    return value, state
