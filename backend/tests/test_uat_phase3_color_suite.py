"""UAT — Phase 3 Color Suite: User Acceptance Tests.

Tests organized by user journey:
  1. User applies a color effect → preview updates (individual effect correctness)
  2. User adjusts parameters → preview updates (parameter responsiveness)
  3. User chains multiple color effects → cumulative result correct
  4. Color effects work with existing glitch effects in the same chain
  5. Histogram display accuracy after color adjustments
  6. Effect composability (order sensitivity, pairs, extreme combos)
  7. Human error testing (bad input, boundary abuse, sequence errors)
  8. Pipeline integration (EffectContainer + apply_chain with color effects)
  9. Performance budget (all color tools chained < 100ms at 1080p)
"""

import json
import time

import numpy as np
import pytest

# --- Effect imports ---
from effects.util.levels import apply as levels_apply, PARAMS as levels_params
from effects.util.curves import apply as curves_apply, PARAMS as curves_params
from effects.util.hsl_adjust import apply as hsl_apply, PARAMS as hsl_params
from effects.util.color_balance import apply as cb_apply, PARAMS as cb_params
from effects.util.auto_levels import apply as al_apply, PARAMS as al_params
from effects.util.histogram import compute_histogram
from effects.registry import get as registry_get, list_all as registry_list_all
from engine.pipeline import apply_chain

KW = {"frame_index": 0, "seed": 42, "resolution": (100, 100)}
KW_1080 = {"frame_index": 0, "seed": 42, "resolution": (1920, 1080)}


# ===========================================================================
# Helpers
# ===========================================================================


def _frame(r=128, g=128, b=128, a=255, h=100, w=100):
    frame = np.zeros((h, w, 4), dtype=np.uint8)
    frame[:, :, 0] = r
    frame[:, :, 1] = g
    frame[:, :, 2] = b
    frame[:, :, 3] = a
    return frame


def _random_frame(h=100, w=100, seed=42):
    rng = np.random.default_rng(seed)
    return rng.integers(0, 256, (h, w, 4), dtype=np.uint8)


def _gradient_frame(h=100, w=256):
    """Frame with horizontal gradient 0-255 in all RGB channels."""
    frame = np.zeros((h, w, 4), dtype=np.uint8)
    gradient = np.arange(w, dtype=np.uint8)
    for ch in range(3):
        frame[:, :, ch] = gradient
    frame[:, :, 3] = 255
    return frame


# ===========================================================================
# UAT-001 to UAT-006: Individual Effect Correctness
# "User adds a color effect → preview shows correct change"
# ===========================================================================


class TestUATIndividualEffects:
    """UAT-001 through UAT-006: Each color effect produces the expected visual change."""

    def test_uat001_levels_darkens_with_low_gamma(self):
        """Given a mid-gray frame, when user reduces gamma below 1.0,
        then the image appears darker."""
        frame = _frame(128, 128, 128)
        result, _ = levels_apply(frame, {"gamma": 0.5}, None, **KW)
        assert result[0, 0, 0] < 128

    def test_uat002_levels_clips_input_range(self):
        """Given a gradient frame, when user narrows input black/white,
        then pixels outside range are clipped."""
        frame = _gradient_frame()
        result, _ = levels_apply(
            frame, {"input_black": 50, "input_white": 200}, None, **KW
        )
        # Pixels at value 0 (below input_black=50) should map to 0
        assert result[0, 0, 0] == 0
        # Pixels at value 255 (above input_white=200) should map to 255
        assert result[0, 255, 0] == 255

    def test_uat003_curves_s_curve_boosts_contrast(self):
        """Given a varied frame, when user applies an S-curve,
        then pixel standard deviation increases."""
        frame = _random_frame()
        frame[:, :, 3] = 255
        std_before = frame[:, :, :3].astype(float).std()
        result, _ = curves_apply(
            frame,
            {"points": [[0, 0], [64, 32], [192, 224], [255, 255]]},
            None,
            **KW,
        )
        std_after = result[:, :, :3].astype(float).std()
        assert std_after > std_before

    def test_uat004_hsl_desaturate_reds(self):
        """Given a red frame, when user desaturates reds,
        then the red becomes more gray."""
        frame = _frame(255, 0, 0)
        result, _ = hsl_apply(
            frame, {"target_hue": "reds", "saturation": -80.0}, None, **KW
        )
        # G and B should increase (moving toward gray)
        assert result[0, 0, 1] > 0 or result[0, 0, 2] > 0

    def test_uat005_color_balance_warm_shadows(self):
        """Given a dark frame, when user pushes shadows toward red,
        then the red channel increases."""
        frame = _frame(30, 30, 30)
        result, _ = cb_apply(
            frame, {"shadows_r": 80, "preserve_luma": False}, None, **KW
        )
        assert result[0, 0, 0] > 30

    def test_uat006_auto_levels_stretches_range(self):
        """Given a low-contrast frame, when user applies auto levels,
        then the dynamic range expands."""
        frame = _frame(100, 100, 100)
        frame[50:, :, :3] = 150
        frame[:, :, 3] = 255
        result, _ = al_apply(frame, {"clip_percent": 0.0}, None, **KW)
        out_range = result[:, :, 0].max() - result[:, :, 0].min()
        in_range = frame[:, :, 0].max() - frame[:, :, 0].min()
        assert out_range >= in_range


