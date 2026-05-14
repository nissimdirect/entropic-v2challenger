"""Strange-attractor solvers — shared kernel for Entropic effects.

Used by future Frankenstein effects that need deterministic chaos orbits
(attractor_kaleidoscope from PR #48, histogram_attractor from PR #49, and
upcoming work). Mirrors the design of the audio-side `pcs::chaos::Solver`
chassis lib at `~/Desktop/PLUGIN-MACHINERY/FRANKENSTEIN/AUDIO-SCAFFOLDS/Strange/`.

Determinism: same (system, seed, params, dt) → bit-identical orbit across
runs. Auto-clamps + rescales to [-1, 1] per axis via running min/max
tracking. NaN/Inf guard with reset-to-seed.

Four canonical strange-attractor systems:
    Lorenz   — sigma=10, rho=28, beta=8/3
    Rossler  — a=0.2, b=0.2, c=5.7
    Thomas   — b=0.2 (cyclically symmetric)
    Aizawa   — a=0.95, b=0.7, c=0.6, d=3.5, e=0.25, f=0.1
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np


@dataclass(frozen=True)
class State:
    x: float
    y: float
    z: float


SYSTEMS = ("Lorenz", "Rossler", "Thomas", "Aizawa")


def _lorenz_deriv(x, y, z, sigma=10.0, rho=28.0, beta=8.0 / 3.0):
    return (sigma * (y - x), x * (rho - z) - y, x * y - beta * z)


def _rossler_deriv(x, y, z, a=0.2, b=0.2, c=5.7):
    return (-y - z, x + a * y, b + z * (x - c))


def _thomas_deriv(x, y, z, b=0.2):
    return (math.sin(y) - b * x, math.sin(z) - b * y, math.sin(x) - b * z)


def _aizawa_deriv(x, y, z, a=0.95, b=0.7, c=0.6, d=3.5, e=0.25, f=0.1):
    return (
        (z - b) * x - d * y,
        d * x + (z - b) * y,
        c + a * z - z**3 / 3.0 - (x**2 + y**2) * (1.0 + e * z) + f * z * x**3,
    )


_DERIVS = {
    "Lorenz": _lorenz_deriv,
    "Rossler": _rossler_deriv,
    "Thomas": _thomas_deriv,
    "Aizawa": _aizawa_deriv,
}


def _rk4_step(deriv, x, y, z, dt):
    """Classic RK4 integration step."""
    k1x, k1y, k1z = deriv(x, y, z)
    k2x, k2y, k2z = deriv(x + 0.5 * dt * k1x, y + 0.5 * dt * k1y, z + 0.5 * dt * k1z)
    k3x, k3y, k3z = deriv(x + 0.5 * dt * k2x, y + 0.5 * dt * k2y, z + 0.5 * dt * k2z)
    k4x, k4y, k4z = deriv(x + dt * k3x, y + dt * k3y, z + dt * k3z)
    nx = x + (dt / 6.0) * (k1x + 2 * k2x + 2 * k3x + k4x)
    ny = y + (dt / 6.0) * (k1y + 2 * k2y + 2 * k3y + k4y)
    nz = z + (dt / 6.0) * (k1z + 2 * k2z + 2 * k3z + k4z)
    return nx, ny, nz


class StrangeAttractorSolver:
    """RK4 integrator for 4 strange-attractor systems with deterministic seeding.

    Per-axis output is auto-rescaled to [-1, 1] via a rolling min/max tracker
    that warms up over the first ~200 samples then stabilizes. NaN/Inf detection
    auto-resets to the seed state to keep the orbit on-manifold.
    """

    SYSTEMS = SYSTEMS

    def __init__(
        self,
        system: str = "Lorenz",
        seed: int = 42,
        dt: float = 0.01,
        magnitude_limit: float = 1e3,
    ):
        if system not in _DERIVS:
            raise ValueError(f"unknown system {system!r}; use one of {SYSTEMS}")
        self.system = system
        self.seed = int(seed)
        self.dt = float(dt)
        self.magnitude_limit = float(magnitude_limit)
        self._deriv = _DERIVS[system]
        self._reset_state()
        self._minmax = {"x": [0.0, 0.0], "y": [0.0, 0.0], "z": [0.0, 0.0]}
        self._sample_count = 0

    def _reset_state(self):
        rng = np.random.default_rng(self.seed)
        self.x, self.y, self.z = (float(v) for v in rng.uniform(-0.5, 0.5, 3))

    def reset(self):
        self._reset_state()
        self._minmax = {"x": [0.0, 0.0], "y": [0.0, 0.0], "z": [0.0, 0.0]}
        self._sample_count = 0

    def step(self) -> State:
        nx, ny, nz = _rk4_step(self._deriv, self.x, self.y, self.z, self.dt)
        # NaN/Inf guard
        if not (math.isfinite(nx) and math.isfinite(ny) and math.isfinite(nz)):
            self._reset_state()
            return self.state()
        # Magnitude runaway guard
        if (
            abs(nx) > self.magnitude_limit
            or abs(ny) > self.magnitude_limit
            or abs(nz) > self.magnitude_limit
        ):
            self._reset_state()
            return self.state()
        self.x, self.y, self.z = nx, ny, nz
        # Update min/max tracker
        for axis, val in (("x", nx), ("y", ny), ("z", nz)):
            mn, mx = self._minmax[axis]
            if self._sample_count == 0:
                self._minmax[axis] = [val, val]
            else:
                self._minmax[axis] = [min(mn, val), max(mx, val)]
        self._sample_count += 1
        return self.state()

    def state(self) -> State:
        """Return the rescaled state in [-1, 1] per axis."""
        sx = self._rescale("x", self.x)
        sy = self._rescale("y", self.y)
        sz = self._rescale("z", self.z)
        return State(x=sx, y=sy, z=sz)

    def raw_state(self) -> State:
        """Return the un-rescaled state (raw integrator output)."""
        return State(x=self.x, y=self.y, z=self.z)

    def _rescale(self, axis: str, val: float) -> float:
        mn, mx = self._minmax[axis]
        span = mx - mn
        if span < 1e-9:
            return 0.0
        # Map [mn, mx] → [-1, 1]
        return float(2.0 * (val - mn) / span - 1.0)
