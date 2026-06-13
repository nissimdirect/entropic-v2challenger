"""Static-shape matte rasterizers + LRU cache (SPEC §3.2, §3.3).

Rasterizes rect / ellipse / polygon / bitmap MatteNodes into float32 (H, W)
arrays in [0, 1]. Results are cached with an LRU eviction strategy that
respects both entry count and byte budget.

Cache key: (clip_id, node_id, height, width, params_hash)
  - params_hash is computed from the node's kind + params dict so that any
    param change invalidates the cached entry (test: test_param_change_invalidates_cache).

Budget (SPEC §3.3 — separate pool from P6.3 FIELD_CACHE):
  MATTE_CACHE_MAX_ENTRIES = 32
  MATTE_CACHE_MAX_BYTES   = 128 * 1024 * 1024  (128 MiB)

SG-8 hook: when safety.pressure.budget.pressure_percent() >= 82, the byte cap
is halved and entries exceeding the new cap are evicted (mirrors B6 frame-bank
convention; GT-12 addendum).
"""

from __future__ import annotations

import hashlib
import json
import math
import time
from collections import OrderedDict
from typing import TYPE_CHECKING, Any

import cv2
import numpy as np

if TYPE_CHECKING:
    from masking.schema import MatteNode

# --------------------------------------------------------------------------- #
#  Budget constants (SPEC §3.3)
# --------------------------------------------------------------------------- #

MATTE_CACHE_MAX_ENTRIES: int = 32
MATTE_CACHE_MAX_BYTES: int = 128 * 1024 * 1024  # 128 MiB

# SG-8 pressure threshold (SPEC §3.3, GT-12)
_SG8_PRESSURE_THRESHOLD: float = 82.0

# --------------------------------------------------------------------------- #
#  LRU cache internals
# --------------------------------------------------------------------------- #

_CacheEntry = tuple[np.ndarray, int]  # (matte, bytes)

# OrderedDict preserves insertion order; we move on hit (LRU discipline).
_cache: OrderedDict[tuple, _CacheEntry] = OrderedDict()
_cache_bytes: int = 0
_cache_hits: int = 0
_cache_misses: int = 0
_cache_evictions: int = 0

# Effective byte cap — may be halved by SG-8 pressure handler.
_effective_max_bytes: int = MATTE_CACHE_MAX_BYTES


def _entry_bytes(matte: np.ndarray) -> int:
    """Byte footprint of one cached matte array."""
    return int(matte.nbytes)


def _evict_to_fit(required_bytes: int) -> None:
    """Evict LRU entries until the cache fits within caps."""
    global _cache_bytes, _cache_evictions
    while _cache and (
        len(_cache) >= MATTE_CACHE_MAX_ENTRIES
        or _cache_bytes + required_bytes > _effective_max_bytes
    ):
        _, (_, eb) = _cache.popitem(last=False)
        _cache_bytes -= eb
        _cache_evictions += 1


def _insert(key: tuple, matte: np.ndarray) -> None:
    """Insert a new entry, evicting as needed."""
    global _cache_bytes
    eb = _entry_bytes(matte)
    _evict_to_fit(eb)
    # If a single entry is larger than the cap, skip caching entirely.
    if eb > _effective_max_bytes:
        return
    _cache[key] = (matte, eb)
    _cache_bytes += eb


def cache_stats() -> dict[str, int]:
    """Return cache diagnostics.

    Shape mirrors P6.3 field_source.cache_stats() for tooling parity:
      entries   — current number of cached mattes
      bytes     — current total byte usage (always ≤ MATTE_CACHE_MAX_BYTES)
      hits      — cache hits since process start
      misses    — cache misses since process start
      evictions — entries evicted since process start
    """
    return {
        "entries": len(_cache),
        "bytes": _cache_bytes,
        "hits": _cache_hits,
        "misses": _cache_misses,
        "evictions": _cache_evictions,
    }


def clear_cache() -> None:
    """Purge all cached mattes (used in tests and SG-8 recovery)."""
    global _cache_bytes, _cache_hits, _cache_misses, _cache_evictions
    _cache.clear()
    _cache_bytes = 0
    _cache_hits = 0
    _cache_misses = 0
    _cache_evictions = 0


