"""Belt-and-suspenders per-track chain isolation tests for render_composite.

Spec: openspec/changes/05-export-pertrack/specs/render-composite/spec.md
Change: 05-export-pertrack (Epic 4, D2)

Scenarios covered:
  - distinct-per-layer-chains-produce-distinct-layer-outputs
  - empty-layer-chain-is-passthrough
  - same-effect-different-params-per-layer
"""

from __future__ import annotations

import numpy as np
import pytest

from engine.compositor import render_composite

pytestmark = pytest.mark.smoke


def _checkerboard(h: int = 64, w: int = 64) -> np.ndarray:
    """Non-trivial frame so effects have something to mutate."""
    rng = np.random.default_rng(42)
    return rng.integers(0, 256, (h, w, 4), dtype=np.uint8)


def _color_invert_chain() -> list[dict]:
    """Stateless chain: color_invert at 100% on all channels."""
    return [
        {
            "effect_id": "fx.color_invert",
            "params": {"channel": "all", "amount": 1.0},
            "enabled": True,
        }
    ]


def _brightness_exposure_chain(stops: float = 2.0) -> list[dict]:
    """Stateless chain: brightness_exposure at `stops` value."""
    return [
        {
            "effect_id": "fx.brightness_exposure",
            "params": {"stops": stops, "clip_mode": "clip"},
            "enabled": True,
        }
    ]


# ─── Scenario: Distinct per-layer chains produce distinct layer outputs ──────
# Spec AC: "Two layers with distinct chains SHALL produce a composite that
# reflects both distinct chains, not a single shared chain applied to all."


def test_distinct_per_layer_chains_produce_distinct_layer_outputs():
    """
    GIVEN a composite of layer V1 (chain=[color_invert]) and V2 (chain=[brightness_exposure])
    WHEN render_composite renders the frame
    THEN the output differs from rendering both layers with chain=[color_invert]
    This proves each layer applied its OWN chain, not a shared/global one.
    """
    frame = _checkerboard()

    chain_a = _color_invert_chain()
    chain_b = _brightness_exposure_chain(stops=2.0)

    # Target: V1=color_invert, V2=brightness_exposure (distinct chains)
    layers_distinct = [
        {
            "frame": frame.copy(),
            "chain": chain_a,
            "opacity": 1.0,
            "blend_mode": "normal",
            "frame_index": 0,
            "layer_id": "v1",
        },
        {
            "frame": frame.copy(),
            "chain": chain_b,
            "opacity": 1.0,
            "blend_mode": "normal",
            "frame_index": 0,
            "layer_id": "v2",
        },
    ]
    out_distinct = render_composite(
        layers_distinct, resolution=(64, 64), project_seed=42
    )

    # Baseline: both layers use chain_a (color_invert)
    layers_all_a = [
        {
            "frame": frame.copy(),
            "chain": chain_a,
            "opacity": 1.0,
            "blend_mode": "normal",
            "frame_index": 0,
            "layer_id": "v1",
        },
        {
            "frame": frame.copy(),
            "chain": chain_a,
            "opacity": 1.0,
            "blend_mode": "normal",
            "frame_index": 0,
            "layer_id": "v2",
        },
    ]
    out_all_a = render_composite(layers_all_a, resolution=(64, 64), project_seed=42)

    assert not np.array_equal(out_distinct, out_all_a), (
        "Composite with distinct per-layer chains is identical to all-layers-chain-A baseline "
        "— each layer is NOT applying its own chain."
    )


# ─── Scenario: Empty layer chain is passthrough ───────────────────────────────
# Spec AC: "A layer with chain=[] SHALL composite its source frame unmodified."


def test_empty_layer_chain_is_passthrough():
    """
    GIVEN a layer with chain=[]
    WHEN render_composite renders it (single layer, full opacity)
    THEN the output frame equals the input frame (passthrough, no modification)
    """
    frame = _checkerboard()

    layers = [
        {
            "frame": frame.copy(),
            "chain": [],
            "opacity": 1.0,
            "blend_mode": "normal",
            "frame_index": 0,
            "layer_id": "v1",
        }
    ]
    out = render_composite(layers, resolution=(64, 64), project_seed=42)

    assert isinstance(out, np.ndarray)
    # The compositor initialises a black canvas and composites the layer on top.
    # With chain=[], opacity=1.0, normal blend, the output should equal the input frame.
    assert np.array_equal(out, frame), (
        "Empty chain layer is NOT passthrough — compositor modified the frame when chain=[]."
    )


# ─── Scenario: Same effect, different params per layer ────────────────────────
# Spec AC: "Layer A and layer B both use effect X with DIFFERENT param values
# → each layer reflects its own param values (params are not shared)."


def test_same_effect_different_params_per_layer():
    """
    GIVEN layer V1 uses brightness_exposure(stops=2.0) and V2 uses brightness_exposure(stops=-2.0)
    WHEN render_composite renders both layers
    THEN the composite differs from rendering both with stops=2.0 (params are isolated per layer)
    """
    frame = _checkerboard()

    # Layer V1: +2 stops (brightens), Layer V2: -2 stops (darkens)
    chain_v1 = _brightness_exposure_chain(stops=2.0)
    chain_v2 = _brightness_exposure_chain(stops=-2.0)

    layers_mixed_params = [
        {
            "frame": frame.copy(),
            "chain": chain_v1,
            "opacity": 1.0,
            "blend_mode": "normal",
            "frame_index": 0,
            "layer_id": "v1",
        },
        {
            "frame": frame.copy(),
            "chain": chain_v2,
            "opacity": 1.0,
            "blend_mode": "normal",
            "frame_index": 0,
            "layer_id": "v2",
        },
    ]
    out_mixed = render_composite(
        layers_mixed_params, resolution=(64, 64), project_seed=42
    )

    # Baseline: both layers use chain_v1 (stops=2.0)
    layers_both_v1 = [
        {
            "frame": frame.copy(),
            "chain": chain_v1,
            "opacity": 1.0,
            "blend_mode": "normal",
            "frame_index": 0,
            "layer_id": "v1",
        },
        {
            "frame": frame.copy(),
            "chain": chain_v1,
            "opacity": 1.0,
            "blend_mode": "normal",
            "frame_index": 0,
            "layer_id": "v2",
        },
    ]
    out_both_v1 = render_composite(layers_both_v1, resolution=(64, 64), project_seed=42)

    assert not np.array_equal(out_mixed, out_both_v1), (
        "Composite with V1=stops+2, V2=stops-2 is identical to V1=V2=stops+2 baseline "
        "— params are being shared across layers instead of isolated."
    )
