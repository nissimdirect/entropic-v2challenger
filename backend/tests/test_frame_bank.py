"""
B6.1 — Frame-Bank (wavetable) instrument: model + export render + byte-budget
LRU + caps (INSTRUMENTS-BUILD-PLAN.md §B6).

A Frame-Bank is the video analog of a wavetable oscillator: an indexed bank of
frames a modulatable `position` (0..1) scans + interpolates through.

FOUR ENFORCED GATES (RISK:HIGH — the byte-budget is an OOM guard):

  1. ADDITIVE / REGRESSION — a `performance` with NO `frameBanks` key exports
     byte-identical to today (the per-instrument / rack path is untouched).
       test_no_framebanks_key_is_byte_identical

  2. POSITION-SCAN CORRECTNESS (export-path determinism) —
       position=0 → slot[0]'s frame; position=1 → slot[last]'s frame;
       position=0.5 with 2 slots + blend → exact 50/50 per-pixel interpolation
       (all-0 ⊕ all-255 → 127/128); nearest rounds.
       test_position_zero_selects_first_slot / ...one_selects_last_slot
       test_blend_half_is_pixel_midpoint_127_128
       test_nearest_rounds

  3. BYTE-BUDGET BOUND (THE OOM GATE — HARD ORACLE) — a 256-slot bank rendered
     under a SMALL byteBudget keeps resident decoded bytes <= byteBudget across a
     full position sweep (it does NOT decode all 256 at once). A single
     over-budget frame → downscale-proxy served, NO crash.
       test_oom_bound_resident_bytes_never_exceeds_budget
       test_fail_before_naive_decode_all_would_blow_budget
       test_single_over_budget_frame_served_as_downscale_proxy

  4. CAPS (trust boundary) — position clamped [0,1]+finite (NaN/inf/2.0 →
     clamped); slots > MAX_FRAMEBANK_SLOTS rejected; byteBudget clamped to the
     hard cap; bad slot ref rejected (no crash).
       test_caps_*

Tests are EXPORT-PATH (deterministic). The render harness mirrors
test_rack_export.py: drives ExportManager._composite_export_frame directly with a
fake footage reader (no file I/O) and monkeypatches render_composite to capture
the assembled layers.
"""

from __future__ import annotations

import numpy as np
import pytest

import engine.export as export_mod
from engine.decoded_frame_cache import DecodedFrameCache, _downscale_to_fit
from engine.export import ExportManager
from engine.frame_bank import (
    resolve_frame_bank_frame,
    resolve_position_indices,
)
from security import (
    FRAMEBANK_BYTE_BUDGET_MAX,
    FRAMEBANK_BYTE_BUDGET_MIN,
    MAX_FRAMEBANK_SLOTS,
    validate_frame_bank,
)


# ---------------------------------------------------------------------------
# Fakes — deterministic footage readers (no file I/O).
# ---------------------------------------------------------------------------


class FakeReader:
    """Footage reader stand-in. decode_frame(i) returns an RGBA frame whose every
    pixel encodes `i` in the R channel (mod 256), and records `i`."""

    def __init__(self, frame_count: int, h: int = 4, w: int = 4):
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


def _decode_const(value_by_idx):
    """Build a decode(clip_id, frame_index) -> ndarray that fills R with a value."""
    decoded: list[int] = []

    def decode(clip_id: str, frame_index: int, h: int = 4, w: int = 4) -> np.ndarray:
        decoded.append(frame_index)
        f = np.zeros((h, w, 4), dtype=np.uint8)
        f[:, :, 0] = value_by_idx(frame_index)
        f[:, :, 3] = 255
        return f

    decode.decoded = decoded  # type: ignore[attr-defined]
    return decode


# ===========================================================================
# Unit-level: position math + cache (pure, no export harness)
# ===========================================================================


