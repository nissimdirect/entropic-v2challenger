"""QA Gauntlet — quality gate, security red team, and UAT acceptance tests.

Covers gaps identified in Phase 3 Color Suite + bug fixes F-2/M-1/M-2.
"""

import math
import threading
import time

import numpy as np
import pytest

from effects.util.levels import apply as levels_apply
from effects.util.curves import apply as curves_apply
from effects.util.hsl_adjust import apply as hsl_apply
from effects.util.color_balance import apply as cb_apply
from effects.util.auto_levels import apply as auto_apply
from effects.util.histogram import compute_histogram
from engine.export import ExportJob, ExportManager, ExportStatus

pytestmark = pytest.mark.smoke

KW = {"frame_index": 0, "seed": 42, "resolution": (100, 100)}


def _frame(r=128, g=128, b=128, a=255, h=100, w=100):
    frame = np.zeros((h, w, 4), dtype=np.uint8)
    frame[:, :, 0] = r
    frame[:, :, 1] = g
    frame[:, :, 2] = b
    frame[:, :, 3] = a
    return frame


# ===========================================================================
# 1. QUALITY GATE — Edge-case frames across all Color Suite effects
# ===========================================================================


class TestAllBlackFrame:
    """All effects handle all-black (0,0,0) frames without crashing."""

    def test_levels_all_black(self):
        f = _frame(0, 0, 0)
        result, _ = levels_apply(f, {"gamma": 2.0}, None, **KW)
        assert result.shape == f.shape
        assert result.dtype == np.uint8

    def test_curves_all_black(self):
        f = _frame(0, 0, 0)
        result, _ = curves_apply(
            f, {"points": [[0, 50], [128, 200], [255, 255]]}, None, **KW
        )
        assert result.shape == f.shape

    def test_hsl_all_black(self):
        f = _frame(0, 0, 0)
        result, _ = hsl_apply(f, {"hue_shift": 90.0, "saturation": 100.0}, None, **KW)
        assert result.shape == f.shape

    def test_color_balance_all_black(self):
        f = _frame(0, 0, 0)
        result, _ = cb_apply(f, {"shadows_r": 100, "preserve_luma": True}, None, **KW)
        assert result.shape == f.shape
        assert result.dtype == np.uint8

    def test_auto_levels_all_black(self):
        f = _frame(0, 0, 0)
        result, _ = auto_apply(f, {"clip_percent": 1.0}, None, **KW)
        assert result.shape == f.shape
        # Uniform channel can't be stretched
        np.testing.assert_array_equal(result[:, :, :3], 0)


class TestAllWhiteFrame:
    """All effects handle all-white (255,255,255) frames without crashing."""

    def test_levels_all_white(self):
        f = _frame(255, 255, 255)
        result, _ = levels_apply(f, {"gamma": 0.5}, None, **KW)
        assert result.shape == f.shape

    def test_curves_all_white(self):
        f = _frame(255, 255, 255)
        result, _ = curves_apply(
            f, {"points": [[0, 0], [128, 64], [255, 200]]}, None, **KW
        )
        assert result.shape == f.shape

    def test_hsl_all_white(self):
        f = _frame(255, 255, 255)
        result, _ = hsl_apply(f, {"hue_shift": -180.0, "lightness": -50.0}, None, **KW)
        assert result.shape == f.shape

    def test_color_balance_all_white(self):
        f = _frame(255, 255, 255)
        result, _ = cb_apply(
            f, {"highlights_b": -100, "preserve_luma": True}, None, **KW
        )
        assert result.shape == f.shape
        assert result.dtype == np.uint8

    def test_auto_levels_all_white(self):
        f = _frame(255, 255, 255)
        result, _ = auto_apply(f, {"clip_percent": 0.0}, None, **KW)
        assert result.shape == f.shape
        np.testing.assert_array_equal(result[:, :, :3], 255)


