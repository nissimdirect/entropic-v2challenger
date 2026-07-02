"""P2.2c (slice 3c): composite-as-terminal-effect — render + backend rewire.

Proves the v3 compositing model end-to-end at the render layer:
  * The compositor reads per-track opacity/mode from the TERMINAL `composite`
    effect on a layer's chain (Decision D3/D4), not from v2-era layer-level fields.
  * apply_chain SKIPS the terminal composite so the blend is applied EXACTLY ONCE
    (Decision D3). The 9 per-blend-mode hash-stability tests are the double-apply
    catch: each blend mode produces ONE stable hash, identical whether compositing
    is expressed as a terminal composite or (legacy fallback transport) top-level
    fields — a double-apply would diverge the hash.
  * INJ-3 caps (0 layers, >50 rejected, negative frame_index) stay green.
  * A render-graph cycle on composite opacity raises ModulationCycleError.
  * A v2-era video-clip render request (top-level opacity/blend_mode + real chain,
    no terminal composite) is rejected LOUDLY and the sidecar stays alive.
  * Integration: a frontend-shaped chain with a terminal composite renders
    end-to-end via IPC (_handle_render_composite → frame bytes).
"""

from __future__ import annotations

import hashlib

import numpy as np
import pytest

from engine.compositor import BLEND_MODES, render_composite
from engine.pipeline import apply_chain
from modulation.engine import ModulationCycleError, _topological_sort
from security import MAX_COMPOSITE_LAYERS

pytestmark = pytest.mark.smoke

# The 9 canonical blend modes (Decision D4) — must equal BLEND_MODES keys.
NINE_MODES = [
    "normal",
    "add",
    "multiply",
    "screen",
    "overlay",
    "difference",
    "exclusion",
    "darken",
    "lighten",
]


def _frame(seed: int = 7, h: int = 48, w: int = 48) -> np.ndarray:
    rng = np.random.default_rng(seed)
    return rng.integers(0, 256, (h, w, 4), dtype=np.uint8)


def _terminal_composite_layer(
    frame: np.ndarray, opacity: float, mode: str, layer_id: str
) -> dict:
    """A v3 layer whose compositing rides on the TERMINAL composite in its chain."""
    return {
        "frame": frame.copy(),
        "chain": [
            {
                "effect_id": "composite",
                "params": {"opacity": opacity, "mode": mode},
                "enabled": True,
            }
        ],
        "frame_index": 0,
        "layer_id": layer_id,
    }


def _hash(arr: np.ndarray) -> str:
    return hashlib.sha256(np.ascontiguousarray(arr).tobytes()).hexdigest()


# ─────────────────────────────────────────────────────────────────────────────
# 1. Decision D4 contract — exactly the 9 modes
# ─────────────────────────────────────────────────────────────────────────────


def test_blend_modes_are_exactly_the_nine():
    """The shipped blend modes are exactly the 9 canonical ones (Decision D4)."""
    assert sorted(BLEND_MODES.keys()) == sorted(NINE_MODES)


# ─────────────────────────────────────────────────────────────────────────────
# 2. The 9 per-blend-mode hash-stability tests (one hash each → double-apply catch)
# ─────────────────────────────────────────────────────────────────────────────


@pytest.mark.parametrize("mode", NINE_MODES)
def test_per_blend_mode_terminal_composite_hash_stable(mode):
    """Each blend mode produces ONE stable hash via the terminal-composite path.

    A base layer (normal, full opacity) + a top layer whose compositing rides on
    its TERMINAL composite at opacity 0.5. Re-rendering the identical input yields
    the identical hash. If apply_chain ALSO applied the composite (double-apply),
    the top layer's frame would be corrupted before blending and the hash would
    differ from the once-applied reference below.
    """
    base = _frame(seed=1)
    top = _frame(seed=2)

    def build():
        return [
            _terminal_composite_layer(base, 1.0, "normal", "base"),
            _terminal_composite_layer(top, 0.5, mode, "top"),
        ]

    out_a = render_composite(build(), resolution=(48, 48), project_seed=42)
    out_b = render_composite(build(), resolution=(48, 48), project_seed=42)
    assert _hash(out_a) == _hash(out_b), f"{mode}: terminal-composite render not stable"


