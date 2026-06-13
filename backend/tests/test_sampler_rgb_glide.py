"""
B3.3 — sampler per-channel RGB offset + position/speed glide.

Hard oracle tests (from B3.3 packet spec):
  test_rgb_offset_zero_matches_b3_2         — REGRESSION GUARD
  test_rgb_offset_shifts_channels_to_different_frames
  test_rgb_offset_clamps_to_loop_bounds
  test_glide_zero_is_instant_jump           — REGRESSION GUARD
  test_glide_ramps_position_over_n_frames
  test_glide_completes_after_n_frames

Plus:
  Preview/export parity tests — expected values lifted from the backend reference
  so the frontend must compute the IDENTICAL indices.
"""

import pytest
from engine.export import ExportManager


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def compute(inst, playhead, frame_count=100, elapsed=None):
    """Drive backend _compute_voice_footage_frame; elapsed is optional."""
    if elapsed is not None:
        return ExportManager._compute_voice_footage_frame(
            inst, playhead, frame_count, elapsed_frames=elapsed
        )
    return ExportManager._compute_voice_footage_frame(inst, playhead, frame_count)


def rgb_indices(inst, base_frame, frame_count=100):
    """Drive backend _compute_voice_rgb_frame_indices."""
    return ExportManager._compute_voice_rgb_frame_indices(inst, base_frame, frame_count)


def glide_ramp(target_offset, glide_frames, elapsed_frames):
    """Drive backend _apply_glide_ramp."""
    return ExportManager._apply_glide_ramp(target_offset, glide_frames, elapsed_frames)


def _inst(**kw):
    """Build a minimal inst dict with sane defaults."""
    base = {"startFrame": 0, "speed": 1}
    base.update(kw)
    return base


# ===========================================================================
# REGRESSION GUARD: rgbOffset absent / {0,0,0} → byte-identical to B3.2
# ===========================================================================


class TestRgbOffsetZeroMatchesB32:
    """rgbOffset absent or {0,0,0} → _compute_voice_rgb_frame_indices returns None.

    The caller then decodes only one frame (base frame), producing output
    byte-identical to B3.2.
    """

    def test_rgb_offset_zero_matches_b3_2_absent(self):
        """No rgbOffset key → None (no channel decoding)."""
        inst = _inst(startFrame=0, speed=1)
        assert rgb_indices(inst, 42) is None

    def test_rgb_offset_zero_matches_b3_2_explicit_zeros(self):
        """rgbOffset={0,0,0} → None (no channel decoding)."""
        inst = _inst(rgbOffset={"r": 0, "g": 0, "b": 0})
        assert rgb_indices(inst, 42) is None

    def test_rgb_offset_zero_does_not_change_frame_sequence(self):
        """With rgbOffset=None the frame sequence from B3.2 is fully preserved."""
        inst_plain = _inst(startFrame=10, speed=1)
        inst_zero_rgb = _inst(
            startFrame=10, speed=1, rgbOffset={"r": 0, "g": 0, "b": 0}
        )
        for ph in range(40):
            b32 = compute(inst_plain, ph, 100)
            got = compute(inst_zero_rgb, ph, 100)
            assert got == b32, f"regression at playhead {ph}: {got} != {b32}"


# ===========================================================================
# RGB OFFSET — shifts channels to different frames
# ===========================================================================


