"""Numeric safety utilities for trust boundaries."""

import math

import numpy as np


def sanitize_params(params: dict) -> dict:
    """Sanitize effect parameters at the trust boundary.

    Handles: Python float, numpy scalar, string-encoded NaN/Inf, bool passthrough.
    Returns clean dict with invalid values dropped (effect uses its default).
    """
    clean = {}
    for k, v in params.items():
        # numpy scalar -> Python native (arrays have ndim > 0, skip them)
        if isinstance(v, np.generic):
            v = v.item()
        # string -> check if it parses to NaN/Inf (DON'T convert type)
        if isinstance(v, str):
            try:
                f = float(v)
                if not math.isfinite(f):
                    continue  # drop "NaN", "Infinity", "-Infinity"
            except ValueError:
                pass  # genuine string param like "overlay"
        # float/int finiteness check (exclude bool -- bool is subclass of int)
        if (
            isinstance(v, (float, int))
            and not isinstance(v, bool)
            and not math.isfinite(v)
        ):
            continue
        clean[k] = v
    return clean


def clamp_finite(value, lo: float, hi: float, fallback: float) -> float:
    """Clamp to [lo, hi], returning fallback for NaN, Inf, or non-numeric input.

    Trust-boundary hardening: any caller may pass attacker-controlled data
    (e.g. a `.glitch` file with `effect.mix: "string"`). math.isfinite()
    raises TypeError on non-numeric input, which would crash the render
    pipeline on every frame. We catch that and fall back gracefully.
    """
    try:
        if not math.isfinite(value):
            return fallback
    except TypeError:
        # Non-numeric input (str, None, list, dict, etc.) → drop to fallback.
        return fallback
    return max(lo, min(hi, value))


def guard_positive(value: float, name: str) -> float:
    """Assert positive finite. Raises ValueError if not."""
    if not math.isfinite(value) or value <= 0:
        raise ValueError(f"{name} must be positive finite, got {value}")
    return value
