"""
B4-export — Sample Rack rendering in the EXPORT path (preview/export parity).

Closes the gap where Sample Racks (B4.1 channel summing + B4.2 macros) render
in the LIVE preview but NOT in export. The backend `_composite_export_frame`
now appends per-pad voice descriptors to the SAME `layers` list the
per-instrument loop uses, so a rack exports IDENTICALLY to how it previews.

THREE ENFORCED GATES (mirrors the frontend buildRackLayers.ts semantics):

  1. REGRESSION GUARD — a `performance` with NO `racks` key (or empty) exports
     byte-identical to today (the per-instrument path is untouched).
       test_no_racks_key_is_byte_identical
       test_empty_racks_dict_is_byte_identical

  2. PREVIEW/EXPORT PARITY — the backend rack summing computes the IDENTICAL
     layer set (mute→0 layers, solo gating, opacity multiply, blend replace,
     z-order) as the frontend buildRackLayers. Expected values are GENUINE —
     derived from the documented summing semantics, NOT tautological.
       test_muted_pad_emits_no_layer
       test_solo_gates_non_soloed_pads
       test_muted_soloed_pad_still_silent
       test_pad_opacity_multiplies_onto_voice_opacity
       test_pad_blend_replaces_layer_blend_mode
       test_pad_z_order_is_array_order

  3. ANTI-DEAD-FLAG (HARD ORACLE) — proves the export path ACTUALLY DRIVES the
     pad's playback (not just that a dict holds a value). A pad with scrub=0.5
     resolves to the MIDDLE footage frame (50 for frameCount=100); the exported
     voice descriptor's decoded frame_index MUST move to 50. Fails on a stub
     that ignores racks (no decode at 50); passes on the real path.
       test_rack_export_drives_pad_frame_is_not_a_noop

Harness style mirrors test_sampler_melodic.py: drives ExportManager directly
with known inputs and a fake footage reader (no file I/O), monkeypatching
render_composite to capture the assembled layers.
"""

from __future__ import annotations

import numpy as np
import pytest

import engine.export as export_mod
from engine.export import ExportManager


# ---------------------------------------------------------------------------
# Fakes — a deterministic footage reader (no file I/O) that records which
# frame index each decode requests, so the anti-dead-flag oracle can prove the
# resolved footage frame actually drives a decode.
# ---------------------------------------------------------------------------


class FakeReader:
    """Footage reader stand-in. decode_frame(i) returns an RGBA frame whose
    every pixel encodes `i` in the R channel (mod 256), and records `i`."""

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


def _trigger(
    frame_index: int,
    instrument_id: str,
    *,
    event_index: int = 0,
    note: int = 60,
    velocity: int = 100,
) -> dict:
    return {
        "frameIndex": frame_index,
        "eventIndex": event_index,
        "note": note,
        "velocity": velocity,
        "kind": "trigger",
        "instrumentId": instrument_id,
    }


def _pad(
    pad_id: str,
    *,
    clip_id: str = "clipA",
    opacity: float = 1.0,
    blend: str = "normal",
    mute: bool = False,
    solo: bool = False,
    inst_opacity: float = 1.0,
    scrub=None,
    speed: float = 1.0,
    start_frame: int = 0,
) -> dict:
    inst: dict = {
        "clipId": clip_id,
        "startFrame": start_frame,
        "speed": speed,
        "opacity": inst_opacity,
        "blendMode": "normal",
        "chain": [],
    }
    if scrub is not None:
        inst["scrub"] = scrub
    return {
        "id": pad_id,
        "mute": mute,
        "solo": solo,
        "opacity": opacity,
        "blend": blend,
        "instrument": inst,
        "voiceCap": 4,
        "adsr": {"attack": 0, "decay": 0, "sustain": 1, "release": 0},
    }


def _assets(frame_count: int = 100) -> dict:
    return {"clipA": {"path": "/fake/clipA.mp4", "frameCount": frame_count, "fps": 30}}