class TestRgbOffsetShiftsChannelsToDifferentFrames:
    """Non-zero channel offsets produce 3 distinct frame indices."""

    def test_rgb_offset_shifts_channels_to_different_frames(self):
        """Classic chromatic aberration: r=-2, g=0, b=+2 at base_frame=10.

        Expected: r=8, g=10, b=12 (no loop, endFrame=99).
        """
        inst = _inst(endFrame=99, rgbOffset={"r": -2, "g": 0, "b": 2})
        result = rgb_indices(inst, base_frame=10, frame_count=100)
        assert result is not None
        assert result["r"] == 8, f"R: expected 8, got {result['r']}"
        assert result["g"] == 10, f"G: expected 10, got {result['g']}"
        assert result["b"] == 12, f"B: expected 12, got {result['b']}"

    def test_rgb_offset_all_channels_can_differ(self):
        """r=+3, g=-1, b=+7 at base=20 with frame_count=100 (endFrame default=99)."""
        inst = _inst(rgbOffset={"r": 3, "g": -1, "b": 7})
        result = rgb_indices(inst, base_frame=20, frame_count=100)
        assert result is not None
        assert result["r"] == 23
        assert result["g"] == 19
        assert result["b"] == 27

    def test_rgb_offset_negative_channels_stay_non_negative(self):
        """Large negative offset clamps to loBound (0 when no loop)."""
        inst = _inst(rgbOffset={"r": -100, "g": 0, "b": 0})
        # With r=-100, g=0, g and b offsets are 0; only r non-zero would
        # still be returned since r != g(0) condition is tricky — test g non-zero.
        inst2 = _inst(rgbOffset={"r": -100, "g": 0, "b": 5})
        result = rgb_indices(inst2, base_frame=5, frame_count=100)
        assert result is not None
        assert result["r"] >= 0, f"R clamped below 0: {result['r']}"


# ===========================================================================
# RGB OFFSET — clamps to loop/playable bounds
# ===========================================================================


class TestRgbOffsetClampsToLoopBounds:
    """Channel offsets are clamped to [loopIn, loopOut] when loop is enabled,
    or to [0, endFrame|last] otherwise."""

    def test_rgb_offset_clamps_to_loop_bounds(self):
        """With loop in=10, out=20: offsets that would exceed bounds are clamped.

        base_frame=18, r=+5 → raw=23 → clamped to 20 (loopOut).
        base_frame=18, g=-10 → raw=8 → clamped to 10 (loopIn).
        base_frame=18, b=+1 → raw=19 (within bounds).
        """
        inst = _inst(
            loop={"enabled": True, "in": 10, "out": 20, "dir": "fwd"},
            rgbOffset={"r": 5, "g": -10, "b": 1},
        )
        result = rgb_indices(inst, base_frame=18, frame_count=100)
        assert result is not None
        assert result["r"] == 20, f"R: expected clamped to 20, got {result['r']}"
        assert result["g"] == 10, f"G: expected clamped to 10, got {result['g']}"
        assert result["b"] == 19, f"B: expected 19, got {result['b']}"

    def test_rgb_offset_clamps_to_end_frame_when_no_loop(self):
        """Without loop, hi-bound = endFrame. r=+200 → clamp to endFrame=50."""
        inst = _inst(endFrame=50, rgbOffset={"r": 200, "g": 0, "b": -200})
        result = rgb_indices(inst, base_frame=25, frame_count=100)
        assert result is not None
        assert result["r"] == 50, f"R: expected 50, got {result['r']}"
        assert result["b"] == 0, f"B: expected 0, got {result['b']}"

    def test_rgb_offset_within_bounds_unchanged(self):
        """Offsets that stay within [loopIn, loopOut] are applied verbatim."""
        inst = _inst(
            loop={"enabled": True, "in": 5, "out": 95, "dir": "fwd"},
            rgbOffset={"r": 2, "g": -2, "b": 3},
        )
        result = rgb_indices(inst, base_frame=50, frame_count=100)
        assert result is not None
        assert result["r"] == 52
        assert result["g"] == 48
        assert result["b"] == 53


# ===========================================================================
# GLIDE — regression guard: glide=0 / absent → instant jump = B3.2 behavior
# ===========================================================================


