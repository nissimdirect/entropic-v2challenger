"""Interpolation jitter measurement (the Tier 5 gate).

The PR #5 measurement loop:
  1. Encode every Nth frame (sparse-encode) for a synthetic frame sequence
  2. Interpolate via slerp to recover intermediate-frame embeddings
  3. Time the per-frame production cost (sparse encode + slerp)
  4. Compute jitter stats per sparsity ratio
  5. Report by_sparsity dict; the canonical sparsity (DEC-Q7-009) drives the verdict

Slerp implementation: standard spherical-linear-interpolation formula on
unit vectors. Guards against near-parallel pairs (degenerate sin(omega))
by falling through to linear interpolation when angular separation is
below a small epsilon.

Synthetic frames: PR #5 uses a sequence of plausibly-shaped numpy frames
that vary slowly across time (so adjacent latents aren't identical,
exercising the slerp path). Real video sources land in PR #6+.
"""

from __future__ import annotations

import time
from dataclasses import dataclass

import numpy as np

from .loaders import Loader
from .stats import LatencyStats, compute_latency_stats

CANONICAL_SPARSITY = 8
SUPPORTED_SPARSITIES = (4, 8, 16, 32)

# Below this angular separation (radians) between two unit vectors we
# treat them as effectively parallel and use linear interpolation
# (avoids div-by-zero in the slerp denominator).
SLERP_LINEAR_FALLTHROUGH_EPS = 1e-6


def slerp(v0: np.ndarray, v1: np.ndarray, t: float) -> np.ndarray:
    """Spherical linear interpolation between two N-dim unit vectors.

    t=0 returns v0; t=1 returns v1. Inputs must be roughly unit-norm
    (small numerical drift is fine; the result is re-normalized).
    """
    v0 = np.asarray(v0, dtype=np.float64)
    v1 = np.asarray(v1, dtype=np.float64)
    dot = float(np.clip(np.dot(v0, v1), -1.0, 1.0))
    omega = float(np.arccos(dot))
    sin_omega = float(np.sin(omega))
    if abs(sin_omega) < SLERP_LINEAR_FALLTHROUGH_EPS:
        # Near-parallel: linear interpolation is numerically safe
        out = (1.0 - t) * v0 + t * v1
    else:
        a = float(np.sin((1.0 - t) * omega)) / sin_omega
        b = float(np.sin(t * omega)) / sin_omega
        out = a * v0 + b * v1
    norm = float(np.linalg.norm(out))
    if norm > 0:
        out = out / norm
    return out.astype(np.float32)


@dataclass(frozen=True)
class SparsityResult:
    sparsity: int
    jitter: LatencyStats
    n_frames: int
    error: str | None = None

    def to_dict(self) -> dict:
        return {
            "sparsity": self.sparsity,
            "jitter_p50_ms": self.jitter.p50_ms,
            "jitter_p95_ms": self.jitter.p95_ms,
            "jitter_p99_ms": self.jitter.p99_ms,
            "jitter_max_ms": self.jitter.max_ms,
            "jitter_stddev_ms": self.jitter.stddev_ms,
            "n_frames": self.n_frames,
            "error": self.error,
        }


def _frame_seq(n_frames: int, seed: int = 0) -> list:
    """Generate a deterministic sequence of synthetic frames.

    Each frame is a 224x224x3 uint8 array with a slowly varying pattern so
    adjacent frames produce distinct (but related) latents — exercising the
    slerp interpolation path realistically.
    """
    rng = np.random.default_rng(seed)
    base = rng.integers(0, 256, size=(224, 224, 3), dtype=np.uint8)
    frames = []
    for i in range(n_frames):
        # Slow drift: shift base array circularly + add a small DC bias
        shifted = np.roll(base, shift=i, axis=0)
        bias = (i * 3) % 256
        frame = ((shifted.astype(np.uint16) + bias) % 256).astype(np.uint8)
        frames.append(frame)
    return frames


