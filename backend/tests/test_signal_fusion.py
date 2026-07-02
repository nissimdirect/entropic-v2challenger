"""Tests for fusion operator — weighted blend of multiple signals."""

import math

import pytest

from modulation.fusion import evaluate_fusion


class TestEvaluateFusion:
    def test_empty_sources(self):
        assert evaluate_fusion([], {}) == 0.0

    def test_single_source(self):
        sources = [{"operator_id": "a", "weight": 1.0}]
        values = {"a": 0.5}
        assert evaluate_fusion(sources, values) == 0.5

    def test_weighted_average_two_sources(self):
        sources = [
            {"operator_id": "a", "weight": 1.0},
            {"operator_id": "b", "weight": 1.0},
        ]
        values = {"a": 0.4, "b": 0.6}
        result = evaluate_fusion(sources, values, "weighted_average")
        assert abs(result - 0.5) < 1e-6

    def test_weighted_average_unequal_weights(self):
        sources = [
            {"operator_id": "a", "weight": 3.0},
            {"operator_id": "b", "weight": 1.0},
        ]
        values = {"a": 1.0, "b": 0.0}
        result = evaluate_fusion(sources, values, "weighted_average")
        assert abs(result - 0.75) < 1e-6

    def test_max_blend(self):
        sources = [
            {"operator_id": "a", "weight": 1.0},
            {"operator_id": "b", "weight": 1.0},
        ]
        values = {"a": 0.3, "b": 0.8}
        result = evaluate_fusion(sources, values, "max")
        assert abs(result - 0.8) < 1e-6

    def test_min_blend(self):
        sources = [
            {"operator_id": "a", "weight": 1.0},
            {"operator_id": "b", "weight": 1.0},
        ]
        values = {"a": 0.3, "b": 0.8}
        result = evaluate_fusion(sources, values, "min")
        assert abs(result - 0.3) < 1e-6

    def test_multiply_blend(self):
        sources = [
            {"operator_id": "a", "weight": 1.0},
            {"operator_id": "b", "weight": 1.0},
        ]
        values = {"a": 0.5, "b": 0.6}
        result = evaluate_fusion(sources, values, "multiply")
        assert abs(result - 0.3) < 1e-6

    def test_add_blend_clamped(self):
        sources = [
            {"operator_id": "a", "weight": 1.0},
            {"operator_id": "b", "weight": 1.0},
        ]
        values = {"a": 0.7, "b": 0.8}
        result = evaluate_fusion(sources, values, "add")
        assert result == 1.0  # Clamped

    def test_missing_source_returns_zero(self):
        sources = [{"operator_id": "missing", "weight": 1.0}]
        result = evaluate_fusion(sources, {})
        assert result == 0.0

    def test_nan_weight_defaults_to_one(self):
        sources = [{"operator_id": "a", "weight": float("nan")}]
        values = {"a": 0.5}
        result = evaluate_fusion(sources, values)
        assert abs(result - 0.5) < 1e-6

    def test_nan_value_defaults_to_zero(self):
        sources = [{"operator_id": "a", "weight": 1.0}]
        values = {"a": float("nan")}
        result = evaluate_fusion(sources, values)
        assert result == 0.0

    def test_zero_total_weight(self):
        sources = [{"operator_id": "a", "weight": 0.0}]
        values = {"a": 0.5}
        result = evaluate_fusion(sources, values, "weighted_average")
        assert result == 0.0

    def test_three_sources(self):
        sources = [
            {"operator_id": "a", "weight": 1.0},
            {"operator_id": "b", "weight": 1.0},
            {"operator_id": "c", "weight": 1.0},
        ]
        values = {"a": 0.3, "b": 0.6, "c": 0.9}
        result = evaluate_fusion(sources, values, "weighted_average")
        assert abs(result - 0.6) < 1e-6

    def test_unknown_blend_mode_defaults(self):
        sources = [{"operator_id": "a", "weight": 1.0}]
        values = {"a": 0.7}
        result = evaluate_fusion(sources, values, "unknown_mode")
        assert abs(result - 0.7) < 1e-6
