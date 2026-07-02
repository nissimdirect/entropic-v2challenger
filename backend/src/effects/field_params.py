"""Field parameter schema for P6.2 — scalar-OR-field params.

A *field param* lets an effect parameter be driven by a live image/video/lane2d
buffer instead of a scalar value.  The serialized form is:

    {"__field__": {"kind": "image", "source_id": "...", "gain": 1.0, "invert": false}}

``__field__`` is the **value sentinel key** (inside the param value dict), NOT a
top-level param KEY.  It therefore does NOT collide with ``RESERVED_PARAM_PREFIX``
("_") used for synthetic container-plumbing keys (_mix, _mask).  A test in
test_field_params.py asserts this explicitly.

Buffer budget note (lane2d):
    W × H × 4 bytes (float32) = 512 × 288 × 4 = 589,824 B ≈ 576 KiB per field.

Tier notes:
    ``lane2d`` is schema-reserved in Phase 6.  The painted-field UI that produces
    lane2d buffers is Tier 3 / B4-full and is NOT implemented here.  ``image``
    and ``video`` are Phase 6 addressable sources (frame snapshots).
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Maximum resolution for lane2d (painted-field) buffers.
# Tier 3 / B4-full UI is NOT implemented in Phase 6; this constant is reserved
# so downstream code has a single source of truth for the budget ceiling.
# Buffer budget: 512 × 288 × 4 bytes (float32) = 589,824 B ≈ 576 KiB/field.
LANE2D_MAX_RESOLUTION: tuple[int, int] = (512, 288)

# Sentinel key used inside a param *value* dict to mark it as a FieldRef.
_FIELD_SENTINEL = "__field__"

# Valid kind literals
_VALID_KINDS = frozenset({"image", "video", "lane2d"})

# Gain clamp bounds (applied silently; NaN/Inf still raises)
_GAIN_MIN = -4.0
_GAIN_MAX = 4.0

# source_id length constraint
_SOURCE_ID_MAX_LEN = 256


# ---------------------------------------------------------------------------
# FieldRef dataclass
# ---------------------------------------------------------------------------


@dataclass
class FieldRef:
    """Reference to a live frame/buffer used as a modulation source.

    Attributes:
        kind:      Buffer category — ``'image'``, ``'video'``, or ``'lane2d'``.
        source_id: Non-empty string identifier (≤ 256 chars) for the source.
        gain:      Scalar multiplier in [-4, 4].  Values outside that range are
                   clamped; NaN/Inf raise ``ValueError``.
        invert:    If True the field values are negated before application.
    """

    kind: str
    source_id: str
    gain: float = 1.0
    invert: bool = False

    def __post_init__(self) -> None:
        self._validate()

    # ------------------------------------------------------------------
    # Validation
    # ------------------------------------------------------------------

    def _validate(self) -> None:
        # kind
        if self.kind not in _VALID_KINDS:
            raise ValueError(
                f"FieldRef.kind must be one of {sorted(_VALID_KINDS)!r}, "
                f"got {self.kind!r}"
            )
        # source_id
        if not isinstance(self.source_id, str) or len(self.source_id) == 0:
            raise ValueError("FieldRef.source_id must be a non-empty string")
        if len(self.source_id) > _SOURCE_ID_MAX_LEN:
            raise ValueError(
                f"FieldRef.source_id exceeds maximum length of {_SOURCE_ID_MAX_LEN} chars "
                f"(got {len(self.source_id)})"
            )
        # gain — NaN/Inf first, then clamp
        if not math.isfinite(self.gain):
            raise ValueError(f"FieldRef.gain must be finite, got {self.gain!r}")
        # Silently clamp to [-4, 4]
        self.gain = max(_GAIN_MIN, min(_GAIN_MAX, self.gain))

    # ------------------------------------------------------------------
    # Serialization
    # ------------------------------------------------------------------

    def to_dict(self) -> dict:
        """Serialize to the wire format ``{"__field__": {...}}``."""
        return {
            _FIELD_SENTINEL: {
                "kind": self.kind,
                "source_id": self.source_id,
                "gain": self.gain,
                "invert": self.invert,
            }
        }

    @classmethod
    def from_dict(cls, d: dict) -> "FieldRef":
        """Deserialize from the wire format ``{"__field__": {...}}``."""
        inner = d[_FIELD_SENTINEL]
        return cls(
            kind=inner["kind"],
            source_id=inner["source_id"],
            gain=float(inner.get("gain", 1.0)),
            invert=bool(inner.get("invert", False)),
        )


# ---------------------------------------------------------------------------
# Helper: param value deserialization
# ---------------------------------------------------------------------------


def parse_param_value(value: object) -> "FieldRef | object":
    """Return a ``FieldRef`` if *value* is a field sentinel dict; else return *value* unchanged.

    A param value is a FieldRef iff it is a dict with exactly the ``__field__``
    sentinel key.  Everything else (scalars, non-sentinel dicts) passes through
    transparently so scalar params are completely unaffected.
    """
    if isinstance(value, dict) and _FIELD_SENTINEL in value:
        return FieldRef.from_dict(value)
    return value
