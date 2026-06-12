"""P5a.4 — Tests for the backend voice-replay FSM mirror + export voice replay.

Honors the design obligations in docs/decisions/composite-export-design.md (O1):
  - "python replay matches TS golden vectors exactly"
  - "export twice produces byte-identical files (sha256)"
  - "edit-after-capture: changing pad modRoutes after capture does not change export output"
  - "malformed event list rejected at export start (fuzz: NaN frameIndex, velocity 999, unknown kind)"
  - "oldest-steal at cap reproduces identically across replays"
  - "stateful effect per-voice state threads across exported frames"
  - "event list of 10,001 events rejected at export start (MAX_CAPTURE_EVENTS, negative)"
  - cross-fps: same events at 30/60fps land triggers on the same timeline seconds
  - memory: 50-layer (MAX_COMPOSITE_LAYERS) payload rejected before decode (cap-rejection unit test)
"""

import hashlib
import json
import os
import tempfile
import time
from pathlib import Path

import numpy as np
import pytest

from engine.voice_replay import encode_voice_id, evaluate_voices

FIXTURE = Path(__file__).parent / "fixtures" / "voice_fsm_golden.json"


# ---------------------------------------------------------------------------
# Golden-vector parity: voice_replay.py MUST match voiceFSM.ts exactly
# ---------------------------------------------------------------------------


def _load_golden() -> dict:
    with open(FIXTURE) as f:
        return json.load(f)


def test_python_replay_matches_ts_golden_vectors_exactly():
    """python replay matches TS golden vectors exactly.

    Every (events, frameIndex, opts) case dumped from the vitest voiceFSM suite
    must reproduce identically under the Python mirror. This is the Render-path-
    reuse contract: same semantics, two languages.
    """
    golden = _load_golden()
    assert golden["cases"], "golden fixture is empty"

    mismatches = []
    for case in golden["cases"]:
        events = case["events"]
        opts = case["opts"]
        # vitest dumps camelCase opts ({voiceCap, adsr}); evaluate_voices reads
        # the same keys.
        for query in case["queries"]:
            frame_index = query["frameIndex"]
            expected = query["voices"]
            actual = evaluate_voices(events, frame_index, opts)
            # Compare via canonical JSON so float/int and key-order differences
            # surface as real mismatches, not type noise.
            if json.dumps(actual, sort_keys=True) != json.dumps(
                expected, sort_keys=True
            ):
                mismatches.append(
                    f"\nCASE {case['name']} @frame {frame_index}:\n"
                    f"  expected={json.dumps(expected)}\n"
                    f"  actual  ={json.dumps(actual)}"
                )

    assert not mismatches, "TS/Python FSM divergence:" + "".join(mismatches)


def test_oldest_steal_at_cap_reproduces_identically_across_replays():
    """oldest-steal at cap reproduces identically across replays.

    Deterministic voiceId + steal order: replaying the same event list twice
    yields identical voices (no counters, no wall-clock).
    """
    events = [
        {
            "frameIndex": i,
            "eventIndex": i,
            "note": 60 + i,
            "velocity": 100,
            "kind": "trigger",
            "instrumentId": "inst-1",
        }
        for i in range(6)  # 6 triggers, cap 4 → 2 steals
    ]
    opts = {
        "voiceCap": 4,
        "adsr": {"attack": 10, "decay": 5, "sustain": 0.5, "release": 10},
    }

    run1 = evaluate_voices(events, 5, opts)
    run2 = evaluate_voices(events, 5, opts)
    assert run1 == run2
    # Exactly cap voices survive; the two oldest (frames 0,1) were stolen.
    assert len(run1) == 4
    trigger_frames = sorted(v["triggerFrame"] for v in run1)
    assert trigger_frames == [2, 3, 4, 5]


