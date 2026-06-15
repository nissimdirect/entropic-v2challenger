"""Audit medium #4 regression: mappings are NOT eval/cycle-graph edges.

`graph_adapter.operators_to_routing_graph` used to inject `mappings` edges into
the graph consumed by the eval-order/cycle-break path (_topological_sort via
compute_cycle_break_decision / _break_and_resort). That was fictitious: routing.py
`resolve_routings` applies an operator's OWN already-computed value to a target
EFFECT param (op_signal = operator_values.get(op_id)); a mapping NEVER makes one
operator read another at eval time.

Two confirmed defects encoded here as regressions (both FAIL on origin/main):

  Defect 1 (spurious reorder): the fictitious mappings edge changed the survivor
    edge set that drives the export eval order (compute_cycle_break_decision).
    A mappings list must NOT change eval order.

  Defect 2 (inconsistency): a mappings-only 2-cycle made
    compute_cycle_break_decision.has_cycle==False disagree with
    detect_cycles(operators_to_routing_graph(...)).has_cycles==True. After the fix
    both are False (mappings aren't eval deps), and both stay True on a REAL
    sources cycle.
"""

from __future__ import annotations

from modulation.engine import compute_cycle_break_decision
from modulation.graph_adapter import operators_to_routing_graph
from safety.cycle_detection import detect_cycles


def _lfo(op_id: str, *map_targets: str) -> dict:
    """An LFO operator whose mappings target the given ids (effect or operator)."""
    return {
        "id": op_id,
        "type": "lfo",
        "is_enabled": True,
        "parameters": {},
        "mappings": [
            {"target_effect_id": t, "target_param_key": "value"} for t in map_targets
        ],
    }


def _fusion(op_id: str, src: str | None = None, *map_targets: str) -> dict:
    """A fusion operator with an optional sources dep + optional mappings targets."""
    params = {"sources": [{"operator_id": src}]} if src else {"sources": []}
    return {
        "id": op_id,
        "type": "fusion",
        "is_enabled": True,
        "parameters": params,
        "mappings": [
            {"target_effect_id": t, "target_param_key": "value"} for t in map_targets
        ],
    }


def _survivor_id_edges(ops: list[dict]) -> set[tuple[str, str]]:
    """Run the REAL export eval-order driver and return survivor edges as id pairs."""
    decision = compute_cycle_break_decision(ops)
    ids = [o["id"] for o in ops]
    return {(ids[s], ids[d]) for s, d in decision.survivor_edges}


# --------------------------------------------------------------------------- #
#  Defect 1 — a mappings list must NOT change eval order
# --------------------------------------------------------------------------- #


def test_defect1_mappings_do_not_change_survivor_edges():
    """The fictitious mappings edge a->c must not appear in the eval graph.

    Graph: real sources cycle a<->b (so the break path runs) + a mappings edge
    a->c. The survivor edge set (= export eval order) must be IDENTICAL with and
    without the mappings list, and must contain ONLY the surviving sources edge.
    """
    ops_with = [_fusion("a", "b", "c"), _fusion("b", "a"), _lfo("c")]
    ops_without = [_fusion("a", "b"), _fusion("b", "a"), _lfo("c")]

    edges_with = _survivor_id_edges(ops_with)
    edges_without = _survivor_id_edges(ops_without)

    assert edges_with == edges_without, (
        "mappings list changed the eval-order survivor edge set "
        f"(with={edges_with} without={edges_without})"
    )
    # The fictitious operator->operator edge a->c must NOT be present.
    assert ("a", "c") not in edges_with
    # Only the surviving real sources edge remains (a<->b broken to keep b->a).
    assert edges_with == {("b", "a")}


def test_defect1_sources_only_acyclic_order_unaffected_by_mappings():
    """On an acyclic sources graph, adding mappings must not add any eval edge."""
    # c(no deps), a(src=b), b(no deps); a also maps->c (fictitious).
    with_mappings = [_lfo("c"), _fusion("a", "b", "c"), _fusion("b")]
    without_mappings = [_lfo("c"), _fusion("a", "b"), _fusion("b")]

    g_with = operators_to_routing_graph(with_mappings)
    g_without = operators_to_routing_graph(without_mappings)

    def _pairs(g):
        return {(e.src_id, e.dst_id) for e in g.edges()}

    assert _pairs(g_with) == _pairs(g_without) == {("b", "a")}


# --------------------------------------------------------------------------- #
#  Defect 2 — the two cycle-detection paths must AGREE
# --------------------------------------------------------------------------- #


def test_defect2_mappings_only_cycle_both_paths_agree_false():
    """A mappings-only 2-cycle is NOT an eval cycle: both paths report False."""
    ops = [_lfo("a", "b"), _lfo("b", "a")]  # a.map->b, b.map->a; no sources

    has_cycle = compute_cycle_break_decision(ops).has_cycle
    detect = detect_cycles(operators_to_routing_graph(ops)).has_cycles

    assert has_cycle is False
    assert detect is False
    assert has_cycle == detect, "cycle-detection paths disagree on mappings-only graph"


def test_defect2_real_sources_cycle_both_paths_agree_true():
    """A REAL sources 2-cycle is still detected by BOTH paths (no over-correction)."""
    ops = [_fusion("a", "b"), _fusion("b", "a")]  # a reads b, b reads a

    has_cycle = compute_cycle_break_decision(ops).has_cycle
    detect = detect_cycles(operators_to_routing_graph(ops)).has_cycles

    assert has_cycle is True
    assert detect is True
    assert has_cycle == detect
