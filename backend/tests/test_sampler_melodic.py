"""
B3.4 — sampler melodic mode (note → startFrame offset OR speed scale).

Hard-oracle tests (from the B3.4 packet spec):
  test_melodic_off_matches_b3_3                       — REGRESSION GUARD
  test_melodic_startframe_note_offsets_start
  test_melodic_speed_note_scales_rate_chromatically  (n=root+12 → 2× speed)
  test_melodic_root_note_is_no_transpose
  test_trigger_event_without_note_is_unchanged       — additive-schema regression

Plus preview/export parity reference values (lifted here from the backend
_compute_voice_footage_frame; the frontend computeLoopFrameIndex must compute
the IDENTICAL indices for the same melodic config + note).

The note→param mapping (documented choice):
  mode='startFrame' → start += (note - rootNote)   (1 frame per semitone, integral)
  mode='speed'      → speed *= 2 ** ((note - rootNote) / 12)  (chromatic rate)
"""

from engine.export import ExportManager
from engine.voice_replay import evaluate_voices


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def frame(inst, playhead, frame_count=100, note=None, elapsed=None):
    """Drive backend _compute_voice_footage_frame with optional note/elapsed."""
    return ExportManager._compute_voice_footage_frame(
        inst, playhead, frame_count, elapsed_frames=elapsed, note=note
    )


def melodic_pair(inst, start, speed, note):
    """Drive backend _apply_melodic directly (note→param transform)."""
    return ExportManager._apply_melodic(inst, start, speed, note)


def _inst(**kw):
    base = {"startFrame": 0, "speed": 1}
    base.update(kw)
    return base


# ===========================================================================
# REGRESSION GUARD: melodic absent / disabled → byte-identical to B3.3
# ===========================================================================


class TestMelodicOffMatchesB33:
    def test_melodic_off_matches_b3_3(self):
        """melodic absent → footage frame identical with or without a note arg.

        Sweeps playheads; the note is supplied but must be IGNORED because
        melodic is absent → output == B3.3 (no melodic key at all).
        """
        inst = _inst(startFrame=10, speed=2)
        for ph in range(0, 50, 3):
            b33 = frame(inst, ph, 100)  # no note
            with_note = frame(inst, ph, 100, note=72)  # note ignored (no melodic)
            assert with_note == b33, f"playhead {ph}: {with_note} != {b33}"

    def test_melodic_disabled_matches_b3_3(self):
        """melodic.enabled=False → note ignored → identical to B3.3."""
        plain = _inst(startFrame=10, speed=2)
        disabled = _inst(
            startFrame=10,
            speed=2,
            melodic={"enabled": False, "mode": "startFrame", "rootNote": 60},
        )
        for ph in range(0, 50, 3):
            assert frame(disabled, ph, 100, note=84) == frame(plain, ph, 100)

    def test_apply_melodic_off_returns_unchanged(self):
        """_apply_melodic with no melodic config returns (start, speed) verbatim."""
        assert melodic_pair(_inst(), 10, 2.0, 72) == (10, 2.0)


# ===========================================================================
# ADDITIVE-SCHEMA REGRESSION: a voice/trigger event without note is unchanged
# ===========================================================================


class TestTriggerEventWithoutNote:
    def test_trigger_event_without_note_is_unchanged(self):
        """note=None (voice carries no note) → melodic no-op even when enabled.

        Proves the schema is additive-safe: a replay where the note is absent
        produces byte-identical frames to melodic-off.
        """
        inst = _inst(
            startFrame=10,
            speed=2,
            melodic={"enabled": True, "mode": "startFrame", "rootNote": 60},
        )
        plain = _inst(startFrame=10, speed=2)
        for ph in range(0, 40, 5):
            # note=None → transform skipped → identical to the non-melodic inst.
            assert frame(inst, ph, 100, note=None) == frame(plain, ph, 100)

    def test_apply_melodic_none_note_unchanged(self):
        inst = _inst(melodic={"enabled": True, "mode": "speed", "rootNote": 60})
        assert melodic_pair(inst, 10, 2.0, None) == (10, 2.0)

    def test_evaluate_voices_without_note_field_drops_event(self):
        """Additive-schema: the FSM already requires `note`; an event lacking it
        is dropped by isValidEvent (so no voice, no melodic surprise). Proves the
        trigger-event note field is load-bearing and pre-existing, not newly added.
        """
        adsr = {"attack": 0, "decay": 0, "sustain": 1, "release": 0}
        ev_no_note = {
            "kind": "trigger",
            "instrumentId": "s",
            "frameIndex": 0,
            "eventIndex": 0,
            "velocity": 100,
        }  # note missing → invalid → dropped
        assert evaluate_voices([ev_no_note], 5, {"voiceCap": 4, "adsr": adsr}) == []
        ev_with_note = {**ev_no_note, "note": 60}
        voices = evaluate_voices([ev_with_note], 5, {"voiceCap": 4, "adsr": adsr})
        assert len(voices) == 1 and voices[0]["note"] == 60


# ===========================================================================
# startFrame MODE: note offsets the start by (note - rootNote) frames
# ===========================================================================