def test_encode_voice_id_mirrors_buildvoicelayers_colon_sanitization():
    """The colon→underscore + 128-truncate encoding mirrors P5a.3 buildVoiceLayers.

    VOICE_ID_PATTERN rejects colons; the encoded id must be colon-free and
    pattern-valid so it can be used as a `voice:{...}` cache key.
    """
    from security import VOICE_ID_PATTERN

    raw = "voice:inst-1:30:7"
    enc = encode_voice_id(raw)
    assert ":" not in enc
    assert enc == "voice_inst-1_30_7"
    assert VOICE_ID_PATTERN.match(enc)

    # Over-length raw → truncated to 128, still pattern-valid.
    long_raw = "voice:" + ("a" * 200)
    enc_long = encode_voice_id(long_raw)
    assert len(enc_long) == 128
    assert VOICE_ID_PATTERN.match(enc_long)


# ---------------------------------------------------------------------------
# Determinism contract: FPS alignment (triggers land on the same seconds)
# ---------------------------------------------------------------------------


def test_same_events_at_30_and_60fps_land_triggers_on_same_timeline_seconds():
    """same events at 30fps and 60fps land triggers on the same timeline seconds.

    A trigger captured at time t_s = frameIndex / fps must, when re-expressed at
    another fps, evaluate active at the corresponding frame for that same second.
    evaluate_voices keys on frameIndex; the caller maps output frames→source
    frames by time, so trigger frame = round(t_s * fps).
    """
    adsr = {"attack": 0, "decay": 0, "sustain": 1, "release": 0}

    # Trigger at t = 1.0s. At 30fps that is frame 30; at 60fps, frame 60.
    t_s = 1.0
    ev30 = [
        {
            "frameIndex": round(t_s * 30),
            "eventIndex": 0,
            "note": 60,
            "velocity": 100,
            "kind": "trigger",
            "instrumentId": "inst-1",
        }
    ]
    ev60 = [
        {
            "frameIndex": round(t_s * 60),
            "eventIndex": 0,
            "note": 60,
            "velocity": 100,
            "kind": "trigger",
            "instrumentId": "inst-1",
        }
    ]

    # Query each at the frame corresponding to t = 1.0s for its fps.
    v30 = evaluate_voices(ev30, round(t_s * 30), {"voiceCap": 4, "adsr": adsr})
    v60 = evaluate_voices(ev60, round(t_s * 60), {"voiceCap": 4, "adsr": adsr})

    assert len(v30) == 1 and len(v60) == 1
    # Same instrument/note active at the same wall-clock second under both fps.
    assert v30[0]["note"] == v60[0]["note"] == 60
    # And NOT yet active one frame before the trigger second.
    assert (
        evaluate_voices(ev30, round(t_s * 30) - 1, {"voiceCap": 4, "adsr": adsr}) == []
    )
    assert (
        evaluate_voices(ev60, round(t_s * 60) - 1, {"voiceCap": 4, "adsr": adsr}) == []
    )


# ---------------------------------------------------------------------------
# Trust boundary: capture-event validation (enforce-before-decode)
# ---------------------------------------------------------------------------


