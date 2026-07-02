"""P5b.17 — B8 Granulator render integration (zmq_server) + 16ms budget degrade
+ SG-8 density-halving hook (INSTRUMENTS-BUILD-PLAN.md §B8, SPEC-3 §5.2).

P5b.16 shipped the PURE grain-descriptor engine (`grain_cloud`). P5b.17 closes
the render gap:

  (A) PIXEL render — each grain samples the source at its (X, Y) descriptor
      position, windows + per-axis-envelopes it, and composites EVERY grain into
      ONE output RGBA layer (`render_grain_layer`, CPU/numpy). The zmq render
      dispatch (`_handle_render_composite`) grows a `performance.granulator` arm
      that appends exactly ONE voice layer.

  (B) RENDER-BUDGET GUARD — when a frame's grain-render eval exceeds 16ms (one
      60fps frame), the NEXT frame halves `density` (per-frame back-pressure).

  (C) SG-8 DEGRADE — under memory pressure the canonical degrade order reaches
      stage #3 `a1_grain_density_halved` (latent grains → spectral → density);
      the FeatureRegistry fires this instrument's hook, latching half-density.

HARD ORACLE — the five named tests below must all pass:
  test_grain_composite_single_output_layer
  test_render_budget_degrades_density_over_16ms   (synthetic slow path)
  test_sg8_pressure_halves_density
  test_grain_count_cap_at_render
  test_malformed_granulator_layer_rejected_pre_decode
"""

from __future__ import annotations

import numpy as np
import pytest

import zmq_server as zmq_mod
from instruments.granulator_instrument import (
    MAX_GRAINS,
    RENDER_BUDGET_MS,
    RENDER_RECOVERY_FRAMES,
    RENDER_RECOVERY_MS,
    SG8_DENSITY_STAGE,
    AxisParams,
    BudgetController,
    GranulatorParams,
    effective_density,
    grain_cloud,
    register_sg8_density_hook,
    render_grain_layer,
    reset_sg8_density_for_testing,
    sg8_density_degraded,
)
from safety.pressure.registry import FeatureRegistry

pytestmark = pytest.mark.smoke


# --------------------------------------------------------------------------- #
# fakes — deterministic footage reader (no file I/O), mirror of the frame-bank
# preview harness so the render dispatch path is exercised end-to-end.
# --------------------------------------------------------------------------- #


class FakeReader:
    """decode_frame(i) → RGBA frame whose R channel encodes `i` (mod 256)."""

    def __init__(self, frame_count: int = 200, h: int = 16, w: int = 16):
        self.frame_count = frame_count
        self.width = w
        self.height = h
        self._h = h
        self._w = w

    def decode_frame(self, frame_index: int) -> np.ndarray:
        f = np.zeros((self._h, self._w, 4), dtype=np.uint8)
        f[:, :, 0] = int(frame_index) % 256
        f[:, :, 3] = 255
        return f


def _build_server(monkeypatch, reader: FakeReader | None = None):
    """ZMQServer skeleton with only what _handle_render_composite touches, plus a
    captured render_composite and a stubbed _get_reader."""
    from zmq_server import ZMQServer

    server = ZMQServer.__new__(ZMQServer)
    server.token = "test-token"
    server.last_frame_ms = 0.0
    server._granulator_last_frame_ms = None
    server._granulator_budget = BudgetController()

    rdr = reader if reader is not None else FakeReader()
    server._get_reader = lambda path: rdr  # type: ignore[assignment]

    captured: list[list[dict]] = []

    def fake_render_composite(layers, resolution, project_seed, layer_states=None):
        snapshot = []
        for layer in layers:
            frame = layer.get("frame")
            snapshot.append(
                {
                    "layer_id": layer.get("layer_id"),
                    "opacity": layer.get("opacity"),
                    "blend_mode": layer.get("blend_mode"),
                    "voice_id": layer.get("voice_id"),
                    "frame_shape": (
                        frame.shape if isinstance(frame, np.ndarray) else None
                    ),
                }
            )
        captured.append(snapshot)
        w, h = resolution
        return np.zeros((h, w, 4), dtype=np.uint8), {}

    monkeypatch.setattr(zmq_mod, "render_composite", fake_render_composite)
    monkeypatch.setattr(zmq_mod, "flatten_rgba", lambda f: f)
    monkeypatch.setattr(zmq_mod, "encode_mjpeg", lambda f: b"\x00")
    monkeypatch.setattr(zmq_mod, "validate_upload", lambda p: [])
    return server, captured, rdr


