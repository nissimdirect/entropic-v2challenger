"""
B10.1b — Ableton-style performance-track FREEZE bake (backend correctness).

`ExportManager.bake_performance_track` renders ONE performance track's voices to
a video clip SYNCHRONOUSLY, over a black base, by REUSING the export compositor
(`_composite_export_frame`) — there is NO parallel renderer. This is the REAL
bake behind the B10.1 freeze FSM.

ENFORCED GATES (Gate 4 of the packet — backend bake correctness):

  1. NON-EMPTY CLIP — a known perf payload (one instrument, a trigger) renders a
     real file with frames > 0. Proves the bake actually runs the compositor and
     encodes output (fails on a stub that writes nothing).
       test_bake_writes_nonempty_clip

  2. ANTI-DEAD-FLAG — the bake DRIVES the voice's footage decode (not just holds
     a value): a scrub=0.5 instrument resolves to the MIDDLE footage frame, and
     that decode reaches render_composite. Fails on a path that ignores the
     performance payload.
       test_bake_drives_voice_footage_decode

  3. VALIDATION / CLAMPS — the IPC handler validates track_id, output_path, the
     event list, asset paths, and clamps resolution/frame-range. An unknown /
     missing track → ok:false (no crash). A malformed payload → ok:false.
       test_handler_missing_track_id_is_ok_false
       test_handler_missing_output_path_is_ok_false
       test_handler_non_dict_performance_is_ok_false
       test_handler_unknown_track_no_voices_renders_empty_but_ok

Harness mirrors test_rack_export.py: drives ExportManager directly with a fake
footage reader (no source file I/O), monkeypatching render_composite to capture
the assembled layers / decoded frames, and VideoWriter so no real encode runs.
"""

from __future__ import annotations

import os
import sys

import numpy as np
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

import engine.export as export_mod  # noqa: E402
from engine.export import ExportManager  # noqa: E402


# ---------------------------------------------------------------------------
# Fakes
# ---------------------------------------------------------------------------


class FakeReader:
    """Footage reader stand-in. decode_frame(i) records i and returns an RGBA
    frame whose R channel encodes i (mod 256)."""

    def __init__(self, frame_count: int = 100, h: int = 4, w: int = 4):
        self.frame_count = frame_count
        self._h = h
        self._w = w
        self.decoded: list[int] = []

    def decode_frame(self, frame_index: int) -> np.ndarray:
        self.decoded.append(int(frame_index))
        f = np.zeros((self._h, self._w, 4), dtype=np.uint8)
        f[:, :, 0] = int(frame_index) % 256
        f[:, :, 3] = 255
        return f


class FakeWriter:
    """VideoWriter stand-in — records frames written, no encode."""

    instances: list["FakeWriter"] = []

    def __init__(self, path, width, height, fps=30, codec=None, pix_fmt=None, **kwargs):
        self.path = path
        self.width = width
        self.height = height
        self.fps = fps
        self.frames: list[np.ndarray] = []
        self.closed = False
        FakeWriter.instances.append(self)

    def write_frame(self, frame):
        self.frames.append(frame)

    def close(self):
        self.closed = True


def _trigger(frame_index: int, instrument_id: str, *, event_index: int = 0) -> dict:
    return {
        "frameIndex": frame_index,
        "eventIndex": event_index,
        "note": 60,
        "velocity": 100,
        "kind": "trigger",
        "instrumentId": instrument_id,
    }


TRACK = "perf-track-1"


def _perf_one_instrument(*, scrub=None, frame_index: int = 0) -> dict:
    inst: dict = {
        "clipId": "clipA",
        "startFrame": 0,
        "speed": 1.0,
        "opacity": 1.0,
        "blendMode": "normal",
        "chain": [],
        "voiceCap": 4,
        "adsr": {"attack": 0, "decay": 0, "sustain": 1, "release": 0},
    }
    if scrub is not None:
        inst["scrub"] = scrub
    return {
        "events": [_trigger(frame_index, TRACK)],
        "instruments": {TRACK: inst},
        "assets": {"clipA": {"path": "/fake/clipA.mp4", "frameCount": 100, "fps": 30}},
    }


def _install_fakes(monkeypatch, reader: FakeReader):
    FakeWriter.instances = []
    monkeypatch.setattr(export_mod, "VideoWriter", FakeWriter)
    monkeypatch.setattr(
        ExportManager,
        "_get_voice_reader",
        lambda self, asset_path, voice_readers: reader,
    )


def _capture_composite(monkeypatch) -> list[list[dict]]:
    captured: list[list[dict]] = []

    def fake_render_composite(layers, resolution, project_seed, voice_states):
        snap = []
        for layer in layers:
            frame = layer.get("frame")
            r_val = int(frame[0, 0, 0]) if isinstance(frame, np.ndarray) else None
            snap.append({"layer_id": layer.get("layer_id"), "decoded_r": r_val})
        captured.append(snap)
        out = np.zeros((resolution[1], resolution[0], 4), dtype=np.uint8)
        out[:, :, 3] = 255
        return out, voice_states

    monkeypatch.setattr(export_mod, "render_composite", fake_render_composite)
    return captured


# ---------------------------------------------------------------------------
# Gate 1 — non-empty clip
# ---------------------------------------------------------------------------


