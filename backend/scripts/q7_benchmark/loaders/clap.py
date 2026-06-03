"""CLAP HTSAT-base audio-text backbone (512-dim embedding).

PR #3: MockCLAPLoader returns deterministic synthetic embeddings.
PR #14: CLAPLoader.encode() lit up via lazy torch + transformers + HF.
        Uses `transformers.ClapModel` + `ClapProcessor`.

Payload shape:
  - {'audio': np.ndarray, 'sample_rate': int}  → audio embedding
  - {'text': str | list[str]}                  → text embedding
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

CLAP_SAMPLE_RATE = 48000
CLAP_MIN_DURATION_S = 3.0
CLAP_MIN_SAMPLES = int(CLAP_SAMPLE_RATE * CLAP_MIN_DURATION_S)


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
    """Real CLAP HTSAT-base loader (PR #14 light-up)."""

    name = "clap"
    modality = "audio_text"

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
            from transformers import ClapModel, ClapProcessor
            from huggingface_hub import snapshot_download
        except ImportError as exc:
            raise NotImplementedError(
                "Real CLAP encode requires torch + transformers + huggingface_hub. "
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

        self._model = ClapModel.from_pretrained(str(cache_dir))
        self._processor = ClapProcessor.from_pretrained(str(cache_dir))
        self._model.eval()

        if self._backend == "mps" and torch.backends.mps.is_available():
            self._model = self._model.to("mps")
            self._device = "mps"
        else:
            self._device = "cpu"

        self.cold_load_seconds = time.perf_counter() - start

    def _encode_audio(self, audio: np.ndarray, sample_rate: int):
        import torch

        if sample_rate != CLAP_SAMPLE_RATE:
            raise ValueError(
                f"CLAP requires {CLAP_SAMPLE_RATE} Hz audio; got {sample_rate}. "
                "Caller must resample before calling encode."
            )
        if audio.ndim != 1:
            if audio.ndim == 2 and audio.shape[1] in (1, 2):
                audio = audio.mean(axis=1).astype(np.float32)
            else:
                raise ValueError(
                    f"CLAP audio must be 1D (mono) or 2D (Nx1 / Nx2); got shape {audio.shape}"
                )
        if audio.dtype != np.float32:
            audio = audio.astype(np.float32)
        if audio.size < CLAP_MIN_SAMPLES:
            raise ValueError(
                f"CLAP requires >= {CLAP_MIN_DURATION_S}s of audio "
                f"({CLAP_MIN_SAMPLES} samples); got {audio.size} "
                f"({audio.size / CLAP_SAMPLE_RATE:.2f}s)"
            )

        inputs = self._processor(
            audios=audio, sampling_rate=CLAP_SAMPLE_RATE, return_tensors="pt"
        ).to(self._device)
        with torch.no_grad():
            features = self._model.get_audio_features(**inputs)
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
            if "audio" in payload:
                audio = payload["audio"]
                sample_rate = int(payload.get("sample_rate", CLAP_SAMPLE_RATE))
                features = self._encode_audio(np.asarray(audio), sample_rate)
            elif "text" in payload:
                features = self._encode_text(payload["text"])
            else:
                raise TypeError("CLAP payload dict must contain 'audio' or 'text' key")
        else:
            raise TypeError(
                f"CLAP encode expects {{'audio': ...}} or {{'text': ...}}; got {type(payload)}"
            )

        embedding = features.squeeze(0).cpu().numpy().astype(np.float32)
        norm = float(np.linalg.norm(embedding))
        if norm > 0:
            embedding = embedding / norm

        elapsed_ms = (time.perf_counter() - start) * 1000.0
        return LoaderResult(
            embedding=embedding, elapsed_ms=elapsed_ms, backend_name=self._device
        )
