"""P5b.18 — B8 grain SELECTION rules (random / onset / scenePayload + flag-gated
latentSimilarity) (INSTRUMENTS-BUILD-PLAN.md §B8, SPEC-3 §3, SG-3 boundary).

This packet adds the grain `selection` rule:
  random           — IMPLEMENTED. Seeded (reuses the P5b.16 determinism formula).
  onset            — IMPLEMENTED. Consumes modulation.audio_follower onset triggers.
  scenePayload     — RESERVED + validator-REJECTED (no scene source on main).
  latentSimilarity — RESEARCH, flag-gated behind EXPERIMENTAL_LATENT_SELECTION;
                     rejected at the LOADER trust boundary when flag-off; on any
                     latent READ the SG-3 NaN-sentinel guards the read.

HARD ORACLE — the named tests below must all pass:
  test_random_selection_seeded_deterministic
  test_onset_selection_uses_audio_triggers
  test_latent_similarity_rejected_at_load_when_flag_off
  test_latent_path_nan_sentinel_aborts_lane_and_toasts
  test_scene_payload_behavior_or_reserved
"""

import os
import time
import uuid

import numpy as np
import pytest

from instruments.granulator_instrument import (
    DEFAULT_SELECTION,
    GrainSelectionError,
    GranulatorParams,
    accepted_selection_rules,
    latent_similarity_enabled,
    select_grain_weights,
    select_latent_grain_weights,
    select_onset_grain_weights,
    select_random_grain_weights,
)
from project.schema import deserialize, serialize, validate
from safety.latent_sentinel import LatentSentinelError, SentinelAction


# ---------------------------------------------------------------------------
# Flag helpers
# ---------------------------------------------------------------------------


@pytest.fixture
def latent_flag_off(monkeypatch):
    """EXPERIMENTAL_LATENT_SELECTION explicitly OFF."""
    monkeypatch.delenv("EXPERIMENTAL_LATENT_SELECTION", raising=False)
    assert not latent_similarity_enabled()


@pytest.fixture
def latent_flag_on(monkeypatch):
    """EXPERIMENTAL_LATENT_SELECTION ON."""
    monkeypatch.setenv("EXPERIMENTAL_LATENT_SELECTION", "true")
    assert latent_similarity_enabled()


def _project_with_selection(selection, *, nested=False) -> dict:
    """A minimal valid v3 project carrying a granulator instrument selection."""
    now = time.time()
    inst_cfg = (
        {"granulator": {"selection": selection}} if nested else {"selection": selection}
    )
    return {
        "version": "3.0.0",
        "id": str(uuid.uuid4()),
        "created": now,
        "modified": now,
        "author": "test",
        "settings": {
            "resolution": [1920, 1080],
            "frameRate": 30,
            "audioSampleRate": 48000,
            "masterVolume": 1.0,
            "seed": 0,
        },
        "assets": {},
        "timeline": {"duration": 0.0, "tracks": [], "markers": [], "loopRegion": None},
        "instruments": {"gran-1": inst_cfg},
    }


# ---------------------------------------------------------------------------
# test_random_selection_seeded_deterministic
# ---------------------------------------------------------------------------


def test_random_selection_seeded_deterministic():
    """`random` selection is byte-identical across 100 seeded runs (ACCEPTANCE)."""
    first = select_random_grain_weights(42, "inst_01", 7, density=16)
    assert len(first) == 16
    for _ in range(100):
        run = select_random_grain_weights(42, "inst_01", 7, density=16)
        assert run == first, "random selection not byte-identical across runs"

    # Different seed / frame / instrument → different weights (not a constant).
    other_seed = select_random_grain_weights(43, "inst_01", 7, density=16)
    other_frame = select_random_grain_weights(42, "inst_01", 8, density=16)
    other_inst = select_random_grain_weights(42, "inst_02", 7, density=16)
    assert other_seed != first
    assert other_frame != first
    assert other_inst != first

    # The dispatcher honors `random` identically (audio_state_out is None).
    via_dispatch, state_out = select_grain_weights(
        "random", 42, "inst_01", 7, density=16
    )
    assert via_dispatch == first
    assert state_out is None


def test_random_selection_uses_separate_seed_namespace():
    """Selection uses a `gransel:` namespace distinct from jitter's `gran:` so
    adding selection does NOT shift existing jitter draws."""
    from instruments.granulator_instrument import grain_cloud

    params = GranulatorParams(density=8)
    cloud_a = grain_cloud(99, "inst_x", 3, params)
    _ = select_random_grain_weights(99, "inst_x", 3, density=8)
    cloud_b = grain_cloud(99, "inst_x", 3, params)
    # Jitter engine unaffected by selection draws sharing the seed inputs.
    assert [g.T for g in cloud_a.grains] == [g.T for g in cloud_b.grains]


# ---------------------------------------------------------------------------
# test_onset_selection_uses_audio_triggers
# ---------------------------------------------------------------------------


