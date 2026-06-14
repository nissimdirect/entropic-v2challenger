"""Tests for I1 Inspector probe registry (PR #22)."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

BACKEND_SRC = Path(__file__).resolve().parents[2] / "src"
if str(BACKEND_SRC) not in sys.path:
    sys.path.insert(0, str(BACKEND_SRC))

from inspector import (
    Probe,
    ProbeKind,
    ProbeRegistry,
    ProbeSnapshot,
    global_probe_registry,
    reset_global_probe_registry_for_testing,
)


@pytest.fixture(autouse=True)
def _reset():
    reset_global_probe_registry_for_testing()
    yield
    reset_global_probe_registry_for_testing()


# ---------------------------------------------------------------------------
# Registration
# ---------------------------------------------------------------------------


@pytest.mark.smoke
def test_registry_starts_empty():
    r = ProbeRegistry()
    assert r.probe_count() == 0
    assert not r.is_mounted()


@pytest.mark.smoke
def test_register_creates_probe():
    r = ProbeRegistry()
    probe = r.register("p1", ProbeKind.PARAM_INPUT, label="fx-blur.radius input")
    assert isinstance(probe, Probe)
    assert probe.id == "p1"
    assert probe.kind == ProbeKind.PARAM_INPUT
    assert r.probe_count() == 1


@pytest.mark.smoke
def test_register_is_idempotent():
    r = ProbeRegistry()
    p1 = r.register("p1", ProbeKind.PARAM_INPUT, label="A")
    p2 = r.register("p1", ProbeKind.PARAM_INPUT, label="DIFFERENT-LABEL")
    assert p1 is p2  # same instance returned
    assert r.probe_count() == 1


@pytest.mark.smoke
def test_register_carries_metadata():
    r = ProbeRegistry()
    probe = r.register(
        "p1",
        ProbeKind.PARAM_POSTMOD,
        label="track1.fx-blur.radius output",
        track_id="t1",
        effect_id="e1",
        param_path="fx-blur.radius",
    )
    assert probe.track_id == "t1"
    assert probe.effect_id == "e1"
    assert probe.param_path == "fx-blur.radius"


@pytest.mark.smoke
def test_unregister_removes_probe():
    r = ProbeRegistry()
    r.register("p1", ProbeKind.PARAM_INPUT, label="A")
    assert r.unregister("p1")
    assert r.probe_count() == 0


@pytest.mark.smoke
def test_unregister_missing_returns_false():
    r = ProbeRegistry()
    assert not r.unregister("nope")


# ---------------------------------------------------------------------------
# Mount/unmount + recording
# ---------------------------------------------------------------------------


@pytest.mark.smoke
def test_record_noop_when_unmounted():
    r = ProbeRegistry()
    r.register("p1", ProbeKind.PARAM_INPUT, label="A")
    assert not r.record("p1", 0.5)
    probe = r.snapshot().probes["p1"]
    assert probe.latest() is None


@pytest.mark.smoke
def test_mount_then_record_succeeds():
    r = ProbeRegistry()
    r.register("p1", ProbeKind.PARAM_INPUT, label="A")
    r.mount()
    assert r.record("p1", 0.5)
    probe = r.snapshot().probes["p1"]
    latest = probe.latest()
    assert latest is not None
    assert latest.value == 0.5


@pytest.mark.smoke
def test_record_missing_probe_returns_false():
    r = ProbeRegistry()
    r.mount()
    assert not r.record("does-not-exist", 0.5)


@pytest.mark.smoke
def test_unmount_stops_recording():
    r = ProbeRegistry()
    r.register("p1", ProbeKind.PARAM_INPUT, label="A")
    r.mount()
    r.record("p1", 0.5)
    r.unmount()
    r.record("p1", 0.9)  # should be no-op
    probe = r.snapshot().probes["p1"]
    assert probe.latest().value == 0.5  # not 0.9


@pytest.mark.smoke
def test_history_bounded():
    """Probe history is bounded — old readings drop off."""
    r = ProbeRegistry()
    r.register("p1", ProbeKind.PARAM_INPUT, label="A")
    r.mount()
    for i in range(100):
        r.record("p1", float(i))
    probe = r.snapshot().probes["p1"]
    # Bounded; last value is 99
    assert len(probe.history) <= 32
    assert probe.latest().value == 99.0


@pytest.mark.smoke
def test_clear_history_empties_all_probes():
    r = ProbeRegistry()
    r.register("p1", ProbeKind.PARAM_INPUT, label="A")
    r.register("p2", ProbeKind.PARAM_POSTMOD, label="B")
    r.mount()
    r.record("p1", 1.0)
    r.record("p2", 2.0)
    r.clear_history()
    snap = r.snapshot()
    for probe in snap.probes.values():
        assert probe.latest() is None


# ---------------------------------------------------------------------------
# Snapshot
# ---------------------------------------------------------------------------


@pytest.mark.smoke
def test_snapshot_shape():
    r = ProbeRegistry()
    r.register("p1", ProbeKind.PARAM_INPUT, label="A")
    snap = r.snapshot()
    assert isinstance(snap, ProbeSnapshot)
    assert "p1" in snap.probes
    assert snap.captured_at_s > 0
    assert snap.mounted is False


@pytest.mark.smoke
def test_snapshot_reflects_mount_state():
    r = ProbeRegistry()
    r.mount()
    snap = r.snapshot()
    assert snap.mounted is True


# ---------------------------------------------------------------------------
# Probe kinds
# ---------------------------------------------------------------------------


@pytest.mark.smoke
def test_all_probe_kinds():
    """All 4 kinds are usable."""
    r = ProbeRegistry()
    r.register("input", ProbeKind.PARAM_INPUT, label="i")
    r.register("postmod", ProbeKind.PARAM_POSTMOD, label="p")
    r.register("lane", ProbeKind.LANE_OUTPUT, label="l")
    r.register("modamt", ProbeKind.MOD_AMOUNT, label="m")
    assert r.probe_count() == 4


@pytest.mark.smoke
def test_probe_kind_enum_string_values():
    """Enum values are JSON-friendly."""
    assert ProbeKind.PARAM_INPUT.value == "param_input"
    assert ProbeKind.PARAM_POSTMOD.value == "param_postmod"
    assert ProbeKind.LANE_OUTPUT.value == "lane_output"
    assert ProbeKind.MOD_AMOUNT.value == "mod_amount"


# ---------------------------------------------------------------------------
# Global singleton
# ---------------------------------------------------------------------------


@pytest.mark.smoke
def test_global_registry_singleton():
    r1 = global_probe_registry()
    r2 = global_probe_registry()
    assert r1 is r2


@pytest.mark.smoke
def test_global_registry_persists_state():
    r = global_probe_registry()
    r.register("p1", ProbeKind.PARAM_INPUT, label="A")
    assert global_probe_registry().probe_count() == 1