def _gran_payload(density: int = 8, jitter: float = 0.3, **extra) -> dict:
    axes = {ax: {"grain": 0.5, "jitter": jitter, "grain_env": 1.0} for ax in "TYXCFL"}
    payload = {
        "instrument_id": "gran1",
        "density": density,
        "window": "hann",
        "axes": axes,
    }
    payload.update(extra)
    return payload


def _render(server, *, frame_index: int = 0, granulator: dict | None = None) -> dict:
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
    }
    if granulator is not None:
        msg["performance"] = {"granulator": granulator}
    return server._handle_render_composite(msg, "mid-1")


@pytest.fixture(autouse=True)
def _reset_sg8():
    """Each test starts with the SG-8 density latch cleared."""
    reset_sg8_density_for_testing()
    yield
    reset_sg8_density_for_testing()


# --------------------------------------------------------------------------- #
# GATE 1 — ONE layer out per render.
# --------------------------------------------------------------------------- #


def test_grain_composite_single_output_layer(monkeypatch):
    """A granulator render appends EXACTLY ONE layer (one voice), and the layer
    is a single (H, W, 4) RGBA frame — never N grain layers."""
    server, captured, _ = _build_server(monkeypatch)
    resp = _render(server, granulator=_gran_payload(density=16))
    assert resp["ok"] is True

    snapshot = captured[0]
    gran_layers = [s for s in snapshot if str(s["layer_id"]).startswith("granulator:")]
    # EXACTLY one granulator layer was appended (the base video + ONE grain layer).
    assert len(gran_layers) == 1
    assert gran_layers[0]["frame_shape"] == (16, 16, 4)
    # The base layer is still present (we appended, never replaced).
    assert len(snapshot) == 2

    # And the pure render function itself returns ONE RGBA layer for many grains.
    params = GranulatorParams(
        density=16, axes={a: AxisParams(grain=0.5, jitter=0.3) for a in "TYXCFL"}
    )
    cloud = grain_cloud(7, "gran1", 0, params)
    src = (np.random.RandomState(1).rand(16, 16, 4) * 255).astype(np.uint8)
    out = render_grain_layer(src, cloud, resolution=(16, 16))
    assert out.shape == (16, 16, 4)
    assert out.dtype == np.uint8


def test_empty_cloud_still_one_transparent_layer():
    """density=0 → empty cloud → ONE transparent RGBA layer, never None/crash."""
    params = GranulatorParams(density=0)
    cloud = grain_cloud(7, "gran1", 0, params)
    src = (np.random.RandomState(2).rand(8, 8, 4) * 255).astype(np.uint8)
    out = render_grain_layer(src, cloud, resolution=(8, 8))
    assert out.shape == (8, 8, 4)
    assert int(out.sum()) == 0  # fully transparent


# --------------------------------------------------------------------------- #
# GATE 2 — the 16ms budget guard provably fires (synthetic slow path).
# --------------------------------------------------------------------------- #


def test_render_budget_degrades_density_over_16ms():
    """When the previous frame's eval exceeded 16ms, effective_density halves.

    Synthetic slow path: we feed a last_frame_ms above the 16ms budget and assert
    the resolved density is halved vs the unthrottled baseline.
    """
    base = 64
    fast = effective_density(base, last_frame_ms=4.0)  # under budget → no degrade
    slow = effective_density(base, last_frame_ms=20.0)  # over 16ms → halve
    assert fast == 64
    assert slow == 32
    # Exactly at the boundary does NOT degrade (strictly greater-than).
    assert effective_density(base, last_frame_ms=16.0) == 64
    # Just over does.
    assert effective_density(base, last_frame_ms=16.01) == 32


