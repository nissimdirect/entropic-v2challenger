"""#423 — un-triggered Sampler must render NOTHING (transparent) in EXPORT too.

Frontend fix: App.tsx's per-track sampler render loop used to fall back to the
legacy single-layer `buildSamplerLayer` whenever `evaluateVoices` returned zero
active voices, unconditionally compositing the bound clip's clean source over
the track below even though no note was firing (issue #423, LOCKED decision:
no active note → no layer).

This file closes the PREVIEW/EXPORT PARITY gate for the export side:
`ExportManager._composite_export_frame`'s per-instrument loop (`for voice in
voices:`) has NO equivalent single-layer fallback — an instrument with zero
active voices for `frame_index` simply contributes zero voice descriptors, so
zero voice layers reach `render_composite`. This was already correct before
the frontend fix (the bug was frontend-only), but had no dedicated regression
test pinning it. This test closes that gap.

Harness mirrors test_rack_export.py's `_capture_composite` / `_run_export_frame`
pattern (patch `render_composite` to capture the assembled `layers` list).
"""

from __future__ import annotations

import numpy as np

import engine.export as export_mod
from engine.export import ExportManager


class FakeReader:
    """Deterministic footage reader stand-in (no file I/O)."""

    def __init__(self, frame_count: int, h: int = 4, w: int = 4):
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


def _trigger(frame_index: int, instrument_id: str, *, event_index: int = 0) -> dict:
    return {
        "frameIndex": frame_index,
        "eventIndex": event_index,
        "note": 60,
        "velocity": 100,
        "kind": "trigger",
        "instrumentId": instrument_id,
    }


def _release(frame_index: int, instrument_id: str, *, event_index: int = 1) -> dict:
    return {
        "frameIndex": frame_index,
        "eventIndex": event_index,
        "note": 60,
        "velocity": 100,
        "kind": "release",
        "instrumentId": instrument_id,
    }


def _instrument() -> dict:
    return {
        "clipId": "clipA",
        "startFrame": 0,
        "speed": 1.0,
        "opacity": 1.0,
        "blendMode": "normal",
        "voiceCap": 4,
        "adsr": {"attack": 0, "decay": 0, "sustain": 1, "release": 0},
        "chain": [],
    }


def _assets(frame_count: int = 100) -> dict:
    return {"clipA": {"path": "/fake/clipA.mp4", "frameCount": frame_count, "fps": 30}}


def _capture_composite(monkeypatch) -> list[list[dict]]:
    captured: list[list[dict]] = []

    def fake_render_composite(
        layers, resolution, project_seed, voice_states, **_kwargs
    ):
        captured.append(
            [
                dict(layer_id=l.get("layer_id"), voice_id=l.get("voice_id"))
                for l in layers
            ]
        )
        w, h = resolution
        return np.zeros((h, w, 4), dtype=np.uint8), {}

    monkeypatch.setattr(export_mod, "render_composite", fake_render_composite)
    return captured


def _run_export_frame(
    performance: dict, *, frame_count: int = 100, frame_index: int = 0
):
    mgr = ExportManager()
    reader = FakeReader(frame_count)
    voice_readers = {"/fake/clipA.mp4": reader}
    base_frame = np.zeros((4, 4, 4), dtype=np.uint8)
    base_frame[:, :, 3] = 255
    out, _ = mgr._composite_export_frame(
        base_frame=base_frame,
        base_chain=[],
        performance=performance,
        frame_index=frame_index,
        resolution=(4, 4),
        project_seed=0,
        voice_states={},
        voice_readers=voice_readers,
    )
    return reader, out


def test_bound_instrument_no_events_emits_zero_voice_layers(monkeypatch):
    """#423 discriminator: a sampler bound to a clip with NO trigger events at
    all must contribute zero voice layers — only the base layer reaches
    render_composite. No note fired → no layer (LOCKED decision)."""
    captured = _capture_composite(monkeypatch)
    perf = {"events": [], "instruments": {"inst1": _instrument()}, "assets": _assets()}
    reader, _ = _run_export_frame(perf)
    voice_layers = [l for l in captured[0] if l["layer_id"] != "base"]
    assert voice_layers == []
    # No active voice → no footage decode at all.
    assert reader.decoded == []


def test_bound_instrument_note_fully_released_emits_zero_voice_layers(monkeypatch):
    """A note that triggered and fully released before the query frame (ADSR
    release=0 → instant idle) must also emit zero voice layers — the FSM
    voice is gone, not just silent."""
    captured = _capture_composite(monkeypatch)
    perf = {
        "events": [_trigger(0, "inst1"), _release(1, "inst1")],
        "instruments": {"inst1": _instrument()},
        "assets": _assets(),
    }
    _run_export_frame(perf, frame_index=50)
    voice_layers = [l for l in captured[0] if l["layer_id"] != "base"]
    assert voice_layers == []


def test_regression_active_note_still_emits_exactly_one_voice_layer(monkeypatch):
    """REGRESSION GUARD: an active note still emits exactly one voice layer,
    unchanged — the #423 fix must not affect the triggered-note path."""
    captured = _capture_composite(monkeypatch)
    perf = {
        "events": [_trigger(0, "inst1")],
        "instruments": {"inst1": _instrument()},
        "assets": _assets(),
    }
    reader, _ = _run_export_frame(perf, frame_index=5)
    voice_layers = [l for l in captured[0] if l["layer_id"] != "base"]
    assert len(voice_layers) == 1
    assert voice_layers[0]["voice_id"] == "voice_inst1_0_0"
    # footagePos is frozen at 0 in this phase (voiceFSM tracks lifecycle only,
    # not footage advance) — the decode happens, it's just always at frame 0.
    assert reader.decoded == [0]