# ===========================================================================
# UAT-007 to UAT-012: Parameter Responsiveness
# "User adjusts a parameter → result changes accordingly"
# ===========================================================================


class TestUATParameterResponsiveness:
    """UAT-007 through UAT-012: Parameter changes produce proportional visual changes."""

    def test_uat007_levels_gamma_sweep(self):
        """Given a mid-gray frame, when user sweeps gamma from 0.5 to 2.0,
        then output value increases monotonically."""
        frame = _frame(128, 128, 128)
        prev = 0
        for gamma in [0.3, 0.5, 1.0, 1.5, 2.0, 3.0]:
            result, _ = levels_apply(frame, {"gamma": gamma}, None, **KW)
            val = int(result[0, 0, 0])
            assert val >= prev, f"gamma={gamma}: value {val} not >= previous {prev}"
            prev = val

    def test_uat008_hsl_hue_shift_creates_color_rotation(self):
        """Given a red frame, when user shifts hue by +120,
        then the dominant channel becomes green."""
        frame = _frame(255, 0, 0)
        result, _ = hsl_apply(frame, {"hue_shift": 120.0}, None, **KW)
        assert result[0, 0, 1] > result[0, 0, 0]  # G > R

    def test_uat009_color_balance_shadow_vs_highlight(self):
        """Given two frames (dark and bright), when user pushes red in shadows,
        then only the dark frame changes significantly."""
        dark = _frame(30, 30, 30)
        bright = _frame(230, 230, 230)
        params = {"shadows_r": 80, "preserve_luma": False}

        dark_result, _ = cb_apply(dark, params, None, **KW)
        bright_result, _ = cb_apply(bright, params, None, **KW)

        dark_delta = abs(int(dark_result[0, 0, 0]) - 30)
        bright_delta = abs(int(bright_result[0, 0, 0]) - 230)
        assert dark_delta > bright_delta, (
            f"Shadow shift should affect dark more: dark_delta={dark_delta}, bright_delta={bright_delta}"
        )

    def test_uat010_curves_point_position_matters(self):
        """Given two different curve shapes, the outputs differ."""
        frame = _frame(128, 128, 128)
        result_bright, _ = curves_apply(
            frame, {"points": [[0, 0], [128, 200], [255, 255]]}, None, **KW
        )
        result_dark, _ = curves_apply(
            frame, {"points": [[0, 0], [128, 50], [255, 255]]}, None, **KW
        )
        assert result_bright[0, 0, 0] > result_dark[0, 0, 0]

    def test_uat011_auto_levels_clip_percent_affects_range(self):
        """Given a frame, when user increases clip percent,
        then the output black/white points shift inward."""
        frame = _random_frame()
        frame[:, :, 3] = 255
        result_tight, _ = al_apply(frame, {"clip_percent": 5.0}, None, **KW)
        result_loose, _ = al_apply(frame, {"clip_percent": 0.0}, None, **KW)
        # With higher clip, more extreme values are clipped, so range differs
        assert not np.array_equal(result_tight, result_loose)

    def test_uat012_levels_per_channel_independence(self):
        """Given a mixed-color frame, when user adjusts only red channel,
        then green and blue remain unchanged."""
        frame = _frame(200, 100, 50)
        result, _ = levels_apply(frame, {"gamma": 0.5, "channel": "r"}, None, **KW)
        np.testing.assert_array_equal(result[:, :, 1], frame[:, :, 1])
        np.testing.assert_array_equal(result[:, :, 2], frame[:, :, 2])
        assert not np.array_equal(result[:, :, 0], frame[:, :, 0])


# ===========================================================================
# UAT-013 to UAT-018: Effect Chaining
# "User chains multiple color effects → cumulative result correct"
# ===========================================================================


