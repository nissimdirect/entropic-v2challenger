"""
B6.2 — Frame-Bank PREVIEW render (zmq_server) + SG-8 pressure-degrade
(INSTRUMENTS-BUILD-PLAN.md §B6).

B6.1 shipped the Frame-Bank render on the EXPORT path. B6.2 closes two gaps:

  (A) PREVIEW render — a frameBank renders in EXPORT but not the live preview
      (`zmq_server._handle_render_composite`). This slice mirrors the export
      render so the user sees the bank live, with a per-bank byte-budget cache
      persisted ON THE SERVER across preview frames (mirror of export's
      `frame_bank_caches`). preview == export.

  (B) SG-8 pressure-degrade — under system memory pressure the cache lowers its
      EFFECTIVE budget below the static `byte_budget` (the B6.1 hard ceiling), so
      residency / resolution degrade FURTHER rather than OOM-crash. The pressure
      signal is injectable for deterministic testing.

FOUR ENFORCED GATES:

  1. REGRESSION — no frameBanks → preview composite gets ONLY the request's
     layers (no extra layer). SG-8 at low/zero pressure → effective budget ==
     byteBudget (no behavior change vs B6.1).
       test_preview_no_framebanks_is_unchanged
       test_sg8_low_pressure_effective_equals_budget

  2. PREVIEW==EXPORT PARITY (anti-dead-flag) — a frameBank at a given position
     renders the SAME resolved frame in preview (zmq) as in export. FAIL-BEFORE
     (preview ignored frameBanks → no layer) / PASS-AFTER.
       test_preview_renders_framebank_layer_matching_export

  3. SG-8 DEGRADE (HARD ORACLE) — injected HIGH pressure → effective budget drops
     → resident bytes stay BELOW the degraded budget → more evictions / proxies →
     NO crash. resident(high pressure) < resident(low pressure) for the same bank.
       test_sg8_high_pressure_degrades_residency_below_low
       test_sg8_degrade_curve_factors
       test_sg8_broken_probe_fails_open

  4. NO CACHE LEAK — removing a frameBank from the request drops its preview
     cache (no unbounded `_frame_bank_caches` growth as banks come/go).
       test_preview_removed_framebank_drops_its_cache

The preview tests drive `ZMQServer._handle_render_composite` directly (a
__new__'d server skeleton, mirror of test_voice_state_keying), stubbing
`_get_reader` with a fake footage reader (no file I/O) and monkeypatching
`render_composite` to capture the assembled layers. The export reference reuses
the B6.1 `_composite_export_frame` harness so the parity assertion is an actual
cross-path comparison.
"""

from __future__ import annotations

import numpy as np
import pytest

import zmq_server as zmq_mod
from engine.decoded_frame_cache import DecodedFrameCache, _degrade_factor
from engine.export import ExportManager
from security import FRAMEBANK_BYTE_BUDGET_MIN

pytestmark = pytest.mark.smoke


# --------------------------------------------------------------------------- #
# fakes — deterministic footage reader (no file I/O), shared shape with the
# B6.1 export harness so the cross-path parity comparison is apples-to-apples.
# --------------------------------------------------------------------------- #


class FakeReader:
    """decode_frame(i) → RGBA frame whose every pixel encodes `i` in R (mod 256)."""

    def __init__(self, frame_count: int = 200, h: int = 4, w: int = 4):
        self.frame_count = frame_count
        self.width = w
        self.height = h
        self._h = h
        self._w = w
        self.decoded: list[int] = []

    def decode_frame(self, frame_index: int) -> np.ndarray:
        self.decoded.append(int(frame_index))
        f = np.zeros((self._h, self._w, 4), dtype=np.uint8)
        f[:, :, 0] = int(frame_index) % 256
        f[:, :, 3] = 255
        return f


def _assets() -> dict:
    return {"clipA": {"path": "/fake/clipA.mp4", "frameCount": 100, "fps": 30}}


def _fb_payload(position: float, interp: str = "nearest", n_slots: int = 4) -> dict:
    return {
        "type": "frameBank",
        "slots": [{"clipId": "clipA", "frameIndex": i * 10} for i in range(n_slots)],
        "interp": interp,
        "position": position,
        "byteBudget": FRAMEBANK_BYTE_BUDGET_MIN,
    }


