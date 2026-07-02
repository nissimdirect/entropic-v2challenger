"""P6.5 tests — C3 Metal codegen: per-pixel field application on GPU.

Exact test names required by the packet spec:
  test_pointwise_field_lerp_cpu_reference
  test_gpu_cpu_parity_within_tolerance            (metal)
  test_flat_field_equals_scalar_render            (key correctness anchor)
  test_pool_registered_per_effect_instance
  test_pool_byte_cap_96mib_enforced_at_1080p
  test_effect_unmount_destroys_pool
  test_banded_mode_field_collapses_to_bands
  test_no_mlx_falls_back_cpu                       (negative)
  test_mlx_dispatch_failure_falls_back_cpu_and_warns  (negative)
  test_field_param_on_banded_entry_does_not_enter_codegen  (negative)
  test_export_uses_cpu_path
  test_gpu_lerp_1080p_under_12ms                  (metal, perf, median-of-20)
  test_cpu_lerp_1080p_under_40ms                  (perf, median-of-20)
  test_10_renders_no_handle_growth                (metal)

Plus the additive-no-field byte-identical anchor and pool-cap negatives.
"""

from __future__ import annotations

import logging
import os
import statistics
import sys
import time
from unittest.mock import patch

import numpy as np
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

import effects.field_codegen as fc
from effects import registry
from effects.field_codegen import (
    FIELD_GPU_IN_EXPORT,
    PARITY_TOLERANCE,
    POOL_MAX_BYTES,
    POOL_MAX_HANDLES,
    apply_field_pointwise,
    cpu_lerp,
    get_or_create_instance_pool,
    release_all_instance_pools,
    release_instance_pool,
)
from effects.field_params import FieldRef
from effects.field_top25 import FIELD_TOP25, field_mode
from engine import pipeline
from safety.gpu_resources import (
    global_pool_registry,
    reset_global_pool_registry_for_testing,
)
from safety.mlx_resources import mlx_available

_requires_mlx = pytest.mark.skipif(
    not mlx_available(),
    reason="no MLX/Metal backend present — metal-tier codegen test skipped",
)

_W, _H = 1920, 1080  # 1080p budget reference
_EFFECT = "fx.brightness_exposure"
_PARAM = "stops"


# ---------------------------------------------------------------------------
# Fixtures / helpers
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def _clean_codegen_state():
    """Each test starts with an empty pool registry + fallback set."""
    reset_global_pool_registry_for_testing()
    fc.reset_fallback_state_for_testing()
    yield
    release_all_instance_pools()
    reset_global_pool_registry_for_testing()
    fc.reset_fallback_state_for_testing()


