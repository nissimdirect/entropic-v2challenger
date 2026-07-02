"""Freeze/Flatten manager — caches effect chain prefixes to disk for playback performance."""

import hashlib
import json
import logging
import shutil
import threading
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from engine.cache import decode_mjpeg, encode_mjpeg
from engine.pipeline import apply_chain
from video.reader import VideoReader

logger = logging.getLogger(__name__)

# Default cache location under user home (not /tmp — survives reboots for session reuse)
DEFAULT_CACHE_DIR = "~/.cache/entropic/freeze"


@dataclass(slots=True)
class FreezeCache:
    """Metadata for a single freeze cache on disk."""

    cache_id: str
    asset_path: str
    chain_hash: str
    frame_count: int
    resolution: tuple[int, int]
    cache_dir: Path


def _chain_hash(asset_path: str, chain: list[dict], project_seed: int) -> str:
    """Deterministic hash for asset+chain+seed combination.

    Only includes enabled effects so toggling disabled effects
    does not create separate caches for identical output.
    """
    # Strip disabled effects before hashing — they produce identical output
    enabled_chain = [e for e in chain if e.get("enabled", True)]
    payload = json.dumps(
        {"asset": asset_path, "chain": enabled_chain, "seed": project_seed},
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(payload.encode()).hexdigest()[:16]


class FreezeManager:
    """Manages freeze caches for effect chain prefixes.

    Thread-safe: all mutable state is protected by ``_lock``.
    """

    def __init__(self, cache_dir: str = DEFAULT_CACHE_DIR):
        self._caches: dict[str, FreezeCache] = {}
        self._lock = threading.Lock()
        self._cache_dir = Path(cache_dir).expanduser()
        self._cache_dir.mkdir(parents=True, exist_ok=True)

    def freeze_prefix(
        self,
        asset_path: str,
        chain: list[dict],
        project_seed: int,
        frame_count: int,
        resolution: tuple[int, int],
    ) -> str:
        """Render chain on all frames, write JPEG frames to disk. Returns cache_id.

        Idempotent: same (asset, chain, seed) returns the same cache_id without re-rendering.
        """
        ch = _chain_hash(asset_path, chain, project_seed)

        # O(1) idempotency check
        with self._lock:
            existing = self._caches.get(ch)
            if existing and existing.frame_count == frame_count:
                logger.info("Freeze cache hit: %s (hash=%s)", ch, ch)
                return ch

        cache_id = ch
        frame_dir = self._cache_dir / cache_id
        frame_dir.mkdir(parents=True, exist_ok=True)

        reader = VideoReader(asset_path)
        try:
            states: dict[str, dict | None] = {}
            for i in range(frame_count):
                frame = reader.decode_frame(i)
                output, states = apply_chain(
                    frame, chain, project_seed, i, resolution, states
                )
                jpeg_data = encode_mjpeg(output, quality=95)
                frame_path = frame_dir / f"frame_{i:05d}.jpg"
                frame_path.write_bytes(jpeg_data)
        finally:
            reader.close()

        with self._lock:
            self._caches[cache_id] = FreezeCache(
                cache_id=cache_id,
                asset_path=asset_path,
                chain_hash=ch,
                frame_count=frame_count,
                resolution=resolution,
                cache_dir=frame_dir,
            )
        logger.info(
            "Freeze complete: %s (%d frames, hash=%s)", cache_id, frame_count, ch
        )
        return cache_id

    def read_cached_frame(self, cache_id: str, frame_index: int) -> np.ndarray:
        """Read single frame from freeze cache. Returns RGB uint8 array.

        Raises:
            KeyError: If cache_id is not known.
            IndexError: If frame_index is out of bounds.
        """
        with self._lock:
            if cache_id not in self._caches:
                raise KeyError(f"Unknown freeze cache: {cache_id}")
            cache = self._caches[cache_id]

        if frame_index < 0 or frame_index >= cache.frame_count:
            raise IndexError(
                f"Frame {frame_index} out of range [0, {cache.frame_count})"
            )

        frame_path = cache.cache_dir / f"frame_{frame_index:05d}.jpg"
        jpeg_data = frame_path.read_bytes()
        return decode_mjpeg(jpeg_data)

    def invalidate(self, cache_id: str) -> None:
        """Delete cache files and metadata. No-op if cache_id is unknown."""
        with self._lock:
            cache = self._caches.get(cache_id)
            if cache is None:
                return
            # Delete files first, then remove from dict
            if cache.cache_dir.exists():
                shutil.rmtree(cache.cache_dir, ignore_errors=True)
            del self._caches[cache_id]
        logger.info("Invalidated freeze cache: %s", cache_id)

    def flatten(self, cache_id: str, output_path: str, fps: int = 30) -> str:
        """Encode cached frames to new video file via VideoWriter. Returns output_path.

        Raises:
            KeyError: If cache_id is not known.
        """
        with self._lock:
            if cache_id not in self._caches:
                raise KeyError(f"Unknown freeze cache: {cache_id}")
            cache = self._caches[cache_id]

        from video.writer import VideoWriter

        w, h = cache.resolution
        writer = VideoWriter(output_path, w, h, fps=fps)
        try:
            for i in range(cache.frame_count):
                frame_rgb = self.read_cached_frame(cache_id, i)
                # VideoWriter expects RGBA — add alpha channel
                frame_rgba = np.dstack(
                    [frame_rgb, np.full(frame_rgb.shape[:2], 255, dtype=np.uint8)]
                )
                writer.write_frame(frame_rgba)
        finally:
            writer.close()

        logger.info("Flatten complete: %s → %s", cache_id, output_path)
        return output_path

    def reset(self) -> None:
        """Clear all caches (for testing). Removes cache directories."""
        with self._lock:
            for cache in self._caches.values():
                if cache.cache_dir.exists():
                    shutil.rmtree(cache.cache_dir, ignore_errors=True)
            self._caches.clear()
        logger.info("Freeze manager reset — all caches cleared")

    def get_cache_info(self, cache_id: str) -> dict | None:
        """Return metadata for a cache, or None if unknown."""
        with self._lock:
            cache = self._caches.get(cache_id)
        if cache is None:
            return None
        return {
            "cache_id": cache.cache_id,
            "asset_path": cache.asset_path,
            "frame_count": cache.frame_count,
            "resolution": list(cache.resolution),
        }
