"""B8 Granulator — pure, seeded, capped grain cloud engine.

This module is the PURE DESCRIPTOR engine for the B8 Granulator instrument.
It produces grain DESCRIPTORS (position, jitter, window, per-axis grainEnv)
deterministically from (project_seed, instrument_id, frame_index, params).

Pixel/render work is P5b.17 (do NOT do rendering here).
ZMQ wiring is P5b.17.
Frontend UI is P5b.19.

Seed-derivation formula (pinned — implements EXACTLY the byte-for-byte spec):
  Per grain:
    grain_seed = derive_seed(project_seed,
                             f"gran:{instrument_id}:{grain_index}",
                             frame_index)
    rng = make_rng(grain_seed)

Fixed draw order per grain (part of the determinism contract):
  T-jitter, Y-jitter, X-jitter, C-jitter, F-jitter, L-jitter, window-phase.
  The L draw is CONSUMED even while L is inert behind its flag (so that
  enabling L later does NOT shift the other axes' values).

L-axis: accepted and drawn but INERT until an SG-3-gated flag is set
(full L behavior is P5b.18).
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Literal

import numpy as np

from engine.determinism import derive_seed, make_rng
from security import MAX_GRAINS

# ---------------------------------------------------------------------------
# Types
# ---------------------------------------------------------------------------

WindowShape = Literal["hann", "tri", "rect"]
VALID_WINDOWS: frozenset[str] = frozenset({"hann", "tri", "rect"})

# Six-axis parameter set for the granulator.
AXES: tuple[str, ...] = ("T", "Y", "X", "C", "F", "L")


@dataclass
class AxisParams:
    """Per-axis grain parameters (position centre, jitter, grainEnv)."""

    grain: float = 0.5  # [0, 1] – base position along the axis
    jitter: float = 0.0  # [0, 1] – maximum random displacement (uniform ± half-width)
    position: float = 0.5  # [0, 1] – alias for grain; kept for spec parity
    grain_env: float = 1.0  # [0, 1] – envelope scale applied to grain on this axis


@dataclass
class GranulatorParams:
    """Full parameter bundle crossing the IPC trust boundary.

    All numerics are clamped and finite-checked in __post_init__ (per
    feedback_numeric-trust-boundary).
    """

    density: int = 4  # grains/frame; capped to MAX_GRAINS
    window: WindowShape = "hann"  # grain window shape
    # Per-axis params; keyed by axis letter (T, Y, X, C, F, L)
    axes: dict[str, AxisParams] = field(default_factory=dict)
    # SG-3 gate flag — L-axis is inert unless this is True (P5b.18 owns the logic)
    l_axis_enabled: bool = False

    def __post_init__(self) -> None:
        # Clamp + validate density
        if not isinstance(self.density, (int, float)) or not math.isfinite(
            float(self.density)
        ):
            self.density = 1
        self.density = max(0, min(int(self.density), MAX_GRAINS))

        # Validate window
        if self.window not in VALID_WINDOWS:
            self.window = "hann"

        # Ensure all six axes are present with clamped values
        for ax in AXES:
            if ax not in self.axes:
                self.axes[ax] = AxisParams()
            else:
                ap = self.axes[ax]
                ap.grain = _clamp_finite(ap.grain, 0.0, 1.0)
                ap.jitter = _clamp_finite(ap.jitter, 0.0, 1.0)
                ap.position = _clamp_finite(ap.position, 0.0, 1.0)
                ap.grain_env = _clamp_finite(ap.grain_env, 0.0, 1.0)


@dataclass
class GrainDescriptor:
    """A single grain's computed descriptor — pure data, no pixels.

    All values are clamped to [0, 1] and guaranteed finite.
    window_phase: phase within the grain window (0 = onset, 1 = release).
    grain_env: per-axis envelope scale.
    window_value: evaluated window function value at window_phase.
    """

    grain_index: int
    # Per-axis final positions (base ± jitter, clamped [0, 1])
    T: float = 0.5
    Y: float = 0.5
    X: float = 0.5
    C: float = 0.5
    F: float = 0.5
    L: float = 0.5  # always computed; inert until l_axis_enabled
    # Per-axis grain envelope scales (from AxisParams.grain_env)
    T_env: float = 1.0
    Y_env: float = 1.0
    X_env: float = 1.0
    C_env: float = 1.0
    F_env: float = 1.0
    L_env: float = 1.0  # always computed; inert until l_axis_enabled
    # Window
    window_phase: float = 0.0  # [0, 1]
    window_shape: WindowShape = "hann"
    window_value: float = 1.0  # evaluated window amplitude at window_phase


@dataclass
class GrainCloud:
    """Result of one grain_cloud call — a list of grain descriptors."""

    grains: list[GrainDescriptor]
    frame_index: int
    density_requested: int
    density_capped: int
    l_axis_inert: bool  # True when l_axis_enabled is False


# ---------------------------------------------------------------------------
# Window evaluation
# ---------------------------------------------------------------------------


def _eval_window(shape: WindowShape, phase: float) -> float:
    """Evaluate window function amplitude at normalised phase ∈ [0, 1].

    hann: 0.5 * (1 - cos(2π·phase))
    tri:  1 - 2*|phase - 0.5|      (triangle, peak at centre)
    rect: 1.0                       (uniform)
    """
    phase = max(0.0, min(1.0, phase))
    if shape == "hann":
        return 0.5 * (1.0 - math.cos(2.0 * math.pi * phase))
    if shape == "tri":
        return 1.0 - 2.0 * abs(phase - 0.5)
    # rect (and any unknown fallback)
    return 1.0


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _clamp_finite(
    v: float, lo: float, hi: float, default: float | None = None
) -> float:
    """Clamp v to [lo, hi]; replace non-finite with lo (or default) (numeric trust boundary)."""
    if default is None:
        default = lo
    if not isinstance(v, (int, float)) or not math.isfinite(float(v)):
        return default
    return max(lo, min(hi, float(v)))


def _jittered_position(base: float, jitter: float, draw: float) -> float:
    """Apply ± jitter draw to base position; clamp result to [0, 1].

    draw is in [0, 1) (from rng.random()); maps to [-0.5*jitter, +0.5*jitter]
    displacement.
    """
    displacement = (draw - 0.5) * jitter
    return max(0.0, min(1.0, base + displacement))


# ---------------------------------------------------------------------------
# Core engine
# ---------------------------------------------------------------------------


def grain_cloud(
    project_seed: int,
    instrument_id: str,
    frame_index: int,
    params: GranulatorParams,
) -> GrainCloud:
    """Compute a deterministic grain cloud descriptor set for one frame.

    Returns a GrainCloud with params.density grains (hard-capped to MAX_GRAINS).
    Each grain is seeded independently; the fixed per-grain draw order is:
      T-jitter, Y-jitter, X-jitter, C-jitter, F-jitter, L-jitter, window-phase.

    L-axis draw is ALWAYS consumed (even when l_axis_enabled is False) so that
    enabling L later does NOT shift T/Y/X/C/F values.

    This function is a pure function: same (project_seed, instrument_id,
    frame_index, params) → identical GrainCloud every call.
    """
    density = params.density  # already clamped by GranulatorParams.__post_init__
    window = params.window
    axes_p = params.axes
    l_enabled = params.l_axis_enabled

    descriptors: list[GrainDescriptor] = []

    for gi in range(density):
        # Seeded per grain, per frame, per instrument
        grain_seed = derive_seed(
            project_seed,
            f"gran:{instrument_id}:{gi}",
            frame_index,
        )
        rng = make_rng(grain_seed)

        # FIXED draw order (part of determinism contract):
        # T, Y, X, C, F, L jitter draws, then window-phase draw.
        t_draw = rng.random()
        y_draw = rng.random()
        x_draw = rng.random()
        c_draw = rng.random()
        f_draw = rng.random()
        l_draw = rng.random()  # CONSUMED even when L is inert
        wp_draw = rng.random()

        # Compute jittered positions for each axis
        T_pos = _jittered_position(axes_p["T"].grain, axes_p["T"].jitter, t_draw)
        Y_pos = _jittered_position(axes_p["Y"].grain, axes_p["Y"].jitter, y_draw)
        X_pos = _jittered_position(axes_p["X"].grain, axes_p["X"].jitter, x_draw)
        C_pos = _jittered_position(axes_p["C"].grain, axes_p["C"].jitter, c_draw)
        F_pos = _jittered_position(axes_p["F"].grain, axes_p["F"].jitter, f_draw)
        # L draw consumed; position computed; inert when l_axis_enabled=False
        L_pos = _jittered_position(axes_p["L"].grain, axes_p["L"].jitter, l_draw)

        # Window phase and evaluated value
        window_phase = wp_draw  # in [0, 1)
        window_value = _eval_window(window, window_phase)

        desc = GrainDescriptor(
            grain_index=gi,
            T=T_pos,
            Y=Y_pos,
            X=X_pos,
            C=C_pos,
            F=F_pos,
            L=L_pos,
            T_env=axes_p["T"].grain_env,
            Y_env=axes_p["Y"].grain_env,
            X_env=axes_p["X"].grain_env,
            C_env=axes_p["C"].grain_env,
            F_env=axes_p["F"].grain_env,
            L_env=axes_p["L"].grain_env,
            window_phase=window_phase,
            window_shape=window,
            window_value=window_value,
        )
        descriptors.append(desc)

    return GrainCloud(
        grains=descriptors,
        frame_index=frame_index,
        density_requested=params.density,
        density_capped=density,
        l_axis_inert=not l_enabled,
    )