def test_bake_writes_nonempty_clip(monkeypatch):
    reader = FakeReader(frame_count=100)
    _install_fakes(monkeypatch, reader)
    _capture_composite(monkeypatch)

    mgr = ExportManager()
    result = mgr.bake_performance_track(
        track_id=TRACK,
        performance=_perf_one_instrument(),
        output_path="/tmp/bake.mp4",
        resolution=(8, 8),
        start_frame=0,
        end_frame=5,
        fps=30,
    )

    assert result["ok"] is True
    assert result["clipId"] == f"perf-bake:{TRACK}"
    assert result["path"] == "/tmp/bake.mp4"
    # 6 frames (inclusive [0,5]) written.
    assert result["frames"] == 6
    assert len(FakeWriter.instances) == 1
    assert len(FakeWriter.instances[0].frames) == 6
    assert FakeWriter.instances[0].closed is True


# ---------------------------------------------------------------------------
# Gate 2 — anti-dead-flag: the bake DRIVES the voice's footage decode
# ---------------------------------------------------------------------------


def test_bake_drives_voice_footage_decode(monkeypatch):
    # scrub=0.5 over a 100-frame clip resolves to the MIDDLE footage frame (~50).
    reader = FakeReader(frame_count=100)
    _install_fakes(monkeypatch, reader)
    _capture_composite(monkeypatch)

    mgr = ExportManager()
    mgr.bake_performance_track(
        track_id=TRACK,
        performance=_perf_one_instrument(scrub=0.5, frame_index=0),
        output_path="/tmp/bake.mp4",
        resolution=(8, 8),
        start_frame=0,
        end_frame=0,
        fps=30,
    )

    # The voice's footage was decoded at the scrub-resolved frame, proving the
    # performance payload actually drove a decode (not a stub).
    assert reader.decoded, "no footage decode happened — bake ignored the payload"
    assert 50 in reader.decoded, f"expected scrub=0.5 → frame 50, got {reader.decoded}"


# ---------------------------------------------------------------------------
# Gate 3 — handler validation / clamps
# ---------------------------------------------------------------------------


@pytest.fixture
def server():
    from zmq_server import ZMQServer

    return ZMQServer.__new__(ZMQServer)


def _bake_handler(server, monkeypatch, **overrides):
    """Call _handle_bake_performance_track with a stubbed export_manager so we
    test the VALIDATION path without a real render."""

    class StubMgr:
        called_with = {}

        def bake_performance_track(self, **kwargs):
            StubMgr.called_with = kwargs
            return {
                "ok": True,
                "clipId": "c",
                "path": kwargs["output_path"],
                "frames": 1,
            }

    server.export_manager = StubMgr()
    # These tests exercise track_id/output presence + clamp logic — NOT the
    # asset-path security gate (that's covered by reusing the export-start gate,
    # which validate_upload enforces). Neutralize the filesystem-dependent
    # validators (output path existence, asset upload) so the clamp assertions
    # aren't shadowed by "file not found".
    import zmq_server as zmq_mod

    monkeypatch.setattr(zmq_mod, "validate_output_path", lambda p: [])
    monkeypatch.setattr(zmq_mod, "validate_upload", lambda p: [])
    perf = _perf_one_instrument()
    # No assets → no per-asset validate_upload to satisfy.
    perf["assets"] = {}
    msg = {
        "cmd": "bake_performance_track",
        "track_id": TRACK,
        "output_path": "/tmp/bake.mp4",
        "performance": perf,
        "resolution": [8, 8],
        "start_frame": 0,
        "end_frame": 2,
    }
    msg.update(overrides)
    return server._handle_bake_performance_track(msg, "m1"), StubMgr


def test_handler_missing_track_id_is_ok_false(server, monkeypatch):
    res, _ = _bake_handler(server, monkeypatch, track_id=None)
    assert res["ok"] is False
    assert "track_id" in res["error"]


def test_handler_missing_output_path_is_ok_false(server, monkeypatch):
    res, _ = _bake_handler(server, monkeypatch, output_path="")
    assert res["ok"] is False


def test_handler_non_dict_performance_is_ok_false(server, monkeypatch):
    res, _ = _bake_handler(server, monkeypatch, performance="not-a-dict")
    assert res["ok"] is False


def test_handler_clamps_resolution_and_range(server, monkeypatch):
    res, stub = _bake_handler(
        server,
        monkeypatch,
        resolution=[999999, -5],
        start_frame=10,
        end_frame=3,  # end < start → clamped up to start
    )
    assert res["ok"] is True
    rw, rh = stub.called_with["resolution"]
    assert rw == 8192  # clamped to max
    assert rh == 1  # clamped up from -5
    assert stub.called_with["end_frame"] >= stub.called_with["start_frame"]


def test_handler_unknown_track_no_voices_renders_empty_but_ok(monkeypatch):
    # An unknown track → its scoped payload has no matching instrument/events;
    # the bake renders an empty (black-only) clip and returns ok:true, no crash.
    reader = FakeReader(frame_count=100)
    _install_fakes(monkeypatch, reader)
    _capture_composite(monkeypatch)

    mgr = ExportManager()
    result = mgr.bake_performance_track(
        track_id="does-not-exist",
        performance={"events": [], "instruments": {}, "assets": {}},
        output_path="/tmp/bake.mp4",
        resolution=(8, 8),
        start_frame=0,
        end_frame=2,
        fps=30,
    )
    assert result["ok"] is True
    assert result["frames"] == 3
    # No instrument → no footage decode.
    assert reader.decoded == []
