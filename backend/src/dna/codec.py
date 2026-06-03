"""`.dna` codec — magic + gzip + JSON with strict no-regression compat.

Per SPEC-6. File layout:

  [4 bytes: magic 'DNA1']
  [4 bytes: gzipped JSON length (uint32 little-endian)]
  [N bytes: gzipped UTF-8 JSON]

The JSON top level shape:

  {
    "schema_version": "1.0.0",
    "patch_id": "uuid-string",
    "name": "user-visible patch name",
    "graph": { ... },        // effect graph
    "routing": { ... },      // automation/modulation routing
    "lanes": [ ... ],        // automation lanes
    "params": { ... },       // effect parameter values
    "budget": { ... },       // SG-2 resource budget (see budget.py)
    "embeddings": { ... },   // optional CLIP/CLAP/DINOv2 reference vectors
    "_unknown_fields": { ... }  // round-trip preservation for forward-compat
  }

Forward/backward-compat contract:
- Readers MUST round-trip unknown top-level fields verbatim on save
- Writers MUST emit every required field for the current `schema_version`
- New fields MUST be optional + readers MUST preserve them
- Field renames are FORBIDDEN — add a new name, keep the old as alias
"""

from __future__ import annotations

import gzip
import json
import struct
from dataclasses import dataclass, field, asdict
from typing import Any

MAGIC = b"DNA1"
MAGIC_LEN = len(MAGIC)
LENGTH_HEADER_FMT = "<I"  # 4-byte little-endian uint32
LENGTH_HEADER_SIZE = struct.calcsize(LENGTH_HEADER_FMT)

SCHEMA_VERSION = "1.0.0"
SUPPORTED_SCHEMA_VERSIONS = frozenset({"1.0.0"})

# Fields the writer always emits at top-level (per the contract above)
REQUIRED_TOP_FIELDS = frozenset(
    {
        "schema_version",
        "patch_id",
        "name",
        "graph",
        "routing",
        "lanes",
        "params",
        "budget",
    }
)


class DNAFormatError(Exception):
    """Magic / length / corruption errors."""


class DNAVersionError(Exception):
    """Unsupported schema_version."""


@dataclass
class DNAPatch:
    """In-memory representation of a `.dna` patch."""

    schema_version: str = SCHEMA_VERSION
    patch_id: str = ""
    name: str = "unnamed-patch"
    graph: dict = field(default_factory=dict)
    routing: dict = field(default_factory=dict)
    lanes: list = field(default_factory=list)
    params: dict = field(default_factory=dict)
    budget: dict = field(default_factory=dict)
    embeddings: dict = field(default_factory=dict)
    _unknown_fields: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        out = {
            "schema_version": self.schema_version,
            "patch_id": self.patch_id,
            "name": self.name,
            "graph": self.graph,
            "routing": self.routing,
            "lanes": self.lanes,
            "params": self.params,
            "budget": self.budget,
        }
        if self.embeddings:
            out["embeddings"] = self.embeddings
        # Round-trip preserved unknown fields
        for k, v in self._unknown_fields.items():
            if k not in out:
                out[k] = v
        return out

    @classmethod
    def from_dict(cls, data: dict) -> "DNAPatch":
        version = data.get("schema_version")
        if version not in SUPPORTED_SCHEMA_VERSIONS:
            raise DNAVersionError(
                f"unsupported schema_version: {version!r} "
                f"(supported: {sorted(SUPPORTED_SCHEMA_VERSIONS)})"
            )
        # Capture every key that isn't part of the dataclass spec
        known_keys = {
            "schema_version",
            "patch_id",
            "name",
            "graph",
            "routing",
            "lanes",
            "params",
            "budget",
            "embeddings",
        }
        unknown = {k: v for k, v in data.items() if k not in known_keys}
        return cls(
            schema_version=str(version),
            patch_id=str(data.get("patch_id", "")),
            name=str(data.get("name", "unnamed-patch")),
            graph=dict(data.get("graph") or {}),
            routing=dict(data.get("routing") or {}),
            lanes=list(data.get("lanes") or []),
            params=dict(data.get("params") or {}),
            budget=dict(data.get("budget") or {}),
            embeddings=dict(data.get("embeddings") or {}),
            _unknown_fields=unknown,
        )


def write_dna(patch: DNAPatch, path: str) -> None:
    """Serialize a patch to a `.dna` file on disk."""
    payload = patch.to_dict()
    # Required fields must be present
    missing = REQUIRED_TOP_FIELDS - payload.keys()
    if missing:
        raise DNAFormatError(f"missing required fields: {sorted(missing)}")

    json_bytes = json.dumps(payload, ensure_ascii=False, sort_keys=True).encode("utf-8")
    gzipped = gzip.compress(json_bytes, compresslevel=6)
    with open(path, "wb") as f:
        f.write(MAGIC)
        f.write(struct.pack(LENGTH_HEADER_FMT, len(gzipped)))
        f.write(gzipped)


def read_dna(path: str) -> DNAPatch:
    """Parse a `.dna` file from disk into a DNAPatch."""
    with open(path, "rb") as f:
        magic = f.read(MAGIC_LEN)
        if magic != MAGIC:
            raise DNAFormatError(f"bad magic: expected {MAGIC!r}, got {magic!r}")
        header = f.read(LENGTH_HEADER_SIZE)
        if len(header) != LENGTH_HEADER_SIZE:
            raise DNAFormatError("truncated length header")
        (length,) = struct.unpack(LENGTH_HEADER_FMT, header)
        gzipped = f.read(length)
        if len(gzipped) != length:
            raise DNAFormatError(
                f"truncated payload: expected {length} bytes, got {len(gzipped)}"
            )
    try:
        json_bytes = gzip.decompress(gzipped)
    except OSError as exc:
        raise DNAFormatError(f"gzip decompression failed: {exc}") from exc
    try:
        data = json.loads(json_bytes.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise DNAFormatError(f"JSON parse failed: {exc}") from exc
    if not isinstance(data, dict):
        raise DNAFormatError(f"top-level must be a JSON object, got {type(data)}")
    return DNAPatch.from_dict(data)
