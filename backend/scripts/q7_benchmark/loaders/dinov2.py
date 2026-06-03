"""DINOv2 ViT-S/14 vision backbone (384-dim embedding).

PR #3: MockDINOv2Loader returns deterministic synthetic embeddings.
PR #6: DINOv2Loader.encode() lit up via lazy torch + transformers + HF
       download. Real inference path active when those deps are installed
       (via requirements-q7-measure.txt); raises NotImplementedError with
       a clear install hint otherwise.
"""

from __future__ import annotations

import random
import time

import numpy as np

from . import ModelEntry
from ._base import LoaderResult
from .cache import (
    load_verified_marker,
    resolve_cache_dir,
    verify_manifest,
    write_verified_marker,
)

IMAGENET_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
IMAGENET_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)


class MockDINOv2Loader:
    """Deterministic synthetic DINOv2. Smoke-tier; no torch/mlx required."""

    name = "dinov2"
    modality = "vision"
    cold_load_seconds: float | None = 0.0

    def __init__(self, entry: ModelEntry):
        self._entry = entry
        self.embed_dim = entry.embed_dim
        self._rng = random.Random(f"mock-dinov2-{entry.revision}")

    def encode(self, payload) -> LoaderResult:
        start = time.monotonic()
        vec = np.array(
            [self._rng.uniform(-1.0, 1.0) for _ in range(self.embed_dim)],
            dtype=np.float32,
        )
        norm = np.linalg.norm(vec)
        if norm > 0:
            vec /= norm
        elapsed_ms = (time.monotonic() - start) * 1000.0
        return LoaderResult(embedding=vec, elapsed_ms=elapsed_ms, backend_name="mock")


def _preprocess_frame(frame: np.ndarray) -> np.ndarray:
    """HxWx3 uint8 BGR (OpenCV convention) → 1x3x224x224 float32 ImageNet-normalized."""
    if frame.ndim == 2:
        frame = np.stack([frame] * 3, axis=-1)
    if frame.shape[-1] == 4:
        frame = frame[..., :3]
    if frame.shape[-1] != 3:
        raise ValueError(
            f"frame must be HxWx3 (got shape {frame.shape}); convert before encode"
        )

    from PIL import Image

    if frame.dtype != np.uint8:
        frame = np.clip(frame, 0, 255).astype(np.uint8)
    img = Image.fromarray(frame)
    img = img.resize((224, 224), Image.BILINEAR)
    arr = np.asarray(img, dtype=np.float32) / 255.0

    arr = (arr - IMAGENET_MEAN) / IMAGENET_STD
    arr = np.transpose(arr, (2, 0, 1))[None, :, :, :]
    return arr.astype(np.float32)


class DINOv2Loader:
    """Real DINOv2 ViT-S/14 loader (PR #6 light-up).

    Lazy-imports torch + transformers + huggingface_hub on first encode.
    If those deps aren't installed, raises NotImplementedError with an
    install hint pointing to requirements-q7-measure.txt.
    """

    name = "dinov2"
    modality = "vision"

    def __init__(self, entry: ModelEntry, *, backend: str):
        self._entry = entry
        self._backend = backend
        self.embed_dim = entry.embed_dim
        self.cold_load_seconds: float | None = None
        self._model = None
        self._device = "cpu"

    def _lazy_load(self) -> None:
        try:
            import torch
            from transformers import AutoModel
            from huggingface_hub import snapshot_download
        except ImportError as exc:
            raise NotImplementedError(
                "Real DINOv2 encode requires torch + transformers + huggingface_hub. "
                "Install via: pip install -r backend/scripts/q7_benchmark/requirements-q7-measure.txt "
                f"(missing: {exc.name})"
            ) from exc

        start = time.perf_counter()
        cache_dir = resolve_cache_dir(self._entry.name, self._entry.revision)
        marker = load_verified_marker(cache_dir)

        if marker is None:
            revision = self._entry.revision
            use_revision = None if revision.startswith("PLACEHOLDER") else revision
            snapshot_download(
                repo_id=self._entry.hf_repo,
                revision=use_revision,
                local_dir=str(cache_dir),
                local_dir_use_symlinks=False,
            )
            verify_manifest(cache_dir, {})
            write_verified_marker(cache_dir, {}, backend_name=self._backend)

        self._model = AutoModel.from_pretrained(str(cache_dir))
        self._model.eval()

        if self._backend == "mps" and torch.backends.mps.is_available():
            self._model = self._model.to("mps")
            self._device = "mps"
        else:
            self._device = "cpu"

        self.cold_load_seconds = time.perf_counter() - start

    def encode(self, payload) -> LoaderResult:
        if self._model is None:
            self._lazy_load()

        import torch

        if isinstance(payload, dict) and "image" in payload:
            frame = payload["image"]
        else:
            frame = payload

        if not isinstance(frame, np.ndarray):
            raise TypeError(
                f"DINOv2 encode expects np.ndarray or {{'image': np.ndarray}}, got {type(frame)}"
            )

        start = time.perf_counter()
        preprocessed = _preprocess_frame(frame)
        tensor = torch.from_numpy(preprocessed).to(self._device)
        with torch.no_grad():
            outputs = self._model(tensor)
            if hasattr(outputs, "pooler_output") and outputs.pooler_output is not None:
                embedding = outputs.pooler_output
            else:
                embedding = outputs.last_hidden_state[:, 0]

        embedding = embedding.squeeze(0).cpu().numpy().astype(np.float32)
        norm = float(np.linalg.norm(embedding))
        if norm > 0:
            embedding = embedding / norm

        elapsed_ms = (time.perf_counter() - start) * 1000.0
        return LoaderResult(
            embedding=embedding, elapsed_ms=elapsed_ms, backend_name=self._device
        )
