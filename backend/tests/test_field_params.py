"""Tests for P6.2 — C3 schema: scalar-OR-field params + top-25 list.

Exact test names required by the packet spec:
  test_fieldref_roundtrip
  test_fieldref_rejects_unknown_kind
  test_fieldref_rejects_nonfinite_gain  (NaN / Inf / -Inf each raise)
  test_fieldref_gain_clamped            (±100 → ±4)
  test_fieldref_rejects_empty_or_oversize_source_id
  test_scalar_params_unaffected
  test_field_param_on_unlisted_effect_raises  (pipeline guard)
  test_top25_all_entries_registered_effects
  test_top25_params_exist_in_effect_PARAMS
  test_top25_has_exactly_25
  test_lane2d_max_resolution_constant_is_512x288
  test_reserved_param_prefix_guard_still_fires
"""

from __future__ import annotations

import math
import sys
import os

import numpy as np
import pytest

# Ensure backend src is importable when running from the backend/ directory
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from effects.field_params import (
    LANE2D_MAX_RESOLUTION,
    FieldRef,
    parse_param_value,
)
from effects.field_top25 import FIELD_TOP25, is_field_capable
from effects import registry as reg


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------


def _make_frame(h: int = 4, w: int = 4) -> np.ndarray:
    """Return a minimal uint8 RGBA frame for pipeline smoke calls."""
    rng = np.random.default_rng(42)
    return rng.integers(0, 256, (h, w, 4), dtype=np.uint8)


# ---------------------------------------------------------------------------
# FieldRef: round-trip
# ---------------------------------------------------------------------------


def test_fieldref_roundtrip() -> None:
    """FieldRef serializes and deserializes identically."""
    original = FieldRef(kind="image", source_id="lane://track-1", gain=2.0, invert=True)
    wire = original.to_dict()
    restored = FieldRef.from_dict(wire)

    assert restored.kind == original.kind
    assert restored.source_id == original.source_id
    assert restored.gain == original.gain
    assert restored.invert == original.invert

    # parse_param_value also deserializes the same wire format
    parsed = parse_param_value(wire)
    assert isinstance(parsed, FieldRef)
    assert parsed.kind == "image"
    assert parsed.source_id == "lane://track-1"


# ---------------------------------------------------------------------------
# FieldRef: kind validation
# ---------------------------------------------------------------------------


def test_fieldref_rejects_unknown_kind() -> None:
    """FieldRef raises ValueError for unknown kind values."""
    with pytest.raises(ValueError, match="kind"):
        FieldRef(kind="audio", source_id="src-1")

    with pytest.raises(ValueError, match="kind"):
        FieldRef(kind="", source_id="src-1")

    with pytest.raises(ValueError, match="kind"):
        FieldRef(kind="IMAGE", source_id="src-1")  # case-sensitive


# ---------------------------------------------------------------------------
# FieldRef: gain validation — NaN / Inf / -Inf each raise
# ---------------------------------------------------------------------------


def test_fieldref_rejects_nonfinite_gain() -> None:
    """FieldRef raises ValueError for NaN, Inf, and -Inf gains."""
    with pytest.raises(ValueError, match="finite"):
        FieldRef(kind="image", source_id="src", gain=float("nan"))

    with pytest.raises(ValueError, match="finite"):
        FieldRef(kind="image", source_id="src", gain=float("inf"))

    with pytest.raises(ValueError, match="finite"):
        FieldRef(kind="image", source_id="src", gain=float("-inf"))


# ---------------------------------------------------------------------------
# FieldRef: gain clamping (±100 → ±4)
# ---------------------------------------------------------------------------


def test_fieldref_gain_clamped() -> None:
    """Gains outside [-4, 4] are silently clamped; no exception raised."""
    high = FieldRef(kind="image", source_id="src", gain=100.0)
    assert high.gain == 4.0

    low = FieldRef(kind="video", source_id="src", gain=-100.0)
    assert low.gain == -4.0

    exact_pos = FieldRef(kind="lane2d", source_id="src", gain=4.0)
    assert exact_pos.gain == 4.0

    exact_neg = FieldRef(kind="lane2d", source_id="src", gain=-4.0)
    assert exact_neg.gain == -4.0

    within = FieldRef(kind="image", source_id="src", gain=1.5)
    assert within.gain == 1.5


# ---------------------------------------------------------------------------
# FieldRef: source_id validation
# ---------------------------------------------------------------------------


def test_fieldref_rejects_empty_or_oversize_source_id() -> None:
    """FieldRef raises ValueError for empty or >256-char source_id."""
    with pytest.raises(ValueError, match="source_id"):
        FieldRef(kind="image", source_id="")

    with pytest.raises(ValueError, match="source_id"):
        FieldRef(kind="image", source_id="x" * 257)

    # Exactly at the limit — should succeed
    ok = FieldRef(kind="image", source_id="x" * 256)
    assert len(ok.source_id) == 256


