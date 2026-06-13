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

SG-8 — PRESSURE-DEGRADE (B6.2). The spec gates the Frame-Bank on SG-8: under
system memory pressure the bank must DEGRADE (drop residency / serve proxies)
FURTHER, never crash. So the EFFECTIVE budget the cache enforces per `get` is the
static `byte_budget` SCALED DOWN by the live pressure signal
(`safety.pressure.budget.pressure_percent`, Q7-resident % of the session budget):

    pressure < 80%   → factor 1.00  (no degrade — byte_budget unchanged)
    80% ≤ p < 95%    → factor 0.50  (halve residency under sustained pressure)
    p ≥ 95%          → factor 0.25  (quarter — serve proxies for almost everything)

`byte_budget` stays the HARD CEILING (the B6.1 `[16MB, 2GB]` clamp); SG-8 only
LOWERS the effective bound below it under pressure — it never raises it. At zero /
low pressure `effective_budget() == byte_budget`, so B6.1 behavior is byte-
identical (the regression contract). The pressure signal is INJECTABLE
(`pressure_fn`) so tests drive degrade deterministically without touching real
process RSS.
"""

from __future__ import annotations

from collections import OrderedDict
from typing import Callable

import numpy as np

from safety.pressure.budget import pressure_percent

# SG-8 degrade curve. Thresholds are pressure-percent (Q7 resident / session
# budget × 100); factors scale the static byte_budget into the EFFECTIVE budget
# enforced this `get`. Ordered HIGH→LOW so the first matching threshold wins.
_PRESSURE_DEGRADE_CURVE: tuple[tuple[float, float], ...] = (
    (95.0, 0.25),
    (80.0, 0.50),
)


def _degrade_factor(pressure: float) -> float:
    """Map a pressure-percent to a budget-scaling factor via the SG-8 curve.

    Below the lowest threshold → 1.0 (no degrade). A non-finite / negative
    pressure (a broken probe) degrades to 1.0 rather than crashing — fail-open to
    the B6.1 budget, never below the hard floor.
    """
    if not (pressure == pressure) or pressure < 0.0:  # NaN or negative → no degrade
        return 1.0
    for threshold, factor in _PRESSURE_DEGRADE_CURVE:
        if pressure >= threshold:
            return factor
    return 1.0


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

    def __init__(
        self,
        byte_budget: int,
        pressure_fn: Callable[[], float] = pressure_percent,
    ):
        if byte_budget <= 0:
            raise ValueError(f"byte_budget must be > 0, got {byte_budget}")
        self.byte_budget = int(byte_budget)
        self.resident_bytes = 0
        # SG-8 — the live pressure probe. Defaults to the real Q7 signal; tests
        # inject a deterministic callable to drive degrade without real RSS.
        self._pressure_fn = pressure_fn
        # OrderedDict as an LRU: most-recently-used moved to the end.
        self._frames: "OrderedDict[tuple[str, int], np.ndarray]" = OrderedDict()
        # Telemetry for the OOM oracle / debugging.
        self.peak_resident_bytes = 0
        self.evictions = 0
        self.proxies_served = 0
        self.decodes = 0

    def effective_budget(self) -> int:
        """The SG-8 pressure-degraded budget enforced by the NEXT `get`.

        Reads the live pressure signal and scales `byte_budget` by the degrade
        curve. At low pressure this is exactly `byte_budget` (B6.1 parity); under
        pressure it drops to halve / quarter so residency degrades further. A
        crashing pressure probe fails OPEN (factor 1.0) rather than wedging the
        render. Floored at 1 byte so the proxy path always has a positive budget.
        """
        try:
            pressure = float(self._pressure_fn())
        except Exception:  # noqa: BLE001 — a broken probe must not crash the render
            return self.byte_budget
        factor = _degrade_factor(pressure)
        return max(1, int(self.byte_budget * factor))

    def get(
        self,
        clip_id: str,
        frame_index: int,
        decode: Callable[[str, int], np.ndarray],
    ) -> np.ndarray:
        """Return the decoded frame for (clip_id, frame_index), caching it.

        On a HIT: mark MRU, return the cached ndarray (no decode).
        On a MISS: call `decode(clip_id, frame_index)` to get the ndarray, then:
          - if it alone exceeds the EFFECTIVE budget → DOWNSCALE-PROXY (shrunk to
            fit), served but NOT cached as the full frame (the proxy is cached).
          - evict LRU entries until the new frame fits, then insert as MRU.

        SG-8: the budget enforced this call is the PRESSURE-DEGRADED
        `effective_budget()` (== `byte_budget` at low pressure, halved/quartered
        under pressure). When pressure has RISEN since the last call, already-
        resident frames are evicted down to the tighter effective budget BEFORE
        this access — so residency falls as pressure climbs, even on a hit.

        The returned frame is owned by the cache; callers MUST NOT mutate it in
        place (they composite a copy). resident_bytes is guaranteed <=
        effective_budget on return.
        """
        # SG-8: sample pressure ONCE per get; the effective budget governs every
        # eviction/proxy decision below (and the pre-trim of stale residency).
        budget = self.effective_budget()

        # SG-8 pre-trim: if pressure tightened the budget since the last get,
        # shed LRU residency down to the new ceiling before serving anything.
        while self.resident_bytes > budget and self._frames:
            _, evicted = self._frames.popitem(last=False)  # pop LRU (front)
            self.resident_bytes -= int(evicted.nbytes)
            self.evictions += 1

        key = (clip_id, int(frame_index))
        cached = self._frames.get(key)
        if cached is not None:
            self._frames.move_to_end(key)  # mark MRU
            return cached

        frame = decode(clip_id, int(frame_index))
        self.decodes += 1
        nbytes = int(frame.nbytes)

        # DOWNSCALE-PROXY: a single frame larger than the (effective) budget can
        # never fit alongside anything (or even alone). Shrink it so it fits.
        if nbytes > budget:
            frame = _downscale_to_fit(frame, budget)
            nbytes = int(frame.nbytes)
            self.proxies_served += 1

        # Evict LRU until the incoming frame fits within the effective budget.
        while self.resident_bytes + nbytes > budget and self._frames:
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
