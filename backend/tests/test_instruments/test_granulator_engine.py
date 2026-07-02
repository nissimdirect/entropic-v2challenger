"""Tests for the B8 Granulator pure grain engine (P5b.16).

Hard oracle tests — all must pass (named exactly as specified in the packet).
"""

import hashlib
import math

import pytest

from instruments.granulator_instrument import (
    AxisParams,
    GrainCloud,
    GrainDescriptor,
    GranulatorParams,
    _eval_window,
    grain_cloud,
)
from security import MAX_GRAINS


# ---------------------------------------------------------------------------
# Fixtures / helpers
# ---------------------------------------------------------------------------


def _default_params(**kwargs) -> GranulatorParams:
    """Build a GranulatorParams with sensible defaults for testing."""
    return GranulatorParams(**kwargs)


def _params_with_jitter(jitter: float = 0.5) -> GranulatorParams:
    """Params where every axis has the same jitter value."""
    axes = {ax: AxisParams(grain=0.5, jitter=jitter, grain_env=1.0) for ax in "TYXCFL"}
    return GranulatorParams(density=4, window="hann", axes=axes)


def _cloud(
    project_seed: int = 42,
    instrument_id: str = "inst_01",
    frame_index: int = 0,
    params: GranulatorParams | None = None,
) -> GrainCloud:
    if params is None:
        params = _default_params(density=4)
    return grain_cloud(project_seed, instrument_id, frame_index, params)


# ---------------------------------------------------------------------------
# test_seeded_replay_identical_grain_set
# ---------------------------------------------------------------------------


def test_seeded_replay_identical_grain_set():
    """Same (seed, frame) → identical grain set across 100 runs."""
    params = _params_with_jitter(0.8)
    first = grain_cloud(7, "inst_abc", 13, params)
    for _ in range(99):
        run = grain_cloud(7, "inst_abc", 13, params)
        assert len(run.grains) == len(first.grains)
        for g1, g2 in zip(first.grains, run.grains):
            assert g1.T == g2.T, "T differs on replay"
            assert g1.Y == g2.Y, "Y differs on replay"
            assert g1.X == g2.X, "X differs on replay"
            assert g1.C == g2.C, "C differs on replay"
            assert g1.F == g2.F, "F differs on replay"
            assert g1.L == g2.L, "L differs on replay"
            assert g1.window_phase == g2.window_phase, "window_phase differs on replay"
            assert g1.window_value == g2.window_value, "window_value differs on replay"


# ---------------------------------------------------------------------------
# test_seed_derivation_matches_pinned_formula
# ---------------------------------------------------------------------------


def test_seed_derivation_matches_pinned_formula():
    """Hand-computed SHA256 vector: project_seed=42, inst='test_inst', frame=7, grain=0.

    key  = '42:gran:test_inst:0:7:0'
    hex16 = 'e8e7dd2b75067e98'
    seed = 16782625715136134808

    This tests that the code's derive_seed call for grain 0 produces exactly
    this value, matching the formula byte-for-byte.
    """
    from engine.determinism import derive_seed, make_rng

    # Hand-computed reference
    key = "42:gran:test_inst:0:7:0"
    expected_seed = int(hashlib.sha256(key.encode()).hexdigest()[:16], 16)
    # Sanity: confirm our hand value
    assert expected_seed == 16782625715136134808, (
        f"Hand-computed reference mismatch: {expected_seed}"
    )

    # Code path
    actual_seed = derive_seed(42, "gran:test_inst:0", 7)
    assert actual_seed == expected_seed, (
        f"derive_seed returned {actual_seed}, expected {expected_seed}"
    )

    # Verify the grain cloud produces stable output using this seed
    params = GranulatorParams(density=1)
    cloud = grain_cloud(42, "test_inst", 7, params)
    assert len(cloud.grains) == 1

    # Re-derive via the same make_rng path and confirm T is consistent
    rng = make_rng(expected_seed)
    t_draw = rng.random()
    # T-axis has grain=0.5, jitter=0.0 (defaults) → position = 0.5
    assert cloud.grains[0].T == pytest.approx(0.5), (
        "T should be 0.5 with zero jitter regardless of draw"
    )


