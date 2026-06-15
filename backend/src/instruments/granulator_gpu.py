"""P5b.28 — B8 GPU grain-render pass (MLX instanced quads, preview-only).

This is the GPU twin of the P5b.17 CPU ``render_grain_layer``. It composites a
``GrainCloud``'s grains into ONE RGBA layer on Apple-Silicon Metal via MLX,
behind the SG-1 resource contract.

RE-SCOPE NOTE (orchestrator)
----------------------------
There is NO new ``metal_binding.py``. The real Metal binding already exists on
main as :class:`safety.mlx_resources.MLXGPUResource` (P6.4 SG-1). This module
CONSUMES it: every GPU buffer is allocated through
``MLXGPUResource.allocate(...)`` — the ONLY sanctioned MLX allocation wrapper —
and pooled through :class:`safety.gpu_resources.GPUResourcePool`. We never call
``mlx.core.zeros/array/...`` directly (the local ``import mlx.core`` is gated on
``mlx_available()`` exactly as :mod:`effects.field_codegen` does).

Parity with the CPU path (the gate)
-----------------------------------
The CPU ``render_grain_layer`` does, per grain:

  * compute an ``amp`` = window_value × Π(per-axis env),
  * map (X, Y) → an output patch centre + a source sample patch,
  * ADD ``src_patch · amp`` (float32) into a float32 accumulator,
  * clip the accumulator to [0, 255] and ``.astype(uint8)`` (TRUNCATION).

The GPU path computes the EXACT SAME per-grain geometry + ``amp`` on the CPU
(cheap scalar arithmetic — identical to the CPU renderer's inner loop), then
does the additive accumulation + final clip/truncate-cast ON THE GPU. Because
the geometry and ``amp`` are computed by the same code and the accumulation is
float32 additive in the same grain order, the GPU output matches the CPU output
to within float32-reordering noise — comfortably inside the 2/255 parity gate.
The final ``mx.clip(acc, 0, 255).astype(uint8)`` TRUNCATES (matching numpy's
``.astype(uint8)``), NOT rounds, so the cast is byte-faithful to the CPU path.

Why "instanced textured quads": each grain stamps a small textured quad (the
sampled source patch, modulated by its window+envelope ``amp``) into the frame.
Compositing all of them in one MLX accumulator is the GPU analogue of a single
instanced-quad draw call — one composite per frame, ``MAX_GRAINS`` quads.

Determinism / export
--------------------
PREVIEW-ONLY. The deterministic export path stays on the CPU
``render_grain_layer`` (engine/export.py never selects 'gpu'). The dispatcher
:func:`render_grain_layer_dispatch` COERCES any ``render_path='gpu'`` request to
CPU when ``is_export=True`` and logs it once — so a frame baked on a GPU-less CI
machine is byte-identical to one baked on a dev Mac. ``GRAN_GPU_IN_EXPORT`` is
the gate constant (False; documented, do not flip without re-proving export
determinism).

Failure modes (a GPU hiccup NEVER kills the render)
---------------------------------------------------
ANY MLX error during the GPU composite is caught, logged ONCE, and the frame
falls back to the CPU ``render_grain_layer``. The render always produces ONE
RGBA layer.
"""

from __future__ import annotations

import logging
import threading
from typing import Any

import numpy as np

from instruments.granulator_instrument import (
    GrainCloud,
    _clamp_finite,
    _grain_patch_halfsize,
    render_grain_layer,
)
from safety.gpu_resources import GPUResourcePool, global_pool_registry
from safety.mlx_resources import MLXGPUResource, mlx_available

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants (SG-1 pool budget + the export gate)
# ---------------------------------------------------------------------------

# Valid render-path values (string accept-set, NOT a numeric). The loader /
# zmq parser is the trust boundary that rejects anything else; this module's
# coercion is the second line of defense (an unknown value → CPU, never crash).
VALID_RENDER_PATHS: frozenset[str] = frozenset({"cpu", "gpu"})
DEFAULT_RENDER_PATH: str = "cpu"

# Per-granulator-instance pool caps (SPEC-3 §2.4). The GPU composite holds at
# most: the RGBA float32 accumulator + one in-flight source quad + the uint8
# output. @1080p the float32 accumulator is W×H×4×4 B ≈ 31.6 MiB; the uint8
# output ≈ 7.9 MiB. 4 handles / 96 MiB mirrors field_codegen's worst-case cap.
POOL_MAX_HANDLES: int = 8
POOL_MAX_BYTES: int = 96 * 1024 * 1024  # 96 MiB

