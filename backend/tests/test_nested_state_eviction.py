"""B5.3 (#69 — the Hidden Tiger) — nested composite-state eviction fix.

Once branch pads fire in PREVIEW, the per-frame composite state cache
(`ZMQServer._get_composite_states`) evicts any cached key NOT in the per-frame
`layer_signature`. That signature is built BEFORE group expansion, so a
top-level group contributes ONLY its own `group:{group_id}` id — NOT the NESTED
descendant keys (`voice:{path}` leaves / nested `group:{path}` branch-chain keys)
that `expand_group_layer` actually writes. Without the fix those nested keys are
dropped EVERY frame → nested stateful effects reset per-frame.

The fix (`collect_group_state_keys` + `extra_live_ids`): the nested descendant
keys are UNIONED into the eviction live-id set, so a key written THIS frame
survives into the next.

GATES proven here:
  * Gate 3 (#69 HARD ORACLE): a nested branch child's state key SURVIVES across
    ≥2 consecutive preview frames. FAIL-BEFORE (top-level-signature eviction
    drops the nested key) / PASS-AFTER (retained).
  * Gate 4 (FLAT EVICTION UNCHANGED): a flat-only render (no groups) evicts
    stale keys EXACTLY as before — add a flat layer then remove it → evicted;
    reorder → retained. Byte-identical to pre-B5.3 (extra_live_ids defaults None).
"""

from __future__ import annotations

import pytest

from engine.composite_tree import collect_group_state_keys

pytestmark = pytest.mark.smoke


def _build_server():
    """A ZMQServer skeleton with only what the cache helpers touch (no socket)."""
    from zmq_server import ZMQServer

    server = ZMQServer.__new__(ZMQServer)
    server.token = "test-token"
    return server


# --------------------------------------------------------------------------- #
# collect_group_state_keys — the exact keys expand_group_layer writes
# --------------------------------------------------------------------------- #


def test_collect_keys_one_level_branch():
    """A group with two leaf-voice children → its own group key + both voice keys."""
    group = {
        "layer_type": "group",
        "group_id": "b0",
        "children": [
            {"voice_id": "b0_csa"},
            {"voice_id": "b0_csb"},
        ],
    }
    keys = collect_group_state_keys(group)
    assert keys == {"group:b0", "voice:b0_csa", "voice:b0_csb"}


def test_collect_keys_recurses_nested_groups():
    """A nested group → every descendant group key + leaf voice key, path-from-root."""
    group = {
        "layer_type": "group",
        "group_id": "b0",
        "children": [
            {
                "layer_type": "group",
                "group_id": "b0_b0",
                "children": [{"voice_id": "b0_b0_leaf"}],
            },
            {"voice_id": "b0_top"},
        ],
    }
    keys = collect_group_state_keys(group)
    assert keys == {
        "group:b0",
        "group:b0_b0",
        "voice:b0_b0_leaf",
        "voice:b0_top",
    }


def test_collect_keys_ignores_non_group():
    """A non-group layer contributes no keys (defensive)."""
    assert collect_group_state_keys({"layer_type": "video", "voice_id": "x"}) == set()


# --------------------------------------------------------------------------- #
# Gate 3 (#69 HARD ORACLE) — nested state SURVIVES ≥2 frames
# --------------------------------------------------------------------------- #


def test_nested_state_key_survives_across_frames_pass_after():
    """The #69 fix: a nested child's state key is RETAINED frame-to-frame.

    The top-level signature is just the group's own id (`group:b0`). The nested
    child key `voice:b0_child` is written this frame and must NOT be evicted on
    the next monotonic frame — i.e. `extra_live_ids` keeps it alive.
    """
    server = _build_server()

    # Top-level signature: ONE group layer (its pre-expansion layer_id is group:b0).
    sig = ("group:b0",)
    # The nested descendant keys the group will write when expanded.
    group = {
        "layer_type": "group",
        "group_id": "b0",
        "children": [{"voice_id": "b0_child"}],
    }
    extra = collect_group_state_keys(group)

    # Frame 0: prime the cache as if the render just wrote the nested state.
    cache = server._get_composite_states(sig, frame_index=0, extra_live_ids=extra)
    cache["group:b0"] = {"prev_frame": object()}
    cache["voice:b0_child"] = {"prev_frame": object()}
    server._save_composite_states(cache, sig, frame_index=0)

    # Frame 1: monotonic. Same top-level signature, same nested descendant set.
    survived = server._get_composite_states(sig, frame_index=1, extra_live_ids=extra)

    # PASS-AFTER: the nested key is RETAINED (not evicted).
    assert "voice:b0_child" in survived, (
        "nested child state key was evicted between frames — the #69 fix is not "
        "retaining nested-branch composite state"
    )
    assert "group:b0" in survived


def test_nested_state_key_evicted_WITHOUT_fix_fail_before():
    """FAIL-BEFORE characterization: with NO extra_live_ids (the pre-B5.3 call),
    the nested key — absent from the top-level signature — IS evicted. This pins
    exactly what the fix repairs: the nested `voice:b0_child` is dropped because
    only `group:b0` is in the live-id set."""
    server = _build_server()
    sig = ("group:b0",)

    cache = server._get_composite_states(sig, frame_index=0)  # no extra_live_ids
    cache["group:b0"] = {"prev_frame": object()}
    cache["voice:b0_child"] = {"prev_frame": object()}
    server._save_composite_states(cache, sig, frame_index=0)

    # The signature must CHANGE to trigger the eviction diff. Pre-B5.3, a render
    # whose nested set shifted (e.g. a sibling stolen) keeps the same top-level
    # `group:b0` signature, so the diff never fires; but the moment ANY top-level
    # change happens, the live-id set is just {"group:b0"} and the nested key dies.
    sig2 = ("group:b0", "asset:bg")  # a flat layer added alongside the group
    result = server._get_composite_states(sig2, frame_index=1)  # no extra_live_ids

    # FAIL-BEFORE: without the fix the nested key is gone.
    assert "voice:b0_child" not in result, (
        "expected the pre-fix behavior to evict the nested key (the bug this "
        "packet repairs)"
    )
    # group:b0 survives because it IS in the signature.
    assert "group:b0" in result


