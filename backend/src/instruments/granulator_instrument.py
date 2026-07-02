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
import os
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

# ---------------------------------------------------------------------------
# P5b.18 — B8 grain SELECTION rules (which positions grains spawn at)
# ---------------------------------------------------------------------------
#
# A grain `selection` rule decides HOW each grain's spawn position is chosen.
# This is orthogonal to the seeded jitter engine above: `random` keeps the pure
# seeded draw; `onset` biases the spawn toward audio-transient frames (consuming
# `modulation.audio_follower`); `latentSimilarity` and `scenePayload` are gated.
#
#   random           — IMPLEMENTED. Seeded per-grain draw (the existing engine).
#   onset            — IMPLEMENTED. Consumes audio_follower onset triggers; do NOT
#                      reimplement onset detection here.
#   latentSimilarity — RESEARCH, flag-gated (SG-3-coupled). Selecting it with the
#                      flag OFF is REJECTED at the loader trust boundary (schema.py).
#                      On any latent READ it MUST pass through the SG-3 sentinel
#                      (`safety.latent_sentinel.check_and_clamp`).
#   scenePayload     — RESERVED. No scene-detection metadata source exists on main
#                      (verified by orchestrator), so this is schema-RESERVED +
#                      validator-REJECTED, mirroring the SPEC-2 tier-gating pattern.
#                      We do NOT invent a scene source.

SelectionRule = Literal["random", "onset", "scenePayload", "latentSimilarity"]

# P5b.28 — preview render path for the grain composite. 'cpu' is the
# deterministic, byte-identity baseline (and the ONLY path export ever uses);
# 'gpu' is the MLX instanced-quad preview path (granulator_gpu.py). Unknown /
# malformed values degrade to 'cpu' at the engine fail-safe (the loader / zmq
# parser is the real trust boundary). Export ALWAYS coerces to 'cpu'.
RenderPath = Literal["cpu", "gpu"]
VALID_RENDER_PATHS: frozenset[str] = frozenset({"cpu", "gpu"})
DEFAULT_RENDER_PATH: str = "cpu"

# Always-implemented selection rules (no flag, no external source needed).
IMPLEMENTED_SELECTION_RULES: frozenset[str] = frozenset({"random", "onset"})

# RESERVED — schema-recognised but has no data source on main; the loader rejects
# it LOUDLY (mirrors the SPEC-2 tier-gating reserved pattern). No scene source is
# invented here.
RESERVED_SELECTION_RULES: frozenset[str] = frozenset({"scenePayload"})

# RESEARCH — recognised but gated behind the SG-3-coupled flag below. Selecting it
# flag-OFF is rejected at the loader (the B9-style trust boundary applied to B8).
RESEARCH_SELECTION_RULES: frozenset[str] = frozenset({"latentSimilarity"})

# All selection values the schema RECOGNISES (recognised != accepted). An
# unrecognised value is rejected as malformed; a recognised-but-gated value is
# rejected with a flag/reserved-specific message.
ALL_SELECTION_RULES: frozenset[str] = (
    IMPLEMENTED_SELECTION_RULES | RESERVED_SELECTION_RULES | RESEARCH_SELECTION_RULES
)

DEFAULT_SELECTION: str = "random"


def latent_similarity_enabled() -> bool:
    """Read the SG-3-coupled EXPERIMENTAL_LATENT_SELECTION env flag (true/1/yes/on).

    When OFF (default), the `latentSimilarity` selection rule is REJECTED at the
    loader trust boundary (project/schema.py). Mirrors the EXPERIMENTAL_AXIS_BINDINGS
    / EXPERIMENTAL_AUDIO_TRACKS flag-reader convention in zmq_server.py.

    The flag is SG-3-coupled: any latent READ taken on this path is guarded by the
    SG-3 NaN-sentinel (`select_latent_grain_positions` calls `check_and_clamp`).
    """
    val = os.environ.get("EXPERIMENTAL_LATENT_SELECTION", "").strip().lower()
    return val in {"true", "1", "yes", "on"}