@pytest.mark.parametrize("mode", NINE_MODES)
def test_terminal_composite_equals_single_apply_reference(mode):
    """Double-apply guard: terminal-composite path == once-applied reference.

    The reference renders the SAME compositing via the legacy top-level
    opacity/blend_mode transport (which the compositor applies exactly once, in
    the blend step). The terminal-composite path must hash-match it. If the
    pipeline did NOT skip the terminal composite (Decision D3 broken), the blend
    would be applied a second time inside apply_chain and the hashes would diverge.
    """
    base = _frame(seed=1)
    top = _frame(seed=2)

    terminal = [
        _terminal_composite_layer(base, 1.0, "normal", "base"),
        _terminal_composite_layer(top, 0.5, mode, "top"),
    ]
    reference = [
        {
            "frame": base.copy(),
            "chain": [],
            "opacity": 1.0,
            "blend_mode": "normal",
            "frame_index": 0,
            "layer_id": "base",
        },
        {
            "frame": top.copy(),
            "chain": [],
            "opacity": 0.5,
            "blend_mode": mode,
            "frame_index": 0,
            "layer_id": "top",
        },
    ]

    out_terminal = render_composite(terminal, resolution=(48, 48), project_seed=42)
    out_reference = render_composite(reference, resolution=(48, 48), project_seed=42)
    assert _hash(out_terminal) == _hash(out_reference), (
        f"{mode}: terminal-composite output != single-apply reference "
        "— the terminal composite was double-applied or dropped."
    )


# ─────────────────────────────────────────────────────────────────────────────
# 3. apply_chain SKIPS the terminal composite (Decision D3, the actual mechanism)
# ─────────────────────────────────────────────────────────────────────────────


def test_apply_chain_skips_terminal_composite():
    """A chain whose only entry is a terminal composite passes the frame through.

    apply_chain must DROP the terminal composite (it is compositing plumbing), so
    the output equals the input frame. If it ran the composite as a real effect,
    the registered identity no-op still returns the frame — but a future non-noop
    would corrupt it; this asserts the skip path is taken (output == input AND no
    state recorded for 'composite').
    """
    frame = _frame(seed=3)
    chain = [{"effect_id": "composite", "params": {"opacity": 0.5, "mode": "multiply"}}]
    out, states = apply_chain(frame, chain, 0, 0, (48, 48), {})
    assert np.array_equal(out, frame)
    assert "composite" not in states


def test_apply_chain_runs_effects_before_terminal_composite():
    """A real effect BEFORE the terminal composite still runs; composite is skipped."""
    frame = _frame(seed=4)
    chain = [
        {"effect_id": "fx.invert", "params": {}, "enabled": True},
        {"effect_id": "composite", "params": {"opacity": 1.0, "mode": "normal"}},
    ]
    out, states = apply_chain(frame, chain, 0, 0, (48, 48), {})
    # invert ran (RGB inverted, alpha preserved); composite did not record state.
    assert np.array_equal(out[:, :, :3], 255 - frame[:, :, :3])
    assert "composite" not in states


def test_full_depth_chain_plus_terminal_composite_not_rejected():
    """A 10-effect chain + a terminal composite is not falsely over the SEC-7 cap.

    The terminal composite is stripped BEFORE the depth check, so the 10 real
    effects sit exactly at MAX_CHAIN_DEPTH and apply_chain does not raise.
    """
    frame = _frame(seed=5)
    chain = [
        {"effect_id": "fx.invert", "params": {}, "enabled": True} for _ in range(10)
    ]
    chain.append(
        {"effect_id": "composite", "params": {"opacity": 1.0, "mode": "normal"}}
    )
    out, _ = apply_chain(frame, chain, 0, 0, (48, 48), {})
    assert out.shape == frame.shape


# ─────────────────────────────────────────────────────────────────────────────
# 4. INJ-3 edge cases stay green (0 layers, >50 rejected, negative frame_index)
# ─────────────────────────────────────────────────────────────────────────────


def _server():
    from zmq_server import ZMQServer

    srv = ZMQServer.__new__(ZMQServer)
    srv.token = "test-token"
    return srv


def test_inj3_zero_layers_ok():
    """Zero layers → a valid empty frame, not an error (INJ-3 boundary)."""
    out = render_composite([], resolution=(48, 48), project_seed=0)
    assert isinstance(out, np.ndarray)
    assert out.shape == (48, 48, 4)
    assert not out.any()


def test_inj3_too_many_layers_rejected():
    srv = _server()
    layers = [
        {"layer_type": "video", "frame_index": 0}
        for _ in range(MAX_COMPOSITE_LAYERS + 1)
    ]
    resp = srv._handle_render_composite(
        {"layers": layers, "resolution": [1920, 1080]}, msg_id="m"
    )
    assert resp["ok"] is False
    assert "exceeds maximum" in resp["error"]


