"""DINOv2 ViT-S/14 vision backbone (384-dim embedding).

PR #3 contract:
  - MockDINOv2Loader returns deterministic synthetic embeddings (smoke tier)
  - DINOv2Loader.encode() raises NotImplementedError (PR #4 lights it up)

Real implementation in PR #4 will:
  - Lazy-import torch + transformers OR mlx + mlx_models per backend
  - Resolve cache dir via cache.resolve_cache_dir
  - Download via huggingface_hub on first encode
  - Verify SHA-256 manifest
  - Convert input frame to model input (resize to 224, ImageNet normalize)
  - Run forward pass, return (1, 384) embedding
"""

from __future__ import annotations

import random
import time

import numpy as np

from . import ModelEntry
from ._base import LoaderResult


class MockDINOv2Loader:
    """Deterministic synthetic DINOv2. Smoke-tier; no torch/mlx required."""

    name = "dinov2"
    modality = "vision"
    cold_load_seconds: float | None = 0.0

    def __init__(self, entry: ModelEntry):
        self._entry = entry
        self.embed_dim = entry.embed_dim
        # Hash the entry name + revision for cross-call determinism.
        self._rng = random.Random(f"mock-dinov2-{entry.revision}")

    def encode(self, payload) -> LoaderResult:
        """Return a deterministic synthetic embedding regardless of input shape."""
        start = time.monotonic()
        # Seeded random vector, then L2-normalized.
        vec = np.array(
            [self._rng.uniform(-1.0, 1.0) for _ in range(self.embed_dim)],
            dtype=np.float32,
        )
        norm = np.linalg.norm(vec)
        if norm > 0:
            vec /= norm
        elapsed_ms = (time.monotonic() - start) * 1000.0
        return LoaderResult(embedding=vec, elapsed_ms=elapsed_ms, backend_name="mock")


class DINOv2Loader:
    """Real DINOv2 ViT-S/14 loader. PR #3 ships the seam; encode lights up in PR #4."""

    name = "dinov2"
    modality = "vision"

    def __init__(self, entry: ModelEntry, *, backend: str):
        self._entry = entry
        self._backend = backend
        self.embed_dim = entry.embed_dim
        self.cold_load_seconds: float | None = None
        self._model = None  # lazy-loaded in PR #4

    def encode(self, payload) -> LoaderResult:
        raise NotImplementedError(
            "Real DINOv2 encode lands in PR #4 (latency benchmark). "
            f"Backend selected: {self._backend!r}. "
            "For CI smoke, request a 'mock' backend via make_loader(..., backend='mock')."
        )
