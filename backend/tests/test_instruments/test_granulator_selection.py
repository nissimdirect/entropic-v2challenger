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


# ---------------------------------------------------------------------------
# REAL PRODUCTION PATH — drive rejection + selection through the LIVE render IPC
# (`_parse_granulator_layer` / `_handle_render_composite`), NOT deserialize().
#
# The TIGER: schema.py::_validate_grain_selection (via deserialize) has ZERO
# production callers — the load-bearing trust boundary for a granulator render is
# zmq_server.py::_parse_granulator_layer, reached from the live render IPC. These
# tests prove the reject fires THERE and that selection actually biases grain
# output on the live path.
# ---------------------------------------------------------------------------

import zmq_server as zmq_mod  # noqa: E402
from instruments.granulator_instrument import (  # noqa: E402
    AxisParams,
    BudgetController,
    grain_cloud,
)


class _FakeReader:
    """decode_frame(i) → RGBA frame whose R channel encodes `i` (mod 256)."""

    def __init__(self, h: int = 16, w: int = 16):
        self.width = w
        self.height = h
        self._h = h
        self._w = w

    def decode_frame(self, frame_index: int) -> np.ndarray:
        f = np.zeros((self._h, self._w, 4), dtype=np.uint8)
        f[:, :, 0] = int(frame_index) % 256
        f[:, :, 3] = 255
        return f


def _build_server(monkeypatch):
    """Minimal real ZMQServer wired for _handle_render_composite + a captured
    render_composite + a captured grain cloud (mirrors test_granulator_render)."""
    from zmq_server import ZMQServer

    server = ZMQServer.__new__(ZMQServer)
    server.token = "test-token"
    server.last_frame_ms = 0.0
    server._granulator_last_frame_ms = None
    server._granulator_budget = BudgetController()
    server._granulator_onset_state = None

    rdr = _FakeReader()
    server._get_reader = lambda path: rdr  # type: ignore[assignment]

    def fake_render_composite(layers, resolution, project_seed, layer_states=None):
        w, h = resolution
        return np.zeros((h, w, 4), dtype=np.uint8), {}

    monkeypatch.setattr(zmq_mod, "render_composite", fake_render_composite)
    monkeypatch.setattr(zmq_mod, "flatten_rgba", lambda f: f)
    monkeypatch.setattr(zmq_mod, "encode_mjpeg", lambda f: b"\x00")
    monkeypatch.setattr(zmq_mod, "validate_upload", lambda p: [])
    return server


def _gran_payload(selection=None, **extra) -> dict:
    axes = {ax: {"grain": 0.5, "jitter": 0.3, "grain_env": 1.0} for ax in "TYXCFL"}
    payload = {
        "instrument_id": "gran1",
        "density": 8,
        "window": "hann",
        "axes": axes,
    }
    if selection is not None:
        payload["selection"] = selection
    payload.update(extra)
    return payload


def _render(server, granulator, *, frame_index=0):
    msg = {
        "layers": [
            {
                "layer_type": "video",
                "asset_path": "/fake/base.mp4",
                "frame_index": frame_index,
                "chain": [],
                "clip_opacity": 1.0,
            }
        ],
        "resolution": [16, 16],
        "project_seed": 7,
        "performance": {"granulator": granulator},
    }
    return server._handle_render_composite(msg, "mid-1")


# --- (1) SECURITY: reject fires THROUGH the real parser/render path -----------


def test_parse_granulator_layer_rejects_latentSimilarity_flag_off(
    monkeypatch, latent_flag_off
):
    """Flag-off `latentSimilarity` is REJECTED at _parse_granulator_layer (the REAL
    production boundary), BEFORE GranulatorParams construction — NOT silently
    coerced to 'random'. The live render IPC returns ok=False with a clear error."""
    server = _build_server(monkeypatch)
    params, errors = server._parse_granulator_layer(_gran_payload("latentSimilarity"))
    assert params is None
    assert errors and any(
        "latentSimilarity" in e and "not accepted" in e for e in errors
    )

    # End-to-end through _handle_render_composite: render is rejected, not rendered.
    resp = _render(server, _gran_payload("latentSimilarity"))
    assert resp["ok"] is False
    assert "latentSimilarity" in resp["error"]


def test_parse_granulator_layer_rejects_scenePayload(monkeypatch, latent_flag_off):
    """Reserved `scenePayload` is REJECTED at the real parser with a reserved-
    specific message, and the live render returns ok=False."""
    server = _build_server(monkeypatch)
    params, errors = server._parse_granulator_layer(_gran_payload("scenePayload"))
    assert params is None
    assert errors and any("scenePayload" in e and "reserved" in e for e in errors)

    resp = _render(server, _gran_payload("scenePayload"))
    assert resp["ok"] is False
    assert "scenePayload" in resp["error"]


def test_parse_granulator_layer_rejects_unknown_selection(monkeypatch):
    """Unknown selection value rejected at the real parser."""
    server = _build_server(monkeypatch)
    params, errors = server._parse_granulator_layer(_gran_payload("teleport"))
    assert params is None
    assert any("teleport" in e for e in errors)


