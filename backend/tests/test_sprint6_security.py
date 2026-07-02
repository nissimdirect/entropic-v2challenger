"""Sprint 6: Security Hardening — param validation at trust boundary.

Verifies that NaN/Infinity/negative-Infinity in effect params are
sanitized before reaching apply_chain / EffectContainer.process().
"""

import math

import numpy as np

from engine.guards import clamp_finite, sanitize_params
from engine.container import EffectContainer


# ---------------------------------------------------------------------------
# 1. sanitize_params — already tested in test_engine/test_guards.py
#    These tests add coverage for the Sprint 6 acceptance criteria:
#    "NaN/Infinity in param values → clamped to valid range, no NumPy crash"
# ---------------------------------------------------------------------------


class TestSanitizeParamsSprintSix:
    """Sprint 6 AC: Sending NaN/Infinity in param values → dropped, no crash."""

    def test_nan_float_dropped(self):
        result = sanitize_params({"amount": float("nan"), "mode": "overlay"})
        assert "amount" not in result
        assert result["mode"] == "overlay"

    def test_inf_float_dropped(self):
        result = sanitize_params({"intensity": float("inf")})
        assert "intensity" not in result

    def test_neg_inf_float_dropped(self):
        result = sanitize_params({"offset": float("-inf")})
        assert "offset" not in result

    def test_nan_string_dropped(self):
        result = sanitize_params({"val": "NaN"})
        assert "val" not in result

    def test_infinity_string_dropped(self):
        result = sanitize_params({"val": "Infinity"})
        assert "val" not in result

    def test_neg_infinity_string_dropped(self):
        result = sanitize_params({"val": "-Infinity"})
        assert "val" not in result

    def test_numpy_nan_dropped(self):
        result = sanitize_params({"x": np.float64("nan")})
        assert "x" not in result

    def test_numpy_inf_dropped(self):
        result = sanitize_params({"x": np.float64("inf")})
        assert "x" not in result

    def test_normal_float_passes_through(self):
        result = sanitize_params({"amount": 0.75})
        assert result["amount"] == 0.75

    def test_normal_int_passes_through(self):
        result = sanitize_params({"count": 5})
        assert result["count"] == 5

    def test_zero_passes_through(self):
        result = sanitize_params({"level": 0.0})
        assert result["level"] == 0.0

    def test_negative_passes_through(self):
        result = sanitize_params({"offset": -3.5})
        assert result["offset"] == -3.5

    def test_bool_passes_through_not_treated_as_int(self):
        """bool is subclass of int — must not be dropped by finiteness check."""
        result = sanitize_params({"invert": True, "bypass": False})
        assert result["invert"] is True
        assert result["bypass"] is False

    def test_mixed_good_and_bad_params(self):
        result = sanitize_params(
            {
                "amount": 0.5,
                "bad_nan": float("nan"),
                "bad_inf": float("inf"),
                "mode": "screen",
                "enabled": True,
            }
        )
        assert result == {"amount": 0.5, "mode": "screen", "enabled": True}


# ---------------------------------------------------------------------------
# 2. clamp_finite — boundary tests for Sprint 6
# ---------------------------------------------------------------------------


class TestClampFiniteSprintSix:
    """Sprint 6 AC: clamp_finite guards _mix and other numeric fields."""

    def test_nan_returns_fallback(self):
        assert clamp_finite(float("nan"), 0.0, 1.0, 1.0) == 1.0

    def test_inf_returns_fallback(self):
        assert clamp_finite(float("inf"), 0.0, 1.0, 0.5) == 0.5

    def test_neg_inf_returns_fallback(self):
        assert clamp_finite(float("-inf"), 0.0, 10.0, 5.0) == 5.0

    def test_normal_value_clamped_to_range(self):
        assert clamp_finite(0.75, 0.0, 1.0, 0.5) == 0.75

    def test_below_range_clamped_to_lo(self):
        assert clamp_finite(-1.0, 0.0, 1.0, 0.5) == 0.0

    def test_above_range_clamped_to_hi(self):
        assert clamp_finite(2.0, 0.0, 1.0, 0.5) == 1.0


# ---------------------------------------------------------------------------
# 3. EffectContainer.process — end-to-end with bad params
# ---------------------------------------------------------------------------


def _identity_effect(frame, params, state_in, **kwargs):
    """Trivial effect: returns frame unchanged. Uses params to verify sanitization."""
    # If NaN leaked through, this would corrupt the frame
    scale = params.get("scale", 1.0)
    if isinstance(scale, (int, float)) and not isinstance(scale, bool):
        assert math.isfinite(scale), "NaN/Inf leaked through to effect function"
    return frame, state_in


class TestEffectContainerParamSanitization:
    """Verify EffectContainer.process() calls sanitize_params before the effect fn."""

    def _make_frame(self):
        return np.zeros((4, 4, 4), dtype=np.uint8)

    def test_nan_param_dropped_before_effect(self):
        container = EffectContainer(_identity_effect, "test-fx")
        frame = self._make_frame()
        output, _ = container.process(
            frame,
            {"scale": float("nan"), "mode": "overlay"},
            None,
            frame_index=0,
            project_seed=42,
            resolution=(4, 4),
        )
        # Should not crash — NaN dropped, effect gets default
        assert output.shape == frame.shape

    def test_inf_param_dropped_before_effect(self):
        container = EffectContainer(_identity_effect, "test-fx")
        frame = self._make_frame()
        output, _ = container.process(
            frame,
            {"scale": float("inf")},
            None,
            frame_index=0,
            project_seed=42,
            resolution=(4, 4),
        )
        assert output.shape == frame.shape

    def test_nan_mix_clamped_to_fallback(self):
        container = EffectContainer(_identity_effect, "test-fx")
        frame = self._make_frame()
        output, _ = container.process(
            frame,
            {"_mix": float("nan")},
            None,
            frame_index=0,
            project_seed=42,
            resolution=(4, 4),
        )
        # NaN mix → fallback 1.0 → full wet (no crash)
        assert output.shape == frame.shape

    def test_normal_params_pass_through(self):
        received_params = {}

        def capture_effect(frame, params, state_in, **kwargs):
            received_params.update(params)
            return frame, state_in

        container = EffectContainer(capture_effect, "test-fx")
        frame = self._make_frame()
        container.process(
            frame,
            {"amount": 0.5, "mode": "overlay"},
            None,
            frame_index=0,
            project_seed=42,
            resolution=(4, 4),
        )
        assert received_params["amount"] == 0.5
        assert received_params["mode"] == "overlay"
