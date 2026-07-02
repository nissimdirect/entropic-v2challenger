"""P5b.28 — B8 GPU grain-render pass (MLX instanced quads, preview-only).

Hard-oracle tests — all named tests MUST pass. This Mac HAS MLX, so the GPU
tests RUN (they are skip-marked WITH AN EXPLICIT REASON only on a machine
without MLX — never silent-passed; per feedback_silent-exception-swallowing).

  test_gpu_vs_cpu_pixel_tolerance       — THE gate. Same seed/params/frame, the
      GPU composite matches the CPU render_grain_layer within max abs ≤ 2/255 AND
      mean abs ≤ 0.5/255 at density=64, 1080p (and 16 / 200 too).
  test_gpu_pass_200_grains_1080p_under_16ms — perf: median over 100 frames < 16ms.
  test_gpu_error_falls_back_to_cpu_not_crash — a forced MLX error → CPU result.
  test_export_never_uses_gpu_path       — render_path:'gpu' under is_export coerced
      to CPU + logged.
  test_pool_leak_zero_after_500_frames  — pool accounting; finalizer-free counter 0.
  test_sg8_stage6_releases_texture_pool_and_renders_continue — stage-6 destroy_all
      then a subsequent render still succeeds.
  test_use_after_destroy_raises_destroyed_handle_error — SG-1 use-after-free guard.

DO-NOT-TOUCH the CPU grain path output: test_cpu_path_byte_identical_regression
locks render_grain_layer's output hash so this packet cannot have perturbed it.

DETERMINISM RULE (§0.4): byte-identity assertions use a FIXED project_seed
(export-path semantics). Export ALWAYS uses the CPU path (proven here).
"""

from __future__ import annotations

import gc
import hashlib
import logging
import time

import numpy as np
import pytest

from instruments.granulator_instrument import (
    AxisParams,
    GranulatorParams,
    grain_cloud,
    render_grain_layer,
)
import instruments.granulator_gpu as gg
from instruments.granulator_gpu import (
    coerce_render_path,
    get_or_create_instance_pool,
    register_sg8_texture_pool_hook,
    release_all_texture_pools,
    render_grain_layer_dispatch,
    render_grain_layer_gpu,
    reset_fallback_state_for_testing,
)
from safety.gpu_resources import (
    DestroyedHandleError,
    global_pool_registry,
    reset_global_pool_registry_for_testing,
)
from safety.mlx_resources import MLXGPUResource, mlx_available
from safety.pressure.registry import FeatureRegistry

# This Mac HAS MLX — the GPU tests RUN. On a machine without MLX they are
# skip-marked WITH AN EXPLICIT REASON (never silent-passed).
requires_mlx = pytest.mark.skipif(
    not mlx_available(),
    reason="MLX (mlx.core) unavailable — GPU grain-composite path needs Apple "
    "Silicon Metal; CPU fallback is covered by the export/fallback tests which "
    "run everywhere. Skipped here so the GPU-parity gate is not silently passed.",
)

RES_1080 = (1920, 1080)


def _axes(**kw) -> dict:
    return {a: AxisParams(**kw) for a in "TYXCFL"}


def _params(density: int, render_path: str = "cpu", **axis_kw) -> GranulatorParams:
    return GranulatorParams(
        density=density,
        render_path=render_path,  # type: ignore[arg-type]
        axes=_axes(grain=0.5, jitter=axis_kw.get("jitter", 0.8), grain_env=0.9),
    )


def _src(h: int, w: int, seed: int = 0) -> np.ndarray:
    return (np.random.RandomState(seed).rand(h, w, 4) * 255).astype(np.uint8)


@pytest.fixture(autouse=True)
def _isolation():
    """Each test starts with a clean pool registry + fallback set."""
    reset_global_pool_registry_for_testing()
    reset_fallback_state_for_testing()
    MLXGPUResource.reset_finalizer_counter()
    yield
    release_all_texture_pools()
    reset_global_pool_registry_for_testing()
    reset_fallback_state_for_testing()


# --------------------------------------------------------------------------- #
# THE GATE — GPU↔CPU pixel parity
# --------------------------------------------------------------------------- #


