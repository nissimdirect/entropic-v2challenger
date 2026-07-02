"""Universal mask-routing wrapper (MK.3, SPEC §4.2 — the headline).

Design precedent: C4's universal band wrapper (`audio` chaos operator), applied
*spatially*. A single resolved matte routes a transform's wet output back onto
its dry input on a per-pixel basis:

    out = in · (1 − m) + transform(in) · m

Two routing scopes share that one blend identity:

  * **Per-device** — each ``EffectInstance`` may carry a ``mask_ref``. The
    referenced matte is resolved from the clip's ``mask_stack`` and injected as
    the container param ``_mask``. ``engine/container.py:130–133`` (GT-6) does the
    blend today — this module is the *sender* for that orphaned seam (ZERO diff
    to container.py).

  * **Per-chain** — ``apply_chain`` gains an optional ``chain_mask`` ndarray:
    snapshot the chain input, run the whole chain, then blend wet/dry once with
    the matte. NOT equivalent to per-device on every stage (a 3-effect chain
    differs) — both ship, semantics documented and pinned by tests.

Both are invertible at the ref (``mask_ref.invert``).

TRUST BOUNDARY (this module is reached with refs that arrived over IPC from the
renderer):

  * Unknown node id              → skip that ref, warn, NEVER raise.
  * Malformed ref (params=42,
    wrong type, missing node_id)  → skip cleanly, warn, NEVER raise.
  * Resolution mismatch (matte
    rasterised at clip res, frame
    at another res)               → bilinear resize, NEVER raise.

A bad mask must degrade to "effect applied unmasked" (i.e. the device runs with
no ``_mask``), never to a crashed frame or a dead sidecar. Degenerate masks are
no-ops by construction: ``_mask`` all-ones → byte-identical to unmasked render;
``_mask`` all-zeros → byte-identical to the dry input (container.py blend math).
"""

from __future__ import annotations

import logging

import cv2
import numpy as np

from masking.schema import MatteNode, validate_stack
from masking.stack import FrameCtx, resolve_stack

logger = logging.getLogger(__name__)


def _resolve_one(
    node_id: str,
    invert: bool,
    nodes_by_id: dict[str, MatteNode],
    ctx: FrameCtx,
    resolution_hw: tuple[int, int],
) -> np.ndarray | None:
    """Resolve a single node id into a (H, W) float32 matte, or None to skip.

    ``resolution_hw`` is ``(height, width)`` — the shape the matte must match the
    frame in (frame is (H, W, 4); ``resolve_stack`` takes (height, width)).

    Returns None (caller skips the ref + warns) when the node id is unknown.
    Never raises for resolution mismatch — ``resolve_stack`` rasterises directly
    at ``resolution_hw`` so the matte is always frame-shaped.
    """
    node = nodes_by_id.get(node_id)
    if node is None:
        logger.warning(
            "mask routing: unknown mask node id %r — skipping ref (render continues)",
            node_id,
        )
        return None

    # Build a single-node view honoring the ref-level invert. The node already
    # carries its own invert (resolved inside resolve_stack); ref-level invert is
    # applied on top of the resolved matte so the ref handle is independently
    # invertible (SPEC §4.2 "invertible at the ref").
    matte = resolve_stack([node], ctx, resolution_hw)

    if invert:
        matte = 1.0 - matte

    return np.clip(matte.astype(np.float32), 0.0, 1.0)


def _resize_to_frame(matte: np.ndarray, frame_hw: tuple[int, int]) -> np.ndarray:
    """Bilinear-resize a (h, w) matte to match ``frame_hw`` = (H, W).

    Resolution mismatch (matte rasterised at clip res, render at another res) must
    NEVER raise — we resize instead. No-op when already matching.
    """
    fh, fw = frame_hw
    if matte.shape[:2] == (fh, fw):
        return matte
    # cv2.resize takes (width, height).
    resized = cv2.resize(
        matte.astype(np.float32), (fw, fh), interpolation=cv2.INTER_LINEAR
    )
    return np.clip(resized.astype(np.float32), 0.0, 1.0)