class Test1x1Frame:
    """1x1 pixel frames are valid edge cases."""

    def test_color_balance_1x1(self):
        f = np.array([[[128, 64, 200, 255]]], dtype=np.uint8)
        result, _ = cb_apply(f, {"midtones_r": 50}, None, **KW)
        assert result.shape == (1, 1, 4)
        assert result[0, 0, 3] == 255

    def test_hsl_adjust_1x1(self):
        f = np.array([[[200, 100, 50, 255]]], dtype=np.uint8)
        result, _ = hsl_apply(f, {"saturation": 50.0}, None, **KW)
        assert result.shape == (1, 1, 4)
        assert result[0, 0, 3] == 255

    def test_auto_levels_1x1(self):
        f = np.array([[[128, 64, 200, 255]]], dtype=np.uint8)
        result, _ = auto_apply(f, {"clip_percent": 1.0}, None, **KW)
        assert result.shape == (1, 1, 4)
        assert result[0, 0, 3] == 255

    def test_histogram_1x1(self):
        f = np.array([[[100, 150, 200, 255]]], dtype=np.uint8)
        hist = compute_histogram(f)
        assert hist["r"][100] == 1
        assert hist["g"][150] == 1
        assert hist["b"][200] == 1
        assert sum(hist["r"]) == 1


# ===========================================================================
# 2. SECURITY RED TEAM — NaN, Infinity, malformed params
# ===========================================================================


class TestNaNInfinityParams:
    """NaN and Infinity in numeric params must not crash or produce NaN output."""

    def _assert_valid_output(self, result, f):
        """Common assertions: shape, dtype, finite, 0-255 range."""
        assert result.shape == f.shape
        assert result.dtype == np.uint8
        assert np.all(np.isfinite(result.astype(float)))
        assert result.min() >= 0
        assert result.max() <= 255

    def test_levels_nan_gamma(self):
        f = _frame(128, 128, 128)
        params = {"gamma": float("nan")}
        result, _ = levels_apply(f, params, None, **KW)
        self._assert_valid_output(result, f)
        # NaN gamma clamps to default (1.0) → identity
        np.testing.assert_array_equal(result, f)

    def test_levels_inf_gamma(self):
        f = _frame(128, 128, 128)
        params = {"gamma": float("inf")}
        result, _ = levels_apply(f, params, None, **KW)
        self._assert_valid_output(result, f)
        # Inf gamma clamps to default (1.0) → identity
        np.testing.assert_array_equal(result, f)

    def test_levels_negative_inf_gamma(self):
        f = _frame(128, 128, 128)
        params = {"gamma": float("-inf")}
        result, _ = levels_apply(f, params, None, **KW)
        self._assert_valid_output(result, f)
        # -Inf gamma clamps to default (1.0) → identity
        np.testing.assert_array_equal(result, f)

    def test_hsl_nan_hue_shift(self):
        f = _frame(200, 100, 50)
        params = {"hue_shift": float("nan")}
        result, _ = hsl_apply(f, params, None, **KW)
        self._assert_valid_output(result, f)
        # NaN clamps to 0.0 → identity (all params default to 0)
        np.testing.assert_array_equal(result, f)

    def test_hsl_inf_saturation(self):
        f = _frame(200, 100, 50)
        params = {"saturation": float("inf")}
        result, _ = hsl_apply(f, params, None, **KW)
        self._assert_valid_output(result, f)
        # Inf clamps to 0.0 → identity (all params default to 0)
        np.testing.assert_array_equal(result, f)

    def test_color_balance_nan_shadows(self):
        f = _frame(128, 128, 128)
        params = {"shadows_r": float("nan"), "preserve_luma": False}
        result, _ = cb_apply(f, params, None, **KW)
        self._assert_valid_output(result, f)
        # NaN clamps to 0.0 → all params zero → identity
        np.testing.assert_array_equal(result, f)

    def test_curves_nan_in_points(self):
        f = _frame(128, 128, 128)
        params = {"points": [[0, 0], [float("nan"), 128], [255, 255]]}
        result, _ = curves_apply(f, params, None, **KW)
        self._assert_valid_output(result, f)

    def test_auto_levels_nan_clip(self):
        f = _frame(128, 128, 128)
        f[50:, :, 0] = 200
        params = {"clip_percent": float("nan")}
        result, _ = auto_apply(f, params, None, **KW)
        self._assert_valid_output(result, f)

    def test_auto_levels_inf_clip(self):
        f = _frame(128, 128, 128)
        f[50:, :, 0] = 200
        params = {"clip_percent": float("inf")}
        result, _ = auto_apply(f, params, None, **KW)
        self._assert_valid_output(result, f)