def accepted_selection_rules() -> frozenset[str]:
    """The currently-ACCEPTED selection-rule set (the loader's accept-set).

    Always the two implemented rules (random/onset). Adds `latentSimilarity` ONLY
    when EXPERIMENTAL_LATENT_SELECTION is on. `scenePayload` is NEVER accepted (no
    source on main — reserved). This is the authoritative accept-set consulted by
    the loader trust boundary in project/schema.py.
    """
    if latent_similarity_enabled():
        return IMPLEMENTED_SELECTION_RULES | RESEARCH_SELECTION_RULES
    return IMPLEMENTED_SELECTION_RULES


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
    # P5b.18 — grain SELECTION rule. The LOADER (project/schema.py) is the trust
    # boundary that rejects gated/reserved values; this engine-level guard is the
    # second line of defense: an unknown/gated value that somehow reaches the
    # engine degrades safely to the default seeded `random` rather than crashing.
    selection: SelectionRule = "random"
    # P5b.28 — preview render path. 'cpu' (default) is the deterministic byte-
    # identity baseline; 'gpu' is the MLX instanced-quad preview path. An
    # unknown value degrades to 'cpu' (engine fail-safe; the loader/zmq parser is
    # the real trust boundary). Export ALWAYS coerces to 'cpu' (granulator_gpu).
    render_path: RenderPath = "cpu"

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

        # Validate selection (engine-level fail-safe — the loader is the real
        # trust boundary). An unrecognised, reserved, or flag-off-research value
        # degrades to the seeded `random` rule rather than crashing the engine.
        if self.selection not in accepted_selection_rules():
            self.selection = DEFAULT_SELECTION  # type: ignore[assignment]

        # Validate render_path (engine-level fail-safe — the loader/zmq parser is
        # the real trust boundary). An unknown value degrades to the CPU baseline
        # rather than crashing the engine.
        if self.render_path not in VALID_RENDER_PATHS:
            self.render_path = DEFAULT_RENDER_PATH  # type: ignore[assignment]

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


