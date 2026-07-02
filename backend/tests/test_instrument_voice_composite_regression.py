"""P1-B regression — instrument/rack/group VOICE layers must NOT trip the
v2-compositing guard.

Root cause (UAT 2026-06-17): the render-time guard `_is_v2_compositing_shape`
(`zmq_server.py`) rejected the ENTIRE preview render with the misleading
"v2 projects unsupported" toast for any `layer_type:'video'` layer that carries
top-level `opacity`/`blend_mode` and either an empty chain OR a non-empty chain
with no terminal `composite`. The instrument/rack voice-layer builders emit
exactly that shape:
  * `computeSamplerVoice.ts:322-329` (+ `buildSamplerLayer.ts:111` voice_id) →
    `{layer_type:'video', chain:[], opacity, blend_mode, voice_id}` (empty chain)
  * `buildRackLayers.ts:160-174` → same + `chain: pad.chain` (non-empty insert
    chain, no terminal composite) the instant a user adds an effect to a rack pad.
Export bypasses the guard, so the SAME project exported fine but preview failed.

Fix (P1): a positive VOICE-MARKER exemption at the guard (`voice_id`, or a
`voice:`/`framebank:` `layer_id`) + a relaxed empty-chain branch (the silent-track
fallback `buildSamplerLayer` emits NO voice_id). A genuine v2 CLIP (no voice
marker, non-empty chain, top-level opacity/blend, no terminal composite) is STILL
rejected — and is additionally blocked at LOAD time (`schema.MIN_SUPPORTED_MAJOR`).

These land RED against the pre-fix guard and flip GREEN when P1 lands.

Layer coverage: (A) handler-gate static classification + genuine-v2 handler
rejection, (B) end-to-end IPC render, (C) pixel oracle — parametrized across
flat-sampler / rack-pad / group-leaf voice shapes.
"""

from __future__ import annotations

import base64
import hashlib

import pytest

from project.schema import V2_UNSUPPORTED_MESSAGE

pytestmark = pytest.mark.smoke


def _server():
    """Bare server for direct handler/guard calls (mirror test_composite_render_terminal:213)."""
    from zmq_server import ZMQServer

    srv = ZMQServer.__new__(ZMQServer)
    srv.token = "test-token"
    return srv


# ─────────────────────────────────────────────────────────────────────────────
# Frontend-shaped voice-layer builders (the EXACT dicts the builders emit).
# ─────────────────────────────────────────────────────────────────────────────

_INVERT_CHAIN = [{"effect_id": "fx.invert", "params": {}, "enabled": True}]


def _voice(kind, *, asset_path=None, chain=None, opacity=0.8, blend="normal"):
    """A voice layer as emitted by the frontend builders, keyed by marker `kind`.

    flat_sampler → buildVoiceLayers (voice_id, no layer_id)
    rack_pad     → buildRackLayers flat path (voice_id + per-pad insert chain)
    group_leaf   → nested rack leaf (voice_id + `voice:`-prefixed layer_id)
    framebank    → resolve_frame_bank_layer (voice_id `framebank_*`)
    granulator   → granulator arm (voice_id `gran_*` + `granulator:` layer_id)
    """
    layer = {
        "layer_type": "video",
        "frame_index": 0,
        "chain": [] if chain is None else chain,
        "opacity": opacity,
        "blend_mode": blend,
    }
    if asset_path is not None:
        layer["asset_path"] = asset_path
    if kind == "flat_sampler":
        layer["voice_id"] = "voice_sampler-1_30_7"
    elif kind == "rack_pad":
        layer["voice_id"] = "voice_rack-1_pad2_30_7"
    elif kind == "group_leaf":
        layer["voice_id"] = "voice_branch0_leaf1_30_7"
        layer["layer_id"] = "voice:branch0_leaf1"
    elif kind == "framebank":
        layer["voice_id"] = "framebank_fb1"
    elif kind == "granulator":
        layer["voice_id"] = "gran_inst1"
        layer["layer_id"] = "granulator:gran_inst1"
    else:  # pragma: no cover - guard against a typo'd kind
        raise ValueError(f"unknown voice kind {kind!r}")
    return layer