class TestMelodicStartFrameMode:
    def test_melodic_startframe_note_offsets_start(self):
        """mode='startFrame': +12 semitones → start shifts +12 frames.

        startFrame=10, rootNote=60, speed=0 (freeze) so frame == start exactly.
        note=72 (root+12) → start = 10 + 12 = 22.
        """
        inst = _inst(
            startFrame=10,
            speed=0,  # freeze → frame == start
            melodic={"enabled": True, "mode": "startFrame", "rootNote": 60},
        )
        assert frame(inst, 5, 100, note=72) == 22  # 10 + (72-60)
        assert frame(inst, 5, 100, note=48) == 0  # 10 + (48-60) = -2 → clamp 0
        assert frame(inst, 5, 100, note=61) == 11  # 10 + 1

    def test_apply_melodic_startframe_math(self):
        inst = _inst(melodic={"enabled": True, "mode": "startFrame", "rootNote": 60})
        # speed unchanged; start offset by semitone count.
        assert melodic_pair(inst, 10, 2.0, 72) == (22, 2.0)
        assert melodic_pair(inst, 10, 2.0, 54) == (4, 2.0)

    def test_startframe_offset_clamps_to_bounds(self):
        """Transposed start past last_frame clamps to last_frame (no widening)."""
        inst = _inst(
            startFrame=90,
            speed=0,
            melodic={"enabled": True, "mode": "startFrame", "rootNote": 60},
        )
        # 90 + (127-60)=157 → clamp to last_frame 99.
        assert frame(inst, 0, 100, note=127) == 99


# ===========================================================================
# speed MODE: note scales the playback rate chromatically (2^(semis/12))
# ===========================================================================


class TestMelodicSpeedMode:
    def test_melodic_speed_note_scales_rate_chromatically(self):
        """mode='speed': n = rootNote + 12 → speed × 2 (one octave up).

        startFrame=0, speed=1, playhead=10. Base offset = 1*10 = 10 → frame 10.
        note=72 (root+12) → speed = 1 * 2 = 2 → offset = 2*10 = 20 → frame 20.
        """
        inst = _inst(
            startFrame=0,
            speed=1,
            melodic={"enabled": True, "mode": "speed", "rootNote": 60},
        )
        assert frame(inst, 10, 100, note=60) == 10  # root → 1× → 10
        assert frame(inst, 10, 100, note=72) == 20  # +12 → 2× → 20
        assert frame(inst, 10, 100, note=48) == 5  # -12 → 0.5× → 5

    def test_apply_melodic_speed_doubles_at_octave(self):
        inst = _inst(melodic={"enabled": True, "mode": "speed", "rootNote": 60})
        start, speed = melodic_pair(inst, 0, 1.0, 72)
        assert start == 0
        assert abs(speed - 2.0) < 1e-9
        # one octave down → half speed
        _, speed_down = melodic_pair(inst, 0, 1.0, 48)
        assert abs(speed_down - 0.5) < 1e-9

    def test_speed_mode_respects_speed_clamp(self):
        """Chromatic scaling that exceeds [-8,8] re-clamps (never widens)."""
        inst = _inst(
            startFrame=0,
            speed=4,
            melodic={"enabled": True, "mode": "speed", "rootNote": 60},
        )
        # +24 semis → ×4 → 4*4=16 → clamp to 8. offset = 8*10 = 80.
        assert frame(inst, 10, 1000, note=84) == 80


# ===========================================================================
# rootNote is the no-transpose pivot (both modes)
# ===========================================================================


class TestRootNoteNoTranspose:
    def test_melodic_root_note_is_no_transpose_startframe(self):
        plain = _inst(startFrame=10, speed=2)
        inst = _inst(
            startFrame=10,
            speed=2,
            melodic={"enabled": True, "mode": "startFrame", "rootNote": 60},
        )
        for ph in range(0, 40, 5):
            assert frame(inst, ph, 100, note=60) == frame(plain, ph, 100)

    def test_melodic_root_note_is_no_transpose_speed(self):
        plain = _inst(startFrame=5, speed=2)
        inst = _inst(
            startFrame=5,
            speed=2,
            melodic={"enabled": True, "mode": "speed", "rootNote": 60},
        )
        for ph in range(0, 40, 5):
            assert frame(inst, ph, 100, note=60) == frame(plain, ph, 100)

    def test_apply_melodic_root_note_unchanged(self):
        inst = _inst(melodic={"enabled": True, "mode": "speed", "rootNote": 64})
        assert melodic_pair(inst, 10, 3.0, 64) == (10, 3.0)


# ===========================================================================
# PREVIEW/EXPORT PARITY reference values — the frontend must match these.
# (Lifted from this backend reference; the vitest melodic-parity suite asserts
#  computeLoopFrameIndex produces the SAME numbers for the same config+note.)
# ===========================================================================


class TestMelodicParityReference:
    def test_parity_startframe_reference_values(self):
        inst = _inst(
            startFrame=10,
            speed=0,
            melodic={"enabled": True, "mode": "startFrame", "rootNote": 60},
        )
        # (note, playhead, frame_count) -> expected footage frame
        cases = [
            (72, 5, 100, 22),
            (48, 5, 100, 0),
            (60, 5, 100, 10),
            (67, 5, 100, 17),
        ]
        for note, ph, fc, expected in cases:
            assert frame(inst, ph, fc, note=note) == expected

    def test_parity_speed_reference_values(self):
        inst = _inst(
            startFrame=0,
            speed=1,
            melodic={"enabled": True, "mode": "speed", "rootNote": 60},
        )
        cases = [
            (60, 10, 100, 10),
            (72, 10, 100, 20),
            (48, 10, 100, 5),
        ]
        for note, ph, fc, expected in cases:
            assert frame(inst, ph, fc, note=note) == expected
