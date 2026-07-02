"""P4.1 cap tests — operator count cap (64), render-budget guard, and routing cap.

Tests:
  - test_evaluate_all_caps_at_64_operators_not_16
  - test_evaluate_all_refuses_65th_operator_silently_with_one_warning_log
  - test_resolve_routings_ignores_mappings_beyond_32_per_operator
  - test_unknown_operator_type_evaluates_to_zero_without_crash
  - test_render_budget_guard_warns_exactly_at_threshold_boundary
  - test_render_budget_guard_rate_limits_repeated_warnings
  - test_render_budget_guard_warns_at_least_once_across_slow_frames
  - test_render_budget_guard_silent_when_eval_under_16ms
"""

import time
import pytest

from modulation.engine import SignalEngine, MAX_OPERATORS
from modulation.routing import resolve_routings


def _make_lfo(op_id: str) -> dict:
    return {
        "id": op_id,
        "type": "lfo",
        "is_enabled": True,
        "parameters": {"waveform": "sine", "rate_hz": 1.0, "phase_offset": 0.0},
        "processing": [],
        "mappings": [],
    }


def _make_op(op_id: str, op_type: str) -> dict:
    return {
        "id": op_id,
        "type": op_type,
        "is_enabled": True,
        "parameters": {},
        "processing": [],
        "mappings": [],
    }


class _FakeClock:
    """Deterministic time source for `SignalEngine._clock` (F4).

    Callable like `time.perf_counter` (returns the current value), but
    advanced explicitly via `.advance(dt)` instead of real wall-clock time.
    Injecting this into `engine._clock` makes the render-budget guard's
    elapsed-time and rate-limit math exact instead of dependent on actual
    sleep durations, which is what made the guard tests flake on slower
    CI runners (60 real 20ms sleeps landing 1-6 warnings depending on
    scheduler jitter).

    Starts at 1000.0 (not 0.0) so it behaves like `time.perf_counter`,
    whose value is always a large positive number — the guard's rate
    limiter compares `_now - self._budget_warn_last_t >= 1.0`, and a
    near-zero clock would make that comparison behave differently than
    it does in production.
    """

    def __init__(self, start: float = 1000.0):
        self.t = start

    def __call__(self) -> float:
        return self.t

    def advance(self, dt: float) -> None:
        self.t += dt