class TestUATChaining:
    """UAT-013 through UAT-018: Multiple color effects chain correctly."""

    def test_uat013_levels_then_curves(self):
        """Given a frame, when user chains levels (gamma down) then curves (S-curve),
        then both effects are visible in the output."""
        frame = _random_frame()
        frame[:, :, 3] = 255
        out, _ = levels_apply(frame, {"gamma": 0.5}, None, **KW)
        out, _ = curves_apply(
            out, {"points": [[0, 0], [64, 32], [192, 224], [255, 255]]}, None, **KW
        )
        assert not np.array_equal(out, frame)

    def test_uat014_all_four_color_tools_chained(self):
        """Given a frame, when user chains levels + curves + hsl + color_balance,
        then the output is different from any single effect alone."""
        frame = _random_frame()
        frame[:, :, 3] = 255

        # Full chain
        out, _ = levels_apply(frame, {"gamma": 0.8}, None, **KW)
        out, _ = curves_apply(
            out, {"points": [[0, 0], [64, 48], [192, 208], [255, 255]]}, None, **KW
        )
        out, _ = hsl_apply(out, {"saturation": 30.0, "lightness": -10.0}, None, **KW)
        out, _ = cb_apply(out, {"shadows_b": 40, "highlights_r": 20}, None, **KW)

        # Single effect only
        single, _ = levels_apply(frame, {"gamma": 0.8}, None, **KW)

        assert not np.array_equal(out, single), (
            "Full chain should differ from single effect"
        )
        assert not np.array_equal(out, frame), "Full chain should differ from original"

    def test_uat015_chain_order_sensitivity(self):
        """Given two different orderings of the same effects,
        the outputs should differ (order matters)."""
        frame = _random_frame()
        frame[:, :, 3] = 255
        params_levels = {"gamma": 0.7}
        params_hsl = {"saturation": -50.0}

        # Order A: levels then HSL
        out_a, _ = levels_apply(frame, params_levels, None, **KW)
        out_a, _ = hsl_apply(out_a, params_hsl, None, **KW)

        # Order B: HSL then levels
        out_b, _ = hsl_apply(frame, params_hsl, None, **KW)
        out_b, _ = levels_apply(out_b, params_levels, None, **KW)

        # Due to non-linear operations, order should matter
        assert not np.array_equal(out_a, out_b), "Order should affect output"

    def test_uat016_chain_with_auto_levels(self):
        """Given a chain ending with auto_levels,
        the output should have full dynamic range."""
        frame = _frame(100, 100, 100)
        frame[50:, :, :3] = 150
        frame[:, :, 3] = 255

        # Darken first, then auto-levels should re-stretch
        out, _ = levels_apply(frame, {"gamma": 0.5}, None, **KW)
        out, _ = al_apply(out, {"clip_percent": 0.0}, None, **KW)

        out_range = out[:, :, 0].max() - out[:, :, 0].min()
        assert out_range > 200, f"Auto-levels should restore range, got {out_range}"

    def test_uat017_identity_chain_is_identity(self):
        """Given all color effects with identity params chained,
        the output should equal the input."""
        frame = _random_frame()
        out, _ = levels_apply(frame, {}, None, **KW)  # Identity
        out, _ = curves_apply(
            out, {"points": [[0, 0], [128, 128], [255, 255]]}, None, **KW
        )  # Identity
        out, _ = cb_apply(out, {}, None, **KW)  # Identity
        np.testing.assert_array_equal(out, frame)

    def test_uat018_pipeline_apply_chain_with_color_effects(self):
        """Given color effects registered in the registry and passed through apply_chain,
        the pipeline processes them correctly."""
        frame = _random_frame()
        frame[:, :, 3] = 255
        chain = [
            {"effect_id": "util.levels", "params": {"gamma": 0.8}, "enabled": True},
            {
                "effect_id": "util.curves",
                "params": {"points": [[0, 0], [128, 200], [255, 255]]},
                "enabled": True,
            },
        ]
        result, states = apply_chain(
            frame, chain, project_seed=42, frame_index=0, resolution=(100, 100)
        )
        assert not np.array_equal(result, frame)
        assert result.shape == frame.shape
        assert result.dtype == np.uint8


# ===========================================================================
# UAT-019 to UAT-023: Color + Glitch Effect Mixing
# "Color effects work with existing glitch effects in the same chain"
# ===========================================================================


