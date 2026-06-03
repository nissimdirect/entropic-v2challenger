"""Q7 backbone loader factory.

Public API:
  - make_loader(name, *, backend) -> Loader
  - Loader (Protocol from _base)
  - LoaderResult, ModelIntegrityError (re-exported from _base)
  - load_model_registry() -> dict[str, ModelEntry]

Heavy ML deps (torch, transformers, mlx) are NEVER imported at module top.
Concrete loaders defer those imports until first `encode()` call so smoke-
tier CI can import this package without GPU runtime.
"""

from __future__ import annotations

import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from ._base import Loader, LoaderResult, ModelIntegrityError

# Stdlib tomllib (Python 3.11+); pyproject.toml floors Q7 at 3.12.
if sys.version_info >= (3, 11):
    import tomllib
else:  # pragma: no cover — Q7 requires 3.12+ per DEC-Q7-002
    raise RuntimeError("Q7 requires Python 3.11+ for tomllib")


@dataclass(frozen=True)
class ModelEntry:
    name: str
    hf_repo: str
    revision: str
    embed_dim: int
    modality: str
    size_mb_estimate: int
    license: str
    # Modality-specific knobs (None when not applicable):
    input_resolution: int | None = None
    input_sample_rate: int | None = None
    input_min_duration_s: float | None = None


def load_model_registry() -> dict[str, ModelEntry]:
    """Read models.toml and return a name -> ModelEntry map."""
    registry_path = Path(__file__).parent / "models.toml"
    raw = tomllib.loads(registry_path.read_text())
    return {
        name: ModelEntry(
            name=name,
            hf_repo=entry["hf_repo"],
            revision=entry["revision"],
            embed_dim=entry["embed_dim"],
            modality=entry["modality"],
            size_mb_estimate=entry["size_mb_estimate"],
            license=entry["license"],
            input_resolution=entry.get("input_resolution"),
            input_sample_rate=entry.get("input_sample_rate"),
            input_min_duration_s=entry.get("input_min_duration_s"),
        )
        for name, entry in raw.items()
    }


KNOWN_MODELS = frozenset({"dinov2", "clip", "clap"})
BackendName = Literal["mlx", "mps", "cpu", "mock"]


def make_loader(name: str, *, backend: BackendName) -> Loader:
    """Construct a loader for the given model name + backend.

    For backend='mock', returns a deterministic synthetic implementation.
    For backend in {'mlx', 'mps', 'cpu'}, returns the real loader (which
    will lazy-import torch / mlx on first encode call — PR #3 ships the
    structural seam; the actual encode path lights up in PR #4).
    """
    if name not in KNOWN_MODELS:
        raise ValueError(f"unknown model {name!r}; known: {sorted(KNOWN_MODELS)}")
    registry = load_model_registry()
    entry = registry[name]

    if backend == "mock":
        # Lazy import to keep this file import-light.
        if name == "dinov2":
            from .dinov2 import MockDINOv2Loader

            return MockDINOv2Loader(entry)
        if name == "clip":
            from .clip import MockCLIPLoader

            return MockCLIPLoader(entry)
        if name == "clap":
            from .clap import MockCLAPLoader

            return MockCLAPLoader(entry)

    # Real backend selected — PR #3 ships the seam; PR #4 lights up encode().
    if name == "dinov2":
        from .dinov2 import DINOv2Loader

        return DINOv2Loader(entry, backend=backend)
    if name == "clip":
        from .clip import CLIPLoader

        return CLIPLoader(entry, backend=backend)
    if name == "clap":
        from .clap import CLAPLoader

        return CLAPLoader(entry, backend=backend)

    raise RuntimeError(f"unreachable: name={name} backend={backend}")


__all__ = [
    "Loader",
    "LoaderResult",
    "ModelEntry",
    "ModelIntegrityError",
    "load_model_registry",
    "make_loader",
    "KNOWN_MODELS",
]