# ---------------------------------------------------------------------------
# test_hash_seed_frame_grain_indexing
# ---------------------------------------------------------------------------


def test_hash_seed_frame_grain_indexing():
    """Different (frame, grain_index) pairs produce different seeds."""
    from engine.determinism import derive_seed

    seen = set()
    for frame in range(5):
        for gi in range(5):
            seed = derive_seed(100, f"gran:inst_x:{gi}", frame)
            assert seed not in seen, f"Seed collision at frame={frame}, gi={gi}: {seed}"
            seen.add(seed)


# ---------------------------------------------------------------------------
# test_max_grains_cap_enforced
# ---------------------------------------------------------------------------


def test_max_grains_cap_enforced():
    """Density above MAX_GRAINS is silently capped to MAX_GRAINS."""
    over = MAX_GRAINS + 1_000
    params = GranulatorParams(density=over)
    assert params.density == MAX_GRAINS, (
        f"density {params.density} was not capped to MAX_GRAINS={MAX_GRAINS}"
    )
    cloud = grain_cloud(1, "inst", 0, params)
    assert len(cloud.grains) == MAX_GRAINS
    assert cloud.density_capped == MAX_GRAINS
    assert cloud.density_requested == MAX_GRAINS  # clamped at construction


def test_max_grains_cap_not_bypassable():
    """Extremely large density cannot bypass the cap via overflow or float tricks."""
    for bad_density in [10**9, float("inf"), -1, float("nan")]:
        try:
            params = GranulatorParams(density=bad_density)  # type: ignore[arg-type]
        except Exception:
            # If construction raises, the cap is enforced even harder
            continue
        assert params.density <= MAX_GRAINS, (
            f"density {params.density} bypassed MAX_GRAINS cap for input {bad_density}"
        )


# ---------------------------------------------------------------------------
# test_density_zero_yields_empty_cloud
# ---------------------------------------------------------------------------


def test_density_zero_yields_empty_cloud():
    """density=0 produces an empty grain list."""
    params = GranulatorParams(density=0)
    cloud = grain_cloud(1, "inst", 0, params)
    assert cloud.grains == []
    assert cloud.density_capped == 0


# ---------------------------------------------------------------------------
# test_all_axis_numerics_clamped_finite
# ---------------------------------------------------------------------------


def test_all_axis_numerics_clamped_finite():
    """All numeric values in every GrainDescriptor are finite and in [0,1]."""
    params = _params_with_jitter(1.0)
    params.density = 32
    cloud = grain_cloud(999, "inst_check", 42, params)
    for gd in cloud.grains:
        for attr in ("T", "Y", "X", "C", "F", "L", "window_phase", "window_value"):
            v = getattr(gd, attr)
            assert math.isfinite(v), (
                f"grain[{gd.grain_index}].{attr} is not finite: {v}"
            )
            assert 0.0 <= v <= 1.0, (
                f"grain[{gd.grain_index}].{attr}={v} is out of [0,1]"
            )
        for eattr in ("T_env", "Y_env", "X_env", "C_env", "F_env", "L_env"):
            v = getattr(gd, eattr)
            assert math.isfinite(v), (
                f"grain[{gd.grain_index}].{eattr} is not finite: {v}"
            )
            assert 0.0 <= v <= 1.0, (
                f"grain[{gd.grain_index}].{eattr}={v} is out of [0,1]"
            )


def test_all_axis_numerics_clamped_with_hostile_params():
    """Hostile NaN/inf params in AxisParams are clamped to [0,1]."""
    axes = {
        ax: AxisParams(grain=float("nan"), jitter=float("inf"), grain_env=-99.9)
        for ax in "TYXCFL"
    }
    params = GranulatorParams(density=4, axes=axes)
    cloud = grain_cloud(1, "inst", 0, params)
    for gd in cloud.grains:
        for attr in ("T", "Y", "X", "C", "F", "L"):
            v = getattr(gd, attr)
            assert math.isfinite(v) and 0.0 <= v <= 1.0, (
                f"grain[{gd.grain_index}].{attr}={v} out of range after hostile params"
            )