def measure_jitter_at_sparsity(
    loader: Loader,
    *,
    sparsity: int,
    n_frames: int,
    seed: int = 0,
) -> SparsityResult:
    """Measure per-frame jitter at a single sparsity ratio.

    Sparsity N means: encode frames 0, N, 2N, ... and slerp between encoded
    representations to produce intermediate frames. Jitter is the per-frame
    wall-clock cost (sparse-encode amortized + slerp).
    """
    if sparsity not in SUPPORTED_SPARSITIES:
        raise ValueError(
            f"sparsity must be one of {SUPPORTED_SPARSITIES}, got {sparsity}"
        )
    if n_frames < 2 * sparsity:
        raise ValueError(
            f"n_frames ({n_frames}) must be at least 2*sparsity ({2 * sparsity})"
        )

    frames = _frame_seq(n_frames, seed=seed)
    latencies = np.empty(n_frames, dtype=np.float64)

    # Cache: index → embedding for every Nth frame
    cache: dict[int, np.ndarray] = {}

    try:
        for i in range(n_frames):
            t0 = time.perf_counter()
            anchor_lo = (i // sparsity) * sparsity
            anchor_hi = anchor_lo + sparsity

            if i == anchor_lo:
                # On the sparse-encode boundary; do a real encode
                if anchor_lo not in cache:
                    cache[anchor_lo] = loader.encode(frames[anchor_lo]).embedding
                _ = cache[anchor_lo]
            else:
                # Need anchors at i_lo and i_hi; encode lazily
                if anchor_lo not in cache:
                    cache[anchor_lo] = loader.encode(frames[anchor_lo]).embedding
                if anchor_hi < n_frames and anchor_hi not in cache:
                    cache[anchor_hi] = loader.encode(frames[anchor_hi]).embedding
                # Slerp between anchors
                t = (i - anchor_lo) / sparsity
                if anchor_hi < n_frames:
                    _ = slerp(cache[anchor_lo], cache[anchor_hi], t)
                else:
                    # Past the last sparse anchor; use the last anchor verbatim
                    _ = cache[anchor_lo]

            latencies[i] = (time.perf_counter() - t0) * 1000.0
    except NotImplementedError as exc:
        return SparsityResult(
            sparsity=sparsity,
            jitter=_empty_stats(),
            n_frames=0,
            error=f"BACKEND_NOT_LIT: {exc}",
        )

    return SparsityResult(
        sparsity=sparsity,
        jitter=compute_latency_stats(latencies),
        n_frames=n_frames,
    )


def measure_jitter_all_sparsities(
    loader: Loader,
    *,
    n_frames_per_sparsity: int = 256,
    seed: int = 0,
) -> dict[int, SparsityResult]:
    """Measure jitter at every supported sparsity. Returns dict by sparsity int."""
    results: dict[int, SparsityResult] = {}
    for sparsity in SUPPORTED_SPARSITIES:
        results[sparsity] = measure_jitter_at_sparsity(
            loader,
            sparsity=sparsity,
            n_frames=n_frames_per_sparsity,
            seed=seed,
        )
    return results


def jitter_dict_for_report(
    results: dict[int, SparsityResult],
    canonical: int = CANONICAL_SPARSITY,
) -> dict:
    """Build the interpolation block for the 0.3.0 report.

    Top-level jitter_p95_ms references the canonical sparsity per DEC-Q7-009.
    by_sparsity has string keys (JSON-friendly).
    """
    by_sparsity = {str(s): r.to_dict() for s, r in results.items()}
    canonical_result = results.get(canonical)
    if canonical_result is None:
        canonical_p50 = canonical_p95 = 0.0
        below_threshold = False
    else:
        canonical_p50 = canonical_result.jitter.p50_ms
        canonical_p95 = canonical_result.jitter.p95_ms
        below_threshold = canonical_p95 < 50.0
    return {
        "canonical_sparsity": canonical,
        "by_sparsity": by_sparsity,
        "jitter_p50_ms": canonical_p50,
        "jitter_p95_ms": canonical_p95,
        "below_threshold_50ms": below_threshold,
    }


def _empty_stats() -> LatencyStats:
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