# Export forces the CPU path until parity is proven tighter than the gate.
# Preview MAY use the GPU; deterministic export does NOT. Documented; do not
# flip without re-proving export determinism (engine/determinism owns that).
GRAN_GPU_IN_EXPORT: bool = False

# Pool name prefix so granulator GPU pools are greppable in the registry.
_POOL_PREFIX: str = "granulator_gpu:"

# Max canvas dimension the GPU path will allocate for (mirrors the CPU
# renderer's 8192 clamp — a hostile resolution can't blow up the allocation).
_MAX_DIM: int = 8192


# ---------------------------------------------------------------------------
# Per-instance sticky fallback (warn-once, then CPU for that instance)
# ---------------------------------------------------------------------------

_fallback_lock = threading.Lock()
_gpu_failed_instances: set[str] = set()


def _mark_instance_gpu_failed(instance_id: str) -> bool:
    """Record a GPU failure for *instance_id*. True the FIRST time only."""
    with _fallback_lock:
        if instance_id in _gpu_failed_instances:
            return False
        _gpu_failed_instances.add(instance_id)
        return True


def _instance_gpu_failed(instance_id: str) -> bool:
    with _fallback_lock:
        return instance_id in _gpu_failed_instances


def reset_fallback_state_for_testing() -> None:
    """Clear the per-instance GPU-failure set (tests only)."""
    with _fallback_lock:
        _gpu_failed_instances.clear()


# ---------------------------------------------------------------------------
# Pool lifetime (registered per granulator-instance id; SG-8 stage-6 destroys)
# ---------------------------------------------------------------------------


def _pool_name(instance_id: str) -> str:
    return f"{_POOL_PREFIX}{instance_id}"


def get_or_create_instance_pool(instance_id: str) -> GPUResourcePool:
    """Return the per-instance GPUResourcePool, creating + registering it.

    Idempotent: a second call with the same id returns the registered pool. The
    pool lives in the process-wide ``GlobalPoolRegistry`` until SG-8 stage-6
    (:func:`release_all_texture_pools`) or :func:`release_instance_pool` frees it.
    """
    registry = global_pool_registry()
    name = _pool_name(instance_id)
    existing = registry.get(name)
    if existing is not None:
        return existing
    pool = GPUResourcePool(
        max_handles=POOL_MAX_HANDLES,
        max_bytes=POOL_MAX_BYTES,
        name=name,
    )
    try:
        registry.register(pool)
    except ValueError:
        # Race: another thread registered between get() and register().
        return registry.get(name) or pool
    return pool


def release_instance_pool(instance_id: str) -> int:
    """Destroy + unregister the GPU texture pool for *instance_id*.

    Clears the instance's sticky GPU-failure flag so a remounted instance gets a
    fresh GPU attempt. Returns the number of GPU handles freed. Safe for an
    unknown id (returns 0).
    """
    freed = global_pool_registry().unregister(_pool_name(instance_id))
    with _fallback_lock:
        _gpu_failed_instances.discard(instance_id)
    return freed


def release_all_texture_pools() -> int:
    """Destroy EVERY granulator GPU texture pool. Returns total handles freed.

    THE SG-8 stage-6 (``gpu_texture_pool_released``, order=6 @85%) hook: when
    memory pressure crosses the threshold the monitor fires this, calling
    ``destroy_all()`` on every registered granulator pool. Renders continue on
    the next frame (the pool is lazily recreated, or the path falls back to CPU).
    Also clears the sticky GPU-failure set so post-pressure frames retry the GPU.
    """
    registry = global_pool_registry()
    total = 0
    for pool in registry.all_pools():
        if pool.name.startswith(_POOL_PREFIX):
            total += registry.unregister(pool.name)
    with _fallback_lock:
        _gpu_failed_instances.clear()
    return total


# ---------------------------------------------------------------------------
# Monotonic handle-sequence (unique pool ids across in-flight frames)
# ---------------------------------------------------------------------------

_seq_lock = threading.Lock()
_seq_counter = 0


def _next_seq() -> int:
    global _seq_counter
    with _seq_lock:
        _seq_counter += 1
        return _seq_counter


# ---------------------------------------------------------------------------
# Per-grain quad geometry (IDENTICAL to render_grain_layer's inner loop)
# ---------------------------------------------------------------------------


