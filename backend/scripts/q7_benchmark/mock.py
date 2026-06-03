"""Deterministic mock backend — returns synthetic results from a seed.

Schema 0.2.0 (PR #4) shape: matches `measurement` shape produced by the
bench module on real loaders. Keeping the mock synthesized (rather than
running real bench on mock loaders) preserves byte-determinism: `--seed N
--sparsity K` twice produces identical JSON. Real bench timings vary by
system so we can't use them here.

Determinism contract: identical seed + sparsity → byte-identical JSON.
"""

from __future__ import annotations

import random

EMBED_DIMS = {
    "dinov2": 384,
    "clip": 512,
    "clap": 512,
}


def _synth_latency(rng: random.Random, base_ms: float) -> dict:
    """Synthesize p50/p95/p99/min/max/mean/stddev for an encode operation."""
    p50 = round(rng.uniform(base_ms * 0.9, base_ms * 1.1), 4)
    p95 = round(p50 * rng.uniform(1.3, 1.8), 4)
    p99 = round(p95 * rng.uniform(1.1, 1.3), 4)
    max_ms = round(p99 * rng.uniform(1.1, 1.5), 4)
    min_ms = round(p50 * rng.uniform(0.5, 0.9), 4)
    mean_ms = round(p50 * rng.uniform(0.95, 1.10), 4)
    stddev_ms = round(p50 * rng.uniform(0.1, 0.25), 4)
    return {
        "p50_ms": p50,
        "p95_ms": p95,
        "p99_ms": p99,
        "max_ms": max_ms,
        "min_ms": min_ms,
        "mean_ms": mean_ms,
        "stddev_ms": stddev_ms,
        "n_samples": 100,
    }


def _synth_head(rng: random.Random, name: str, base_ms: float) -> dict:
    return {
        "embed_dim": EMBED_DIMS[name],
        "backend": "mock",
        "cold_load_seconds": 0.0,
        "encode_latency": _synth_latency(rng, base_ms),
        "high_variance": False,
        "warmup_iterations": 3,
        "error": None,
    }


def mock_measure(*, seed: int, sparsity: int) -> dict:
    """Return a synthetic measurement dict shaped like a real run.

    Shape MUST match what `bench.benchmark_loader().to_dict()` produces so
    downstream report rendering only sees one shape.
    """
    rng = random.Random(seed)

    # Base latencies (ms) — plausible Apple silicon ranges per backbone
    base_latencies = {"dinov2": 8.0, "clip": 12.0, "clap": 18.0}
    heads = {
        name: _synth_head(rng, name, base_latencies[name])
        for name in ("dinov2", "clip", "clap")
    }

    interpolation_jitter_ms = round(rng.uniform(15.0, 45.0), 4)
    queue_throughput = round(rng.uniform(80.0, 140.0), 2)
    queue_total = int(queue_throughput * 5.0)  # 5s window

    return {
        "heads": heads,
        "interpolation": {
            "sparsity": sparsity,
            "jitter_p50_ms": interpolation_jitter_ms,
            "jitter_p95_ms": round(interpolation_jitter_ms * rng.uniform(1.4, 1.8), 4),
            "below_threshold_50ms": interpolation_jitter_ms < 50.0,
            "degradation_under_load": False,
        },
        "queue": {
            "n_threads": 4,
            "window_seconds": 5.0,
            "total_encodes": queue_total,
            "throughput_per_second": queue_throughput,
            "per_thread_counts": [queue_total // 4] * 4,
        },
        "memory": {
            "resident_mb": round(rng.uniform(450.0, 520.0), 1),
            "peak_mb": round(rng.uniform(520.0, 610.0), 1),
        },
    }
