"""Tests for effects.shared.attractor_solver."""

import math

import numpy as np
import pytest

from effects.shared.attractor_solver import (
    SYSTEMS,
    State,
    StrangeAttractorSolver,
)

pytestmark = pytest.mark.smoke


@pytest.mark.parametrize("system", SYSTEMS)
def test_each_system_runs_without_error(system):
    solver = StrangeAttractorSolver(system=system, seed=42)
    for _ in range(50):
        solver.step()
    s = solver.state()
    assert isinstance(s, State)
    assert math.isfinite(s.x) and math.isfinite(s.y) and math.isfinite(s.z)


@pytest.mark.parametrize("system", SYSTEMS)
def test_seed_determinism(system):
    """Same (system, seed, dt) → bit-identical orbit across runs."""
    a = StrangeAttractorSolver(system=system, seed=42)
    b = StrangeAttractorSolver(system=system, seed=42)
    for _ in range(100):
        sa = a.step()
        sb = b.step()
        assert sa == sb


@pytest.mark.parametrize("system", SYSTEMS)
def test_different_seeds_diverge(system):
    a = StrangeAttractorSolver(system=system, seed=1)
    b = StrangeAttractorSolver(system=system, seed=2)
    for _ in range(50):
        a.step()
        b.step()
    assert a.state() != b.state()


@pytest.mark.parametrize("system", SYSTEMS)
def test_rescaled_output_in_unit_range_after_warmup(system):
    solver = StrangeAttractorSolver(system=system, seed=42)
    # Burn-in then check 200 samples are all in [-1, 1]
    for _ in range(300):
        solver.step()
    for _ in range(200):
        s = solver.step()
        assert -1.0 <= s.x <= 1.0, f"{system} x out of range: {s.x}"
        assert -1.0 <= s.y <= 1.0, f"{system} y out of range: {s.y}"
        assert -1.0 <= s.z <= 1.0, f"{system} z out of range: {s.z}"


def test_unknown_system_raises():
    with pytest.raises(ValueError):
        StrangeAttractorSolver(system="Garbage")


def test_reset_returns_solver_to_seed_state():
    solver = StrangeAttractorSolver(system="Lorenz", seed=42)
    initial = solver.raw_state()
    for _ in range(100):
        solver.step()
    assert solver.raw_state() != initial
    solver.reset()
    assert solver.raw_state() == initial


def test_nan_injection_resets():
    """When integrator produces NaN, solver auto-resets to seed."""
    solver = StrangeAttractorSolver(system="Lorenz", seed=42)
    # Force divergence by mutating internal state to large magnitude → next step
    # exceeds magnitude_limit and triggers reset.
    solver.x = 1e10
    solver.y = 1e10
    solver.z = 1e10
    s = solver.step()
    # After reset, step rescales but raw should match a fresh seed
    fresh = StrangeAttractorSolver(system="Lorenz", seed=42)
    assert solver.raw_state() == fresh.raw_state()


def test_state_immutable():
    s = State(x=1.0, y=2.0, z=3.0)
    with pytest.raises(Exception):
        s.x = 99.0  # type: ignore[misc]


def test_systems_list_documented():
    """The exported SYSTEMS tuple matches the dispatched systems."""
    assert SYSTEMS == ("Lorenz", "Rossler", "Thomas", "Aizawa")
    for name in SYSTEMS:
        s = StrangeAttractorSolver(system=name)
        s.step()  # at minimum, runs without error
