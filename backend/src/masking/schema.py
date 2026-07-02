"""MatteNode dataclass — canonical schema for the masking subsystem.

SPEC §3.2 (SELECTION-MASKING-SPEC.md). This is the trust boundary between
persisted project JSON / IPC payloads and the rest of the pipeline.

Validator rules (SPEC §3.3, feedback_numeric-trust-boundary.md):
  - id: matches ^[A-Za-z0-9_-]{1,64}$ — rejected on mismatch (returns None)
  - kind: must be a known enum member — unknown kind → rejected (returns None)
  - feather: clamped to [0, 100]; NaN/Inf → 0
  - growShrink: clamped to [-50, 50]; NaN/Inf → 0
  - enabled: coerced to bool
  - params numeric values: NaN/Inf → 0 (string values pass through as-is)
  - op: must be 'add' | 'subtract' | 'intersect' — unknown → 'add'
  - Stack depth: MAX_MATTE_NODES_PER_CLIP = 8; 9th node rejected
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from typing import Any

# --------------------------------------------------------------------------- #
#  Constants (SPEC §3.3)
# --------------------------------------------------------------------------- #

MAX_MATTE_NODES_PER_CLIP: int = 8

_VALID_KINDS = frozenset(
    {
        "rect",
        "ellipse",
        "polygon",
        "bitmap",
        "chroma_key",
        "luma_key",
        "color_range",
        "ai_matte",
    }
)

_VALID_OPS = frozenset({"add", "subtract", "intersect"})

_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,64}$")

_FEATHER_MIN: float = 0.0
_FEATHER_MAX: float = 100.0
_GROW_SHRINK_MIN: float = -50.0
_GROW_SHRINK_MAX: float = 50.0


# --------------------------------------------------------------------------- #
#  Helper: safe float clamp
# --------------------------------------------------------------------------- #


def _clamp(value: Any, lo: float, hi: float, default: float = 0.0) -> float:
    """Convert *value* to float, clamp to [lo, hi].

    NaN → *default*. +Inf → hi. -Inf → lo. Non-numeric → *default*.
    Never raises.
    """
    try:
        n = float(value)
    except (TypeError, ValueError):
        return default
    if math.isnan(n):
        return default
    if math.isinf(n):
        return hi if n > 0 else lo
    return max(lo, min(hi, n))


def _sanitize_params(params: Any) -> dict[str, Any]:
    """Return a cleaned params dict: numeric NaN/Inf → 0; strings pass through.

    Ensures every numeric value that crosses the IPC boundary is finite.
    """
    if not isinstance(params, dict):
        return {}
    clean: dict[str, Any] = {}
    for k, v in params.items():
        if isinstance(k, str):
            if isinstance(v, (int, float)):
                n = float(v)
                clean[k] = 0.0 if not math.isfinite(n) else v
            elif isinstance(v, str):
                clean[k] = v
            # other types (bool, None, list, …) are dropped
    return clean


# --------------------------------------------------------------------------- #
#  MatteNode
# --------------------------------------------------------------------------- #


@dataclass
class MatteNode:
    """Single node in a clip's mask stack (SPEC §3.2).

    All fields are validated/clamped on construction via :meth:`from_dict`.
    Direct instantiation bypasses validation — use ``from_dict`` at trust
    boundaries (IPC, persistence load).

    Field meanings:
      id          — unique node identity; ``^[A-Za-z0-9_-]{1,64}$``
      kind        — shape type; unknown kinds are rejected at the boundary
      params      — kind-specific numerics (clamped) + strings (pass-through)
      op          — boolean combine rule with the accumulated stack so far
      invert      — flip the matte (1−m) before the op
      feather     — gaussian blur radius in px, [0, 100]
      growShrink  — morphological expand(+) / erode(−) in px, [−50, 50]
      enabled     — when False the node is skipped in resolve_stack
    """

    id: str
    kind: str
    params: dict[str, Any] = field(default_factory=dict)
    op: str = "add"
    invert: bool = False
    feather: float = 0.0
    growShrink: float = 0.0
    enabled: bool = True

    # ------------------------------------------------------------------ #
    #  Factory / serialisation
    # ------------------------------------------------------------------ #

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "MatteNode | None":
        """Validate *data* and return a MatteNode, or None if invalid.

        Called at every IPC/persistence trust boundary. Never raises.

        Rejection conditions (→ None):
          • id missing or not matching ``^[A-Za-z0-9_-]{1,64}$``
          • kind missing or not in the known-kinds allowlist
        """
        if not isinstance(data, dict):
            return None

        # --- id validation ------------------------------------------------
        node_id = data.get("id")
        if not isinstance(node_id, str) or not _ID_PATTERN.match(node_id):
            return None

        # --- kind validation ----------------------------------------------
        kind = data.get("kind")
        if not isinstance(kind, str) or kind not in _VALID_KINDS:
            return None

        # --- op with fallback --------------------------------------------
        op = data.get("op", "add")
        if op not in _VALID_OPS:
            op = "add"

        # --- clamped numerics --------------------------------------------
        feather = _clamp(data.get("feather", 0.0), _FEATHER_MIN, _FEATHER_MAX)
        grow_shrink = _clamp(
            data.get("growShrink", 0.0), _GROW_SHRINK_MIN, _GROW_SHRINK_MAX
        )

        # --- bool fields -------------------------------------------------
        invert = bool(data.get("invert", False))
        enabled = bool(data.get("enabled", True))

        # --- params (sanitize numerics) ----------------------------------
        params = _sanitize_params(data.get("params", {}))

        return cls(
            id=node_id,
            kind=kind,
            params=params,
            op=op,
            invert=invert,
            feather=feather,
            growShrink=grow_shrink,
            enabled=enabled,
        )

    def to_dict(self) -> dict[str, Any]:
        """Serialize to a JSON-safe dict (round-trip with ``from_dict``)."""
        return {
            "id": self.id,
            "kind": self.kind,
            "params": dict(self.params),
            "op": self.op,
            "invert": self.invert,
            "feather": self.feather,
            "growShrink": self.growShrink,
            "enabled": self.enabled,
        }


# --------------------------------------------------------------------------- #
#  Stack validation helpers
# --------------------------------------------------------------------------- #


def validate_stack(raw_nodes: list[Any]) -> list[MatteNode]:
    """Parse a list of raw dicts into validated MatteNodes.

    Rules:
      • Each entry is parsed via MatteNode.from_dict; None → dropped.
      • Stack is capped at MAX_MATTE_NODES_PER_CLIP; entries beyond the cap
        are silently dropped (the 9th node is rejected, never crashes).

    Returns the (possibly empty) list of valid nodes.
    """
    if not isinstance(raw_nodes, list):
        return []
    nodes: list[MatteNode] = []
    for raw in raw_nodes:
        if len(nodes) >= MAX_MATTE_NODES_PER_CLIP:
            break
        node = MatteNode.from_dict(raw) if isinstance(raw, dict) else None
        if node is not None:
            nodes.append(node)
    return nodes