def test_nested_state_survives_even_when_flat_sibling_added():
    """PASS-AFTER under a real signature change: a flat layer is added alongside
    the group (signature changes → eviction diff fires), and the nested key STILL
    survives because extra_live_ids carries it."""
    server = _build_server()
    sig = ("group:b0",)
    group = {
        "layer_type": "group",
        "group_id": "b0",
        "children": [{"voice_id": "b0_child"}],
    }
    extra = collect_group_state_keys(group)

    cache = server._get_composite_states(sig, frame_index=0, extra_live_ids=extra)
    cache["group:b0"] = {"prev_frame": object()}
    cache["voice:b0_child"] = {"prev_frame": object()}
    server._save_composite_states(cache, sig, frame_index=0)

    # Frame 1: a flat layer joins → signature changes → eviction diff runs.
    sig2 = ("group:b0", "asset:bg")
    result = server._get_composite_states(sig2, frame_index=1, extra_live_ids=extra)

    assert "voice:b0_child" in result, "nested key evicted despite extra_live_ids"
    assert "group:b0" in result


# --------------------------------------------------------------------------- #
# Gate 4 — FLAT EVICTION UNCHANGED (byte-identical to pre-B5.3)
# --------------------------------------------------------------------------- #


def test_flat_remove_evicts_departed_key():
    """A flat render: add two layers, then remove one → the removed layer's key
    is evicted (exactly the pre-B5.3 surgical diff)."""
    server = _build_server()
    sig0 = ("asset:bg", "asset:fg")
    cache = server._get_composite_states(sig0, frame_index=0)
    cache["asset:bg"] = {"prev_frame": object()}
    cache["asset:fg"] = {"prev_frame": object()}
    server._save_composite_states(cache, sig0, frame_index=0)

    # Frame 1: fg removed → its key must be evicted.
    sig1 = ("asset:bg",)
    result = server._get_composite_states(sig1, frame_index=1)
    assert "asset:bg" in result
    assert "asset:fg" not in result


def test_flat_reorder_retains_all_keys():
    """A flat reorder (set unchanged) keeps every key — per-layer state is
    order-independent. Byte-identical to pre-B5.3."""
    server = _build_server()
    bg = {"prev_frame": object()}
    fg = {"prev_frame": object()}
    cache = server._get_composite_states(("asset:bg", "asset:fg"), frame_index=0)
    cache["asset:bg"] = bg
    cache["asset:fg"] = fg
    server._save_composite_states(cache, ("asset:bg", "asset:fg"), frame_index=0)

    # Frame 1: reordered (fg, bg) — same SET → both survive with object identity.
    result = server._get_composite_states(("asset:fg", "asset:bg"), frame_index=1)
    assert result["asset:bg"] is bg
    assert result["asset:fg"] is fg


def test_flat_path_identical_with_and_without_extra_none():
    """The flat call site passes `extra_live_ids=None` (groups → empty → None).
    The eviction result must be IDENTICAL to omitting the arg entirely — proving
    the flat path is byte-identical to pre-B5.3."""
    # Without the arg.
    s_a = _build_server()
    s_a._get_composite_states(("asset:bg", "asset:fg"), frame_index=0)
    s_a._save_composite_states(
        {"asset:bg": {"v": 1}, "asset:fg": {"v": 2}},
        ("asset:bg", "asset:fg"),
        frame_index=0,
    )
    res_a = s_a._get_composite_states(("asset:bg",), frame_index=1)

    # With explicit None.
    s_b = _build_server()
    s_b._get_composite_states(
        ("asset:bg", "asset:fg"), frame_index=0, extra_live_ids=None
    )
    s_b._save_composite_states(
        {"asset:bg": {"v": 1}, "asset:fg": {"v": 2}},
        ("asset:bg", "asset:fg"),
        frame_index=0,
    )
    res_b = s_b._get_composite_states(("asset:bg",), frame_index=1, extra_live_ids=None)

    assert set(res_a.keys()) == set(res_b.keys()) == {"asset:bg"}


def test_flat_scrub_still_cold_resets_everything():
    """A non-monotonic frame jump still cold-resets ALL state (flat behavior
    unchanged) — extra_live_ids never overrides the scrub reset."""
    server = _build_server()
    group = {
        "layer_type": "group",
        "group_id": "b0",
        "children": [{"voice_id": "b0_child"}],
    }
    extra = collect_group_state_keys(group)
    cache = server._get_composite_states(
        ("group:b0",), frame_index=10, extra_live_ids=extra
    )
    cache["group:b0"] = {"prev_frame": object()}
    cache["voice:b0_child"] = {"prev_frame": object()}
    server._save_composite_states(cache, ("group:b0",), frame_index=10)

    # Scrub backward → cold reset regardless of extra_live_ids.
    scrubbed = server._get_composite_states(
        ("group:b0",), frame_index=2, extra_live_ids=extra
    )
    assert scrubbed == {}
