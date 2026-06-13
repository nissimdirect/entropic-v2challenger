"""B6.1 — Byte-budget LRU over DECODED frames (the OOM guard).

THE MEMORY CRUX of the Frame-Bank instrument. A Frame-Bank is the video analog
of a wavetable oscillator: an indexed bank of frames a modulatable `position`
scans + interpolates through. A 256-slot bank at 4K RGBA is ~8.5 GB if every
frame is decoded resident at once — an instant OOM freeze on a 16 GB Mac.

The renderer is the AUTHORITY: a Frame-Bank render must NEVER hold more than
`byte_budget` BYTES of decoded frames resident, regardless of how many slots the
bank declares. This cache is the bound:

  - keyed `(clip_id, frame_index)` → decoded ndarray
  - tracks total resident BYTES (sum of every cached frame's nbytes)
  - on insert, if adding a frame would exceed the budget, EVICT least-recently-
    used entries until it fits
  - DOWNSCALE-PROXY fallback: if a single requested frame alone exceeds the whole
    budget (one 4K frame > a tiny budget), it is decoded then downscaled so its
    resident bytes fit — served at reduced resolution rather than OOM-ing or
    crashing.

This is a NEW bound. The existing `_max_readers=10` caps open FILE HANDLES, not
decoded RAM — completely orthogonal. The byte-budget from the model is a REQUEST,
clamped to a hard backend cap in security.validate_frame_bank BEFORE this cache
ever sees it.
"""

from __future__ import annotations

from collections import OrderedDict
from typing import Callable

import numpy as np


def _downscale_to_fit(frame: np.ndarray, byte_budget: int) -> np.ndarray:
    """Downscale `frame` (HxWxC uint8) so its nbytes <= byte_budget.

    Serves the DOWNSCALE-PROXY: a single frame that alone exceeds the whole
    budget is decoded then shrunk (nearest-neighbour, dependency-free) so its
    resident bytes fit. Preserves channel count + dtype. The scale factor is
    derived from the byte ratio (area ∝ scale²), then nudged down until it
    actually fits (integer rounding can leave it 1px too big).

    A budget so small that even a 1x1 frame won't fit is impossible after the
    security clamp (hard floor 16 MB >> one pixel), but we still guarantee
    termination: the worst case returns a 1x1 frame.
    """
    if frame.nbytes <= byte_budget or byte_budget <= 0:
        return frame
    h, w = frame.shape[0], frame.shape[1]
    bytes_per_pixel = frame.nbytes / max(1, (h * w))
    # Target pixel count that fits the budget, with a little headroom.
    target_pixels = max(1, int(byte_budget / max(1.0, bytes_per_pixel)))
    scale = (target_pixels / max(1, (h * w))) ** 0.5
    new_h = max(1, int(h * scale))
    new_w = max(1, int(w * scale))
    # Integer rounding can leave it marginally over budget — shrink until it fits.
    while new_h > 1 or new_w > 1:
        proxy = _nn_resize(frame, new_h, new_w)
        if proxy.nbytes <= byte_budget:
            return proxy
        new_h = max(1, new_h // 2)
        new_w = max(1, new_w // 2)
    return _nn_resize(frame, 1, 1)


def _nn_resize(frame: np.ndarray, new_h: int, new_w: int) -> np.ndarray:
    """Nearest-neighbour resize of an HxWx? uint8 frame (no cv2/PIL dependency)."""
    h, w = frame.shape[0], frame.shape[1]
    if new_h == h and new_w == w:
        return frame
    row_idx = (np.arange(new_h) * h // max(1, new_h)).clip(0, h - 1)
    col_idx = (np.arange(new_w) * w // max(1, new_w)).clip(0, w - 1)
    return frame[row_idx][:, col_idx].copy()


class DecodedFrameCache:
    """Byte-budget LRU over decoded frames. The Frame-Bank OOM guard.

    `byte_budget` is the resident-decoded-frame ceiling in BYTES (already clamped
    to the hard backend cap by security.validate_frame_bank). `resident_bytes`
    NEVER exceeds `byte_budget` after any `get` — that invariant IS the OOM gate.
    """

    def __init__(self, byte_budget: int):
        if byte_budget <= 0:
            raise ValueError(f"byte_budget must be > 0, got {byte_budget}")
        self.byte_budget = int(byte_budget)
        self.resident_bytes = 0
        # OrderedDict as an LRU: most-recently-used moved to the end.
        self._frames: "OrderedDict[tuple[str, int], np.ndarray]" = OrderedDict()
        # Telemetry for the OOM oracle / debugging.
        self.peak_resident_bytes = 0
        self.evictions = 0
        self.proxies_served = 0
        self.decodes = 0

    def get(
        self,
        clip_id: str,
        frame_index: int,
        decode: Callable[[str, int], np.ndarray],
    ) -> np.ndarray:
        """Return the decoded frame for (clip_id, frame_index), caching it.

        On a HIT: mark MRU, return the cached ndarray (no decode).
        On a MISS: call `decode(clip_id, frame_index)` to get the ndarray, then:
          - if it alone exceeds the budget → DOWNSCALE-PROXY (shrunk to fit),
            served but NOT cached as the full frame (the proxy is cached).
          - evict LRU entries until the new frame fits, then insert as MRU.

        The returned frame is owned by the cache; callers MUST NOT mutate it in
        place (they composite a copy). resident_bytes is guaranteed <= budget on
        return.
        """
        key = (clip_id, int(frame_index))
        cached = self._frames.get(key)
        if cached is not None:
            self._frames.move_to_end(key)  # mark MRU
            return cached

        frame = decode(clip_id, int(frame_index))
        self.decodes += 1
        nbytes = int(frame.nbytes)

        # DOWNSCALE-PROXY: a single frame larger than the WHOLE budget can never
        # fit alongside anything (or even alone). Shrink it so it fits.
        if nbytes > self.byte_budget:
            frame = _downscale_to_fit(frame, self.byte_budget)
            nbytes = int(frame.nbytes)
            self.proxies_served += 1

        # Evict LRU until the incoming frame fits within the budget.
        while self.resident_bytes + nbytes > self.byte_budget and self._frames:
            _, evicted = self._frames.popitem(last=False)  # pop LRU (front)
            self.resident_bytes -= int(evicted.nbytes)
            self.evictions += 1

        # Insert as MRU. (After eviction the frame is guaranteed to fit because a
        # proxy already shrank any single over-budget frame.)
        self._frames[key] = frame
        self.resident_bytes += nbytes
        if self.resident_bytes > self.peak_resident_bytes:
            self.peak_resident_bytes = self.resident_bytes
        return frame

    def __len__(self) -> int:
        return len(self._frames)

    def clear(self) -> None:
        self._frames.clear()
        self.resident_bytes = 0