# ---------------------------------------------------------------------------
# parse_param_value: scalar params pass through unchanged
# ---------------------------------------------------------------------------


def test_scalar_params_unaffected() -> None:
    """parse_param_value returns non-field values unchanged."""
    assert parse_param_value(1.0) == 1.0
    assert parse_param_value(0) == 0
    assert parse_param_value("hello") == "hello"
    assert parse_param_value(None) is None
    assert parse_param_value(True) is True
    assert parse_param_value({"not_a_field": 42}) == {"not_a_field": 42}
    # dict without __field__ key is a plain scalar dict
    d = {"min": 0, "max": 1}
    assert parse_param_value(d) is d


# ---------------------------------------------------------------------------
# Pipeline guard: field param on unlisted effect raises
# ---------------------------------------------------------------------------


def test_field_param_on_unlisted_effect_raises() -> None:
    """apply_chain raises ValueError when a __field__ value targets an unlisted effect/param."""
    from engine.pipeline import apply_chain

    frame = _make_frame()

    # 'fx.blur' IS in FIELD_TOP25 for 'radius' — but 'OTHER_PARAM' is not
    # Use 'fx.vhs' which is not in FIELD_TOP25 at all
    chain = [
        {
            "effect_id": "fx.vhs",
            "enabled": True,
            "params": {
                "tracking": {
                    "__field__": {
                        "kind": "image",
                        "source_id": "src-1",
                        "gain": 1.0,
                        "invert": False,
                    }
                },
            },
        }
    ]

    with pytest.raises(ValueError, match="__field__"):
        apply_chain(frame, chain, project_seed=0, frame_index=0, resolution=(4, 4))


# ---------------------------------------------------------------------------
# FIELD_TOP25: structural invariants
# ---------------------------------------------------------------------------


def test_top25_has_exactly_25() -> None:
    """FIELD_TOP25 must contain exactly 25 entries."""
    assert len(FIELD_TOP25) == 25, f"Expected 25, got {len(FIELD_TOP25)}"


def test_top25_all_entries_registered_effects() -> None:
    """Every effect_id in FIELD_TOP25 must be present in the live registry."""
    all_effects = {e["id"] for e in reg.list_all()}
    missing = []
    for entry in FIELD_TOP25:
        if entry["effect_id"] not in all_effects:
            missing.append(entry["effect_id"])
    assert not missing, f"FIELD_TOP25 references effect IDs not in registry: {missing}"


def test_top25_params_exist_in_effect_PARAMS() -> None:
    """Every param listed per entry must exist in that effect's PARAMS schema."""
    eff_map = {e["id"]: e["params"] for e in reg.list_all()}
    errors = []
    for entry in FIELD_TOP25:
        eid = entry["effect_id"]
        params_schema = eff_map.get(eid, {})
        for p in entry["params"]:
            if p not in params_schema:
                errors.append(f"{eid}.{p}")
    assert not errors, (
        f"FIELD_TOP25 entries reference params not in effect PARAMS: {errors}"
    )


# ---------------------------------------------------------------------------
# LANE2D_MAX_RESOLUTION constant
# ---------------------------------------------------------------------------


def test_lane2d_max_resolution_constant_is_512x288() -> None:
    """LANE2D_MAX_RESOLUTION must be exactly (512, 288)."""
    assert LANE2D_MAX_RESOLUTION == (512, 288), (
        f"Expected (512, 288), got {LANE2D_MAX_RESOLUTION}"
    )
    # Verify the buffer budget: W × H × 4 bytes = 589,824 B ≈ 576 KiB
    w, h = LANE2D_MAX_RESOLUTION
    budget_bytes = w * h * 4
    assert budget_bytes == 589_824


# ---------------------------------------------------------------------------
# Reserved param prefix guard still fires (regression)
# ---------------------------------------------------------------------------


def test_reserved_param_prefix_guard_still_fires() -> None:
    """Registration of a param with _ prefix still raises ValueError.

    This proves that the __field__ sentinel (a VALUE key, not a PARAM key)
    does not interfere with the RESERVED_PARAM_PREFIX ('_') guard that
    rejects params whose *names* start with underscore.
    """
    from effects.registry import register, RESERVED_PARAM_PREFIX

    assert RESERVED_PARAM_PREFIX == "_"

    # A fictitious effect with a reserved-namespace param name
    def _dummy_fn(frame, **kwargs):
        return frame, None

    with pytest.raises(ValueError, match=RESERVED_PARAM_PREFIX):
        register(
            effect_id="test._reserved_prefix_guard",
            fn=_dummy_fn,
            params={
                "_forbidden_param": {
                    "type": "float",
                    "min": 0.0,
                    "max": 1.0,
                    "default": 0.5,
                    "label": "Forbidden",
                }
            },
            name="Forbidden Test Effect",
            category="test",
        )
