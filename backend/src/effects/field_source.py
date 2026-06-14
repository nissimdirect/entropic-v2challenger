"""P6.3 — C2 field sources: image/video ref → 2D field provider.

Resolves a ``FieldRef`` (from P6.2 field_params) into a 2D float32 numpy
array suitable for use as a modulation field in the render pipeline.

Pipeline per resolve():
    decode → luma (Rec.709) → bilinear-resize → apply gain → apply invert → clamp [0,1]

NaN/Inf safety: every decode path runs through ``np.nan_to_num`` + clamp.
Missing/corrupt sources → flat 0.5 field + logged warning (never crash).
Raw ``av.open`` is NEVER called here; all video decode goes through
``video.reader.VideoReader.decode_frame`` (SG-7-wrapped).
"""

from __future__ import annotations

import logging
import threading
import time
from collections import OrderedDict
from typing import Any

import numpy as np
import cv2

from effects.field_params import FieldRef
from video.codec_timeout import CodecTimeoutError
from video.image_reader import ImageReader, MAX_IMAGE_DIMENSION
from video.reader import VideoReader

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# LRU cache constants
# ---------------------------------------------------------------------------

FIELD_CACHE_MAX_ENTRIES: int = 64
FIELD_CACHE_MAX_BYTES: int = 256 * 1024 * 1024  # 256 MiB

# Frame-index bucket granularity: group consecutive frames together to improve
# cache reuse when effects run with slight frame-index drift.
_FRAME_BUCKET_SIZE: int = 1  # each frame index is its own bucket by default

# Rec. 709 luma weights (R, G, B)
_REC709_R: float = 0.2126
_REC709_G: float = 0.7152
_REC709_B: float = 0.0722


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _rgba_to_luma_float32(frame_rgba: np.ndarray) -> np.ndarray:
    """Convert RGBA uint8 (H, W, 4) → float32 luma (H, W) in [0, 1].

    Uses Rec. 709 weights: 0.2126·R + 0.7152·G + 0.0722·B.
    NaN/Inf sanitized via nan_to_num before returning.
    """
    # Pull RGB channels, promote to float32, normalise to [0, 1]
    r = frame_rgba[:, :, 0].astype(np.float32) / 255.0
    g = frame_rgba[:, :, 1].astype(np.float32) / 255.0
    b = frame_rgba[:, :, 2].astype(np.float32) / 255.0
    luma = _REC709_R * r + _REC709_G * g + _REC709_B * b
    luma = np.nan_to_num(luma, nan=0.0, posinf=1.0, neginf=0.0)
    return np.clip(luma, 0.0, 1.0)


def _resize_to_resolution(field: np.ndarray, width: int, height: int) -> np.ndarray:
    """Bilinear-resize a (H, W) float32 field to (height, width)."""
    if field.shape[0] == height and field.shape[1] == width:
        return field
    resized = cv2.resize(
        field,
        (width, height),
        interpolation=cv2.INTER_LINEAR,
    )
    return resized.astype(np.float32)


def _apply_gain_invert_clamp(
    field: np.ndarray, gain: float, invert: bool
) -> np.ndarray:
    """Apply gain scalar, optional invert, then clamp to [0, 1]."""
    result = field * gain
    if invert:
        result = 1.0 - result
    result = np.nan_to_num(result, nan=0.0, posinf=1.0, neginf=0.0)
    return np.clip(result, 0.0, 1.0)


def _flat_field(width: int, height: int, value: float = 0.5) -> np.ndarray:
    """Return a flat (height, width) float32 array filled with ``value``."""
    return np.full((height, width), value, dtype=np.float32)


def _field_bytes(field: np.ndarray) -> int:
    """Return the memory footprint of a field array in bytes."""
    return int(field.nbytes)


# ---------------------------------------------------------------------------
# LRU Cache
# ---------------------------------------------------------------------------