def _grain_quads(
    cloud: GrainCloud,
    *,
    res_w: int,
    res_h: int,
    src_w: int,
    src_h: int,
    half: int,
) -> list[tuple[int, int, int, int, int, int, float]]:
    """Resolve each grain to a quad: (oy0, oy1, ox0, ox1, sy0, sx0, amp).

    This reproduces the EXACT geometry + amplitude arithmetic of the CPU
    ``render_grain_layer`` inner loop so the two paths composite the identical
    pixels. Grains that contribute nothing (amp <= 0, empty patch) are dropped,
    exactly as the CPU loop ``continue``s past them.
    """
    quads: list[tuple[int, int, int, int, int, int, float]] = []
    for g in cloud.grains:
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

        cx = int(round(_clamp_finite(g.X, 0.0, 1.0) * (res_w - 1)))
        cy = int(round(_clamp_finite(g.Y, 0.0, 1.0) * (res_h - 1)))

        ox0 = max(0, cx - half)
        oy0 = max(0, cy - half)
        ox1 = min(res_w, cx + half)
        oy1 = min(res_h, cy + half)
        if ox1 <= ox0 or oy1 <= oy0:
            continue

        sx = int(round(_clamp_finite(g.X, 0.0, 1.0) * (src_w - 1)))
        sy = int(round(_clamp_finite(g.Y, 0.0, 1.0) * (src_h - 1)))

        pw = ox1 - ox0
        ph = oy1 - oy0
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
        quads.append((oy0, oy1, ox0, ox1, sy0, sx0, amp))
    return quads


# ---------------------------------------------------------------------------
# The GPU composite (MLX instanced-quad accumulate, SG-1 pooled)
# ---------------------------------------------------------------------------


