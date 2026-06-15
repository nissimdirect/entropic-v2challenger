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


# ---------------------------------------------------------------------------
# P5b.17 — PIXEL render path (CPU/numpy compositing)
# ---------------------------------------------------------------------------
#
# The engine above returns grain DESCRIPTORS (pure data). This section samples
# the SOURCE frame at each grain's (X, Y) position, applies the grain window +
# per-axis envelope, and composites every grain into ONE output RGBA layer.
#
# CPU/numpy ONLY. The GPU quad pass is the carved-out P5b.28. The 200-grain CPU
# ms/frame number recorded in the PR justifies that future GPU work.

# Default sampled patch half-size (pixels). Each grain stamps a small square
# patch of the source centred on its (X, Y) position, multiplied by its window
# amplitude + per-axis envelope. Bounded so a hostile/huge value can't blow up
# the per-grain inner loop (numeric trust boundary).
_DEFAULT_GRAIN_PATCH = 8
_MAX_GRAIN_PATCH = 64


def _grain_patch_halfsize(patch: int) -> int:
    """Clamp the per-grain patch half-size to a safe bounded range."""
    if not isinstance(patch, (int, float)) or not math.isfinite(float(patch)):
        return _DEFAULT_GRAIN_PATCH
    return max(1, min(_MAX_GRAIN_PATCH, int(patch)))


def render_grain_layer(
    source_rgba: np.ndarray,
    cloud: GrainCloud,
    *,
    resolution: tuple[int, int],
    patch: int = _DEFAULT_GRAIN_PATCH,
) -> np.ndarray:
    """Composite a GrainCloud's grains into ONE output RGBA layer (numpy).

    Each grain:
      * maps its (X, Y) descriptor positions ∈ [0, 1] to a source pixel centre,
      * samples a small square patch of `source_rgba` centred there,
      * scales that patch by `window_value` × (per-axis envelopes T·Y·X·C·F),
      * adds it (additive accumulate) into the output buffer.

    Returns a single (H, W, 4) uint8 RGBA array — ONE layer out, always, even
    for an empty cloud (transparent frame). Float accumulation happens in a
    private buffer; the result is clamped to [0, 255] before the uint8 cast so
    overlapping grains can't wrap-around (numeric trust boundary at the pixel
    level).
    """
    res_w, res_h = resolution
    res_w = max(1, min(8192, int(res_w)))
    res_h = max(1, min(8192, int(res_h)))

    # Float accumulator — additive grain compositing happens here, clamped once
    # at the end so dense overlap saturates to white instead of wrapping.
    acc = np.zeros((res_h, res_w, 4), dtype=np.float32)

    # Empty cloud → transparent layer (ONE layer out, never None).
    if not cloud.grains or source_rgba is None or source_rgba.size == 0:
        return acc.astype(np.uint8)

    src_h, src_w = source_rgba.shape[0], source_rgba.shape[1]
    if src_h == 0 or src_w == 0:
        return acc.astype(np.uint8)
    src_f = source_rgba.astype(np.float32)

    half = _grain_patch_halfsize(patch)

    for g in cloud.grains:
        # Per-axis envelope product (T·Y·X·C·F). L is inert (P5b.18 owns it) so
        # it is NOT multiplied in here — but its draw was already consumed in the
        # engine, so enabling L later does not shift this product's inputs.
        env = (
            _clamp_finite(g.T_env, 0.0, 1.0)
            * _clamp_finite(g.Y_env, 0.0, 1.0)
            * _clamp_finite(g.X_env, 0.0, 1.0)
            * _clamp_finite(g.C_env, 0.0, 1.0)
            * _clamp_finite(g.F_env, 0.0, 1.0)
        )
        amp = _clamp_finite(g.window_value, 0.0, 1.0) * env
        if amp <= 0.0:
            continue

        # X → column, Y → row. Positions are [0, 1] clamped descriptors.
        cx = int(round(_clamp_finite(g.X, 0.0, 1.0) * (res_w - 1)))
        cy = int(round(_clamp_finite(g.Y, 0.0, 1.0) * (res_h - 1)))

        # Output patch bounds (clamped to canvas).
        ox0 = max(0, cx - half)
        oy0 = max(0, cy - half)
        ox1 = min(res_w, cx + half)
        oy1 = min(res_h, cy + half)
        if ox1 <= ox0 or oy1 <= oy0:
            continue

        # Source sample centre — mirror X/Y mapping onto the source dimensions
        # (the grain samples the source AT position+jitter, already baked into
        # the descriptor's X/Y).
        sx = int(round(_clamp_finite(g.X, 0.0, 1.0) * (src_w - 1)))
        sy = int(round(_clamp_finite(g.Y, 0.0, 1.0) * (src_h - 1)))

        pw = ox1 - ox0
        ph = oy1 - oy0
        # Source patch bounds, clamped into the source (handles the canvas being
        # larger than the source, and grains near the source edge).
        sx0 = max(0, min(src_w - pw, sx - half))
        sy0 = max(0, min(src_h - ph, sy - half))
        sx0 = max(0, sx0)
        sy0 = max(0, sy0)
        sx1 = min(src_w, sx0 + pw)
        sy1 = min(src_h, sy0 + ph)
        spw = sx1 - sx0
        sph = sy1 - sy0
        if spw <= 0 or sph <= 0:
            continue
        # Final output patch sized to the (possibly smaller) source patch.
        ox1 = ox0 + spw
        oy1 = oy0 + sph

        patch_px = src_f[sy0:sy1, sx0:sx1, :] * amp
        acc[oy0:oy1, ox0:ox1, :] += patch_px

    np.clip(acc, 0.0, 255.0, out=acc)
    return acc.astype(np.uint8)