def _genuine_v2_clip(asset_path="/whatever.mp4"):
    """Real pre-v3 track-clip shape: NO voice marker, non-empty chain, top-level
    opacity/blend_mode, no terminal composite → must STILL reject."""
    return {
        "layer_type": "video",
        "asset_path": asset_path,
        "frame_index": 0,
        "chain": [{"effect_id": "fx.invert", "params": {}}],
        "opacity": 0.5,
        "blend_mode": "multiply",
    }


def _clip_with_clip_opacity(asset_path="/whatever.mp4"):
    """A legitimate v3 CLIP layer: carries a real chain + `clip_opacity` (NOT
    top-level opacity/blend_mode) and no voice marker → must NOT be flagged v2
    (false-positive guard)."""
    return {
        "layer_type": "video",
        "asset_path": asset_path,
        "frame_index": 0,
        "chain": [{"effect_id": "fx.invert", "params": {}}],
        "clip_opacity": 1.0,
    }


VOICE_KINDS = ["flat_sampler", "rack_pad", "group_leaf", "framebank", "granulator"]
RENDER_KINDS = ["flat_sampler", "rack_pad", "group_leaf"]


# ─────────────────────────────────────────────────────────────────────────────
# (A) Handler-gate — static guard classification + genuine-v2 handler rejection.
# ─────────────────────────────────────────────────────────────────────────────


@pytest.mark.parametrize("kind", VOICE_KINDS)
def test_a_guard_exempts_voice_layers(kind):
    """Every voice-marked layer the frontend/backend emit is exempt from the guard.

    rack_pad/group_leaf carry a non-empty per-pad insert chain (no terminal
    composite) — the exact shape that regressed when a user added an effect to a
    pad. framebank/granulator carry an empty chain but a voice_id marker; they are
    safe today only by APPEND-ORDER (they are appended after the guard loop) — this
    pins the exemption by DESIGN so a future refactor that moves the guard is caught.
    """
    from zmq_server import ZMQServer

    chain = _INVERT_CHAIN if kind in ("rack_pad", "group_leaf") else []
    layer = _voice(kind, chain=chain)
    assert ZMQServer._is_v2_compositing_shape(layer) is False


def test_a_guard_exempts_empty_chain_video_fallback():
    """The silent-track fallback (`buildSamplerLayer`) emits an empty-chain video
    layer with top-level opacity/blend_mode but NO voice_id — the voice-marker
    exemption can't catch it, only the relaxed empty-chain branch (STEP 2)."""
    from zmq_server import ZMQServer

    layer = {
        "layer_type": "video",
        "frame_index": 0,
        "chain": [],
        "opacity": 0.8,
        "blend_mode": "normal",
    }
    assert ZMQServer._is_v2_compositing_shape(layer) is False


def test_a_guard_false_positive_clip_with_clip_opacity():
    """A legitimate v3 CLIP (chain + clip_opacity, no top-level fields, no marker)
    is not mistaken for v2. Green before AND after the fix — pins correct behavior."""
    from zmq_server import ZMQServer

    assert ZMQServer._is_v2_compositing_shape(_clip_with_clip_opacity()) is False


def test_a_guard_still_rejects_genuine_v2_clip():
    """A genuine v2 clip shape is STILL classified as v2 (the fix must not over-exempt)."""
    from zmq_server import ZMQServer

    assert ZMQServer._is_v2_compositing_shape(_genuine_v2_clip()) is True


def test_a_handler_still_rejects_genuine_v2_clip():
    """The render handler still returns the unsupported-version error for a genuine
    v2 clip shape (defense-in-depth over the load-time gate)."""
    srv = _server()
    resp = srv._handle_render_composite(
        {"layers": [_genuine_v2_clip()], "resolution": [640, 480]}, msg_id="m"
    )
    assert resp["ok"] is False
    assert resp["error"] == V2_UNSUPPORTED_MESSAGE
    assert "Traceback" not in resp["error"]


# ─────────────────────────────────────────────────────────────────────────────
# (B) End-to-end IPC — a voice layer renders over the live sidecar → JPEG bytes.
# ─────────────────────────────────────────────────────────────────────────────