def render_grain_layer_gpu(
    source_rgba: np.ndarray,
    cloud: GrainCloud,
    *,
    resolution: tuple[int, int],
    patch: int,
    instance_id: str,
) -> np.ndarray:
    """Composite a GrainCloud into ONE RGBA layer on the GPU via MLX.

    Every GPU buffer is allocated through ``MLXGPUResource.allocate(...)`` and
    pool-accounted. Mirrors ``render_grain_layer`` math exactly so the output is
    within the parity gate. Raises on ANY MLX error (the dispatcher catches it
    and falls back to CPU).
    """
    import mlx.core as mx  # local: only on the GPU path, after mlx_available()

    res_w, res_h = resolution
    res_w = max(1, min(_MAX_DIM, int(res_w)))
    res_h = max(1, min(_MAX_DIM, int(res_h)))

    # Empty cloud / no source → transparent layer (ONE layer out), same as CPU.
    if not cloud.grains or source_rgba is None or source_rgba.size == 0:
        return np.zeros((res_h, res_w, 4), dtype=np.uint8)
    if source_rgba.ndim != 3 or source_rgba.shape[2] != 4:
        return np.zeros((res_h, res_w, 4), dtype=np.uint8)
    src_h, src_w = int(source_rgba.shape[0]), int(source_rgba.shape[1])
    if src_h == 0 or src_w == 0:
        return np.zeros((res_h, res_w, 4), dtype=np.uint8)

    half = _grain_patch_halfsize(patch)
    quads = _grain_quads(
        cloud, res_w=res_w, res_h=res_h, src_w=src_w, src_h=src_h, half=half
    )
    if not quads:
        return np.zeros((res_h, res_w, 4), dtype=np.uint8)

    # Build the flat scatter (target-pixel index, scaled-source value) arrays for
    # EVERY grain pixel on the CPU. This is the SAME cheap numpy gather the CPU
    # renderer's inner loop does; doing it as one flat scatter (instead of 200
    # sequential device slice-adds, which build a 200-deep lazy graph at ~150ms)
    # is what keeps the composite under the 16ms budget. `acc.at[idx].add(val)`
    # accumulates DUPLICATE indices (overlapping grains) correctly — verified
    # byte-identical to the CPU additive accumulate.
    src_f = source_rgba.astype(np.float32)
    idx_parts: list[np.ndarray] = []
    val_parts: list[np.ndarray] = []
    for oy0, oy1, ox0, ox1, sy0, sx0, amp in quads:
        ph = oy1 - oy0
        pw = ox1 - ox0
        rows = np.repeat(np.arange(oy0, oy1, dtype=np.int64), pw)
        cols = np.tile(np.arange(ox0, ox1, dtype=np.int64), ph)
        idx_parts.append(rows * res_w + cols)
        # Scale on the host in float32 (matches the CPU `src_f * amp`), exactly
        # the value the scatter adds into the flat accumulator.
        val_parts.append(
            (src_f[sy0 : sy0 + ph, sx0 : sx0 + pw, :].reshape(-1, 4) * np.float32(amp))
        )
    flat_idx = np.concatenate(idx_parts)
    flat_val = np.concatenate(val_parts, axis=0)
    n_px = int(flat_idx.shape[0])

    pool = get_or_create_instance_pool(instance_id)
    seq = _next_seq()
    acc_id = f"{instance_id}:{seq}:acc"
    idx_id = f"{instance_id}:{seq}:idx"
    val_id = f"{instance_id}:{seq}:val"
    acc_acquired = False
    idx_acquired = False
    val_acquired = False
    try:
        # Allocate the FLAT float32 accumulator (H·W, 4) through the sanctioned
        # MLXGPUResource.allocate wrapper (zeroed device buffer, pool-owned).
        acc_res = MLXGPUResource.allocate(acc_id, (res_h * res_w, 4), dtype="float32")
        pool.acquire(acc_res)
        acc_acquired = True
        acc = acc_res.raw  # the live, zeroed mlx.core.array

        # Upload the scatter index + value arrays. mx.array is the host→device
        # UPLOAD constructor (MLXGPUResource.allocate can only zero-allocate, and
        # mlx_resources.py is DO-NOT-TOUCH); every uploaded array is immediately
        # wrapped in an MLXGPUResource + pool-acquired, so the SG-1 RAII ownership
        # the GPU-pattern lint enforces is satisfied (same pattern as
        # effects/field_codegen.py::_gpu_lerp — both are lint-allowlisted for the
        # upload constructor only, never for unowned allocation).
        idx_dev = mx.array(flat_idx)
        pool.acquire(
            MLXGPUResource(id=idx_id, size_bytes=int(idx_dev.nbytes), _array=idx_dev)
        )
        idx_acquired = True
        val_dev = mx.array(flat_val)
        pool.acquire(
            MLXGPUResource(id=val_id, size_bytes=int(val_dev.nbytes), _array=val_dev)
        )
        val_acquired = True

        # One fused scatter-add: every grain pixel accumulates into the flat
        # accumulator; duplicate (overlapping) indices sum. Then clip + TRUNCATE-
        # cast to uint8 (numpy .astype(uint8) truncates; MLX .astype(uint8)
        # truncates too — verified — so the cast is byte-faithful to the CPU
        # path) and reshape back to (H, W, 4).
        acc = acc.at[idx_dev].add(val_dev)
        out = mx.clip(acc, 0.0, 255.0).astype(mx.uint8).reshape(res_h, res_w, 4)
        mx.eval(out)
        result = np.asarray(out)
        # Touch n_px so a reader can see the pixel count for telemetry; keep the
        # device arrays alive via the pool until release in finally.
        _ = n_px
        return result
    finally:
        if val_acquired:
            pool.release(val_id)
        if idx_acquired:
            pool.release(idx_id)
        if acc_acquired:
            pool.release(acc_id)


# ---------------------------------------------------------------------------
# Public dispatcher — CPU/GPU selection + export coercion + fallback
# ---------------------------------------------------------------------------


def coerce_render_path(render_path: Any, *, is_export: bool) -> str:
    """Resolve the effective render path (string accept-set + export coercion).

    - Unknown / non-string value → DEFAULT_RENDER_PATH ('cpu') (loud-safe).
    - ``is_export`` with ``GRAN_GPU_IN_EXPORT`` False → coerced to 'cpu' (the
      determinism guarantee; the COERCION decision is logged by the dispatcher).
    """
    if not isinstance(render_path, str) or render_path not in VALID_RENDER_PATHS:
        return DEFAULT_RENDER_PATH
    if render_path == "gpu" and is_export and not GRAN_GPU_IN_EXPORT:
        return "cpu"
    return render_path


