"""Tests for fusion-source topological sort in SignalEngine.evaluate_all.

Background: Fusion operators read sibling operator values from a shared dict
that is populated as the engine iterates the operator list. Before the topo sort,
a Fusion declared before its source returned 0.0 silently. The sort moves
each Fusion after its sources; declaration order is preserved otherwise.
"""

import logging

from modulation.engine import SignalEngine, _topological_sort


def _lfo(op_id: str) -> dict:
    return {
        "id": op_id,
        "type": "lfo",
        "is_enabled": True,
        "parameters": {"waveform": "sine", "rate_hz": 1.0, "phase_offset": 0.0},
        "processing": [],
        "mappings": [],
    }


def _fusion(op_id: str, source_ids: list[str], blend: str = "weighted_average") -> dict:
    return {
        "id": op_id,
        "type": "fusion",
        "is_enabled": True,
        "parameters": {
            "sources": [{"operator_id": s, "weight": 1.0} for s in source_ids],
            "blend_mode": blend,
        },
        "processing": [],
        "mappings": [],
    }


class TestTopologicalSort:
    def test_no_fusion_preserves_declaration_order(self):
        ops = [_lfo("a"), _lfo("b"), _lfo("c")]
        sorted_ops = _topological_sort(ops)
        assert [o["id"] for o in sorted_ops] == ["a", "b", "c"]

    def test_fusion_after_sources_unchanged(self):
        ops = [_lfo("a"), _lfo("b"), _fusion("f", ["a", "b"])]
        sorted_ops = _topological_sort(ops)
        assert [o["id"] for o in sorted_ops] == ["a", "b", "f"]

    def test_fusion_before_sources_is_reordered(self):
        # The bug: fusion declared first, sources later — fusion was reading 0.0
        ops = [_fusion("f", ["a", "b"]), _lfo("a"), _lfo("b")]
        sorted_ops = _topological_sort(ops)
        ids = [o["id"] for o in sorted_ops]
        # Fusion must come after both sources
        assert ids.index("a") < ids.index("f")
        assert ids.index("b") < ids.index("f")

    def test_chained_fusion_dependency(self):
        # f1 depends on a; f2 depends on f1
        ops = [_fusion("f2", ["f1"]), _fusion("f1", ["a"]), _lfo("a")]
        sorted_ops = _topological_sort(ops)
        ids = [o["id"] for o in sorted_ops]
        assert ids.index("a") < ids.index("f1") < ids.index("f2")

    def test_cycle_falls_back_to_declaration_order(self, caplog):
        # f1 -> f2 -> f1 (cycle)
        ops = [_fusion("f1", ["f2"]), _fusion("f2", ["f1"])]
        with caplog.at_level(logging.WARNING):
            sorted_ops = _topological_sort(ops)
        assert [o["id"] for o in sorted_ops] == ["f1", "f2"]
        assert any("cycle" in rec.message.lower() for rec in caplog.records)

    def test_self_reference_is_not_a_dependency(self):
        # Fusion that lists itself as a source (defensive): self-edge skipped
        ops = [_fusion("f", ["f", "a"]), _lfo("a")]
        sorted_ops = _topological_sort(ops)
        ids = [o["id"] for o in sorted_ops]
        assert ids.index("a") < ids.index("f")

    def test_unknown_source_id_ignored(self):
        ops = [_fusion("f", ["does_not_exist"]), _lfo("a")]
        sorted_ops = _topological_sort(ops)
        # No deps after filtering unknowns → declaration order preserved
        assert [o["id"] for o in sorted_ops] == ["f", "a"]

    def test_stable_among_independent_ops(self):
        # b and c have no deps; should keep declaration order even after sort
        ops = [_lfo("b"), _lfo("c"), _fusion("f", ["b"])]
        sorted_ops = _topological_sort(ops)
        assert [o["id"] for o in sorted_ops] == ["b", "c", "f"]

    def test_empty_input(self):
        assert _topological_sort([]) == []

    def test_single_op(self):
        ops = [_lfo("only")]
        assert _topological_sort(ops) == ops


class TestEvaluateAllUsesTopoSort:
    """Integration: SignalEngine.evaluate_all must populate fusion values
    correctly even when the consumer is declared before its sources."""

    def setup_method(self):
        self.engine = SignalEngine()

    def test_fusion_declared_before_source_now_works(self):
        # Step seq is deterministic; step value at frame 0 with rate=1 fps=30 = steps[0]
        ops = [
            _fusion("f", ["src"], "weighted_average"),
            {
                "id": "src",
                "type": "step_sequencer",
                "is_enabled": True,
                "parameters": {"steps": [0.7, 0.0, 0.0, 0.0], "rate_hz": 1.0},
                "processing": [],
                "mappings": [],
            },
        ]
        values, _ = self.engine.evaluate_all(ops, frame_index=0, fps=30.0)
        # src=0.7, fusion of one source = 0.7 (within float tolerance)
        assert "src" in values
        assert "f" in values
        assert abs(values["src"] - 0.7) < 1e-6
        assert abs(values["f"] - 0.7) < 1e-6

    def test_fusion_declared_after_source_still_works(self):
        ops = [
            {
                "id": "src",
                "type": "step_sequencer",
                "is_enabled": True,
                "parameters": {"steps": [0.5, 0.0, 0.0, 0.0], "rate_hz": 1.0},
                "processing": [],
                "mappings": [],
            },
            _fusion("f", ["src"], "weighted_average"),
        ]
        values, _ = self.engine.evaluate_all(ops, frame_index=0, fps=30.0)
        assert abs(values["f"] - 0.5) < 1e-6

    def test_cycle_does_not_crash(self):
        # Cycle: graph falls back to declaration order; both fusions read 0.0 (acceptable)
        ops = [_fusion("f1", ["f2"]), _fusion("f2", ["f1"])]
        values, _ = self.engine.evaluate_all(ops, frame_index=0, fps=30.0)
        assert values["f1"] == 0.0
        assert values["f2"] == 0.0
