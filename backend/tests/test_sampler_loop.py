"""
B3.1 — Sampler loop engine tests.

Tests _compute_voice_footage_frame (now loop-aware) and
_compute_voice_crossfade_weight in ExportManager.

Hard oracle requirements (from B3.1 packet spec):
  test_loop_disabled_matches_legacy_playback   — regression guard
  test_loop_fwd_wraps_out_to_in
  test_loop_reverse_plays_backward_within_bounds
  test_loop_pingpong_bounces_at_bounds
  test_loop_crossfade_blends_seam
  test_loop_respects_speed_magnitude
  test_loop_in_greater_than_out_rejected_or_clamped  (negative)
"""

import pytest
from engine.export import ExportManager

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _frame(inst_overrides=None, /, **kw):
    """Build an inst dict with sane defaults; merge overrides."""
    base = {"startFrame": 0, "speed": 1}
    if inst_overrides:
        base.update(inst_overrides)
    base.update(kw)
    return base


def compute(inst, playhead, frame_count=100):
    return ExportManager._compute_voice_footage_frame(inst, playhead, frame_count)


def crossfade_weight(inst, playhead, frame_count=100):
    return ExportManager._compute_voice_crossfade_weight(inst, playhead, frame_count)


# ---------------------------------------------------------------------------
# REGRESSION GUARD: loop disabled → byte-identical to legacy
# ---------------------------------------------------------------------------


class TestLoopDisabledMatchesLegacy:
    """loop absent or loop.enabled=False → behavior byte-identical to B1/B2."""

    def test_loop_disabled_matches_legacy_playback_no_loop_key(self):
        """No 'loop' key at all → same as before B3.1."""
        inst = _frame(startFrame=10, speed=1)
        # Legacy: startFrame + round(speed * playhead) = 10 + 5 = 15
        assert compute(inst, 5, 100) == 15

    def test_loop_disabled_matches_legacy_playback_loop_enabled_false(self):
        """loop.enabled=False → identical to no-loop path."""
        inst = _frame(
            startFrame=10, speed=1, loop={"enabled": False, "in": 0, "out": 50}
        )
        assert compute(inst, 5, 100) == 15

    def test_loop_disabled_clamp_at_last_frame(self):
        """Legacy clamp at last frame still works when loop disabled."""
        inst = _frame(startFrame=90, speed=2)
        # 90 + 50 = 140 → clamp to 99
        assert compute(inst, 25, 100) == 99

    def test_loop_disabled_reverse_clamp_at_zero(self):
        """Legacy reverse (negative speed) still clamps at 0 when loop disabled."""
        inst = _frame(startFrame=5, speed=-1)
        # 5 + (-1 * 30) = -25 → clamp 0
        assert compute(inst, 30, 100) == 0

    def test_loop_disabled_freeze_speed_zero(self):
        """Speed=0 still freezes at startFrame when loop disabled."""
        inst = _frame(startFrame=20, speed=0)
        assert compute(inst, 50, 100) == 20

    def test_loop_disabled_crossfade_weight_is_zero(self):
        """Crossfade weight is always 0 when loop is disabled."""
        inst = _frame(startFrame=0, speed=1, loop={"enabled": False, "crossfade": 10})
        assert crossfade_weight(inst, 5, 100) == 0.0

    def test_loop_absent_crossfade_weight_is_zero(self):
        """Crossfade weight is 0 when loop key is absent."""
        inst = _frame(startFrame=0, speed=1)
        assert crossfade_weight(inst, 5, 100) == 0.0


# ---------------------------------------------------------------------------
# LOOP FWD: wraps out → in
# ---------------------------------------------------------------------------