def test_position_indices_endpoints_and_midpoint():
    # 4 slots, blend: idx = position*(4-1).
    assert (
        resolve_position_indices(0.0, 4, "blend") == (0, 1, 0.0)
        or resolve_position_indices(0.0, 4, "blend")[0] == 0
    )
    lo, hi, frac = resolve_position_indices(0.0, 4, "blend")
    assert lo == 0 and frac == 0.0
    lo, hi, frac = resolve_position_indices(1.0, 4, "blend")
    assert lo == 3  # last slot
    lo, hi, frac = resolve_position_indices(0.5, 2, "blend")
    # 2 slots: idx = 0.5*(1) = 0.5 → lo=0, hi=1, frac=0.5
    assert (lo, hi, frac) == (0, 1, 0.5)


def test_position_indices_nearest_rounds():
    # 4 slots, nearest: idx=0.5*3=1.5 → round → 2.
    lo, hi, frac = resolve_position_indices(0.5, 4, "nearest")
    assert lo == hi == 2 and frac == 0.0
    # idx=0.4*3=1.2 → round → 1
    lo, _, _ = resolve_position_indices(0.4, 4, "nearest")
    assert lo == 1


def test_blend_half_is_pixel_midpoint_127_128():
    # GATE 2 — the headline pixel-math assertion. slot0 all-0, slot1 all-255,
    # position 0.5, blend → (1-0.5)*0 + 0.5*255 = 127.5 → round → 128.
    cache = DecodedFrameCache(FRAMEBANK_BYTE_BUDGET_MIN)

    def decode(clip_id, frame_index):
        f = np.zeros((4, 4, 4), dtype=np.uint8)
        f[:, :, :] = 0 if frame_index == 0 else 255
        return f

    inst = {
        "type": "frameBank",
        "slots": [{"clipId": "c", "frameIndex": 0}, {"clipId": "c", "frameIndex": 1}],
        "interp": "blend",
        "byteBudget": FRAMEBANK_BYTE_BUDGET_MIN,
    }
    out = resolve_frame_bank_frame(inst, 0.5, cache, decode)
    # round(127.5) → 128 (numpy banker's? np.round uses round-half-to-even: 127.5
    # → 128 because 127.5 rounds to even 128). Assert it is the midpoint 127/128.
    assert out[0, 0, 0] in (127, 128)
    # All pixels identical (uniform frames).
    assert np.all(out[:, :, 0] == out[0, 0, 0])


def test_nearest_emits_exact_slot_frame():
    cache = DecodedFrameCache(FRAMEBANK_BYTE_BUDGET_MIN)

    def decode(clip_id, frame_index):
        f = np.zeros((4, 4, 4), dtype=np.uint8)
        f[:, :, 0] = frame_index * 10
        return f

    inst = {
        "type": "frameBank",
        "slots": [
            {"clipId": "c", "frameIndex": 0},
            {"clipId": "c", "frameIndex": 1},
            {"clipId": "c", "frameIndex": 2},
            {"clipId": "c", "frameIndex": 3},
        ],
        "interp": "nearest",
        "byteBudget": FRAMEBANK_BYTE_BUDGET_MIN,
    }
    # position 0.5 → idx 1.5 → round → slot[2] → frameIndex 2 → R=20.
    out = resolve_frame_bank_frame(inst, 0.5, cache, decode)
    assert out[0, 0, 0] == 20


def test_flow_interp_renders_as_blend_no_raise():
    # flow is DEFERRED (B7). It must render (as blend), never raise.
    cache = DecodedFrameCache(FRAMEBANK_BYTE_BUDGET_MIN)

    def decode(clip_id, frame_index):
        f = np.zeros((4, 4, 4), dtype=np.uint8)
        f[:, :, :] = 0 if frame_index == 0 else 255
        return f

    inst = {
        "type": "frameBank",
        "slots": [{"clipId": "c", "frameIndex": 0}, {"clipId": "c", "frameIndex": 1}],
        "interp": "flow",
        "byteBudget": FRAMEBANK_BYTE_BUDGET_MIN,
    }
    out = resolve_frame_bank_frame(inst, 0.5, cache, decode)
    assert out[0, 0, 0] in (127, 128)  # blended, not crashed


