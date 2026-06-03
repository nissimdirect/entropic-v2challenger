"""Tests for `.dna` patch format (PR #21)."""

from __future__ import annotations

import gzip
import json
import struct
import sys
from pathlib import Path

import pytest

BACKEND_SRC = Path(__file__).resolve().parents[2] / "src"
if str(BACKEND_SRC) not in sys.path:
    sys.path.insert(0, str(BACKEND_SRC))

from dna import (
    DNAFormatError,
    DNAPatch,
    DNAVersionError,
    MAGIC,
    SCHEMA_VERSION,
    SUPPORTED_SCHEMA_VERSIONS,
    BudgetDescriptor,
    default_budget,
    read_dna,
    validate_budget,
    write_dna,
)


def _minimal_patch_dict() -> dict:
    return {
        "schema_version": SCHEMA_VERSION,
        "patch_id": "test-uuid-1",
        "name": "test patch",
        "graph": {},
        "routing": {},
        "lanes": [],
        "params": {},
        "budget": default_budget().to_dict(),
    }


# ---------------------------------------------------------------------------
# Codec sentinels
# ---------------------------------------------------------------------------


@pytest.mark.smoke
def test_magic_bytes():
    assert MAGIC == b"DNA1"
    assert len(MAGIC) == 4


@pytest.mark.smoke
def test_schema_version_is_1_0_0():
    assert SCHEMA_VERSION == "1.0.0"
    assert SCHEMA_VERSION in SUPPORTED_SCHEMA_VERSIONS


# ---------------------------------------------------------------------------
# Write + read round-trip
# ---------------------------------------------------------------------------


@pytest.mark.smoke
def test_write_and_read_minimal_patch(tmp_path):
    patch = DNAPatch.from_dict(_minimal_patch_dict())
    out = tmp_path / "test.dna"
    write_dna(patch, str(out))
    assert out.exists()

    loaded = read_dna(str(out))
    assert loaded.schema_version == SCHEMA_VERSION
    assert loaded.patch_id == "test-uuid-1"
    assert loaded.name == "test patch"


@pytest.mark.smoke
def test_round_trip_preserves_complex_graph(tmp_path):
    d = _minimal_patch_dict()
    d["graph"] = {
        "nodes": [
            {"id": "n1", "type": "hue_shift", "params": {"shift": 30}},
            {"id": "n2", "type": "blur", "params": {"radius": 5}},
        ],
        "edges": [{"src": "n1", "dst": "n2"}],
    }
    patch = DNAPatch.from_dict(d)
    out = tmp_path / "complex.dna"
    write_dna(patch, str(out))
    loaded = read_dna(str(out))
    assert loaded.graph == d["graph"]


@pytest.mark.smoke
def test_round_trip_preserves_lanes_and_params(tmp_path):
    d = _minimal_patch_dict()
    d["lanes"] = [
        {
            "id": "L1",
            "paramPath": "fx-blur.radius",
            "points": [
                {"t": 0.0, "value": 0.0},
                {"t": 1.0, "value": 1.0},
            ],
        },
    ]
    d["params"] = {"fx-blur.radius": 0.5}
    patch = DNAPatch.from_dict(d)
    out = tmp_path / "lanes.dna"
    write_dna(patch, str(out))
    loaded = read_dna(str(out))
    assert loaded.lanes == d["lanes"]
    assert loaded.params == d["params"]


# ---------------------------------------------------------------------------
# Forward/backward compat — unknown field preservation
# ---------------------------------------------------------------------------


@pytest.mark.smoke
def test_unknown_top_level_fields_preserved_round_trip(tmp_path):
    """Forward-compat: newer fields should round-trip through older readers."""
    d = _minimal_patch_dict()
    d["future_field_v2"] = {"experimental": "data"}
    d["another_unknown"] = [1, 2, 3]

    patch = DNAPatch.from_dict(d)
    assert patch._unknown_fields == {
        "future_field_v2": {"experimental": "data"},
        "another_unknown": [1, 2, 3],
    }

    out = tmp_path / "future.dna"
    write_dna(patch, str(out))
    loaded = read_dna(str(out))
    assert loaded._unknown_fields == patch._unknown_fields

    # Re-serializing also preserves
    out2 = tmp_path / "future2.dna"
    write_dna(loaded, str(out2))
    loaded2 = read_dna(str(out2))
    assert loaded2._unknown_fields == patch._unknown_fields


@pytest.mark.smoke
def test_writer_emits_required_fields():
    """Missing required field → DNAFormatError."""
    patch = DNAPatch(schema_version=SCHEMA_VERSION, patch_id="x", name="x")
    # Required all present (defaults are valid)
    assert {
        "schema_version",
        "patch_id",
        "name",
        "graph",
        "routing",
        "lanes",
        "params",
        "budget",
    } <= patch.to_dict().keys()