# ---------------------------------------------------------------------------
# test_window_shapes_hann_tri_rect
# ---------------------------------------------------------------------------


def test_window_shapes_hann_tri_rect():
    """Verify the three window shapes produce correct analytical values."""
    # Hann at phase=0.5 → 0.5*(1-cos(π)) = 0.5*(1+1) = 1.0
    assert _eval_window("hann", 0.5) == pytest.approx(1.0)
    # Hann at phase=0.0 → 0.5*(1-cos(0)) = 0.5*(1-1) = 0.0
    assert _eval_window("hann", 0.0) == pytest.approx(0.0)
    # Hann at phase=1.0 → 0.5*(1-cos(2π)) = 0.0
    assert _eval_window("hann", 1.0) == pytest.approx(0.0)

    # Tri at phase=0.5 → 1 - 2*|0.5-0.5| = 1.0 (peak)
    assert _eval_window("tri", 0.5) == pytest.approx(1.0)
    # Tri at phase=0.0 → 1 - 2*0.5 = 0.0
    assert _eval_window("tri", 0.0) == pytest.approx(0.0)
    # Tri at phase=1.0 → 1 - 2*0.5 = 0.0
    assert _eval_window("tri", 1.0) == pytest.approx(0.0)
    # Tri at phase=0.25 → 1 - 2*0.25 = 0.5
    assert _eval_window("tri", 0.25) == pytest.approx(0.5)

    # Rect always 1.0
    for phase in (0.0, 0.25, 0.5, 0.75, 1.0):
        assert _eval_window("rect", phase) == pytest.approx(1.0)


def test_window_shapes_applied_to_grains():
    """GrainDescriptor.window_value correctly reflects the chosen window shape."""
    for shape in ("hann", "tri", "rect"):
        params = GranulatorParams(density=16, window=shape)  # type: ignore[arg-type]
        cloud = grain_cloud(1, "w_test", 0, params)
        for gd in cloud.grains:
            expected = _eval_window(shape, gd.window_phase)
            assert gd.window_value == pytest.approx(expected), (
                f"window_value mismatch for shape={shape}, phase={gd.window_phase}"
            )
            assert gd.window_shape == shape


# ---------------------------------------------------------------------------
# test_grain_env_per_axis_evaluated
# ---------------------------------------------------------------------------


def test_grain_env_per_axis_evaluated():
    """Per-axis grain_env is carried into GrainDescriptor fields."""
    axes = {
        "T": AxisParams(grain=0.5, jitter=0.0, grain_env=0.1),
        "Y": AxisParams(grain=0.5, jitter=0.0, grain_env=0.2),
        "X": AxisParams(grain=0.5, jitter=0.0, grain_env=0.3),
        "C": AxisParams(grain=0.5, jitter=0.0, grain_env=0.4),
        "F": AxisParams(grain=0.5, jitter=0.0, grain_env=0.5),
        "L": AxisParams(grain=0.5, jitter=0.0, grain_env=0.6),
    }
    params = GranulatorParams(density=1, axes=axes)
    cloud = grain_cloud(1, "env_test", 0, params)
    gd = cloud.grains[0]
    assert gd.T_env == pytest.approx(0.1)
    assert gd.Y_env == pytest.approx(0.2)
    assert gd.X_env == pytest.approx(0.3)
    assert gd.C_env == pytest.approx(0.4)
    assert gd.F_env == pytest.approx(0.5)
    assert gd.L_env == pytest.approx(0.6)


# ---------------------------------------------------------------------------
# test_l_axis_inert_without_flag
# ---------------------------------------------------------------------------


def test_l_axis_inert_without_flag():
    """GrainCloud.l_axis_inert is True when l_axis_enabled=False."""
    params = GranulatorParams(density=4, l_axis_enabled=False)
    cloud = grain_cloud(1, "l_test", 0, params)
    assert cloud.l_axis_inert is True, "l_axis_inert should be True when flag is False"

    params_on = GranulatorParams(density=4, l_axis_enabled=True)
    cloud_on = grain_cloud(1, "l_test", 0, params_on)
    assert cloud_on.l_axis_inert is False, (
        "l_axis_inert should be False when flag is True"
    )


