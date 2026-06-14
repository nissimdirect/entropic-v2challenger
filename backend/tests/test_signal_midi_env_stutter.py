"""Tests for the MIDI envelope stutter operator (P4.3).

Drives a retriggerable ADSR via the shared envelope kernel. A monotonic increase
in ``trigger_count`` restarts the attack phase; non-monotonic / NaN / non-int
counters NEVER retrigger (guard against retrigger storms).
"""

from modulation.engine import SignalEngine
from modulation.envelope import evaluate_envelope
from modulation.midi_env_stutter import evaluate_midi_env_stutter


# ADSR with a slow attack so we can observe the attack ramp across frames.
ADSR = {"attack": 10, "decay": 0, "sustain": 1.0, "release": 0}


def test_trigger_count_increment_retriggers_envelope_attack():
    """Incrementing trigger_count restarts attack: the value dips back toward 0
    and ramps up again from the retrigger frame."""
    state = {}
    # Trigger once, advance through attack to near the top.
    params = {**ADSR, "trigger_count": 1}
    last = 0.0
    for fi in range(0, 12):
        last, state = evaluate_midi_env_stutter(params, frame_index=fi, state_in=state)
    assert last > 0.8, "envelope should have climbed near the top after attack"

    # Now increment the counter at frame 12 → retrigger → attack restarts (low value).
    params2 = {**ADSR, "trigger_count": 2}
    v_retrig, state = evaluate_midi_env_stutter(params2, frame_index=12, state_in=state)
    assert v_retrig < last, (
        "incrementing trigger_count must restart attack (value drops from sustain)"
    )


def test_unchanged_trigger_count_continues_envelope_phase():
    """An unchanged trigger_count does NOT retrigger — the envelope continues."""
    state = {}
    params = {**ADSR, "trigger_count": 1}
    values = []
    for fi in range(0, 8):
        v, state = evaluate_midi_env_stutter(params, frame_index=fi, state_in=state)
        values.append(v)
    # Monotonically non-decreasing through the attack (no mid-ramp retrigger dip).
    for a, b in zip(values, values[1:]):
        assert b >= a - 1e-9, "unchanged trigger_count must not restart attack mid-ramp"


def test_adsr_shape_matches_envelope_operator_for_single_trigger():
    """A single trigger drives the SAME ADSR shape as the bare envelope kernel."""
    shape = {"attack": 8, "decay": 4, "sustain": 0.5, "release": 6}
    stutter_state = {}
    env_state = {"was_triggered": False}
    for fi in range(0, 20):
        s_val, stutter_state = evaluate_midi_env_stutter(
            {**shape, "trigger_count": 1}, frame_index=fi, state_in=stutter_state
        )
        e_val, env_state = evaluate_envelope(
            trigger=True,
            attack=8,
            decay=4,
            sustain=0.5,
            release=6,
            frame_index=fi,
            state_in=env_state,
        )
        assert abs(s_val - e_val) < 1e-9, (
            f"frame {fi}: stutter {s_val} should match envelope kernel {e_val}"
        )


def test_trigger_count_negative_noninteger_or_nan_treated_as_zero_no_retrigger_storm():
    """-5 / 3.7 / NaN / 'abc' counters → no crash and NO per-frame retrigger.

    If any garbage value were (mis)read as a trigger every frame, the envelope
    would be pinned at the attack start (low value) forever. We assert that after
    a real trigger climbs the envelope, garbage counters do NOT keep restarting it.
    """
    for garbage in (-5, 3.7, float("nan"), "abc", None, True):
        state = {}
        # First establish a genuine trigger and climb.
        for fi in range(0, 12):
            climbed, state = evaluate_midi_env_stutter(
                {**ADSR, "trigger_count": 1}, frame_index=fi, state_in=state
            )
        assert climbed > 0.8, f"baseline climb failed for garbage={garbage!r}"
        # Now feed garbage for many frames — must NOT retrigger (value stays high).
        for fi in range(12, 40):
            v, state = evaluate_midi_env_stutter(
                {**ADSR, "trigger_count": garbage}, frame_index=fi, state_in=state
            )
            assert v > 0.8, (
                f"garbage trigger_count={garbage!r} caused a retrigger storm "
                f"(value dropped to {v})"
            )


def test_trigger_count_decrease_does_not_retrigger():
    """A DECREASE in trigger_count (non-monotonic) must NOT retrigger."""
    state = {}
    # Climb on count=5.
    for fi in range(0, 12):
        climbed, state = evaluate_midi_env_stutter(
            {**ADSR, "trigger_count": 5}, frame_index=fi, state_in=state
        )
    assert climbed > 0.8
    # Drop the counter to 2 → no retrigger; value stays high.
    v, state = evaluate_midi_env_stutter(
        {**ADSR, "trigger_count": 2}, frame_index=12, state_in=state
    )
    assert v > 0.8, "a trigger_count decrease must not restart the attack"


def test_midi_env_stutter_via_evaluate_all_dispatch():
    """Partial-dispatch tripwire: midiEnvStutter must resolve through evaluate_all."""
    engine = SignalEngine()
    ops = [
        {
            "id": "stut-1",
            "type": "midiEnvStutter",
            "is_enabled": True,
            "parameters": {**ADSR, "trigger_count": 1},
        }
    ]
    state = {}
    last = 0.0
    for fi in range(0, 12):
        values, state = engine.evaluate_all(ops, frame_index=fi, fps=30.0, state=state)
        last = values["stut-1"]
    assert "stut-1" in values
    assert last > 0.8, "envelope should climb through evaluate_all dispatch"
