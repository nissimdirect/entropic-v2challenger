"""Tests for queue_sat.py — concurrent encode throughput."""

from __future__ import annotations

import numpy as np
import pytest

from q7_benchmark.loaders import make_loader
from q7_benchmark.queue_sat import (
    DEFAULT_SATURATION_THREADS,
    SaturationResult,
    measure_saturation,
)


def _frame_factory():
    return np.zeros((224, 224, 3), dtype=np.uint8)


@pytest.mark.smoke
def test_saturation_default_threads_is_4():
    assert DEFAULT_SATURATION_THREADS == 4


@pytest.mark.smoke
def test_saturation_completes_short_window():
    loader = make_loader("dinov2", backend="mock")
    result = measure_saturation(loader, _frame_factory, n_threads=2, window_seconds=0.5)
    assert isinstance(result, SaturationResult)
    assert result.n_threads == 2
    assert result.window_seconds == 0.5
    assert result.total_encodes > 0
    assert result.throughput_per_second > 0
    assert sum(result.per_thread_counts) == result.total_encodes
    assert result.error is None


@pytest.mark.smoke
def test_saturation_single_thread_works():
    loader = make_loader("clip", backend="mock")
    result = measure_saturation(
        loader, lambda: {"text": "x"}, n_threads=1, window_seconds=0.3
    )
    assert result.n_threads == 1
    assert result.total_encodes > 0


@pytest.mark.smoke
def test_saturation_rejects_zero_threads():
    loader = make_loader("dinov2", backend="mock")
    with pytest.raises(ValueError, match="n_threads"):
        measure_saturation(loader, _frame_factory, n_threads=0, window_seconds=0.5)


@pytest.mark.smoke
def test_saturation_rejects_zero_window():
    loader = make_loader("dinov2", backend="mock")
    with pytest.raises(ValueError, match="window_seconds"):
        measure_saturation(loader, _frame_factory, n_threads=2, window_seconds=0.0)


@pytest.mark.smoke
def test_saturation_real_backend_stub_reports_error():
    """PR #6 lights up DINOv2; CLIP still a stub so we test the error path against it."""
    loader = make_loader("clip", backend="cpu")
    result = measure_saturation(
        loader, lambda: {"text": "x"}, n_threads=2, window_seconds=0.3
    )
    assert result.error is not None
    assert "BACKEND_NOT_LIT" in result.error


@pytest.mark.smoke
def test_saturation_to_dict_shape():
    loader = make_loader("clap", backend="mock")
    result = measure_saturation(
        loader, lambda: {"text": "y"}, n_threads=2, window_seconds=0.3
    )
    d = result.to_dict()
    assert set(d.keys()) == {
        "n_threads",
        "window_seconds",
        "total_encodes",
        "throughput_per_second",
        "per_thread_counts",
        "error",
    }
    assert d["per_thread_counts"] == list(result.per_thread_counts)