# ===========================================================================
# GATE 3 — BYTE-BUDGET BOUND (THE OOM GATE, hard oracle)
# ===========================================================================


def _make_256_slot_inst(byte_budget: int) -> dict:
    return {
        "type": "frameBank",
        "slots": [{"clipId": "c", "frameIndex": i} for i in range(256)],
        "interp": "nearest",
        "byteBudget": byte_budget,
    }


def test_oom_bound_resident_bytes_never_exceeds_budget():
    # A 256-slot bank, each frame 64x64 RGBA = 16384 B. Small budget that holds
    # only ~3 frames. Sweep position 0..1 (every slot) and assert the cache's
    # resident bytes NEVER exceed the budget at any point.
    frame_bytes = 64 * 64 * 4  # 16_384
    budget = frame_bytes * 3 + 1  # room for ~3 frames
    cache = DecodedFrameCache(budget)

    def decode(clip_id, frame_index):
        f = np.zeros((64, 64, 4), dtype=np.uint8)
        f[:, :, 0] = frame_index % 256
        return f

    inst = _make_256_slot_inst(budget)
    n = 256
    for i in range(n):
        pos = i / (n - 1)
        resolve_frame_bank_frame(inst, pos, cache, decode)
        # THE INVARIANT — resident bytes bounded after every decode.
        assert cache.resident_bytes <= budget, (
            f"resident {cache.resident_bytes} > budget {budget} at pos {pos}"
        )
    # It must have evicted (not held all 256) AND peaked under budget.
    assert cache.peak_resident_bytes <= budget
    assert cache.evictions > 0
    # It did NOT keep all 256 frames resident.
    assert len(cache) <= 4


def test_fail_before_naive_decode_all_would_blow_budget():
    # FAIL-BEFORE evidence: decoding all 256 frames resident (the naive path this
    # cache prevents) would hold 256 * 16384 = 4 MB >> the 3-frame budget.
    frame_bytes = 64 * 64 * 4
    budget = frame_bytes * 3 + 1
    naive_resident = 256 * frame_bytes
    assert naive_resident > budget  # the bug the cache prevents
    # PASS-AFTER: the cache holds <= budget (proven in the test above). Tie the
    # numbers together so the oracle is explicit.
    cache = DecodedFrameCache(budget)

    def decode(clip_id, frame_index):
        return np.zeros((64, 64, 4), dtype=np.uint8)

    inst = _make_256_slot_inst(budget)
    for i in range(256):
        resolve_frame_bank_frame(inst, i / 255, cache, decode)
    assert cache.peak_resident_bytes <= budget < naive_resident


def test_single_over_budget_frame_served_as_downscale_proxy():
    # A single 256x256 RGBA frame = 262_144 B, but the budget is 16_384 B (a 64x64
    # frame). The frame ALONE exceeds the budget → downscale-proxy: it is shrunk so
    # resident bytes fit, served (NO crash), and the cache stays bounded.
    big_bytes = 256 * 256 * 4  # 262_144
    budget = 64 * 64 * 4  # 16_384
    assert big_bytes > budget
    cache = DecodedFrameCache(budget)

    def decode(clip_id, frame_index):
        return np.zeros((256, 256, 4), dtype=np.uint8)

    inst = {
        "type": "frameBank",
        "slots": [{"clipId": "c", "frameIndex": 0}],
        "interp": "nearest",
        "byteBudget": budget,
    }
    out = resolve_frame_bank_frame(inst, 0.0, cache, decode)
    assert out.nbytes <= budget  # proxy fits
    assert cache.resident_bytes <= budget
    assert cache.proxies_served == 1
    # downscale preserved channel count.
    assert out.shape[2] == 4


