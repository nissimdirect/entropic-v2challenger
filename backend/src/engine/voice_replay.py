"""P5a.4 — Pure Python mirror of the frontend voice FSM for export replay.

# MIRROR: voiceFSM.ts
This module is a LINE-FOR-LINE port of
``frontend/src/renderer/components/instruments/voiceFSM.ts``. The two
implementations MUST be mutated together — any change to the FSM semantics
(steal/choke/age/ADSR, voiceId derivation, illegal-transition handling) has to
land in BOTH files in the same change, pinned to the same golden vectors
(``backend/tests/fixtures/voice_fsm_golden.json``, dumped from the vitest
``voiceFSM.test.ts`` suite). The marker ``# MIRROR: voiceFSM.ts`` above is
lint-greppable so a reviewer can find the paired implementation.

PURITY CONTRACT (matches the TS module):
- No side effects, no mutable module state, no wall-clock, no ``performance.now()``.
- ``evaluate_voices(events, frame_index, opts)`` is referentially transparent:
  calling it twice with the same arguments returns deep-equal results.
- The deterministic replay key is ``(frameIndex, eventIndex)``; voiceId is
  derived purely from ``(instrumentId, triggerFrame, eventIndex)``.

State machine transitions (canonical table from phase-5a.md, identical to TS):
  T1: idle   + trigger, voices < cap  → attack  (append new voice)
  T2: idle   + trigger, voices == cap → attack  (steal oldest, then T1)
  T3: attack + elapsed >= attack+decay frames → sustain
  T4: attack + release event → release  (ramps from CURRENT envelope value)
  T5: sustain + release event → release (ramps sustainLevel→0)
  T6: release + elapsed >= release frames → idle (voice removed)
  T7: attack/sustain/release + stolen → idle (immediate, no release tail)
  T8: attack/sustain/release + choke sibling → idle (atomic, same frameIndex)
  T9: attack/sustain/release + panic → idle (all voices, all instruments)

Illegal transitions (dropped silently): idle→sustain, idle→release,
release→attack, release→sustain, sustain→attack.

VOICE-ID ENCODING NOTE (export-side parity with P5a.3 ``buildVoiceLayers``):
The FSM voiceId is ``voice:{instrumentId}:{triggerFrame}:{eventIndex}`` — full of
colons. The backend ``VOICE_ID_PATTERN`` (``security.py``) REJECTS colons, so the
state-cache key cannot use the raw voiceId. ``encode_voice_id`` mirrors
``buildVoiceLayers`` exactly: replace every ``:`` with ``_`` then truncate to 128
chars. The render-composite reuse path then keys per-voice state by
``voice:{encoded}`` (the handler prepends the ``voice:`` namespace), identical to
preview.
"""

from __future__ import annotations

import math
from typing import Any, TypedDict

# ---------------------------------------------------------------------------
# Types (mirror voiceFSM.ts TriggerEvent / Voice / EvaluateVoicesOpts)
# ---------------------------------------------------------------------------


class ADSR(TypedDict):
    attack: float
    decay: float
    sustain: float
    release: float


# Events and voices are plain dicts here (they arrive as JSON over IPC); the
# field contract matches the TS interfaces. We avoid dataclasses so the golden
# fixtures (raw JSON) compare directly.
TriggerEvent = dict[str, Any]
Voice = dict[str, Any]

MAX_VOICE_ID_LENGTH = 128


# ---------------------------------------------------------------------------
# Helpers (mirror voiceFSM.ts clampFinite / isValidEvent)
# ---------------------------------------------------------------------------


def _clamp_finite(
    v: float, lo: float, hi: float, fallback: float | None = None
) -> float:
    """Clamp v to [lo, hi]; return fallback (default lo) if v is non-finite.

    Mirrors voiceFSM.ts ``clampFinite``.
    """
    if fallback is None:
        fallback = lo
    if not isinstance(v, (int, float)) or isinstance(v, bool):
        return fallback
    if v != v or v in (float("inf"), float("-inf")):
        return fallback
    return min(hi, max(lo, v))


def _is_int(x: Any) -> bool:
    """JS ``Number.isInteger`` parity: finite, integral, not bool."""
    if isinstance(x, bool):
        return False
    if isinstance(x, int):
        return True
    if isinstance(x, float):
        return x == x and x not in (float("inf"), float("-inf")) and x == math.floor(x)
    return False