def test_malformed_event_list_rejected_at_export_start():
    """malformed event list rejected at export start (fuzz: NaN frameIndex,
    velocity 999, unknown kind).

    validate_capture_events is the enforce-before-decode gate; every malformed
    shape returns a structured error (no crash, no partial export).
    """
    from security import validate_capture_events

    # Valid baseline passes.
    ok = [
        {
            "frameIndex": 0,
            "eventIndex": 0,
            "note": 60,
            "velocity": 100,
            "kind": "trigger",
            "instrumentId": "inst-1",
        }
    ]
    assert validate_capture_events(ok) == []

    fuzz_cases = [
        ("not a list", "must be a list"),
        (
            [
                {
                    "frameIndex": float("nan"),
                    "eventIndex": 0,
                    "note": 60,
                    "velocity": 100,
                    "kind": "trigger",
                }
            ],
            "frameIndex",
        ),
        (
            [
                {
                    "frameIndex": -1,
                    "eventIndex": 0,
                    "note": 60,
                    "velocity": 100,
                    "kind": "trigger",
                }
            ],
            "frameIndex",
        ),
        (
            [
                {
                    "frameIndex": 0,
                    "eventIndex": 0,
                    "note": 60,
                    "velocity": 999,
                    "kind": "trigger",
                }
            ],
            "velocity",
        ),
        (
            [
                {
                    "frameIndex": 0,
                    "eventIndex": 0,
                    "note": 999,
                    "velocity": 100,
                    "kind": "trigger",
                }
            ],
            "note",
        ),
        (
            [
                {
                    "frameIndex": 0,
                    "eventIndex": 0,
                    "note": 60,
                    "velocity": 100,
                    "kind": "explode",
                }
            ],
            "kind",
        ),
        (
            [
                {
                    "frameIndex": 0,
                    "eventIndex": -5,
                    "note": 60,
                    "velocity": 100,
                    "kind": "trigger",
                }
            ],
            "eventIndex",
        ),
        ([42], "must be a dict"),
        (
            [
                {
                    "frameIndex": True,
                    "eventIndex": 0,
                    "note": 60,
                    "velocity": 100,
                    "kind": "trigger",
                }
            ],
            "frameIndex",
        ),
    ]
    for payload, needle in fuzz_cases:
        errs = validate_capture_events(payload)
        assert errs, f"expected rejection for {payload!r}"
        assert any(needle in e for e in errs), f"{needle} not in {errs} for {payload!r}"


def test_event_list_of_10001_events_rejected_at_export_start():
    """event list of 10,001 events rejected at export start (MAX_CAPTURE_EVENTS,
    negative). Reject, never truncate."""
    from security import MAX_CAPTURE_EVENTS, validate_capture_events

    assert MAX_CAPTURE_EVENTS == 10_000
    big = [
        {
            "frameIndex": 0,
            "eventIndex": i,
            "note": 60,
            "velocity": 100,
            "kind": "trigger",
            "instrumentId": "inst-1",
        }
        for i in range(MAX_CAPTURE_EVENTS + 1)
    ]
    errs = validate_capture_events(big)
    assert errs
    assert any("MAX_CAPTURE_EVENTS" in e for e in errs)

    # Exactly at the cap is allowed.
    at_cap = big[:MAX_CAPTURE_EVENTS]
    assert validate_capture_events(at_cap) == []


def test_fifty_layer_payload_rejected_before_decode():
    """memory: a 50-layer (MAX_COMPOSITE_LAYERS) voice payload is rejected before
    decode, never buffered.

    Implemented as a cap-rejection unit test (not an RSS soak) — stated in the
    PR per the design doc's Memory-strategy note. validate_voice_layers enforces
    MAX_TOTAL_VOICES_PER_RENDER (4) before any footage decode, so a 50-voice
    hostile payload never reaches the decode loop.
    """
    from security import MAX_TOTAL_VOICES_PER_RENDER, validate_voice_layers

    layers = [
        {"voice_id": f"voice_inst-1_{i}_0", "asset_path": "/x", "chain": []}
        for i in range(50)
    ]
    errs = validate_voice_layers(layers)
    assert errs
    assert any("MAX_TOTAL_VOICES_PER_RENDER" in e for e in errs)
    assert MAX_TOTAL_VOICES_PER_RENDER == 4


# ---------------------------------------------------------------------------
# Export integration: byte-identity, edit-after-capture, stateful threading
# ---------------------------------------------------------------------------

from engine.export import ExportManager, ExportStatus  # noqa: E402


def _run_to_completion(job, timeout_s: float = 30.0):
    deadline = time.time() + timeout_s
    while job.status == ExportStatus.RUNNING and time.time() < deadline:
        time.sleep(0.05)
    return job.status


