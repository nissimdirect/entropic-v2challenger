"""Tests for SG-7 codec timeout telemetry (PR #23)."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

BACKEND_SRC = Path(__file__).resolve().parents[2] / "src"
if str(BACKEND_SRC) not in sys.path:
    sys.path.insert(0, str(BACKEND_SRC))

from safety.codec_telemetry import (
    CodecTimeoutCounter,
    CodecTimeoutEvent,
    global_codec_telemetry,
    reset_global_codec_telemetry_for_testing,
)


@pytest.fixture(autouse=True)
def _reset():
    reset_global_codec_telemetry_for_testing()
    yield
    reset_global_codec_telemetry_for_testing()


@pytest.mark.smoke
def test_counter_starts_at_zero():
    c = CodecTimeoutCounter()
    assert c.total == 0
    assert c.history == []
    assert c.stats()["total"] == 0


@pytest.mark.smoke
def test_record_increments_total():
    c = CodecTimeoutCounter()
    c.record("/tmp/a.mp4", "av.open", 5.0)
    c.record("/tmp/b.mp4", "av.open", 5.0)
    assert c.total == 2


@pytest.mark.smoke
def test_record_appends_event_history():
    c = CodecTimeoutCounter()
    c.record("/tmp/a.mp4", "av.open", 5.2)
    assert len(c.history) == 1
    event = c.history[0]
    assert isinstance(event, CodecTimeoutEvent)
    assert event.asset_path == "/tmp/a.mp4"
    assert event.elapsed_s == 5.2


@pytest.mark.smoke
def test_history_bounded():
    c = CodecTimeoutCounter(history_limit=5)
    for i in range(20):
        c.record(f"/tmp/{i}.mp4", "probe", 5.0)
    assert c.total == 20  # total counts everything
    assert len(c.history) == 5  # but history is bounded
    # FIFO: should have the LAST 5
    assert c.history[0].asset_path == "/tmp/15.mp4"
    assert c.history[-1].asset_path == "/tmp/19.mp4"


@pytest.mark.smoke
def test_stats_returns_recent_subset():
    c = CodecTimeoutCounter()
    for i in range(15):
        c.record(f"/tmp/{i}.mp4", "probe", 5.0)
    stats = c.stats()
    assert stats["total"] == 15
    # stats.recent caps at 10 for terseness
    assert len(stats["recent"]) == 10


@pytest.mark.smoke
def test_stats_event_shape():
    c = CodecTimeoutCounter()
    c.record("/tmp/x.mp4", "av.open", 4.5)
    stats = c.stats()
    event = stats["recent"][0]
    assert event["asset_path"] == "/tmp/x.mp4"
    assert event["operation"] == "av.open"
    assert event["elapsed_s"] == 4.5
    assert "occurred_at_s" in event


@pytest.mark.smoke
def test_reset_clears_state():
    c = CodecTimeoutCounter()
    for i in range(5):
        c.record(f"/tmp/{i}.mp4", "probe", 5.0)
    c.reset()
    assert c.total == 0
    assert c.history == []


@pytest.mark.smoke
def test_thread_safe_under_concurrent_increments():
    """Many threads recording → total matches expected count."""
    import threading

    c = CodecTimeoutCounter()
    n_threads = 8
    per_thread = 100
    threads = []

    def worker():
        for i in range(per_thread):
            c.record(f"/tmp/{i}.mp4", "probe", 5.0)

    for _ in range(n_threads):
        t = threading.Thread(target=worker)
        threads.append(t)
        t.start()
    for t in threads:
        t.join()

    assert c.total == n_threads * per_thread


@pytest.mark.smoke
def test_sentry_not_installed_does_not_crash():
    """Recording works even when sentry_sdk import fails."""
    c = CodecTimeoutCounter()
    # Whether sentry is installed or not, recording must work
    c.record("/tmp/x.mp4", "av.open", 5.0)
    assert c.total == 1


@pytest.mark.smoke
def test_sentry_misconfig_does_not_crash(monkeypatch):
    """If sentry_sdk is installed but add_breadcrumb raises, we must not crash."""
    fake_sentry = type(sys)("sentry_sdk")

    def bad_breadcrumb(**kwargs):
        raise RuntimeError("sentry disabled")

    fake_sentry.add_breadcrumb = bad_breadcrumb  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "sentry_sdk", fake_sentry)

    c = CodecTimeoutCounter()
    c.record("/tmp/x.mp4", "av.open", 5.0)
    assert c.total == 1


@pytest.mark.smoke
def test_global_counter_singleton():
    g1 = global_codec_telemetry()
    g2 = global_codec_telemetry()
    assert g1 is g2


@pytest.mark.smoke
def test_global_counter_persists_state():
    global_codec_telemetry().record("/tmp/x.mp4", "av.open", 5.0)
    assert global_codec_telemetry().total == 1
