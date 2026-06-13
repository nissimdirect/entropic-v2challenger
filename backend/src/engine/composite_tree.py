"""B5.1 — Sample Rack grouping (composite-tree) backend expansion.

A Sample Rack pad may hold a BRANCH (a nested RackNode) instead of a leaf
sampler: "one note fires an ensemble." The frontend (buildRackLayers /
flattenRackTree) emits such a branch as a GROUP layer descriptor:

    {
        "layer_type": "group",
        "group_id": "b0",          # PATH-FROM-ROOT id (state key — no colons)
        "children": [ <leaf voice layer> | <nested group> , ... ],  # bottom→top
        "chain": [ ...effects... ], # runs on the COMPOSITED children sub-frame
        "opacity": float,           # branch composite opacity (multiplies up)
        "blend_mode": str,          # branch composite blend (into parent)
    }

This module expands a group into a SINGLE frame-bearing layer dict that the
normal ``render_composite`` blends upward, by:

  1. POST-ORDER: recursively expanding nested-group children FIRST.
  2. Decoding each leaf-voice child to a frame via a caller-supplied
     ``decode_leaf`` callback (preview and export keep their own reader caches).
  3. ``render_composite``-ing the children into a sub-frame (the SAME compositor
     the flat path uses — preview and export cannot drift).
  4. ``apply_chain``-ing the branch's chain to that sub-frame (the chain runs on
     the COMPOSITED children, NOT per-child — this is the whole point of B5).
  5. Returning ``{frame, opacity, blend_mode, layer_id: group_id, chain: []}`` so
     the parent composite blends the branch's result upward.

ADDITIVE: a render with NO group layers never calls into here — the flat path is
byte-identical (the dispatch is a single ``layer_type == "group"`` check).

TRUST BOUNDARY (the caps gate): the frontend already enforces MAX_BRANCH_DEPTH /
MAX_BRANCH_VOICES_PER_RENDER, but a hand-edited / hostile IPC payload could carry
a deeper tree or more voices. ``expand_group_layer`` RE-ENFORCES both caps
fail-closed: a group nested past ``MAX_BRANCH_DEPTH`` raises ValueError (rejected,
never recursed → no stack overflow); the cumulative leaf-voice count is bounded
by ``MAX_BRANCH_VOICES_PER_RENDER`` (rejected → no OOM).
"""

from __future__ import annotations

import logging
from typing import Callable

import numpy as np

from engine.compositor import render_composite
from engine.pipeline import apply_chain
from security import MAX_BRANCH_DEPTH, MAX_BRANCH_VOICES_PER_RENDER

logger = logging.getLogger(__name__)

# A decode callback resolves ONE leaf-voice child descriptor into an RGBA frame.
# Signature: decode_leaf(child: dict) -> np.ndarray. The caller (preview/export)
# owns the reader cache + per-channel RGB-offset decode logic; this module only
# orchestrates the recursion + sub-frame composite.
DecodeLeaf = Callable[[dict], np.ndarray]


def is_group_layer(layer: dict) -> bool:
    """True when a raw layer descriptor is a B5 composite-tree GROUP node."""
    return isinstance(layer, dict) and layer.get("layer_type") == "group"


def count_group_voices(layer: dict) -> int:
    """Count the leaf-voice layers under a group (recursively).

    Used by the per-render voice budget so a grouped render counts every
    descendant voice (not just top-level layers) against the tree-wide cap.
    """
    if not is_group_layer(layer):
        # A non-group layer that carries a voice_id is one voice; else zero.
        return 1 if isinstance(layer, dict) and layer.get("voice_id") is not None else 0
    total = 0
    for child in layer.get("children") or []:
        total += count_group_voices(child)
    return total


def _validate_tree_caps(layer: dict, depth: int, counter: dict) -> None:
    """Fail-closed re-enforcement of the recursion caps (trust boundary).

    Raises ValueError if the tree nests past MAX_BRANCH_DEPTH or the cumulative
    leaf-voice count exceeds MAX_BRANCH_VOICES_PER_RENDER. Walked WITHOUT decoding
    anything (enforce-before-decode), mirroring the INJ-3 / voice-cap posture.
    """
    if not is_group_layer(layer):
        if isinstance(layer, dict) and layer.get("voice_id") is not None:
            counter["voices"] += 1
            if counter["voices"] > MAX_BRANCH_VOICES_PER_RENDER:
                raise ValueError(
                    f"Composite tree voice count exceeds maximum "
                    f"{MAX_BRANCH_VOICES_PER_RENDER} (MAX_BRANCH_VOICES_PER_RENDER)"
                )
        return
    if depth + 1 > MAX_BRANCH_DEPTH:
        raise ValueError(
            f"Composite tree depth exceeds maximum "
            f"{MAX_BRANCH_DEPTH} (MAX_BRANCH_DEPTH)"
        )
    for child in layer.get("children") or []:
        _validate_tree_caps(child, depth + 1, counter)