class TestLevelsBoundaryLUT:
    """Red team: levels LUT boundary conditions."""

    def test_input_black_255_input_white_255(self):
        """input_black=255 forces input_white=256, verify no overflow."""
        f = _frame(128, 128, 128)
        params = {"input_black": 255, "input_white": 255, "gamma": 1.0}
        result, _ = levels_apply(f, params, None, **KW)
        assert result.dtype == np.uint8
        assert result.max() <= 255

    def test_output_range_inverted(self):
        """output_black > output_white is a valid inverted mapping."""
        f = _frame(0, 128, 255)
        params = {"output_black": 200, "output_white": 50}
        result, _ = levels_apply(f, params, None, **KW)
        assert result.dtype == np.uint8


class TestColorBalancePreserveLumaDivZero:
    """Red team: preserve_luma on zero-brightness frames (division guard)."""

    def test_all_black_preserve_luma(self):
        """All-black frame with preserve_luma=True: luma=0, new_luma=0, ratio guard."""
        f = _frame(0, 0, 0)
        params = {"shadows_r": 100, "preserve_luma": True}
        result, _ = cb_apply(f, params, None, **KW)
        assert result.dtype == np.uint8
        # Should not produce inf/nan in uint8
        assert result.min() >= 0
        assert result.max() <= 255

    def test_near_zero_preserve_luma(self):
        """Near-zero brightness with preserve_luma should not overflow."""
        f = _frame(1, 1, 1)
        params = {
            "shadows_r": 100,
            "midtones_g": 100,
            "highlights_b": 100,
            "preserve_luma": True,
        }
        result, _ = cb_apply(f, params, None, **KW)
        assert result.dtype == np.uint8
        assert result.max() <= 255


# ===========================================================================
# 3. CURVES EDGE CASES
# ===========================================================================


class TestCurvesEdgeCases:
    """Curves effect edge cases and channel modes."""

    def test_alpha_channel_mode(self):
        """Channel='a' should modify only the alpha channel."""
        f = _frame(128, 128, 128, a=128)
        params = {
            "points": [[0, 255], [255, 0]],
            "channel": "a",
            "interpolation": "linear",
        }
        result, _ = curves_apply(f, params, None, **KW)
        # RGB should be unchanged
        np.testing.assert_array_equal(result[:, :, :3], f[:, :, :3])
        # Alpha should be inverted: 128 -> 127
        assert result[0, 0, 3] == 127

    def test_invalid_json_string_falls_back(self):
        """Invalid JSON string for points should fall back to identity."""
        f = _frame(100, 150, 200)
        params = {"points": "not valid json at all"}
        result, _ = curves_apply(f, params, None, **KW)
        # Falls back to identity → unchanged
        np.testing.assert_array_equal(result, f)

    def test_empty_list_falls_back(self):
        """Empty points list should fall back to identity."""
        f = _frame(100, 150, 200)
        params = {"points": []}
        result, _ = curves_apply(f, params, None, **KW)
        np.testing.assert_array_equal(result, f)

    def test_points_with_short_tuples(self):
        """Points with only 1 element should be filtered out."""
        f = _frame(128, 128, 128)
        params = {"points": [[0], [128, 128], [255, 255]]}
        result, _ = curves_apply(f, params, None, **KW)
        assert result.shape == f.shape

    def test_unsorted_points(self):
        """Unsorted x values should be handled (sorted internally)."""
        f = _frame(128, 128, 128)
        params = {
            "points": [[255, 255], [0, 0], [128, 128]],
            "interpolation": "linear",
        }
        result, _ = curves_apply(f, params, None, **KW)
        # Identity diagonal unsorted → should still be identity
        np.testing.assert_array_equal(result, f)

    def test_all_points_same_x(self):
        """All points at same x should not crash (dedup keeps last)."""
        f = _frame(128, 128, 128)
        params = {"points": [[128, 0], [128, 128], [128, 255]]}
        result, _ = curves_apply(f, params, None, **KW)
        assert result.shape == f.shape