def test_onset_selection_uses_audio_triggers():
    """`onset` consumes audio_follower onset output and biases weights by the
    transient; silence falls back to the seeded random distribution."""
    sample_rate = 48000
    base = select_random_grain_weights(7, "inst_a", 0, density=12)

    # No audio → onset strength 0 → weights == seeded random (no degenerate cloud).
    silent_w, silent_state = select_onset_grain_weights(
        None,
        sample_rate,
        density=12,
        project_seed=7,
        instrument_id="inst_a",
        frame_index=0,
    )
    assert silent_w == base

    # Frame 1: prime the spectral-flux state with a quiet window.
    rng = np.random.default_rng(0)
    quiet = (rng.standard_normal(1024).astype(np.float32)) * 1e-4
    _, state1 = select_onset_grain_weights(
        quiet,
        sample_rate,
        density=12,
        audio_state=None,
        project_seed=7,
        instrument_id="inst_a",
        frame_index=0,
    )
    # The follower carried its previous-spectrum state forward (proves consumption).
    assert "prev_spectrum" in state1

    # Frame 2: a loud transient burst → spectral flux spikes → onset strength > 0
    # → weights are pulled UP toward the transient relative to the seeded base.
    burst = (np.sin(2 * np.pi * 1000 * np.arange(1024) / sample_rate)).astype(
        np.float32
    )
    burst *= 8.0  # large amplitude jump → strong positive spectral flux
    onset_w, _ = select_onset_grain_weights(
        burst,
        sample_rate,
        density=12,
        audio_state=state1,
        onset_params={"sensitivity": 1.0, "threshold": 0.0},
        project_seed=7,
        instrument_id="inst_a",
        frame_index=2,
    )
    base2 = select_random_grain_weights(7, "inst_a", 2, density=12)
    # Onset bias only ever moves a weight toward 1.0 (never below its base).
    assert all(ow >= bw - 1e-9 for ow, bw in zip(onset_w, base2))
    # And at least one weight was actually pulled up (the transient registered).
    assert any(ow > bw + 1e-6 for ow, bw in zip(onset_w, base2))


# ---------------------------------------------------------------------------
# test_latent_similarity_rejected_at_load_when_flag_off
# ---------------------------------------------------------------------------


def test_latent_similarity_rejected_at_load_when_flag_off(latent_flag_off):
    """A flag-OFF project selecting `latentSimilarity` is REJECTED at schema.py
    load — NOT just hidden in UI (ACCEPTANCE GATE)."""
    proj = _project_with_selection("latentSimilarity")
    errors = validate(proj)
    assert errors, "latentSimilarity should be rejected at load with flag off"
    assert any("latentSimilarity" in e and "not accepted" in e for e in errors)

    # deserialize() (the JSON entrypoint) raises with a clear error.
    with pytest.raises(ValueError) as exc:
        deserialize(serialize(proj))
    assert "latentSimilarity" in str(exc.value)

    # Nested granulator.selection is rejected identically.
    nested = _project_with_selection("latentSimilarity", nested=True)
    nested_errors = validate(nested)
    assert any("latentSimilarity" in e for e in nested_errors)


def test_latent_similarity_accepted_at_load_when_flag_on(latent_flag_on):
    """With the flag ON, latentSimilarity is in the accept-set and loads clean."""
    assert "latentSimilarity" in accepted_selection_rules()
    proj = _project_with_selection("latentSimilarity")
    assert validate(proj) == []


def test_random_and_onset_always_accepted(latent_flag_off):
    """random + onset load clean regardless of the flag; absence → default."""
    for sel in ("random", "onset"):
        assert validate(_project_with_selection(sel)) == []
    # No selection key at all → defaults to random, valid.
    now = time.time()
    proj = {
        "version": "3.0.0",
        "id": str(uuid.uuid4()),
        "created": now,
        "modified": now,
        "author": "",
        "settings": {
            "resolution": [1920, 1080],
            "frameRate": 30,
            "audioSampleRate": 48000,
            "masterVolume": 1.0,
            "seed": 0,
        },
        "assets": {},
        "timeline": {"duration": 0.0, "tracks": [], "markers": [], "loopRegion": None},
        "instruments": {"gran-1": {}},
    }
    assert validate(proj) == []
    assert GranulatorParams().selection == DEFAULT_SELECTION


def test_unknown_selection_rejected_at_load():
    """An unrecognised selection value is rejected as malformed (trust boundary)."""
    errors = validate(_project_with_selection("teleport"))
    assert any("teleport" in e for e in errors)


def test_non_string_selection_rejected_at_load():
    """A non-string selection value is rejected (type guard at the boundary)."""
    errors = validate(_project_with_selection(123))
    assert any("must be a string" in e for e in errors)


# ---------------------------------------------------------------------------
# test_latent_path_nan_sentinel_aborts_lane_and_toasts
# ---------------------------------------------------------------------------