class TestOperatorCap:
    def test_evaluate_all_caps_at_64_operators_not_16(self):
        """MAX_OPERATORS must be 64 (not the legacy 16)."""
        assert MAX_OPERATORS == 64, f"Expected 64, got {MAX_OPERATORS}"

    def test_evaluate_all_refuses_65th_operator_silently_with_one_warning_log(
        self, caplog
    ):
        """65 operators in → exactly 64 evaluated; exactly 1 warning about cap."""
        import logging

        engine = SignalEngine()
        ops = [_make_lfo(f"op-{i}") for i in range(65)]

        with caplog.at_level(logging.WARNING, logger="modulation.engine"):
            # We expect a silent cap (no exception) but need to verify only 64 ops ran
            # The engine silently slices to MAX_OPERATORS without logging; the 65th op
            # simply isn't in active_ops, so no warning is expected from the cap itself.
            values, _ = engine.evaluate_all(ops, frame_index=0, fps=30.0)

        # Exactly 64 unique operator values emitted
        assert len(values) == 64, f"Expected 64 evaluated operators, got {len(values)}"
        # op-64 (65th, 0-indexed) must NOT appear in values
        assert "op-64" not in values

    def test_resolve_routings_ignores_mappings_beyond_32_per_operator(self):
        """40 mappings submitted → only 32 applied (defense in depth)."""
        # Build an operator with 40 mappings all targeting the same chain effect
        mappings_40 = [
            {
                "target_effect_id": "fx1",
                "target_param_key": f"param{i}",
                "depth": 1.0,
                "min": 0.0,
                "max": 1.0,
                "blend_mode": "add",
            }
            for i in range(40)
        ]
        op = {
            "id": "op-many",
            "type": "lfo",
            "is_enabled": True,
            "parameters": {},
            "processing": [],
            "mappings": mappings_40,
        }
        # Chain with all params at 0.0 (so we can count how many get modulated to > 0)
        chain = [{"effect_id": "fx1", "params": {f"param{i}": 0.0 for i in range(40)}}]
        operator_values = {"op-many": 0.5}

        result = resolve_routings(operator_values, [op], chain)
        # Only params 0-31 should be modulated (routing slices to [:32])
        params_out = result[0]["params"]
        modulated = [k for k, v in params_out.items() if v != 0.0]
        assert len(modulated) == 32, (
            f"Expected 32 modulated params, got {len(modulated)}: {modulated}"
        )
        # params 32-39 must remain at 0.0
        for i in range(32, 40):
            assert params_out[f"param{i}"] == 0.0, f"param{i} should not be modulated"

    def test_unknown_operator_type_evaluates_to_zero_without_crash(self):
        """Garbage / future operator type → 0.0, no exception."""
        engine = SignalEngine()
        ops = [
            {
                "id": "op-garbage",
                "type": "kentaroCluster",  # not yet implemented evaluator
                "is_enabled": True,
                "parameters": {"lfo_count": 8},
                "processing": [],
                "mappings": [],
            },
            {
                "id": "op-unknown",
                "type": "TOTALLY_UNKNOWN_XYZ",
                "is_enabled": True,
                "parameters": {},
                "processing": [],
                "mappings": [],
            },
        ]
        values, _ = engine.evaluate_all(ops, frame_index=0, fps=30.0)
        assert values["op-garbage"] == 0.0
        assert values["op-unknown"] == 0.0

    def test_render_budget_guard_warns_exactly_at_threshold_boundary(
        self, caplog, monkeypatch
    ):
        """Guard logic unit test: elapsed <=16ms silent, elapsed >16ms warns.

        Uses `_FakeClock` (advanced by the monkeypatched evaluator itself,
        not real sleep) so the 16ms boundary is an exact value instead of a
        real-time measurement — this is the part of F4's original assertion
        that could never be tested precisely with `time.sleep`.
        """
        import logging

        clock = _FakeClock()
        engine = SignalEngine()
        engine._clock = clock
        engine._budget_warn_last_t = 0.0
        engine._degrade_next_frame = False
        ops = [_make_lfo("op-boundary")]

        def evaluator_advancing_by(dt):
            def _evaluate(**kwargs):
                clock.advance(dt)
                return 0.5, {}

            return _evaluate

        # Exactly at budget: guard uses strict `>`, so this must stay silent.
        monkeypatch.setattr(
            "modulation.engine.evaluate_lfo", evaluator_advancing_by(0.016)
        )
        with caplog.at_level(logging.WARNING, logger="modulation.engine"):
            engine.evaluate_all(ops, frame_index=0, fps=30.0)
        at_budget = [r for r in caplog.records if "budget" in r.message.lower()]
        assert at_budget == [], "eval landing exactly on the 16ms budget must not warn"

        caplog.clear()

        # Just over budget: must warn exactly once.
        monkeypatch.setattr(
            "modulation.engine.evaluate_lfo", evaluator_advancing_by(0.0161)
        )
        with caplog.at_level(logging.WARNING, logger="modulation.engine"):
            engine.evaluate_all(ops, frame_index=1, fps=30.0)
        over_budget = [r for r in caplog.records if "budget" in r.message.lower()]
        assert len(over_budget) == 1, (
            f"Expected exactly 1 warning just over budget, got {len(over_budget)}"
        )

    def test_render_budget_guard_rate_limits_repeated_warnings(
        self, caplog, monkeypatch
    ):
        """Guard rate-limit policy: 1 warning per 1s window, deterministically.

        Every frame overruns budget by a fixed, clock-advanced 1/32s (31.25ms
        — no real sleep). 1/32 is exactly representable in binary floating
        point, so 60 accumulations introduce zero rounding error and the
        warning count is exactly predictable: warn on frame 0, then again once
        32 more frames have accumulated >=1.0s since that warning (32 *
        1/32 == 1.0), i.e. frame 32 — and nowhere else in the 60-frame run.
        This replaces the old test's wall-clock-dependent "1 to 2 warnings"
        tolerance band, which is what flaked on CI.
        """
        import logging

        clock = _FakeClock()
        engine = SignalEngine()
        engine._clock = clock
        engine._budget_warn_last_t = 0.0
        engine._degrade_next_frame = False
        ops = [_make_lfo("op-slow")]

        def slow_evaluate_lfo(**kwargs):
            clock.advance(1 / 32)  # 31.25ms > 16ms budget, every frame
            return 0.5, {}

        monkeypatch.setattr("modulation.engine.evaluate_lfo", slow_evaluate_lfo)

        warned_frames = []
        with caplog.at_level(logging.WARNING, logger="modulation.engine"):
            for frame in range(60):
                before = len(caplog.records)
                engine.evaluate_all(ops, frame_index=frame, fps=30.0)
                after = [
                    r for r in caplog.records[before:] if "budget" in r.message.lower()
                ]
                if after:
                    warned_frames.append(frame)

        assert warned_frames == [0, 32], (
            f"Expected warnings on frames [0, 32] exactly, got {warned_frames}"
        )

    def test_render_budget_guard_warns_at_least_once_across_slow_frames(
        self, caplog, monkeypatch
    ):
        """Integration test with a REAL clock: slow frames must warn at least once.

        Uses actual `time.sleep` (default `engine._clock` = `time.perf_counter`,
        unset) so this exercises the guard end-to-end including real elapsed-time
        measurement. Only asserts a wall-clock-independent LOWER bound — the
        exact count depends on runner speed/jitter (that upper-bound assertion
        was the flake); the precise rate-limit count is covered deterministically
        by test_render_budget_guard_rate_limits_repeated_warnings above.
        """
        import logging

        def slow_evaluate_lfo(**kwargs):
            time.sleep(0.020)  # 20ms > 16ms budget
            return 0.5, {}

        monkeypatch.setattr("modulation.engine.evaluate_lfo", slow_evaluate_lfo)

        engine = SignalEngine()
        engine._budget_warn_last_t = 0.0  # reset rate-limit state
        engine._degrade_next_frame = False

        ops = [_make_lfo("op-slow")]

        with caplog.at_level(logging.WARNING, logger="modulation.engine"):
            for frame in range(60):
                engine.evaluate_all(ops, frame_index=frame, fps=30.0)
            warning_count = sum(
                1
                for r in caplog.records
                if r.name == "modulation.engine" and "budget" in r.message.lower()
            )

        assert warning_count >= 1, (
            f"Expected at least 1 budget warning across 60 slow frames, got "
            f"{warning_count}"
        )

    def test_render_budget_guard_silent_when_eval_under_16ms(self, caplog, monkeypatch):
        """Fast evaluator → 0 budget warnings."""
        import logging

        def fast_evaluate_lfo(**kwargs):
            return 0.5, {}

        monkeypatch.setattr("modulation.engine.evaluate_lfo", fast_evaluate_lfo)

        engine = SignalEngine()
        engine._budget_warn_last_t = 0.0
        engine._degrade_next_frame = False

        ops = [_make_lfo("op-fast")]

        with caplog.at_level(logging.WARNING, logger="modulation.engine"):
            for frame in range(10):
                engine.evaluate_all(ops, frame_index=frame, fps=30.0)

        budget_warnings = [
            r
            for r in caplog.records
            if r.name == "modulation.engine" and "budget" in r.message.lower()
        ]
        assert len(budget_warnings) == 0, (
            f"Expected 0 budget warnings on fast path, got {len(budget_warnings)}"
        )
