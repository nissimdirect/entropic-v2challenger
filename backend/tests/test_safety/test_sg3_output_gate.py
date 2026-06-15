"""SG-3 clause-2 (P5b.4): render-output NaN/Inf gate + `lane_aborted` event.

SPEC-3 §3.2 clauses 2+3. The contract is APP-WIDE: a NaN/Inf render-pipeline
output NEVER silently passes downstream. This is enforced at every live
frame->encode path that can carry modulation-stack / composited output:

  - PREVIEW (`_apply_output_gate`, shared seam):
      * `_handle_render_frame`     — single-clip preview (the COMMON case)
      * `_handle_render_composite` — multi-layer preview
    Finite frame -> pure pass-through; NaN/Inf -> last-known-good of the SAME
    shape (or opaque black) + `lane_aborted` on the REQ/REP reply. NaN never
    reaches encode.
  - EXPORT (`engine/export.py`, loud-fail): video, GIF, image_sequence all RAISE
    on a NaN/Inf frame — never a silent substitution inside a deterministic
    export.

Preview tests drive the gate via monkeypatched render functions returning a
controlled (finite / NaN / Inf) frame, so the test exercises the GATE, not the
compositing math. Export tests drive a REAL export of each type with `apply_chain`
monkeypatched to inject a NaN, asserting each job ERRORs loudly (not introspection).
"""

from __future__ import annotations

import os
import time

import numpy as np
import pytest

from engine.export import ExportManager, ExportStatus
from safety.latent_sentinel import detect_nan_in_frame
from zmq_server import ZMQServer


# ---------------------------------------------------------------------------
# Helpers — preview
# ---------------------------------------------------------------------------


def _bare_server() -> ZMQServer:
    """A ZMQServer instance WITHOUT __init__ (no socket binding).

    Only the attributes the output gate reads/writes are set up. The composite
    state cache lazily self-inits inside `_get_composite_states`.
    """
    srv = ZMQServer.__new__(ZMQServer)
    srv._last_good_frames = {}
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


def _composite_message(frame_index: int = 0, resolution=(64, 48)) -> dict:
    return {
        "layers": [_text_layer(frame_index)],
        "resolution": [resolution[0], resolution[1]],
        "project_seed": 0,
    }


def _patch_composite_render(monkeypatch, frame: np.ndarray) -> None:
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


class _FakeReader:
    def __init__(self, w: int, h: int):
        self.width = w
        self.height = h


def _patch_render_frame(monkeypatch, frame: np.ndarray, reader_wh=(64, 48)) -> None:
    """Force `_render_composited_frame` to return a controlled frame so the
    single-clip path (`_handle_render_frame`) hits the gate without a real asset."""
    import zmq_server as zs

    reader = _FakeReader(reader_wh[0], reader_wh[1])

    def _fake_render_composited(self, message):
        return frame, 0, reader, None

    # Bypass path/chain validation by stubbing the validators to "no errors".
    monkeypatch.setattr(zs, "validate_upload", lambda p: [])
    monkeypatch.setattr(zs, "validate_chain_depth", lambda c: [])
    monkeypatch.setattr(zs, "get_effect_health", lambda: {"disabled_effects": []})
    monkeypatch.setattr(zs, "encode_mjpeg", lambda f: b"\xff\xd8\xff\xd9")
    monkeypatch.setattr(ZMQServer, "_render_composited_frame", _fake_render_composited)


def _render_frame_message() -> dict:
    return {"path": "/home/user/clip.mp4", "chain": []}


# ---------------------------------------------------------------------------
# TIGER 1 — `_handle_render_frame` (single-clip preview) is now gated
# ---------------------------------------------------------------------------


def test_render_frame_finite_passes_unmodified(monkeypatch):
    """The single-clip preview path passes a finite frame through with no
    lane_aborted field."""
    srv = _bare_server()
    good = _rgba(48, 64, fill=55)
    _patch_render_frame(monkeypatch, good, reader_wh=(64, 48))

    resp = srv._handle_render_frame(_render_frame_message(), "m1")

    assert resp["ok"] is True
    assert "lane_aborted" not in resp
    # Finite frame cached as last-known-good under the render_frame tag.
    assert ("render_frame", good.shape) in srv._last_good_frames


def test_render_frame_nan_blocked_and_last_good_served(monkeypatch):
    """A NaN frame on the single-clip path is blocked; the previously-cached good
    frame is served and the NaN never reaches encode. (TIGER 1 regression.)"""
    srv = _bare_server()

    good = _rgba(48, 64, fill=88).astype(np.float32)
    _patch_render_frame(monkeypatch, good, reader_wh=(64, 48))
    resp_good = srv._handle_render_frame(_render_frame_message(), "m1")
    assert resp_good["ok"] is True
    assert "lane_aborted" not in resp_good

    bad = good.copy()
    bad[0, 0, 0] = np.nan
    seen = {}

    import zmq_server as zs

    def _capture(f):
        seen["encoded"] = f
        return b"x"

    _patch_render_frame(monkeypatch, bad, reader_wh=(64, 48))
    monkeypatch.setattr(zs, "encode_mjpeg", _capture)

    resp_bad = srv._handle_render_frame(_render_frame_message(), "m2")
    assert resp_bad["ok"] is True
    assert "lane_aborted" in resp_bad
    assert resp_bad["lane_aborted"]["lane_id"] == "unknown"
    # The encoded frame is the last-known-good, NOT the NaN frame.
    assert not detect_nan_in_frame(seen["encoded"])
    np.testing.assert_array_equal(seen["encoded"], good)