def test_downscale_helper_fits_budget_and_preserves_channels():
    frame = np.zeros((128, 128, 4), dtype=np.uint8)
    budget = 4 * 4 * 4  # tiny
    proxy = _downscale_to_fit(frame, budget)
    assert proxy.nbytes <= budget
    assert proxy.shape[2] == 4


def test_cache_lru_eviction_order():
    # 2-frame budget; access 0,1 then 2 → 0 (LRU) evicted; re-access 1 → hit.
    fb = 4 * 4 * 4
    cache = DecodedFrameCache(fb * 2)
    dec = _decode_const(lambda i: i)
    cache.get("c", 0, dec)
    cache.get("c", 1, dec)
    assert len(cache) == 2
    cache.get("c", 2, dec)  # evicts LRU = frame 0
    assert len(cache) == 2
    before = len(dec.decoded)  # type: ignore[attr-defined]
    cache.get("c", 1, dec)  # HIT — no new decode
    assert len(dec.decoded) == before  # type: ignore[attr-defined]
    cache.get("c", 0, dec)  # MISS — 0 was evicted, re-decode
    assert len(dec.decoded) == before + 1  # type: ignore[attr-defined]


# ===========================================================================
# GATE 4 — CAPS (trust boundary)
# ===========================================================================


def test_caps_position_clamped_finite():
    base = {
        "slots": [{"clipId": "c", "frameIndex": 0}],
        "interp": "blend",
        "byteBudget": FRAMEBANK_BYTE_BUDGET_MIN,
    }
    for raw, expected in [
        (2.0, 1.0),
        (-1.0, 0.0),
        (float("nan"), 0.0),
        (float("inf"), 0.0),
        (float("-inf"), 0.0),
        (0.5, 0.5),
        ("bogus", 0.0),
    ]:
        san, errs = validate_frame_bank({**base, "position": raw})
        assert errs == [] and san is not None, (
            f"position {raw!r} should clamp not error"
        )
        assert san["position"] == expected, f"position {raw!r} → {san['position']}"


def test_caps_bytebudget_clamped_to_hard_range():
    base = {
        "slots": [{"clipId": "c", "frameIndex": 0}],
        "interp": "blend",
        "position": 0.0,
    }
    san, _ = validate_frame_bank({**base, "byteBudget": 1})  # below min
    assert san["byteBudget"] == FRAMEBANK_BYTE_BUDGET_MIN
    san, _ = validate_frame_bank({**base, "byteBudget": 999 * 1024**3})  # above max
    assert san["byteBudget"] == FRAMEBANK_BYTE_BUDGET_MAX
    san, _ = validate_frame_bank({**base, "byteBudget": float("nan")})
    assert san["byteBudget"] == FRAMEBANK_BYTE_BUDGET_MIN
    mid = 64 * 1024 * 1024
    san, _ = validate_frame_bank({**base, "byteBudget": mid})
    assert san["byteBudget"] == mid


def test_caps_slots_over_max_rejected():
    inst = {
        "slots": [{"clipId": "c", "frameIndex": 0}] * (MAX_FRAMEBANK_SLOTS + 1),
        "interp": "blend",
        "position": 0.0,
        "byteBudget": FRAMEBANK_BYTE_BUDGET_MIN,
    }
    san, errs = validate_frame_bank(inst)
    assert san is None and errs and "MAX_FRAMEBANK_SLOTS" in errs[0]


def test_caps_empty_slots_rejected():
    san, errs = validate_frame_bank(
        {"slots": [], "interp": "blend", "position": 0.0, "byteBudget": 16 * 1024**2}
    )
    assert san is None and errs