def _parse_ref(ref: object) -> tuple[str, bool] | None:
    """Validate a mask ref payload from IPC → (node_id, invert) or None.

    Accepted shape (snake_case on the wire):
        {"node_id": "<id>", "invert": <bool>}

    Anything else (not a dict, missing/non-str node_id, params=42, wrong types)
    → None so the caller skips cleanly and warns. NEVER raises.
    """
    if not isinstance(ref, dict):
        logger.warning(
            "mask routing: malformed mask ref (expected dict, got %s) — skipping",
            type(ref).__name__,
        )
        return None
    node_id = ref.get("node_id")
    if not isinstance(node_id, str) or not node_id:
        logger.warning(
            "mask routing: malformed mask ref (bad/missing node_id %r) — skipping",
            node_id,
        )
        return None
    invert = bool(ref.get("invert", False))
    return node_id, invert


def build_node_index(mask_stack: object) -> dict[str, MatteNode]:
    """Validate a raw IPC ``mask_stack`` payload → {node_id: MatteNode}.

    Runs the list through ``validate_stack`` (the schema trust boundary: drops
    malformed nodes, clamps numerics, caps depth at MAX_MATTE_NODES_PER_CLIP).
    Non-list / absent → empty index. NEVER raises.
    """
    nodes = validate_stack(mask_stack if isinstance(mask_stack, list) else [])
    return {n.id: n for n in nodes}


def resolve_ref_matte(
    ref: object,
    nodes_by_id: dict[str, MatteNode],
    ctx: FrameCtx,
    frame_hw: tuple[int, int],
) -> np.ndarray | None:
    """Resolve an IPC mask ref into a frame-shaped (H, W) matte, or None to skip.

    Full trust-boundary path: parse ref → look up node → resolve → ref-invert →
    resize to frame. Any failure mode (malformed ref, unknown node, resize) is a
    clean skip-with-warning, never an exception.
    """
    parsed = _parse_ref(ref)
    if parsed is None:
        return None
    node_id, invert = parsed

    try:
        matte = _resolve_one(node_id, invert, nodes_by_id, ctx, frame_hw)
    except Exception as e:  # defensive: a malformed node param must not crash a frame
        logger.warning(
            "mask routing: failed to resolve node %r (%s) — skipping ref",
            node_id,
            type(e).__name__,
        )
        return None

    if matte is None:
        return None

    try:
        return _resize_to_frame(matte, frame_hw)
    except Exception as e:  # resize must never raise the frame
        logger.warning(
            "mask routing: failed to resize matte (%s) — skipping ref",
            type(e).__name__,
        )
        return None


def inject_device_masks(
    chain: list[dict],
    mask_stack: object,
    ctx: FrameCtx,
    frame_hw: tuple[int, int],
) -> list[dict]:
    """Return a copy of ``chain`` with ``_mask`` injected per device mask_ref.

    For each chain entry carrying ``mask_ref`` (snake_case, from IPC), resolve the
    matte from ``mask_stack`` and stamp it into that entry's ``params["_mask"]``
    so ``container.py`` blends the effect through the matte (GT-6 seam). Entries
    with no ``mask_ref``, or with a ref that fails resolution, are passed through
    unchanged (effect runs unmasked — never crashes the frame).

    Pure: input chain dicts are not mutated; new dicts are returned for entries
    that gain a ``_mask``.
    """
    if not chain:
        return chain

    # Cheap early-out: no entry references a mask → byte-identical legacy path
    # (degenerate guarantee / rollback proof). Avoids validating the stack at all.
    if not any(isinstance(e, dict) and e.get("mask_ref") for e in chain):
        return chain

    nodes_by_id = build_node_index(mask_stack)

    out: list[dict] = []
    for entry in chain:
        if not isinstance(entry, dict):
            out.append(entry)
            continue
        ref = entry.get("mask_ref")
        if not ref:
            out.append(entry)
            continue

        matte = resolve_ref_matte(ref, nodes_by_id, ctx, frame_hw)
        if matte is None:
            # Skip mask: run the effect unmasked. Strip any stray _mask so a bad
            # ref can't smuggle a stale matte in.
            new_params = dict(entry.get("params", {}))
            new_params.pop("_mask", None)
            new_entry = dict(entry)
            new_entry["params"] = new_params
            out.append(new_entry)
            continue

        new_params = dict(entry.get("params", {}))
        new_params["_mask"] = matte
        new_entry = dict(entry)
        new_entry["params"] = new_params
        out.append(new_entry)

    return out