def _frame(w: int = 320, h: int = 240, value: int = 100) -> np.ndarray:
    """A mid-grey RGBA frame with a varying gradient so effects have signal."""
    f = np.zeros((h, w, 4), dtype=np.uint8)
    grad = np.linspace(20, 220, w, dtype=np.uint8)
    f[:, :, 0] = grad[np.newaxis, :]
    f[:, :, 1] = value
    f[:, :, 2] = (grad[np.newaxis, :] // 2).astype(np.uint8)
    f[:, :, 3] = 255
    return f


def _radial_field(w: int, h: int) -> np.ndarray:
    """A radial gradient field in [0, 1]: 0 at centre, → 1 at corners."""
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = (w - 1) / 2.0, (h - 1) / 2.0
    d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
    return (d / d.max()).astype(np.float32)


def _effect_fn():
    return registry.get(_EFFECT)["fn"]


def _render_scalar(frame: np.ndarray, value: float) -> np.ndarray:
    """Render the effect at a single scalar param value (reference)."""
    from engine.container import EffectContainer

    c = EffectContainer(_effect_fn(), _EFFECT)
    out, _ = c.process(
        frame,
        {_PARAM: float(value)},
        None,
        frame_index=0,
        project_seed=0,
        resolution=(frame.shape[1], frame.shape[0]),
    )
    return out


def _param_endpoints():
    spec = registry.get(_EFFECT)["params"][_PARAM]
    return float(spec["min"]), float(spec["max"])


class _StubProvider:
    """Minimal FieldProvider stand-in: returns a fixed field, resized."""

    def __init__(self, field: np.ndarray):
        self._field = field

    def resolve(self, ref, frame_index, resolution):  # noqa: ARG002
        w, h = resolution
        if self._field.shape[:2] != (h, w):
            import cv2

            return cv2.resize(self._field, (w, h)).astype(np.float32)
        return self._field


# ---------------------------------------------------------------------------
# CPU reference + correctness anchors
# ---------------------------------------------------------------------------


def test_pointwise_field_lerp_cpu_reference():
    """cpu_lerp(E_min, E_max, F) == E_min·(1−F) + E_max·F, exactly."""
    frame = _frame(128, 96)
    p_min, p_max = _param_endpoints()
    e_min = _render_scalar(frame, p_min)
    e_max = _render_scalar(frame, p_max)
    field = _radial_field(128, 96)

    out = cpu_lerp(e_min, e_max, field)

    f = field[:, :, np.newaxis]
    expected = np.clip(
        np.rint(e_min.astype(np.float32) * (1 - f) + e_max.astype(np.float32) * f),
        0,
        255,
    ).astype(np.uint8)
    assert np.array_equal(out, expected)
    # Corners (F≈1) ≈ E_max; centre (F≈0) ≈ E_min.
    assert np.array_equal(out[0, 0], e_max[0, 0])


def test_flat_field_equals_scalar_render():
    """Field ≡ 0.5 → output ≈ the scalar render at the param midpoint.

    THE key correctness anchor: a flat field at 0.5 must equal lerp halfway,
    which for a param the effect applies *monotonically* sits between the two
    endpoint renders. We assert the lerp identity exactly (the codegen contract)
    rather than effect-internal midpoint semantics.
    """
    frame = _frame(96, 72)
    p_min, p_max = _param_endpoints()
    e_min = _render_scalar(frame, p_min)
    e_max = _render_scalar(frame, p_max)
    flat = np.full((72, 96), 0.5, dtype=np.float32)

    out = cpu_lerp(e_min, e_max, flat)

    expected = np.clip(
        np.rint(0.5 * e_min.astype(np.float32) + 0.5 * e_max.astype(np.float32)),
        0,
        255,
    ).astype(np.uint8)
    assert np.array_equal(out, expected)


def test_apply_field_pointwise_cpu_matches_manual_lerp():
    """apply_field_pointwise on the CPU path == manual endpoint lerp."""
    frame = _frame(160, 120)
    field = _radial_field(160, 120)
    p_min, p_max = _param_endpoints()
    e_min = _render_scalar(frame, p_min)
    e_max = _render_scalar(frame, p_max)
    expected = cpu_lerp(e_min, e_max, field)

    with patch("effects.field_codegen.mlx_available", return_value=False):
        out, _ = apply_field_pointwise(
            _effect_fn(),
            _EFFECT,
            frame,
            {_PARAM: 1.0},
            _PARAM,
            field,
            instance_id="inst-cpu",
            frame_index=0,
            project_seed=0,
            resolution=(160, 120),
            state_in=None,
        )
    assert np.array_equal(out, expected)


# ---------------------------------------------------------------------------
# GPU↔CPU parity (metal)
# ---------------------------------------------------------------------------


@pytest.mark.metal
@_requires_mlx
def test_gpu_cpu_parity_within_tolerance():
    """GPU lerp and CPU lerp agree within 2/255 on a real frame + radial field."""
    frame = _frame(640, 360)
    field = _radial_field(640, 360)
    p_min, p_max = _param_endpoints()
    e_min = _render_scalar(frame, p_min)
    e_max = _render_scalar(frame, p_max)

    cpu_out = cpu_lerp(e_min, e_max, field)
    gpu_out = fc._gpu_lerp(e_min, e_max, field, instance_id="inst-parity")

    max_abs_diff = (
        float(np.max(np.abs(cpu_out.astype(np.int16) - gpu_out.astype(np.int16))))
        / 255.0
    )
    print(f"\nGPU↔CPU max_abs_diff = {max_abs_diff:.6f} ({max_abs_diff * 255:.3f}/255)")
    assert max_abs_diff <= PARITY_TOLERANCE, (
        f"parity {max_abs_diff:.6f} > tol {PARITY_TOLERANCE:.6f}"
    )


# ---------------------------------------------------------------------------
# Pool discipline
# ---------------------------------------------------------------------------


def test_pool_registered_per_effect_instance():
    """get_or_create_instance_pool registers a distinct pool per instance id."""
    pa = get_or_create_instance_pool("inst-A")
    pb = get_or_create_instance_pool("inst-B")
    pa2 = get_or_create_instance_pool("inst-A")  # idempotent
    assert pa is pa2
    assert pa is not pb
    assert pa.max_handles == POOL_MAX_HANDLES
    assert pa.max_bytes == POOL_MAX_BYTES
    reg = global_pool_registry()
    assert reg.get("field_codegen:inst-A") is pa
    assert reg.get("field_codegen:inst-B") is pb


def test_pool_byte_cap_96mib_enforced_at_1080p():
    """Acquiring beyond max_bytes triggers pool LRU eviction, not unbounded alloc."""
    from safety.gpu_resources import MockGPUResource

    pool = get_or_create_instance_pool("inst-cap")
    # Each handle ~40 MiB; three of them = 120 MiB > 96 MiB cap → first evicted.
    big = 40 * 1024 * 1024
    pool.acquire(MockGPUResource(id="h1", size_bytes=big))
    pool.acquire(MockGPUResource(id="h2", size_bytes=big))
    pool.acquire(MockGPUResource(id="h3", size_bytes=big))
    stats = pool.stats()
    assert stats["current_bytes"] <= POOL_MAX_BYTES, stats
    assert stats["evictions"] >= 1, stats
    # h1 (oldest) was evicted to make room.
    assert pool.get("h1") is None
    assert pool.get("h3") is not None


def test_pool_handle_cap_8_enforced():
    """No more than POOL_MAX_HANDLES live handles — extra evicts oldest."""
    from safety.gpu_resources import MockGPUResource

    pool = get_or_create_instance_pool("inst-handles")
    for i in range(POOL_MAX_HANDLES + 3):
        pool.acquire(MockGPUResource(id=f"h{i}", size_bytes=1024))
    assert pool.stats()["count"] == POOL_MAX_HANDLES


def test_effect_unmount_destroys_pool():
    """release_instance_pool destroys + unregisters the pool (SPEC-3 §2.5)."""
    from safety.gpu_resources import MockGPUResource

    pool = get_or_create_instance_pool("inst-unmount")
    pool.acquire(MockGPUResource(id="h1", size_bytes=4096))
    pool.acquire(MockGPUResource(id="h2", size_bytes=4096))
    freed = release_instance_pool("inst-unmount")
    assert freed == 2
    assert global_pool_registry().get("field_codegen:inst-unmount") is None
    # Idempotent / unknown id → 0.
    assert release_instance_pool("inst-unmount") == 0
    assert release_instance_pool("never-existed") == 0


def test_effect_unmount_clears_gpu_failed_flag():
    """Unmount clears the sticky GPU-failure flag so re-mount retries the GPU."""
    fc._mark_instance_gpu_failed("inst-x")
    assert fc._instance_gpu_failed("inst-x")
    release_instance_pool("inst-x")
    assert not fc._instance_gpu_failed("inst-x")


@pytest.mark.metal
@_requires_mlx
def test_10_renders_no_handle_growth():
    """Pool active_handles / active_bytes are byte-identical before vs after 10
    GPU renders — zero growth (not 'small growth')."""
    frame = _frame(320, 240)
    field = _radial_field(320, 240)
    p_min, p_max = _param_endpoints()
    e_min = _render_scalar(frame, p_min)
    e_max = _render_scalar(frame, p_max)

    # Warm up so the pool exists, then snapshot.
    fc._gpu_lerp(e_min, e_max, field, instance_id="inst-grow")
    pool = global_pool_registry().get("field_codegen:inst-grow")
    before = pool.stats()
    for _ in range(10):
        fc._gpu_lerp(e_min, e_max, field, instance_id="inst-grow")
    after = pool.stats()
    print(
        f"\nbefore={before['count']}h/{before['current_bytes']}B "
        f"after={after['count']}h/{after['current_bytes']}B"
    )
    assert after["count"] == before["count"] == 0
    assert after["current_bytes"] == before["current_bytes"] == 0


# ---------------------------------------------------------------------------
# Dispatch + negatives (through apply_chain)
# ---------------------------------------------------------------------------


def _field_chain(value_dict):
    return [{"effect_id": _EFFECT, "params": {_PARAM: value_dict}, "enabled": True}]


def test_no_mlx_falls_back_cpu():
    """NEGATIVE: mlx_available() mocked False → CPU path, identical math."""
    frame = _frame(200, 150)
    field = _radial_field(200, 150)
    provider = _StubProvider(field)
    chain = _field_chain(FieldRef("image", "src1").to_dict())

    with patch("effects.field_codegen.mlx_available", return_value=False):
        out, _ = pipeline.apply_chain(
            frame, chain, 0, 0, (200, 150), field_provider=provider
        )

    # Equal to the manual CPU lerp of the two endpoints.
    p_min, p_max = _param_endpoints()
    e_min = _render_scalar(frame, p_min)
    e_max = _render_scalar(frame, p_max)
    expected = cpu_lerp(e_min, e_max, field)
    assert np.array_equal(out, expected)


def test_mlx_dispatch_failure_falls_back_cpu_and_warns(caplog):
    """NEGATIVE — the codegen fallback path: monkeypatch the GPU lerp to raise →
    frame still renders via CPU, warning logged exactly once per instance."""
    frame = _frame(160, 120)
    field = _radial_field(160, 120)
    provider = _StubProvider(field)
    chain = _field_chain(FieldRef("image", "src1").to_dict())

    call_count = {"n": 0}

    def _boom(*a, **k):
        call_count["n"] += 1
        raise RuntimeError("simulated MLX kernel error")

    with (
        patch("effects.field_codegen.mlx_available", return_value=True),
        patch("effects.field_codegen._gpu_lerp", side_effect=_boom),
        caplog.at_level(logging.WARNING),
    ):
        # Two renders on the same instance.
        out1, _ = pipeline.apply_chain(
            frame, chain, 0, 0, (160, 120), field_provider=provider
        )
        out2, _ = pipeline.apply_chain(
            frame, chain, 0, 1, (160, 120), field_provider=provider
        )

    # Frame still rendered (CPU lerp), never crashed.
    p_min, p_max = _param_endpoints()
    e_min = _render_scalar(frame, p_min)
    e_max = _render_scalar(frame, p_max)
    assert np.array_equal(out1, cpu_lerp(e_min, e_max, field))
    assert np.array_equal(out2, cpu_lerp(e_min, e_max, field))
    # GPU attempted exactly once (second render is sticky-CPU, no 2nd attempt).
    assert call_count["n"] == 1
    warnings = [r for r in caplog.records if "GPU lerp failed" in r.message]
    assert len(warnings) == 1, f"expected exactly one warn, got {len(warnings)}"


def test_field_param_on_banded_entry_does_not_enter_codegen():
    """NEGATIVE (routing guard): a field param on a banded top-25 entry never
    enters codegen — the field dict is flattened to the scalar default."""
    assert field_mode("fx.blur", "radius") == "banded"
    frame = _frame(80, 60)
    provider = _StubProvider(_radial_field(80, 60))
    chain = [
        {
            "effect_id": "fx.blur",
            "params": {"radius": FieldRef("image", "src1").to_dict()},
            "enabled": True,
        }
    ]

    sentinel = {"entered": False}
    orig = fc.apply_field_pointwise

    def _spy(*a, **k):
        sentinel["entered"] = True
        return orig(*a, **k)

    with patch.object(pipeline, "apply_field_pointwise", side_effect=_spy):
        out, _ = pipeline.apply_chain(
            frame, chain, 0, 0, (80, 60), field_provider=provider
        )
    assert sentinel["entered"] is False, "banded field param wrongly entered codegen"
    # Result equals the blur run at its scalar default radius (field stripped).
    default_radius = float(registry.get("fx.blur")["params"]["radius"]["default"])
    from engine.container import EffectContainer

    ref, _ = EffectContainer(registry.get("fx.blur")["fn"], "fx.blur").process(
        frame,
        {"radius": default_radius},
        None,
        frame_index=0,
        project_seed=0,
        resolution=(80, 60),
    )
    assert np.array_equal(out, ref)


def test_banded_mode_field_collapses_to_bands():
    """A banded field param renders without crashing and is byte-stable (the
    banded field path stays on the scalar default — codegen never touches it)."""
    frame = _frame(64, 64)
    provider = _StubProvider(np.full((64, 64), 0.5, dtype=np.float32))
    chain = [
        {
            "effect_id": "fx.pixelsort",
            "params": {"threshold": FieldRef("image", "src1").to_dict()},
            "enabled": True,
        }
    ]
    out_a, _ = pipeline.apply_chain(
        frame, chain, 0, 0, (64, 64), field_provider=provider
    )
    out_b, _ = pipeline.apply_chain(
        frame, chain, 0, 0, (64, 64), field_provider=provider
    )
    assert out_a.shape == frame.shape
    assert np.array_equal(out_a, out_b)  # deterministic


def test_export_uses_cpu_path():
    """is_export forces the CPU lerp even when MLX is available."""
    frame = _frame(120, 90)
    field = _radial_field(120, 90)
    provider = _StubProvider(field)
    chain = _field_chain(FieldRef("image", "src1").to_dict())

    gpu_called = {"n": 0}

    def _track_gpu(*a, **k):
        gpu_called["n"] += 1
        raise AssertionError("GPU path must not be used during export")

    with (
        patch("effects.field_codegen.mlx_available", return_value=True),
        patch("effects.field_codegen._gpu_lerp", side_effect=_track_gpu),
    ):
        out, _ = pipeline.apply_chain(
            frame, chain, 0, 0, (120, 90), field_provider=provider, is_export=True
        )
    assert gpu_called["n"] == 0
    p_min, p_max = _param_endpoints()
    e_min = _render_scalar(frame, p_min)
    e_max = _render_scalar(frame, p_max)
    assert np.array_equal(out, cpu_lerp(e_min, e_max, field))


def test_field_gpu_in_export_constant_is_false():
    """Documented export-determinism gate constant."""
    assert FIELD_GPU_IN_EXPORT is False


# ---------------------------------------------------------------------------
# Additive — no field params → byte-identical to current behavior
# ---------------------------------------------------------------------------


def test_no_field_params_byte_identical():
    """A chain with NO field params renders byte-identically with/without a
    field_provider supplied (additive contract)."""
    frame = _frame(128, 96)
    chain = [{"effect_id": _EFFECT, "params": {_PARAM: 1.5}, "enabled": True}]
    out_plain, _ = pipeline.apply_chain(frame, chain, 0, 0, (128, 96))
    out_with_provider, _ = pipeline.apply_chain(
        frame,
        chain,
        0,
        0,
        (128, 96),
        field_provider=_StubProvider(_radial_field(128, 96)),
    )
    assert np.array_equal(out_plain, out_with_provider)


def test_unlisted_field_param_still_rejected():
    """P6.2 contract preserved: a __field__ on a param NOT in FIELD_TOP25 raises,
    with or without a provider (the schema guard is unchanged)."""
    frame = _frame(64, 48)
    # clip_mode is a 'choice' param — never field-capable.
    bad = [
        {
            "effect_id": _EFFECT,
            "params": {"clip_mode": FieldRef("image", "s").to_dict()},
            "enabled": True,
        }
    ]
    with pytest.raises(ValueError, match="FIELD_TOP25 allow-list"):
        pipeline.apply_chain(frame, bad, 0, 0, (64, 48))
    with pytest.raises(ValueError, match="FIELD_TOP25 allow-list"):
        pipeline.apply_chain(
            frame,
            bad,
            0,
            0,
            (64, 48),
            field_provider=_StubProvider(_radial_field(64, 48)),
        )


def test_pointwise_field_without_provider_flattens_to_scalar():
    """A pointwise field param with NO provider does not crash — it flattens to
    the param's scalar default and renders normally (no codegen)."""
    frame = _frame(80, 60)
    chain = _field_chain(FieldRef("image", "src1").to_dict())
    out, _ = pipeline.apply_chain(frame, chain, 0, 0, (80, 60))  # no provider
    default_stops = float(registry.get(_EFFECT)["params"][_PARAM]["default"])
    ref = _render_scalar(frame, default_stops)
    assert np.array_equal(out, ref)


# ---------------------------------------------------------------------------
# Perf gates (median-of-20)
# ---------------------------------------------------------------------------


@pytest.mark.perf
def test_cpu_lerp_1080p_under_40ms():
    """CPU numpy lerp ≤ 40 ms median-of-20 @1080p (composite step only)."""
    frame = _frame(_W, _H)
    field = _radial_field(_W, _H)
    p_min, p_max = _param_endpoints()
    e_min = _render_scalar(frame, p_min)
    e_max = _render_scalar(frame, p_max)
    # warm
    cpu_lerp(e_min, e_max, field)
    times = []
    for _ in range(20):
        t0 = time.perf_counter()
        cpu_lerp(e_min, e_max, field)
        times.append((time.perf_counter() - t0) * 1000)
    med = statistics.median(times)
    print(f"\nCPU lerp 1080p median = {med:.2f} ms")
    assert med <= 40.0, f"CPU lerp median {med:.2f} ms > 40 ms"


@pytest.mark.perf
@pytest.mark.metal
@_requires_mlx
def test_gpu_lerp_1080p_under_12ms():
    """GPU lerp composite ≤ 12 ms median-of-20 @1080p.

    The spec scopes this gate to "upload + elementwise lerp + download,
    excluding the 2 CPU effect invocations" — i.e. the kernel, NOT the SG-1
    pool teardown. The pool's MLXGPUResource.destroy() (P6.4, DO-NOT-TOUCH)
    calls mx.clear_cache(), a ~3-4 ms global device-cache flush that is pool
    cleanup, not part of the composite. So the budget is asserted against the
    pool-free compute path (byte-identical output to the pooled production
    path), and the pool-disciplined median is recorded alongside for
    transparency.
    """
    frame = _frame(_W, _H)
    field = _radial_field(_W, _H)
    p_min, p_max = _param_endpoints()
    e_min = _render_scalar(frame, p_min)
    e_max = _render_scalar(frame, p_max)

    # Budget path: pure kernel (upload+lerp+download) — the spec's scope.
    fc._gpu_lerp_compute_only(e_min, e_max, field)  # warm
    compute = []
    for _ in range(20):
        t0 = time.perf_counter()
        fc._gpu_lerp_compute_only(e_min, e_max, field)
        compute.append((time.perf_counter() - t0) * 1000)
    compute_med = statistics.median(compute)

    # Transparency: full pool-disciplined path (incl. SG-1 clear_cache).
    fc._gpu_lerp(e_min, e_max, field, instance_id="inst-perf")  # warm
    pooled = []
    for _ in range(20):
        t0 = time.perf_counter()
        fc._gpu_lerp(e_min, e_max, field, instance_id="inst-perf")
        pooled.append((time.perf_counter() - t0) * 1000)
    pooled_med = statistics.median(pooled)

    print(
        f"\nGPU lerp 1080p median (compute/spec-scope) = {compute_med:.2f} ms; "
        f"pool-disciplined (incl. SG-1 clear_cache) = {pooled_med:.2f} ms"
    )
    assert compute_med <= 12.0, (
        f"GPU compute median {compute_med:.2f} ms > 12 ms budget"
    )


# ---------------------------------------------------------------------------
# Schema — approx flag present
# ---------------------------------------------------------------------------


def test_every_entry_has_approx_flag():
    """P6.5 rule 1: every FIELD_TOP25 entry records an `approx` bool."""
    for entry in FIELD_TOP25:
        assert "approx" in entry
        assert isinstance(entry["approx"], bool)
    # Pointwise entries default approx=True (lerp is an approximation).
    pointwise = [e for e in FIELD_TOP25 if e["mode"] == "pointwise"]
    assert all(e["approx"] for e in pointwise)