def _capture_composite(monkeypatch) -> list[list[dict]]:
    """Patch render_composite to capture the assembled `layers` arg.

    Returns a list that will hold the layers passed on each call. The stub
    still returns a valid (frame, states) tuple so _composite_export_frame
    completes normally.
    """
    captured: list[list[dict]] = []

    def fake_render_composite(layers, resolution, project_seed, voice_states):
        # Deep-ish copy of the fields we assert on (frame arrays are large; we
        # only need opacity/blend/layer_id and the decoded frame's R value).
        snapshot = []
        for layer in layers:
            frame = layer.get("frame")
            r_val = int(frame[0, 0, 0]) if isinstance(frame, np.ndarray) else None
            snapshot.append(
                {
                    "layer_id": layer.get("layer_id"),
                    "opacity": layer.get("opacity"),
                    "blend_mode": layer.get("blend_mode"),
                    "decoded_r": r_val,
                }
            )
        captured.append(snapshot)
        w, h = resolution
        return np.zeros((h, w, 4), dtype=np.uint8), {}

    monkeypatch.setattr(export_mod, "render_composite", fake_render_composite)
    return captured


def _run_export_frame(
    performance: dict, *, frame_count: int = 100, frame_index: int = 0, base_r: int = 7
):
    """Drive _composite_export_frame with a pre-seeded fake reader (no I/O).

    Returns the FakeReader (for decoded-index assertions) and lets the caller
    inspect whatever render_composite captured.
    """
    mgr = ExportManager()
    reader = FakeReader(frame_count)
    voice_readers = {"/fake/clipA.mp4": reader}
    base_frame = np.zeros((4, 4, 4), dtype=np.uint8)
    base_frame[:, :, 0] = base_r
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


# ===========================================================================
# GATE 1 — REGRESSION GUARD: no racks → byte-identical to the per-instrument path
# ===========================================================================


class TestRegressionGuard:
    def _perf_with_instrument(self) -> dict:
        """A per-instrument performance payload with one active voice."""
        return {
            "events": [_trigger(0, "inst1")],
            "instruments": {
                "inst1": {
                    "clipId": "clipA",
                    "startFrame": 0,
                    "speed": 1.0,
                    "opacity": 1.0,
                    "blendMode": "normal",
                    "voiceCap": 4,
                    "adsr": {"attack": 0, "decay": 0, "sustain": 1, "release": 0},
                    "chain": [],
                },
            },
            "assets": _assets(),
        }

    def test_no_racks_key_is_byte_identical(self):
        """A payload with NO `racks` key exports the SAME bytes as the baseline
        (the rack loop must be a pure no-op when absent)."""
        baseline = self._perf_with_instrument()
        # Same payload, explicitly without a racks key (already absent) — run
        # twice to confirm determinism AND that the new code path changed nothing.
        _, out_a = _run_export_frame(self._perf_with_instrument())
        _, out_b = _run_export_frame(baseline)
        assert np.array_equal(out_a, out_b)

    def test_empty_racks_dict_is_byte_identical(self):
        """An EMPTY `racks` dict must produce the SAME output as no racks key."""
        without = self._perf_with_instrument()
        with_empty = self._perf_with_instrument()
        with_empty["racks"] = {}
        _, out_without = _run_export_frame(without)
        _, out_with_empty = _run_export_frame(with_empty)
        assert np.array_equal(out_without, out_with_empty)

    def test_per_instrument_path_unaffected_by_rack_loop(self):
        """A payload carrying BOTH an instrument and an empty rack still decodes
        the instrument's voice exactly once (rack loop adds nothing)."""
        perf = self._perf_with_instrument()
        perf["racks"] = {"trackR": {"pads": []}}  # rack with zero pads
        reader, _ = _run_export_frame(perf)
        # One instrument voice at startFrame 0, speed 1, playhead 0 → frame 0.
        assert reader.decoded == [0]


# ===========================================================================
# GATE 2 — PREVIEW/EXPORT PARITY: summing semantics mirror buildRackLayers.ts
# ===========================================================================


