"""Tests for under_load.py — synthetic CPU/memory load + re-measure."""

from __future__ import annotations

import numpy as np
import pytest

from q7_benchmark.bench import BenchPlan
from q7_benchmark.loaders import make_loader
from q7_benchmark.under_load import UnderLoadResult, measure_under_load


def _frame_factory():
    return np.zeros((224, 224, 3), dtype=np.uint8)


@pytest.mark.smoke
def test_under_load_returns_shape():
    """Short duration so the test doesn't take 30s."""
    loader = make_loader("dinov2", backend="mock")
    plan = BenchPlan(loader=loader, payload_factory=_frame_factory, iterations=10)
    result = measure_under_load(
        plan,
        duration_seconds=0.5,
        threads=1,
        memory_pressure_mb=8,
    )
    assert isinstance(result, UnderLoadResult)
    assert result.threads == 1
    assert result.memory_pressure_mb == 8
    assert result.baseline_p95_ms >= 0
    assert result.under_load_p95_ms >= 0


@pytest.mark.smoke
def test_under_load_thread_resolution_auto():
    """threads=0 resolves to cpu_count-1 (at least 1)."""
    loader = make_loader("dinov2", backend="mock")
    plan = BenchPlan(loader=loader, payload_factory=_frame_factory, iterations=5)
    result = measure_under_load(
        plan, duration_seconds=0.3, threads=0, memory_pressure_mb=4
    )
    assert result.threads >= 1


@pytest.mark.smoke
def test_under_load_to_dict_shape():
    loader = make_loader("dinov2", backend="mock")
    plan = BenchPlan(loader=loader, payload_factory=_frame_factory, iterations=5)
    result = measure_under_load(
        plan, duration_seconds=0.3, threads=1, memory_pressure_mb=4
    )
    d = result.to_dict()
    assert set(d.keys()) == {
        "baseline_p95_ms",
        "under_load_p95_ms",
        "degradation_ratio",
        "degradation_under_load",
        "duration_seconds",
        "threads",
        "memory_pressure_mb",
    }


@pytest.mark.smoke
def test_under_load_baseline_failure_returns_zero_under_load():
    """If baseline benchmark fails (backend not lit), under_load is 0.0.

    PR #6 lights up DINOv2 so we test against CLIP (still a stub).
    """
    loader = make_loader(
        "clip", backend="cpu"
    )  # real CLIP still raises NotImplementedError
    plan = BenchPlan(loader=loader, payload_factory=lambda: {"text": "x"}, iterations=5)
    result = measure_under_load(
        plan, duration_seconds=0.2, threads=1, memory_pressure_mb=4
    )
    assert result.under_load_p95_ms == 0.0
    assert result.degradation_ratio == 0.0
    assert result.degradation_under_load is False
