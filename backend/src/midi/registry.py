"""MIDI mapping registry — Learn + bind + lookup.

Thread-safe. Scoped per-project (one registry instance) + a global
default. Bindings round-trip through `.dna` patch format (PR #21) via
to_dict / from_dict.

Per [[feedback_sdlc-verify-in-app-not-just-code]]: unit tests verify
the data path; in-app validation is the user pressing a pad and seeing
the param latch (Computer Use UAT).
"""

from __future__ import annotations

import threading
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional


class MIDISourceKind(str, Enum):
    CC = "cc"  # Control Change
    NOTE = "note"  # Note On
    PROGRAM = "program"  # Program Change


@dataclass(frozen=True)
class MIDISource:
    """Where a MIDI event came from (channel + cc/note number)."""

    kind: MIDISourceKind
    channel: int  # 0-15
    number: int  # 0-127 (CC# or note#)

    def __post_init__(self) -> None:
        if not 0 <= self.channel <= 15:
            raise ValueError(f"channel must be 0-15, got {self.channel}")
        if not 0 <= self.number <= 127:
            raise ValueError(f"number must be 0-127, got {self.number}")

    def key(self) -> str:
        """Stable id for lookup."""
        return f"{self.kind.value}:{self.channel}:{self.number}"


@dataclass(frozen=True)
class MIDIBinding:
    """One source → one param destination."""

    source: MIDISource
    dst_param_path: str  # e.g. "track1.fx-blur.radius"
    scale_min: float = 0.0  # map MIDI 0-127 → [scale_min, scale_max]
    scale_max: float = 1.0
    invert: bool = False

    def remap(self, midi_value: int) -> float:
        """Translate a 0-127 MIDI value into the param's range."""
        if not 0 <= midi_value <= 127:
            raise ValueError(f"midi_value must be 0-127, got {midi_value}")
        t = midi_value / 127.0
        if self.invert:
            t = 1.0 - t
        return self.scale_min + t * (self.scale_max - self.scale_min)


@dataclass
class MIDIEvent:
    """One incoming MIDI message."""

    source: MIDISource
    value: int  # 0-127


@dataclass
class LearnSession:
    """Active Learn session — awaiting first MIDI event for a destination."""

    dst_param_path: str
    started_at_s: float
    cancelled: bool = False


@dataclass
class MIDIMapping:
    """Named mapping (e.g., 'Launchpad X default')."""

    name: str
    bindings: dict[str, MIDIBinding] = field(default_factory=dict)
    # description shown in mapping selector
    description: str = ""

    def add(self, binding: MIDIBinding) -> None:
        self.bindings[binding.source.key()] = binding

    def remove(self, source_key: str) -> bool:
        return self.bindings.pop(source_key, None) is not None

    def lookup(self, source: MIDISource) -> Optional[MIDIBinding]:
        return self.bindings.get(source.key())

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "description": self.description,
            "bindings": [
                {
                    "source_kind": b.source.kind.value,
                    "source_channel": b.source.channel,
                    "source_number": b.source.number,
                    "dst_param_path": b.dst_param_path,
                    "scale_min": b.scale_min,
                    "scale_max": b.scale_max,
                    "invert": b.invert,
                }
                for b in self.bindings.values()
            ],
        }

    @classmethod
    def from_dict(cls, data: dict) -> "MIDIMapping":
        mapping = cls(
            name=str(data.get("name", "")),
            description=str(data.get("description", "")),
        )
        for b_raw in data.get("bindings", []):
            source = MIDISource(
                kind=MIDISourceKind(b_raw["source_kind"]),
                channel=int(b_raw["source_channel"]),
                number=int(b_raw["source_number"]),
            )
            binding = MIDIBinding(
                source=source,
                dst_param_path=str(b_raw["dst_param_path"]),
                scale_min=float(b_raw.get("scale_min", 0.0)),
                scale_max=float(b_raw.get("scale_max", 1.0)),
                invert=bool(b_raw.get("invert", False)),
            )
            mapping.add(binding)
        return mapping


class MIDIMappingRegistry:
    """Holds the active mapping + handles Learn sessions."""

    def __init__(self) -> None:
        self._active_mapping = MIDIMapping(name="default", description="")
        self._learn_session: Optional[LearnSession] = None
        self._lock = threading.RLock()

    # ---- mapping management ----

    def set_active_mapping(self, mapping: MIDIMapping) -> None:
        with self._lock:
            self._active_mapping = mapping

    def active_mapping(self) -> MIDIMapping:
        with self._lock:
            return self._active_mapping

    def add_binding(self, binding: MIDIBinding) -> None:
        with self._lock:
            self._active_mapping.add(binding)

    def remove_binding(self, source: MIDISource) -> bool:
        with self._lock:
            return self._active_mapping.remove(source.key())

    def lookup(self, source: MIDISource) -> Optional[MIDIBinding]:
        with self._lock:
            return self._active_mapping.lookup(source)

    # ---- Learn ----

    def start_learn(self, dst_param_path: str) -> None:
        import time

        with self._lock:
            self._learn_session = LearnSession(
                dst_param_path=dst_param_path,
                started_at_s=time.time(),
            )

    def cancel_learn(self) -> bool:
        with self._lock:
            if self._learn_session is None:
                return False
            self._learn_session.cancelled = True
            self._learn_session = None
            return True

    def is_learning(self) -> bool:
        with self._lock:
            return self._learn_session is not None and not self._learn_session.cancelled

    def learning_for(self) -> Optional[str]:
        with self._lock:
            if self._learn_session is None or self._learn_session.cancelled:
                return None
            return self._learn_session.dst_param_path

    # ---- Event dispatch ----

    def handle_event(self, event: MIDIEvent) -> Optional[MIDIBinding]:
        """Either bind (if learning) or return existing binding.

        - If Learn is active: create new binding from the event source +
          the Learn target → return the new binding.
        - Otherwise: look up existing binding → return it (or None).
        """
        with self._lock:
            if self._learn_session is not None and not self._learn_session.cancelled:
                dst = self._learn_session.dst_param_path
                binding = MIDIBinding(source=event.source, dst_param_path=dst)
                self._active_mapping.add(binding)
                self._learn_session = None
                return binding
            return self._active_mapping.lookup(event.source)


_GLOBAL: Optional[MIDIMappingRegistry] = None


def global_midi_registry() -> MIDIMappingRegistry:
    global _GLOBAL
    if _GLOBAL is None:
        _GLOBAL = MIDIMappingRegistry()
    return _GLOBAL


def reset_global_midi_registry_for_testing() -> None:
    global _GLOBAL
    _GLOBAL = None