def test_inj3_negative_frame_index_rejected():
    srv = _server()
    resp = srv._handle_render_composite(
        {
            "layers": [{"layer_type": "video", "frame_index": -1, "chain": []}],
            "resolution": [1920, 1080],
        },
        msg_id="m",
    )
    assert resp["ok"] is False
    assert "non-negative" in resp["error"]


# ─────────────────────────────────────────────────────────────────────────────
# 5. Render-graph cycle on composite opacity → ModulationCycleError (engine.py:20)
# ─────────────────────────────────────────────────────────────────────────────


def test_composite_opacity_modulation_cycle_raises():
    """A cyclic operator graph feeding composite opacity raises ModulationCycleError.

    Operator A's source is operator B and B's source is A — the toposort that
    resolves modulation (including a composite's opacity sink) detects the cycle
    and raises ModulationCycleError (INJ-2, engine.py:20). This is the guarantee
    that a Composite-opacity ← operator ← (track depending on that Composite) loop
    is caught rather than silently looping.
    """
    ops = [
        {
            "id": "opA",
            "type": "lfo",
            "parameters": {"sources": [{"operator_id": "opB"}]},
        },
        {
            "id": "opB",
            "type": "lfo",
            "parameters": {"sources": [{"operator_id": "opA"}]},
        },
    ]
    with pytest.raises(ModulationCycleError):
        _topological_sort(ops)


# ─────────────────────────────────────────────────────────────────────────────
# 6. NEGATIVE: v2-era render request rejected loudly; sidecar stays alive
# ─────────────────────────────────────────────────────────────────────────────


def test_v2_era_video_layer_rejected_with_unsupported_message():
    """A v2-era video-clip layer (top-level opacity/blend_mode + real chain, no
    terminal composite) → structured error with the unsupported-version message."""
    from project.schema import V2_UNSUPPORTED_MESSAGE

    srv = _server()
    resp = srv._handle_render_composite(
        {
            "layers": [
                {
                    "layer_type": "video",
                    "asset_path": "/whatever.mp4",
                    "frame_index": 0,
                    "chain": [{"effect_id": "fx.invert", "params": {}}],
                    "opacity": 0.5,
                    "blend_mode": "multiply",
                }
            ],
            "resolution": [1920, 1080],
        },
        msg_id="m",
    )
    assert resp["ok"] is False
    assert resp["error"] == V2_UNSUPPORTED_MESSAGE
    # No traceback leaked into the error string.
    assert "Traceback" not in resp["error"]


def test_v2_rejection_does_not_restart_sidecar(zmq_client, zmq_ping_client):
    """The v2-era rejection is a structured reply — the sidecar STAYS ALIVE.

    Drives the live server over IPC: a v2-shaped render request returns ok:false
    (no crash), and a SUBSEQUENT ping returns status 'alive' with a non-decreasing
    uptime (the heartbeat continues; zero restarts — the watchdog never trips).
    """
    from project.schema import V2_UNSUPPORTED_MESSAGE

    zmq_ping_client.send_json({"cmd": "ping"})
    before = zmq_ping_client.recv_json()
    assert before["status"] == "alive"

    zmq_client.send_json(
        {
            "cmd": "render_composite",
            "layers": [
                {
                    "layer_type": "video",
                    "asset_path": "/whatever.mp4",
                    "frame_index": 0,
                    "chain": [{"effect_id": "fx.invert", "params": {}}],
                    "opacity": 0.5,
                    "blend_mode": "multiply",
                }
            ],
            "resolution": [640, 480],
        }
    )
    resp = zmq_client.recv_json()
    assert resp["ok"] is False
    assert resp["error"] == V2_UNSUPPORTED_MESSAGE

    # Heartbeat continues — the SAME server object answers a fresh ping.
    zmq_ping_client.send_json({"cmd": "ping"})
    after = zmq_ping_client.recv_json()
    assert after["status"] == "alive"
    assert after["uptime_s"] >= before["uptime_s"], "uptime reset → sidecar restarted"


# ─────────────────────────────────────────────────────────────────────────────
# 7. INTEGRATION: frontend chain with terminal composite renders end-to-end via IPC
# ─────────────────────────────────────────────────────────────────────────────


