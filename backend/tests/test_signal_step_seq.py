"""Tests for step sequencer operator."""

from modulation.step_sequencer import evaluate_step_seq


class TestStepSequencer:
    def test_four_steps_at_1hz(self):
        """4 steps at 1Hz, 30fps: each step lasts 7.5 frames.
        position = frame / fps * rate * n_steps
        step_index = int(position) % n_steps
        Step boundaries at frames 0, 7.5, 15, 22.5
        """
        steps = [0.0, 0.25, 0.5, 1.0]
        assert evaluate_step_seq(steps, 1.0, 0, 30.0) == 0.0  # step 0
        assert evaluate_step_seq(steps, 1.0, 7, 30.0) == 0.0  # still step 0
        assert evaluate_step_seq(steps, 1.0, 8, 30.0) == 0.25  # step 1 (8/30*4=1.067)
        assert evaluate_step_seq(steps, 1.0, 15, 30.0) == 0.5  # step 2 (15/30*4=2.0)
        assert evaluate_step_seq(steps, 1.0, 23, 30.0) == 1.0  # step 3 (23/30*4=3.067)

    def test_sixteen_steps_at_2hz(self):
        """16 steps at 2Hz: cycle every 15 frames at 30fps."""
        steps = [i / 15.0 for i in range(16)]
        val = evaluate_step_seq(steps, 2.0, 0, 30.0)
        assert val == 0.0
        # Frame 7: roughly step 15 * (7/15) ≈ step 7
        val = evaluate_step_seq(steps, 2.0, 7, 30.0)
        assert 0.0 <= val <= 1.0

    def test_empty_steps_returns_zero(self):
        assert evaluate_step_seq([], 1.0, 0, 30.0) == 0.0

    def test_zero_rate_returns_zero(self):
        assert evaluate_step_seq([0.5, 1.0], 0.0, 0, 30.0) == 0.0

    def test_nan_rate_returns_zero(self):
        assert evaluate_step_seq([0.5, 1.0], float("nan"), 0, 30.0) == 0.0

    def test_clamps_values(self):
        """Step values outside 0-1 should be clamped."""
        assert evaluate_step_seq([1.5], 1.0, 0, 30.0) == 1.0
        assert evaluate_step_seq([-0.5], 1.0, 0, 30.0) == 0.0