def _build_server(monkeypatch, reader: FakeReader | None = None):
    """A ZMQServer skeleton with only what _handle_render_composite touches, plus
    a captured render_composite and a stubbed _get_reader."""
    from zmq_server import ZMQServer

    server = ZMQServer.__new__(ZMQServer)
    server.token = "test-token"
    server.last_frame_ms = 0.0

    rdr = reader if reader is not None else FakeReader()
    server._get_reader = lambda path: rdr  # type: ignore[assignment]

    captured: list[list[dict]] = []

    def fake_render_composite(layers, resolution, project_seed, layer_states=None):
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

    monkeypatch.setattr(zmq_mod, "render_composite", fake_render_composite)
    # encode path: keep flatten/encode cheap + deterministic (don't exercise JPEG).
    monkeypatch.setattr(zmq_mod, "flatten_rgba", lambda f: f)
    monkeypatch.setattr(zmq_mod, "encode_mjpeg", lambda f: b"\x00")
    # Asset paths in these tests are synthetic (no file I/O — _get_reader is
    # stubbed), so bypass the on-disk validate_upload existence check exactly as
    # the other render_composite tests do (test_zmq_commands).
    monkeypatch.setattr(zmq_mod, "validate_upload", lambda p: [])
    return server, captured, rdr


def _render(server, *, frame_index: int = 0, performance: dict | None = None) -> dict:
    msg = {
        "layers": [
            {
                "layer_type": "video",
                "asset_path": "/fake/base.mp4",
                "frame_index": frame_index,
                "chain": [],
                "clip_opacity": 1.0,
            }
        ],
        "resolution": [4, 4],
        "project_seed": 0,
    }
    if performance is not None:
        msg["performance"] = performance
    return server._handle_render_composite(msg, "mid-1")


def _export_framebank_r(position: float, interp: str = "nearest") -> int:
    """Render the SAME bank via the EXPORT path; return its layer's decoded R.

    Reuses B6.1's `_composite_export_frame` with a captured render_composite so we
    can compare the resolved frame against the preview path (the parity oracle).
    """
    mgr = ExportManager()
    reader = FakeReader()
    captured: list[list[dict]] = []

    import engine.export as export_mod

    orig = export_mod.render_composite

    def cap(layers, resolution, project_seed, voice_states):
        snap = []
        for layer in layers:
            frame = layer.get("frame")
            snap.append(int(frame[0, 0, 0]) if isinstance(frame, np.ndarray) else None)
        captured.append(snap)
        w, h = resolution
        return np.zeros((h, w, 4), dtype=np.uint8), {}

    export_mod.render_composite = cap
    try:
        perf = {
            "events": [],
            "instruments": {},
            "assets": _assets(),
            "frameBanks": {"fb1": _fb_payload(position, interp=interp)},
        }
        mgr._composite_export_frame(
            base_frame=np.zeros((4, 4, 4), dtype=np.uint8),
            base_chain=[],
            performance=perf,
            frame_index=0,
            resolution=(4, 4),
            project_seed=0,
            voice_states={},
            voice_readers={"/fake/clipA.mp4": reader},
            frame_bank_caches={},
        )
    finally:
        export_mod.render_composite = orig
    # The frameBank layer is the non-base layer (R = its resolved frame).
    return captured[0][-1]


# =========================================================================== #
# GATE 1 — REGRESSION
# =========================================================================== #


def test_preview_no_framebanks_is_unchanged(monkeypatch):
    """No `performance` payload → composite sees ONLY the request layers (the one
    base video layer). No frameBank layer appended → preview byte-identical."""
    server, captured, _ = _build_server(monkeypatch)
    res = _render(server)  # no performance
    assert res["ok"] is True
    assert len(captured) == 1
    assert len(captured[0]) == 1  # base layer only


def test_preview_empty_framebanks_is_unchanged(monkeypatch):
    server, captured, _ = _build_server(monkeypatch)
    res = _render(server, performance={"frameBanks": {}})
    assert res["ok"] is True
    assert len(captured[0]) == 1  # base only — empty dict appends nothing


