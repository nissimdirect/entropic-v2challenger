"""ADSR envelope operator — generates 0.0-1.0 control signals from trigger events."""

import math


def evaluate_envelope(
    trigger: bool,
    attack: float,
    decay: float,
    sustain: float,
    release: float,
    frame_index: int,
    state_in: dict | None = None,
) -> tuple[float, dict]:
    """Evaluate ADSR envelope at a given frame.

    Args:
        trigger: Whether the envelope is currently triggered (held).
        attack: Attack time in frames (>= 0).
        decay: Decay time in frames (>= 0).
        sustain: Sustain level (0.0-1.0).
        release: Release time in frames (>= 0).
        frame_index: Current frame number.
        state_in: Persistent state dict.

    Returns:
        (value, state_out) where value is 0.0-1.0.
    """
    state = dict(state_in) if state_in else {}

    # Guard NaN values
    attack = attack if math.isfinite(attack) else 0
    decay = decay if math.isfinite(decay) else 0
    sustain = max(0.0, min(1.0, sustain if math.isfinite(sustain) else 0))
    release = release if math.isfinite(release) else 0
    attack = max(0, attack)
    decay = max(0, decay)
    release = max(0, release)

    phase = state.get("phase", "idle")
    trigger_frame = state.get("trigger_frame", 0)
    release_frame = state.get("release_frame", 0)
    current_value = state.get("current_value", 0.0)
    release_start_value = state.get("release_start_value", 0.0)

    # Trigger edge detection
    was_triggered = state.get("was_triggered", False)

    if trigger and not was_triggered:
        # Rising edge — start attack
        phase = "attack"
        trigger_frame = frame_index
        state["was_triggered"] = True
    elif not trigger and was_triggered:
        # Falling edge — start release
        if phase != "idle":
            phase = "release"
            release_frame = frame_index
            release_start_value = current_value
        state["was_triggered"] = False

    # Evaluate current phase
    elapsed = frame_index - trigger_frame

    if phase == "attack":
        if attack <= 0:
            current_value = 1.0
            phase = "decay"
            trigger_frame = frame_index
            elapsed = 0
        else:
            t = elapsed / attack
            if t >= 1.0:
                current_value = 1.0
                phase = "decay"
                trigger_frame = frame_index
                elapsed = 0
            else:
                current_value = t

    if phase == "decay":
        decay_elapsed = frame_index - trigger_frame
        if decay <= 0:
            current_value = sustain
            phase = "sustain"
        else:
            t = decay_elapsed / decay
            if t >= 1.0:
                current_value = sustain
                phase = "sustain"
            else:
                current_value = 1.0 - (1.0 - sustain) * t

    if phase == "sustain":
        current_value = sustain

    if phase == "release":
        release_elapsed = frame_index - release_frame
        if release <= 0:
            current_value = 0.0
            phase = "idle"
        else:
            t = release_elapsed / release
            if t >= 1.0:
                current_value = 0.0
                phase = "idle"
            else:
                current_value = release_start_value * (1.0 - t)

    if phase == "idle":
        current_value = 0.0

    # Clamp
    current_value = max(0.0, min(1.0, current_value))

    state.update(
        {
            "phase": phase,
            "trigger_frame": trigger_frame,
            "release_frame": release_frame,
            "current_value": current_value,
            "release_start_value": release_start_value,
        }
    )

    return current_value, state