class TestGlideZeroIsInstantJump:
    """glide absent or 0 → _compute_voice_footage_frame byte-identical to B3.2."""

    def test_glide_zero_is_instant_jump(self):
        """glide=0 → frame at playhead=10 is startFrame + round(speed * 10)."""
        inst = _inst(startFrame=5, speed=1, glide=0)
        # B3.2 expected: 5 + 10 = 15
        assert compute(inst, 10) == 15

    def test_glide_absent_matches_b3_2(self):
        """No glide key → byte-identical to B3.2 formula."""
        inst_b32 = _inst(startFrame=5, speed=1)
        inst_g0 = _inst(startFrame=5, speed=1, glide=0)
        for ph in range(30):
            assert compute(inst_b32, ph) == compute(inst_g0, ph), (
                f"regression at playhead {ph}"
            )

    def test_glide_zero_with_loop_instant_jump(self):
        """glide=0 + loop → loop wrapping unchanged from B3.1."""
        inst = _inst(
            speed=1,
            glide=0,
            loop={"enabled": True, "in": 0, "out": 9, "dir": "fwd"},
        )
        # B3.1: offset 5 % 10 = 5 → frame 5
        assert compute(inst, 5) == 5
        # B3.1: offset 15 % 10 = 5 → frame 5
        assert compute(inst, 15) == 5

    def test_apply_glide_ramp_zero_glide_returns_target(self):
        """_apply_glide_ramp with glide_frames=0 → target_offset unchanged."""
        assert glide_ramp(50.0, 0, 5) == 50.0
        assert glide_ramp(0.0, 0, 0) == 0.0
        assert glide_ramp(100.0, 0, 100) == 100.0


# ===========================================================================
# GLIDE — ramps position over N frames
# ===========================================================================


class TestGlideRampsPositionOverNFrames:
    """With glide=N, the first N frames linearly ramp from 0 to target offset."""

    def test_glide_ramps_position_over_n_frames(self):
        """glide=10, speed=1, startFrame=0: at elapsed=5 (half), offset ramps to 50%.

        At playhead=10 (target offset = 10), elapsed=5:
          ramped_offset = 10 * (5/10) = 5.0 → round(5.0) = 5
          frame = startFrame + 5 = 5.
        """
        inst = _inst(startFrame=0, speed=1, glide=10)
        # elapsed=5 (half of glide), playhead=10 (target offset=10)
        result = compute(inst, playhead=10, frame_count=100, elapsed=5)
        assert result == 5, f"expected 5 (50% ramp at elapsed=5/10), got {result}"

    def test_glide_ramp_at_start_is_zero(self):
        """At elapsed=0 the ramp is 0 → frame = startFrame."""
        inst = _inst(startFrame=7, speed=1, glide=20)
        result = compute(inst, playhead=50, frame_count=100, elapsed=0)
        assert result == 7, f"expected 7 (startFrame at ramp start), got {result}"

    def test_apply_glide_ramp_midpoint(self):
        """_apply_glide_ramp at t=0.5 → target * 0.5."""
        result = glide_ramp(100.0, 20, 10)  # 10/20 = 0.5
        assert result == 50.0, f"expected 50.0, got {result}"

    def test_glide_loop_ramps_offset(self):
        """With loop, glide ramps the raw offset: at elapsed=0 → offset 0 → loopIn."""
        inst = _inst(
            speed=1,
            glide=10,
            loop={"enabled": True, "in": 5, "out": 15, "dir": "fwd"},
        )
        # elapsed=0 → ramped_offset = 0 → offset % loopLen = 0 → lIn=5
        result = compute(inst, playhead=20, frame_count=100, elapsed=0)
        assert result == 5, f"expected loopIn=5 at elapsed=0, got {result}"

    def test_glide_is_linear(self):
        """The ramp is linear: each step adds equal amount toward target."""
        target = 30.0
        glide = 10
        prev_val = None
        for ef in range(1, glide):
            val = glide_ramp(target, glide, ef)
            if prev_val is not None:
                step = val - prev_val
                assert abs(step - target / glide) < 1e-9, (
                    f"non-linear step at elapsed={ef}: step={step}"
                )
            prev_val = val


# ===========================================================================
# GLIDE — completes after N frames
# ===========================================================================


