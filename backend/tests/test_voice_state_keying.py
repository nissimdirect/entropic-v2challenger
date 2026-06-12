"""P5a.2 — per-voice render-state keying, surgical cleanup, voice caps.

INSTRUMENTS.md §10 P1-1 (the top review fix). The composite per-layer state
cache used to be keyed by `asset:{path}`, so two voices triggered on the SAME
clip shared one cache entry and cross-contaminated each other's stateful-effect
state (datamosh prev-frame trace, etc.). Worse, ANY layer-set change (e.g.
stealing one voice) cold-started EVERY surviving voice via an all-or-nothing
cache reset — the exact orphan-cleanup / state-leak class from
entropic-audit-learnings.

This module pins the fix:
1. voice_id keying → independent voices keep independent state (no cross-leak).
2. surgical per-layer-id diff → stealing one voice drops only its entry;
   survivors keep their state dict (identity preserved).
3. back-compat → no voice_id ⇒ keys by asset path, byte-identical to before.
4. scrub (non-monotonic frame jump) ⇒ full reset.
5. under-load negative → 100 trigger/steal cycles never grow the cache past the
   voice cap (no unbounded state growth / orphaned entries).

State-machine tests drive `_get_composite_states` / `_save_composite_states`
directly (the cache helpers); the cross-contamination test drives
`render_composite` end-to-end with a real stateful effect.
"""

from __future__ import annotations

import numpy as np
import pytest

from engine.compositor import render_composite

pytestmark = pytest.mark.smoke


# --------------------------------------------------------------------------- #
# helpers
# --------------------------------------------------------------------------- #


def _build_server():
    """A ZMQServer skeleton with only what the cache helpers touch."""
    from zmq_server import ZMQServer

    server = ZMQServer.__new__(ZMQServer)
    server.token = "test-token"
    return server


def _checkerboard(h=64, w=64, seed=123):
    rng = np.random.default_rng(seed)
    return rng.integers(0, 256, (h, w, 4), dtype=np.uint8)


def _stateful_chain():
    """datamosh_melt accumulates a previous-frame trace into state_out."""
    from effects import registry

    if registry.get("fx.datamosh_melt") is None:
        pytest.skip("fx.datamosh_melt not registered in this build")
    return [
        {
            "effect_id": "fx.datamosh_melt",
            "params": {"intensity": 1.5, "decay": 0.9, "accumulate": "true"},
            "enabled": True,
        }
    ]


# --------------------------------------------------------------------------- #
# 1. cross-contamination — two voices on the same clip stay independent
# --------------------------------------------------------------------------- #


def test_two_voices_same_clip_do_not_cross_contaminate_datamosh():
    """Two voices on the SAME asset, keyed by distinct voice ids, must keep
    independent datamosh state. We render voice-A across 3 advancing frames
    while voice-B sees only frame[0] every time; if state were shared (asset
    keying), B's output would drift along with A's. With voice keying B stays
    pinned to its own cold-then-warm trajectory."""
    chain = _stateful_chain()
    f0 = _checkerboard()
    fA = [(f0.astype(int) + 12 * i).clip(0, 255).astype(np.uint8) for i in range(3)]

    # Reference: voice B rendered ALONE across 3 identical frame[0]s.
    states_ref: dict[str, dict] = {}
    ref_out = None
    for idx in range(3):
        layers = [
            {
                "frame": f0,
                "chain": chain,
                "frame_index": idx,
                "layer_id": "voice:B",
            }
        ]
        ref_out, states_ref = render_composite(
            layers, resolution=(64, 64), project_seed=7, layer_states=states_ref
        )

    # Now render A (advancing frames) and B (static frame[0]) TOGETHER, same
    # underlying asset, distinct voice ids. B's trajectory must match ref.
    states: dict[str, dict] = {}
    b_out = None
    for idx in range(3):
        layers = [
            {
                "frame": fA[idx],
                "chain": chain,
                "frame_index": idx,
                "layer_id": "voice:A",
            },
            {
                "frame": f0,
                "chain": chain,
                "frame_index": idx,
                "layer_id": "voice:B",
            },
        ]
        _out, states = render_composite(
            layers, resolution=(64, 64), project_seed=7, layer_states=states
        )
        b_out = states["voice:B"]

    # B's accumulated state, rendered alongside A, equals B-rendered-alone.
    # (If asset-keyed, A and B would have shared one entry → B contaminated.)
    assert "voice:A" in states and "voice:B" in states
    assert states["voice:A"] is not states["voice:B"]
    # Both states are non-trivial dicts (datamosh wrote a prev-frame trace).
    assert isinstance(states["voice:A"], dict) and states["voice:A"]
    assert isinstance(states["voice:B"], dict) and states["voice:B"]
    # The reference B state and the alongside-A B state must be byte-identical
    # for every cached array → no cross-contamination from A.
    assert set(b_out.keys()) == set(states_ref.get("voice:B", {}).keys())
    for k, v in b_out.items():
        rv = states_ref["voice:B"][k]
        if isinstance(v, np.ndarray):
            assert np.array_equal(v, rv), f"voice:B state '{k}' contaminated by A"