def test_sg8_low_pressure_effective_equals_budget():
    """SG-8 at zero/low pressure → effective budget == byteBudget (B6.1 parity)."""
    for p in (0.0, 10.0, 50.0, 79.9):
        cache = DecodedFrameCache(FRAMEBANK_BYTE_BUDGET_MIN, pressure_fn=lambda p=p: p)
        assert cache.effective_budget() == cache.byte_budget


# =========================================================================== #
# GATE 2 — PREVIEW == EXPORT PARITY (anti-dead-flag)
# =========================================================================== #


def test_preview_renders_framebank_layer_matching_export(monkeypatch):
    """A frameBank at a given position renders the SAME resolved frame in preview
    (zmq path) as in export. FAIL-BEFORE: preview ignored frameBanks (no extra
    layer). PASS-AFTER: preview appends the bank layer with the resolved frame,
    matching the export render's resolved R exactly."""
    for position, expect_r in [(0.0, 0), (1.0, 30), (0.5, 20)]:
        server, captured, _ = _build_server(monkeypatch)
        perf = {"assets": _assets(), "frameBanks": {"fb1": _fb_payload(position)}}
        res = _render(server, performance=perf)
        assert res["ok"] is True
        # Anti-dead-flag: the frameBank MUST produce a second (voice) layer.
        assert len(captured[0]) == 2, "preview did not append the frameBank layer"
        fb_layer = captured[0][-1]
        assert fb_layer["layer_id"] == "framebank:framebank_fb1"
        # PARITY: preview resolved R == export resolved R for the same bank+pos.
        assert fb_layer["decoded_r"] == expect_r
        assert fb_layer["decoded_r"] == _export_framebank_r(position)


def test_preview_framebank_opacity_blend_forwarded(monkeypatch):
    server, captured, _ = _build_server(monkeypatch)
    fb = _fb_payload(0.0)
    fb["opacity"] = 0.5
    fb["blendMode"] = "screen"
    perf = {"assets": _assets(), "frameBanks": {"fb1": fb}}
    _render(server, performance=perf)
    fb_layer = captured[0][-1]
    assert fb_layer["opacity"] == 0.5
    assert fb_layer["blend_mode"] == "screen"


# =========================================================================== #
# GATE 3 — SG-8 DEGRADE (HARD ORACLE)
# =========================================================================== #


def test_sg8_degrade_curve_factors():
    """The documented curve: <80% → 1.0; [80,95) → 0.5; ≥95% → 0.25."""
    assert _degrade_factor(0.0) == 1.0
    assert _degrade_factor(79.9) == 1.0
    assert _degrade_factor(80.0) == 0.5
    assert _degrade_factor(94.9) == 0.5
    assert _degrade_factor(95.0) == 0.25
    assert _degrade_factor(150.0) == 0.25


def _residency_after_sweep(pressure: float) -> int:
    """Drive a multi-slot sweep through a cache at a fixed pressure; return the
    resident bytes after the sweep (each frame is ~real-sized so several fit at
    full budget but fewer fit when degraded)."""
    budget = FRAMEBANK_BYTE_BUDGET_MIN
    cache = DecodedFrameCache(budget, pressure_fn=lambda: pressure)
    # Each decoded frame ~ 1/8 of the MIN budget so ~8 fit at full budget, ~4 at
    # half, ~2 at quarter — residency tracks the effective budget.
    side = int(((budget / 8) / 4) ** 0.5)  # 4 channels uint8

    def decode(clip_id, frame_index):
        f = np.zeros((side, side, 4), dtype=np.uint8)
        f[:, :, 0] = frame_index % 256
        return f

    inst = {
        "slots": [{"clipId": "clipA", "frameIndex": i} for i in range(64)],
        "interp": "nearest",
        "byteBudget": budget,
    }
    from engine.frame_bank import resolve_frame_bank_frame

    for i in range(64):
        resolve_frame_bank_frame(inst, i / 63, cache, decode)
    return cache


