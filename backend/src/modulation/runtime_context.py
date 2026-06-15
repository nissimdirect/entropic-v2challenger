"""RuntimeContext for SG-5 runtime-aware toposort (SPEC-3 §4.3).

Runtime-conditional modulation edges (painted masks, learned bindings) can flip
cycle status frame-to-frame: an edge only *exists* when a runtime predicate over
the current frame's data evaluates true. SG-5 evaluates those conditional edges
FIRST, then snapshots the resulting static graph for the deterministic toposort.

No runtime-conditional edge *kinds* are implemented yet (painted/learned land in
later packets), so the seam takes a generic predicate: ``edge_predicate(edge_meta,
ctx) -> bool``. When no predicate is supplied (or it always returns True), the
graph is treated as static and bypasses to the existing fast path.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable, Optional


@dataclass
class RuntimeContext:
    """Per-frame runtime data consumed when resolving conditional edges.

    Fields (SPEC-3 §4.3):
        frame_index: current frame number (drives time-dependent predicates).
        current_y: the live Y-axis / scrub position (synth-paradigm axis).
        audio_buffer: optional raw audio buffer the predicate may inspect.

    ``conditional_edge_predicate`` is the SG-5 seam: given an edge's metadata and
    this context, decide whether the runtime-conditional edge is *active* this
    frame. ``None`` means "no runtime-conditional edges" → static fast path.
    """

    frame_index: int = 0
    current_y: float = 0.0
    audio_buffer: Any = None
    # Seam for painted/learned conditional edges (none implemented yet).
    # Signature: (edge_meta: dict, ctx: RuntimeContext) -> bool
    conditional_edge_predicate: Optional[Callable[[dict, "RuntimeContext"], bool]] = (
        None
    )
    # Optional list of conditional-edge descriptors the predicate is evaluated
    # against. Each descriptor is an opaque dict (e.g. {"src": ..., "dst": ...}).
    conditional_edges: list[dict] = field(default_factory=list)

    @property
    def has_runtime_conditional_edges(self) -> bool:
        """True iff a predicate AND at least one conditional-edge descriptor exist.

        When False the engine takes the static fast path unchanged (SPEC-3 §4.4).
        """
        return self.conditional_edge_predicate is not None and bool(
            self.conditional_edges
        )

    def active_conditional_edges(self) -> list[dict]:
        """Evaluate the predicate over every conditional-edge descriptor.

        Returns the descriptors whose predicate is true THIS frame. Called
        before the static snapshot so runtime edges are folded in first
        (SPEC-3 §4.3). Returns [] when there is no predicate.
        """
        if self.conditional_edge_predicate is None:
            return []
        pred = self.conditional_edge_predicate
        return [e for e in self.conditional_edges if pred(e, self)]
