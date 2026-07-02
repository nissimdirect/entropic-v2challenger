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