def test_sg8_high_pressure_degrades_residency_below_low():
    """HARD ORACLE: resident(high pressure) < resident(low pressure) for the same
    bank+sweep, and resident NEVER exceeds the degraded effective budget. No
    crash under any pressure."""
    low = _residency_after_sweep(10.0)
    high = _residency_after_sweep(99.0)
    # Degrade actually lowered residency.
    assert high.resident_bytes < low.resident_bytes
    # Invariant: resident <= effective budget at each pressure.
    assert low.resident_bytes <= low.byte_budget
    assert high.resident_bytes <= high.byte_budget // 4
    # More aggressive shedding under pressure.
    assert high.evictions >= low.evictions


def test_sg8_rising_pressure_pretrims_resident(monkeypatch):
    """When pressure RISES mid-life, the next get sheds already-resident frames
    down to the tighter effective budget (degrade, not crash)."""
    budget = FRAMEBANK_BYTE_BUDGET_MIN
    pressure = {"v": 0.0}
    cache = DecodedFrameCache(budget, pressure_fn=lambda: pressure["v"])
    side = int(((budget / 8) / 4) ** 0.5)

    def decode(clip_id, frame_index):
        f = np.zeros((side, side, 4), dtype=np.uint8)
        f[:, :, 0] = frame_index % 256
        return f

    # Fill at low pressure.
    for i in range(8):
        cache.get("clipA", i, decode)
    resident_low = cache.resident_bytes
    assert resident_low <= budget
    # Pressure spikes; a single subsequent get pre-trims down to budget//4.
    pressure["v"] = 99.0
    cache.get("clipA", 100, decode)
    assert cache.resident_bytes <= budget // 4
    assert cache.resident_bytes < resident_low


def test_sg8_broken_probe_fails_open():
    """A crashing pressure probe must NOT crash the render — fail open to the
    full B6.1 budget (never below the hard floor)."""

    def boom():
        raise RuntimeError("probe down")

    cache = DecodedFrameCache(FRAMEBANK_BYTE_BUDGET_MIN, pressure_fn=boom)
    assert cache.effective_budget() == cache.byte_budget
    # And a real get still works (no crash).
    out = cache.get("clipA", 0, lambda c, i: np.zeros((4, 4, 4), dtype=np.uint8))
    assert out.shape == (4, 4, 4)


def test_sg8_default_pressure_fn_is_real_signal():
    """Default pressure_fn is the real Q7 signal (no arg needed) and yields a
    positive effective budget."""
    cache = DecodedFrameCache(FRAMEBANK_BYTE_BUDGET_MIN)
    assert cache.effective_budget() > 0
    assert cache.effective_budget() <= cache.byte_budget


# =========================================================================== #
# GATE 4 — NO CACHE LEAK
# =========================================================================== #


def test_preview_removed_framebank_drops_its_cache(monkeypatch):
    """Removing a frameBank from a later render drops its server-side cache (no
    unbounded growth of `_frame_bank_caches` as banks come and go)."""
    server, captured, _ = _build_server(monkeypatch)
    # Frame 0: two banks present.
    perf2 = {
        "assets": _assets(),
        "frameBanks": {
            "fb1": _fb_payload(0.0),
            "fb2": _fb_payload(1.0),
        },
    }
    _render(server, frame_index=0, performance=perf2)
    assert set(server._frame_bank_caches.keys()) == {"fb1", "fb2"}
    # Frame 1 (monotonic): fb2 removed → its cache must be dropped.
    perf1 = {"assets": _assets(), "frameBanks": {"fb1": _fb_payload(0.0)}}
    _render(server, frame_index=1, performance=perf1)
    assert set(server._frame_bank_caches.keys()) == {"fb1"}
    # Frame 2: all banks removed → all caches dropped (no leak).
    _render(server, frame_index=2, performance={"frameBanks": {}})
    assert server._frame_bank_caches == {}


def test_preview_cache_persists_across_frames_same_bank(monkeypatch):
    """The per-bank cache persists across preview frames (mirror export): the SAME
    DecodedFrameCache object is reused for a bank that stays present."""
    server, captured, _ = _build_server(monkeypatch)
    perf = {"assets": _assets(), "frameBanks": {"fb1": _fb_payload(0.0)}}
    _render(server, frame_index=0, performance=perf)
    cache0 = server._frame_bank_caches["fb1"]
    _render(server, frame_index=1, performance=perf)
    cache1 = server._frame_bank_caches["fb1"]
    assert cache0 is cache1  # persisted, not recreated per frame
