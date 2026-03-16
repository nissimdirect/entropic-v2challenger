"""Tests for engine.guards — numeric safety utilities."""

import numpy as np
import pytest

from engine.guards import clamp_finite, guard_positive, sanitize_params


class TestSanitizeParams:
    def test_drops_nan_float(self):
        assert sanitize_params({"a": float("nan")}) == {}

    def test_drops_inf_float(self):
        assert sanitize_params({"a": float("inf")}) == {}

    def test_drops_neg_inf_float(self):
        assert sanitize_params({"a": float("-inf")}) == {}

    def test_drops_numpy_nan(self):
        assert sanitize_params({"a": np.float64("nan")}) == {}

    def test_keeps_numpy_int(self):
        result = sanitize_params({"a": np.int32(5)})
        assert result == {"a": 5}
        assert isinstance(result["a"], int)

    def test_drops_nan_string(self):
        assert sanitize_params({"a": "NaN"}) == {}

    def test_drops_infinity_string(self):
        assert sanitize_params({"a": "Infinity"}) == {}

    def test_keeps_string_overlay(self):
        result = sanitize_params({"mode": "overlay"})
        assert result == {"mode": "overlay"}
        assert isinstance(result["mode"], str)

    def test_keeps_numeric_string_as_string(self):
        """A string like '3.14' should be kept as a string, not converted."""
        result = sanitize_params({"val": "3.14"})
        assert result == {"val": "3.14"}
        assert isinstance(result["val"], str)

    def test_keeps_bool_true(self):
        assert sanitize_params({"flag": True}) == {"flag": True}

    def test_keeps_bool_false(self):
        assert sanitize_params({"flag": False}) == {"flag": False}

    def test_keeps_none(self):
        assert sanitize_params({"x": None}) == {"x": None}

    def test_empty_dict(self):
        assert sanitize_params({}) == {}

    def test_keeps_numpy_array(self):
        """Numpy arrays should be kept as-is (not .item()'d)."""
        arr = np.array([1, 2, 3])
        result = sanitize_params({"mask": arr})
        assert "mask" in result
        np.testing.assert_array_equal(result["mask"], arr)

    def test_mixed_params(self):
        result = sanitize_params(
            {
                "good": 1.0,
                "bad": float("nan"),
                "name": "overlay",
                "flag": True,
            }
        )
        assert result == {"good": 1.0, "name": "overlay", "flag": True}


class TestClampFinite:
    def test_normal_clamp(self):
        assert clamp_finite(5.0, 0.0, 10.0, 0.0) == 5.0

    def test_clamp_below(self):
        assert clamp_finite(-1.0, 0.0, 10.0, 5.0) == 0.0

    def test_clamp_above(self):
        assert clamp_finite(15.0, 0.0, 10.0, 5.0) == 10.0

    def test_nan_returns_fallback(self):
        assert clamp_finite(float("nan"), 0.0, 10.0, 5.0) == 5.0

    def test_inf_returns_fallback(self):
        assert clamp_finite(float("inf"), 0.0, 10.0, 5.0) == 5.0

    def test_neg_inf_returns_fallback(self):
        assert clamp_finite(float("-inf"), 0.0, 10.0, 5.0) == 5.0

    def test_at_lower_boundary(self):
        assert clamp_finite(0.0, 0.0, 10.0, 5.0) == 0.0

    def test_at_upper_boundary(self):
        assert clamp_finite(10.0, 0.0, 10.0, 5.0) == 10.0


class TestGuardPositive:
    def test_valid_returns_value(self):
        assert guard_positive(5.0, "fps") == 5.0

    def test_zero_raises(self):
        with pytest.raises(ValueError, match="fps"):
            guard_positive(0.0, "fps")

    def test_negative_raises(self):
        with pytest.raises(ValueError, match="rate"):
            guard_positive(-1.0, "rate")

    def test_nan_raises(self):
        with pytest.raises(ValueError, match="fps"):
            guard_positive(float("nan"), "fps")

    def test_inf_raises(self):
        with pytest.raises(ValueError, match="fps"):
            guard_positive(float("inf"), "fps")
