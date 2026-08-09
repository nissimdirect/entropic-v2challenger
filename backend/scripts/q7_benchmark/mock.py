"""Deterministic mock backend — returns synthetic results from a seed.

Used in CI smoke and harness self-tests. Returns plausibly-shaped numbers so
the report schema validator and downstream rendering code (PR #7) can be
exercised end-to-end without model weights.

Determinism contract: identical seed + sparsity → byte-identical JSON output.
This lets the smoke test diff two runs and fail on accidental nondeterminism.
"""

from __future__ import annotations

import random

# Embedding dimensions per backbone (matches PR #3 real loaders)
EMBED_DIMS = {
    "dinov2": 384,  # ViT-S/14
    "clip": 512,  # ViT-B/32
    "clap": 512,  # HTSAT-base
}


def _synth_latency(rng: random.Random, base_ms: float) -> dict:
    """Synthesize p50/p95/p99/max + stddev for an encode operation."""
    p50 = round(rng.uniform(base_ms * 0.9, base_ms * 1.1), 3)
    p95 = round(p50 * rng.uniform(1.3, 1.8), 3)
    p99 = round(p95 * rng.uniform(1.1, 1.3), 3)
    max_ms = round(p99 * rng.uniform(1.1, 1.5), 3)
    stddev = round(p50 * rng.uniform(0.1, 0.25), 3)
    return {
        "p50_ms": p50,
        "p95_ms": p95,
        "p99_ms": p99,
        "max_ms": max_ms,
        "stddev_ms": stddev,
        "n_samples": 100,
    }


def mock_measure(*, seed: int, sparsity: int) -> dict:
    """Return a synthetic measurement dict shaped like a real run.

    Shape MUST match what the real benchmark (PR #4+) produces so the report
    schema validator catches drift.
    """
    rng = random.Random(seed)

    # Base latencies (ms) for mock — plausible Apple silicon ranges
    base_latencies = {"dinov2": 8.0, "clip": 12.0, "clap": 18.0}

    heads = {
        name: {
            "embed_dim": EMBED_DIMS[name],
            "encode_latency": _synth_latency(rng, base_latencies[name]),
        }
        for name in ("dinov2", "clip", "clap")
    }

    interpolation_jitter_ms = round(rng.uniform(15.0, 45.0), 3)
    queue_throughput_per_s = round(rng.uniform(80.0, 140.0), 2)

    return {
        "heads": heads,
        "interpolation": {
            "sparsity": sparsity,
            "jitter_p50_ms": interpolation_jitter_ms,
            "jitter_p95_ms": round(interpolation_jitter_ms * rng.uniform(1.4, 1.8), 3),
            "below_threshold_50ms": interpolation_jitter_ms < 50.0,
        },
        "queue": {
            "throughput_encodes_per_s": queue_throughput_per_s,
            "saturation_test_n": 1000,
        },
        "memory": {
            "resident_mb": round(rng.uniform(450.0, 520.0), 1),
            "peak_mb": round(rng.uniform(520.0, 610.0), 1),
        },
    }