@pytest.mark.parametrize("kind", RENDER_KINDS)
def test_b_voice_layer_renders_end_to_end_via_ipc(
    zmq_client, synthetic_video_path, kind
):
    """A frontend-shaped voice layer (video + top-level opacity/blend + voice
    marker; rack_pad/group_leaf also carry an `fx.invert` insert chain) renders
    end-to-end over IPC and returns real base64 JPEG frame bytes."""
    chain = _INVERT_CHAIN if kind in ("rack_pad", "group_leaf") else []
    layer = _voice(kind, asset_path=synthetic_video_path, chain=chain, opacity=0.8)
    zmq_client.send_json(
        {"cmd": "render_composite", "layers": [layer], "resolution": [320, 240]}
    )
    resp = zmq_client.recv_json()
    assert resp["ok"] is True, resp.get("error")
    assert resp["width"] == 320 and resp["height"] == 240
    raw = base64.b64decode(resp["frame_data"])
    assert len(raw) > 0
    assert raw[:2] == b"\xff\xd8"  # JPEG SOI — proves real encoded pixels


# ─────────────────────────────────────────────────────────────────────────────
# (C) Pixel oracle — the exempted voice layer's CHAIN is actually applied.
# ─────────────────────────────────────────────────────────────────────────────


def _render_ipc(zmq_client, layer, res=(320, 240)):
    zmq_client.send_json(
        {"cmd": "render_composite", "layers": [layer], "resolution": list(res)}
    )
    resp = zmq_client.recv_json()
    assert resp["ok"] is True, resp.get("error")
    raw = base64.b64decode(resp["frame_data"])
    assert raw[:2] == b"\xff\xd8"
    return raw


@pytest.mark.parametrize("kind", RENDER_KINDS)
def test_c_pixel_oracle_voice_chain_applied(zmq_client, synthetic_video_path, kind):
    """Deterministic oracle: the SAME voice layer rendered WITH `fx.invert` vs
    WITHOUT must produce DIFFERENT frames. Comparing two real renders (not
    source-vs-render) isolates the effect from JPEG compression noise and proves
    the previously-REJECTED voice layer now renders its chain rather than being
    silently dropped."""
    inverted = _voice(kind, asset_path=synthetic_video_path, chain=_INVERT_CHAIN)
    plain = _voice(kind, asset_path=synthetic_video_path, chain=[])
    out_inv = _render_ipc(zmq_client, inverted)
    out_plain = _render_ipc(zmq_client, plain)
    assert hashlib.sha256(out_inv).digest() != hashlib.sha256(out_plain).digest(), (
        "fx.invert produced no pixel change → the exempted voice layer's chain "
        "was not applied"
    )


# ─────────────────────────────────────────────────────────────────────────────
# (D) Redteam pre-merge hardening. The guard is a shape CLASSIFIER, not a security
# boundary: a forged voice-marker on a genuine v2 clip is exempted, but STILL
# renders correctly via the clamped compositor fallback (`_resolve_compositing`) —
# identical v2/v3 semantics. The real boundary is the 127.0.0.1 + per-session
# token-auth ZMQ endpoint (see _is_v2_compositing_shape docstring). These tests pin
# that: exempt-and-render-correctly, validator-runs-before-guard, malformed inputs
# stay graceful with the sidecar alive, and preview == export.
# ─────────────────────────────────────────────────────────────────────────────


def _v3_terminal_reference(asset_path, *, frame_index, opacity, mode):
    """The v3-AUTHORITATIVE expression of the same compositing: a video CLIP whose
    chain ends in a terminal composite (opacity/mode authoritative), fx.invert
    before it, clip_opacity 1.0, NO top-level opacity/blend, NO voice marker. The
    guard exempts it (terminal composite present) and `_resolve_compositing` reads
    the SAME (opacity, mode) the top-level fallback would → byte-identical render."""
    return {
        "layer_type": "video",
        "asset_path": asset_path,
        "frame_index": frame_index,
        "clip_opacity": 1.0,
        "chain": [
            {"effect_id": "fx.invert", "params": {}, "enabled": True},
            {
                "effect_id": "composite",
                "params": {"opacity": opacity, "mode": mode},
                "enabled": True,
            },
        ],
    }