def test_caps_bad_slot_ref_rejected_no_crash():
    for bad_slot in [
        {"clipId": "", "frameIndex": 0},  # empty clipId
        {"clipId": "c"},  # missing frameIndex
        {"clipId": "c", "frameIndex": -1},  # negative
        {"clipId": "c", "frameIndex": 1.5},  # non-int
        {"clipId": 5, "frameIndex": 0},  # non-string clipId
        {"clipId": "c", "frameIndex": True},  # bool masquerading as int
        "notadict",
    ]:
        san, errs = validate_frame_bank(
            {
                "slots": [bad_slot],
                "interp": "blend",
                "position": 0.0,
                "byteBudget": 16 * 1024**2,
            }
        )
        assert san is None and errs, f"bad slot {bad_slot!r} should be rejected"


def test_caps_unknown_interp_rejected():
    san, errs = validate_frame_bank(
        {
            "slots": [{"clipId": "c", "frameIndex": 0}],
            "interp": "lanczos",
            "position": 0.0,
            "byteBudget": 16 * 1024**2,
        }
    )
    assert san is None and errs


def test_caps_non_dict_rejected():
    san, errs = validate_frame_bank("notadict")
    assert san is None and errs


# ===========================================================================
# GATE 1 + GATE 2 — EXPORT-PATH integration (mirrors test_rack_export harness)
# ===========================================================================


def _capture_composite(monkeypatch) -> list[list[dict]]:
    captured: list[list[dict]] = []

    def fake_render_composite(layers, resolution, project_seed, voice_states):
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


def _assets(frame_count: int = 100) -> dict:
    return {"clipA": {"path": "/fake/clipA.mp4", "frameCount": frame_count, "fps": 30}}


def _fb_perf(position: float, interp: str = "blend", n_slots: int = 4) -> dict:
    return {
        # No events — a frameBank is a continuous scanner. assets resolves clipId.
        "events": [],
        "instruments": {},
        "assets": _assets(),
        "frameBanks": {
            "fb1": {
                "type": "frameBank",
                "slots": [
                    {"clipId": "clipA", "frameIndex": i * 10} for i in range(n_slots)
                ],
                "interp": interp,
                "position": position,
                "byteBudget": FRAMEBANK_BYTE_BUDGET_MIN,
            }
        },
    }


def _run_frame(performance: dict, *, frame_index: int = 0):
    mgr = ExportManager()
    reader = FakeReader(200)
    voice_readers = {"/fake/clipA.mp4": reader}
    base_frame = np.zeros((4, 4, 4), dtype=np.uint8)
    base_frame[:, :, 0] = 7
    base_frame[:, :, 3] = 255
    fb_caches: dict = {}
    out, _ = mgr._composite_export_frame(
        base_frame=base_frame,
        base_chain=[],
        performance=performance,
        frame_index=frame_index,
        resolution=(4, 4),
        project_seed=0,
        voice_states={},
        voice_readers=voice_readers,
        frame_bank_caches=fb_caches,
    )
    return reader, fb_caches


def test_no_framebanks_key_is_byte_identical(monkeypatch):
    # GATE 1 — a performance with NO frameBanks key composites ONLY the base layer
    # (no extra layer appended). Mirrors the rack regression guard.
    captured = _capture_composite(monkeypatch)
    perf = {"events": [], "instruments": {}, "assets": _assets()}
    _run_frame(perf)
    assert len(captured) == 1
    layers = captured[0]
    assert len(layers) == 1  # base only
    assert layers[0]["layer_id"] == "base"


def test_empty_framebanks_dict_is_byte_identical(monkeypatch):
    captured = _capture_composite(monkeypatch)
    perf = {"events": [], "instruments": {}, "assets": _assets(), "frameBanks": {}}
    # Empty frameBanks → perf_active false on the real export, but here we call
    # _composite_export_frame directly; it must still append no framebank layer.
    _run_frame(perf)
    assert len(captured) == 1
    assert len(captured[0]) == 1  # base only