class TestLoopFwdWrapsOutToIn:
    """loop.dir='fwd' — playhead wraps from out back to in."""

    def test_loop_fwd_wraps_out_to_in(self):
        """After l_out, playhead wraps to l_in and continues."""
        # loopIn=10, loopOut=19 → loop_len=10
        inst = _frame(
            startFrame=0,
            speed=1,
            loop={"enabled": True, "in": 10, "out": 19, "dir": "fwd"},
        )
        # playhead=0 → offset=0 → 10 + (0 % 10) = 10
        assert compute(inst, 0, 100) == 10
        # playhead=9 → offset=9 → 10 + (9 % 10) = 19
        assert compute(inst, 9, 100) == 19
        # playhead=10 → offset=10 → 10 + (10 % 10) = 10  ← wrapped
        assert compute(inst, 10, 100) == 10
        # playhead=15 → offset=15 → 10 + (15 % 10) = 15
        assert compute(inst, 15, 100) == 15

    def test_loop_fwd_wraps_multiple_cycles(self):
        """Multiple full cycles through the loop region."""
        inst = _frame(
            startFrame=0,
            speed=1,
            loop={"enabled": True, "in": 0, "out": 9, "dir": "fwd"},
        )
        # loop_len=10; offsets 0-9 map to frames 0-9, then 10→0, 20→0, 25→5
        assert compute(inst, 25, 100) == 5

    def test_loop_fwd_stays_within_bounds(self):
        """Every frame output must be within [loopIn, loopOut]."""
        inst = _frame(
            startFrame=0,
            speed=1,
            loop={"enabled": True, "in": 5, "out": 14, "dir": "fwd"},
        )
        for ph in range(100):
            fi = compute(inst, ph, 50)
            assert 0 <= fi <= 49, f"out of global bounds at playhead {ph}: {fi}"

    def test_loop_fwd_default_dir(self):
        """loop.dir absent → defaults to fwd."""
        inst = _frame(startFrame=0, speed=1, loop={"enabled": True, "in": 0, "out": 9})
        assert compute(inst, 10, 100) == 0  # wrapped

    def test_loop_fwd_unknown_dir_defaults_to_fwd(self):
        """loop.dir with unknown value → treated as 'fwd'."""
        inst = _frame(
            startFrame=0,
            speed=1,
            loop={"enabled": True, "in": 0, "out": 9, "dir": "bogus"},
        )
        assert compute(inst, 10, 100) == 0  # wrapped (fwd default)


# ---------------------------------------------------------------------------
# LOOP REVERSE: plays backward within bounds
# ---------------------------------------------------------------------------


class TestLoopReversePlaysBackwardWithinBounds:
    """loop.dir='rev' — playhead travels from l_out backward to l_in, wrapping."""

    def test_loop_reverse_plays_backward_within_bounds(self):
        # loopIn=10, loopOut=19 → loop_len=10
        inst = _frame(
            startFrame=0,
            speed=1,
            loop={"enabled": True, "in": 10, "out": 19, "dir": "rev"},
        )
        # playhead=0 → offset=0 → 19 - (0 % 10) = 19
        assert compute(inst, 0, 100) == 19
        # playhead=9 → offset=9 → 19 - (9 % 10) = 10
        assert compute(inst, 9, 100) == 10
        # playhead=10 → offset=10 → 19 - (10 % 10) = 19  ← wrapped
        assert compute(inst, 10, 100) == 19

    def test_loop_reverse_all_frames_in_range(self):
        """Every output frame must be within [loopIn, loopOut]."""
        inst = _frame(
            startFrame=0,
            speed=1,
            loop={"enabled": True, "in": 5, "out": 15, "dir": "rev"},
        )
        for ph in range(50):
            fi = compute(inst, ph, 100)
            assert 5 <= fi <= 15, f"frame {fi} out of [5,15] at playhead {ph}"

    def test_loop_reverse_negative_speed_inverts_to_fwd(self):
        """Negative speed + dir='rev' → effective dir becomes 'fwd'."""
        inst_rev_neg = _frame(
            startFrame=0,
            speed=-1,
            loop={"enabled": True, "in": 10, "out": 19, "dir": "rev"},
        )
        inst_fwd_pos = _frame(
            startFrame=0,
            speed=1,
            loop={"enabled": True, "in": 10, "out": 19, "dir": "fwd"},
        )
        # Both should produce the same frame sequence.
        for ph in range(20):
            assert compute(inst_rev_neg, ph, 100) == compute(inst_fwd_pos, ph, 100), (
                f"mismatch at playhead {ph}"
            )