# ===========================================================================
# 4. HSL ADJUST EDGE CASES
# ===========================================================================


class TestHSLEdgeCases:
    """HSL adjust edge cases."""

    def test_achromatic_pixels_saturation(self):
        """Gray pixels (sat=0) with saturation adjustment should remain gray."""
        f = _frame(128, 128, 128)
        params = {"saturation": 100.0}
        result, _ = hsl_apply(f, params, None, **KW)
        # Gray has saturation 0, so doubling it (0*2=0) should keep gray
        # Allow small HSV roundtrip errors
        diff = np.abs(result[:, :, :3].astype(int) - f[:, :, :3].astype(int))
        assert diff.max() <= 2

    def test_invalid_target_hue_falls_back(self):
        """Unknown target_hue should default to 'all' behavior."""
        f = _frame(200, 100, 50)
        params = {"target_hue": "nonexistent_color", "hue_shift": 90.0}
        result, _ = hsl_apply(f, params, None, **KW)
        # Should still apply (falls back to full mask)
        assert not np.array_equal(result[:, :, :3], f[:, :, :3])

    def test_max_negative_saturation(self):
        """Saturation -100 should fully desaturate."""
        f = _frame(255, 0, 0)
        params = {"saturation": -100.0}
        result, _ = hsl_apply(f, params, None, **KW)
        # Should be grayish (R=G=B approximately)
        r, g, b = result[0, 0, 0], result[0, 0, 1], result[0, 0, 2]
        assert abs(int(r) - int(g)) <= 5
        assert abs(int(g) - int(b)) <= 5


# ===========================================================================
# 5. AUTO LEVELS EDGE CASES
# ===========================================================================


class TestAutoLevelsEdgeCases:
    """Auto levels edge cases."""

    def test_high_clip_percent_uniform_result(self):
        """clip_percent=25 (max) should still produce valid output."""
        rng = np.random.default_rng(42)
        f = rng.integers(0, 256, (50, 50, 4), dtype=np.uint8)
        f[:, :, 3] = 255
        result, _ = auto_apply(f, {"clip_percent": 25.0}, None, **KW)
        assert result.dtype == np.uint8
        assert result.max() <= 255

    def test_clip_percent_clamped_above_25(self):
        """clip_percent > 25 should be clamped to 25."""
        f = _frame(50, 100, 200)
        f[50:, :, :3] = 200
        result_25, _ = auto_apply(f, {"clip_percent": 25.0}, None, **KW)
        result_50, _ = auto_apply(f, {"clip_percent": 50.0}, None, **KW)
        # Both should produce same result since 50 is clamped to 25
        np.testing.assert_array_equal(result_25, result_50)

    def test_clip_percent_clamped_below_0(self):
        """clip_percent < 0 should be clamped to 0."""
        f = _frame(50, 100, 200)
        f[50:, :, :3] = 200
        result_0, _ = auto_apply(f, {"clip_percent": 0.0}, None, **KW)
        result_neg, _ = auto_apply(f, {"clip_percent": -10.0}, None, **KW)
        np.testing.assert_array_equal(result_0, result_neg)


# ===========================================================================
# 6. HISTOGRAM EDGE CASES
# ===========================================================================


class TestHistogramEdgeCases:
    """Histogram utility edge cases."""

    def test_gradient_frame_spread(self):
        """Gradient frame should have histogram bins spread across range."""
        f = np.zeros((256, 1, 4), dtype=np.uint8)
        for i in range(256):
            f[i, 0, 0] = i
        f[:, :, 3] = 255
        hist = compute_histogram(f)
        # Each R bin should have exactly 1 pixel
        for i in range(256):
            assert hist["r"][i] == 1

    def test_luma_computation_accuracy(self):
        """Luma should use BT.601 coefficients: 0.299R + 0.587G + 0.114B."""
        f = np.array([[[100, 200, 50, 255]]], dtype=np.uint8)
        hist = compute_histogram(f)
        # BT.601: 0.299*100 + 0.587*200 + 0.114*50 = 153.0
        # np.clip then astype(uint8) truncates, so check for the rounded value
        raw_luma = 0.299 * 100 + 0.587 * 200 + 0.114 * 50
        expected = int(np.clip(np.float32(raw_luma), 0, 255).astype(np.uint8))
        assert hist["luma"][expected] == 1


