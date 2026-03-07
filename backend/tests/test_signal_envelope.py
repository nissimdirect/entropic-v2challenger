"""Tests for ADSR envelope operator."""

import math

from modulation.envelope import evaluate_envelope


class TestEnvelopeADSR:
    def test_full_adsr_cycle(self):
        """Manual trigger through full ADSR cycle."""
        state = {}

        # Frame 0: trigger on → attack starts
        val, state = evaluate_envelope(True, 10, 5, 0.7, 20, 0, state)
        assert state["phase"] == "attack"
        assert val == 0.0  # start of attack

        # Frame 5: mid-attack
        val, state = evaluate_envelope(True, 10, 5, 0.7, 20, 5, state)
        assert state["phase"] == "attack"
        assert abs(val - 0.5) < 0.01

        # Frame 10: end of attack → decay
        val, state = evaluate_envelope(True, 10, 5, 0.7, 20, 10, state)
        assert state["phase"] == "decay"
        assert val == 1.0

        # Frame 15: end of decay → sustain
        val, state = evaluate_envelope(True, 10, 5, 0.7, 20, 15, state)
        assert state["phase"] == "sustain"
        assert abs(val - 0.7) < 0.01

        # Frame 20: still sustaining
        val, state = evaluate_envelope(True, 10, 5, 0.7, 20, 20, state)
        assert abs(val - 0.7) < 0.01

        # Frame 20: release (trigger off)
        val, state = evaluate_envelope(False, 10, 5, 0.7, 20, 20, state)
        assert state["phase"] == "release"

        # Frame 30: mid-release
        val, state = evaluate_envelope(False, 10, 5, 0.7, 20, 30, state)
        assert val < 0.7
        assert val > 0.0

        # Frame 40: end of release → idle
        val, state = evaluate_envelope(False, 10, 5, 0.7, 20, 40, state)
        assert val == 0.0
        assert state["phase"] == "idle"

    def test_zero_attack_instant_peak(self):
        """0-frame attack should instantly reach 1.0."""
        val, state = evaluate_envelope(True, 0, 5, 0.7, 10, 0)
        assert val == 1.0

    def test_zero_decay_instant_sustain(self):
        """0-frame decay should instantly reach sustain level."""
        val, state = evaluate_envelope(True, 0, 0, 0.5, 10, 0)
        assert abs(val - 0.5) < 0.01

    def test_zero_release_instant_off(self):
        """0-frame release should instantly go to 0."""
        state = {}
        # Trigger and get to sustain
        val, state = evaluate_envelope(True, 0, 0, 0.8, 0, 0, state)
        # Release
        val, state = evaluate_envelope(False, 0, 0, 0.8, 0, 1, state)
        assert val == 0.0
        assert state["phase"] == "idle"


class TestEnvelopeRetrigger:
    def test_retrigger_during_attack(self):
        """Retrigger during attack restarts the envelope."""
        state = {}
        val, state = evaluate_envelope(True, 10, 5, 0.7, 20, 0, state)
        val, state = evaluate_envelope(True, 10, 5, 0.7, 20, 5, state)
        assert abs(val - 0.5) < 0.01

        # Release then retrigger
        val, state = evaluate_envelope(False, 10, 5, 0.7, 20, 6, state)
        val, state = evaluate_envelope(True, 10, 5, 0.7, 20, 7, state)
        assert state["phase"] == "attack"

    def test_release_from_mid_attack(self):
        """Release during attack starts release from current value."""
        state = {}
        val, state = evaluate_envelope(True, 10, 5, 0.7, 20, 0, state)
        val, state = evaluate_envelope(True, 10, 5, 0.7, 20, 3, state)
        assert val > 0 and val < 1  # mid-attack

        val, state = evaluate_envelope(False, 10, 5, 0.7, 20, 4, state)
        assert state["phase"] == "release"


class TestEnvelopeGuards:
    def test_nan_attack(self):
        """NaN attack should be treated as 0."""
        val, state = evaluate_envelope(True, float("nan"), 5, 0.7, 10, 0)
        assert 0.0 <= val <= 1.0

    def test_nan_sustain(self):
        """NaN sustain should be treated as 0."""
        val, state = evaluate_envelope(True, 0, 0, float("nan"), 10, 0)
        assert val == 0.0

    def test_nan_release(self):
        """NaN release should not crash."""
        state = {}
        val, state = evaluate_envelope(True, 0, 0, 0.5, float("nan"), 0, state)
        val, state = evaluate_envelope(False, 0, 0, 0.5, float("nan"), 1, state)
        assert val == 0.0

    def test_idle_returns_zero(self):
        """No trigger → idle → 0."""
        val, state = evaluate_envelope(False, 10, 5, 0.7, 20, 0)
        assert val == 0.0
        assert state["phase"] == "idle"