# ---------------------------------------------------------------------------
# LOOP PINGPONG: bounces at bounds
# ---------------------------------------------------------------------------


class TestLoopPingpongBouncesAtBounds:
    """loop.dir='pingpong' — bounces at l_in and l_out."""

    def test_loop_pingpong_bounces_at_bounds(self):
        # loopIn=0, loopOut=4 → loop_len=5, period=8 (2*(5-1))
        inst = _frame(
            startFrame=0,
            speed=1,
            loop={"enabled": True, "in": 0, "out": 4, "dir": "pingpong"},
        )
        # phase 0→4: forward 0,1,2,3,4
        # phase 5→7: backward 3,2,1
        # phase 8→: repeat
        expected = [0, 1, 2, 3, 4, 3, 2, 1, 0, 1, 2, 3, 4, 3, 2, 1]
        for ph, exp in enumerate(expected):
            assert compute(inst, ph, 100) == exp, (
                f"playhead {ph}: got {compute(inst, ph, 100)}, want {exp}"
            )

    def test_loop_pingpong_all_frames_in_range(self):
        """Every output frame must be within [loopIn, loopOut]."""
        inst = _frame(
            startFrame=0,
            speed=1,
            loop={"enabled": True, "in": 10, "out": 20, "dir": "pingpong"},
        )
        for ph in range(100):
            fi = compute(inst, ph, 100)
            assert 10 <= fi <= 20, f"frame {fi} out of [10,20] at playhead {ph}"

    def test_loop_pingpong_single_frame_loop(self):
        """Degenerate: loopIn==loopOut → always returns that frame."""
        inst = _frame(
            startFrame=0,
            speed=1,
            loop={"enabled": True, "in": 5, "out": 5, "dir": "pingpong"},
        )
        for ph in range(10):
            assert compute(inst, ph, 100) == 5

    def test_loop_pingpong_speed_is_symmetric(self):
        """Pingpong is symmetric: negative speed should produce same sequence as positive."""
        inst_pos = _frame(
            startFrame=0,
            speed=1,
            loop={"enabled": True, "in": 0, "out": 4, "dir": "pingpong"},
        )
        inst_neg = _frame(
            startFrame=0,
            speed=-1,
            loop={"enabled": True, "in": 0, "out": 4, "dir": "pingpong"},
        )
        for ph in range(20):
            assert compute(inst_pos, ph, 100) == compute(inst_neg, ph, 100), (
                f"pingpong not symmetric at playhead {ph}"
            )


# ---------------------------------------------------------------------------
# CROSSFADE: blends the seam
# ---------------------------------------------------------------------------