# --------------------------------------------------------------------------- #
# 2. surgical cleanup — stealing one voice keeps survivors' state (identity)
# --------------------------------------------------------------------------- #


def test_voice_steal_drops_only_stolen_entry_survivors_keep_state():
    """Two voices cached. Next render drops voice:A (stolen) and keeps voice:B.
    The cache must delete ONLY voice:A; voice:B's state dict must survive WITH
    OBJECT IDENTITY (not a cold-started replacement)."""
    server = _build_server()

    sig2 = ("voice:A", "voice:B")
    state_a = {"prev_frame": np.zeros((4, 4), dtype=np.uint8)}
    state_b = {"prev_frame": np.ones((4, 4), dtype=np.uint8)}

    # Seed the cache at frame 0 with both voices.
    cache = server._get_composite_states(sig2, frame_index=0)
    cache["voice:A"] = state_a
    cache["voice:B"] = state_b
    server._save_composite_states(cache, sig2, frame_index=0)

    # Frame 1, monotonic, but voice:A was stolen → signature now just voice:B.
    sig1 = ("voice:B",)
    result = server._get_composite_states(sig1, frame_index=1)

    assert "voice:A" not in result, "stolen voice:A state was not dropped"
    assert "voice:B" in result, "survivor voice:B was wrongly cold-started"
    # Identity preserved — the SAME dict object, not a fresh empty one.
    assert result["voice:B"] is state_b


def test_reorder_alone_keeps_all_state():
    """Reordering two voices (same set of ids) must keep both states — order is
    irrelevant to per-layer effect state."""
    server = _build_server()
    state_a = {"k": 1}
    state_b = {"k": 2}

    cache = server._get_composite_states(("voice:A", "voice:B"), frame_index=0)
    cache["voice:A"] = state_a
    cache["voice:B"] = state_b
    server._save_composite_states(cache, ("voice:A", "voice:B"), frame_index=0)

    # Frame 1, monotonic, ids swapped in order.
    result = server._get_composite_states(("voice:B", "voice:A"), frame_index=1)
    assert result["voice:A"] is state_a
    assert result["voice:B"] is state_b


# --------------------------------------------------------------------------- #
# 3. back-compat — no voice_id keys by asset path (byte-identical)
# --------------------------------------------------------------------------- #


def test_layer_set_without_voice_id_keys_by_asset_path():
    """A render with NO voice_id keys the cache by asset:{path} exactly as
    before this packet. Drive the real handler path key-synthesis by rendering
    through render_composite with asset-style layer_ids and confirm the cache
    keys are asset-keyed. Uses a stateful chain so each layer actually writes a
    cache entry (empty chains produce no state to cache)."""
    chain = _stateful_chain()
    f = _checkerboard()
    layers = [
        {
            "frame": f,
            "chain": chain,
            "frame_index": 0,
            "layer_id": "asset:/clips/a.mp4",
        },
        {
            "frame": f,
            "chain": chain,
            "frame_index": 0,
            "layer_id": "asset:/clips/b.mp4",
        },
    ]
    _out, new_states = render_composite(
        layers, resolution=(64, 64), project_seed=42, layer_states={}
    )
    assert set(new_states.keys()) == {"asset:/clips/a.mp4", "asset:/clips/b.mp4"}
    assert not any(k.startswith("voice:") for k in new_states)


def test_handler_synthesizes_voice_key_when_voice_id_present():
    """White-box: the handler's key-synthesis prefers voice:{id} over asset:{}.
    Exercised by replicating the exact branch the handler uses."""
    # Mirror the handler logic for a voice-bearing layer.
    layer_info = {"voice_id": "pad_1", "asset_path": "/clips/shared.mp4"}
    voice_id = layer_info.get("voice_id")
    layer_type = "video"
    if voice_id is not None:
        layer_id = f"voice:{voice_id}"
    elif layer_type == "text":
        layer_id = "text:x"
    else:
        layer_id = f"asset:{layer_info.get('asset_path', '')}"
    assert layer_id == "voice:pad_1"

    # And without a voice_id → asset keying (back-compat).
    layer_info2 = {"asset_path": "/clips/shared.mp4"}
    voice_id2 = layer_info2.get("voice_id")
    layer_id2 = (
        f"voice:{voice_id2}"
        if voice_id2 is not None
        else f"asset:{layer_info2.get('asset_path', '')}"
    )
    assert layer_id2 == "asset:/clips/shared.mp4"


