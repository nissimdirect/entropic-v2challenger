"""Q7 benchmark orchestration — warmup, N iterations, stats collection.

Drives a Loader through a measurement cycle. Single source of truth for
the protocol defined in DEC-Q7-006:
  1. Cold-load probe (timed; stored on the loader instance)
  2. Warmup (3 iterations; timing discarded; shape validated)
  3. Measured iterations (N=100 by default)
  4. Stats computation via stats.compute_latency_stats

Backend-agnostic — works with mock loaders (CI smoke), torch/MPS loaders
(macOS dev), and the real MLX loaders (Apple silicon `--measure`).
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Callable

import numpy as np

from .loaders import Loader
from .stats import LatencyStats, compute_latency_stats, variance_flag

WARMUP_ITERATIONS = 3
DEFAULT_MEASURED_ITERATIONS = 100


@dataclass(frozen=True)
class BenchResult:
    """Outcome of a single backbone's benchmark run."""

    name: str
    embed_dim: int
    backend: str
    cold_load_seconds: float | None
    latency: LatencyStats
    high_variance: bool
    warmup_iterations: int
    error: str | None = None

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "embed_dim": self.embed_dim,
            "backend": self.backend,
            "cold_load_seconds": self.cold_load_seconds,
            "encode_latency": self.latency.to_dict(),
            "high_variance": self.high_variance,
            "warmup_iterations": self.warmup_iterations,
            "error": self.error,
        }


@dataclass
class BenchPlan:
    """Recipe for a single backbone's benchmark.

    payload_factory is called for each iteration; it should return a fresh
    payload so loaders that cache by reference don't short-circuit.
    """

    loader: Loader
    payload_factory: Callable[[], object]
    iterations: int = DEFAULT_MEASURED_ITERATIONS
    warmup: int = WARMUP_ITERATIONS


class BackendNotLitError(Exception):
    """Raised by the bench when a Loader.encode raises NotImplementedError.

    PR #3 real-backend stubs raise NotImplementedError; the benchmark catches
    and surfaces this as a clean error in the report (vs crashing the run).
    """


def _run_cold_load(loader: Loader, payload: object) -> tuple[float | None, str | None]:
    """Trigger first encode (which may lazy-load the model) and time it.

    For mock loaders, cold_load_seconds is 0.0 (set in the loader itself).
    For real loaders in PR #3 stub state, raises NotImplementedError →
    returns (None, error_message).
    """
    if loader.cold_load_seconds is not None:
        return loader.cold_load_seconds, None
    start = time.perf_counter()
    try:
        loader.encode(payload)
    except NotImplementedError as exc:
        return None, f"BACKEND_NOT_LIT: {exc}"
    return time.perf_counter() - start, None


def run_warmup(plan: BenchPlan) -> str | None:
    """Discard timing; validate that encode produces an output of declared shape.

    Returns None on success, error string on failure.
    """
    for _ in range(plan.warmup):
        try:
            result = plan.loader.encode(plan.payload_factory())
        except NotImplementedError as exc:
            return f"BACKEND_NOT_LIT: {exc}"
        if result.embedding.shape != (plan.loader.embed_dim,):
            return (
                f"shape mismatch: encode returned {result.embedding.shape}, "
                f"expected ({plan.loader.embed_dim},)"
            )
    return None


def run_measured(plan: BenchPlan) -> tuple[np.ndarray, str | None]:
    """Run plan.iterations encodes, collecting per-iteration latency.

    Returns (latencies_ms array, error or None).
    """
    latencies = np.empty(plan.iterations, dtype=np.float64)
    for i in range(plan.iterations):
        payload = plan.payload_factory()
        try:
            t0 = time.perf_counter()
            plan.loader.encode(payload)
            latencies[i] = (time.perf_counter() - t0) * 1000.0
        except NotImplementedError as exc:
            return latencies[:i], f"BACKEND_NOT_LIT: {exc}"
    return latencies, None


def benchmark_loader(plan: BenchPlan) -> BenchResult:
    """Run the full cycle (cold-load → warmup → measured) for one loader."""
    # Cold-load
    cold_load, cold_err = _run_cold_load(plan.loader, plan.payload_factory())
    if cold_err is not None:
        return BenchResult(
            name=plan.loader.name,
            embed_dim=plan.loader.embed_dim,
            backend=getattr(plan.loader, "_backend", "mock"),
            cold_load_seconds=None,
            latency=_empty_stats(),
            high_variance=False,
            warmup_iterations=plan.warmup,
            error=cold_err,
        )

    # Warmup
    warmup_err = run_warmup(plan)
    if warmup_err is not None:
        return BenchResult(
            name=plan.loader.name,
            embed_dim=plan.loader.embed_dim,
            backend=getattr(plan.loader, "_backend", "mock"),
            cold_load_seconds=cold_load,
            latency=_empty_stats(),
            high_variance=False,
            warmup_iterations=plan.warmup,
            error=warmup_err,
        )

    # Measured
    latencies, measured_err = run_measured(plan)
    if measured_err is not None:
        return BenchResult(
            name=plan.loader.name,
            embed_dim=plan.loader.embed_dim,
            backend=getattr(plan.loader, "_backend", "mock"),
            cold_load_seconds=cold_load,
            latency=_empty_stats()
            if latencies.size == 0
            else compute_latency_stats(latencies),
            high_variance=False,
            warmup_iterations=plan.warmup,
            error=measured_err,
        )

    stats = compute_latency_stats(latencies)
    return BenchResult(
        name=plan.loader.name,
        embed_dim=plan.loader.embed_dim,
        backend=getattr(plan.loader, "_backend", "mock"),
        cold_load_seconds=cold_load,
        latency=stats,
        high_variance=variance_flag(stats),
        warmup_iterations=plan.warmup,
        error=None,
    )


def _empty_stats() -> LatencyStats:
    """Zero-filled stats for error paths."""
    return LatencyStats(
        p50_ms=0.0,
        p95_ms=0.0,
        p99_ms=0.0,
        max_ms=0.0,
        min_ms=0.0,
        mean_ms=0.0,
        stddev_ms=0.0,
        n_samples=0,
    )