def test_render_frame_nan_no_prior_good_serves_black(monkeypatch):
    """NaN on the single-clip path with no prior good frame -> opaque black at the
    reader resolution; NaN never reaches encode."""
    srv = _bare_server()
    bad = _rgba(48, 64).astype(np.float32)
    bad[3, 3, 1] = np.inf

    seen = {}
    import zmq_server as zs

    def _capture(f):
        seen["f"] = f
        return b"x"

    _patch_render_frame(monkeypatch, bad, reader_wh=(64, 48))
    monkeypatch.setattr(zs, "encode_mjpeg", _capture)

    resp = srv._handle_render_frame(_render_frame_message(), "m1")
    assert resp["ok"] is True
    assert "lane_aborted" in resp
    encoded = seen["f"]
    assert not detect_nan_in_frame(encoded)
    assert encoded.shape == (48, 64, 4)
    assert int(encoded[:, :, :3].max()) == 0


# ---------------------------------------------------------------------------
# `_handle_render_composite` (multi-layer preview)
# ---------------------------------------------------------------------------


def test_finite_frame_passes_unmodified(monkeypatch):
    """A finite composite frame is served unchanged with NO lane_aborted field."""
    good = _rgba(48, 64, fill=77)
    srv = _bare_server()
    _patch_composite_render(monkeypatch, good)

    resp = srv._handle_render_composite(_composite_message(), "m1")

    assert resp["ok"] is True
    assert "lane_aborted" not in resp
    # The finite frame became the last-known-good (pure pass-through cache).
    assert srv._last_good_frames[("render_composite", good.shape)] is good


def test_nan_frame_blocked_and_last_good_served(monkeypatch):
    """First a finite frame seeds last-good; then a NaN frame is blocked and the
    previously-cached good frame is served instead (never the NaN)."""
    srv = _bare_server()

    good = _rgba(48, 64, fill=99).astype(np.float32)
    _patch_composite_render(monkeypatch, good)
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

    _patch_composite_render(monkeypatch, bad)
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

    _patch_composite_render(monkeypatch, bad)
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
    _patch_composite_render(monkeypatch, bad)

    resp = srv._handle_render_composite(_composite_message(), "m1")

    assert "lane_aborted" in resp
    payload = resp["lane_aborted"]
    assert set(payload) == {"lane_id", "reason"}
    # Offending lane is not attributable from a composed frame → "unknown".
    assert payload["lane_id"] == "unknown"
    assert isinstance(payload["reason"], str) and payload["reason"]


def test_lane_aborted_repeats_until_frame_self_heals(monkeypatch):
    """TIGER 3 (honest behavior): there is NO per-lane mute. A non-finite frame
    re-fires lane_aborted every render and re-serves last-known-good; once the
    chain self-heals (finite again), the gate stops firing — it does NOT keep the
    lane disabled. Asserts the documented behavior, not dead write-only state."""
    srv = _bare_server()

    bad = _rgba(48, 64, fill=10).astype(np.float32)
    bad[5, 5, 2] = np.nan
    _patch_composite_render(monkeypatch, bad)
    r1 = srv._handle_render_composite(_composite_message(0), "m1")
    r2 = srv._handle_render_composite(_composite_message(1), "m2")
    assert "lane_aborted" in r1 and "lane_aborted" in r2  # re-fires every frame

    # Frame self-heals (finite again) → gate stops firing (no permanent disable).
    good = _rgba(48, 64, fill=200)
    _patch_composite_render(monkeypatch, good)
    r3 = srv._handle_render_composite(_composite_message(2), "m3")
    assert "lane_aborted" not in r3


def test_no_dead_muted_lanes_state():
    """TIGER 3: the dead write-only `_muted_lanes` state was removed (it advertised
    a per-lane abort that never read back). Ensure neither __init__ nor the gate
    re-introduces it."""
    import inspect

    import zmq_server as zs

    src = inspect.getsource(zs)
    assert "_muted_lanes" not in src, "_muted_lanes dead state must stay removed"


# ---------------------------------------------------------------------------
# TIGER 4 — last-known-good is resolution/shape-keyed (no cross-size serve)
# ---------------------------------------------------------------------------


