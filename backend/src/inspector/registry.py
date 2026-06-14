"""Probe registry — registration, recording, snapshot.

Effects + render path register probes at well-known sites:
  - param input (the user-set value before any modulation)
  - param post-mod (the final value after lanes are applied)
  - lane output (evaluated curve at current playhead)
  - modulation amount (the delta a lane is contributing)

When inspector is mounted, the frontend polls or subscribes to
`get_snapshot()` to render the values in the UI. When not mounted,
the registry is no-op — `record()` returns immediately.

Thread-safe. Backed by a dict-of-deques (bounded per probe) so heavy
probe rates don't OOM us.
"""

from __future__ import annotations

import logging
import threading
import time
from collections import deque
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional

logger = logging.getLogger(__name__)

MAX_HISTORY_PER_PROBE = 32
# Hard ceiling on registered probes.
# Worst-case resident memory = MAX_PROBES × MAX_HISTORY_PER_PROBE ×
# ~80 B/ProbeReading ≈ 64 × 32 × 80 = 163,840 B ≈ 160 KiB (hard ceiling
# ≈ 200 KiB). Probe-recordings-to-disk are deferred per SG-H1 (not built);
# this cap makes the in-memory-only design safe.
MAX_PROBES = 64


class ProbeKind(str, Enum):
    PARAM_INPUT = "param_input"
    PARAM_POSTMOD = "param_postmod"
    LANE_OUTPUT = "lane_output"
    MOD_AMOUNT = "mod_amount"


@dataclass(frozen=True)
class ProbeReading:
    """A single recorded value at a probe point."""

    value: float
    timestamp_s: float


@dataclass
class Probe:
    """A single named probe + recent history."""

    id: str
    kind: ProbeKind
    label: str
    track_id: Optional[str] = None  # the surface owner; None = global
    effect_id: Optional[str] = None
    param_path: Optional[str] = None
    history: deque = field(default_factory=lambda: deque(maxlen=MAX_HISTORY_PER_PROBE))

    def latest(self) -> Optional[ProbeReading]:
        if not self.history:
            return None
        return self.history[-1]


@dataclass
class ProbeSnapshot:
    """All current probes + their latest readings (frontend payload)."""

    probes: dict[str, Probe]
    captured_at_s: float
    mounted: bool


class ProbeRegistry:
    """Thread-safe probe registry. Mounting is a single bit toggled by frontend."""

    def __init__(self) -> None:
        self._probes: dict[str, Probe] = {}
        self._lock = threading.RLock()
        self._mounted = False

    def register(
        self,
        probe_id: str,
        kind: ProbeKind,
        label: str,
        *,
        track_id: Optional[str] = None,
        effect_id: Optional[str] = None,
        param_path: Optional[str] = None,
    ) -> Probe:
        """Register or get-or-create a probe; idempotent.

        Raises ValueError if registering a NEW probe would exceed MAX_PROBES.
        Idempotent for already-registered ids (re-registration is always safe).
        """
        with self._lock:
            existing = self._probes.get(probe_id)
            if existing is not None:
                return existing
            if len(self._probes) >= MAX_PROBES:
                raise ValueError(
                    f"probe registry full: cannot register {probe_id!r} "
                    f"(limit {MAX_PROBES})"
                )
            probe = Probe(
                id=probe_id,
                kind=kind,
                label=label,
                track_id=track_id,
                effect_id=effect_id,
                param_path=param_path,
            )
            self._probes[probe_id] = probe
            return probe

    def unregister(self, probe_id: str) -> bool:
        with self._lock:
            return self._probes.pop(probe_id, None) is not None

    def record(self, probe_id: str, value: float) -> bool:
        """Record a reading. No-op if inspector not mounted (perf gate)."""
        if not self._mounted:
            return False
        with self._lock:
            probe = self._probes.get(probe_id)
            if probe is None:
                return False
            probe.history.append(
                ProbeReading(value=float(value), timestamp_s=time.time())
            )
            return True

    def mount(self) -> None:
        """Frontend opens inspector → start recording."""
        with self._lock:
            self._mounted = True

    def unmount(self) -> None:
        """Frontend closes inspector → stop recording (history preserved)."""
        with self._lock:
            self._mounted = False

    def is_mounted(self) -> bool:
        with self._lock:
            return self._mounted

    def clear_history(self) -> None:
        """Empty every probe's history. Used on project unload."""
        with self._lock:
            for p in self._probes.values():
                p.history.clear()

    def snapshot(self) -> ProbeSnapshot:
        with self._lock:
            # Shallow-copy probes; deques are mutable so callers shouldn't write
            return ProbeSnapshot(
                probes={k: v for k, v in self._probes.items()},
                captured_at_s=time.time(),
                mounted=self._mounted,
            )

    def probe_count(self) -> int:
        with self._lock:
            return len(self._probes)


_GLOBAL: Optional[ProbeRegistry] = None


def global_probe_registry() -> ProbeRegistry:
    global _GLOBAL
    if _GLOBAL is None:
        _GLOBAL = ProbeRegistry()
    return _GLOBAL


def reset_global_probe_registry_for_testing() -> None:
    global _GLOBAL
    _GLOBAL = None
