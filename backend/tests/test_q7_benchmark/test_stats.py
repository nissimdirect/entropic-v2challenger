"""Tests for stats.py — percentile computation, variance flag."""

from __future__ import annotations

import numpy as np
import pytest

from q7_benchmark.stats import LatencyStats, compute_latency_stats, variance_flag


@pytest.mark.smoke
def test_stats_sorted_array_known_percentiles():
    arr = np.array([1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0])
    stats = compute_latency_stats(arr)
    assert stats.n_samples == 10
    assert stats.min_ms == 1.0
    assert stats.max_ms == 10.0
    assert stats.mean_ms == 5.5
    # numpy linear-interp p50 of 1..10 = 5.5
    assert stats.p50_ms == 5.5


@pytest.mark.smoke
def test_stats_p99_close_to_max():
    arr = np.arange(1, 101, dtype=np.float64)
    stats = compute_latency_stats(arr)
    assert stats.p50_ms == 50.5
    assert stats.p95_ms == 95.05
    assert stats.p99_ms == 99.01
    assert stats.max_ms == 100.0


@pytest.mark.smoke
def test_stats_constant_array_zero_stddev():
    arr = np.full(50, 12.5, dtype=np.float64)
    stats = compute_latency_stats(arr)
    assert stats.p50_ms == 12.5
    assert stats.p95_ms == 12.5
    assert stats.stddev_ms == 0.0


@pytest.mark.smoke
def test_stats_empty_raises():
    with pytest.raises(ValueError, match="empty"):
        compute_latency_stats(np.array([], dtype=np.float64))


@pytest.mark.smoke
def test_stats_single_value():
    stats = compute_latency_stats(np.array([42.0]))
    assert stats.p50_ms == 42.0
    assert stats.p95_ms == 42.0
    assert stats.p99_ms == 42.0
    assert stats.max_ms == 42.0


@pytest.mark.smoke
def test_stats_to_dict_keys():
    arr = np.array([1.0, 2.0, 3.0])
    stats = compute_latency_stats(arr)
    d = stats.to_dict()
    assert set(d.keys()) == {
        "p50_ms",
        "p95_ms",
        "p99_ms",
        "max_ms",
        "min_ms",
        "mean_ms",
        "stddev_ms",
        "n_samples",
    }


@pytest.mark.smoke
def test_variance_flag_low_variance_returns_false():
    stats = LatencyStats(
        p50_ms=10.0,
        p95_ms=12.0,
        p99_ms=13.0,
        max_ms=14.0,
        min_ms=9.0,
        mean_ms=10.5,
        stddev_ms=1.0,
        n_samples=100,
    )
    assert variance_flag(stats) is False


@pytest.mark.smoke
def test_variance_flag_high_variance_returns_true():
    stats = LatencyStats(
        p50_ms=10.0,
        p95_ms=50.0,
        p99_ms=80.0,
        max_ms=120.0,
        min_ms=5.0,
        mean_ms=20.0,
        stddev_ms=15.0,  # > p50
        n_samples=100,
    )
    assert variance_flag(stats) is True


@pytest.mark.smoke
def test_variance_flag_zero_p50_returns_false():
    """Edge: p50=0 shouldn't trigger divide-by-zero or false positive."""
    stats = LatencyStats(
        p50_ms=0.0,
        p95_ms=0.0,
        p99_ms=0.0,
        max_ms=0.0,
        min_ms=0.0,
        mean_ms=0.0,
        stddev_ms=0.0,
        n_samples=0,
    )
    assert variance_flag(stats) is False


@pytest.mark.smoke
def test_variance_flag_custom_threshold():
    stats = LatencyStats(
        p50_ms=10.0,
        p95_ms=12.0,
        p99_ms=13.0,
        max_ms=14.0,
        min_ms=9.0,
        mean_ms=10.5,
        stddev_ms=2.5,  # > 0.2 * 10 but < 1.0 * 10
        n_samples=100,
    )
    assert variance_flag(stats, threshold_ratio=0.2) is True
    assert variance_flag(stats, threshold_ratio=1.0) is False
