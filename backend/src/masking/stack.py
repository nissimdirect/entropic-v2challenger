"""Mask-stack resolver (SPEC §3.2, §4).

resolve_stack() folds a list of MatteNodes into a single float32 (H, W)
matte using boolean combine operations (add / subtract / intersect).

Per-node processing order (documented here and asserted in the test
``test_feather_then_grow_order_matches_docstring``):
  1. Rasterize or evaluate the node → raw matte in [0, 1].
  2. Apply invert: m = 1 − m  (if node.invert is True).
  3. Apply feather: gaussian blur with sigma = node.feather pixels.
  4. Apply grow/shrink: morphological dilation (grow > 0) or erosion (shrink < 0)
     with a circular kernel of radius abs(node.growShrink).
  5. Combine with the accumulated stack using node.op:
       add        →  stack = max(stack, m)      (union)
       subtract   →  stack = stack * (1 − m)    (set-minus, clamped)
       intersect  →  stack = stack * m           (intersection)

Nodes with ``enabled=False`` are skipped entirely.

Procedural kinds (chroma_key, luma_key, color_range, ai_matte) must be
registered in the ``_EVALUATOR_REGISTRY`` dict by downstream packets
(MK.6/MK.8/MK.12). Until they are registered, calling resolve_stack() with
a procedural node raises NotImplementedError (the node is not silently skipped —
the caller is responsible for either filtering or handling the error).

FrameCtx is a lightweight context bag passed to procedural evaluators; static
rasterizers ignore it.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any, Callable

import cv2
import numpy as np
from scipy.ndimage import gaussian_filter

from masking.schema import MatteNode
from masking.matte_source import rasterize

# --------------------------------------------------------------------------- #
#  Frame context (passed to procedural evaluators)
# --------------------------------------------------------------------------- #


@dataclass
class FrameCtx:
    """Lightweight context for procedural matte evaluators.

    Attributes:
        frame:       RGBA uint8 (H, W, 4) ndarray of the current frame.
                     May be None for tests that only exercise static kinds.
        frame_index: Integer index of the current frame.
        clip_id:     Clip identity string (used for cache keying).
    """

    frame: np.ndarray | None = None
    frame_index: int = 0
    clip_id: str = ""
    extra: dict[str, Any] = field(default_factory=dict)


# --------------------------------------------------------------------------- #
#  Procedural evaluator registry
# --------------------------------------------------------------------------- #

# Signature: (node: MatteNode, ctx: FrameCtx, height: int, width: int) → float32 (H,W)
EvaluatorFn = Callable[["MatteNode", FrameCtx, int, int], np.ndarray]

_EVALUATOR_REGISTRY: dict[str, EvaluatorFn] = {}

_STATIC_KINDS = frozenset({"rect", "ellipse", "polygon", "bitmap"})


def register_evaluator(kind: str, fn: EvaluatorFn) -> None:
    """Register a procedural matte evaluator for a given node kind.

    MK.6 registers 'color_range'; MK.8 registers 'chroma_key'/'luma_key';
    MK.12 registers 'ai_matte'. Subsequent registration replaces the old entry.
    """
    _EVALUATOR_REGISTRY[kind] = fn


# --------------------------------------------------------------------------- #
#  Per-node processing helpers
# --------------------------------------------------------------------------- #


def _feather(matte: np.ndarray, radius: float) -> np.ndarray:
    """Apply gaussian feathering with *radius* pixels as sigma.

    A zero or negative radius is a no-op (returns the input unchanged).
    """
    if radius <= 0:
        return matte
    return gaussian_filter(matte, sigma=radius).astype(np.float32)


def _grow_shrink(matte: np.ndarray, amount: float) -> np.ndarray:
    """Morphological grow (amount > 0) or shrink (amount < 0).

    Uses an elliptical kernel of radius abs(amount) pixels.
    A zero amount is a no-op.
    """
    if amount == 0:
        return matte
    r = max(1, int(round(abs(amount))))
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1))
    if amount > 0:
        result = cv2.dilate(matte, kernel)
    else:
        result = cv2.erode(matte, kernel)
    return result.astype(np.float32)


def _apply_op(stack: np.ndarray, m: np.ndarray, op: str) -> np.ndarray:
    """Fold *m* into *stack* using the boolean combine rule *op*.

    add        → union:        stack = max(stack, m)
    subtract   → set-minus:    stack = stack * (1 − m)  [clamped to ≥ 0]
    intersect  → intersection: stack = stack * m
    """
    if op == "add":
        return np.maximum(stack, m)
    elif op == "subtract":
        return np.clip(stack * (1.0 - m), 0.0, 1.0)
    elif op == "intersect":
        return stack * m
    else:
        # Unknown op — treat as add (schema validator should have caught this).
        return np.maximum(stack, m)


# --------------------------------------------------------------------------- #
#  Public: resolve_stack
# --------------------------------------------------------------------------- #


def resolve_stack(
    nodes: list[MatteNode],
    ctx: FrameCtx,
    resolution: tuple[int, int],
) -> np.ndarray:
    """Fold *nodes* into a single float32 (H, W) matte in [0, 1].

    Processing order per node (see module docstring):
      invert → feather → grow/shrink → boolean combine

    Args:
        nodes:      List of MatteNode (already validated by schema.validate_stack).
        ctx:        FrameCtx passed to procedural evaluators.
        resolution: (height, width) tuple for the output matte.

    Returns:
        float32 ndarray of shape (height, width), values clipped to [0, 1].

    Raises:
        NotImplementedError: if a node's kind is procedural and has no
            registered evaluator (explicitly not silenced — caller handles).
    """
    height, width = resolution
    # Start with an empty (all-zero) accumulator.
    stack = np.zeros((height, width), dtype=np.float32)

    for node in nodes:
        if not node.enabled:
            continue

        # 1. Rasterize or evaluate.
        if node.kind in _STATIC_KINDS:
            raw = rasterize(node, height, width, ctx.clip_id)
        else:
            evaluator = _EVALUATOR_REGISTRY.get(node.kind)
            if evaluator is None:
                raise NotImplementedError(
                    f"No evaluator registered for procedural matte kind '{node.kind}'. "
                    "Register one via masking.stack.register_evaluator() (MK.6/MK.8/MK.12)."
                )
            raw = evaluator(node, ctx, height, width)

        # Ensure float32 in [0, 1].
        m = np.clip(raw.astype(np.float32), 0.0, 1.0)

        # 2. Invert.
        if node.invert:
            m = 1.0 - m

        # 3. Feather (gaussian, sigma = node.feather px).
        m = _feather(m, node.feather)

        # 4. Grow / shrink (morphological).
        m = _grow_shrink(m, node.growShrink)

        # Re-clip after operations that can push values out of [0, 1].
        m = np.clip(m, 0.0, 1.0)

        # 5. Boolean combine with accumulator.
        stack = _apply_op(stack, m, node.op)

    return np.clip(stack, 0.0, 1.0)