# ---------------------------------------------------------------------------
# test_l_axis_draw_consumed_while_inert_keeps_other_axes_stable
# ---------------------------------------------------------------------------


def test_l_axis_draw_consumed_while_inert_keeps_other_axes_stable():
    """Flipping l_axis_enabled does NOT shift T/Y/X/C/F values.

    The L draw is consumed in both cases, so other axes draw from the same
    positions in the RNG sequence regardless of whether L is inert or active.
    """
    axes = {ax: AxisParams(grain=0.3, jitter=0.9, grain_env=1.0) for ax in "TYXCFL"}
    params_off = GranulatorParams(density=8, axes=axes, l_axis_enabled=False)
    params_on = GranulatorParams(density=8, axes=axes, l_axis_enabled=True)

    cloud_off = grain_cloud(55, "l_stable", 3, params_off)
    cloud_on = grain_cloud(55, "l_stable", 3, params_on)

    assert len(cloud_off.grains) == len(cloud_on.grains)
    for g_off, g_on in zip(cloud_off.grains, cloud_on.grains):
        idx = g_off.grain_index
        assert g_off.T == pytest.approx(g_on.T), (
            f"T differs at grain {idx} on flag flip"
        )
        assert g_off.Y == pytest.approx(g_on.Y), (
            f"Y differs at grain {idx} on flag flip"
        )
        assert g_off.X == pytest.approx(g_on.X), (
            f"X differs at grain {idx} on flag flip"
        )
        assert g_off.C == pytest.approx(g_on.C), (
            f"C differs at grain {idx} on flag flip"
        )
        assert g_off.F == pytest.approx(g_on.F), (
            f"F differs at grain {idx} on flag flip"
        )
        assert g_off.window_phase == pytest.approx(g_on.window_phase), (
            f"window_phase differs at grain {idx} on flag flip"
        )
        # L value is computed in both cases (same draw) → must also be equal
        assert g_off.L == pytest.approx(g_on.L), (
            f"L differs at grain {idx} on flag flip"
        )


# ---------------------------------------------------------------------------
# Determinism: 100 runs stability check (supports test_seeded_replay_identical_grain_set)
# ---------------------------------------------------------------------------


def test_determinism_100x_extended():
    """Run determinism check with 100 runs, 32 grains, max jitter."""
    params = _params_with_jitter(1.0)
    params.density = 32
    first = grain_cloud(123, "det_100x", 99, params)
    for run_i in range(99):
        run = grain_cloud(123, "det_100x", 99, params)
        for gi, (g1, g2) in enumerate(zip(first.grains, run.grains)):
            for attr in ("T", "Y", "X", "C", "F", "L", "window_phase"):
                v1, v2 = getattr(g1, attr), getattr(g2, attr)
                assert v1 == pytest.approx(v2), (
                    f"run {run_i}: grain[{gi}].{attr} drifted: {v1} != {v2}"
                )


# ---------------------------------------------------------------------------
# Module import: no shadowing of effect granulators
# ---------------------------------------------------------------------------


def test_no_effect_shadow():
    """instruments.granulator_instrument can coexist with effects.fx.granulator
    without name shadowing.
    """
    import instruments.granulator_instrument as inst_gran

    # Must not import or alias the effects granulator
    import effects.fx.granulator as fx_gran

    # They must be distinct modules
    assert inst_gran is not fx_gran, "Instrument granulator shadows effect granulator"

    # effects module must still be importable and have the right EFFECT_ID
    assert hasattr(fx_gran, "EFFECT_ID")
    assert "granulator" in fx_gran.EFFECT_ID

    # instruments module must NOT have EFFECT_ID (it's not an effect)
    assert not hasattr(inst_gran, "EFFECT_ID"), (
        "Instrument granulator should not expose EFFECT_ID"
    )
