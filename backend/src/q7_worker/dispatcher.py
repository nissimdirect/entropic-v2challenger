"""Encode-request dispatcher for the Q7 L worker process (PR #9).

Routes incoming ZMQ requests to the right Loader. Caches loaded loaders
across calls so we only pay the cold-load once. Handles BACKEND_NOT_LIT
errors gracefully (returns an `ok: False` JSON response instead of
crashing the worker).

Per DEC-Q7-008 separate-process topology: the dispatcher runs INSIDE the
L worker process (`backend/src/q7_worker/__main__.py`); the render
sidecar (`backend/src/main.py`) is a sibling that NEVER imports this
module. SG-4 audio-thread isolation is satisfied by the process boundary.
"""

from __future__ import annotations

import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np


# Add backend/scripts to sys.path so we can import q7_benchmark.loaders.
# The worker package is `backend/src/q7_worker`; the loader factory is
# `backend/scripts/q7_benchmark/loaders/__init__.py`. PR #11 may move
# loaders into `backend/src/inference/` for cleaner separation.
_SCRIPTS_DIR = Path(__file__).resolve().parents[2] / "scripts"
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))


def _decode_image_payload(payload: dict) -> np.ndarray:
    """Frontend sends image as base64 OR raw list. Decode to HxWx3 uint8."""
    if "image_b64" in payload:
        import base64

        raw = base64.b64decode(payload["image_b64"])
        h = int(payload.get("height", 224))
        w = int(payload.get("width", 224))
        arr = np.frombuffer(raw, dtype=np.uint8).reshape(h, w, 3)
        return arr
    if "image" in payload:
        arr = np.asarray(payload["image"], dtype=np.uint8)
        return arr
    raise ValueError("encode payload missing 'image_b64' or 'image' field")


def _decode_audio_payload(payload: dict) -> tuple[np.ndarray, int]:
    """Frontend sends audio as base64 (float32) OR raw list."""
    if "audio_b64" in payload:
        import base64

        raw = base64.b64decode(payload["audio_b64"])
        arr = np.frombuffer(raw, dtype=np.float32)
        rate = int(payload.get("sample_rate", 48000))
        return arr, rate
    if "audio" in payload:
        arr = np.asarray(payload["audio"], dtype=np.float32)
        rate = int(payload.get("sample_rate", 48000))
        return arr, rate
    raise ValueError("encode payload missing 'audio_b64' or 'audio' field")


@dataclass
class DispatcherStats:
    """Lightweight stats for telemetry; surfaced via the worker `stats` cmd."""

    encode_count: int = 0
    encode_errors: int = 0
    cold_load_count: int = 0
    last_encode_at: float | None = None
    last_error: str | None = None


@dataclass
class Dispatcher:
    """Routes encode requests to cached Loader instances.

    Construct ONCE per worker process. Use via `handle_encode(payload)`.
    """

    backend: str = "cpu"  # MLX → MPS → CPU per DEC-Q7-004
    _loaders: dict[str, Any] = field(default_factory=dict)
    stats: DispatcherStats = field(default_factory=DispatcherStats)

    def get_loader(self, model_name: str) -> Any:
        """Return the (cached) loader for a backbone, lazy-creating as needed."""
        if model_name not in self._loaders:
            from q7_benchmark.loaders import make_loader  # type: ignore[import-not-found]

            self._loaders[model_name] = make_loader(model_name, backend=self.backend)
            self.stats.cold_load_count += 1
        return self._loaders[model_name]

    def handle_encode(self, payload: dict) -> dict:
        """Process an encode request. Returns a JSON-serializable dict."""
        model_name = str(payload.get("model", "dinov2"))
        try:
            loader = self.get_loader(model_name)
        except ValueError as exc:
            self.stats.encode_errors += 1
            self.stats.last_error = f"unknown model: {model_name}"
            return {"ok": False, "error": str(exc), "model": model_name}

        try:
            if model_name == "dinov2":
                frame = _decode_image_payload(payload)
                encode_input: Any = frame
            elif model_name == "clip":
                if "text" in payload:
                    encode_input = {"text": payload["text"]}
                else:
                    encode_input = {"image": _decode_image_payload(payload)}
            elif model_name == "clap":
                if "text" in payload:
                    encode_input = {"text": payload["text"]}
                else:
                    audio, rate = _decode_audio_payload(payload)
                    encode_input = {"audio": audio, "sample_rate": rate}
            else:
                return {"ok": False, "error": f"unknown model: {model_name}"}
        except (ValueError, TypeError) as exc:
            self.stats.encode_errors += 1
            self.stats.last_error = str(exc)
            return {
                "ok": False,
                "error": f"payload decode failed: {exc}",
                "model": model_name,
            }

        try:
            result = loader.encode(encode_input)
        except NotImplementedError as exc:
            self.stats.encode_errors += 1
            self.stats.last_error = f"BACKEND_NOT_LIT: {exc}"
            return {
                "ok": False,
                "error": "BACKEND_NOT_LIT",
                "detail": str(exc),
                "model": model_name,
            }
        except Exception as exc:  # noqa: BLE001
            self.stats.encode_errors += 1
            self.stats.last_error = f"{type(exc).__name__}: {exc}"
            return {
                "ok": False,
                "error": f"{type(exc).__name__}: {exc}",
                "model": model_name,
            }

        self.stats.encode_count += 1
        self.stats.last_encode_at = time.time()
        return {
            "ok": True,
            "model": model_name,
            "embed_dim": int(loader.embed_dim),
            "embedding": result.embedding.tolist(),
            "elapsed_ms": float(result.elapsed_ms),
            "backend_name": str(result.backend_name),
            "cold_load_seconds": loader.cold_load_seconds,
        }

    def handle_stats(self) -> dict:
        """Return current dispatcher stats."""
        return {
            "ok": True,
            "loaded_backbones": sorted(self._loaders.keys()),
            "encode_count": self.stats.encode_count,
            "encode_errors": self.stats.encode_errors,
            "cold_load_count": self.stats.cold_load_count,
            "last_encode_at": self.stats.last_encode_at,
            "last_error": self.stats.last_error,
        }