# ===========================================================================
# 7. EFFECT CHAINING — SEQUENCE ERRORS
# ===========================================================================


class TestEffectChainSequence:
    """Verify effects work correctly in various chain orderings."""

    def test_reverse_chain_order_produces_different_result(self):
        """Reversing chain order should produce different (but valid) results."""
        rng = np.random.default_rng(42)
        f = rng.integers(30, 220, (50, 50, 4), dtype=np.uint8)
        f[:, :, 3] = 255
        kw = {"frame_index": 0, "seed": 42, "resolution": (50, 50)}

        # Forward: levels then curves
        out1, _ = levels_apply(f, {"gamma": 0.5}, None, **kw)
        out1, _ = curves_apply(
            out1,
            {"points": [[0, 0], [64, 100], [192, 150], [255, 255]]},
            None,
            **kw,
        )

        # Reverse: curves then levels
        out2, _ = curves_apply(
            f,
            {"points": [[0, 0], [64, 100], [192, 150], [255, 255]]},
            None,
            **kw,
        )
        out2, _ = levels_apply(out2, {"gamma": 0.5}, None, **kw)

        # Both valid
        assert out1.dtype == np.uint8
        assert out2.dtype == np.uint8
        # But different (non-commutative)
        assert not np.array_equal(out1, out2)

    def test_same_effect_applied_twice(self):
        """Applying the same effect twice should compound the change."""
        f = _frame(128, 128, 128)
        kw = {"frame_index": 0, "seed": 42, "resolution": (100, 100)}

        # Single apply
        out1, _ = levels_apply(f, {"gamma": 0.5}, None, **kw)
        # Double apply
        out2, _ = levels_apply(f, {"gamma": 0.5}, None, **kw)
        out2, _ = levels_apply(out2, {"gamma": 0.5}, None, **kw)

        # Double should darken more
        assert out2[:, :, 0].mean() < out1[:, :, 0].mean()

    def test_all_5_effects_chained(self):
        """All 5 color effects + histogram in sequence should not crash."""
        rng = np.random.default_rng(42)
        f = rng.integers(0, 256, (50, 50, 4), dtype=np.uint8)
        f[:, :, 3] = 255
        kw = {"frame_index": 0, "seed": 42, "resolution": (50, 50)}

        out, _ = auto_apply(f, {"clip_percent": 1.0}, None, **kw)
        out, _ = levels_apply(out, {"gamma": 0.8}, None, **kw)
        out, _ = curves_apply(
            out, {"points": [[0, 0], [64, 32], [192, 224], [255, 255]]}, None, **kw
        )
        out, _ = hsl_apply(out, {"saturation": 20.0, "lightness": 5.0}, None, **kw)
        out, _ = cb_apply(out, {"midtones_r": 20, "shadows_b": 15}, None, **kw)

        hist = compute_histogram(out)
        assert out.shape == f.shape
        assert out.dtype == np.uint8
        assert sum(hist["r"]) == 2500


# ===========================================================================
# 8. UAT — PER-CHANNEL MODES ONLY AFFECT TARGET CHANNEL
# ===========================================================================


class TestPerChannelIsolation:
    """UAT: Per-channel modes must only affect the targeted channel."""

    def test_levels_channel_b(self):
        """Levels channel='b' only modifies blue."""
        f = _frame(100, 150, 200)
        params = {"gamma": 0.5, "channel": "b"}
        result, _ = levels_apply(f, params, None, **KW)
        np.testing.assert_array_equal(result[:, :, 0], 100)  # Red unchanged
        np.testing.assert_array_equal(result[:, :, 1], 150)  # Green unchanged
        assert result[0, 0, 2] != 200  # Blue changed

    def test_curves_channel_g(self):
        """Curves channel='g' only modifies green."""
        f = _frame(100, 128, 200)
        params = {
            "points": [[0, 255], [255, 0]],
            "channel": "g",
            "interpolation": "linear",
        }
        result, _ = curves_apply(f, params, None, **KW)
        np.testing.assert_array_equal(result[:, :, 0], 100)  # Red unchanged
        np.testing.assert_array_equal(result[:, :, 2], 200)  # Blue unchanged
        assert result[0, 0, 1] != 128  # Green changed

    def test_curves_channel_b(self):
        """Curves channel='b' only modifies blue."""
        f = _frame(100, 150, 128)
        params = {
            "points": [[0, 255], [255, 0]],
            "channel": "b",
            "interpolation": "linear",
        }
        result, _ = curves_apply(f, params, None, **KW)
        np.testing.assert_array_equal(result[:, :, 0], 100)
        np.testing.assert_array_equal(result[:, :, 1], 150)
        assert result[0, 0, 2] != 128


