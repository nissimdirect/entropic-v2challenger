"""Deterministic mock backend — returns synthetic results from a seed.

Schema 0.3.0 (PR #5) shape: matches `measurement` shape produced by the
bench module on real loaders + verdict block. Keeping the mock synthesized
(rather than running real bench on mock loaders) preserves byte-determinism.

Determinism contract: identical seed + sparsity → byte-identical JSON.
"""

from __future__ import annotations

import random

EMBED_DIMS = {
    "dinov2": 384,
    "clip": 512,
    "clap": 512,
}

SUPPORTED_SPARSITIES = (4, 8, 16, 32)
CANONICAL_SPARSITY = 8


def _synth_latency(rng: random.Random, base_ms: float) -> dict:
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


def _synth_sparsity_jitter(rng: random.Random, sparsity: int) -> dict:
    """Synthesize jitter stats per sparsity. Lower sparsity = higher cost."""
    base = 30.0 / max(sparsity / 4, 1.0)
    p50 = round(rng.uniform(base * 0.8, base * 1.0), 4)
    p95 = round(p50 * rng.uniform(1.2, 1.5), 4)
    p99 = round(p95 * rng.uniform(1.1, 1.3), 4)
    max_ms = round(p99 * rng.uniform(1.0, 1.3), 4)
    stddev = round(p50 * rng.uniform(0.1, 0.2), 4)
    return {
        "sparsity": sparsity,
        "jitter_p50_ms": p50,
        "jitter_p95_ms": p95,
        "jitter_p99_ms": p99,
        "jitter_max_ms": max_ms,
        "jitter_stddev_ms": stddev,
        "n_frames": 256,
        "error": None,
    }


def mock_measure(*, seed: int, sparsity: int) -> dict:
    rng = random.Random(seed)
    base_latencies = {"dinov2": 8.0, "clip": 12.0, "clap": 18.0}
    heads = {
        name: _synth_head(rng, name, base_latencies[name])
        for name in ("dinov2", "clip", "clap")
    }

    by_sparsity = {str(s): _synth_sparsity_jitter(rng, s) for s in SUPPORTED_SPARSITIES}
    canonical = by_sparsity[str(CANONICAL_SPARSITY)]
    canonical_p50 = canonical["jitter_p50_ms"]
    canonical_p95 = canonical["jitter_p95_ms"]

    queue_throughput = round(rng.uniform(80.0, 140.0), 2)
    queue_total = int(queue_throughput * 5.0)

    return {
        "heads": heads,
        "interpolation": {
            "canonical_sparsity": CANONICAL_SPARSITY,
            "by_sparsity": by_sparsity,
            "sparsity": sparsity,
            "jitter_p50_ms": canonical_p50,
            "jitter_p95_ms": canonical_p95,
            "below_threshold_50ms": canonical_p95 < 50.0,
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