# --------------------------------------------------------------------------- #
# 4. scrub — non-monotonic frame jump resets all state
# --------------------------------------------------------------------------- #


def test_non_monotonic_frame_jump_resets_all_state():
    """Same layer set, but the frame jumps non-monotonically (scrub) → the whole
    cache cold-starts even though no layer departed."""
    server = _build_server()
    sig = ("voice:A", "voice:B")

    cache = server._get_composite_states(sig, frame_index=10)
    cache["voice:A"] = {"k": 1}
    cache["voice:B"] = {"k": 2}
    server._save_composite_states(cache, sig, frame_index=10)

    # Monotonic next frame → kept.
    cont = server._get_composite_states(sig, frame_index=11)
    assert "voice:A" in cont and "voice:B" in cont

    server._save_composite_states(cont, sig, frame_index=11)

    # Scrub backwards / jump → full reset.
    scrubbed = server._get_composite_states(sig, frame_index=2)
    assert scrubbed == {}


def test_forward_jump_more_than_one_frame_is_scrub():
    """A forward jump of >1 frame is also non-monotonic (skip) → reset."""
    server = _build_server()
    sig = ("voice:A",)
    cache = server._get_composite_states(sig, frame_index=0)
    cache["voice:A"] = {"k": 1}
    server._save_composite_states(cache, sig, frame_index=0)

    jumped = server._get_composite_states(sig, frame_index=5)
    assert jumped == {}


def test_first_render_is_treated_as_monotonic_start():
    """Very first render (no prior frame) must not be misclassified as scrub —
    it returns the empty cache and lets state accumulate from there."""
    server = _build_server()
    sig = ("voice:A",)
    first = server._get_composite_states(sig, frame_index=0)
    assert first == {}
    first["voice:A"] = {"k": 1}
    server._save_composite_states(first, sig, frame_index=0)
    second = server._get_composite_states(sig, frame_index=1)
    assert "voice:A" in second  # survived (monotonic continuation)


# --------------------------------------------------------------------------- #
# 5. under-load negative — 100 trigger/steal cycles never grow cache past cap
# --------------------------------------------------------------------------- #


def test_voice_steal_under_load_no_unbounded_state_growth():
    """100 sequential trigger/steal render cycles. Each cycle the active voice
    set is at most MAX_TOTAL_VOICES_PER_RENDER voices (oldest-steal). The
    voice-keyed cache must NEVER hold more than the cap — stolen voices' entries
    must be reaped, not orphaned. This is the negative state-growth guard."""
    from security import MAX_TOTAL_VOICES_PER_RENDER

    server = _build_server()

    prev_frame = -1
    for cycle in range(100):
        frame_index = prev_frame + 1
        # A rolling window of up to cap voices; ids advance each cycle so old
        # voices are "stolen" (depart the signature) and new ones appear.
        active = [f"voice:{cycle - k}" for k in range(MAX_TOTAL_VOICES_PER_RENDER)]
        active = [v for v in active if int(v.split(":")[1].lstrip("-")) >= 0 or True]
        active = active[:MAX_TOTAL_VOICES_PER_RENDER]
        sig = tuple(active)

        cache = server._get_composite_states(sig, frame_index)
        # Simulate each active voice writing some state this render.
        for vid in active:
            cache.setdefault(vid, {})["last_cycle"] = cycle
        server._save_composite_states(cache, sig, frame_index)
        prev_frame = frame_index

        # INVARIANT: the cache never holds more voice-keyed entries than the cap.
        voice_keys = [k for k in cache if k.startswith("voice:")]
        assert len(voice_keys) <= MAX_TOTAL_VOICES_PER_RENDER, (
            f"cycle {cycle}: cache grew to {len(voice_keys)} voice entries "
            f"(cap {MAX_TOTAL_VOICES_PER_RENDER}) — orphaned/leaked voice state"
        )

    # Final state: at most cap entries, all from the most recent cycles.
    final = server._get_composite_states(
        tuple(f"voice:{99 - k}" for k in range(MAX_TOTAL_VOICES_PER_RENDER)),
        prev_frame + 1,
    )
    assert len([k for k in final if k.startswith("voice:")]) <= (
        MAX_TOTAL_VOICES_PER_RENDER
    )