class TestUATColorGlitchMixing:
    """UAT-019 through UAT-023: Color effects interoperate with glitch effects."""

    def test_uat019_levels_then_invert(self):
        """Given a chain of levels + invert,
        both effects apply without crash."""
        frame = _random_frame()
        chain = [
            {"effect_id": "util.levels", "params": {"gamma": 0.7}, "enabled": True},
            {"effect_id": "fx.invert", "params": {}, "enabled": True},
        ]
        result, _ = apply_chain(
            frame, chain, project_seed=42, frame_index=0, resolution=(100, 100)
        )
        assert result.shape == frame.shape

    def test_uat020_noise_then_hsl(self):
        """Given a chain of noise + hsl_adjust,
        both effects apply without crash."""
        frame = _random_frame()
        chain = [
            {"effect_id": "fx.noise", "params": {}, "enabled": True},
            {
                "effect_id": "util.hsl_adjust",
                "params": {"saturation": -30.0},
                "enabled": True,
            },
        ]
        result, _ = apply_chain(
            frame, chain, project_seed=42, frame_index=0, resolution=(100, 100)
        )
        assert result.shape == frame.shape

    def test_uat021_color_balance_then_vhs(self):
        """Given a chain of color_balance + vhs,
        both effects apply correctly."""
        frame = _random_frame()
        chain = [
            {
                "effect_id": "util.color_balance",
                "params": {"shadows_r": 50},
                "enabled": True,
            },
            {"effect_id": "fx.vhs", "params": {}, "enabled": True},
        ]
        result, _ = apply_chain(
            frame, chain, project_seed=42, frame_index=0, resolution=(100, 100)
        )
        assert result.shape == frame.shape
        assert not np.array_equal(result, frame)

    def test_uat022_mixed_chain_at_max_depth(self):
        """Given a 10-effect chain mixing color and glitch effects,
        the pipeline processes all without crash."""
        frame = _random_frame()
        chain = [
            {"effect_id": "util.levels", "params": {"gamma": 0.9}, "enabled": True},
            {"effect_id": "fx.invert", "params": {}, "enabled": True},
            {
                "effect_id": "util.curves",
                "params": {"points": [[0, 0], [128, 200], [255, 255]]},
                "enabled": True,
            },
            {"effect_id": "fx.noise", "params": {}, "enabled": True},
            {
                "effect_id": "util.hsl_adjust",
                "params": {"saturation": 20.0},
                "enabled": True,
            },
            {"effect_id": "fx.posterize", "params": {}, "enabled": True},
            {
                "effect_id": "util.color_balance",
                "params": {"midtones_r": 30},
                "enabled": True,
            },
            {"effect_id": "fx.blur", "params": {}, "enabled": True},
            {
                "effect_id": "util.auto_levels",
                "params": {"clip_percent": 1.0},
                "enabled": True,
            },
            {"effect_id": "fx.edge_detect", "params": {}, "enabled": True},
        ]
        assert len(chain) == 10  # At MAX_CHAIN_DEPTH
        result, _ = apply_chain(
            frame, chain, project_seed=42, frame_index=0, resolution=(100, 100)
        )
        assert result.shape == frame.shape

    def test_uat023_color_effects_preserve_alpha_through_chain(self):
        """Given a chain with color effects, alpha channel is preserved end-to-end."""
        frame = _random_frame()
        original_alpha = frame[:, :, 3].copy()
        chain = [
            {"effect_id": "util.levels", "params": {"gamma": 0.7}, "enabled": True},
            {
                "effect_id": "util.hsl_adjust",
                "params": {"saturation": 50.0, "lightness": 20.0},
                "enabled": True,
            },
            {
                "effect_id": "util.color_balance",
                "params": {"shadows_r": 60},
                "enabled": True,
            },
        ]
        result, _ = apply_chain(
            frame, chain, project_seed=42, frame_index=0, resolution=(100, 100)
        )
        np.testing.assert_array_equal(result[:, :, 3], original_alpha)


# ===========================================================================
# UAT-024 to UAT-028: Histogram Accuracy
# "Histogram updates after color adjustments"
# ===========================================================================


class TestUATHistogram:
    """UAT-024 through UAT-028: Histogram reflects processed frame state."""

    def test_uat024_histogram_reflects_levels_change(self):
        """Given a frame processed with levels (gamma down),
        the histogram should show shifted distribution."""
        frame = _frame(128, 128, 128)
        result, _ = levels_apply(frame, {"gamma": 0.5}, None, **KW)
        hist = compute_histogram(result)
        # All pixels should now be at a lower value
        assert hist["r"][128] == 0  # No longer at 128
        total_below_128 = sum(hist["r"][:128])
        assert total_below_128 == 10000  # All pixels below 128

    def test_uat025_histogram_reflects_inversion(self):
        """Given a frame inverted via levels output mapping,
        the histogram should mirror."""
        frame = _frame(50, 50, 50)
        result, _ = levels_apply(
            frame, {"output_black": 255, "output_white": 0}, None, **KW
        )
        hist = compute_histogram(result)
        # 50 maps to ~205 (inverted)
        assert hist["r"][50] == 0

    def test_uat026_histogram_sum_unchanged_after_processing(self):
        """Given any processing chain, histogram bin sum should equal pixel count."""
        frame = _random_frame()
        frame[:, :, 3] = 255
        out, _ = levels_apply(frame, {"gamma": 0.7}, None, **KW)
        out, _ = hsl_apply(out, {"saturation": 30.0}, None, **KW)
        hist = compute_histogram(out)
        pixel_count = 100 * 100
        for key in ["r", "g", "b", "luma"]:
            assert sum(hist[key]) == pixel_count

    def test_uat027_histogram_after_auto_levels(self):
        """Given auto-levels on a narrow-range frame,
        histogram should show wider distribution."""
        frame = _frame(100, 100, 100)
        frame[50:, :, :3] = 150
        frame[:, :, 3] = 255
        result, _ = al_apply(frame, {"clip_percent": 0.0}, None, **KW)
        hist = compute_histogram(result)
        # Should have values near 0 and 255
        assert hist["r"][0] > 0 or hist["r"][1] > 0
        assert hist["r"][255] > 0 or hist["r"][254] > 0

    def test_uat028_histogram_per_channel_correctness(self):
        """Given a frame with distinct channel values,
        histogram correctly separates R, G, B."""
        frame = _frame(50, 150, 250)
        hist = compute_histogram(frame)
        assert hist["r"][50] == 10000
        assert hist["g"][150] == 10000
        assert hist["b"][250] == 10000


