"""Tests for markdown_report.py — renders 0.3.0 report dicts to markdown."""

from __future__ import annotations

import json

import pytest

from q7_benchmark.markdown_report import RenderOptions, render_markdown, render_to_file
from q7_benchmark.mock import mock_measure
from q7_benchmark.verdict import verdict_from_measurement


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
def test_render_markdown_returns_string():
    md = render_markdown(_full_report())
    assert isinstance(md, str)
    assert len(md) > 200


@pytest.mark.smoke
def test_render_markdown_includes_verdict_state():
    md = render_markdown(_full_report())
    assert ("TIER_5_GO" in md) or ("TIER_5_CONDITIONAL" in md) or ("TIER_5_NO_GO" in md)


@pytest.mark.smoke
def test_render_markdown_includes_canonical_sparsity():
    md = render_markdown(_full_report())
    assert "canonical" in md.lower()
    assert "1:8" in md


@pytest.mark.smoke
def test_render_markdown_includes_50ms_gate_reference():
    md = render_markdown(_full_report())
    assert "50ms" in md.lower() or "50.0ms" in md.lower() or "50 ms" in md.lower()


@pytest.mark.smoke
def test_render_markdown_includes_all_three_backbones():
    md = render_markdown(_full_report())
    for name in ("dinov2", "clip", "clap"):
        assert name in md.lower()


@pytest.mark.smoke
def test_render_markdown_includes_all_four_sparsities():
    md = render_markdown(_full_report())
    for s in ("1:4", "1:8", "1:16", "1:32"):
        assert s in md


@pytest.mark.smoke
def test_render_markdown_includes_recommendation_section():
    md = render_markdown(_full_report())
    assert "## Recommendation" in md or "## Memory" in md  # both are sections


@pytest.mark.smoke
def test_render_markdown_includes_cross_references():
    md = render_markdown(_full_report())
    assert "DEC-Q7-007" in md
    assert "DEC-Q7-009" in md
    assert "DEC-Q7-014" in md


@pytest.mark.smoke
def test_render_to_file_writes_disk(tmp_path):
    out = tmp_path / "report.md"
    path = render_to_file(_full_report(), out)
    assert path == out
    assert path.exists()
    text = path.read_text()
    assert "Q7" in text


@pytest.mark.smoke
def test_render_options_can_disable_charts():
    opts = RenderOptions(include_charts=False)
    md = render_markdown(_full_report(), opts)
    assert "![" not in md  # no markdown image syntax


@pytest.mark.smoke
def test_render_with_chart_paths_includes_images(tmp_path):
    chart_paths = {
        "latency_by_backbone": tmp_path / "latency.png",
        "jitter_by_sparsity": tmp_path / "jitter.png",
    }
    opts = RenderOptions(include_charts=True, chart_paths=chart_paths)
    md = render_markdown(_full_report(), opts)
    assert "![Per-backbone latency]" in md
    assert "![Jitter by sparsity]" in md


@pytest.mark.smoke
def test_render_raw_json_appendix_includes_json():
    opts = RenderOptions(include_raw_json_appendix=True)
    md = render_markdown(_full_report(), opts)
    assert "```json" in md
    assert "schema_version" in md


@pytest.mark.smoke
def test_render_with_high_variance_flag_surfaces():
    report = _full_report()
    report["verdict"]["flags"] = ["HIGH_VARIANCE"]
    md = render_markdown(report)
    assert "HIGH_VARIANCE" in md


@pytest.mark.smoke
def test_render_with_no_go_verdict_recommends_defer():
    report = _full_report()
    report["verdict"]["state"] = "TIER_5_NO_GO"
    report["verdict"]["canonical_p95_ms"] = 150.0
    md = render_markdown(report)
    assert "Defer" in md or "v1.1" in md


@pytest.mark.smoke
def test_render_with_conditional_verdict_recommends_rerun():
    report = _full_report()
    report["verdict"]["state"] = "TIER_5_CONDITIONAL"
    report["verdict"]["canonical_p95_ms"] = 75.0
    md = render_markdown(report)
    assert "Re-run" in md or "cold boot" in md