# --------------------------------------------------------------------------- #
#  SG-8 pressure hook
# --------------------------------------------------------------------------- #


def apply_sg8_pressure() -> None:
    """Halve the effective byte cap and evict entries above the new cap.

    Called by the SG-8 monitor when pressure_percent() >= 82.
    This mirrors the B6 frame-bank convention (GT-12 addendum).
    """
    global _effective_max_bytes, _cache_bytes, _cache_evictions
    _effective_max_bytes = max(1, _effective_max_bytes // 2)
    # Evict until we are within the new cap.
    while _cache and _cache_bytes > _effective_max_bytes:
        _, (_, eb) = _cache.popitem(last=False)
        _cache_bytes -= eb
        _cache_evictions += 1


def reset_sg8_cap() -> None:
    """Restore the effective byte cap to the configured maximum (test helper)."""
    global _effective_max_bytes
    _effective_max_bytes = MATTE_CACHE_MAX_BYTES


def check_sg8_and_apply() -> None:
    """Query pressure_percent() and call apply_sg8_pressure() if >= 82.

    Safe to call on every render tick — pressure_percent() is a fast psutil
    RSS read. No-op if the safety module is unavailable.
    """
    try:
        from safety.pressure.budget import pressure_percent

        if pressure_percent() >= _SG8_PRESSURE_THRESHOLD:
            apply_sg8_pressure()
    except Exception:  # noqa: BLE001
        pass


# --------------------------------------------------------------------------- #
#  Cache key helpers
# --------------------------------------------------------------------------- #


def _params_hash(kind: str, params: dict[str, Any]) -> str:
    """Stable hash of (kind, params) for cache keying.

    Uses JSON-serialisation with sorted keys so dicts with the same content
    produce the same hash regardless of insertion order.
    """
    payload = json.dumps({"kind": kind, "params": params}, sort_keys=True, default=str)
    return hashlib.md5(payload.encode(), usedforsecurity=False).hexdigest()[:16]


def _cache_key(
    clip_id: str,
    node_id: str,
    height: int,
    width: int,
    kind: str,
    params: dict[str, Any],
) -> tuple:
    return (clip_id, node_id, height, width, _params_hash(kind, params))


# --------------------------------------------------------------------------- #
#  Rasterizers
# --------------------------------------------------------------------------- #


def _rasterize_rect(height: int, width: int, params: dict[str, Any]) -> np.ndarray:
    """Rasterize a rect MatteNode → float32 (H, W) in [0, 1].

    Expected params (all normalised 0.0–1.0 relative to frame dimensions):
      x, y      — top-left corner
      w, h      — dimensions

    Falls back to a full-frame matte if params are absent/malformed.
    """
    matte = np.zeros((height, width), dtype=np.float32)
    x = float(params.get("x", 0.0))
    y = float(params.get("y", 0.0))
    pw = float(params.get("w", 1.0))
    ph = float(params.get("h", 1.0))

    # Convert normalised → pixel (y-down convention: row=y, col=x)
    r0 = max(0, int(round(y * height)))
    r1 = min(height, int(round((y + ph) * height)))
    c0 = max(0, int(round(x * width)))
    c1 = min(width, int(round((x + pw) * width)))

    if r1 > r0 and c1 > c0:
        matte[r0:r1, c0:c1] = 1.0
    return matte


def _rasterize_ellipse(height: int, width: int, params: dict[str, Any]) -> np.ndarray:
    """Rasterize an ellipse MatteNode → float32 (H, W) in [0, 1].

    Expected params (normalised 0.0–1.0):
      cx, cy — centre of the ellipse
      rx, ry — semi-axes (half-dimensions)
    """
    matte = np.zeros((height, width), dtype=np.float32)
    cx = float(params.get("cx", 0.5)) * width
    cy = float(params.get("cy", 0.5)) * height
    rx = float(params.get("rx", 0.5)) * width
    ry = float(params.get("ry", 0.5)) * height

    # cv2.ellipse needs int centre and axes.
    center = (int(round(cx)), int(round(cy)))
    axes = (max(1, int(round(rx))), max(1, int(round(ry))))
    cv2.ellipse(
        matte,
        center,
        axes,
        angle=0,
        startAngle=0,
        endAngle=360,
        color=1.0,
        thickness=-1,
    )
    return matte


def _rasterize_polygon(height: int, width: int, params: dict[str, Any]) -> np.ndarray:
    """Rasterize a polygon MatteNode → float32 (H, W) in [0, 1].

    Expected params:
      vertices — list of [x_norm, y_norm] pairs (normalised 0.0–1.0)

    Uses an even-odd fill rule (handles self-intersecting polygons).
    """
    matte = np.zeros((height, width), dtype=np.float32)
    raw_verts = params.get("vertices", [])
    if not isinstance(raw_verts, list) or len(raw_verts) < 3:
        return matte

    pts = []
    for v in raw_verts:
        if isinstance(v, (list, tuple)) and len(v) >= 2:
            px = int(round(float(v[0]) * width))
            py = int(round(float(v[1]) * height))
            pts.append([px, py])

    if len(pts) < 3:
        return matte

    poly = np.array([pts], dtype=np.int32)
    cv2.fillPoly(matte, poly, color=1.0)
    return matte


def _rasterize_bitmap(height: int, width: int, params: dict[str, Any]) -> np.ndarray:
    """Bitmap matte — loads from PNG sidecar written by the MK.6 wand IPC handler.

    Expected params:
      sidecar_path — absolute path to the PNG file within ~/.creatrix/mask-bitmaps/

    Validated and loaded via masking.wand.load_bitmap_sidecar (path-validation
    re-checked on load as defence-in-depth). Falls back to a full-white matte
    when the sidecar is absent or invalid.
    """
    sidecar_path = params.get("sidecar_path")
    if not sidecar_path or not isinstance(sidecar_path, str):
        # No sidecar yet (e.g. node created but not yet rendered) → white matte
        return np.ones((height, width), dtype=np.float32)

    # Lazy import avoids a circular import at module load time
    # (matte_source ← stack ← wand ← matte_source would cycle).
    from masking.wand import load_bitmap_sidecar  # noqa: PLC0415

    return load_bitmap_sidecar(sidecar_path, height, width)


_RASTERIZERS = {
    "rect": _rasterize_rect,
    "ellipse": _rasterize_ellipse,
    "polygon": _rasterize_polygon,
    "bitmap": _rasterize_bitmap,
}


# --------------------------------------------------------------------------- #
#  Public API
# --------------------------------------------------------------------------- #


def rasterize(
    node: "MatteNode",
    height: int,
    width: int,
    clip_id: str = "",
) -> np.ndarray:
    """Return a float32 (H, W) matte for *node* at the given resolution.

    Results are cached keyed by (clip_id, node_id, H, W, params_hash) so that:
      • Cache hits skip rasterization entirely (< 1 ms median-of-20 gate).
      • A param change on the node invalidates the old cached entry.
      • Procedural kinds (chroma_key, luma_key, color_range, ai_matte) are
        not cached here — they re-evaluate per frame in stack.py.

    Args:
        node:     The MatteNode to rasterize (static kinds only).
        height:   Frame height in pixels.
        width:    Frame width in pixels.
        clip_id:  Clip identity string, used as part of the cache key.

    Returns:
        float32 ndarray of shape (H, W), values in [0, 1].

    Raises:
        NotImplementedError: for procedural kinds — caller should use the
            evaluator registry in stack.py instead.
    """
    global _cache_hits, _cache_misses

    if node.kind not in _RASTERIZERS:
        raise NotImplementedError(
            f"Procedural matte kind '{node.kind}' cannot be rasterized here; "
            "use the evaluator registry in stack.py."
        )

    key = _cache_key(clip_id, node.id, height, width, node.kind, node.params)

    if key in _cache:
        _cache_hits += 1
        # Move to most-recently-used end.
        _cache.move_to_end(key)
        return _cache[key][0]

    _cache_misses += 1
    matte = _RASTERIZERS[node.kind](height, width, node.params)
    _insert(key, matte)
    return matte


def rasterize_timed(
    node: "MatteNode",
    height: int,
    width: int,
    clip_id: str = "",
) -> tuple[np.ndarray, float]:
    """rasterize() + wall-clock elapsed seconds (used for the timing gate)."""
    t0 = time.perf_counter()
    matte = rasterize(node, height, width, clip_id)
    return matte, time.perf_counter() - t0
