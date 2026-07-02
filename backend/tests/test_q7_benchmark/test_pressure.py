"""Tests for backend/src/safety/pressure — budget + degrade order."""

from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

# Add backend/src to sys.path so `safety.pressure` resolves
REPO_BACKEND_SRC = Path(__file__).resolve().parents[2] / "src"
if str(REPO_BACKEND_SRC) not in sys.path:
    sys.path.insert(0, str(REPO_BACKEND_SRC))

from safety.pressure import (
    CANONICAL_DEGRADE_ORDER,
    DegradeStage,
    SESSION_BUDGET_BYTES,
    pressure_percent,
    q7_resident_bytes,
    session_budget_mb,
)
from safety.pressure.degrade_order import (
    FeatureClass,
    next_stage_to_fire,
    stages_by_threshold,
    stages_to_restore,
)


@pytest.mark.smoke
def test_session_budget_is_positive():
    """SESSION_BUDGET_BYTES initialized at import time; should be > 0."""
    assert SESSION_BUDGET_BYTES > 0


@pytest.mark.smoke
def test_session_budget_mb_is_plausible():
    """On any developer machine, budget should be at least a few hundred MB."""
    assert session_budget_mb() > 100


@pytest.mark.smoke
def test_q7_resident_bytes_non_negative():
    assert q7_resident_bytes() >= 0


@pytest.mark.smoke
def test_pressure_percent_returns_float():
    p = pressure_percent()
    assert isinstance(p, float)
    assert p >= 0.0


@pytest.mark.smoke
def test_canonical_order_has_10_stages():
    assert len(CANONICAL_DEGRADE_ORDER) == 10


@pytest.mark.smoke
def test_canonical_order_orders_are_sequential():
    for i, stage in enumerate(CANONICAL_DEGRADE_ORDER, 1):
        assert stage.order == i


@pytest.mark.smoke
def test_canonical_thresholds_are_monotonically_increasing():
    """Each stage's threshold must be >= the previous (degrade order is escalation)."""
    last = 0.0
    for stage in CANONICAL_DEGRADE_ORDER:
        assert stage.threshold_pct >= last, f"{stage.name} regressed"
        last = stage.threshold_pct


@pytest.mark.smoke
def test_canonical_restores_are_below_thresholds():
    """Each stage restores at least 5pp below its threshold (hysteresis)."""
    for stage in CANONICAL_DEGRADE_ORDER:
        assert stage.restore_pct < stage.threshold_pct
        assert stage.threshold_pct - stage.restore_pct >= 5.0


@pytest.mark.smoke
def test_l_backbones_in_correct_order():
    """CLAP (largest, lowest usage) → CLIP → DINOv2 (smallest, most used)."""
    l_stages = [
        s for s in CANONICAL_DEGRADE_ORDER if s.feature_class == FeatureClass.L_BACKBONE
    ]
    assert [s.name for s in l_stages] == [
        "clap_unloaded",
        "clip_unloaded",
        "dinov2_unloaded",
    ]


@pytest.mark.smoke
def test_stages_by_threshold_returns_expected():
    # At 80%, stages 1-3 (75%) + stage 4 (80%) fire
    fired = stages_by_threshold(80.0)
    assert len(fired) == 4
    assert fired[-1].name == "e1_vae_suspended"


@pytest.mark.smoke
def test_stages_by_threshold_empty_at_low_pressure():
    fired = stages_by_threshold(50.0)
    assert fired == ()


@pytest.mark.smoke
def test_stages_by_threshold_all_at_max():
    fired = stages_by_threshold(100.0)
    assert len(fired) == 10  # all stages


@pytest.mark.smoke
def test_next_stage_to_fire_picks_lowest_unfired():
    """At 88%, stages 1-7 should be eligible. With 1-3 active, next is stage 4."""
    active = frozenset(
        {"d4_latent_grain_pool", "a5_spectral_state", "a1_grain_density_halved"}
    )
    next_stage = next_stage_to_fire(active, 88.0)
    assert next_stage is not None
    assert next_stage.name == "e1_vae_suspended"


@pytest.mark.smoke
def test_next_stage_to_fire_none_when_all_active():
    active = frozenset(s.name for s in CANONICAL_DEGRADE_ORDER)
    assert next_stage_to_fire(active, 100.0) is None


@pytest.mark.smoke
def test_next_stage_to_fire_none_when_pressure_low():
    """At 50% nothing should fire."""
    assert next_stage_to_fire(frozenset(), 50.0) is None


@pytest.mark.smoke
def test_stages_to_restore_fires_below_restore_threshold():
    """Stage 1 fires at 75%, restores at 65%. At 64% with stage 1 active, should restore."""
    active = frozenset({"d4_latent_grain_pool"})
    restore = stages_to_restore(active, 64.0)
    assert len(restore) == 1
    assert restore[0].name == "d4_latent_grain_pool"


@pytest.mark.smoke
def test_stages_to_restore_skips_when_above_restore_threshold():
    """At 70% with stage 1 active (restore=65%), should NOT restore yet."""
    active = frozenset({"d4_latent_grain_pool"})
    restore = stages_to_restore(active, 70.0)
    assert restore == ()


@pytest.mark.smoke
def test_dataclass_is_frozen():
    stage = CANONICAL_DEGRADE_ORDER[0]
    with pytest.raises(Exception):  # FrozenInstanceError
        stage.order = 999  # type: ignore[misc]