def parse_granulator_layer(
    gran_raw: dict,
) -> tuple["GranulatorParams | None", list[str]]:
    """Parse + validate a ``performance.granulator`` payload (TRUST BOUNDARY).

    SHARED CONTRACT SOURCE — consumed by BOTH the preview render path
    (``zmq_server._handle_render_composite``) and the EXPORT render path
    (``engine.export.ExportManager._composite_export_frame``) so the two cannot
    drift. Returns ``(params, errors)``. On ANY structural error returns
    ``(None, [messages])`` so the caller rejects the render BEFORE any
    decode/sample (per feedback_numeric-trust-boundary). All numerics are clamped
    + finite-guarded by ``GranulatorParams.__post_init__``; this function rejects
    only *structural* malformation (wrong types, grain count over the MAX_GRAINS
    security cap, reserved/gated selection, unknown render_path) that a silent
    clamp/coerce would otherwise mask.
    """
    errors: list[str] = []
    if not isinstance(gran_raw, dict):
        return None, ["granulator payload must be an object"]

    # Density / grain count — reject over the hard MAX_GRAINS cap LOUDLY (a
    # request asking for more grains than the security cap is malformed, not
    # silently clamped — surfaces a corrupt/hostile project).
    density_raw = gran_raw.get("density", gran_raw.get("grain_count", 4))
    if not isinstance(density_raw, (int, float)) or isinstance(density_raw, bool):
        return None, ["granulator density must be a number"]
    if not math.isfinite(float(density_raw)):
        return None, ["granulator density must be finite"]
    if int(density_raw) > MAX_GRAINS:
        return None, [
            f"granulator density {int(density_raw)} exceeds MAX_GRAINS={MAX_GRAINS}"
        ]
    if int(density_raw) < 0:
        return None, ["granulator density must be non-negative"]

    window = gran_raw.get("window", "hann")
    if not isinstance(window, str):
        return None, ["granulator window must be a string"]

    # Per-axis params. `axes` (when present) must be a dict of axis→params.
    raw_axes = gran_raw.get("axes", {})
    if raw_axes and not isinstance(raw_axes, dict):
        return None, ["granulator axes must be an object"]
    axes: dict[str, AxisParams] = {}
    for ax, ap in (raw_axes or {}).items():
        if not isinstance(ap, dict):
            return None, [f"granulator axis {ax!r} params must be an object"]
        # Numerics flow through AxisParams (clamped in __post_init__ of the
        # parent); reject only non-numeric *types* here.
        for key in ("grain", "jitter", "position", "grain_env"):
            if key in ap and (
                not isinstance(ap[key], (int, float)) or isinstance(ap[key], bool)
            ):
                return None, [f"granulator axis {ax!r} field {key!r} must be a number"]
        axes[str(ax)] = AxisParams(
            grain=float(ap.get("grain", 0.5)),
            jitter=float(ap.get("jitter", 0.0)),
            position=float(ap.get("position", 0.5)),
            grain_env=float(ap.get("grain_env", 1.0)),
        )

    l_enabled = bool(gran_raw.get("l_axis_enabled", False))

    # Preview render path ('cpu'|'gpu'). String accept-set trust boundary
    # (mirrors `selection`): reject an unrecognised value LOUDLY rather than let
    # GranulatorParams.__post_init__ silently coerce it to 'cpu' (a
    # no-silent-fallback violation on a hand-edited payload). Absent → 'cpu'
    # (regression-safe; the deterministic byte-identity baseline).
    render_path_raw = gran_raw.get("render_path", "cpu")
    if not isinstance(render_path_raw, str):
        return None, ["granulator render_path must be a string"]
    if render_path_raw not in VALID_RENDER_PATHS:
        return None, [
            f"granulator render_path {render_path_raw!r} is not accepted "
            f"(accepted: {sorted(VALID_RENDER_PATHS)})"
        ]

    # grain SELECTION rule. REJECT here BEFORE GranulatorParams construction: a
    # flag-off `latentSimilarity` or the reserved `scenePayload` must fail LOUDLY,
    # never get silently coerced to "random" by GranulatorParams.__post_init__
    # (that silent fallback would be a no-silent-fallback violation on a hostile /
    # hand-edited payload). Absent → defaults to "random" (regression-safe).
    selection_raw = gran_raw.get("selection", "random")
    if not isinstance(selection_raw, str):
        return None, ["granulator selection must be a string"]
    accepted_sel = accepted_selection_rules()
    if selection_raw not in accepted_sel:
        if selection_raw in RESERVED_SELECTION_RULES:
            return None, [
                f"granulator selection {selection_raw!r} is reserved — no "
                f"scene-detection source exists (accepted: {sorted(accepted_sel)})"
            ]
        return None, [
            f"granulator selection {selection_raw!r} is not accepted "
            f"(flag-gated/unknown; accepted: {sorted(accepted_sel)})"
        ]

    try:
        params = GranulatorParams(
            density=int(density_raw),
            window=window,  # type: ignore[arg-type]
            axes=axes,
            l_axis_enabled=l_enabled,
            selection=selection_raw,  # type: ignore[arg-type]
            render_path=render_path_raw,  # type: ignore[arg-type]
        )
    except Exception as e:  # noqa: BLE001 — structural construction guard
        return None, [f"granulator params invalid: {e}"]
    return params, errors


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
    *,
    selection_weights: list[float] | None = None,
    selection_strength: float = 0.0,
) -> GrainCloud:
    """Compute a deterministic grain cloud descriptor set for one frame.

    Returns a GrainCloud with params.density grains (hard-capped to MAX_GRAINS).
    Each grain is seeded independently; the fixed per-grain draw order is:
      T-jitter, Y-jitter, X-jitter, C-jitter, F-jitter, L-jitter, window-phase.

    L-axis draw is ALWAYS consumed (even when l_axis_enabled is False) so that
    enabling L later does NOT shift T/Y/X/C/F values.

    P5b.18 — SELECTION consumption: `selection_weights` (per-grain T weights ∈
    [0,1], produced by `select_grain_weights` for the active rule) biases each
    grain's T-position toward its weight by `selection_strength` ∈ [0,1]. For the
    `random` rule the caller passes `selection_weights=None` (or strength 0) so
    the jittered T-position is UNCHANGED — byte-identical to the pre-P5b.18 engine
    (the determinism contract + every existing test). For `onset` the caller
    passes the onset-biased weights + the onset strength, so a transient pulls the
    grains' T-positions toward the onset — selection now CHANGES the output on the
    live render path (not a dead feature). The jitter draw order is untouched, so
    enabling selection never shifts Y/X/C/F/L.

    This function is a pure function: same (project_seed, instrument_id,
    frame_index, params, selection_weights, selection_strength) → identical
    GrainCloud every call.
    """
    density = params.density  # already clamped by GranulatorParams.__post_init__
    window = params.window
    axes_p = params.axes
    l_enabled = params.l_axis_enabled

    # Finite-guard the selection-bias strength at the boundary (numeric trust).
    sel_strength = _clamp_finite(selection_strength, 0.0, 1.0)
    sel_active = selection_weights is not None and sel_strength > 0.0

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
        # SELECTION bias: blend the jittered T toward the per-grain selection
        # weight by sel_strength. Inactive (random / strength 0) → no change, so
        # `random` stays byte-identical to the pre-P5b.18 engine.
        if sel_active and gi < len(selection_weights):  # type: ignore[arg-type]
            w = _clamp_finite(selection_weights[gi], 0.0, 1.0)  # type: ignore[index]
            T_pos = max(0.0, min(1.0, T_pos + (w - T_pos) * sel_strength))
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
# P5b.18 — SELECTION dispatch (which positions grains spawn at along T)
# ---------------------------------------------------------------------------
#
# A selection rule returns, per grain, a T-position weight ∈ [0, 1] used to bias
# where in the source timeline the grain samples. `random` is the seeded engine
# above (no bias). `onset` biases toward audio-transient frames by consuming the
# `audio_follower` onset trigger. `latentSimilarity` is flag-gated + SG-3-guarded.
# `scenePayload` has no source → reserved (rejected at the loader, never reached).