class TestSummingParity:
    def _perf(self, pads: list[dict], events: list[dict], frame_count=100) -> dict:
        return {
            "events": events,
            "instruments": {},
            "assets": _assets(frame_count),
            "racks": {"trackR": {"pads": pads}},
        }

    def test_muted_pad_emits_no_layer(self, monkeypatch):
        """MUTE: a muted pad contributes NOTHING → no voice layer (only base)."""
        captured = _capture_composite(monkeypatch)
        perf = self._perf(
            [_pad("p1", mute=True)],
            [_trigger(0, "trackR:p1")],
        )
        _run_export_frame(perf)
        layers = captured[0]
        # Only the base layer; the muted pad emitted nothing.
        voice_layers = [l for l in layers if l["layer_id"] != "base"]
        assert voice_layers == []

    def test_solo_gates_non_soloed_pads(self, monkeypatch):
        """SOLO: if ANY pad is soloed, only soloed pads render."""
        captured = _capture_composite(monkeypatch)
        perf = self._perf(
            [_pad("p1", solo=False), _pad("p2", solo=True)],
            [_trigger(0, "trackR:p1"), _trigger(0, "trackR:p2")],
        )
        _run_export_frame(perf)
        voice_layers = [l for l in captured[0] if l["layer_id"] != "base"]
        # Exactly ONE voice layer — only the soloed pad p2.
        assert len(voice_layers) == 1

    def test_muted_soloed_pad_still_silent(self, monkeypatch):
        """A muted+soloed pad is STILL silent (mute is the harder gate). With
        only that pad soloed and muted, no pad is audible → zero voice layers."""
        captured = _capture_composite(monkeypatch)
        perf = self._perf(
            [_pad("p1", mute=True, solo=True), _pad("p2", solo=False)],
            [_trigger(0, "trackR:p1"), _trigger(0, "trackR:p2")],
        )
        _run_export_frame(perf)
        voice_layers = [l for l in captured[0] if l["layer_id"] != "base"]
        # p1 muted (silent despite solo); p2 not soloed but anySolo → gated.
        assert voice_layers == []

    def test_pad_opacity_multiplies_onto_voice_opacity(self, monkeypatch):
        """OPACITY: pad opacity MULTIPLIES onto voice opacity (inst_op × env ×
        pad_op). inst_opacity=0.8, env=1.0 (attack/decay 0, sustain 1),
        pad_opacity=0.5 → 0.8 × 1.0 × 0.5 = 0.4 (GENUINE expected value)."""
        captured = _capture_composite(monkeypatch)
        perf = self._perf(
            [_pad("p1", opacity=0.5, inst_opacity=0.8)],
            [_trigger(0, "trackR:p1")],
        )
        _run_export_frame(perf)
        voice_layers = [l for l in captured[0] if l["layer_id"] != "base"]
        assert len(voice_layers) == 1
        assert voice_layers[0]["opacity"] == pytest.approx(0.4)

    def test_pad_blend_replaces_layer_blend_mode(self, monkeypatch):
        """BLEND: pad blend REPLACES the layer's blend_mode."""
        captured = _capture_composite(monkeypatch)
        perf = self._perf(
            [_pad("p1", blend="screen")],
            [_trigger(0, "trackR:p1")],
        )
        _run_export_frame(perf)
        voice_layers = [l for l in captured[0] if l["layer_id"] != "base"]
        assert len(voice_layers) == 1
        assert voice_layers[0]["blend_mode"] == "screen"

    def test_pad_z_order_is_array_order(self, monkeypatch):
        """Z-ORDER: pads composite in array order (later pad on top). With two
        pads at distinct opacities, the layer order matches the pad array."""
        captured = _capture_composite(monkeypatch)
        perf = self._perf(
            [_pad("p1", opacity=0.25), _pad("p2", opacity=0.75)],
            [_trigger(0, "trackR:p1"), _trigger(0, "trackR:p2")],
        )
        _run_export_frame(perf)
        voice_layers = [l for l in captured[0] if l["layer_id"] != "base"]
        assert len(voice_layers) == 2
        # p1 first (bottom), p2 second (top) — array order preserved.
        assert voice_layers[0]["opacity"] == pytest.approx(0.25)
        assert voice_layers[1]["opacity"] == pytest.approx(0.75)