def validate_composite_tree(layers: list) -> list[str]:
    """Validate the caps of every group layer in a flat layer list (pre-decode).

    Returns a list of error strings (empty == valid). Mirrors
    ``security.validate_voice_layers`` — called BEFORE the decode loop so a
    hostile deep/wide tree is rejected, never buffered. Non-group layers are
    ignored here (their flat voice cap is the existing ``validate_voice_layers``).
    """
    errors: list[str] = []
    if not isinstance(layers, list):
        return ["layers must be a list"]
    counter = {"voices": 0}
    for layer in layers:
        if not is_group_layer(layer):
            # Still count flat voice layers toward the tree-wide ceiling so a
            # grouped render's leaves + flat voices don't jointly OOM.
            if isinstance(layer, dict) and layer.get("voice_id") is not None:
                counter["voices"] += 1
            continue
        try:
            _validate_tree_caps(layer, 0, counter)
        except ValueError as exc:
            errors.append(str(exc))
            return errors
    if counter["voices"] > MAX_BRANCH_VOICES_PER_RENDER:
        errors.append(
            f"Composite tree voice count exceeds maximum "
            f"{MAX_BRANCH_VOICES_PER_RENDER} (MAX_BRANCH_VOICES_PER_RENDER)"
        )
    return errors


def expand_group_layer(
    group: dict,
    *,
    decode_leaf: DecodeLeaf,
    resolution: tuple[int, int],
    project_seed: int,
    frame_index: int,
    layer_states: dict | None,
    new_states: dict,
    depth: int = 0,
) -> dict:
    """Expand ONE group layer into a frame-bearing layer dict (post-order).

    Recursively composites the group's children into a sub-frame, applies the
    branch chain to that sub-frame, and returns a layer dict the parent composite
    blends upward. Threads per-layer state through ``layer_states`` (read) and
    ``new_states`` (write) keyed by the PATH-FROM-ROOT ids so nested stateful
    effects key independently (no sibling aliasing).

    Raises ValueError if the tree nests past MAX_BRANCH_DEPTH (fail-closed).
    """
    if depth + 1 > MAX_BRANCH_DEPTH:
        raise ValueError(
            f"Composite tree depth exceeds maximum "
            f"{MAX_BRANCH_DEPTH} (MAX_BRANCH_DEPTH)"
        )

    group_id = str(group.get("group_id", f"group_{id(group)}"))
    children = group.get("children") or []

    # Build the child layer list bottom-to-top: decode leaf voices, recurse into
    # nested groups. Each child carries its own chain + opacity + blend + a
    # PATH-PREFIXED layer_id (voice_id for leaves, group_id for nested groups).
    child_layers: list[dict] = []
    for child in children:
        if is_group_layer(child):
            sub = expand_group_layer(
                child,
                decode_leaf=decode_leaf,
                resolution=resolution,
                project_seed=project_seed,
                frame_index=frame_index,
                layer_states=layer_states,
                new_states=new_states,
                depth=depth + 1,
            )
            child_layers.append(sub)
            continue
        # Leaf voice child — decode footage, attach chain + compositing.
        frame = decode_leaf(child)
        voice_id = child.get("voice_id")
        layer_id = (
            f"voice:{voice_id}"
            if voice_id is not None
            else f"_grpchild_{len(child_layers)}"
        )
        leaf_layer = {
            "frame": frame,
            "chain": child.get("chain") or [],
            "frame_index": frame_index,
            "layer_id": layer_id,
        }
        if "opacity" in child:
            leaf_layer["opacity"] = child["opacity"]
        if "blend_mode" in child:
            leaf_layer["blend_mode"] = child["blend_mode"]
        child_layers.append(leaf_layer)

    # Composite the children into a sub-frame — the SAME compositor the flat path
    # uses (preview/export cannot drift). Thread the per-layer state cache.
    sub_states = layer_states if layer_states is not None else None
    if sub_states is not None:
        sub_frame, sub_new = render_composite(
            child_layers, resolution, project_seed, layer_states=sub_states
        )
        new_states.update(sub_new)
    else:
        sub_frame = render_composite(child_layers, resolution, project_seed)

    # Apply the BRANCH chain to the COMPOSITED sub-frame (NOT per-child). This is
    # the defining B5 behavior: a branch effect operates on the ensemble. Keyed by
    # the group's path-from-root id so two sibling branches' chains don't alias.
    branch_chain = group.get("chain") or []
    if branch_chain:
        state_key = f"group:{group_id}"
        state_in = layer_states.get(state_key) if layer_states is not None else None
        sub_frame, chain_state = apply_chain(
            sub_frame, branch_chain, project_seed, frame_index, resolution, state_in
        )
        if layer_states is not None:
            new_states[state_key] = chain_state

    # Emit ONE layer upward carrying the branch composite (opacity/blend). The
    # chain is already baked into sub_frame, so the emitted layer has chain=[].
    out: dict = {
        "frame": sub_frame,
        "chain": [],
        "frame_index": frame_index,
        "layer_id": f"group:{group_id}",
    }
    if "opacity" in group:
        out["opacity"] = group["opacity"]
    if "blend_mode" in group:
        out["blend_mode"] = group["blend_mode"]
    return out
