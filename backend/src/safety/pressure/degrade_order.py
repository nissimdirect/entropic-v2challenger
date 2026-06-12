"""Canonical SG-8 degrade order (DEC-Q7-010).

The single source of truth for which feature gets degraded at which
pressure level. Consumed by the pressure monitor (PR #11) and surfaced
in the Q7 report.

PR #6 ships the constant + dataclass + helper functions. PR #11 wires
the live monitor that fires `degrade()` callbacks per stage.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class FeatureClass(str, Enum):
    """Categorize each stage by what kind of feature it touches.

    Used for telemetry + report grouping. Not consumed by the monitor itself.
    """

    LATENT_FEATURE = "latent_feature"  # D4, A5, A1, E1
    BACKEND_CACHE = "backend_cache"  # Frame Bank, GPU pools
    L_BACKBONE = "l_backbone"  # CLAP, CLIP, DINOv2
    WORKER_PROCESS = "worker_process"  # last resort


@dataclass(frozen=True)
class DegradeStage:
    """A single stage in the canonical degrade order.

    Stages are numbered 1..N (1 is dropped first; N is dropped last).
    `threshold_pct` is when to fire degrade (relative to SESSION_BUDGET).
    `restore_pct` is when to fire restore (10pp lower for hysteresis).
    """

    order: int
    name: str
    description: str
    feature_class: FeatureClass
    threshold_pct: float
    restore_pct: float
    blast_radius: str  # human-readable: what UX impact when fired


CANONICAL_DEGRADE_ORDER: tuple[DegradeStage, ...] = (
    DegradeStage(
        order=1,
        name="d4_latent_grain_pool",
        description="Drop D4 cached embedding palette",
        feature_class=FeatureClass.LATENT_FEATURE,
        threshold_pct=75.0,
        restore_pct=65.0,
        blast_radius="D4 latent grain effects pause until re-encode on restore",
    ),
    DegradeStage(
        order=2,
        name="a5_spectral_state",
        description="Clear A5 spectral granulator FFT memo",
        feature_class=FeatureClass.LATENT_FEATURE,
        threshold_pct=75.0,
        restore_pct=65.0,
        blast_radius="A5 effects reset to current frame (no spectral history)",
    ),
    DegradeStage(
        order=3,
        name="a1_grain_density_halved",
        description="Halve A1 per-frame grain count (CPU + memory bench)",
        feature_class=FeatureClass.LATENT_FEATURE,
        threshold_pct=75.0,
        restore_pct=65.0,
        blast_radius="A1 visual density drops to 50% — visible quality reduction",
    ),
    DegradeStage(
        order=4,
        name="e1_vae_suspended",
        description="Suspend E1 per-project VAE; use generic embeddings",
        feature_class=FeatureClass.LATENT_FEATURE,
        threshold_pct=80.0,
        restore_pct=70.0,
        blast_radius="E1 project-specific embedding pauses — generic L used",
    ),
    DegradeStage(
        order=5,
        name="frame_bank_cache_dropped",
        description="Drop Frame Bank cache; force redecode on next access",
        feature_class=FeatureClass.BACKEND_CACHE,
        threshold_pct=82.0,
        restore_pct=72.0,
        blast_radius="Next clip access redecodes from source (~100ms latency)",
    ),
    DegradeStage(
        order=6,
        name="gpu_texture_pool_released",
        description="Release GPU texture pool; force re-upload",
        feature_class=FeatureClass.BACKEND_CACHE,
        threshold_pct=85.0,
        restore_pct=75.0,
        blast_radius="Next render re-uploads textures (~50ms latency)",
    ),
    DegradeStage(
        order=7,
        name="clap_unloaded",
        description="Unload CLAP audio-text backbone (largest L head, lowest v1 usage)",
        feature_class=FeatureClass.L_BACKBONE,
        threshold_pct=88.0,
        restore_pct=78.0,
        blast_radius="Audio-text cross-modal queries unavailable until restore",
    ),
    DegradeStage(
        order=8,
        name="clip_unloaded",
        description="Unload CLIP vision-text backbone",
        feature_class=FeatureClass.L_BACKBONE,
        threshold_pct=91.0,
        restore_pct=81.0,
        blast_radius="Vision-text queries unavailable until restore",
    ),
    DegradeStage(
        order=9,
        name="dinov2_unloaded",
        description="Unload DINOv2 vision backbone (emergency — last resort)",
        feature_class=FeatureClass.L_BACKBONE,
        threshold_pct=94.0,
        restore_pct=84.0,
        blast_radius="All vision L features unavailable; most Tier 5 features dark",
    ),
    DegradeStage(
        order=10,
        name="l_worker_killed",
        description="Kill L worker process; route to BackboneUnavailable fallback",
        feature_class=FeatureClass.WORKER_PROCESS,
        threshold_pct=97.0,
        restore_pct=87.0,
        blast_radius="All L-dependent features unavailable; render path continues",
    ),
)


def stages_by_threshold(current_pct: float) -> tuple[DegradeStage, ...]:
    """Return the subset of stages whose threshold the current pressure has crossed."""
    return tuple(s for s in CANONICAL_DEGRADE_ORDER if current_pct >= s.threshold_pct)


def next_stage_to_fire(
    active_stages: frozenset[str], current_pct: float
) -> DegradeStage | None:
    """Return the lowest-order stage that's at-threshold and not yet active.

    `active_stages` is the set of stage names currently in degraded state.
    Returns None if no stage is eligible to fire right now.
    """
    for stage in CANONICAL_DEGRADE_ORDER:
        if stage.name in active_stages:
            continue
        if current_pct >= stage.threshold_pct:
            return stage
    return None


def stages_to_restore(
    active_stages: frozenset[str], current_pct: float
) -> tuple[DegradeStage, ...]:
    """Return active stages whose restore-threshold the current pressure has cleared."""
    return tuple(
        s
        for s in CANONICAL_DEGRADE_ORDER
        if s.name in active_stages and current_pct < s.restore_pct
    )