def test_latent_path_nan_sentinel_aborts_lane_and_toasts(latent_flag_on):
    """On the latent selection path, a NaN/OOD latent triggers the SG-3 sentinel,
    which raises LatentSentinelError → the lane aborts (render dispatch converts
    this to a user-facing toast). It NEVER produces grain positions from a
    poisoned latent (ACCEPTANCE GATE)."""
    # NaN latent → REJECTED_NAN, lane abort.
    nan_latent = np.array([1.0, float("nan"), 0.5], dtype=np.float32)
    with pytest.raises(LatentSentinelError) as exc:
        select_latent_grain_weights(nan_latent, density=8, backbone="sd_vae")
    assert exc.value.action == SentinelAction.REJECTED_NAN

    # Inf latent → REJECTED_INF.
    inf_latent = np.array([1.0, float("inf"), 0.5], dtype=np.float32)
    with pytest.raises(LatentSentinelError) as exc2:
        select_latent_grain_weights(inf_latent, density=8, backbone="sd_vae")
    assert exc2.value.action == SentinelAction.REJECTED_INF

    # Zero latent → REJECTED_ZERO (can't normalize).
    zero_latent = np.zeros(8, dtype=np.float32)
    with pytest.raises(LatentSentinelError) as exc3:
        select_latent_grain_weights(zero_latent, density=8, backbone="sd_vae")
    assert exc3.value.action == SentinelAction.REJECTED_ZERO

    # The dispatcher propagates the sentinel abort identically.
    with pytest.raises(LatentSentinelError):
        select_grain_weights(
            "latentSimilarity", 0, "i", 0, 8, latent=nan_latent, backbone="sd_vae"
        )


def test_latent_path_ood_latent_clamped_then_usable(latent_flag_on):
    """An OOD (above-ceiling L2) latent is CLAMPED by the sentinel and STILL
    produces deterministic, finite, in-range weights (the sentinel fires on OOD
    without aborting — only NaN/Inf/zero abort)."""
    # L2 = 100 with sd_vae ceiling 5.0 → CLAMPED (renormalized), not rejected.
    ood = np.full(16, 25.0, dtype=np.float32)  # L2 = 100
    weights = select_latent_grain_weights(
        ood,
        density=10,
        backbone="sd_vae",
        project_seed=3,
        instrument_id="i",
        frame_index=1,
    )
    assert len(weights) == 10
    assert all(0.0 <= w <= 1.0 and np.isfinite(w) for w in weights)
    # Deterministic: same inputs → identical weights across runs.
    again = select_latent_grain_weights(
        ood,
        density=10,
        backbone="sd_vae",
        project_seed=3,
        instrument_id="i",
        frame_index=1,
    )
    assert weights == again


def test_latent_path_requires_flag(latent_flag_off):
    """Defense-in-depth: the latent read raises GrainSelectionError when the flag
    is off, even if the loader was somehow bypassed (never a flag-off latent read)."""
    healthy = np.array([0.6, 0.8], dtype=np.float32)  # L2 = 1.0
    with pytest.raises(GrainSelectionError):
        select_latent_grain_weights(healthy, density=4)


# ---------------------------------------------------------------------------
# test_scene_payload_behavior_or_reserved
# ---------------------------------------------------------------------------


def test_scene_payload_behavior_or_reserved(latent_flag_off):
    """scenePayload is RESERVED: NO scene-detection source exists on main, so it
    is schema-reserved + validator-REJECTED at load with a reserved-specific
    message. It is rejected even with the latent flag ON (it's not latent-gated —
    it has no source at all)."""
    errors = validate(_project_with_selection("scenePayload"))
    assert errors, "scenePayload must be rejected at load (reserved, no source)"
    assert any("scenePayload" in e and "reserved" in e for e in errors)

    # Reserved regardless of the latent flag.
    os.environ["EXPERIMENTAL_LATENT_SELECTION"] = "true"
    try:
        assert "scenePayload" not in accepted_selection_rules()
        errors_on = validate(_project_with_selection("scenePayload"))
        assert any("scenePayload" in e and "reserved" in e for e in errors_on)
    finally:
        del os.environ["EXPERIMENTAL_LATENT_SELECTION"]

    # The engine dispatcher also refuses scenePayload (second line of defense).
    with pytest.raises(GrainSelectionError) as exc:
        select_grain_weights("scenePayload", 0, "i", 0, 8)
    assert "reserved" in str(exc.value)


def test_granulator_params_degrades_unknown_selection_to_default(latent_flag_off):
    """Engine fail-safe: GranulatorParams with a gated/unknown selection degrades
    to the seeded `random` rule rather than crashing (the loader is the real
    boundary; this is belt-and-suspenders at the engine layer)."""
    assert GranulatorParams(selection="scenePayload").selection == "random"  # type: ignore[arg-type]
    assert GranulatorParams(selection="latentSimilarity").selection == "random"  # type: ignore[arg-type]
    assert GranulatorParams(selection="bogus").selection == "random"  # type: ignore[arg-type]
    # A valid implemented rule is preserved.
    assert GranulatorParams(selection="onset").selection == "onset"