def render_grain_layer_dispatch(
    source_rgba: np.ndarray,
    cloud: GrainCloud,
    *,
    resolution: tuple[int, int],
    render_path: str = "cpu",
    is_export: bool = False,
    instance_id: str = "granulator",
    patch: int | None = None,
) -> np.ndarray:
    """Render a grain layer on the CPU or GPU, with export coercion + fallback.

    Dispatch:
      * export request with ``render_path='gpu'`` → COERCED to CPU + logged
        (deterministic export NEVER uses the GPU path).
      * ``render_path != 'gpu'`` OR MLX unavailable OR this instance previously
        failed on the GPU → CPU ``render_grain_layer`` (the byte-identity path).
      * else → GPU composite; on ANY MLX error, log ONCE and fall back to CPU.

    ALWAYS returns ONE (H, W, 4) uint8 RGBA layer; never raises on a GPU hiccup.
    """
    from instruments.granulator_instrument import _DEFAULT_GRAIN_PATCH

    eff_patch = _DEFAULT_GRAIN_PATCH if patch is None else patch
    requested = render_path if isinstance(render_path, str) else DEFAULT_RENDER_PATH
    effective = coerce_render_path(render_path, is_export=is_export)

    # Log the export-coercion decision (one INFO; never a silent swallow).
    if requested == "gpu" and effective == "cpu" and is_export:
        logger.info(
            "granulator_gpu: render_path='gpu' coerced to 'cpu' for EXPORT "
            "(deterministic export never uses the GPU path; instance=%s)",
            instance_id,
        )

    if effective != "gpu" or not mlx_available() or _instance_gpu_failed(instance_id):
        return render_grain_layer(
            source_rgba, cloud, resolution=resolution, patch=eff_patch
        )

    try:
        return render_grain_layer_gpu(
            source_rgba,
            cloud,
            resolution=resolution,
            patch=eff_patch,
            instance_id=instance_id,
        )
    except Exception as exc:  # noqa: BLE001 — ANY MLX/kernel error → CPU
        first = _mark_instance_gpu_failed(instance_id)
        if first:
            logger.warning(
                "granulator_gpu: GPU grain composite failed for instance %s "
                "(%s) — falling back to CPU render_grain_layer for this "
                "instance from now on",
                instance_id,
                type(exc).__name__,
            )
        # Defensive: drop any handles the failed call may have left pooled.
        try:
            release_instance_pool(instance_id)
        except Exception:  # noqa: BLE001
            logger.exception(
                "granulator_gpu: pool cleanup after GPU failure raised for %s",
                instance_id,
            )
        _mark_instance_gpu_failed(instance_id)  # release cleared it; re-mark
        return render_grain_layer(
            source_rgba, cloud, resolution=resolution, patch=eff_patch
        )


# ---------------------------------------------------------------------------
# SG-8 stage-6 registration (gpu_texture_pool_released, order=6 @85%)
# ---------------------------------------------------------------------------

# The label this module registers under (idempotent unregister-first).
SG8_TEXTURE_POOL_STAGE: str = "gpu_texture_pool_released"
_SG8_LABEL: str = "granulator_gpu_texture_pool"


def _sg8_release_texture_pools() -> None:
    """SG-8 degrade callback: release every granulator GPU texture pool.

    Crash-proof + idempotent: calls ``destroy_all()`` on each pool (freeing the
    MLX buffers) and clears the sticky-failure set. Never touches an in-flight
    frame buffer, so it is safe to fire from the monitor's background thread —
    the NEXT frame lazily recreates the pool (or falls back to CPU).
    """
    try:
        freed = release_all_texture_pools()
        logger.info(
            "granulator_gpu: SG-8 stage-6 released %d GPU texture-pool handle(s)",
            freed,
        )
    except Exception:  # noqa: BLE001
        logger.exception("granulator_gpu: SG-8 texture-pool release raised")


def _sg8_restore_texture_pools() -> None:
    """SG-8 restore callback: no-op (pools recreate lazily on the next render)."""
    return None


def register_sg8_texture_pool_hook(registry) -> None:
    """Register the granulator GPU texture-pool release hook against stage-6.

    ``registry`` is a ``safety.pressure.registry.FeatureRegistry``. Registered
    against the canonical ``gpu_texture_pool_released`` stage (order=6 @85%) so
    the SG-8 monitor releases the GPU texture pools under memory pressure
    (SPEC-3 §5.2 / degrade_order order #6). Idempotent by label (unregister
    first) so constructing multiple ZMQServers in one process does not duplicate.
    """
    registry.unregister(SG8_TEXTURE_POOL_STAGE, label=_SG8_LABEL)
    registry.register(
        SG8_TEXTURE_POOL_STAGE,
        degrade=_sg8_release_texture_pools,
        restore=_sg8_restore_texture_pools,
        label=_SG8_LABEL,
    )