class _FieldLRUCache:
    """Thread-safe LRU cache bounded by both entry count and byte capacity.

    Eviction policy: LRU, applied when EITHER cap is exceeded.
    """

    def __init__(
        self,
        max_entries: int = FIELD_CACHE_MAX_ENTRIES,
        max_bytes: int = FIELD_CACHE_MAX_BYTES,
    ) -> None:
        self._max_entries = max_entries
        self._max_bytes = max_bytes
        # OrderedDict: key → (field, byte_size); LRU = leftmost
        self._store: OrderedDict[Any, tuple[np.ndarray, int]] = OrderedDict()
        self._total_bytes: int = 0
        self._hits: int = 0
        self._misses: int = 0
        self._evictions: int = 0
        self._lock = threading.Lock()

    def get(self, key: Any) -> np.ndarray | None:
        with self._lock:
            if key not in self._store:
                self._misses += 1
                return None
            # Move to end (most-recently-used)
            self._store.move_to_end(key)
            self._hits += 1
            return self._store[key][0]

    def put(self, key: Any, field: np.ndarray) -> None:
        byte_size = _field_bytes(field)
        with self._lock:
            if key in self._store:
                # Update in place — remove old bytes, add new
                old_bytes = self._store[key][1]
                self._total_bytes -= old_bytes
                del self._store[key]
            self._store[key] = (field, byte_size)
            self._store.move_to_end(key)
            self._total_bytes += byte_size
            # Evict LRU until within caps
            while (
                len(self._store) > self._max_entries
                or self._total_bytes > self._max_bytes
            ) and self._store:
                _, (_, evicted_bytes) = self._store.popitem(last=False)
                self._total_bytes -= evicted_bytes
                self._evictions += 1

    def stats(self) -> dict:
        with self._lock:
            return {
                "entries": len(self._store),
                "bytes": self._total_bytes,
                "hits": self._hits,
                "misses": self._misses,
                "evictions": self._evictions,
            }


# ---------------------------------------------------------------------------
# FieldProvider
# ---------------------------------------------------------------------------