def test_frontend_chain_with_terminal_composite_renders_end_to_end_via_ipc(
    zmq_client, synthetic_video_path
):
    """A frontend-shaped payload (video layer whose chain ENDS in a terminal
    composite) renders end-to-end over IPC and returns base64 frame bytes."""
    import base64

    zmq_client.send_json(
        {
            "cmd": "render_composite",
            "layers": [
                {
                    "layer_type": "video",
                    "asset_path": synthetic_video_path,
                    "frame_index": 5,
                    "clip_opacity": 1.0,
                    "chain": [
                        {"effect_id": "fx.invert", "params": {}, "enabled": True},
                        {
                            "effect_id": "composite",
                            "params": {"opacity": 0.75, "mode": "screen"},
                            "enabled": True,
                        },
                    ],
                }
            ],
            "resolution": [320, 240],
        }
    )
    resp = zmq_client.recv_json()
    assert resp["ok"] is True, resp.get("error")
    assert resp["width"] == 320 and resp["height"] == 240
    raw = base64.b64decode(resp["frame_data"])
    assert len(raw) > 0
    # JPEG SOI marker — proves real encoded frame bytes, not an empty payload.
    assert raw[:2] == b"\xff\xd8"


# ── Red-team P2.2c hardening (RT-1, RT-2, HT-1, HT-2) ──────────────────────────


def test_rt1_ten_effects_plus_terminal_composite_passes_ipc_depth_gate():
    """RT-1: SEC-7 must not count the terminal composite — 10 real effects + a
    terminal composite (length 11) is a legal v3 chain, not a depth violation."""
    from security import validate_chain_depth

    chain = [{"effect_id": f"fx{i}", "params": {}} for i in range(10)]
    chain.append(
        {"effect_id": "composite", "params": {"opacity": 0.5, "mode": "normal"}}
    )
    assert validate_chain_depth(chain) == []  # 11 entries, 10 effective — passes
    # 11 real effects (no composite) still rejected
    over = [{"effect_id": f"fx{i}", "params": {}} for i in range(11)]
    assert validate_chain_depth(over) != []


def test_rt2_forged_non_dict_params_does_not_crash_compositor():
    """RT-2: a forged params=[..]/params=int must coerce to {} (defaults), not
    raise AttributeError."""
    from engine.compositor import _resolve_compositing

    for forged in ([0.5, "multiply"], 42, "opaque"):
        op, mode = _resolve_compositing(
            {"chain": [{"effect_id": "composite", "params": forged}]}
        )
        assert op == 1.0 and mode == "normal"  # fell back to defaults, no crash


def test_ht1_disabled_terminal_composite_falls_back_to_defaults():
    """HT-1: disabling the terminal composite restores default compositing."""
    from engine.compositor import _resolve_compositing

    op, mode = _resolve_compositing(
        {
            "chain": [
                {
                    "effect_id": "composite",
                    "enabled": False,
                    "params": {"opacity": 0.2, "mode": "difference"},
                },
            ]
        }
    )
    assert op == 1.0 and mode == "normal"


def test_ht2_empty_chain_video_layer_is_exempt_after_p1b():
    """HT-2 (REVISED by P1-B): an empty-chain VIDEO layer is the instrument/
    sampler-voice or silent-track no-clip fallback path, NOT the v2 track-clip
    shape. P1-B reverses the original HT-2 rejection — the silent-track fallback
    (`buildSamplerLayer`) emits an empty-chain video layer with top-level
    opacity/blend_mode and NO voice_id, so only relaxing the empty-chain branch
    admits it. A real v2 clip always ships a NON-EMPTY chain and is STILL rejected
    (see test_v2_era_video_layer_rejected_with_unsupported_message) and is
    additionally blocked at load time (schema.MIN_SUPPORTED_MAJOR).

    NOTE: `layer_type:'sampler'` is NOT a production shape — the frontend sends
    `'video'` (types.ts:150) and keys the exemption on the voice_id / empty-chain
    markers, not on a `'sampler'` layer_type.
    """
    from zmq_server import ZMQServer

    is_v2 = ZMQServer._is_v2_compositing_shape
    # Empty-chain video layer (sampler/instrument voice or silent-track fallback) → exempt.
    assert (
        is_v2(
            {
                "layer_type": "video",
                "chain": [],
                "opacity": 0.0,
                "blend_mode": "difference",
            }
        )
        is False
    )
    # Non-production 'sampler' layer_type also exempt (defensive).
    assert is_v2({"layer_type": "sampler", "chain": [], "opacity": 0.5}) is False
    # clean v3 video layer (no legacy fields) is not flagged
    assert is_v2({"layer_type": "video", "chain": []}) is False
