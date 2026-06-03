"""CLIP ViT-B/32 vision-text backbone (512-dim embedding).

PR #3: MockCLIPLoader returns deterministic synthetic embeddings.
PR #13: CLIPLoader.encode() lit up via lazy torch + transformers + HF.
        Mirrors the DINOv2 pattern (PR #6).

Payload shape:
  - np.ndarray (H, W, 3)        → image embedding (raw frame)
  - {'image': np.ndarray}       → image embedding (explicit)
  - {'text': str | list[str]}   → text embedding
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


def _normalize_payload_for_seed(payload) -> str:
    """Derive a stable per-payload seed for deterministic mock embeddings."""
    if isinstance(payload, dict):
        if "image" in payload:
            arr = payload["image"]
            return f"image-{arr.shape}-{float(arr.mean()):.4f}"
        if "text" in payload:
            return f"text-{payload['text']!r}"
    if isinstance(payload, np.ndarray):
        return f"image-{payload.shape}-{float(payload.mean()):.4f}"
    return f"unknown-{type(payload).__name__}"


class MockCLIPLoader:
    """Deterministic synthetic CLIP. Smoke-tier; no torch/mlx required."""

    name = "clip"
    modality = "vision_text"
    cold_load_seconds: float | None = 0.0

    def __init__(self, entry: ModelEntry):
        self._entry = entry
        self.embed_dim = entry.embed_dim

    def encode(self, payload) -> LoaderResult:
        start = time.monotonic()
        seed = (
            f"mock-clip-{self._entry.revision}-{_normalize_payload_for_seed(payload)}"
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


class CLIPLoader:
    """Real CLIP ViT-B/32 loader (PR #13 light-up).

    Lazy-imports torch + transformers + huggingface_hub on first encode.
    Supports image (HxWx3 uint8) and text (str or list[str]) inputs.
    Returns L2-normalized 512-dim embedding.
    """

    name = "clip"
    modality = "vision_text"

    def __init__(self, entry: ModelEntry, *, backend: str):
        self._entry = entry
        self._backend = backend
        self.embed_dim = entry.embed_dim
        self.cold_load_seconds: float | None = None
        self._model = None
        self._processor = None
        self._device = "cpu"

    def _lazy_load(self) -> None:
        try:
            import torch
            from transformers import CLIPModel, CLIPProcessor
            from huggingface_hub import snapshot_download
        except ImportError as exc:
            raise NotImplementedError(
                "Real CLIP encode requires torch + transformers + huggingface_hub. "
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

        self._model = CLIPModel.from_pretrained(str(cache_dir))
        self._processor = CLIPProcessor.from_pretrained(str(cache_dir))
        self._model.eval()

        if self._backend == "mps" and torch.backends.mps.is_available():
            self._model = self._model.to("mps")
            self._device = "mps"
        else:
            self._device = "cpu"

        self.cold_load_seconds = time.perf_counter() - start

    def _encode_image(self, frame: np.ndarray):
        import torch
        from PIL import Image

        if frame.ndim == 2:
            frame = np.stack([frame] * 3, axis=-1)
        if frame.shape[-1] == 4:
            frame = frame[..., :3]
        if frame.shape[-1] != 3:
            raise ValueError(
                f"CLIP image must be HxWx3 (got {frame.shape}); convert before encode"
            )
        if frame.dtype != np.uint8:
            frame = np.clip(frame, 0, 255).astype(np.uint8)

        img = Image.fromarray(frame)
        inputs = self._processor(images=img, return_tensors="pt").to(self._device)
        with torch.no_grad():
            features = self._model.get_image_features(**inputs)
        return features

    def _encode_text(self, text):
        import torch

        if isinstance(text, str):
            text = [text]
        inputs = self._processor(
            text=text, return_tensors="pt", padding=True, truncation=True
        ).to(self._device)
        with torch.no_grad():
            features = self._model.get_text_features(**inputs)
        return features

    def encode(self, payload) -> LoaderResult:
        if self._model is None:
            self._lazy_load()

        start = time.perf_counter()

        if isinstance(payload, dict):
            if "image" in payload:
                features = self._encode_image(payload["image"])
            elif "text" in payload:
                features = self._encode_text(payload["text"])
            else:
                raise TypeError("CLIP payload dict must contain 'image' or 'text' key")
        elif isinstance(payload, np.ndarray):
            features = self._encode_image(payload)
        else:
            raise TypeError(
                f"CLIP encode expects np.ndarray, {{'image': ...}}, or {{'text': ...}}; "
                f"got {type(payload)}"
            )

        embedding = features.squeeze(0).cpu().numpy().astype(np.float32)
        norm = float(np.linalg.norm(embedding))
        if norm > 0:
            embedding = embedding / norm

        elapsed_ms = (time.perf_counter() - start) * 1000.0
        return LoaderResult(
            embedding=embedding, elapsed_ms=elapsed_ms, backend_name=self._device
        )