class GrainSelectionError(ValueError):
    """Raised when a grain selection rule cannot be honored at the engine layer.

    The loader (project/schema.py) is the primary trust boundary and rejects
    gated/reserved selection values at load. This engine-level error is the
    second line of defense for a value that bypassed the loader (e.g. a
    programmatic caller) — surfaced as a lane error / user-facing toast by the
    render dispatch, never a silent wrong-frame.
    """


def select_random_grain_weights(
    project_seed: int,
    instrument_id: str,
    frame_index: int,
    density: int,
) -> list[float]:
    """`random` selection — seeded per-grain T weights ∈ [0, 1).

    Reuses the P5b.16 determinism formula (derive_seed/make_rng with the exact
    per-grain key) so the weights are byte-identical across replays. This consumes
    a SEPARATE seed namespace (`gransel:`) from the jitter engine's `gran:` so
    adding selection does NOT shift the jitter draws of existing projects.
    """
    weights: list[float] = []
    for gi in range(max(0, int(density))):
        seed = derive_seed(project_seed, f"gransel:{instrument_id}:{gi}", frame_index)
        rng = make_rng(seed)
        weights.append(float(rng.random()))
    return weights


def select_onset_grain_weights(
    pcm: np.ndarray | None,
    sample_rate: int,
    *,
    density: int,
    audio_state: dict | None = None,
    onset_params: dict | None = None,
    project_seed: int = 0,
    instrument_id: str = "",
    frame_index: int = 0,
) -> tuple[list[float], dict]:
    """`onset` selection — bias grain T-weights by the audio onset trigger.

    CONSUMES `modulation.audio_follower.evaluate_audio(..., method='onset')`; it
    does NOT reimplement onset detection. The follower returns a 0..1 onset
    strength for the current frame window plus its persistent state (carried
    across frames for spectral-flux). The onset strength shifts the seeded base
    weights toward the frame onset: strong onset → grains cluster near the
    transient (weight pulled up by `strength`); silence → falls back to the
    seeded `random` distribution (so onset with no audio == random, never a
    degenerate all-zero cloud).

    Returns (weights, audio_state_out) — the caller threads audio_state_out into
    the next frame so spectral-flux onset detection has its previous spectrum.
    """
    from modulation.audio_follower import evaluate_audio

    strength, state_out = evaluate_audio(
        pcm,
        "onset",
        onset_params or {},
        sample_rate,
        audio_state,
    )
    # Finite-guard the follower output at the trust boundary (it already clamps
    # to [0,1], but defense-in-depth per feedback_numeric-trust-boundary).
    if not math.isfinite(strength):
        strength = 0.0
    strength = max(0.0, min(1.0, float(strength)))

    base = select_random_grain_weights(
        project_seed, instrument_id, frame_index, density
    )
    # Onset bias: blend each seeded weight toward 1.0 (the transient) by the onset
    # strength. strength=0 → pure random; strength=1 → all grains at the onset.
    weights = [max(0.0, min(1.0, w + (1.0 - w) * strength)) for w in base]
    return weights, state_out