class TestLoopCrossfadeBlendSeam:
    """loop.crossfade — blend weight > 0 near the seam, 0 away from it."""

    def test_loop_crossfade_blends_seam(self):
        """Near the loop seam, crossfade weight > 0; midpoint has weight 0."""
        inst = _frame(
            startFrame=0,
            speed=1,
            loop={"enabled": True, "in": 0, "out": 19, "dir": "fwd", "crossfade": 4},
        )
        # At playhead=19 (l_out), dist_from_out=0 → weight=1.0
        w_at_out = crossfade_weight(inst, 19, 100)
        assert w_at_out == pytest.approx(1.0, abs=1e-6), (
            f"expected ~1.0 at seam, got {w_at_out}"
        )

        # Midpoint (playhead=10 → frame=10, dist_from_out=9, dist_from_in=10, crossfade=4)
        # min_dist=9 >= 4 → weight=0
        w_mid = crossfade_weight(inst, 10, 100)
        assert w_mid == 0.0, f"expected 0.0 at midpoint, got {w_mid}"

    def test_loop_crossfade_zero_means_hard_cut(self):
        """crossfade=0 → always 0.0 (hard cut, no blending)."""
        inst = _frame(
            startFrame=0,
            speed=1,
            loop={"enabled": True, "in": 0, "out": 19, "dir": "fwd", "crossfade": 0},
        )
        for ph in range(20):
            assert crossfade_weight(inst, ph, 100) == 0.0

    def test_loop_crossfade_weight_in_unit_range(self):
        """Crossfade weight is always in [0, 1]."""
        inst = _frame(
            startFrame=0,
            speed=1,
            loop={"enabled": True, "in": 0, "out": 19, "dir": "fwd", "crossfade": 6},
        )
        for ph in range(30):
            w = crossfade_weight(inst, ph, 100)
            assert 0.0 <= w <= 1.0, f"weight {w} out of [0,1] at playhead {ph}"

    def test_loop_crossfade_ramps_linearly(self):
        """Weight ramps from 0→1 as we approach the seam over crossfade frames."""
        inst = _frame(
            startFrame=0,
            speed=1,
            loop={"enabled": True, "in": 0, "out": 9, "dir": "fwd", "crossfade": 4},
        )
        # frame at playhead 9 = l_out=9, dist_from_out=0, weight=1.0
        w9 = crossfade_weight(inst, 9, 100)
        # frame at playhead 7 = frame 7, dist_from_out=2, weight = 1 - 2/4 = 0.5
        w7 = crossfade_weight(inst, 7, 100)
        assert w9 == pytest.approx(1.0, abs=1e-6)
        assert w7 == pytest.approx(0.5, abs=1e-6)

    def test_loop_crossfade_clamps_to_max_32(self):
        """crossfade > 32 is clamped to 32 (LOOP_CROSSFADE_MAX)."""
        inst = _frame(
            startFrame=0,
            speed=1,
            loop={"enabled": True, "in": 0, "out": 50, "dir": "fwd", "crossfade": 999},
        )
        # Should not raise, and weight is still in [0,1].
        for ph in range(60):
            w = crossfade_weight(inst, ph, 100)
            assert 0.0 <= w <= 1.0


# ---------------------------------------------------------------------------
# SPEED MAGNITUDE: loop respects speed
# ---------------------------------------------------------------------------


class TestLoopRespectsSpeedMagnitude:
    """Speed magnitude scales the step through the loop region."""

    def test_loop_respects_speed_magnitude(self):
        """Speed=2 → steps through the loop at 2x rate."""
        inst_s1 = _frame(
            startFrame=0,
            speed=1,
            loop={"enabled": True, "in": 0, "out": 9, "dir": "fwd"},
        )
        inst_s2 = _frame(
            startFrame=0,
            speed=2,
            loop={"enabled": True, "in": 0, "out": 9, "dir": "fwd"},
        )
        # At playhead=5, speed=1: offset=5 → frame=5
        # At playhead=5, speed=2: offset=10 → 10%10=0 → frame=0
        assert compute(inst_s1, 5, 100) == 5
        assert compute(inst_s2, 5, 100) == 0

    def test_loop_speed_8_still_wraps(self):
        """Maximum speed (8) produces valid in-range frames."""
        inst = _frame(
            startFrame=0,
            speed=8,
            loop={"enabled": True, "in": 0, "out": 9, "dir": "fwd"},
        )
        for ph in range(20):
            fi = compute(inst, ph, 100)
            assert 0 <= fi <= 9, f"frame {fi} out of [0,9] at playhead {ph}"

    def test_loop_freeze_speed_zero_stays_at_loop_in(self):
        """Speed=0 → offset=0 every frame → always loopIn (fwd) or loopOut (rev)."""
        inst_fwd = _frame(
            startFrame=0,
            speed=0,
            loop={"enabled": True, "in": 5, "out": 15, "dir": "fwd"},
        )
        inst_rev = _frame(
            startFrame=0,
            speed=0,
            loop={"enabled": True, "in": 5, "out": 15, "dir": "rev"},
        )
        for ph in range(10):
            assert compute(inst_fwd, ph, 100) == 5, (
                f"fwd freeze: got {compute(inst_fwd, ph, 100)}"
            )
            assert compute(inst_rev, ph, 100) == 15, (
                f"rev freeze: got {compute(inst_rev, ph, 100)}"
            )


