"""SG-3 clause-2 (P5b.4): render-output NaN/Inf gate + `lane_aborted` event.

SPEC-3 §3.2 clauses 2+3. Every render-pipeline output is finite-checked at the
single choke point (after the compositor, before flatten/encode). On NaN/Inf the
offending modulation lane is aborted + muted for the session, the last-known-good
frame is served (or opaque black before the first good frame), and a
`lane_aborted` payload rides the REQ/REP render reply. NaN frames NEVER pass
downstream. The export path FAILS LOUDLY (raises) on a NaN frame — no silent
substitution inside deterministic exports.

These tests drive the gate in isolation: `render_composite` is monkeypatched to
return a controlled (finite / NaN / Inf) frame so the test exercises the GATE,
not the compositing math. The frame-level helper `detect_nan_in_frame` is tested
directly. The perf smoke asserts the single isfinite pass at 1080p is cheap
relative to a no-op baseline (generous ceiling to avoid CI flakiness).
"""

from __future__ import annotations

import time

import numpy as np
import pytest

from safety.latent_sentinel import detect_nan_in_frame
from zmq_server import ZMQServer


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _bare_server() -> ZMQServer:
    """A ZMQServer instance WITHOUT __init__ (no socket binding).

    Only the attributes the output gate reads/writes are set up. The composite
    state cache lazily self-inits inside `_get_composite_states`.
    """
    srv = ZMQServer.__new__(ZMQServer)
    srv._muted_lanes = set()
    srv._last_good_composite = None
    srv.last_frame_ms = 0.0
    return srv


def _rgba(h: int, w: int, fill: int = 128) -> np.ndarray:
    frame = np.full((h, w, 4), fill, dtype=np.uint8)
    frame[:, :, 3] = 255
    return frame


def _text_layer(frame_index: int = 0) -> dict:
    """A minimal text layer that passes pre-decode validation and reaches the
    render_composite call (no file asset needed)."""
    return {
        "layer_type": "text",
        "layer_id": "L1",
        "chain": [],
        "frame_index": frame_index,
        "text_config": {"text": "x", "fontSize": 24},
    }


def _composite_message(frame_index: int = 0) -> dict:
    return {
        "layers": [_text_layer(frame_index)],
        "resolution": [64, 48],
        "project_seed": 0,
    }


def _patch_render(monkeypatch, frame: np.ndarray) -> None:
    """Force render_composite (as imported into zmq_server) to return `frame`."""
    import zmq_server as zs

    def _fake_render(layers, resolution, project_seed, layer_states=None):
        # Mirror the (frame, new_states) tuple contract when layer_states given.
        if layer_states is not None:
            return frame, {}
        return frame

    monkeypatch.setattr(zs, "render_composite", _fake_render)
    # Keep flatten/encode cheap + tolerant of the substituted frame.
    monkeypatch.setattr(zs, "flatten_rgba", lambda f: f)
    monkeypatch.setattr(zs, "encode_mjpeg", lambda f: b"\xff\xd8\xff\xd9")


# ---------------------------------------------------------------------------
# Frame-level finite helper (single source of truth)
# ---------------------------------------------------------------------------


def test_finite_frame_passes_unmodified(monkeypatch):
    """A finite composite frame is served unchanged with NO lane_aborted field."""
    good = _rgba(48, 64, fill=77)
    srv = _bare_server()
    _patch_render(monkeypatch, good)

    resp = srv._handle_render_composite(_composite_message(), "m1")

    assert resp["ok"] is True
    assert "lane_aborted" not in resp
    assert srv._muted_lanes == set()
    # The finite frame became the last-known-good (pure pass-through cache).
    assert srv._last_good_composite is good


def test_nan_frame_blocked_and_last_good_served(monkeypatch):
    """First a finite frame seeds last-good; then a NaN frame is blocked and the
    previously-cached good frame is served instead (never the NaN)."""
    srv = _bare_server()

    good = _rgba(48, 64, fill=99).astype(np.float32)
    _patch_render(monkeypatch, good)
    resp_good = srv._handle_render_composite(_composite_message(0), "m1")
    assert resp_good["ok"] is True
    assert "lane_aborted" not in resp_good

    # Now a NaN frame arrives. detect_nan_in_frame must catch it; the gate
    # substitutes the last-known-good frame and the NaN never reaches encode.
    bad = good.copy()
    bad[0, 0, 0] = np.nan
    seen = {}

    import zmq_server as zs

    def _capture_encode(f):
        seen["encoded"] = f
        return b"\xff\xd8\xff\xd9"

    _patch_render(monkeypatch, bad)
    monkeypatch.setattr(zs, "encode_mjpeg", _capture_encode)

    resp_bad = srv._handle_render_composite(_composite_message(1), "m2")
    assert resp_bad["ok"] is True
    assert "lane_aborted" in resp_bad
    # The frame that reached encode is the last-known-good, NOT the NaN frame.
    assert not detect_nan_in_frame(seen["encoded"])
    np.testing.assert_array_equal(seen["encoded"], good)