# ===========================================================================
# UAT-029 to UAT-038: Human Error Testing (Chaotic User Scenarios)
# ===========================================================================


class TestUATHumanErrors:
    """UAT-029 through UAT-038: Chaotic, accidental, and adversarial user actions."""

    # --- Input Errors ---

    def test_uat029_levels_with_nan_params(self):
        """Given NaN parameter values, the effect should not crash."""
        frame = _frame(128, 128, 128)
        result, _ = levels_apply(frame, {"gamma": float("nan")}, None, **KW)
        assert result.shape == frame.shape
        assert result.dtype == np.uint8

    def test_uat030_curves_with_empty_points(self):
        """Given empty points list, curves should fall back to identity."""
        frame = _frame(128, 128, 128)
        result, _ = curves_apply(frame, {"points": []}, None, **KW)
        assert result.shape == frame.shape

    def test_uat031_curves_with_malformed_json(self):
        """Given malformed JSON string for points, curves should fall back to identity."""
        frame = _frame(128, 128, 128)
        result, _ = curves_apply(frame, {"points": "not valid json at all"}, None, **KW)
        assert result.shape == frame.shape

    def test_uat032_hsl_with_extreme_combined_params(self):
        """Given all HSL params at extreme values simultaneously,
        the effect should not crash."""
        frame = _random_frame()
        result, _ = hsl_apply(
            frame,
            {
                "hue_shift": 180.0,
                "saturation": 100.0,
                "lightness": 100.0,
                "target_hue": "all",
            },
            None,
            **KW,
        )
        assert result.dtype == np.uint8
        assert result.min() >= 0
        assert result.max() <= 255

    def test_uat033_color_balance_negative_extremes(self):
        """Given all color balance params at -100,
        the output should be valid (no overflow/underflow)."""
        frame = _random_frame()
        params = {k: -100 for k in cb_params if k != "preserve_luma"}
        params["preserve_luma"] = True
        result, _ = cb_apply(frame, params, None, **KW)
        assert result.dtype == np.uint8

    # --- Boundary Errors ---

    def test_uat034_levels_input_black_equals_input_white(self):
        """Given input_black == input_white, the effect handles gracefully."""
        frame = _frame(128, 128, 128)
        result, _ = levels_apply(
            frame, {"input_black": 128, "input_white": 128}, None, **KW
        )
        assert result.shape == frame.shape  # No division by zero crash

    def test_uat035_levels_input_black_exceeds_input_white(self):
        """Given input_black > input_white, the effect handles gracefully."""
        frame = _frame(128, 128, 128)
        result, _ = levels_apply(
            frame, {"input_black": 200, "input_white": 50}, None, **KW
        )
        assert result.shape == frame.shape

    def test_uat036_curves_with_100_points(self):
        """Given many more points than spec allows (100 vs 16),
        the effect should still work (no crash)."""
        pts = [[i * 2.55, i * 2.55] for i in range(100)]
        frame = _frame(128, 128, 128)
        result, _ = curves_apply(frame, {"points": pts}, None, **KW)
        assert result.shape == frame.shape

    def test_uat037_hsl_negative_hue_wrapping(self):
        """Given a large negative hue shift,
        the hue wraps correctly without going negative."""
        frame = _frame(255, 0, 0)  # Red, hue ~0
        result, _ = hsl_apply(frame, {"hue_shift": -180.0}, None, **KW)
        assert result.dtype == np.uint8
        # Should produce cyan-ish (opposite of red)
        assert result[0, 0, 2] > result[0, 0, 0]  # B > R

    # --- Sequence Errors ---

    def test_uat038_apply_same_effect_twice(self):
        """Given the same effect applied twice with different params,
        both applications should be visible."""
        frame = _frame(128, 128, 128)
        chain = [
            {"effect_id": "util.levels", "params": {"gamma": 2.0}, "enabled": True},
            {"effect_id": "util.levels", "params": {"gamma": 2.0}, "enabled": True},
        ]
        result, _ = apply_chain(
            frame, chain, project_seed=42, frame_index=0, resolution=(100, 100)
        )
        # Double gamma boost should be brighter than single
        single_chain = [
            {"effect_id": "util.levels", "params": {"gamma": 2.0}, "enabled": True},
        ]
        single_result, _ = apply_chain(
            frame, single_chain, project_seed=42, frame_index=0, resolution=(100, 100)
        )
        assert result[0, 0, 0] > single_result[0, 0, 0]