def _is_finite(x: Any) -> bool:
    if isinstance(x, bool):
        return False
    if isinstance(x, (int, float)):
        return x == x and x not in (float("inf"), float("-inf"))
    return False


def _is_valid_event(e: TriggerEvent) -> bool:
    """Mirror voiceFSM.ts ``isValidEvent`` — drop malformed events silently."""
    if not isinstance(e, dict):
        return False
    fi = e.get("frameIndex")
    ei = e.get("eventIndex")
    note = e.get("note")
    vel = e.get("velocity")
    return (
        _is_int(fi)
        and fi >= 0
        and _is_int(ei)
        and ei >= 0
        and _is_finite(note)
        and 0 <= note <= 127
        and _is_finite(vel)
        and 0 <= vel <= 127
    )


def encode_voice_id(voice_id: str) -> str:
    """Encode an FSM voiceId colon-free for the backend VOICE_ID_PATTERN.

    Mirror of P5a.3 ``buildVoiceLayers``:
        const rawId = voice.voiceId.replace(/:/g, '_')
        const voiceId = rawId.length <= 128 ? rawId : rawId.slice(0, 128)
    """
    raw = voice_id.replace(":", "_")
    return raw if len(raw) <= MAX_VOICE_ID_LENGTH else raw[:MAX_VOICE_ID_LENGTH]


# ---------------------------------------------------------------------------
# ADSR envelope (mirror voiceFSM.ts envelopeValue)
# ---------------------------------------------------------------------------


def envelope_value(voice: Voice, frame_index: int, adsr: ADSR) -> float:
    """Compute the ADSR envelope value (0–1) for a voice at a frame.

    Mirrors voiceFSM.ts ``envelopeValue`` exactly. Decay is an envelope segment
    inside the attack phase, NOT an FSM state.
    """
    elapsed = frame_index - voice["triggerFrame"]
    phase = voice["phase"]

    if phase == "attack":
        if adsr["attack"] > 0 and elapsed < adsr["attack"]:
            return _clamp_finite(elapsed / adsr["attack"], 0, 1)
        decay_elapsed = elapsed - adsr["attack"]
        if adsr["decay"] > 0 and decay_elapsed < adsr["decay"]:
            return _clamp_finite(
                1 - (decay_elapsed / adsr["decay"]) * (1 - adsr["sustain"]), 0, 1
            )
        return _clamp_finite(adsr["sustain"], 0, 1)

    if phase == "sustain":
        return _clamp_finite(adsr["sustain"], 0, 1)

    if phase == "release":
        release_elapsed = frame_index - voice["releaseFrame"]
        if adsr["release"] > 0 and release_elapsed < adsr["release"]:
            return _clamp_finite(
                voice["releaseStartValue"] * (1 - release_elapsed / adsr["release"]),
                0,
                1,
            )
        return 0.0

    return 0.0


# ---------------------------------------------------------------------------
# Phase advancement (mirror voiceFSM.ts advancePhases)
# ---------------------------------------------------------------------------


def _advance_phases(voices: list[Voice], up_to_frame: int, adsr: ADSR) -> list[Voice]:
    """Advance phase transitions for all voices up to up_to_frame.

    Mirrors voiceFSM.ts ``advancePhases``. Returns the surviving voices (idle =
    non-membership). Mutates voice dicts in place for the phase flip, exactly as
    the TS does, but the in/out arrays are distinct.
    """
    surviving: list[Voice] = []
    for voice in voices:
        phase = voice["phase"]
        if phase == "attack":
            elapsed = up_to_frame - voice["triggerFrame"]
            # T3: attack → sustain when elapsed >= attack + decay
            if elapsed >= adsr["attack"] + adsr["decay"]:
                voice["phase"] = "sustain"
            surviving.append(voice)
            continue
        if phase == "sustain":
            surviving.append(voice)
            continue
        if phase == "release":
            release_elapsed = up_to_frame - voice["releaseFrame"]
            # T6: release → idle when elapsed >= release frames
            if adsr["release"] <= 0 or release_elapsed >= adsr["release"]:
                continue
            surviving.append(voice)
            continue
    return surviving


# ---------------------------------------------------------------------------
# Core evaluator (mirror voiceFSM.ts evaluateVoices)
# ---------------------------------------------------------------------------


