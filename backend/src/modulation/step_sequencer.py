"""Step sequencer operator — generates 0.0-1.0 values from a step grid."""

import math


def evaluate_step_seq(
    steps: list[float],
    rate_hz: float,
    frame_index: int,
    fps: float,
) -> float:
    """Evaluate step sequencer at a given frame.

    Args:
        steps: List of step values (0.0-1.0 each).
        rate_hz: Cycle rate in Hz (one full pass through all steps per cycle).
        frame_index: Current frame number.
        fps: Frames per second.

    Returns:
        Current step value (0.0-1.0).
    """
    if not steps:
        return 0.0
    if not math.isfinite(rate_hz) or rate_hz <= 0:
        return 0.0
    if not math.isfinite(fps) or fps <= 0:
        return 0.0

    # rate_hz = cycles/sec through all steps. Multiply by step count to get step rate.
    position = frame_index / fps * rate_hz * len(steps)
    step_index = int(position) % len(steps)
    value = steps[step_index]

    # Clamp
    if not math.isfinite(value):
        return 0.0
    return max(0.0, min(1.0, value))