class FieldProvider:
    """Resolves FieldRef objects into 2D float32 modulation fields.

    Usage::

        provider = FieldProvider()
        field = provider.resolve(ref, frame_index=0, resolution=(1920, 1080))

    The returned array has shape (height, width), dtype float32, values in [0, 1].

    Sources are keyed by ``ref.source_id``. The caller must register sources
    before resolving them::

        provider.register_image(source_id, path)
        provider.register_video(source_id, path)

    Missing sources (not registered, or I/O failure) return a flat 0.5 field.
    """

    def __init__(
        self,
        cache_max_entries: int = FIELD_CACHE_MAX_ENTRIES,
        cache_max_bytes: int = FIELD_CACHE_MAX_BYTES,
    ) -> None:
        self._cache = _FieldLRUCache(cache_max_entries, cache_max_bytes)
        # source_id → ImageReader | VideoReader
        self._sources: dict[str, ImageReader | VideoReader] = {}
        self._lock = threading.Lock()

    # ------------------------------------------------------------------
    # Source registration
    # ------------------------------------------------------------------

    def register_image(self, source_id: str, path: str) -> None:
        """Register a static image source. Raises on oversize or decode error."""
        reader = ImageReader(path)
        with self._lock:
            self._sources[source_id] = reader

    def register_video(self, source_id: str, path: str) -> None:
        """Register a video source. Raises on timeout / missing file."""
        reader = VideoReader(path)
        with self._lock:
            self._sources[source_id] = reader

    def register_reader(
        self, source_id: str, reader: ImageReader | VideoReader
    ) -> None:
        """Register a pre-constructed reader (useful for tests)."""
        with self._lock:
            self._sources[source_id] = reader

    # ------------------------------------------------------------------
    # Core resolution
    # ------------------------------------------------------------------

    def resolve(
        self,
        ref: FieldRef,
        frame_index: int,
        resolution: tuple[int, int],
    ) -> np.ndarray:
        """Return a (height, width) float32 field in [0, 1].

        Parameters
        ----------
        ref:
            The FieldRef describing source, gain, and invert.
        frame_index:
            Render frame index. For video sources this is wrapped modulo
            source frame count. For image sources it is ignored.
        resolution:
            (width, height) of the render output.

        Returns
        -------
        np.ndarray
            Shape (height, width), dtype float32, values in [0, 1].
            Never raises — missing/corrupt sources return flat 0.5.
        """
        width, height = resolution

        # lane2d: Tier 3 — reserved, not implemented in Phase 6
        if ref.kind == "lane2d":
            logger.warning(
                "FieldProvider: lane2d kind is reserved (Tier 3); "
                "returning flat 0.5 field for source_id=%r",
                ref.source_id,
            )
            return _flat_field(width, height)

        with self._lock:
            reader = self._sources.get(ref.source_id)

        if reader is None:
            logger.warning(
                "FieldProvider: unknown source_id=%r; returning flat 0.5 field",
                ref.source_id,
            )
            return _flat_field(width, height)

        # Source dimension guard (check reader dims BEFORE any decode)
        src_w = getattr(reader, "width", 0)
        src_h = getattr(reader, "height", 0)
        if src_w > MAX_IMAGE_DIMENSION or src_h > MAX_IMAGE_DIMENSION:
            logger.warning(
                "FieldProvider: source_id=%r dimensions %dx%d exceed max %d; "
                "returning flat 0.5 field",
                ref.source_id,
                src_w,
                src_h,
                MAX_IMAGE_DIMENSION,
            )
            return _flat_field(width, height)

        # Compute cache key
        if isinstance(reader, ImageReader):
            # Images are static — frame bucket is always 0
            bucket = 0
        else:
            # Video — wrap frame_index modulo frame_count
            frame_count = getattr(reader, "frame_count", 0) or 1
            actual_frame = int(frame_index) % frame_count
            bucket = actual_frame // _FRAME_BUCKET_SIZE

        cache_key = (ref.source_id, bucket, resolution)
        cached = self._cache.get(cache_key)
        if cached is not None:
            # Apply gain/invert at query time (not cached — allows param changes
            # without cache invalidation of the base luma field)
            return _apply_gain_invert_clamp(cached, ref.gain, ref.invert)

        # Cache miss — decode
        raw_luma = self._decode_luma(ref.source_id, reader, frame_index)
        if raw_luma is None:
            return _flat_field(width, height)

        # Resize to render resolution
        field = _resize_to_resolution(raw_luma, width, height)
        # Cache the base luma (pre-gain, pre-invert)
        self._cache.put(cache_key, field)

        return _apply_gain_invert_clamp(field, ref.gain, ref.invert)

    def _decode_luma(
        self,
        source_id: str,
        reader: ImageReader | VideoReader,
        frame_index: int,
    ) -> np.ndarray | None:
        """Decode a frame and convert to luma float32.

        Returns None on any error (missing source, timeout, corrupt frame).
        """
        try:
            if isinstance(reader, ImageReader):
                raw = reader.decode_frame(0)
            else:
                # Wrap frame index modulo source frame count
                frame_count = getattr(reader, "frame_count", 0) or 1
                actual_frame = int(frame_index) % frame_count
                raw = reader.decode_frame(actual_frame)
        except CodecTimeoutError as exc:
            logger.warning(
                "FieldProvider: SG-7 timeout decoding source_id=%r: %s; "
                "returning flat 0.5 field",
                source_id,
                exc,
            )
            return None
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "FieldProvider: decode error for source_id=%r: %s; "
                "returning flat 0.5 field",
                source_id,
                exc,
            )
            return None

        # Inject NaN/Inf safety before luma computation
        if raw.dtype != np.uint8:
            raw = np.clip(
                np.nan_to_num(
                    raw.astype(np.float32), nan=0.0, posinf=255.0, neginf=0.0
                ),
                0,
                255,
            ).astype(np.uint8)

        # Ensure RGBA shape — pad alpha channel if needed
        if raw.ndim == 2:
            # Grayscale: replicate to RGB, add alpha
            raw = np.stack([raw, raw, raw, np.full_like(raw, 255)], axis=2)
        elif raw.shape[2] == 3:
            alpha = np.full((*raw.shape[:2], 1), 255, dtype=np.uint8)
            raw = np.concatenate([raw, alpha], axis=2)

        return _rgba_to_luma_float32(raw)

    # ------------------------------------------------------------------
    # Cache introspection
    # ------------------------------------------------------------------

    def cache_stats(self) -> dict:
        """Return cache statistics.

        Returns
        -------
        dict with keys: entries, bytes, hits, misses, evictions.
        Invariant: bytes <= FIELD_CACHE_MAX_BYTES.
        """
        return self._cache.stats()