def _forged_v2_clip(
    asset_path, *, frame_index, opacity, mode, voice_id=None, layer_id=None
):
    """A genuine v2 clip shape (non-empty chain, top-level opacity/blend, no terminal
    composite) wearing a FORGED voice marker."""
    layer = {
        "layer_type": "video",
        "asset_path": asset_path,
        "frame_index": frame_index,
        "chain": [{"effect_id": "fx.invert", "params": {}, "enabled": True}],
        "opacity": opacity,
        "blend_mode": mode,
    }
    if voice_id is not None:
        layer["voice_id"] = voice_id
    if layer_id is not None:
        layer["layer_id"] = layer_id
    return layer


def test_d1_forged_voice_id_on_v2_clip_exempts_and_renders_correctly(
    zmq_client, synthetic_video_path
):
    """(1) A forged BUT well-formed voice_id on a genuine v2 clip (non-empty chain +
    top-level opacity/blend + real asset) is exempted by the guard AND renders
    byte-IDENTICALLY to the v3-authoritative terminal-composite expression of the
    same compositing. The forged marker cannot yield a wrong/malicious result — the
    clamped `_resolve_compositing` fallback renders it correctly."""
    from zmq_server import ZMQServer

    forged = _forged_v2_clip(
        synthetic_video_path,
        frame_index=5,
        opacity=0.5,
        mode="normal",
        voice_id="voice_forged_but_valid_1",
    )
    # Guard exempts the forged shape (marker wins over the v2 video-shape branch).
    assert ZMQServer._is_v2_compositing_shape(forged) is False

    reference = _v3_terminal_reference(
        synthetic_video_path, frame_index=5, opacity=0.5, mode="normal"
    )
    out_forged = _render_ipc(zmq_client, forged)
    out_reference = _render_ipc(zmq_client, reference)
    assert (
        hashlib.sha256(out_forged).digest() == hashlib.sha256(out_reference).digest()
    ), (
        "forged-marker v2 clip did not render byte-equal to the legitimate v3 "
        "terminal-composite expression → the clamped fallback is not equivalent"
    )


def test_d2_forged_layer_id_evades_voice_validation_still_renders_correctly(
    zmq_client, synthetic_video_path
):
    """(2) A forged `layer_id:'voice:x'` with NO voice_id EVADES validate_voice_layers
    (which only inspects voice_id-bearing layers — security.py) yet the guard still
    exempts it (voice: prefix). It renders correctly via the clamped fallback,
    byte-equal to the v3 reference. A broader exemption surface — but not
    exploitable, because admission != a wrong render."""
    from security import validate_voice_layers
    from zmq_server import ZMQServer

    forged = _forged_v2_clip(
        synthetic_video_path,
        frame_index=5,
        opacity=0.5,
        mode="normal",
        layer_id="voice:forged_x",
    )
    # No voice_id → the voice-layer validator ignores it entirely (evasion).
    assert validate_voice_layers([forged]) == []
    # Guard exempts on the layer_id marker.
    assert ZMQServer._is_v2_compositing_shape(forged) is False

    reference = _v3_terminal_reference(
        synthetic_video_path, frame_index=5, opacity=0.5, mode="normal"
    )
    out_forged = _render_ipc(zmq_client, forged)
    out_reference = _render_ipc(zmq_client, reference)
    assert hashlib.sha256(out_forged).digest() == hashlib.sha256(out_reference).digest()


def test_d3_non_string_voice_id_rejected_by_validator_before_guard():
    """(3) Ordering pin: a NON-STRING voice_id (int) on a v2 clip is rejected by
    validate_voice_layers in the handler — which runs BEFORE the guard exemption
    could fire — so it is neither exempted nor rendered. The specific voice_id-type
    error (NOT the v2 message) proves the validator wins the ordering."""
    srv = _server()
    bad = _forged_v2_clip("/whatever.mp4", frame_index=5, opacity=0.5, mode="normal")
    bad["voice_id"] = 123  # non-string → validate_voice_layers rejects pre-guard
    resp = srv._handle_render_composite(
        {"layers": [bad], "resolution": [320, 240]}, msg_id="m"
    )
    assert resp["ok"] is False
    assert "voice_id must be a string" in resp["error"]
    # Not the v2 rejection and not an exempt-then-render — the validator ran first.
    assert resp["error"] != V2_UNSUPPORTED_MESSAGE


