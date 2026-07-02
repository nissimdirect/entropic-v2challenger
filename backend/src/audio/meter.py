"""Audio meter — RMS + sample peak + clipping detection per PCM window.

F-0516-6 (parallel session UAT 2026-05-16): the Audio Gain knob ships
with no metering. User asked for "a number AND a meter showing clipping
etc rms peak per Ableton". This module provides the pure math; the
frontend GainMeter component reads {rms_db, peak_db, clipped} and the
IPC handler in zmq_server.py exposes it under cmd="audio_meter".

dBFS reference: 1.0 (full scale) = 0 dBFS. Silence (RMS=0) is reported
as METER_FLOOR_DB = -120 dBFS (matches Ableton/Logic convention — avoids
-inf in displays and gives a sensible bottom-of-scale visual).

Sample-peak (not true-peak) for v1. True-peak (1.7770-style 4× oversample)
is a later polish if requested — most clipping is sample-peak audible.
"""

from __future__ import annotations

import math
from typing import TypedDict

import numpy as np

# Visual floor — anything quieter reports as this. -120 dBFS is below the
# noise floor of 16-bit audio, so it represents "true silence" in practice.
METER_FLOOR_DB: float = -120.0

# Clipping threshold — Ableton/Logic latch the LED at any sample whose
# absolute value reaches digital full-scale.
CLIP_THRESHOLD: float = 1.0


class MeterReading(TypedDict):
    rms_db: float
    peak_db: float
    clipped: bool


def _linear_to_db(value: float) -> float:
    """Convert a linear amplitude (0..1) to dBFS, clamped at METER_FLOOR_DB."""
    if value <= 0.0:
        return METER_FLOOR_DB
    db = 20.0 * math.log10(value)
    if not math.isfinite(db) or db < METER_FLOOR_DB:
        return METER_FLOOR_DB
    return db


def compute_meter(pcm: np.ndarray) -> MeterReading:
    """Compute RMS, sample-peak, and clipping for a PCM window.

    Args:
        pcm: 1-D or 2-D float32/float64 array. 2-D is (samples, channels);
             the meter aggregates across all channels (worst-case peak,
             RMS across all samples).

    Returns:
        {"rms_db": float, "peak_db": float, "clipped": bool}

    Trust boundary: non-numeric or empty input returns the floor reading
    rather than raising — render-loop callers must not crash on bad data.
    """
    # Coerce to numpy float; defend against None/list/non-array inputs.
    try:
        arr = np.asarray(pcm, dtype=np.float64)
    except (TypeError, ValueError):
        return {"rms_db": METER_FLOOR_DB, "peak_db": METER_FLOOR_DB, "clipped": False}

    if arr.size == 0:
        return {"rms_db": METER_FLOOR_DB, "peak_db": METER_FLOOR_DB, "clipped": False}

    # NaN/Inf scrub — any non-finite sample drops to 0 for the math.
    finite_mask = np.isfinite(arr)
    if not finite_mask.all():
        arr = np.where(finite_mask, arr, 0.0)

    abs_arr = np.abs(arr)
    peak = float(abs_arr.max())
    rms = float(np.sqrt(np.mean(arr * arr)))

    return {
        "rms_db": _linear_to_db(rms),
        "peak_db": _linear_to_db(peak),
        "clipped": peak >= CLIP_THRESHOLD,
    }