class TestGlideCompletesAfterNFrames:
    """After `glide` frames have elapsed, the ramp holds at target_offset."""

    def test_glide_completes_after_n_frames(self):
        """At elapsed == glide and beyond, result == target_offset."""
        target = 50.0
        glide = 10
        assert glide_ramp(target, glide, 10) == target
        assert glide_ramp(target, glide, 11) == target
        assert glide_ramp(target, glide, 100) == target

    def test_glide_frame_index_stable_after_completion(self):
        """compute() at elapsed >= glide yields same result as no-glide."""
        inst_glide = _inst(startFrame=0, speed=1, glide=5)
        inst_plain = _inst(startFrame=0, speed=1)
        for ph in range(10, 30):
            # At elapsed=ph (same as playhead for plain voice), glide has completed
            # if ph >= 5. Frame should be identical to no-glide.
            result_glide = compute(inst_glide, ph, 100, elapsed=ph)
            result_plain = compute(inst_plain, ph, 100)
            assert result_glide == result_plain, (
                f"glide incomplete after N frames at ph={ph}: "
                f"glide={result_glide}, plain={result_plain}"
            )


# ===========================================================================
# PREVIEW / EXPORT PARITY — expected values LIFTED from this backend reference.
# The frontend tests assert the SAME values for the SAME inputs.
# ===========================================================================


class TestPreviewExportParityRgbGlide:
    """Parity guard: frontend TS and backend Python must compute identical values.

    The expected values in this table ARE the backend-computed reference values.
    The frontend computeSamplerVoice.test.ts imports these same expected values
    and runs the SAME assertions against computeRgbFrameIndices / applyGlideRamp /
    computeLoopFrameIndex — so divergence fails the frontend tests.
    """

    # --- RGB offset parity ---
    def test_parity_rgb_shifts_channels(self):
        """Parity case 1: r=-2, g=0, b=+2 at base=10, fc=100.

        Expected: r=8, g=10, b=12.
        """
        inst = _inst(endFrame=99, rgbOffset={"r": -2, "g": 0, "b": 2})
        result = rgb_indices(inst, base_frame=10, frame_count=100)
        assert result == {"r": 8, "g": 10, "b": 12}

    def test_parity_rgb_clamp_loop(self):
        """Parity case 2: loop in=10, out=20; r=+5 at base=18 → clamp to 20."""
        inst = _inst(
            loop={"enabled": True, "in": 10, "out": 20, "dir": "fwd"},
            rgbOffset={"r": 5, "g": 0, "b": -10},
        )
        result = rgb_indices(inst, base_frame=18, frame_count=100)
        assert result is not None
        # r=18+5=23 → clamp to loopOut=20; b=18-10=8 → clamp to loopIn=10
        assert result["r"] == 20
        assert result["b"] == 10

    def test_parity_rgb_zero_returns_none(self):
        """Parity case 3: rgbOffset=None → None."""
        assert rgb_indices(_inst(), 42, 100) is None
        assert rgb_indices(_inst(rgbOffset={"r": 0, "g": 0, "b": 0}), 42, 100) is None

    # --- Glide parity ---
    def test_parity_glide_zero_instant_jump(self):
        """Parity case 4: glide=0, ph=10, start=0, speed=1 → frame=10."""
        assert compute(_inst(glide=0), 10) == 10

    def test_parity_glide_midpoint(self):
        """Parity case 5: glide=10, ph=10, elapsed=5, start=0, speed=1 → frame=5.

        ramped_offset = 10*(5/10)=5.0 → round(5)=5 → frame=0+5=5.
        """
        assert compute(_inst(glide=10), 10, 100, elapsed=5) == 5

    def test_parity_glide_complete(self):
        """Parity case 6: glide=10, ph=10, elapsed=10, start=0, speed=1 → frame=10."""
        assert compute(_inst(glide=10), 10, 100, elapsed=10) == 10

    def test_parity_glide_ramp_start(self):
        """Parity case 7: glide=20, ph=50, elapsed=0, start=7, speed=1 → frame=7."""
        assert compute(_inst(startFrame=7, glide=20), 50, 100, elapsed=0) == 7

    def test_parity_glide_loop_ramp_start(self):
        """Parity case 8: loop in=5 out=15, glide=10, ph=20, elapsed=0 → loopIn=5."""
        inst = _inst(
            speed=1,
            glide=10,
            loop={"enabled": True, "in": 5, "out": 15, "dir": "fwd"},
        )
        assert compute(inst, 20, 100, elapsed=0) == 5
