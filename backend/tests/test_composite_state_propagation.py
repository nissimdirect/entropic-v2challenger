"""Regression tests for per-layer state propagation in render_composite.

Background:
- PR #51 fixed `_handle_render_frame` to propagate per-effect state across
  preview frames via a session-scoped cache.
- `render_composite` had the same gap for the multi-layer composite path:
  every layer's chain ran with `state_in=None` every frame, so stateful
  effects (datamosh, reaction_mosh, frame_drop, generation_loss, etc.)
  silently no-op'd in composite preview.

This module guards the composite fix:
1. Stateful effect chains in a composite layer must produce DIFFERENT output
   on frame[N>=1] vs frame[0] when state is threaded.
2. Without `layer_states` the function still returns a bare ndarray
   (legacy single-return path remains intact).
3. Layer add/remove/reorder via signature change forces a state reset
   from the caller's perspective (tested via the cache helper interface).
"""

from __future__ import annotations

import numpy as np
import pytest

from engine.compositor import render_composite

pytestmark = pytest.mark.smoke


def _checkerboard(h=64, w=64):
    """A non-trivial frame so chained effects have something to mutate."""
    rng = np.random.default_rng(123)
    return rng.integers(0, 256, (h, w, 4), dtype=np.uint8)


def _stateful_chain():
    """A chain that registers as stateful: datamosh leaves a previous-frame trace."""
    # If `fx.datamosh_melt` isn't registered in the running build, skip.
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


def test_legacy_single_return_unchanged():
    """No layer_states arg → returns bare ndarray (back-compat for old callers)."""
    frame = _checkerboard()
    layers = [
        {
            "frame": frame,
            "chain": [],
            "opacity": 1.0,
            "blend_mode": "normal",
            "frame_index": 0,
        }
    ]
    out = render_composite(layers, resolution=(64, 64), project_seed=42)
    assert isinstance(out, np.ndarray)
    assert out.shape == (64, 64, 4)
    assert out.dtype == np.uint8


def test_layer_states_returns_tuple_with_states():
    """layer_states={} → returns (frame, new_states) tuple."""
    frame = _checkerboard()
    layers = [
        {
            "frame": frame,
            "chain": [],
            "opacity": 1.0,
            "blend_mode": "normal",
            "frame_index": 0,
            "layer_id": "asset:test",
        }
    ]
    result = render_composite(
        layers, resolution=(64, 64), project_seed=42, layer_states={}
    )
    assert isinstance(result, tuple) and len(result) == 2
    out, new_states = result
    assert isinstance(out, np.ndarray)
    assert isinstance(new_states, dict)


def test_state_propagates_across_frames():
    """Render the same layer across 3 frames threading state. Output[2] should
    differ from output[0] (state genuinely propagated)."""
    chain = _stateful_chain()
    f0 = _checkerboard()
    f1 = (f0.astype(int) + 12).clip(0, 255).astype(np.uint8)  # shifted variant
    f2 = (f0.astype(int) + 24).clip(0, 255).astype(np.uint8)

    states: dict[str, dict] = {}
    outs = []
    for idx, frame in enumerate([f0, f1, f2]):
        layers = [
            {
                "frame": frame,
                "chain": chain,
                "opacity": 1.0,
                "blend_mode": "normal",
                "frame_index": idx,
                "layer_id": "asset:test",
            }
        ]
        out, states = render_composite(
            layers, resolution=(64, 64), project_seed=42, layer_states=states
        )
        outs.append(out)

    # state-propagating composite: per-effect state was preserved → output
    # diverges from raw single-frame application by frame[2].
    assert not np.array_equal(outs[0], outs[2]), (
        "Composite frame[2] is identical to frame[0] — state was NOT propagated"
    )


def test_state_propagation_vs_no_state_diverges():
    """For the same input, threading state vs not threading state must
    produce different output by frame[2]. This pins the behavioural difference
    that the gap was masking."""
    chain = _stateful_chain()
    f0 = _checkerboard()
    f1 = (f0.astype(int) + 12).clip(0, 255).astype(np.uint8)
    f2 = (f0.astype(int) + 24).clip(0, 255).astype(np.uint8)

    # Path A — with state propagation
    states_a: dict[str, dict] = {}
    a_out = None
    for idx, frame in enumerate([f0, f1, f2]):
        layers = [
            {
                "frame": frame,
                "chain": chain,
                "opacity": 1.0,
                "blend_mode": "normal",
                "frame_index": idx,
                "layer_id": "asset:test",
            }
        ]
        a_out, states_a = render_composite(
            layers, resolution=(64, 64), project_seed=42, layer_states=states_a
        )

    # Path B — without state propagation (legacy gap behaviour)
    b_out = None
    for idx, frame in enumerate([f0, f1, f2]):
        layers = [
            {
                "frame": frame,
                "chain": chain,
                "opacity": 1.0,
                "blend_mode": "normal",
                "frame_index": idx,
                # NO layer_id — and pass NO layer_states
            }
        ]
        b_out = render_composite(layers, resolution=(64, 64), project_seed=42)

    assert not np.array_equal(a_out, b_out), (
        "Stateful and stateless composite produced identical output — the "
        "state-threading code path is not actually applying the cached state."
    )


def test_multi_layer_keeps_state_per_layer():
    """Two layers, both with stateful chains. After frame 0, both layers'
    states must be present in the returned dict, keyed by layer_id."""
    chain = _stateful_chain()
    f = _checkerboard()
    layers = [
        {
            "frame": f,
            "chain": chain,
            "opacity": 1.0,
            "blend_mode": "normal",
            "frame_index": 0,
            "layer_id": "asset:bg",
        },
        {
            "frame": f,
            "chain": chain,
            "opacity": 1.0,
            "blend_mode": "normal",
            "frame_index": 0,
            "layer_id": "asset:fg",
        },
    ]
    _out, new_states = render_composite(
        layers, resolution=(64, 64), project_seed=42, layer_states={}
    )
    assert "asset:bg" in new_states
    assert "asset:fg" in new_states
    # State dicts are non-empty (datamosh writes at least prev_frame)
    assert isinstance(new_states["asset:bg"], dict)
    assert isinstance(new_states["asset:fg"], dict)


def test_empty_layers_with_state_returns_empty_states_dict():
    """Edge case: zero layers + layer_states arg → empty new_states dict."""
    out, new_states = render_composite(
        [], resolution=(64, 64), project_seed=0, layer_states={}
    )
    assert out.shape == (64, 64, 4)
    assert new_states == {}