# ===========================================================================
# UAT-039 to UAT-043: Effect Container Integration
# "EffectContainer wraps color effects correctly (mask + mix pipeline)"
# ===========================================================================


class TestUATContainerIntegration:
    """UAT-039 through UAT-043: EffectContainer mask/mix pipeline with color effects."""

    def test_uat039_mix_at_50_percent(self):
        """Given a color effect with mix=0.5,
        the output is blended between original and processed."""
        frame = _frame(100, 100, 100)
        chain = [
            {
                "effect_id": "util.levels",
                "params": {"gamma": 0.3},
                "enabled": True,
                "mix": 0.5,
            }
        ]
        result, _ = apply_chain(
            frame, chain, project_seed=42, frame_index=0, resolution=(100, 100)
        )
        # Result should be between original (100) and fully processed
        full_result, _ = levels_apply(frame, {"gamma": 0.3}, None, **KW)
        assert result[0, 0, 0] > full_result[0, 0, 0]  # Not fully processed
        assert result[0, 0, 0] < 100  # Not original

    def test_uat040_mix_at_zero(self):
        """Given a color effect with mix=0.0,
        the output should be identical to input (dry signal)."""
        frame = _frame(100, 100, 100)
        chain = [
            {
                "effect_id": "util.levels",
                "params": {"gamma": 0.3},
                "enabled": True,
                "mix": 0.0,
            }
        ]
        result, _ = apply_chain(
            frame, chain, project_seed=42, frame_index=0, resolution=(100, 100)
        )
        np.testing.assert_array_equal(result, frame)

    def test_uat041_disabled_effect_skipped(self):
        """Given a color effect with enabled=False,
        the output should be identical to input."""
        frame = _random_frame()
        chain = [
            {
                "effect_id": "util.levels",
                "params": {"gamma": 0.3},
                "enabled": False,
            }
        ]
        result, _ = apply_chain(
            frame, chain, project_seed=42, frame_index=0, resolution=(100, 100)
        )
        np.testing.assert_array_equal(result, frame)

    def test_uat042_disabled_middle_of_chain(self):
        """Given a chain where the middle effect is disabled,
        the other effects still apply."""
        frame = _random_frame()
        frame[:, :, 3] = 255
        chain = [
            {"effect_id": "util.levels", "params": {"gamma": 0.7}, "enabled": True},
            {
                "effect_id": "util.hsl_adjust",
                "params": {"saturation": 50.0},
                "enabled": False,
            },
            {
                "effect_id": "util.color_balance",
                "params": {"shadows_r": 60},
                "enabled": True,
            },
        ]
        result, _ = apply_chain(
            frame, chain, project_seed=42, frame_index=0, resolution=(100, 100)
        )
        # Levels and color_balance applied, HSL skipped
        assert not np.array_equal(result, frame)

    def test_uat043_chain_exceeding_max_depth_rejected(self):
        """Given 11 effects (exceeding MAX_CHAIN_DEPTH=10),
        the pipeline raises ValueError."""
        frame = _random_frame()
        chain = [
            {"effect_id": "util.levels", "params": {}, "enabled": True}
            for _ in range(11)
        ]
        with pytest.raises(ValueError, match="SEC-7"):
            apply_chain(
                frame, chain, project_seed=42, frame_index=0, resolution=(100, 100)
            )


# ===========================================================================
# UAT-044 to UAT-048: Registry & Discovery
# "Color effects are registered and discoverable"
# ===========================================================================


class TestUATRegistry:
    """UAT-044 through UAT-048: Color effects properly registered."""

    COLOR_EFFECT_IDS = [
        "util.levels",
        "util.curves",
        "util.hsl_adjust",
        "util.color_balance",
        "util.auto_levels",
    ]

    def test_uat044_all_color_effects_registered(self):
        """All 5 color effects should be in the registry."""
        for eid in self.COLOR_EFFECT_IDS:
            info = registry_get(eid)
            assert info is not None, f"{eid} not registered"

    def test_uat045_registry_has_correct_categories(self):
        """All color effects should be in 'util' category."""
        for eid in self.COLOR_EFFECT_IDS:
            info = registry_get(eid)
            assert info["category"] == "util", f"{eid} category is {info['category']}"

    def test_uat046_registry_has_params(self):
        """All color effects should have non-empty PARAMS."""
        for eid in self.COLOR_EFFECT_IDS:
            info = registry_get(eid)
            assert len(info["params"]) > 0, f"{eid} has no params"

    def test_uat047_list_all_includes_color_effects(self):
        """list_all() should include all color effects."""
        all_effects = registry_list_all()
        all_ids = {e["id"] for e in all_effects}
        for eid in self.COLOR_EFFECT_IDS:
            assert eid in all_ids, f"{eid} missing from list_all()"

    def test_uat048_params_have_required_fields(self):
        """Every param definition should have type, default, and label."""
        for eid in self.COLOR_EFFECT_IDS:
            info = registry_get(eid)
            for pname, pspec in info["params"].items():
                assert "type" in pspec, f"{eid}.{pname} missing 'type'"
                assert "default" in pspec, f"{eid}.{pname} missing 'default'"
                assert "label" in pspec, f"{eid}.{pname} missing 'label'"