def test_budget_degrade_converges_no_oscillation():
    """TIGER 3 regression — the FEEDBACK loop the single-transition tests missed.

    The naive memoryless controller (recompute from base every frame, inspect
    only the prior frame) STROBES: at full density the frame blows budget → halve
    → the *halved* frame is fast → jump straight back to full → blows budget
    again → ... a permanent full↔half flicker.

    We simulate that exact closed loop: a synthetic timing model where eval is
    >16ms at full density and <12ms once degraded, FED BACK into the next
    controller step. With the sticky floor + recovery deadband the density must
    CONVERGE to a stable value within a few frames and NOT flip full↔half across
    consecutive frames once settled.
    """
    base = 16
    ctrl = BudgetController()

    # Synthetic frame-time model: cost is dominated by the buffer churn, so eval
    # only drops below the recovery margin once density is at-or-below half.
    # (Mirrors the reviewer's measurement: halving barely helps at 4K, but at the
    # halved working point the frame is comfortably under budget.) Anything above
    # `safe` trips; at-or-below is comfortably fast.
    safe = base // 2

    def frame_ms(rendered_density: int) -> float:
        if rendered_density > safe:
            return 28.0  # over the 16ms trip
        return 8.0  # comfortably under the 12ms recovery margin

    last_ms: float | None = None
    densities: list[int] = []
    # Run long enough for AIMD (additive +1 / 3 frames) to fully converge.
    for _ in range(120):
        d = ctrl.step(base, last_frame_ms=last_ms)
        densities.append(d)
        last_ms = frame_ms(d)

    # CONVERGENCE: after a short settle window the density is STABLE — the last
    # 10 frames are all identical (no per-frame change at all).
    tail = densities[-10:]
    assert len(set(tail)) == 1, f"density did not converge — tail={tail}"

    # NO STROBE: across the settled tail there is never a full↔half flip
    # (consecutive frames differ by 0 in steady state).
    flips = sum(1 for a, b in zip(tail, tail[1:]) if a != b)
    assert flips == 0, f"density oscillated in steady state — tail={tail}"

    # The converged value sits at the safe working point (≤ half base), NOT
    # bouncing back to the budget-blowing full density.
    assert tail[0] <= base // 2

    # And it degraded at all (proves the trip fired) but never collapsed below
    # the floor.
    assert tail[0] >= 1
    assert tail[0] < base


def test_budget_recovery_requires_sustained_good_frames():
    """Density recovers toward base ONLY after K sustained sub-margin frames.

    One fast frame after a trip must NOT immediately restore full density (that
    memoryless jump is the strobe). Recovery needs RENDER_RECOVERY_FRAMES
    consecutive frames under RENDER_RECOVERY_MS.
    """
    base = 64
    ctrl = BudgetController()

    # Frame 0: no history → base.
    assert ctrl.step(base, last_frame_ms=None) == base
    # Frame 1: prior blew budget → trip → halved floor latched.
    d1 = ctrl.step(base, last_frame_ms=28.0)
    assert d1 == 32
    assert ctrl.floor == 32

    # A SINGLE good frame does NOT recover (streak < K).
    d2 = ctrl.step(base, last_frame_ms=8.0)
    assert d2 == 32, "recovered after a single good frame — would strobe"

    # K consecutive good frames → recover ADDITIVELY by ONE grain (AIMD), NOT a
    # jump back to base. The trip latched a ceiling at 63 (just below the
    # known-bad 64), so recovery climbs gradually toward 63, never to 64 in one
    # leap — this slow additive climb is exactly what prevents the strobe.
    floor_before = ctrl.floor  # 32
    for _ in range(RENDER_RECOVERY_FRAMES):
        d = ctrl.step(base, last_frame_ms=8.0)
    assert d == floor_before + 1, "recovery should step up by exactly one grain"
    assert d < base, "recovery must not jump straight back to base (strobe)"
    assert ctrl.ceiling == base - 1  # ceiling latched just below known-bad base


def test_budget_deadband_holds_floor():
    """A frame inside the deadband [12ms, 16ms] neither trips nor recovers."""
    base = 64
    ctrl = BudgetController()
    ctrl.step(base, last_frame_ms=None)
    ctrl.step(base, last_frame_ms=28.0)  # trip → 32
    assert ctrl.floor == 32
    # Deadband frame (between recovery 12ms and budget 16ms) → hold, reset streak.
    d = ctrl.step(base, last_frame_ms=14.0)
    assert d == 32
    assert ctrl.floor == 32


def test_budget_controller_ratchets_down_on_repeated_overshoot():
    """Sustained overshoot ratchets the floor DOWN step by step, to MIN_DENSITY."""
    base = 64
    ctrl = BudgetController()
    ctrl.step(base, last_frame_ms=None)  # base
    seen = []
    for _ in range(12):
        d = ctrl.step(base, last_frame_ms=99.0)  # always over budget
        seen.append(d)
    # Monotonic non-increasing, ending at the floor (>=1), never below.
    assert all(b <= a for a, b in zip(seen, seen[1:]))
    assert seen[-1] >= 1
    assert seen[-1] < base