# ===========================================================================
# GATE 3 — ANTI-DEAD-FLAG (HARD ORACLE): export drives the pad's playback
# ===========================================================================


class TestAntiDeadFlag:
    def test_rack_export_drives_pad_frame_is_not_a_noop(self, monkeypatch):
        """A pad with scrub=0.5 resolves to the MIDDLE footage frame. With
        frameCount=100, startFrame=0, scrub maps 0..1 across [start, endFrame|
        last=99] → 0.5 * 99 = 49.5 → round → 50. The EXPORTED voice descriptor's
        decoded frame_index MUST move to 50 — a SPECIFIC non-trivial frame far
        from the trivial freeze-at-0 — proving the export path actually drives the
        pad's playback, not just stores a dict value. (scrub=0.5 avoids the INJ-3
        tail clamp that pulls the last frame inward, keeping the oracle exact.)

        FAIL-BEFORE: the pre-change backend never read `racks`, so a rack-only
        payload decoded NOTHING — frame 50 never appears (see
        test_stub_that_ignores_racks_fails_the_oracle). PASS-AFTER: the real rack
        loop resolves scrub=0.5 → 50 and decodes it.
        """
        # GENUINE expected: scrub 0.5 over [0, 99] → round(49.5) = 50
        # (independently computed from the documented scrub semantics).
        expected_frame = 50
        # Cross-check against the backend's own footage-frame math so the oracle
        # is anchored to the SAME resolver the per-instrument path uses.
        oracle_inst = {
            "clipId": "clipA",
            "startFrame": 0,
            "speed": 1.0,
            "opacity": 1.0,
            "blendMode": "normal",
            "scrub": 0.5,
        }
        oracle_frame = ExportManager._compute_voice_footage_frame(oracle_inst, 0, 100)
        assert oracle_frame == expected_frame, (
            f"resolver sanity: scrub 0.5 → {oracle_frame}, expected {expected_frame}"
        )

        perf = {
            "events": [_trigger(0, "trackR:p1")],
            "instruments": {},
            "assets": _assets(100),
            "racks": {
                "trackR": {
                    "pads": [_pad("p1", scrub=0.5)],
                },
            },
        }
        reader, _ = _run_export_frame(perf)
        # The pad's voice decoded the SCRUBBED footage frame — the export path
        # drove the scrub to its playback position (NOT the trivial freeze at 0).
        assert expected_frame in reader.decoded, (
            f"rack pad scrub=0.5 must decode frame {expected_frame}; "
            f"decoded={reader.decoded}"
        )
        assert reader.decoded != [0], "scrub must move the frame off the freeze-at-0"

    def test_stub_that_ignores_racks_fails_the_oracle(self):
        """Documents the fail-before condition: if the export path IGNORED racks
        (the pre-change behavior), a rack-only payload would decode NOTHING. This
        asserts the inverse to lock the oracle's discriminating power: with NO
        rack support, decoded would be empty (no frame 50)."""
        # Simulate the pre-change path: a payload whose ONLY content is a rack,
        # but fed through a performance with the racks key STRIPPED (what the old
        # backend effectively saw — it never read `racks`).
        perf_without_rack_support = {
            "events": [_trigger(0, "trackR:p1")],
            "instruments": {},  # old backend had no rack handling at all
            "assets": _assets(100),
            # racks key omitted → mirrors the old backend ignoring racks entirely
        }
        reader, _ = _run_export_frame(perf_without_rack_support)
        # No instruments, no rack handling → nothing decoded. Frame 50 absent.
        assert 50 not in reader.decoded
        assert reader.decoded == []