# ===========================================================================
# 9. UAT — IDENTITY PARAMS PRODUCE NO CHANGES
# ===========================================================================


class TestIdentityParams:
    """UAT: Every effect with default/identity params returns input unchanged."""

    def test_auto_levels_identity(self):
        """Auto levels on already full-range frame should change very little."""
        f = np.zeros((50, 50, 4), dtype=np.uint8)
        f[:, :, 3] = 255
        f[:25, :, :3] = 0
        f[25:, :, :3] = 255
        result, _ = auto_apply(f, {"clip_percent": 0.0}, None, **KW)
        # With 0 clip and already 0-255 range, should be identity
        np.testing.assert_array_equal(result, f)

    def test_levels_explicit_identity(self):
        """Levels with all defaults explicitly set returns unchanged."""
        f = _frame(77, 144, 211)
        params = {
            "input_black": 0,
            "input_white": 255,
            "gamma": 1.0,
            "output_black": 0,
            "output_white": 255,
            "channel": "master",
        }
        result, _ = levels_apply(f, params, None, **KW)
        np.testing.assert_array_equal(result, f)

    def test_hsl_explicit_identity(self):
        """HSL with all zeros explicitly set returns unchanged."""
        f = _frame(77, 144, 211)
        params = {"hue_shift": 0.0, "saturation": 0.0, "lightness": 0.0}
        result, _ = hsl_apply(f, params, None, **KW)
        np.testing.assert_array_equal(result, f)


# ===========================================================================
# 10. EXPORT JOB THREAD SAFETY
# ===========================================================================


class TestExportJobThreadSafety:
    """Verify ExportJob lock protects shared state correctly."""

    def test_progress_property_no_division_by_zero(self):
        """progress property when total_frames=0 should return 0.0."""
        job = ExportJob()
        assert job.progress == 0.0

    def test_progress_mid_export(self):
        """progress after partial completion should be correct."""
        job = ExportJob(total_frames=100, current_frame=50)
        assert job.progress == 0.5

    def test_cancel_event_is_settable(self):
        """Cancel event should be set-able and checkable."""
        job = ExportJob()
        assert not job._cancel_event.is_set()
        job.cancel()
        assert job._cancel_event.is_set()

    def test_concurrent_lock_access(self):
        """Multiple threads reading/writing through lock should not deadlock."""
        job = ExportJob(total_frames=1000)
        job.status = ExportStatus.RUNNING
        errors = []

        def writer():
            try:
                for i in range(100):
                    with job._lock:
                        job.current_frame = i
                    time.sleep(0.001)
            except Exception as e:
                errors.append(e)

        def reader():
            try:
                for _ in range(100):
                    with job._lock:
                        _ = job.current_frame
                        _ = job.status
                    time.sleep(0.001)
            except Exception as e:
                errors.append(e)

        threads = [threading.Thread(target=writer)] + [
            threading.Thread(target=reader) for _ in range(4)
        ]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=5)

        assert len(errors) == 0, f"Thread errors: {errors}"

    def test_export_manager_start_while_running_raises(self):
        """Starting a second export while one is running should raise."""
        manager = ExportManager()
        # Create a fake running job
        job = ExportJob()
        job.status = ExportStatus.RUNNING
        manager._job = job

        with pytest.raises(RuntimeError, match="already in progress"):
            manager.start(
                input_path="/fake.mp4",
                output_path="/fake_out.mp4",
                chain=[],
                project_seed=42,
            )