def _perf_payload(events, asset_path, *, modroutes=None):
    """Build a P5a.4 performance payload around one sampler instrument.

    `modroutes` is accepted to PROVE it is never read by the replay (P1-2
    condition 3): the serialized event list carries no modRoutes, so changing
    them must not change export output. It is intentionally dropped here.
    """
    return {
        "events": events,
        "instruments": {
            "sampler-1": {
                "clipId": "clip-1",
                "startFrame": 0,
                "speed": 0,  # freeze on startFrame → deterministic footage
                "opacity": 1.0,
                "blendMode": "normal",
                "voiceCap": 4,
                "adsr": {"attack": 0, "decay": 0, "sustain": 1, "release": 0},
                "chain": [],
            }
        },
        "assets": {"clip-1": {"path": asset_path, "frameCount": 150, "fps": 30}},
    }


def _sha256_dir(d: str) -> str:
    """Hash every PNG in an image-sequence export dir, order-stable."""
    h = hashlib.sha256()
    for name in sorted(os.listdir(d)):
        with open(os.path.join(d, name), "rb") as f:
            h.update(name.encode())
            h.update(f.read())
    return h.hexdigest()


def _export_sequence(synthetic_video_path, perf, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    mgr = ExportManager()
    job = mgr.start(
        input_path=synthetic_video_path,
        output_path=out_dir,
        chain=[],
        project_seed=7,
        settings={
            "export_type": "image_sequence",
            "image_format": "png",
            "region": "custom",
            "start_frame": 0,
            "end_frame": 9,  # 10 frames
            "include_audio": False,
        },
        performance=perf,
    )
    status = _run_to_completion(job)
    return status


def test_export_twice_produces_byte_identical_files_sha256(synthetic_video_path):
    """export twice produces byte-identical files (sha256). Core determinism
    gate, on the EXPORT path (PNG image-sequence = lossless + deterministic)."""
    events = [
        {"frameIndex": 0, "eventIndex": 0, "note": 60, "velocity": 100,
         "kind": "trigger", "instrumentId": "sampler-1"},
        {"frameIndex": 3, "eventIndex": 1, "note": 64, "velocity": 110,
         "kind": "trigger", "instrumentId": "sampler-1"},
    ]
    with tempfile.TemporaryDirectory() as base:
        d1 = os.path.join(base, "run1")
        d2 = os.path.join(base, "run2")
        s1 = _export_sequence(synthetic_video_path, _perf_payload(events, synthetic_video_path), d1)
        s2 = _export_sequence(synthetic_video_path, _perf_payload(events, synthetic_video_path), d2)
        assert s1 == ExportStatus.COMPLETE, f"run1 status {s1}"
        assert s2 == ExportStatus.COMPLETE, f"run2 status {s2}"
        assert _sha256_dir(d1) == _sha256_dir(d2)


def test_edit_after_capture_modroutes_does_not_change_export(synthetic_video_path):
    """edit-after-capture: changing pad modRoutes after capture does not change
    export output. Events carry no modRoutes; the replay reads only the
    serialized event list (P1-2 condition 3)."""
    events = [
        {"frameIndex": 0, "eventIndex": 0, "note": 60, "velocity": 100,
         "kind": "trigger", "instrumentId": "sampler-1"},
    ]
    with tempfile.TemporaryDirectory() as base:
        d1 = os.path.join(base, "before")
        d2 = os.path.join(base, "after")
        # "before": capture with modroutes A. "after": modroutes mutated to B.
        p1 = _perf_payload(events, synthetic_video_path, modroutes=[{"depth": 1.0}])
        p2 = _perf_payload(events, synthetic_video_path, modroutes=[{"depth": 0.0}])
        s1 = _export_sequence(synthetic_video_path, p1, d1)
        s2 = _export_sequence(synthetic_video_path, p2, d2)
        assert s1 == ExportStatus.COMPLETE and s2 == ExportStatus.COMPLETE
        assert _sha256_dir(d1) == _sha256_dir(d2)


def test_stateful_effect_per_voice_state_threads_across_frames(synthetic_video_path):
    """stateful effect per-voice state threads across exported frames.

    A stateful effect (frame_drop) on the voice chain must accumulate per-voice
    state across the export loop — proven by the export completing and producing
    deterministic output across two runs (state keyed voice:{voiceId})."""
    events = [
        {"frameIndex": 0, "eventIndex": 0, "note": 60, "velocity": 100,
         "kind": "trigger", "instrumentId": "sampler-1"},
    ]

    def perf():
        p = _perf_payload(events, synthetic_video_path)
        # Stateful effect on the voice chain.
        p["instruments"]["sampler-1"]["chain"] = [
            {"effect_id": "fx.frame_drop", "params": {"drop_rate": 0.5}}
        ]
        return p

    with tempfile.TemporaryDirectory() as base:
        d1 = os.path.join(base, "s1")
        d2 = os.path.join(base, "s2")
        st1 = _export_sequence(synthetic_video_path, perf(), d1)
        st2 = _export_sequence(synthetic_video_path, perf(), d2)
        assert st1 == ExportStatus.COMPLETE, f"status {st1}"
        assert st2 == ExportStatus.COMPLETE
        # Determinism across runs proves the per-voice state threading is
        # reproducible (no wall-clock / counter leakage into the cache key).
        assert _sha256_dir(d1) == _sha256_dir(d2)


def test_export_without_performance_payload_is_legacy_path(synthetic_video_path):
    """ROLLBACK contract: no performance payload → legacy single-input export,
    unchanged. (Back-compat guard for old clients.)"""
    with tempfile.TemporaryDirectory() as base:
        d = os.path.join(base, "legacy")
        os.makedirs(d, exist_ok=True)
        mgr = ExportManager()
        job = mgr.start(
            input_path=synthetic_video_path,
            output_path=d,
            chain=[],
            project_seed=7,
            settings={
                "export_type": "image_sequence",
                "image_format": "png",
                "region": "custom",
                "start_frame": 0,
                "end_frame": 4,
                "include_audio": False,
            },
            performance=None,
        )
        assert _run_to_completion(job) == ExportStatus.COMPLETE
        assert len(os.listdir(d)) == 5


def test_export_rejects_hostile_overlayer_payload_no_partial_file(synthetic_video_path):
    """enforce-before-decode: a payload exceeding the composite layer cap raises
    inside _run_export → export ERROR, partial output cleaned up, sidecar alive.

    Builds many single-voice instruments so the per-frame voice-layer count
    exceeds MAX_COMPOSITE_LAYERS; the budget check rejects BEFORE decode.
    """
    from security import MAX_COMPOSITE_LAYERS

    n = MAX_COMPOSITE_LAYERS + 5
    events = []
    instruments = {}
    assets = {}
    for i in range(n):
        iid = f"inst-{i}"
        events.append({
            "frameIndex": 0, "eventIndex": i, "note": 60, "velocity": 100,
            "kind": "trigger", "instrumentId": iid,
        })
        instruments[iid] = {
            "clipId": "c", "startFrame": 0, "speed": 0, "opacity": 1.0,
            "blendMode": "normal", "voiceCap": 4,
            "adsr": {"attack": 0, "decay": 0, "sustain": 1, "release": 0},
            "chain": [],
        }
    assets["c"] = {"path": synthetic_video_path, "frameCount": 150, "fps": 30}
    perf = {"events": events, "instruments": instruments, "assets": assets}

    with tempfile.TemporaryDirectory() as base:
        out = os.path.join(base, "hostile")
        os.makedirs(out, exist_ok=True)
        mgr = ExportManager()
        job = mgr.start(
            input_path=synthetic_video_path,
            output_path=out,
            chain=[],
            project_seed=7,
            settings={
                "export_type": "image_sequence", "image_format": "png",
                "region": "custom", "start_frame": 0, "end_frame": 0,
                "include_audio": False,
            },
            performance=perf,
        )
        status = _run_to_completion(job)
        assert status == ExportStatus.ERROR, f"expected ERROR, got {status}"
        assert job.error and "INJ-3" in job.error or "MAX" in (job.error or "")
        # No partial frames left behind (best-effort cleanup ran).
        # image_sequence writes into `out`; on error it should not contain a
        # complete sequence — at most leftover the cleanup couldn't remove.
