"""Model cache resolution + integrity verification.

Cache location: `~/.entropic/models/q7/<name>/<revision_sha[:12]>/`
Matches the existing entropic convention (`~/.entropic/` already houses
crash dumps + logs per CLAUDE.md).

Verification is SHA-256 over weight files compared against a manifest
read from `verified.json` in the cache directory (written on first
successful download). PR #3 ships the verification function as a no-op
when the manifest is empty (placeholder state); PR #4 populates real
SHAs from the first --measure run.
"""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
from typing import Iterable

from ._base import ModelIntegrityError


def cache_root() -> Path:
    """Resolve the Q7 model cache root. Honors XDG_CACHE_HOME if set."""
    override = os.environ.get("ENTROPIC_Q7_CACHE_DIR")
    if override:
        return Path(override).expanduser().resolve()
    return Path.home() / ".entropic" / "models" / "q7"


def resolve_cache_dir(model_name: str, revision: str) -> Path:
    """Return the path for a model + revision, creating it idempotently.

    Uses the first 12 chars of revision so paths stay short. Caller is
    responsible for using the SAME revision string consistently — we don't
    canonicalize (e.g., we don't lowercase or strip).
    """
    if not model_name or not revision:
        raise ValueError(
            f"model_name and revision required, got {model_name!r}, {revision!r}"
        )
    rev_short = revision[:12]
    path = cache_root() / model_name / rev_short
    path.mkdir(parents=True, exist_ok=True)
    return path


def compute_sha256(file_path: Path, chunk_size: int = 1024 * 1024) -> str:
    """Stream a file through SHA-256 and return the hex digest."""
    sha = hashlib.sha256()
    with file_path.open("rb") as f:
        while True:
            chunk = f.read(chunk_size)
            if not chunk:
                break
            sha.update(chunk)
    return sha.hexdigest()


def verify_manifest(cache_dir: Path, manifest: dict[str, str]) -> None:
    """Verify each file in manifest matches its declared SHA-256.

    PR #3 contract: if manifest is empty, this is a no-op (PR #4 will
    populate real manifests). Raises ModelIntegrityError on mismatch.
    """
    if not manifest:
        # Placeholder state — accepted in PR #3, must be populated by PR #4.
        return
    for rel_path, expected_sha in manifest.items():
        file_path = cache_dir / rel_path
        if not file_path.exists():
            raise ModelIntegrityError(str(file_path), expected_sha, "<missing>")
        actual_sha = compute_sha256(file_path)
        if actual_sha != expected_sha:
            raise ModelIntegrityError(str(file_path), expected_sha, actual_sha)


def load_verified_marker(cache_dir: Path) -> dict | None:
    """Read verified.json (the local marker written on successful download).

    Returns None if the marker doesn't exist (model not yet downloaded
    or not yet verified).
    """
    marker = cache_dir / "verified.json"
    if not marker.exists():
        return None
    return json.loads(marker.read_text())


def write_verified_marker(
    cache_dir: Path, manifest: dict[str, str], backend_name: str
) -> None:
    """Persist the verification marker after a successful integrity check."""
    import time

    marker = cache_dir / "verified.json"
    marker.write_text(
        json.dumps(
            {
                "manifest_sha256": manifest,
                "verified_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "backend_used_at_verification": backend_name,
            },
            indent=2,
            sort_keys=True,
        )
    )


def list_weight_files(cache_dir: Path) -> Iterable[Path]:
    """Yield weight files (safetensors / bin / pt) under the cache dir."""
    for ext in ("*.safetensors", "*.bin", "*.pt"):
        yield from cache_dir.glob(ext)
