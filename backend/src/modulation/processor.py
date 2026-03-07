"""Signal processing chain — transforms 0.0-1.0 values through processing steps."""

import math


def process_signal(value: float, chain: list[dict]) -> float:
    """Apply a chain of processing steps to a signal value.

    Args:
        value: Input signal (0.0-1.0).
        chain: List of processing steps, each with 'type' and 'params'.

    Returns:
        Processed value clamped to 0.0-1.0.
    """
    if not math.isfinite(value):
        value = 0.0

    for step in chain:
        step_type = step.get("type", "")
        params = step.get("params", {})

        if step_type == "threshold":
            value = _threshold(value, params)
        elif step_type == "smooth":
            value = _smooth(value, params)
        elif step_type == "quantize":
            value = _quantize(value, params)
        elif step_type == "invert":
            value = 1.0 - value
        elif step_type == "scale":
            value = _scale(value, params)

        # Guard per step
        if not math.isfinite(value):
            value = 0.0
        value = max(0.0, min(1.0, value))

    return value


def _threshold(value: float, params: dict) -> float:
    """Values below threshold become 0, above are scaled to fill 0-1 range."""
    level = float(params.get("level", 0.5))
    if value < level:
        return 0.0
    if level >= 1.0:
        return 0.0
    return (value - level) / (1.0 - level)


def _smooth(value: float, params: dict) -> float:
    """Slew rate limiting — blends with previous value."""
    # Note: smooth needs state to work properly across frames.
    # For single-call use, factor controls how much of input passes through.
    factor = float(params.get("factor", 0.5))
    factor = max(0.0, min(1.0, factor))
    prev = float(params.get("_prev", value))
    return prev + (value - prev) * factor


def _quantize(value: float, params: dict) -> float:
    """Snap to N discrete levels."""
    levels = int(params.get("levels", 4))
    if levels <= 1:
        return 0.0
    return round(value * (levels - 1)) / (levels - 1)


def _scale(value: float, params: dict) -> float:
    """Remap from [in_min, in_max] to [out_min, out_max]."""
    in_min = float(params.get("in_min", 0.0))
    in_max = float(params.get("in_max", 1.0))
    out_min = float(params.get("out_min", 0.0))
    out_max = float(params.get("out_max", 1.0))

    if in_max <= in_min:
        return out_min

    # Normalize to 0-1 within input range
    t = (value - in_min) / (in_max - in_min)
    t = max(0.0, min(1.0, t))
    return out_min + t * (out_max - out_min)
