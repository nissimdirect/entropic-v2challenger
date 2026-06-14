"""MIDI Envelope Stutter operator — retriggerable ADSR envelope (P4.3).

Drives an ADSR envelope via the SHARED ``evaluate_envelope`` kernel
(envelope.py) — it NEVER reimplements ADSR. The "stutter" is a RETRIGGER: each
time the host's ``trigger_count`` advances (a monotonically-increasing integer
counter of MIDI note-on / stutter events), the envelope restarts its attack
phase. Between increments the envelope simply continues its current phase.

Retrigger is implemented by driving the envelope's trigger edge: on a retrigger
frame we feed ``trigger=False`` for one tick (to force a falling edge / reset of
the kernel's edge latch) and then ``trigger=True`` so the kernel sees a clean
rising edge and restarts attack. The kernel's own ``frame_index`` anchors the
attack to the retrigger frame.

Trust boundary (numeric-trust-boundary rule): ``trigger_count`` is type guarded —
NON-monotonic (a DECREASE), NaN, non-int (float/str), or missing values produce
NO retrigger (the guard), so a garbage/oscillating counter can never cause a
per-frame retrigger storm. ADSR params are guarded by the envelope kernel itself.
"""

import math

from modulation.envelope import evaluate_envelope


def _finite(value: object, default: float) -> float:
    """Coerce *value* to a finite float, else *default* (NaN/Inf/bool/type safe)."""
    if isinstance(value, bool):
        return default
    if not isinstance(value, (int, float)):
        return default
    f = float(value)
    if not math.isfinite(f):
        return default
    return f


def _strict_int_or_none(value: object) -> int | None:
    """Return *value* as an int ONLY if it is a genuine int, else None.

    bool (int subclass), float, str, NaN, None all → None. A non-int counter must
    NOT be interpreted as a trigger (prevents retrigger storms on garbage input).
    """
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    return None


def evaluate_midi_env_stutter(
    params: dict,
    frame_index: int,
    state_in: dict | None = None,
) -> tuple[float, dict]:
    """Evaluate a MIDI envelope stutter at a given frame.

    Args:
        params: Operator parameters. Recognized keys:
            ``attack`` / ``decay`` / ``sustain`` / ``release``: ADSR shape,
                forwarded to (and guarded by) the shared envelope kernel.
            ``trigger_count``: monotonic integer event counter. An INCREASE since
                the last frame retriggers the envelope's attack. Decrease / NaN /
                non-int → NO retrigger.
            ``trigger``: optional baseline held-state for the envelope (default
                True once first triggered, so the envelope sustains between
                retriggers). Defaults to holding.
        frame_index: Current frame number.
        state_in: Persistent state (envelope sub-state + last_trigger_count).

    Returns:
        (value, state_out) where value is 0.0-1.0.
    """
    state = dict(state_in) if state_in else {}

    attack = _finite(params.get("attack", 0), 0)
    decay = _finite(params.get("decay", 0), 0)
    sustain = _finite(params.get("sustain", 1.0), 1.0)
    release = _finite(params.get("release", 0), 0)

    # --- retrigger detection (monotonic-increase ONLY) ------------------------
    last_count = state.get("last_trigger_count")
    new_count = _strict_int_or_none(params.get("trigger_count"))

    retrigger = False
    if new_count is not None:
        if last_count is None:
            # First valid count seen → an initial trigger if it's > 0; otherwise
            # just record the baseline so the NEXT increment retriggers.
            if new_count > 0:
                retrigger = True
            state["last_trigger_count"] = new_count
        elif new_count > last_count:
            # Monotonic INCREASE → retrigger.
            retrigger = True
            state["last_trigger_count"] = new_count
        elif new_count < last_count:
            # DECREASE (non-monotonic) → no retrigger; do NOT lower the latch, so
            # a counter that bounces back up still needs to exceed the prior max.
            pass
        # equal → no change, no retrigger.

    # --- baseline held-state for the envelope ---------------------------------
    # Once the stutter has fired at least once, hold the envelope so it sustains
    # between retriggers. `trigger` param can override the baseline if supplied.
    has_fired = state.get("_has_fired", False) or retrigger
    if "trigger" in params:
        base_trigger = bool(params.get("trigger"))
    else:
        base_trigger = has_fired
    state["_has_fired"] = has_fired

    env_state = state.get("_env", {})

    if retrigger:
        # Force a clean rising edge: clear the kernel's edge latch with a single
        # falling tick, then trigger. We mutate the sub-state latch directly so we
        # do not consume a frame — the rising edge happens THIS frame_index.
        env_state = dict(env_state) if isinstance(env_state, dict) else {}
        env_state["was_triggered"] = False

    value, env_state = evaluate_envelope(
        trigger=base_trigger or retrigger,
        attack=attack,
        decay=decay,
        sustain=sustain,
        release=release,
        frame_index=frame_index,
        state_in=env_state,
    )
    state["_env"] = env_state if isinstance(env_state, dict) else {}

    return value, state
