"""Sidechain operator — amplitude-follow modulation source (P4.3).

A sidechain operator follows the amplitude (RMS envelope) of an audio signal,
exactly like the audio follower's ``rms`` method — it NEVER reimplements RMS,
it delegates to the shared ``evaluate_audio(method='rms')`` kernel
(audio_follower.py).

v1 DESCOPE — PROJECT AUDIO ONLY: a sidechain conceptually keys off a *specific*
track's audio. Per-track PCM plumbing (routing one track's samples to this
operator) is not yet wired through the render pipeline. So ``source_track_id`` is
an ACCEPTED-BUT-UNUSED reserved field: it is read, logged once, and otherwise
ignored. The operator falls back to the project audio PCM the engine already
passes in. See ``# TODO(P4-followup)`` below.

Trust boundary (numeric-trust-boundary rule): EVERY numeric param crossing in
(``sensitivity``) is type/NaN/Inf guarded. Bad input degrades to a safe default
and NEVER raises. A non-string ``source_track_id`` is ignored without crashing.
"""

import logging
import math

from modulation.audio_follower import evaluate_audio

logger = logging.getLogger(__name__)

DEFAULT_SENSITIVITY = 1.4  # mirrors audio_follower _evaluate_rms default


def _finite(value: object, default: float) -> float:
    """Coerce *value* to a finite float, else *default* (NaN/Inf/bool/type safe)."""
    if isinstance(value, bool):  # bool is an int subclass; reject explicitly.
        return default
    if not isinstance(value, (int, float)):
        return default
    f = float(value)
    if not math.isfinite(f):
        return default
    return f


def evaluate_sidechain(
    pcm,
    params: dict,
    sample_rate: int,
    state_in: dict | None = None,
) -> tuple[float, dict]:
    """Evaluate a sidechain (amplitude follower) at a given frame.

    Args:
        pcm: Audio samples for the current frame window (mono float32), or None.
             v1: this is the PROJECT audio — per-track PCM is not yet plumbed.
        params: Operator parameters. Recognized keys:
            ``sensitivity``: RMS scale factor (NaN/Inf/type → default). Forwarded
                to the shared RMS kernel.
            ``source_track_id``: RESERVED — accepted but UNUSED in v1 (see module
                docstring). A non-None value triggers a one-time info log.
        sample_rate: Audio sample rate in Hz.
        state_in: Persistent state (threaded through evaluate_audio + the
            one-time-log rate-limit latch).

    Returns:
        (value, state_out) where value is 0.0-1.0.
    """
    state = dict(state_in) if state_in else {}

    # --- reserved field: source_track_id (accepted-but-UNUSED in v1) ----------
    # TODO(P4-followup): per-track PCM plumbing — route the named track's samples
    # to this operator instead of falling back to project audio. Until then this
    # field is read for forward-compat but does not change behavior.
    source_track_id = params.get("source_track_id", None)
    if source_track_id is not None and not state.get("_track_id_logged", False):
        # One-time, rate-limited via state — NEVER logged per-frame.
        logger.info(
            "sidechain.source_track_id=%r set but per-track PCM is not yet "
            "plumbed (P4-followup); falling back to project audio.",
            source_track_id,
        )
        state["_track_id_logged"] = True

    # --- numeric trust gate: sensitivity --------------------------------------
    sensitivity = _finite(
        params.get("sensitivity", DEFAULT_SENSITIVITY), DEFAULT_SENSITIVITY
    )

    # Delegate to the shared RMS kernel — never reimplement RMS here.
    rms_params = {"sensitivity": sensitivity}
    if "window" in params:
        rms_params["window"] = params["window"]

    # Thread the audio_follower sub-state separately so the one-time-log latch
    # (lives on the top-level state) is not clobbered by the kernel's state dict.
    audio_state = state.get("_audio", {})
    value, audio_state = evaluate_audio(
        pcm=pcm,
        method="rms",
        params=rms_params,
        sample_rate=sample_rate,
        state_in=audio_state,
    )
    state["_audio"] = audio_state if isinstance(audio_state, dict) else {}

    return value, state