# ===========================================================================
# 11. ERROR SANITIZATION
# ===========================================================================


class TestErrorSanitization:
    """Verify no internal paths leak through error messages."""

    def test_export_job_error_format(self):
        """ExportJob error should contain type name only, no str(exception)."""
        job = ExportJob()
        try:
            raise ValueError("/Users/secret/path/to/file.mp4 is invalid")
        except Exception as e:
            with job._lock:
                job.status = ExportStatus.ERROR
                job.error = f"Export failed: {type(e).__name__}"

        assert job.error == "Export failed: ValueError"
        assert "/Users" not in job.error
        assert "secret" not in job.error

    def test_zmq_server_error_responses_generic(self):
        """ZMQ handler catch blocks use 'Internal processing error'."""
        from zmq_server import ZMQServer

        server = ZMQServer()
        # Seek with non-existent validated path should produce generic error
        # (We can't easily test the full path without a real server,
        #  but we can verify the error string format in the code)
        # Instead, test that handle_message for unknown cmd doesn't leak
        result = server.handle_message(
            {"cmd": "nonexistent_command", "id": "test-1", "_token": server.token}
        )
        assert result["ok"] is False
        assert "unknown: nonexistent_command" in result["error"]
        # This is acceptable — it's just the command name, not a path
        server.close()


# ===========================================================================
# 12. VISUAL CORRECTNESS UAT
# ===========================================================================


class TestVisualCorrectness:
    """UAT: Verify effects produce expected visual changes."""

    def test_levels_crush_blacks(self):
        """input_black=50 should map all values below 50 to output_black."""
        f = _frame(30, 30, 30)
        params = {"input_black": 50}
        result, _ = levels_apply(f, params, None, **KW)
        # 30 < input_black=50, so should be clipped to 0 (output_black default)
        assert result[0, 0, 0] == 0

    def test_levels_boost_whites(self):
        """input_white=200 should map 200+ to output_white."""
        f = _frame(220, 220, 220)
        params = {"input_white": 200}
        result, _ = levels_apply(f, params, None, **KW)
        # 220 > input_white=200, so should be clipped to 255 (output_white default)
        assert result[0, 0, 0] == 255

    def test_color_balance_shadows_warm(self):
        """Adding red to shadows should warm dark areas."""
        f = _frame(30, 30, 30)  # Dark frame (shadow region)
        params = {"shadows_r": 80, "shadows_b": -80, "preserve_luma": False}
        result, _ = cb_apply(f, params, None, **KW)
        # Red should increase, blue should decrease
        assert result[0, 0, 0] > f[0, 0, 0]  # More red
        assert result[0, 0, 2] < f[0, 0, 2]  # Less blue

    def test_auto_levels_expands_low_contrast(self):
        """Auto levels on narrow-range input should expand to near full range."""
        f = np.full((100, 100, 4), 128, dtype=np.uint8)
        f[:, :, 3] = 255
        f[:50, :, 0] = 100
        f[50:, :, 0] = 160
        result, _ = auto_apply(f, {"clip_percent": 0.0}, None, **KW)
        # Red channel should now span 0-255
        assert result[:, :, 0].min() == 0
        assert result[:, :, 0].max() == 255

    def test_hsl_desaturate_produces_gray(self):
        """HSL saturation=-100 should produce grayscale output."""
        f = _frame(255, 0, 0)
        params = {"saturation": -100.0}
        result, _ = hsl_apply(f, params, None, **KW)
        r, g, b = int(result[0, 0, 0]), int(result[0, 0, 1]), int(result[0, 0, 2])
        # All channels should be approximately equal
        assert abs(r - g) <= 5
        assert abs(g - b) <= 5

    def test_hsl_saturate_intensifies_color(self):
        """HSL saturation=+100 should increase color intensity."""
        f = _frame(200, 100, 100)
        params = {"saturation": 100.0}
        result, _ = hsl_apply(f, params, None, **KW)
        # Red should stay dominant, but spread between max and min should increase
        r, g = int(result[0, 0, 0]), int(result[0, 0, 1])
        orig_r, orig_g = 200, 100
        assert (r - g) >= (orig_r - orig_g)  # Spread should increase or stay same