def test_parse_granulator_layer_rejects_non_string_selection(monkeypatch):
    """Non-string selection rejected at the real parser (type guard)."""
    server = _build_server(monkeypatch)
    params, errors = server._parse_granulator_layer(_gran_payload(selection=42))
    assert params is None
    assert any("must be a string" in e for e in errors)


def test_parse_granulator_layer_threads_selection_into_params(monkeypatch):
    """A valid `onset` selection is threaded into GranulatorParams (not dropped)."""
    server = _build_server(monkeypatch)
    params, errors = server._parse_granulator_layer(_gran_payload("onset"))
    assert errors == []
    assert params is not None
    assert params.selection == "onset"

    # Absent selection → defaults to random (regression-safe).
    params2, errors2 = server._parse_granulator_layer(_gran_payload())
    assert errors2 == []
    assert params2.selection == "random"


def test_parse_granulator_layer_latentSimilarity_accepted_flag_on(
    monkeypatch, latent_flag_on
):
    """With the flag ON, latentSimilarity is accepted at the real parser."""
    server = _build_server(monkeypatch)
    params, errors = server._parse_granulator_layer(_gran_payload("latentSimilarity"))
    assert errors == []
    assert params is not None
    assert params.selection == "latentSimilarity"


# --- (2) FUNCTIONALITY: selection BIASES grain output on the live path --------


def test_render_path_selection_biases_grain_positions(monkeypatch):
    """`random` vs `onset` produce DIFFERENT grain descriptors on the live render
    path — selection is consumed, not dead. Captured via a spy on grain_cloud."""
    server = _build_server(monkeypatch)

    captured: dict[str, list] = {}

    real_grain_cloud = zmq_mod.grain_cloud

    def spy_grain_cloud(seed, inst, frame, params, **kw):
        cloud = real_grain_cloud(seed, inst, frame, params, **kw)
        captured[params.selection] = [g.T for g in cloud.grains]
        return cloud

    monkeypatch.setattr(zmq_mod, "grain_cloud", spy_grain_cloud)

    # random render — seeded weights, strength 0 → T positions are the unbiased
    # jittered positions (byte-identical to the pre-P5b.18 engine).
    _render(server, _gran_payload("random"))
    random_T = captured["random"]

    # Cross-check: random path T == the bare grain_cloud (no selection bias).
    bare = real_grain_cloud(
        7,
        "gran1",
        0,
        GranulatorParams(
            density=8,
            window="hann",
            axes={
                ax: AxisParams(grain=0.5, jitter=0.3, grain_env=1.0) for ax in "TYXCFL"
            },
            selection="random",
        ),
    )
    assert random_T == [g.T for g in bare.grains]

    # onset render with a loud transient → onset strength > 0 → T positions are
    # biased away from the unbiased jittered positions (selection CHANGES output).
    server._granulator_onset_state = None
    sr = 48000
    # Prime spectral-flux state with a quiet frame, then hit a loud burst.
    quiet = (np.random.default_rng(0).standard_normal(1024).astype(np.float32)) * 1e-4
    _render(
        server,
        _gran_payload(
            "onset",
            pcm=quiet.tolist(),
            sample_rate=sr,
            onset_params={"sensitivity": 1.0, "threshold": 0.0},
        ),
        frame_index=0,
    )
    burst = (np.sin(2 * np.pi * 1000 * np.arange(1024) / sr) * 8.0).astype(np.float32)
    _render(
        server,
        _gran_payload(
            "onset",
            pcm=burst.tolist(),
            sample_rate=sr,
            onset_params={"sensitivity": 1.0, "threshold": 0.0},
        ),
        frame_index=0,
    )
    onset_T = captured["onset"]

    # The onset transient biased the grain T-positions away from the unbiased
    # random positions — selection demonstrably affects live grain output.
    assert onset_T != random_T


def test_render_path_random_byte_identical_to_pre_selection(monkeypatch):
    """ACCEPTANCE: the `random` rule on the live path is byte-identical to a bare
    grain_cloud with no selection bias (no regression for existing projects)."""
    server = _build_server(monkeypatch)
    captured: dict[str, list] = {}
    real_grain_cloud = zmq_mod.grain_cloud

    def spy(seed, inst, frame, params, **kw):
        cloud = real_grain_cloud(seed, inst, frame, params, **kw)
        captured["T"] = [g.T for g in cloud.grains]
        return cloud

    monkeypatch.setattr(zmq_mod, "grain_cloud", spy)
    _render(server, _gran_payload("random"))

    bare = real_grain_cloud(
        7,
        "gran1",
        0,
        GranulatorParams(
            density=8,
            window="hann",
            axes={
                ax: AxisParams(grain=0.5, jitter=0.3, grain_env=1.0) for ax in "TYXCFL"
            },
        ),
    )
    assert captured["T"] == [g.T for g in bare.grains]
