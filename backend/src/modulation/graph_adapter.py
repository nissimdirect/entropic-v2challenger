"""Adapter: engine operator dicts (``list[dict]``) → ``RoutingGraph`` (SG-5 part A).

The modulation engine evaluates a ``list[dict]`` operator graph where any
operator may read another via ``parameters.sources[].operator_id`` (Fusion
today; B9 tensor routing later). The static fast-path toposort
(``modulation.engine._topological_sort``) walks those edges directly.

SG-5 part A (SPEC-3 §4.2 A+B) replaces the catch-and-degrade-to-declaration-order
fallback with deterministic cycle-break via ``safety.cycle_detection.break_cycles``.
That machinery operates on an ``inspector.routing_graph.RoutingGraph``, so this
module bridges the two representations.

Design note: the adapter lives in ``modulation/`` (not ``safety/``) so that
``safety/`` stays dependency-free of the engine's operator shape — ``safety/``
consumes only the generic ``RoutingGraph`` abstraction.

Edge semantics (must match the toposort's dependency direction):
    A *source* operator must evaluate BEFORE its *consumer*. The data-flow edge
    is therefore ``source → consumer``. ``detect_cycles`` walks ``src_id →
    dst_id``; a cycle in data-flow is a cycle in the graph, so the mapping is:
        edge.src_id = source operator id   (``operator_id`` in the sources list)
        edge.dst_id = consumer operator id (the op that declares the source)

Determinism: edge ids are derived deterministically from
``{src}->{dst}#{ordinal}`` so ``break_cycles`` (lex-smallest edge id) yields the
same break across runs (Vision deterministic-rendering note).
"""

from __future__ import annotations

from inspector.routing_graph import (
    GraphEdge,
    GraphNode,
    NodeKind,
    RoutingGraph,
)


def _params_of(op: dict) -> dict:
    """Return an operator's parameter dict, tolerating ``parameters`` or ``params``."""
    params = op.get("parameters", op.get("params", {}))
    return params if isinstance(params, dict) else {}


def operators_to_routing_graph(operators: list[dict]) -> RoutingGraph:
    """Build a ``RoutingGraph`` from the engine's operator list.

    Every operator with a non-empty ``id`` becomes an OPERATOR node. Every
    ``parameters.sources[].operator_id`` that names another present operator
    becomes a data-flow edge ``source → consumer``.

    ALL such edges are preserved (the roundtrip test asserts this): duplicate
    source references and edges to/from the same pair are kept distinct via the
    ordinal suffix in the edge id. Sources that reference a missing operator, or
    that self-reference, are skipped (they cannot form a graph edge and the
    static toposort ignores them too).
    """
    graph = RoutingGraph()

    # First pass: register nodes. Preserve declaration order; first id wins on
    # duplicates (mirrors _topological_sort's op_idx construction).
    present: set[str] = set()
    for op in operators:
        op_id = op.get("id", "")
        if op_id and op_id not in present:
            present.add(op_id)
            graph.add_node(
                GraphNode(
                    id=op_id,
                    kind=NodeKind.OPERATOR,
                    label=str(op.get("type", "")),
                )
            )

    # Second pass: edges. Ordinal counter per (src, dst) keeps ids unique +
    # deterministic so duplicate references roundtrip without collision.
    edge_ordinals: dict[tuple[str, str], int] = {}
    for op in operators:
        consumer_id = op.get("id", "")
        if not consumer_id or consumer_id not in present:
            continue
        sources = _params_of(op).get("sources", [])
        if not isinstance(sources, list):
            continue
        for src in sources:
            if not isinstance(src, dict):
                continue
            src_id = src.get("operator_id", "")
            if not src_id or src_id not in present:
                continue  # dangling reference — no edge (toposort ignores it too)
            if src_id == consumer_id:
                continue  # self-reference — not a graph edge
            key = (src_id, consumer_id)
            ordinal = edge_ordinals.get(key, 0)
            edge_ordinals[key] = ordinal + 1
            edge_id = f"{src_id}->{consumer_id}#{ordinal}"
            graph.add_edge(
                GraphEdge(
                    id=edge_id,
                    src_id=src_id,
                    dst_id=consumer_id,
                    dst_param="",  # operator-to-operator edge; no param path
                    amount=1.0,
                )
            )

    return graph


def remaining_source_edges(graph: RoutingGraph) -> set[tuple[str, str]]:
    """Return the surviving ``(source_id, consumer_id)`` data-flow edges.

    After ``break_cycles`` removes the lex-smallest edges, the engine needs the
    *surviving* dependency set to re-run a static toposort in the broken order.
    Collapses the ordinal-suffixed edge ids back to ``(src, dst)`` pairs.
    """
    return {(e.src_id, e.dst_id) for e in graph.edges()}