# ---------------------------------------------------------------------------
# P5b.17 — render-budget degrade + SG-8 density-halving hook
# ---------------------------------------------------------------------------
#
# Two independent density-degrade pressures both halve `density`:
#   (1) Per-frame budget guard: if the previous frame's eval exceeded 16ms, the
#       NEXT frame halves density (frame-local back-pressure — keeps preview
#       interactive without waiting for the OS memory monitor).
#   (2) SG-8 memory pressure: when the canonical degrade order reaches
#       `a1_grain_density_halved` (order 3: latent grains → spectral → density),
#       the FeatureRegistry fires this module's degrade hook, latching a global
#       half-density flag until restore.
#
# Both are bounded so density never collapses below a minimum visible floor and
# the halving NEVER crashes mid-frame (it only shrinks an int).

# 16ms = one 60fps frame. Eval beyond this triggers the per-frame degrade.
RENDER_BUDGET_MS: float = 16.0
# Density floor — degrade never drops below this (always >=1 grain renders).
MIN_DENSITY: int = 1

# SG-8 stage name this instrument registers against (canonical order #3).
SG8_DENSITY_STAGE: str = "a1_grain_density_halved"

# Process-wide latch: True while SG-8 memory pressure has degraded grain
# density. Flipped by the registered degrade()/restore() callbacks. Read by
# `effective_density`. Module-level (not per-instance) because the Feature
# registry fires one callback for the whole feature, mirroring how the other
# SG-8 stages degrade a global resource.
_sg8_density_degraded: bool = False


def sg8_density_degraded() -> bool:
    """True while SG-8 memory pressure has halved grain density (test hook)."""
    return _sg8_density_degraded


def _sg8_degrade_density() -> None:
    """SG-8 degrade callback: latch the global half-density flag.

    Idempotent + crash-proof: only flips a bool, never touches a live frame
    buffer, so it is safe to fire from the monitor's background thread mid-render
    (the next `effective_density` read picks it up — no in-flight frame mutated).
    """
    global _sg8_density_degraded
    _sg8_density_degraded = True


def _sg8_restore_density() -> None:
    """SG-8 restore callback: clear the global half-density flag."""
    global _sg8_density_degraded
    _sg8_density_degraded = False


def reset_sg8_density_for_testing() -> None:
    """Clear the SG-8 density latch (test isolation only)."""
    global _sg8_density_degraded
    _sg8_density_degraded = False


def register_sg8_density_hook(registry) -> None:
    """Register the granulator's density-halving degrade/restore hook.

    `registry` is a `safety.pressure.registry.FeatureRegistry` (passed in to
    avoid importing the singleton here — keeps this module pure/testable). The
    hook is registered against the canonical `a1_grain_density_halved` stage so
    the SG-8 monitor halves grain density at pressure order #3 (after latent
    grains + spectral state), per SPEC-3 §5.2.
    """
    registry.register(
        SG8_DENSITY_STAGE,
        degrade=_sg8_degrade_density,
        restore=_sg8_restore_density,
        label="granulator_density_halving",
    )


def _halve_density(density: int) -> int:
    """Halve density, never below MIN_DENSITY, never below 0 work for 0 input."""
    if density <= 0:
        return 0
    return max(MIN_DENSITY, density // 2)


def effective_density(
    base_density: int,
    *,
    last_frame_ms: float | None = None,
    budget_ms: float = RENDER_BUDGET_MS,
) -> int:
    """Resolve the density to actually render this frame after degrade pressures.

    Applies (independently, both can stack):
      * SG-8 memory-pressure latch (`_sg8_density_degraded`) → halve.
      * Per-frame budget guard: if `last_frame_ms` (the PREVIOUS frame's eval
        time) exceeded `budget_ms`, halve again.

    `base_density` is already capped to MAX_GRAINS by GranulatorParams. The
    result is clamped to [0, base_density] and is always finite. Never raises.
    """
    if not isinstance(base_density, (int, float)) or not math.isfinite(
        float(base_density)
    ):
        return 0
    density = max(0, min(int(base_density), MAX_GRAINS))

    if _sg8_density_degraded:
        density = _halve_density(density)

    if (
        last_frame_ms is not None
        and isinstance(last_frame_ms, (int, float))
        and math.isfinite(float(last_frame_ms))
        and float(last_frame_ms) > budget_ms
    ):
        density = _halve_density(density)

    return density