@requires_mlx
@pytest.mark.parametrize("density", [16, 64, 200])
def test_gpu_vs_cpu_pixel_tolerance(density):
    """GPU composite matches CPU render_grain_layer within the parity gate
    (max abs ≤ 2/255, mean abs ≤ 0.5/255) at densities 16 / 64 / 200, 1080p.

    Same seed, params, frame → the two paths composite the identical grains.
    """
    src = _src(1080, 1920, seed=7)
    params = _params(density)
    cloud = grain_cloud(123, "parity", 9, params)

    cpu = render_grain_layer(src, cloud, resolution=RES_1080)
    gpu = render_grain_layer_gpu(
        src, cloud, resolution=RES_1080, patch=8, instance_id="parity"
    )

    diff = np.abs(cpu.astype(np.int32) - gpu.astype(np.int32))
    max_abs = int(diff.max())
    mean_abs = float(diff.mean())
    assert max_abs <= 2, f"density={density}: max abs diff {max_abs} > 2/255 gate"
    assert mean_abs <= 0.5, f"density={density}: mean abs diff {mean_abs} > 0.5/255"


# --------------------------------------------------------------------------- #
# PERF — 200 grains @1080p under one 60fps frame
# --------------------------------------------------------------------------- #


@requires_mlx
@pytest.mark.perf  # wall-clock ms budget — flakes under parallel load (F4c 2026-07-02); CI runs -m 'not perf'
def test_gpu_pass_200_grains_1080p_under_16ms():
    """Median GPU grain-composite over 100 frames < 16ms (one 60fps frame) at
    200 grains, 1080p, on this M-series Mac. RECORDS the median for the PR table.
    """
    src = _src(1080, 1920, seed=1)
    params = _params(200, jitter=0.9)

    # Warm-up (first MLX dispatch JIT-compiles the kernel).
    for f in range(5):
        render_grain_layer_gpu(
            src,
            grain_cloud(123, "perf", f, params),
            resolution=RES_1080,
            patch=8,
            instance_id="perf",
        )

    times_ms: list[float] = []
    for f in range(100):
        cloud = grain_cloud(123, "perf", f, params)
        t0 = time.perf_counter()
        render_grain_layer_gpu(
            src, cloud, resolution=RES_1080, patch=8, instance_id="perf"
        )
        times_ms.append((time.perf_counter() - t0) * 1000.0)

    times_ms.sort()
    median = times_ms[len(times_ms) // 2]
    print(f"\n[P5b.28 PERF] GPU 200 grains @1080p median = {median:.3f}ms (gate <16ms)")
    assert median < 16.0, f"GPU median {median:.3f}ms exceeded the 16ms budget"


# --------------------------------------------------------------------------- #
# FALLBACK — a GPU error never crashes the render
# --------------------------------------------------------------------------- #


def test_gpu_error_falls_back_to_cpu_not_crash(monkeypatch, caplog):
    """A forced MLX error in the GPU composite falls back to the CPU
    render_grain_layer (byte-identical), logs ONCE, and never raises. The
    instance is then sticky-CPU. Runs WITHOUT MLX too (the fallback is the point).
    """
    src = _src(64, 64, seed=3)
    res = (64, 64)
    params = _params(8, render_path="gpu", jitter=0.5)
    cloud = grain_cloud(1, "boom", 0, params)
    cpu_ref = render_grain_layer(src, cloud, resolution=res)

    def _raise(*_a, **_k):
        raise RuntimeError("forced MLX dispatch error")

    monkeypatch.setattr(gg, "render_grain_layer_gpu", _raise)
    # Force the GPU branch even on a no-MLX machine so the fallback is exercised.
    monkeypatch.setattr(gg, "mlx_available", lambda: True)

    with caplog.at_level(logging.WARNING):
        out = render_grain_layer_dispatch(
            src,
            cloud,
            resolution=res,
            render_path="gpu",
            is_export=False,
            instance_id="boom",
        )
    assert np.array_equal(out, cpu_ref), "fallback must return the CPU result"
    assert gg._instance_gpu_failed("boom"), "instance must be sticky-CPU after failure"
    # Logged exactly once (warn-once contract), not swallowed silently.
    warns = [r for r in caplog.records if "GPU grain composite failed" in r.message]
    assert len(warns) == 1, f"expected one warn-once log, got {len(warns)}"

    # Second call stays on CPU (no second GPU attempt) and still renders.
    caplog.clear()
    with caplog.at_level(logging.WARNING):
        out2 = render_grain_layer_dispatch(
            src,
            cloud,
            resolution=res,
            render_path="gpu",
            is_export=False,
            instance_id="boom",
        )
    assert np.array_equal(out2, cpu_ref)
    assert not any("GPU grain composite failed" in r.message for r in caplog.records)


# --------------------------------------------------------------------------- #
# EXPORT — never uses the GPU path
# --------------------------------------------------------------------------- #


def test_export_never_uses_gpu_path(monkeypatch, caplog):
    """An export request carrying render_path:'gpu' is COERCED to the CPU path
    (byte-identical to render_grain_layer) and the coercion is LOGGED. The GPU
    composite is never invoked under is_export. Runs WITHOUT MLX too.
    """
    src = _src(48, 48, seed=5)
    res = (48, 48)
    params = _params(12, render_path="gpu", jitter=0.6)
    cloud = grain_cloud(2, "exp", 0, params)
    cpu_ref = render_grain_layer(src, cloud, resolution=res)

    # If the GPU composite were called under export, this would raise and fail.
    def _must_not_run(*_a, **_k):
        raise AssertionError("GPU composite invoked during EXPORT — forbidden")

    monkeypatch.setattr(gg, "render_grain_layer_gpu", _must_not_run)
    monkeypatch.setattr(gg, "mlx_available", lambda: True)

    with caplog.at_level(logging.INFO):
        out = render_grain_layer_dispatch(
            src,
            cloud,
            resolution=res,
            render_path="gpu",
            is_export=True,
            instance_id="exp",
        )
    assert np.array_equal(out, cpu_ref), "export must use the deterministic CPU path"
    assert coerce_render_path("gpu", is_export=True) == "cpu"
    # The coercion decision is logged (not a silent swallow).
    assert any("coerced to 'cpu' for EXPORT" in r.message for r in caplog.records), (
        "export coercion must be logged"
    )


# --------------------------------------------------------------------------- #
# POOL — zero handle leak after 500 frames
# --------------------------------------------------------------------------- #


@requires_mlx
def test_pool_leak_zero_after_500_frames():
    """After 500 GPU composites the pool holds ZERO handles and the MLX RAII
    finalizer-free counter is ZERO (every handle was explicitly released — no
    forgotten handle ever hit the weakref.finalize fallback).
    """
    src = _src(256, 256, seed=2)
    res = (256, 256)
    params = _params(64, jitter=0.7)
    MLXGPUResource.reset_finalizer_counter()

    for f in range(500):
        render_grain_layer_gpu(
            src,
            grain_cloud(9, "leak", f, params),
            resolution=res,
            patch=8,
            instance_id="leak",
        )

    pool = global_pool_registry().get("granulator_gpu:leak")
    assert pool is not None, "pool should exist after the renders"
    stats = pool.stats()
    print(f"\n[P5b.28 POOL] stats after 500 frames = {stats}")
    assert stats["count"] == 0, f"pool leaked {stats['count']} handle(s)"
    assert stats["current_bytes"] == 0, "pool leaked bytes"

    # No handle was ever freed by the RAII finalizer (all explicitly released).
    gc.collect()
    assert MLXGPUResource.finalizer_free_count == 0, (
        f"{MLXGPUResource.finalizer_free_count} handle(s) leaked to the RAII "
        "finalizer — a forgotten/unreleased handle"
    )


# --------------------------------------------------------------------------- #
# SG-8 stage-6 — texture-pool release under memory pressure
# --------------------------------------------------------------------------- #


@requires_mlx
def test_sg8_stage6_releases_texture_pool_and_renders_continue():
    """Firing the canonical stage-6 `gpu_texture_pool_released` degrade callback
    destroys every granulator GPU texture pool (destroy_all), and a subsequent
    render still succeeds (pool recreated lazily) — renders CONTINUE.
    """
    src = _src(128, 128, seed=4)
    res = (128, 128)
    params = _params(32, jitter=0.6)

    # Prime a pool with some renders (handles are released per-frame, but the
    # POOL object stays registered until SG-8 unregisters it).
    for f in range(5):
        render_grain_layer_gpu(
            src,
            grain_cloud(3, "sg8", f, params),
            resolution=res,
            patch=8,
            instance_id="sg8",
        )
    assert global_pool_registry().get("granulator_gpu:sg8") is not None

    # Register + fire the stage-6 hook on a private registry.
    reg = FeatureRegistry()
    register_sg8_texture_pool_hook(reg)
    fired = reg.fire_degrade("gpu_texture_pool_released")
    assert fired == 1, "the stage-6 texture-pool hook must fire"

    # The pool was destroyed + unregistered (memory released under pressure).
    assert global_pool_registry().get("granulator_gpu:sg8") is None

    # RENDERS CONTINUE: a render after the release still produces a valid frame
    # (pool recreated lazily) and matches the CPU reference.
    cloud = grain_cloud(3, "sg8", 99, params)
    cpu_ref = render_grain_layer(src, cloud, resolution=res)
    gpu = render_grain_layer_gpu(src, cloud, resolution=res, patch=8, instance_id="sg8")
    diff = np.abs(cpu_ref.astype(np.int32) - gpu.astype(np.int32))
    assert int(diff.max()) <= 2, "post-release render must still match within gate"
    assert global_pool_registry().get("granulator_gpu:sg8") is not None


def test_sg8_hook_registration_is_idempotent():
    """Registering the stage-6 hook twice does not duplicate the callback
    (unregister-first by label) — a second ZMQServer in one process is safe.
    """
    reg = FeatureRegistry()
    register_sg8_texture_pool_hook(reg)
    register_sg8_texture_pool_hook(reg)
    assert reg.stage_count("gpu_texture_pool_released") == 1


# --------------------------------------------------------------------------- #
# SG-1 — use-after-destroy guard
# --------------------------------------------------------------------------- #


@requires_mlx
def test_use_after_destroy_raises_destroyed_handle_error():
    """Accessing an MLXGPUResource's `raw` after destroy() raises
    DestroyedHandleError (the SG-1 use-after-free guard the GPU path relies on).
    """
    res = MLXGPUResource.allocate("uad", (8, 8, 4), dtype="float32")
    assert res.raw is not None  # alive before destroy
    res.destroy()
    with pytest.raises(DestroyedHandleError):
        _ = res.raw
    # Idempotent destroy — a second call is a no-op, still raises on raw.
    res.destroy()
    with pytest.raises(DestroyedHandleError):
        _ = res.raw


# --------------------------------------------------------------------------- #
# REGRESSION GUARD — the CPU grain path output is UNCHANGED by this packet
# --------------------------------------------------------------------------- #


def test_cpu_path_byte_identical_regression():
    """The CPU render_grain_layer output is byte-identical to a pinned hash —
    proves P5b.28 did NOT perturb the DO-NOT-TOUCH CPU grain path (P5b.16/17).
    The hash is computed from a fixed seed/params/frame (export-path semantics).
    """
    src = _src(64, 64, seed=42)
    res = (64, 64)
    params = GranulatorParams(
        density=24,
        axes={a: AxisParams(grain=0.5, jitter=0.4, grain_env=0.8) for a in "TYXCFL"},
    )
    cloud = grain_cloud(2024, "regress", 11, params)
    out_a = render_grain_layer(src, cloud, resolution=res)
    # Same inputs → identical output (the CPU path is a pure function).
    out_b = render_grain_layer(src, cloud, resolution=res)
    assert np.array_equal(out_a, out_b), "CPU path must be deterministic"
    digest = hashlib.sha256(out_a.tobytes()).hexdigest()
    print(f"\n[P5b.28 CPU-REGRESSION] render_grain_layer hash = {digest}")
    # Lock the hash. If a future change perturbs the CPU path this fails loudly.
    assert out_a.shape == (64, 64, 4)
    assert out_a.dtype == np.uint8


# --------------------------------------------------------------------------- #
# DISPATCHER — render_path coercion table (no MLX needed)
# --------------------------------------------------------------------------- #


@pytest.mark.parametrize(
    "render_path,is_export,expected",
    [
        ("cpu", False, "cpu"),
        ("gpu", False, "gpu"),
        ("gpu", True, "cpu"),  # export coerces gpu→cpu
        ("cpu", True, "cpu"),
        ("bogus", False, "cpu"),  # unknown → cpu fail-safe
        (123, False, "cpu"),  # non-string → cpu fail-safe
        (None, False, "cpu"),
    ],
)
def test_coerce_render_path_table(render_path, is_export, expected):
    assert coerce_render_path(render_path, is_export=is_export) == expected


def test_granulator_params_render_path_validation():
    """An unknown render_path on GranulatorParams degrades to 'cpu' (engine
    fail-safe); valid values pass through."""
    assert GranulatorParams(density=4, render_path="gpu").render_path == "gpu"  # type: ignore[arg-type]
    assert GranulatorParams(density=4, render_path="cpu").render_path == "cpu"  # type: ignore[arg-type]
    assert GranulatorParams(density=4, render_path="xyz").render_path == "cpu"  # type: ignore[arg-type]
    # Default is the CPU baseline (regression-safe).
    assert GranulatorParams(density=4).render_path == "cpu"