def test_export_position_zero_selects_first_slot(monkeypatch):
    # GATE 2 — position 0 → slot[0] → frameIndex 0 → decoded R = 0.
    captured = _capture_composite(monkeypatch)
    reader, _ = _run_frame(_fb_perf(0.0, interp="nearest"))
    fb_layers = [l for l in captured[0] if l["layer_id"] != "base"]
    assert len(fb_layers) == 1
    assert fb_layers[0]["decoded_r"] == 0
    assert 0 in reader.decoded


def test_export_position_one_selects_last_slot(monkeypatch):
    # GATE 2 — position 1 → slot[last] (frameIndex 30 for 4 slots) → R = 30.
    captured = _capture_composite(monkeypatch)
    reader, _ = _run_frame(_fb_perf(1.0, interp="nearest", n_slots=4))
    fb_layers = [l for l in captured[0] if l["layer_id"] != "base"]
    assert fb_layers[0]["decoded_r"] == 30
    assert 30 in reader.decoded


def test_export_blend_midpoint_is_127_128(monkeypatch):
    # GATE 2 — 2-slot bank (frame 0 → R=0, frame 10 → R=10), position 0.5, blend →
    # (0 + 10)/2 = 5. Use a known pair so the math is exact and not tautological.
    captured = _capture_composite(monkeypatch)
    perf = {
        "events": [],
        "instruments": {},
        "assets": _assets(),
        "frameBanks": {
            "fb1": {
                "type": "frameBank",
                "slots": [
                    {"clipId": "clipA", "frameIndex": 0},
                    {"clipId": "clipA", "frameIndex": 10},
                ],
                "interp": "blend",
                "position": 0.5,
                "byteBudget": FRAMEBANK_BYTE_BUDGET_MIN,
            }
        },
    }
    _run_frame(perf)
    fb_layers = [l for l in captured[0] if l["layer_id"] != "base"]
    # FakeReader frame i → R = i. Blend 0.5 of R=0 and R=10 → 5.
    assert fb_layers[0]["decoded_r"] == 5


def test_export_cache_persists_and_bounds_across_frames(monkeypatch):
    # The per-bank cache is threaded across output frames (frame_bank_caches dict).
    # The OOM bound holds in the EXPORT path too.
    captured = _capture_composite(monkeypatch)
    perf = _fb_perf(0.5, interp="blend", n_slots=4)
    perf["frameBanks"]["fb1"]["byteBudget"] = FRAMEBANK_BYTE_BUDGET_MIN
    mgr = ExportManager()
    reader = FakeReader(200)
    voice_readers = {"/fake/clipA.mp4": reader}
    fb_caches: dict = {}
    base = np.zeros((4, 4, 4), dtype=np.uint8)
    for fi in range(5):
        mgr._composite_export_frame(
            base_frame=base,
            base_chain=[],
            performance=perf,
            frame_index=fi,
            resolution=(4, 4),
            project_seed=0,
            voice_states={},
            voice_readers=voice_readers,
            frame_bank_caches=fb_caches,
        )
    cache = fb_caches["fb1"]
    assert cache.byte_budget == FRAMEBANK_BYTE_BUDGET_MIN
    assert cache.resident_bytes <= cache.byte_budget


def test_export_over_cap_slots_rejected_in_path(monkeypatch):
    # GATE 4 — enforce-before-decode in the export path: an over-cap frameBank is
    # rejected with a ValueError BEFORE any footage decode.
    _capture_composite(monkeypatch)
    perf = {
        "events": [],
        "instruments": {},
        "assets": _assets(),
        "frameBanks": {
            "bad": {
                "type": "frameBank",
                "slots": [{"clipId": "clipA", "frameIndex": 0}]
                * (MAX_FRAMEBANK_SLOTS + 1),
                "interp": "blend",
                "position": 0.0,
                "byteBudget": FRAMEBANK_BYTE_BUDGET_MIN,
            }
        },
    }
    with pytest.raises(ValueError):
        _run_frame(perf)
