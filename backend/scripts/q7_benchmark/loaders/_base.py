"""Loader Protocol + shared types for Q7 backbones.

Every Q7 backbone exposes the same shape: name, embed_dim, encode(input).
A Protocol (not an ABC) keeps the interface duck-typed so MLX and PyTorch
implementations can coexist without inheriting from a common base. The
mock implementations in this package satisfy the Protocol implicitly.

Heavy deps (torch, transformers, mlx) are NOT imported here — concrete
loaders defer those imports until first `encode()` call so smoke-tier CI
can import this module without GPU runtime.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol, runtime_checkable

import numpy as np


@dataclass(frozen=True)
class LoaderResult:
    """Outcome of a single encode call.

    Carries the embedding plus metadata the runner needs for the report
    (per-call wall time + which backend produced this result).
    """

    embedding: np.ndarray
    elapsed_ms: float
    backend_name: str


@runtime_checkable
class Loader(Protocol):
    """Structural type every Q7 backbone implements.

    Implementations:
      - DINOv2Loader (vision; image → 384-dim)
      - CLIPLoader (vision_text; image OR text → 512-dim)
      - CLAPLoader (audio_text; audio OR text → 512-dim)

    Each has a Mock<Name>Loader counterpart for CI smoke.
    """

    name: str
    embed_dim: int
    modality: str  # 'vision' | 'vision_text' | 'audio_text'
    cold_load_seconds: float | None  # set after first real load; None until then

    def encode(self, payload: Any) -> LoaderResult:
        """Encode a payload to an embedding.

        Payload shape depends on modality:
          - vision: np.ndarray (H, W, 3) uint8 OR (H, W, 3) float32
          - vision_text: dict with {'image': arr} OR {'text': str}
          - audio_text: dict with {'audio': arr_48k_float32} OR {'text': str}
        """
        ...


class ModelIntegrityError(Exception):
    """Raised when a downloaded model's SHA-256 doesn't match the manifest."""

    def __init__(self, file: str, expected_sha: str, actual_sha: str):
        self.file = file
        self.expected_sha = expected_sha
        self.actual_sha = actual_sha
        super().__init__(
            f"Model integrity check failed for {file}: "
            f"expected {expected_sha[:12]}..., got {actual_sha[:12]}..."
        )
