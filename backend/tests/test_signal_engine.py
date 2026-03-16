"""Tests for signal engine orchestrator."""

import time

import numpy as np

from modulation.engine import SignalEngine


class TestSignalEngine:
    def setup_method(self):
        self.engine = SignalEngine()

    def test_mixed_operator_types(self):
        """Evaluates LFO and step sequencer together."""
        operators = [
            {
                "id": "lfo1",
                "type": "lfo",
                "is_enabled": True,
                "parameters": {"waveform": "sine", "rate_hz": 1.0, "phase_offset": 0.0},
                "processing": [],
                "mappings": [],
            },
            {
                "id": "seq1",
                "type": "step_sequencer",
                "is_enabled": True,
                "parameters": {"steps": [0.0, 0.5, 1.0, 0.5], "rate_hz": 1.0},
                "processing": [],
                "mappings": [],
            },
        ]
        values, state = self.engine.evaluate_all(operators, 0, 30.0)
        assert "lfo1" in values
        assert "seq1" in values
        assert 0.0 <= values["lfo1"] <= 1.0
        assert 0.0 <= values["seq1"] <= 1.0

    def test_state_persistence(self):
        """State carries across calls for stateful operators."""
        operators = [
            {
                "id": "lfo1",
                "type": "lfo",
                "is_enabled": True,
                "parameters": {
                    "waveform": "random",
                    "rate_hz": 1.0,
                    "phase_offset": 0.0,
                },
                "processing": [],
                "mappings": [],
            },
        ]
        val1, state = self.engine.evaluate_all(operators, 0, 30.0)
        val2, state = self.engine.evaluate_all(operators, 5, 30.0, state=state)
        # Same cycle, random should hold same value
        assert val1["lfo1"] == val2["lfo1"]

    def test_unknown_type_skipped(self):
        """Unknown operator type should be skipped (value = 0)."""
        operators = [
            {
                "id": "unknown1",
                "type": "magic_box",
                "is_enabled": True,
                "parameters": {},
                "processing": [],
                "mappings": [],
            },
        ]
        values, _ = self.engine.evaluate_all(operators, 0, 30.0)
        assert values["unknown1"] == 0.0

    def test_empty_operators(self):
        """Empty operator list returns empty results."""
        values, state = self.engine.evaluate_all([], 0, 30.0)
        assert values == {}

    def test_disabled_operator_skipped(self):
        """Disabled operator should not appear in results."""
        operators = [
            {
                "id": "lfo1",
                "type": "lfo",
                "is_enabled": False,
                "parameters": {"waveform": "sine", "rate_hz": 1.0},
                "processing": [],
                "mappings": [],
            },
        ]
        values, _ = self.engine.evaluate_all(operators, 0, 30.0)
        assert "lfo1" not in values

    def test_processing_chain_applied(self):
        """Processing chain should transform operator output."""
        operators = [
            {
                "id": "lfo1",
                "type": "lfo",
                "is_enabled": True,
                "parameters": {"waveform": "saw", "rate_hz": 1.0, "phase_offset": 0.0},
                "processing": [{"type": "invert", "params": {}}],
                "mappings": [],
            },
        ]
        values, _ = self.engine.evaluate_all(operators, 0, 30.0)
        # Saw at frame 0 = 0.0, inverted = 1.0
        assert abs(values["lfo1"] - 1.0) < 0.01

    def test_max_16_operators(self):
        """More than 16 operators: only first 16 evaluated."""
        operators = [
            {
                "id": f"op{i}",
                "type": "lfo",
                "is_enabled": True,
                "parameters": {"waveform": "sine", "rate_hz": 1.0},
                "processing": [],
                "mappings": [],
            }
            for i in range(20)
        ]
        values, _ = self.engine.evaluate_all(operators, 0, 30.0)
        assert len(values) == 16

    def test_performance_16_operators(self):
        """16 operators should evaluate in <5ms."""
        operators = [
            {
                "id": f"op{i}",
                "type": "lfo",
                "is_enabled": True,
                "parameters": {"waveform": "sine", "rate_hz": 1.0},
                "processing": [],
                "mappings": [],
            }
            for i in range(16)
        ]
        t0 = time.time()
        for _ in range(10):
            self.engine.evaluate_all(operators, 0, 30.0)
        elapsed = (time.time() - t0) / 10 * 1000
        assert elapsed < 5.0, f"16 operators took {elapsed:.1f}ms (budget: 5ms)"

    def test_audio_follower_with_pcm(self):
        """Audio follower receives PCM and returns signal."""
        t = np.linspace(0, 1, 1024, dtype=np.float32)
        pcm = np.sin(2 * np.pi * 440 * t).astype(np.float32)
        operators = [
            {
                "id": "audio1",
                "type": "audio_follower",
                "is_enabled": True,
                "parameters": {"method": "rms", "sensitivity": 1.4},
                "processing": [],
                "mappings": [],
            },
        ]
        values, _ = self.engine.evaluate_all(operators, 0, 30.0, audio_pcm=pcm)
        assert values["audio1"] > 0.5

    def test_video_analyzer_stub(self):
        """Video analyzer returns 0.0 (deferred to 6B)."""
        operators = [
            {
                "id": "vid1",
                "type": "video_analyzer",
                "is_enabled": True,
                "parameters": {},
                "processing": [],
                "mappings": [],
            },
        ]
        values, _ = self.engine.evaluate_all(operators, 0, 30.0)
        assert values["vid1"] == 0.0