def evaluate_voices(
    events: list[TriggerEvent],
    frame_index: int,
    opts: dict[str, Any],
) -> list[Voice]:
    """Replay the voice FSM up to and including ``frame_index``.

    # MIRROR: voiceFSM.ts evaluateVoices

    PURE. Returns a new list of active voices (dicts). Same args → deep-equal
    result. ``opts`` carries ``voiceCap`` (int) and ``adsr`` (ADSR dict).

    Each returned voice carries the colon-FULL ``voiceId``
    (``voice:{instrumentId}:{triggerFrame}:{eventIndex}``) for parity with the
    TS golden vectors; callers that need a backend cache key use
    ``encode_voice_id``.
    """
    cap = max(1, int(opts.get("voiceCap", 4)))
    adsr: ADSR = opts["adsr"]

    voices: list[Voice] = []  # each voice carries internal "_chokeGroup"

    # Process events in order, only those <= frame_index. Stable sort by
    # (frameIndex, eventIndex) — identical to the TS comparator.
    relevant = [
        e for e in events if _is_valid_event(e) and e["frameIndex"] <= frame_index
    ]
    relevant.sort(key=lambda e: (e["frameIndex"], e["eventIndex"]))

    for event in relevant:
        ev_frame = event["frameIndex"]

        # Advance phase transitions up to ev_frame BEFORE applying this event.
        voices = _advance_phases(voices, ev_frame, adsr)

        kind = event.get("kind")

        if kind == "panic":
            # T9: all voices, all instruments → idle
            voices = []
            continue

        if kind == "choke":
            # T8: atomic choke — remove group siblings for this instrument
            group = event.get("chokeGroup")
            if group is not None:
                voices = [
                    v
                    for v in voices
                    if not (
                        v["instrumentId"] == event["instrumentId"]
                        and v["_chokeGroup"] == group
                    )
                ]
            continue

        if kind == "trigger":
            if len(voices) >= cap:
                # T2: steal victim = lowest triggerFrame, tie-break lowest eventIndex
                victim_idx = 0
                for i in range(1, len(voices)):
                    v = voices[i]
                    best = voices[victim_idx]
                    if v["triggerFrame"] < best["triggerFrame"] or (
                        v["triggerFrame"] == best["triggerFrame"]
                        and v["eventIndex"] < best["eventIndex"]
                    ):
                        victim_idx = i
                # T7 steal: immediate removal, no release tail
                voices.pop(victim_idx)

            # T1: append new voice in attack phase
            voice_id = f"voice:{event['instrumentId']}:{ev_frame}:{event['eventIndex']}"
            new_voice: Voice = {
                "voiceId": voice_id,
                "instrumentId": event["instrumentId"],
                "note": event["note"],
                "velocity": event["velocity"],
                "triggerFrame": ev_frame,
                "eventIndex": event["eventIndex"],
                "phase": "attack",
                "footagePos": 0,
                "releaseFrame": 0,
                "releaseStartValue": 0,
                "_chokeGroup": None,
            }
            choke_group = event.get("chokeGroup")
            if choke_group is not None:
                new_voice["_chokeGroup"] = choke_group
            voices.append(new_voice)
            continue

        if kind == "release":
            # T4/T5: release a matching active voice; unknown/idle = no-op.
            for voice in voices:
                if (
                    voice["instrumentId"] == event["instrumentId"]
                    and voice["note"] == event["note"]
                ):
                    if voice["phase"] in ("attack", "sustain"):
                        voice["releaseFrame"] = ev_frame
                        voice["releaseStartValue"] = envelope_value(
                            voice, ev_frame, adsr
                        )
                        voice["phase"] = "release"
                    # phase == 'release' already: illegal, drop silently.
            continue

    # Final phase advancement up to the query frame_index.
    voices = _advance_phases(voices, frame_index, adsr)

    # Sort ascending triggerFrame, tie-break ascending eventIndex (newest = last
    # = composited on top). Identical to the TS comparator.
    voices.sort(key=lambda v: (v["triggerFrame"], v["eventIndex"]))

    # Strip internal _chokeGroup — exported shape is Voice, not VoiceInternal.
    return [{k: val for k, val in v.items() if k != "_chokeGroup"} for v in voices]