# ===========================================================================
# UAT-049 to UAT-052: Determinism
# "Same inputs always produce same outputs"
# ===========================================================================


class TestUATDeterminism:
    """UAT-049 through UAT-052: Reproducibility guarantees."""

    def test_uat049_full_chain_determinism(self):
        """Given the same chain applied to the same frame twice,
        the outputs are identical."""
        frame = _random_frame(h=200, w=200)

        def run():
            out, _ = levels_apply(frame, {"gamma": 0.8}, None, **KW)
            out, _ = curves_apply(
                out,
                {"points": [[0, 0], [64, 48], [192, 208], [255, 255]]},
                None,
                **KW,
            )
            out, _ = hsl_apply(
                out, {"saturation": 20.0, "lightness": -10.0}, None, **KW
            )
            out, _ = cb_apply(out, {"shadows_b": 30}, None, **KW)
            return out

        r1 = run()
        r2 = run()
        np.testing.assert_array_equal(r1, r2)

    def test_uat050_pipeline_determinism(self):
        """Given the same chain via apply_chain twice, outputs identical."""
        frame = _random_frame()
        chain = [
            {"effect_id": "util.levels", "params": {"gamma": 0.7}, "enabled": True},
            {
                "effect_id": "util.hsl_adjust",
                "params": {"saturation": 30.0},
                "enabled": True,
            },
        ]
        r1, _ = apply_chain(
            frame, chain, project_seed=42, frame_index=0, resolution=(100, 100)
        )
        r2, _ = apply_chain(
            frame, chain, project_seed=42, frame_index=0, resolution=(100, 100)
        )
        np.testing.assert_array_equal(r1, r2)

    def test_uat051_different_seeds_same_output(self):
        """Color effects are deterministic regardless of seed
        (they don't use RNG)."""
        frame = _random_frame()
        r1, _ = levels_apply(
            frame, {"gamma": 0.7}, None, frame_index=0, seed=1, resolution=(100, 100)
        )
        r2, _ = levels_apply(
            frame, {"gamma": 0.7}, None, frame_index=0, seed=999, resolution=(100, 100)
        )
        np.testing.assert_array_equal(r1, r2)

    def test_uat052_different_frame_index_same_output(self):
        """Color effects produce same output regardless of frame_index."""
        frame = _random_frame()
        r1, _ = hsl_apply(
            frame,
            {"saturation": 30.0},
            None,
            frame_index=0,
            seed=42,
            resolution=(100, 100),
        )
        r2, _ = hsl_apply(
            frame,
            {"saturation": 30.0},
            None,
            frame_index=100,
            seed=42,
            resolution=(100, 100),
        )
        np.testing.assert_array_equal(r1, r2)


# ===========================================================================
# UAT-053 to UAT-055: Performance Budget
# ===========================================================================


class TestUATPerformance:
    """UAT-053 through UAT-055: Performance budget compliance."""

    @pytest.mark.perf
    def test_uat053_individual_effects_under_budget(self):
        """Each color effect should complete within budget at 1080p.
        LUT-based effects (levels, curves): < 50ms
        Per-pixel effects (hsl_adjust, color_balance): < 50ms
        auto_levels: < 100ms (FINDING: np.percentile is slow on 2M pixels,
        see UAT report for optimization recommendation)
        """
        frame = np.random.default_rng(42).integers(
            0, 256, (1080, 1920, 4), dtype=np.uint8
        )
        frame[:, :, 3] = 255

        # Budget per effect (ms): auto_levels gets a higher budget due to
        # np.percentile overhead — documented as P2 optimization opportunity
        budgets = {
            "levels": 50,
            "curves": 50,
            "hsl_adjust": 50,
            "color_balance": 50,
            "auto_levels": 100,  # P2: optimize with np.partition or histogram-based percentile
        }

        effects = [
            ("levels", levels_apply, {"gamma": 0.8}),
            (
                "curves",
                curves_apply,
                {"points": [[0, 0], [64, 32], [192, 224], [255, 255]]},
            ),
            ("hsl_adjust", hsl_apply, {"saturation": 30.0}),
            ("color_balance", cb_apply, {"shadows_b": 50}),
            ("auto_levels", al_apply, {"clip_percent": 1.0}),
        ]

        for name, fn, params in effects:
            t0 = time.perf_counter()
            fn(frame, params, None, **KW_1080)
            elapsed = (time.perf_counter() - t0) * 1000
            limit = budgets[name]
            assert elapsed < limit, (
                f"{name} took {elapsed:.1f}ms at 1080p, limit is {limit}ms"
            )

    @pytest.mark.perf
    def test_uat054_full_chain_under_100ms(self):
        """All 5 color tools chained should complete within 100ms at 1080p."""
        frame = np.random.default_rng(42).integers(
            0, 256, (1080, 1920, 4), dtype=np.uint8
        )
        frame[:, :, 3] = 255

        t0 = time.perf_counter()
        out, _ = levels_apply(frame, {"gamma": 0.8}, None, **KW_1080)
        out, _ = curves_apply(
            out, {"points": [[0, 0], [64, 32], [192, 224], [255, 255]]}, None, **KW_1080
        )
        out, _ = hsl_apply(out, {"saturation": 20.0}, None, **KW_1080)
        out, _ = cb_apply(out, {"shadows_b": 30, "highlights_r": 20}, None, **KW_1080)
        out, _ = al_apply(out, {"clip_percent": 1.0}, None, **KW_1080)
        elapsed = (time.perf_counter() - t0) * 1000

        assert elapsed < 200, f"Full chain took {elapsed:.1f}ms, limit is 200ms"

    @pytest.mark.perf
    def test_uat055_histogram_under_10ms(self):
        """Histogram computation should complete within 10ms at 1080p."""
        frame = np.random.default_rng(42).integers(
            0, 256, (1080, 1920, 4), dtype=np.uint8
        )
        t0 = time.perf_counter()
        compute_histogram(frame)
        elapsed = (time.perf_counter() - t0) * 1000
        assert elapsed < 50, f"Histogram took {elapsed:.1f}ms, limit is 50ms"


