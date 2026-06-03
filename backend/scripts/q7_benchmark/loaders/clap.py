"""CLAP HTSAT-base audio-text backbone (512-dim embedding).

PR #3 contract:
  - MockCLAPLoader returns deterministic synthetic embeddings (smoke tier)
  - CLAPLoader.encode() raises NotImplementedError (PR #4 lights it up)

Payload shape (real + mock):
  - {'audio': np.ndarray, 'sample_rate': int} → audio embedding
  - {'text': str} → text embedding

Real implementation in PR #4 will:
  - Lazy-import torch + transformers (laion-clap is the canonical wrapper)
  - Verify input audio is >= 3s @ 48kHz (HTSAT-base minimum)
  - Resample to 48k if needed (kept simple — caller usually owns resampling)
  - Forward pass via ClapModel
  - Return (1, 512) embedding
"""

from __future__ import annotations

import random
import time

import numpy as np

from . import ModelEntry
from ._base import LoaderResult


def _normalize_payload_for_seed(payload) -> str:
    if isinstance(payload, dict):
        if "audio" in payload:
            arr = payload["audio"]
            return f"audio-{arr.shape}-{float(arr.mean()):.4f}"
        if "text" in payload:
            return f"text-{payload['text']!r}"
    return f"unknown-{type(payload).__name__}"


class MockCLAPLoader:
    """Deterministic synthetic CLAP. Smoke-tier; no torch/mlx required."""

    name = "clap"
    modality = "audio_text"
    cold_load_seconds: float | None = 0.0

    def __init__(self, entry: ModelEntry):
        self._entry = entry
        self.embed_dim = entry.embed_dim

    def encode(self, payload) -> LoaderResult:
        start = time.monotonic()
        seed = (
            f"mock-clap-{self._entry.revision}-{_normalize_payload_for_seed(payload)}"
        )
        rng = random.Random(seed)
        vec = np.array(
            [rng.uniform(-1.0, 1.0) for _ in range(self.embed_dim)],
            dtype=np.float32,
        )
        norm = np.linalg.norm(vec)
        if norm > 0:
            vec /= norm
        elapsed_ms = (time.monotonic() - start) * 1000.0
        return LoaderResult(embedding=vec, elapsed_ms=elapsed_ms, backend_name="mock")


class CLAPLoader:
    """Real CLAP HTSAT-base loader. PR #3 ships the seam; encode lights up in PR #4."""

    name = "clap"
    modality = "audio_text"

    def __init__(self, entry: ModelEntry, *, backend: str):
        self._entry = entry
        self._backend = backend
        self.embed_dim = entry.embed_dim
        self.cold_load_seconds: float | None = None
        self._model = None

    def encode(self, payload) -> LoaderResult:
        raise NotImplementedError(
            "Real CLAP encode lands in PR #4 (latency benchmark). "
            f"Backend selected: {self._backend!r}. "
            "For CI smoke, request a 'mock' backend via make_loader(..., backend='mock')."
        )