def select_latent_grain_weights(
    latent: np.ndarray,
    *,
    density: int,
    backbone: str = "_default",
    project_seed: int = 0,
    instrument_id: str = "",
    frame_index: int = 0,
    context: str = "B8 latentSimilarity selection",
) -> list[float]:
    """`latentSimilarity` selection — flag-gated, SG-3-guarded latent read.

    This path is RESEARCH and gated behind EXPERIMENTAL_LATENT_SELECTION (the
    loader rejects it flag-off, so this should only run with the flag on). On ANY
    latent READ it MUST pass through the SG-3 NaN-sentinel before the latent is
    consumed (per feedback_numeric-trust-boundary + SPEC-3 §3): a NaN/Inf/OOD
    latent ABORTS the lane via `LatentSentinelError`, which the render dispatch
    converts to a user-facing toast — it NEVER produces grain positions from a
    poisoned latent.

    The sentinel is consumed (NOT modified): `check_and_clamp` with the
    per-backbone L2 ceiling. A clamped (renormalized) latent is safe to use; only
    NaN/Inf/zero latents raise.
    """
    if not latent_similarity_enabled():
        # Defense-in-depth: should be unreachable (loader rejects flag-off), but
        # never silently fall through to a latent read with the flag off.
        raise GrainSelectionError(
            "latentSimilarity selection requires EXPERIMENTAL_LATENT_SELECTION"
        )

    # SG-3 sentinel on the latent READ (consume the P5b.5 seam; do NOT modify it).
    from safety.latent_sentinel import check_and_clamp, get_l2_ceiling_for_backbone

    ceiling = get_l2_ceiling_for_backbone(backbone)
    # Raises LatentSentinelError on NaN/Inf/zero → lane abort + toast upstream.
    result = check_and_clamp(latent, l2_ceiling=ceiling, context=context)
    safe_latent = result.latent

    # Derive deterministic T-weights from the SAFE latent: project each grain's
    # seeded probe vector onto the latent and map cosine similarity → [0, 1].
    flat = safe_latent.astype(np.float64).ravel()
    norm = float(np.linalg.norm(flat))
    if norm <= 0.0:  # already guarded by the floor check, belt-and-suspenders
        return select_random_grain_weights(
            project_seed, instrument_id, frame_index, density
        )
    unit = flat / norm

    weights: list[float] = []
    for gi in range(max(0, int(density))):
        seed = derive_seed(project_seed, f"granlat:{instrument_id}:{gi}", frame_index)
        rng = make_rng(seed)
        probe = rng.standard_normal(unit.shape[0])
        pnorm = float(np.linalg.norm(probe))
        if pnorm <= 0.0:
            weights.append(0.5)
            continue
        cos = float(np.dot(unit, probe / pnorm))  # ∈ [-1, 1]
        weights.append(max(0.0, min(1.0, 0.5 * (cos + 1.0))))  # → [0, 1]
    return weights


def select_grain_weights(
    selection: str,
    project_seed: int,
    instrument_id: str,
    frame_index: int,
    density: int,
    *,
    pcm: np.ndarray | None = None,
    sample_rate: int = 48000,
    audio_state: dict | None = None,
    onset_params: dict | None = None,
    latent: np.ndarray | None = None,
    backbone: str = "_default",
) -> tuple[list[float], dict | None]:
    """Dispatch to the named selection rule; return (weights, audio_state_out).

    `audio_state_out` is non-None only for `onset` (the follower's carried state).
    Unrecognised / reserved / flag-off values raise GrainSelectionError (the
    loader is the primary boundary — this is the engine fail-safe).
    """
    if selection == "random":
        return (
            select_random_grain_weights(
                project_seed, instrument_id, frame_index, density
            ),
            None,
        )
    if selection == "onset":
        return select_onset_grain_weights(
            pcm,
            sample_rate,
            density=density,
            audio_state=audio_state,
            onset_params=onset_params,
            project_seed=project_seed,
            instrument_id=instrument_id,
            frame_index=frame_index,
        )
    if selection == "latentSimilarity":
        if latent is None:
            raise GrainSelectionError(
                "latentSimilarity selection requires a latent vector"
            )
        return (
            select_latent_grain_weights(
                latent,
                density=density,
                backbone=backbone,
                project_seed=project_seed,
                instrument_id=instrument_id,
                frame_index=frame_index,
            ),
            None,
        )
    if selection in RESERVED_SELECTION_RULES:
        raise GrainSelectionError(
            f"selection {selection!r} is reserved — no scene-detection source "
            f"exists (schema-rejected at load)"
        )
    raise GrainSelectionError(f"unknown grain selection rule {selection!r}")


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

    # Defense-in-depth: the pipeline contract is RGBA (H, W, 4). A non-RGBA
    # source would ValueError-broadcast at the `acc[...] += patch_px` accumulate;
    # return a transparent layer rather than crash the render (not reachable
    # today, cheap insurance).
    if source_rgba.ndim != 3 or source_rgba.shape[2] != 4:
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