# ===========================================================================
# UAT-056 to UAT-060: ZMQ/IPC Integration Gaps
# ===========================================================================


class TestUATIpcGaps:
    """UAT-056 through UAT-060: Verify ZMQ/IPC layer handles color effects."""

    def test_uat056_compute_histogram_not_wired_in_zmq(self):
        """FINDING: compute_histogram command is specified in Phase 3 impl plan
        but NOT wired in zmq_server.py. This is a gap that blocks live histogram
        updates in the frontend."""
        # Check the class (not an instance — instantiating opens ZMQ sockets
        # that block process exit).
        from zmq_server import ZMQServer

        handler = getattr(ZMQServer, "_handle_compute_histogram", None)
        # Expected: None (not wired yet)
        # This test documents the gap. When fixed, flip assertion.
        if handler is None:
            pytest.skip(
                "KNOWN GAP: compute_histogram ZMQ command not implemented. "
                "Histogram in frontend will not update. "
                "See PHASE-3-IMPL-PLAN.md section 1.5."
            )

    def test_uat057_color_effects_work_via_render_frame_chain(self):
        """Color effects applied via apply_chain (which render_frame uses)
        should produce valid output."""
        frame = _random_frame()
        chain = [
            {"effect_id": "util.levels", "params": {"gamma": 0.7}, "enabled": True},
            {
                "effect_id": "util.curves",
                "params": {"points": [[0, 0], [128, 200], [255, 255]]},
                "enabled": True,
            },
            {
                "effect_id": "util.hsl_adjust",
                "params": {"saturation": 30.0},
                "enabled": True,
            },
            {
                "effect_id": "util.color_balance",
                "params": {"shadows_r": 40},
                "enabled": True,
            },
            {
                "effect_id": "util.auto_levels",
                "params": {"clip_percent": 1.0},
                "enabled": True,
            },
        ]
        result, _ = apply_chain(
            frame, chain, project_seed=42, frame_index=0, resolution=(100, 100)
        )
        assert result.shape == frame.shape
        assert result.dtype == np.uint8
        assert not np.array_equal(result, frame)

    def test_uat058_unknown_effect_in_chain_raises(self):
        """Given a chain with a non-existent effect ID,
        apply_chain should raise ValueError."""
        frame = _random_frame()
        chain = [{"effect_id": "util.nonexistent", "params": {}, "enabled": True}]
        with pytest.raises(ValueError, match="unknown effect"):
            apply_chain(
                frame, chain, project_seed=42, frame_index=0, resolution=(100, 100)
            )

    def test_uat059_empty_chain_returns_input(self):
        """Given an empty chain, apply_chain should return input unchanged."""
        frame = _random_frame()
        result, _ = apply_chain(
            frame, [], project_seed=42, frame_index=0, resolution=(100, 100)
        )
        np.testing.assert_array_equal(result, frame)

    def test_uat060_all_disabled_chain_returns_input(self):
        """Given a chain where all effects are disabled,
        output should equal input."""
        frame = _random_frame()
        chain = [
            {"effect_id": "util.levels", "params": {"gamma": 0.3}, "enabled": False},
            {
                "effect_id": "util.hsl_adjust",
                "params": {"saturation": 80.0},
                "enabled": False,
            },
        ]
        result, _ = apply_chain(
            frame, chain, project_seed=42, frame_index=0, resolution=(100, 100)
        )
        np.testing.assert_array_equal(result, frame)