# ---------------------------------------------------------------------------
# Version handling
# ---------------------------------------------------------------------------


@pytest.mark.smoke
def test_unsupported_version_raises():
    d = _minimal_patch_dict()
    d["schema_version"] = "99.0.0"
    with pytest.raises(DNAVersionError):
        DNAPatch.from_dict(d)


# ---------------------------------------------------------------------------
# Corrupted files
# ---------------------------------------------------------------------------


@pytest.mark.smoke
def test_bad_magic_raises(tmp_path):
    bad = tmp_path / "bad.dna"
    bad.write_bytes(b"XXXX" + b"\x00" * 100)
    with pytest.raises(DNAFormatError, match="magic"):
        read_dna(str(bad))


@pytest.mark.smoke
def test_truncated_header_raises(tmp_path):
    bad = tmp_path / "truncated.dna"
    bad.write_bytes(MAGIC + b"\x00\x00")  # short header
    with pytest.raises(DNAFormatError, match="header"):
        read_dna(str(bad))


@pytest.mark.smoke
def test_truncated_payload_raises(tmp_path):
    bad = tmp_path / "truncated.dna"
    # magic + length=1000, but no payload
    bad.write_bytes(MAGIC + struct.pack("<I", 1000) + b"")
    with pytest.raises(DNAFormatError, match="truncated"):
        read_dna(str(bad))


@pytest.mark.smoke
def test_corrupt_gzip_raises(tmp_path):
    bad = tmp_path / "corrupt.dna"
    junk = b"not gzipped data here"
    bad.write_bytes(MAGIC + struct.pack("<I", len(junk)) + junk)
    with pytest.raises(DNAFormatError, match="gzip"):
        read_dna(str(bad))


@pytest.mark.smoke
def test_non_object_json_raises(tmp_path):
    """`.dna` JSON must be an object, not array/number/etc."""
    bad = tmp_path / "wrong-shape.dna"
    raw_json = b"[1, 2, 3]"
    gz = gzip.compress(raw_json)
    bad.write_bytes(MAGIC + struct.pack("<I", len(gz)) + gz)
    with pytest.raises(DNAFormatError, match="object"):
        read_dna(str(bad))


# ---------------------------------------------------------------------------
# Budget descriptor (SG-2)
# ---------------------------------------------------------------------------


@pytest.mark.smoke
def test_default_budget_shape():
    b = default_budget()
    assert isinstance(b, BudgetDescriptor)
    assert b.estimated_memory_mb >= 0
    assert b.requires_l_backbones == ()


@pytest.mark.smoke
def test_validate_budget_minimal():
    raw = {
        "estimated_memory_mb": 100,
        "estimated_gpu_textures": 5,
        "estimated_grains": 0,
        "requires_l_backbones": [],
        "min_apple_silicon_tier": None,
    }
    b = validate_budget(raw)
    assert b.estimated_memory_mb == 100


@pytest.mark.smoke
def test_validate_budget_with_l_backbones():
    raw = {
        "estimated_memory_mb": 500,
        "estimated_gpu_textures": 20,
        "estimated_grains": 100,
        "requires_l_backbones": ["dinov2", "clip"],
        "min_apple_silicon_tier": "M2_Max",
    }
    b = validate_budget(raw)
    assert b.requires_l_backbones == ("dinov2", "clip")
    assert b.min_apple_silicon_tier == "M2_Max"


@pytest.mark.smoke
def test_validate_budget_unknown_backbone_raises():
    with pytest.raises(ValueError, match="unknown L backbone"):
        validate_budget({"requires_l_backbones": ["bogus"]})


@pytest.mark.smoke
def test_validate_budget_unknown_tier_raises():
    with pytest.raises(ValueError, match="unknown tier"):
        validate_budget({"min_apple_silicon_tier": "M99"})


@pytest.mark.smoke
def test_validate_budget_negative_memory_raises():
    with pytest.raises(ValueError, match="non-negative"):
        validate_budget({"estimated_memory_mb": -10})


@pytest.mark.smoke
def test_validate_budget_non_dict_raises():
    with pytest.raises(ValueError, match="must be a dict"):
        validate_budget([1, 2, 3])  # type: ignore[arg-type]


@pytest.mark.smoke
def test_budget_round_trip_through_dna(tmp_path):
    d = _minimal_patch_dict()
    d["budget"] = {
        "estimated_memory_mb": 350,
        "estimated_gpu_textures": 12,
        "estimated_grains": 64,
        "requires_l_backbones": ["dinov2"],
        "min_apple_silicon_tier": "M2",
    }
    patch = DNAPatch.from_dict(d)
    out = tmp_path / "budget.dna"
    write_dna(patch, str(out))
    loaded = read_dna(str(out))
    assert loaded.budget == d["budget"]