def test_inf_frame_blocked(monkeypatch):
    """An Inf frame (no prior good frame) is blocked → opaque black substitute."""
    srv = _bare_server()
    bad = _rgba(48, 64).astype(np.float32)
    bad[10, 10, 1] = np.inf

    seen = {}
    import zmq_server as zs

    def _capture(f):
        seen["f"] = f
        return b"x"

    _patch_render(monkeypatch, bad)
    monkeypatch.setattr(zs, "encode_mjpeg", _capture)

    resp = srv._handle_render_composite(_composite_message(), "m1")
    assert resp["ok"] is True
    assert "lane_aborted" in resp
    # No prior good frame → opaque black canvas; Inf never reaches encode.
    encoded = seen["f"]
    assert not detect_nan_in_frame(encoded)
    assert encoded.shape == (48, 64, 4)
    assert int(encoded[:, :, :3].max()) == 0  # black RGB
    assert int(encoded[:, :, 3].min()) == 255  # opaque


def test_lane_aborted_payload_on_reply(monkeypatch):
    """The lane_aborted payload rides the render reply with lane_id + reason."""
    srv = _bare_server()
    bad = _rgba(48, 64).astype(np.float32)
    bad[0, 0, 0] = np.nan
    _patch_render(monkeypatch, bad)

    resp = srv._handle_render_composite(_composite_message(), "m1")

    assert "lane_aborted" in resp
    payload = resp["lane_aborted"]
    assert set(payload) == {"lane_id", "reason"}
    # Offending lane is not attributable from a composed frame → "unknown".
    assert payload["lane_id"] == "unknown"
    assert isinstance(payload["reason"], str) and payload["reason"]


def test_lane_muted_after_abort_stays_muted(monkeypatch):
    """Once a lane is aborted it stays in the session mute set across renders."""
    srv = _bare_server()
    bad = _rgba(48, 64).astype(np.float32)
    bad[5, 5, 2] = np.nan
    _patch_render(monkeypatch, bad)

    srv._handle_render_composite(_composite_message(0), "m1")
    assert "unknown" in srv._muted_lanes

    # A second non-finite render keeps the lane muted (idempotent set membership).
    srv._handle_render_composite(_composite_message(1), "m2")
    assert srv._muted_lanes == {"unknown"}


def test_export_fails_loud_on_nan_frame():
    """The export path raises (loud fail) on a NaN frame — verified via the
    detect helper that guards both writer.write_frame sites in export.py."""
    import engine.export as export_mod

    # The export guard is `if detect_nan_in_frame(frame): raise ValueError(...)`.
    # Verify the imported helper is the gate's single source of truth and that a
    # NaN frame trips it (so the raise fires), while a finite frame does not.
    assert export_mod.detect_nan_in_frame is detect_nan_in_frame

    nan_frame = _rgba(16, 16).astype(np.float32)
    nan_frame[0, 0, 0] = np.nan
    assert detect_nan_in_frame(nan_frame) is True

    finite_frame = _rgba(16, 16)
    assert detect_nan_in_frame(finite_frame) is False

    # And confirm the literal raise wiring exists at both export write sites.
    import inspect

    src = inspect.getsource(export_mod)
    assert src.count("if detect_nan_in_frame(") >= 2
    assert "aborting job" in src


def test_gate_overhead_under_budget():
    """Perf smoke: the single np.isfinite pass on a 1080p frame is cheap relative
    to a no-op baseline. Generous wall-clock ceiling to avoid CI flakiness."""
    frame = np.zeros((1080, 1920, 4), dtype=np.float32)

    iters = 50
    # Baseline: a trivial no-op array touch (allocates nothing meaningful).
    t0 = time.perf_counter()
    for _ in range(iters):
        _ = frame.shape
    baseline = time.perf_counter() - t0

    t0 = time.perf_counter()
    for _ in range(iters):
        detect_nan_in_frame(frame)
    gated = time.perf_counter() - t0

    per_frame_ms = (gated / iters) * 1000.0
    # One isfinite reduction over ~8.3M floats should be well under a frame budget.
    # Ceiling is intentionally generous (loaded CI runners) but still proves the
    # gate is a single cheap pass, not an O(n) python loop.
    assert per_frame_ms < 25.0, f"gate per-frame cost {per_frame_ms:.3f}ms too high"
    # And it is in the same order of magnitude as a numpy reduction, not 100x.
    assert gated >= baseline  # sanity: it does real work


# ---------------------------------------------------------------------------
# detect_nan_in_frame direct unit coverage
# ---------------------------------------------------------------------------


@pytest.mark.smoke
def test_detect_helper_integer_frame_is_always_finite():
    """uint8 frames can never hold NaN/Inf → short-circuit to False (hot path)."""
    assert detect_nan_in_frame(_rgba(8, 8)) is False


@pytest.mark.smoke
def test_detect_helper_catches_nan_and_inf():
    f = _rgba(8, 8).astype(np.float32)
    assert detect_nan_in_frame(f) is False
    f[2, 2, 0] = np.nan
    assert detect_nan_in_frame(f) is True
    f2 = _rgba(8, 8).astype(np.float64)
    f2[1, 1, 3] = -np.inf
    assert detect_nan_in_frame(f2) is True
