"""Tests for charts.py — render lazy-imports matplotlib; smoke-tier verifies the shape."""

from __future__ import annotations

import pytest

from q7_benchmark.mock import mock_measure
from q7_benchmark.verdict import verdict_from_measurement


def _matplotlib_available() -> bool:
    try:
        import matplotlib  # noqa: F401
    except ImportError:
        return False
    return True


def _full_report() -> dict:
    measurement = mock_measure(seed=42, sparsity=8)
    verdict = verdict_from_measurement(measurement).to_dict()
    return {
        "schema_version": "0.3.0",
        "mode": "mock",
        "backend": "mock",
        "sparsity": 8,
        "generated_at": "2026-06-03T17:00:00Z",
        "measurement": measurement,
        "verdict": verdict,
    }


@pytest.mark.smoke
def test_charts_lazy_import_when_matplotlib_missing(monkeypatch):
    """Without matplotlib, render functions raise RuntimeError with install hint."""
    if _matplotlib_available():
        pytest.skip("matplotlib IS installed — this test verifies the missing path")
    from q7_benchmark.charts import render_latency_by_backbone
    from pathlib import Path

    with pytest.raises(RuntimeError, match="matplotlib"):
        render_latency_by_backbone(_full_report(), Path("/tmp/x.png"))


@pytest.mark.smoke
@pytest.mark.skipif(not _matplotlib_available(), reason="matplotlib required")
def test_render_latency_chart_writes_png(tmp_path):
    from q7_benchmark.charts import render_latency_by_backbone

    out = tmp_path / "latency.png"
    path = render_latency_by_backbone(_full_report(), out)
    assert path == out
    assert path.exists()
    assert path.stat().st_size > 1000  # reasonable PNG size


@pytest.mark.smoke
@pytest.mark.skipif(not _matplotlib_available(), reason="matplotlib required")
def test_render_jitter_chart_writes_png(tmp_path):
    from q7_benchmark.charts import render_jitter_by_sparsity

    out = tmp_path / "jitter.png"
    path = render_jitter_by_sparsity(_full_report(), out)
    assert path == out
    assert path.exists()


@pytest.mark.smoke
@pytest.mark.skipif(not _matplotlib_available(), reason="matplotlib required")
def test_render_all_charts_returns_dict(tmp_path):
    from q7_benchmark.charts import render_all_charts

    paths = render_all_charts(_full_report(), tmp_path)
    assert set(paths.keys()) == {"latency_by_backbone", "jitter_by_sparsity"}
    for p in paths.values():
        assert p.exists()