@pytest.mark.parametrize(
    "bad_field",
    [
        {"frame_index": "abc"},
        {"chain": None},
        {"chain": 42},
        {"__no_asset__": True},  # missing asset_path → silent-track skip
    ],
)
def test_d4_malformed_empty_chain_shape_is_graceful_and_sidecar_survives(
    zmq_client, zmq_ping_client, synthetic_video_path, bad_field
):
    """(4) The newly-admitted empty-chain shape with a MALFORMED field is handled
    gracefully — a structured ok:false reject (no traceback leak) OR a silent-track
    skip when asset_path is absent — and the sidecar STAYS ALIVE: a follow-up ping
    still returns 'alive' with non-decreasing uptime (no crash, watchdog never
    trips)."""
    zmq_ping_client.send_json({"cmd": "ping"})
    before = zmq_ping_client.recv_json()
    assert before["status"] == "alive"

    layer = {
        "layer_type": "video",
        "asset_path": synthetic_video_path,
        "frame_index": 0,
        "chain": [],
        "opacity": 0.5,
        "blend_mode": "normal",
    }
    if "__no_asset__" in bad_field:
        layer.pop("asset_path")
    else:
        layer.update(bad_field)

    zmq_client.send_json(
        {"cmd": "render_composite", "layers": [layer], "resolution": [320, 240]}
    )
    resp = zmq_client.recv_json()
    # A structured JSON response came back (not a hang / crash).
    assert "ok" in resp
    if layer.get("asset_path") is None:
        # No asset → the layer is skipped → empty composite renders ok:true.
        assert resp["ok"] is True
    else:
        # Malformed field → graceful structured reject (no traceback leak).
        assert resp["ok"] is False
        assert "Traceback" not in str(resp.get("error", ""))

    # Sidecar heartbeat continues — the SAME server answers a fresh ping.
    zmq_ping_client.send_json({"cmd": "ping"})
    after = zmq_ping_client.recv_json()
    assert after["status"] == "alive"
    assert after["uptime_s"] >= before["uptime_s"], "uptime reset → sidecar restarted"


def test_d5_preview_export_parity_empty_chain_voice_and_silent_fallback(
    zmq_client, synthetic_video_path
):
    """(5) Preview/export parity. (a) An empty-chain VOICE layer (voice_id) and the
    silent-track FALLBACK (no voice_id, identical fields) render byte-IDENTICALLY —
    the voice marker never leaks into the pixels, and both are admitted at preview.
    (b) The compositor/export entry point `render_composite` (called directly by
    export.py, guard-free) accepts the same empty-chain voice shape with no shape
    rejection — export can never shape-reject what preview now admits."""
    voice = _voice(
        "flat_sampler",
        asset_path=synthetic_video_path,
        chain=[],
        opacity=0.5,
        blend="normal",
    )
    fallback = {
        "layer_type": "video",
        "asset_path": synthetic_video_path,
        "frame_index": 0,
        "chain": [],
        "opacity": 0.5,
        "blend_mode": "normal",
    }
    out_voice = _render_ipc(zmq_client, voice)
    out_fallback = _render_ipc(zmq_client, fallback)
    assert (
        hashlib.sha256(out_voice).digest() == hashlib.sha256(out_fallback).digest()
    ), (
        "voice-marked and silent-track-fallback layers with identical compositing "
        "rendered differently → the marker leaked into the pixels"
    )

    # (b) EXPORT path: render_composite is guard-free and must accept the shape.
    import numpy as np

    from engine.compositor import render_composite

    frame = np.full((16, 16, 4), 200, dtype=np.uint8)
    export_layer = {
        "frame": frame,
        "chain": [],
        "opacity": 0.5,
        "blend_mode": "normal",
        "frame_index": 0,
        "layer_id": "x",
        "voice_id": "voice_export_parity_1",
    }
    out = render_composite([export_layer], resolution=(16, 16), project_seed=0)
    assert isinstance(out, np.ndarray) and out.shape == (16, 16, 4)
