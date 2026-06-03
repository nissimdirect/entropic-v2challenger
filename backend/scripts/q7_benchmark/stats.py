"""Statistical primitives for Q7 benchmark.

Pure NumPy; no outlier removal (per DEC-Q7-006). Inputs are 1-D arrays of
per-iteration latencies in milliseconds; outputs are dicts shaped for the
report schema.
"""

from __future__ import annotations

from dataclasses import dataclass, asdict

import numpy as np


@dataclass(frozen=True)
class LatencyStats:
    p50_ms: float
    p95_ms: float
    p99_ms: float
    max_ms: float
    min_ms: float
    mean_ms: float
    stddev_ms: float
    n_samples: int

    def to_dict(self) -> dict:
        return asdict(self)


def compute_latency_stats(latencies_ms: np.ndarray) -> LatencyStats:
    """Compute percentiles + summary stats from raw per-iteration latencies.

    No outlier removal — per DEC-Q7-006 the Q7 verdict cares about real
    user-perceived worst-case timing, not a trimmed mean.

    Raises ValueError if the input is empty.
    """
    arr = np.asarray(latencies_ms, dtype=np.float64)
    if arr.size == 0:
        raise ValueError("cannot compute stats on empty latency array")
    p50, p95, p99 = np.percentile(arr, [50, 95, 99], method="linear")
    return LatencyStats(
        p50_ms=round(float(p50), 4),
        p95_ms=round(float(p95), 4),
        p99_ms=round(float(p99), 4),
        max_ms=round(float(arr.max()), 4),
        min_ms=round(float(arr.min()), 4),
        mean_ms=round(float(arr.mean()), 4),
        stddev_ms=round(float(arr.std(ddof=0)), 4),
        n_samples=int(arr.size),
    )


def variance_flag(stats: LatencyStats, threshold_ratio: float = 1.0) -> bool:
    """True if stddev > threshold_ratio * p50 (high-variance signal).

    Per DEC-Q7-006 we surface a "high variance — Tier 5 may have hitches"
    flag rather than hiding the worst case. Default threshold 1.0 means
    stddev exceeding p50.
    """
    if stats.p50_ms <= 0:
        return False
    return stats.stddev_ms > threshold_ratio * stats.p50_ms