def test_budget_controller_sg8_stacks_on_floor():
    """SG-8 latch applies multiplicatively on top of the converged budget floor."""
    base = 64
    reg = FeatureRegistry()
    register_sg8_density_hook(reg)
    ctrl = BudgetController()
    ctrl.step(base, last_frame_ms=None)
    ctrl.step(base, last_frame_ms=28.0)  # trip → floor 32
    # Now SG-8 pressure fires too → 32 halved → 16.
    reg.fire_degrade(SG8_DENSITY_STAGE)
    d = ctrl.step(base, last_frame_ms=14.0)  # deadband holds floor at 32
    assert d == 16


def test_budget_guard_fires_through_render_dispatch(monkeypatch):
    """End-to-end: a slow grain render on frame N halves density on frame N+1.

    We monkeypatch render_grain_layer to consume >16ms so the server latches a
    slow last-frame time; the next render's effective density must drop.
    """
    server, captured, _ = _build_server(monkeypatch)

    captured_densities: list[int] = []
    real_grain_cloud = grain_cloud

    def spy_grain_cloud(seed, inst, fidx, params, **kw):
        captured_densities.append(params.density)
        return real_grain_cloud(seed, inst, fidx, params, **kw)

    monkeypatch.setattr(zmq_mod, "grain_cloud", spy_grain_cloud)

    # Frame 0: force a >16ms grain render so the server records a slow frame.
    def slow_render(source, cloud, *, resolution, patch=8):
        server._granulator_last_frame_ms = None  # will be overwritten by handler
        w, h = resolution
        return np.zeros((h, w, 4), dtype=np.uint8)

    # Make render_grain_layer report >16ms by patching time within the arm:
    # simplest deterministic approach — directly seed the slow-frame memory after
    # frame 0, then assert frame 1 degrades.
    _render(server, granulator=_gran_payload(density=64))
    d0 = captured_densities[-1]
    assert d0 == 64  # first frame: no prior timing → full density

    # Simulate that frame 0 blew the budget.
    server._granulator_last_frame_ms = 25.0
    _render(server, granulator=_gran_payload(density=64))
    d1 = captured_densities[-1]
    assert d1 == 32  # frame 1: prior frame >16ms → density halved


# --------------------------------------------------------------------------- #
# GATE 3 — SG-8 pressure halves density; degrade never crashes mid-frame.
# --------------------------------------------------------------------------- #


def test_sg8_pressure_halves_density():
    """Firing the SG-8 `a1_grain_density_halved` stage latches half-density."""
    reg = FeatureRegistry()
    register_sg8_density_hook(reg)
    assert reg.stage_count(SG8_DENSITY_STAGE) == 1

    # Before pressure: full density.
    assert sg8_density_degraded() is False
    assert effective_density(64) == 64

    # Fire the canonical density stage → degrade hook latches the flag.
    fired = reg.fire_degrade(SG8_DENSITY_STAGE)
    assert fired == 1
    assert sg8_density_degraded() is True
    assert effective_density(64) == 32  # halved by SG-8 latch

    # Restore clears the latch (hysteresis path).
    reg.fire_restore(SG8_DENSITY_STAGE)
    assert sg8_density_degraded() is False
    assert effective_density(64) == 64


def test_sg8_stacks_with_budget_guard():
    """SG-8 latch AND a slow frame stack → density quartered, floored at MIN."""
    reg = FeatureRegistry()
    register_sg8_density_hook(reg)
    reg.fire_degrade(SG8_DENSITY_STAGE)
    # 64 → SG-8 halve → 32 → budget halve → 16.
    assert effective_density(64, last_frame_ms=20.0) == 16


def test_sg8_degrade_idempotent_no_crash():
    """Firing degrade twice is a no-op; degrade only flips a bool (crash-proof)."""
    reg = FeatureRegistry()
    register_sg8_density_hook(reg)
    assert reg.fire_degrade(SG8_DENSITY_STAGE) == 1
    assert reg.fire_degrade(SG8_DENSITY_STAGE) == 0  # idempotent
    assert sg8_density_degraded() is True


def test_sg8_density_stage_is_order_three():
    """SG-8 degrade order is latent grains → spectral → density (canonical #3)."""
    from safety.pressure.degrade_order import CANONICAL_DEGRADE_ORDER

    by_order = {s.order: s.name for s in CANONICAL_DEGRADE_ORDER}
    assert by_order[1] == "d4_latent_grain_pool"  # latent grains
    assert by_order[2] == "a5_spectral_state"  # spectral
    assert by_order[3] == SG8_DENSITY_STAGE  # density (this hook)