# 16ms = one 60fps frame. Eval beyond this TRIPS the budget degrade.
RENDER_BUDGET_MS: float = 16.0
# Recovery margin — density only ratchets back UP toward base after sustained
# eval BELOW this band (a deadband under the 16ms trip so the controller has
# hysteresis: trip at >16ms, recover only when comfortably under at <12ms).
RENDER_RECOVERY_MS: float = 12.0
# Consecutive good frames required (under RENDER_RECOVERY_MS) before recovering
# one step toward base — prevents a single fast frame from un-degrading.
RENDER_RECOVERY_FRAMES: int = 3
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

    Idempotent by label: unregister-first so constructing multiple ZMQServers in
    one process (e.g. test fixtures) does not accumulate duplicate callbacks that
    inflate SG-8 telemetry (the callbacks are stateless module-level functions,
    so a duplicate would be harmless but noisy).
    """
    registry.unregister(SG8_DENSITY_STAGE, label="granulator_density_halving")
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


def _sanitize_base_density(base_density: int) -> int:
    """Clamp base density to [0, MAX_GRAINS]; non-finite/non-numeric → 0."""
    if not isinstance(base_density, (int, float)) or not math.isfinite(
        float(base_density)
    ):
        return 0
    return max(0, min(int(base_density), MAX_GRAINS))


class BudgetController:
    """Stateful render-budget degrade controller WITH HYSTERESIS (TIGER 3 fix).

    The naive controller recomputed effective density from `base_density` every
    frame using only the immediately-prior frame's time. When the dominant cost
    is the per-frame buffer alloc/clip/cast (NOT the grain loop), halving density
    barely lowers eval time → a max-density 4K granulator strobes full↔half every
    other frame (a visible density/brightness flicker at ~30Hz). A naive
    "recover-to-base after K good frames" still strobes, just at a longer period:
    it climbs straight back to the budget-blowing density and trips again.

    This controller CONVERGES on the HIGHEST SAFE density via AIMD (additive-
    increase / multiplicative-decrease) with a remembered ceiling:

      * TRIP (eval > BUDGET=16ms): latch a CEILING just below the density that
        overshot (this density is now known-bad) and MULTIPLICATIVELY drop the
        floor (halve it). Reset the good-frame streak.
      * HOLD (deadband [RECOVERY, BUDGET] = 12–16ms): we are right at the working
        point — hold the floor, reset the streak (recovery needs comfortably-fast
        frames, not borderline ones).
      * RECOVER (eval < RECOVERY=12ms for RENDER_RECOVERY_FRAMES consecutive
        frames): ADDITIVELY step the floor up by one grain toward base — but NEVER
        above the latched ceiling. Recovery to base only happens once the ceiling
        itself clears (no overshoot for a long good run), so the controller
        settles one notch below the last-known-bad density instead of bouncing
        back into it. One fast frame never un-degrades.

    The remembered ceiling is what makes this converge rather than oscillate: the
    density that tripped is never re-attempted on the next recovery, so the system
    homes in on max-safe and stays there (zero per-frame flips in steady state).

    The SG-8 memory-pressure latch is applied multiplicatively ON TOP of the
    converged floor (its own hysteresis lives in the registry threshold/restore
    band, so it does not oscillate here).

    Per-instrument state (one controller per granulator voice). `last_frame_ms`
    fed to `step()` is the PREVIOUS frame's measured grain-render eval time.
    """

    def __init__(self) -> None:
        # The latched density floor. None = not degraded (render at base).
        self._floor: int | None = None
        # Highest density known to overshoot the budget. None = no ceiling yet.
        # Recovery never climbs to-or-above this (AIMD memory).
        self._ceiling: int | None = None
        # Consecutive frames observed under the recovery margin.
        self._good_streak: int = 0

    def reset(self) -> None:
        """Clear all degrade state (e.g. on project reset)."""
        self._floor = None
        self._ceiling = None
        self._good_streak = 0

    @property
    def floor(self) -> int | None:
        """Current latched density floor (None when not degraded). Test hook."""
        return self._floor

    @property
    def ceiling(self) -> int | None:
        """Current known-bad ceiling (None when none latched). Test hook."""
        return self._ceiling

    def step(
        self,
        base_density: int,
        *,
        last_frame_ms: float | None = None,
        budget_ms: float = RENDER_BUDGET_MS,
        recovery_ms: float = RENDER_RECOVERY_MS,
        recovery_frames: int = RENDER_RECOVERY_FRAMES,
    ) -> int:
        """Advance the controller one frame; return the density to render now.

        `last_frame_ms` is the PREVIOUS frame's grain-render eval time (None on
        the very first frame → render at base, no degrade). Result is clamped to
        [0, base_density], always finite, never raises.
        """
        base = _sanitize_base_density(base_density)
        if base <= 0:
            # Nothing to render; keep state coherent with base.
            self._floor = None if self._floor is None else 0
            return 0

        # A latched floor/ceiling can never exceed the current base (base may
        # shrink if the user lowers density mid-session) — re-clamp every frame.
        if self._floor is not None:
            self._floor = max(MIN_DENSITY, min(self._floor, base))
        if self._ceiling is not None:
            self._ceiling = min(self._ceiling, base)

        valid_ms = (
            last_frame_ms is not None
            and isinstance(last_frame_ms, (int, float))
            and math.isfinite(float(last_frame_ms))
        )

        if valid_ms:
            ms = float(last_frame_ms)
            # The density we ACTUALLY rendered last frame (what produced `ms`).
            rendered = base if self._floor is None else self._floor

            if ms > budget_ms:
                # TRIP — `rendered` is known-bad. Latch a ceiling just below it so
                # recovery never climbs back into it, then multiplicatively drop.
                self._ceiling = max(MIN_DENSITY, rendered - 1)
                current = self._floor if self._floor is not None else base
                self._floor = _halve_density(current)
                # Keep the floor strictly under the new ceiling when possible.
                if self._floor >= rendered:
                    self._floor = max(MIN_DENSITY, rendered - 1)
                self._good_streak = 0
            elif ms < recovery_ms:
                # Comfortably under the recovery margin — bank a good frame.
                self._good_streak += 1
                if self._floor is not None and self._good_streak >= recovery_frames:
                    # ADDITIVE-increase one grain toward base, capped below the
                    # known-bad ceiling so we settle at max-safe, not into a trip.
                    # The ceiling persists (it is only cleared on reset / a base
                    # change), so once the floor reaches `ceiling` it HOLDS there
                    # with zero further per-frame change — the convergence point.
                    cap = base if self._ceiling is None else min(base, self._ceiling)
                    target = min(cap, self._floor + 1)
                    self._floor = None if target >= base else target
                    self._good_streak = 0
            else:
                # DEADBAND [recovery_ms, budget_ms] — we are at the working point.
                # Hold the floor; reset the streak so recovery requires SUSTAINED
                # comfortably-fast frames, not borderline ones.
                self._good_streak = 0

        density = base if self._floor is None else self._floor

        # SG-8 memory-pressure latch is applied on top of the converged floor.
        if _sg8_density_degraded:
            density = _halve_density(density)

        return density


def effective_density(
    base_density: int,
    *,
    last_frame_ms: float | None = None,
    budget_ms: float = RENDER_BUDGET_MS,
) -> int:
    """STATELESS single-shot degrade resolution (no hysteresis).

    Retained for the SG-8 + single-transition tests and any caller that wants a
    memoryless "halve if the prior frame blew budget" computation. The LIVE
    render path uses `BudgetController` instead (which adds the hysteresis that
    stops the full↔half strobe — see TIGER 3). Applies, independently:
      * SG-8 memory-pressure latch (`_sg8_density_degraded`) → halve.
      * Budget guard: prior-frame eval > `budget_ms` → halve.

    `base_density` is already capped to MAX_GRAINS by GranulatorParams. Result is
    clamped to [0, base_density], always finite. Never raises.
    """
    density = _sanitize_base_density(base_density)

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