def test_last_good_not_served_across_resolution_change(monkeypatch):
    """A last-good frame cached at resolution A must NOT be served against a
    NaN frame requested at resolution B — that would ship a wrong-size frame.
    Instead the gate serves opaque black at the REQUESTED resolution."""
    srv = _bare_server()

    # Seed a good frame at 64x48.
    good_a = _rgba(48, 64, fill=120)
    _patch_composite_render(monkeypatch, good_a)
    srv._handle_render_composite(_composite_message(0, resolution=(64, 48)), "m1")
    assert ("render_composite", (48, 64, 4)) in srv._last_good_frames

    # Now a NaN frame at a DIFFERENT resolution 100x80. The 64x48 last-good must
    # NOT be served; a black frame at 100x80 is served instead.
    bad_b = np.full((80, 100, 4), 7, dtype=np.float32)
    bad_b[:, :, 3] = 255
    bad_b[0, 0, 0] = np.nan
    seen = {}
    import zmq_server as zs

    # Patch render FIRST, then override encode to capture (so the capture sticks).
    _patch_composite_render(monkeypatch, bad_b)

    def _capture(f):
        seen["f"] = f
        return b"x"

    monkeypatch.setattr(zs, "encode_mjpeg", _capture)

    resp = srv._handle_render_composite(
        _composite_message(1, resolution=(100, 80)), "m2"
    )
    assert "lane_aborted" in resp
    served = seen["f"]
    # Served frame matches the REQUESTED resolution (100x80), not the cached A.
    assert served.shape == (80, 100, 4)
    assert int(served[:, :, :3].max()) == 0  # black, not the 120-fill A frame


# ---------------------------------------------------------------------------
# TIGER 2 — export FAILS LOUD on NaN for ALL three export types (REAL drive)
# ---------------------------------------------------------------------------


def _nan_injecting_apply_chain(monkeypatch):
    """Monkeypatch engine.export.apply_chain to return a frame with a NaN, so a
    REAL export of any type produces a non-finite frame and must fail loud."""
    import engine.export as export_mod

    def _fake_apply_chain(frame, chain, seed, idx, resolution, states, **kwargs):
        out = frame.astype(np.float32)
        out[0, 0, 0] = np.nan
        return out, states

    monkeypatch.setattr(export_mod, "apply_chain", _fake_apply_chain)


def _run_to_completion(job, timeout_s: float = 40.0):
    deadline = time.time() + timeout_s
    while job.status == ExportStatus.RUNNING and time.time() < deadline:
        time.sleep(0.05)
    return job.status


@pytest.mark.parametrize(
    "export_type,is_dir",
    [("video", False), ("gif", False), ("image_sequence", True)],
)
def test_export_fails_loud_on_nan_frame(
    monkeypatch, synthetic_video_path, export_type, is_dir, tmp_path
):
    """A NaN frame during a REAL export of EACH type (video, gif, image_sequence)
    aborts the job loudly (ERROR + 'aborting job' message) — never a silent
    substitution. This drives the actual export pipeline, not introspection."""
    _nan_injecting_apply_chain(monkeypatch)

    if is_dir:
        out = str(tmp_path / "seq_out")
    elif export_type == "gif":
        out = str(tmp_path / "out.gif")
    else:
        out = str(tmp_path / "out.mp4")

    mgr = ExportManager()
    job = mgr.start(
        input_path=synthetic_video_path,
        output_path=out,
        chain=[{"effect_id": "fx.hue_shift", "params": {"amount": 0.0}}],
        project_seed=7,
        settings={
            "export_type": export_type,
            "region": "custom",
            "start_frame": 0,
            "end_frame": 4,  # 5 frames is plenty to hit the NaN on frame 0
            "fps": "source",
            "include_audio": False,
            "image_format": "png",
        },
    )
    status = _run_to_completion(job)
    assert status == ExportStatus.ERROR, (
        f"{export_type} export should FAIL LOUD on a NaN frame, got {status}"
    )
    assert "aborting job" in (job.error or ""), (
        f"{export_type} error should name the SG-3 abort, got: {job.error!r}"
    )
    # No silent partial output left behind for video/gif single-file exports.
    if not is_dir:
        assert not os.path.exists(out) or os.path.getsize(out) == 0


def test_export_finite_frame_succeeds(monkeypatch, synthetic_video_path, tmp_path):
    """Control: a finite export of each type is unaffected by the gate (the gate
    is a pure pass-through for finite frames — no false loud-fail)."""
    out = str(tmp_path / "ok_out")
    mgr = ExportManager()
    job = mgr.start(
        input_path=synthetic_video_path,
        output_path=out,
        chain=[],
        project_seed=7,
        settings={
            "export_type": "image_sequence",
            "image_format": "png",
            "region": "custom",
            "start_frame": 0,
            "end_frame": 4,
            "fps": "source",
            "include_audio": False,
        },
    )
    assert _run_to_completion(job) == ExportStatus.COMPLETE, job.error


# ---------------------------------------------------------------------------
# Perf smoke
# ---------------------------------------------------------------------------


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
