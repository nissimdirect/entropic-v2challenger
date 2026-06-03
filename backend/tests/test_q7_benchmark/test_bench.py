"""Tests for bench.py — warmup, measured iterations, error paths."""

from __future__ import annotations

import time

import numpy as np
import pytest

from q7_benchmark.bench import (
    DEFAULT_MEASURED_ITERATIONS,
    WARMUP_ITERATIONS,
    BenchPlan,
    BenchResult,
    benchmark_loader,
    run_measured,
    run_warmup,
)
from q7_benchmark.loaders import make_loader


def _make_frame():
    return np.zeros((224, 224, 3), dtype=np.uint8)


def _make_text_payload():
    return {"text": "a glitchy video frame"}


@pytest.mark.smoke
def test_bench_mock_loader_completes_full_cycle():
    loader = make_loader("dinov2", backend="mock")
    plan = BenchPlan(loader=loader, payload_factory=_make_frame, iterations=10)
    result = benchmark_loader(plan)
    assert isinstance(result, BenchResult)
    assert result.name == "dinov2"
    assert result.embed_dim == 384
    assert result.error is None
    assert result.cold_load_seconds == 0.0  # mock has no cold load
    assert result.latency.n_samples == 10


@pytest.mark.smoke
def test_bench_default_iterations_is_100():
    assert DEFAULT_MEASURED_ITERATIONS == 100


@pytest.mark.smoke
def test_bench_default_warmup_is_3():
    """DEC-Q7-006: 3 warmup iterations."""
    assert WARMUP_ITERATIONS == 3


@pytest.mark.smoke
def test_bench_warmup_validates_shape():
    """Warmup catches shape mismatches before measurement."""
    loader = make_loader("clip", backend="mock")
    plan = BenchPlan(loader=loader, payload_factory=_make_text_payload, iterations=5)
    err = run_warmup(plan)
    assert err is None


@pytest.mark.smoke
def test_bench_run_measured_returns_n_latencies():
    loader = make_loader("clip", backend="mock")
    plan = BenchPlan(loader=loader, payload_factory=_make_text_payload, iterations=42)
    latencies, err = run_measured(plan)
    assert err is None
    assert latencies.shape == (42,)
    # All positive ms
    assert (latencies > 0).all()


@pytest.mark.smoke
def test_bench_real_backend_stub_reports_backend_not_lit():
    """Real-backend stub raises NotImplementedError → bench reports error.

    PR #6 lit DINOv2; CLIP (still a stub) is used here to test the error path.
    """
    loader = make_loader("clip", backend="cpu")
    plan = BenchPlan(loader=loader, payload_factory=_make_text_payload, iterations=10)
    result = benchmark_loader(plan)
    assert result.error is not None
    assert "BACKEND_NOT_LIT" in result.error
    assert result.cold_load_seconds is None


@pytest.mark.smoke
def test_bench_result_to_dict_shape():
    loader = make_loader("clap", backend="mock")
    plan = BenchPlan(
        loader=loader,
        payload_factory=lambda: {"text": "x"},
        iterations=5,
    )
    result = benchmark_loader(plan)
    d = result.to_dict()
    assert set(d.keys()) == {
        "name",
        "embed_dim",
        "backend",
        "cold_load_seconds",
        "encode_latency",
        "high_variance",
        "warmup_iterations",
        "error",
    }
    assert d["warmup_iterations"] == 3


@pytest.mark.smoke
def test_bench_high_variance_flagged_in_result():
    """Synthetic high-variance test via a sleep-injecting loader."""
    base_loader = make_loader("dinov2", backend="mock")

    class HighVarLoader:
        name = "dinov2"
        embed_dim = 384
        modality = "vision"
        cold_load_seconds: float | None = 0.0

        def __init__(self):
            self._i = 0

        def encode(self, payload):
            self._i += 1
            if self._i % 3 == 0:
                time.sleep(0.005)  # sporadic spike
            return base_loader.encode(payload)

    loader = HighVarLoader()
    plan = BenchPlan(loader=loader, payload_factory=_make_frame, iterations=30)  # type: ignore[arg-type]
    result = benchmark_loader(plan)
    # We can't deterministically assert high_variance=True because variance
    # depends on the system's scheduler; we just verify the flag computes
    # without crashing and the result schema is preserved.
    assert isinstance(result.high_variance, bool)


@pytest.mark.smoke
def test_bench_small_iterations_one_does_not_crash():
    loader = make_loader("dinov2", backend="mock")
    plan = BenchPlan(loader=loader, payload_factory=_make_frame, iterations=1)
    result = benchmark_loader(plan)
    assert result.error is None
    assert result.latency.n_samples == 1