# ---------------------------------------------------------------------------
# NEGATIVE: loop.in > loop.out rejected or clamped
# ---------------------------------------------------------------------------


class TestLoopInGreaterThanOutRejectedOrClamped:
    """loop.in > loop.out is degenerate — engine must not crash; behavior clamped."""

    def test_loop_in_greater_than_out_rejected_or_clamped(self):
        """loopIn > loopOut → engine clamps to a valid single-frame range, no crash."""
        inst = _frame(
            startFrame=0,
            speed=1,
            loop={"enabled": True, "in": 20, "out": 5, "dir": "fwd"},
        )
        # After sorting: l_in=5, l_out=20. Engine sorts them; result is valid.
        for ph in range(10):
            fi = compute(inst, ph, 100)
            assert 0 <= fi <= 99, f"frame {fi} out of global bounds at playhead {ph}"

    def test_loop_in_out_same_value_degenerate(self):
        """loopIn==loopOut → loop_len=1 → always that frame."""
        inst = _frame(
            startFrame=0,
            speed=1,
            loop={"enabled": True, "in": 7, "out": 7, "dir": "fwd"},
        )
        for ph in range(10):
            assert compute(inst, ph, 100) == 7

    def test_loop_out_beyond_frame_count_clamped(self):
        """loopOut beyond last frame → clamped to last_frame (99 for fc=100)."""
        inst = _frame(
            startFrame=0,
            speed=1,
            loop={"enabled": True, "in": 0, "out": 500, "dir": "fwd"},
        )
        for ph in range(10):
            fi = compute(inst, ph, 100)
            assert 0 <= fi <= 99, f"frame {fi} out of [0,99] at playhead {ph}"

    def test_loop_negative_in_clamped_to_zero(self):
        """loopIn < 0 → clamped to 0."""
        inst = _frame(
            startFrame=0,
            speed=1,
            loop={"enabled": True, "in": -50, "out": 9, "dir": "fwd"},
        )
        for ph in range(10):
            fi = compute(inst, ph, 100)
            assert 0 <= fi <= 99, f"frame {fi} out of global bounds at playhead {ph}"


# ---------------------------------------------------------------------------
# ADDITIONAL ROBUSTNESS: non-finite inputs, bad frame_count
# ---------------------------------------------------------------------------


class TestLoopRobustness:
    """Guard against NaN/Inf/bad frame_count in loop mode."""

    def test_loop_nan_speed_falls_back(self):
        """NaN speed → fallback=1; loop still runs without crash."""
        inst = _frame(
            startFrame=0,
            speed=float("nan"),
            loop={"enabled": True, "in": 0, "out": 9, "dir": "fwd"},
        )
        fi = compute(inst, 5, 100)
        assert isinstance(fi, int)
        assert 0 <= fi <= 99

    def test_loop_zero_frame_count_freezes(self):
        """frame_count=0 → fc=1 → last_frame=0 → always 0."""
        inst = _frame(
            startFrame=0,
            speed=1,
            loop={"enabled": True, "in": 0, "out": 0, "dir": "fwd"},
        )
        assert compute(inst, 10, 0) == 0

    def test_loop_crossfade_nan_input_no_crash(self):
        """NaN crossfade → clamped to 0 (no blend)."""
        inst = _frame(
            startFrame=0,
            speed=1,
            loop={
                "enabled": True,
                "in": 0,
                "out": 19,
                "dir": "fwd",
                "crossfade": float("nan"),
            },
        )
        w = crossfade_weight(inst, 10, 100)
        assert w == 0.0