def resolve_chain_mask(
    chain_mask: object,
    mask_stack: object,
    ctx: FrameCtx,
    frame_hw: tuple[int, int],
) -> np.ndarray | None:
    """Resolve a per-chain ``chain_mask`` ref into a (H, W) matte, or None.

    Same trust-boundary discipline as the per-device path. None → ``apply_chain``
    runs with no chain mask (byte-identical legacy whole-chain output).
    """
    if not chain_mask:
        return None
    nodes_by_id = build_node_index(mask_stack)
    return resolve_ref_matte(chain_mask, nodes_by_id, ctx, frame_hw)


def apply_masks_to_chain(
    chain: list[dict],
    mask_stack: object,
    mask_ctx: FrameCtx,
    frame_hw: tuple[int, int],
    *,
    chain_mask_ref: object = None,
    operators: object = None,
    operator_values: object = None,
) -> tuple[list[dict], np.ndarray | None]:
    """The ONE shared mask-routing seam (MK.3) every render path calls.

    Encapsulates the exact sequence the single-clip render_frame handler runs so
    that preview (single-clip + composite), nested-instrument (composite_tree),
    and export paths CANNOT drift apart — the headline MK design goal of
    preview/export parity. It performs, in order:

      1. **MK.8 keying-as-performance** — when ``operators`` + ``operator_values``
         are both active, resolve ``mask.<node_id>.<param>`` operator modulation
         INTO the key nodes' params before the mattes rasterize (so an LFO /
         sidechain / beat-gate on a key rides this frame). No-op unless a
         ``mask.*`` mapping exists; trust-bounded (unknown nodes skipped).
      2. **Per-device** — ``inject_device_masks``: resolve each device's
         ``mask_ref`` → ``params["_mask"]`` (container.py GT-6 blend seam).
      3. **Per-chain** — ``resolve_chain_mask``: the optional whole-chain wet/dry
         matte ``apply_chain`` consumes via its ``chain_mask`` argument.

    Returns ``(chain, chain_mask)``:
      * ``chain``       — a copy with per-device ``_mask`` injected (or the input
                          unchanged when no entry references a mask).
      * ``chain_mask``  — the resolved per-chain matte ndarray, or ``None``.

    DEGENERATE / ROLLBACK GUARANTEE: absent ``mask_stack`` (and absent
    ``chain_mask_ref`` / mask operators) → returns ``(chain, None)`` with the
    chain object unchanged — the byte-identical no-mask path. Every step is
    individually trust-bounded: a malformed ``mask_stack`` / ref degrades to the
    no-mask path, never raises, never crashes the frame.

    ``frame_hw`` is the matte's required ``(H, W)`` — taken from the (possibly
    transformed) frame so the matte always broadcasts against it.
    """
    # MK.8 — resolve key-param operator modulation into the stack BEFORE the
    # mattes rasterize. Lazy import (mirrors the render_frame call site) keeps the
    # masking package free of a hard modulation dependency. No-op unless operators
    # are active AND a mask.* mapping exists.
    if operators and isinstance(operators, list) and operator_values:
        from modulation.routing import resolve_mask_modulations

        mask_stack = resolve_mask_modulations(operator_values, operators, mask_stack)

    # Per-device: resolve each device's mask_ref → inject _mask param.
    chain = inject_device_masks(chain, mask_stack, mask_ctx, frame_hw)
    # Per-chain: whole-chain wet/dry matte for apply_chain.
    chain_mask = resolve_chain_mask(chain_mask_ref, mask_stack, mask_ctx, frame_hw)

    return chain, chain_mask