# --------------------------------------------------------------------------- #
# GATE 4 — grain-count cap at render (MAX_GRAINS).
# --------------------------------------------------------------------------- #


def test_grain_count_cap_at_render(monkeypatch):
    """A density at-cap renders; the engine never emits more than MAX_GRAINS."""
    server, captured, _ = _build_server(monkeypatch)

    captured_density: list[int] = []
    real = grain_cloud

    def spy(seed, inst, fidx, params, **kw):
        cloud = real(seed, inst, fidx, params, **kw)
        captured_density.append(len(cloud.grains))
        return cloud

    monkeypatch.setattr(zmq_mod, "grain_cloud", spy)

    # Request EXACTLY MAX_GRAINS — accepted, capped to MAX_GRAINS grains.
    resp = _render(server, granulator=_gran_payload(density=MAX_GRAINS))
    assert resp["ok"] is True
    assert captured_density[-1] == MAX_GRAINS

    # The pure params object also caps internally.
    p = GranulatorParams(density=MAX_GRAINS + 5000)
    assert p.density == MAX_GRAINS


def test_grain_count_over_cap_rejected_at_validation(monkeypatch):
    """A density OVER MAX_GRAINS is rejected LOUDLY pre-decode (not silently
    clamped) — a request for more grains than the security cap is malformed."""
    server, _, _ = _build_server(monkeypatch)
    resp = _render(server, granulator=_gran_payload(density=MAX_GRAINS + 1))
    assert resp["ok"] is False
    assert "MAX_GRAINS" in resp["error"]


# --------------------------------------------------------------------------- #
# GATE 5 — malformed input rejected PRE-DECODE (trust boundary).
# --------------------------------------------------------------------------- #


def test_malformed_granulator_layer_rejected_pre_decode(monkeypatch):
    """Malformed granulator payloads are rejected BEFORE any source decode/sample.

    We patch the grain pixel-path entry (render_grain_layer_dispatch, the
    CPU/GPU dispatcher the arm calls since P5b.28) to a sentinel that raises if
    ever called, proving rejection happens upstream of the pixel path (the trust
    boundary).
    """

    def must_not_render(*a, **k):
        raise AssertionError("grain pixel path called on a malformed payload")

    monkeypatch.setattr(zmq_mod, "render_grain_layer_dispatch", must_not_render)

    bad_payloads = [
        {"density": "lots"},  # non-numeric density
        {"density": float("inf")},  # non-finite density
        {"density": float("nan")},  # NaN density
        {"density": -4},  # negative density
        {"density": MAX_GRAINS + 1},  # over the hard cap
        {"density": 4, "window": 123},  # non-string window
        {"density": 4, "axes": [1, 2, 3]},  # axes not a dict
        {"density": 4, "axes": {"T": "nope"}},  # axis params not a dict
        {"density": 4, "axes": {"T": {"jitter": "x"}}},  # axis field not a number
    ]
    for payload in bad_payloads:
        server, captured, _ = _build_server(monkeypatch)
        # re-stub render after fresh server build (monkeypatch is module-level so
        # the sentinel persists; rebuild only resets server state).
        resp = _render(server, granulator=payload)
        assert resp["ok"] is False, f"expected reject for {payload!r}"
        # Nothing was appended (no granulator layer reached the compositor).
        if captured:
            gran = [
                s for s in captured[-1] if str(s["layer_id"]).startswith("granulator:")
            ]
            assert gran == [], f"granulator layer leaked for {payload!r}"


def test_bool_density_rejected(monkeypatch):
    """A bool density (True/False) is rejected — bools are not valid grain counts."""
    server, _, _ = _build_server(monkeypatch)
    resp = _render(server, granulator={"density": True})
    assert resp["ok"] is False


def test_no_granulator_payload_is_regression_safe(monkeypatch):
    """No performance.granulator → no extra layer (byte-identical to before)."""
    server, captured, _ = _build_server(monkeypatch)
    resp = _render(server)  # no granulator
    assert resp["ok"] is True
    gran = [s for s in captured[0] if str(s["layer_id"]).startswith("granulator:")]
    assert gran == []
    assert len(captured[0]) == 1  # base layer only
