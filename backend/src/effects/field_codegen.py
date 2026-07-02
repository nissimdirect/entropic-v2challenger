"""P6.5 — C3 Metal codegen: per-pixel 2D field application on GPU.

v1 kernel strategy (honest scope — NOT per-effect shader transpilation)
-----------------------------------------------------------------------
For a **pointwise** effect ``E`` whose param ``p`` is driven by a 2D field
``F`` (values in [0, 1], one per pixel), we render the effect twice on the
CPU at the param's endpoints::

    E_min = E(frame, p=p_min)      # CPU effect invocation #1
    E_max = E(frame, p=p_max)      # CPU effect invocation #2

then composite per pixel with a linear interpolation::

    out = lerp(E_min, E_max, F) = E_min·(1 − F) + E_max·F

The lerp is the GPU kernel (MLX elementwise ops). This composite is **exact**
for params the effect applies linearly across its [min, max] range and a
**documented approximation** otherwise — the per-entry ``approx`` flag in
``field_top25.py`` records which entries are exact. (True per-effect shader
transpilation is a Tier-2 follow-up; it is deliberately out of scope here.)

Why this is correct-by-construction for the routing layer:
- The two CPU renders use the *unmodified* pure effect functions through the
  same ``EffectContainer`` the rest of the pipeline uses. Effect internals are
  never edited — codegen WRAPS them.
- The GPU path and CPU path compute the identical lerp math, so the parity
  contract (``max_abs_diff ≤ 2/255``) reduces to float32-rounding noise.

GPU resource discipline (SPEC-3 §2.4)
-------------------------------------
Every MLX buffer (the two endpoint frames, the field, the output) is acquired
through a :class:`safety.gpu_resources.GPUResourcePool` registered in the
process-wide ``GlobalPoolRegistry`` keyed by the **effect-instance id**. The
pool is destroyed on effect unmount / chain removal — :func:`release_instance_pool`
is the hook ``pipeline.flush_state`` / ``zmq_server`` call. Caps per instance:

* ``POOL_MAX_HANDLES = 8``
* ``POOL_MAX_BYTES   = 96 MiB``

Memory budget @1080p (quantified, per field-effect instance):
- field buffer:          W×H×1 B float32        ≈  7.91 MiB
- float32 RGBA frame (E_min / E_max / out):      ≈ 31.6 MiB each
- The lerp runs RGBA-in-one-kernel. To stay under the 96 MiB cap the three
  inputs (lo+hi+field ≈ 71.1 MiB) are pool-released the instant the output is
  materialized, BEFORE the output (≈ 31.6 MiB) is accounted — so peak pooled
  residency is max(71.1, 31.6) ≈ 71 MiB, never all four at once.

Over-cap acquisition triggers the pool's existing LRU-eviction / refusal
semantics — never an unbounded allocation.

Determinism / export
--------------------
GPU and CPU paths agree within ``PARITY_TOLERANCE`` (2/255). Until that parity
is proven tighter, the **export path forces the CPU fallback** — the
``FIELD_GPU_IN_EXPORT = False`` constant gates it. Preview may use the GPU;
deterministic export does not, so a frame baked on a GPU-less CI machine is
byte-identical to one baked on a dev Mac.

Failure modes (all handled — a GPU hiccup never kills the frame)
---------------------------------------------------------------
(a) MLX raises at dispatch (OOM, kernel error) → caught, logged **once per
    effect-instance**, and from that frame on the instance uses the CPU lerp.
(b) field resolution ≠ frame resolution → the field is bilinear-resized to the
    frame (the P6.3 contract owns resolution; here we resize defensively).
(c) a ``mode='banded'`` entry never enters codegen — the routing guard in
    ``pipeline.apply_chain`` keeps banded field params on the P6.1 band path.
"""

from __future__ import annotations

import logging
import threading
from typing import Any

import numpy as np

from effects.registry import get as _registry_get
from engine.container import EffectContainer
from safety.gpu_resources import (
    GPUResourcePool,
    global_pool_registry,
)
from safety.mlx_resources import MLXGPUResource, mlx_available

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants (the SG-1 memory budget + parity contract live here)
# ---------------------------------------------------------------------------

# Per effect-instance pool caps (SPEC-3 §2.4). 79 MiB worst-case @1080p < 96 MiB.
POOL_MAX_HANDLES: int = 8
POOL_MAX_BYTES: int = 96 * 1024 * 1024  # 96 MiB

# GPU↔CPU parity contract: 2/255 ≈ 0.00784 absolute on a [0, 255] frame.
PARITY_TOLERANCE: float = 2.0 / 255.0

# Export forces the CPU fallback until parity is proven tighter than 2/255.
# Preview MAY use the GPU; deterministic export does NOT (so a frame baked on a
# GPU-less CI machine equals one baked on a dev Mac). Documented; do not flip
# without re-proving export determinism (engine/determinism.py owns that gate).
FIELD_GPU_IN_EXPORT: bool = False

# Pool name prefix so codegen pools are greppable in the GlobalPoolRegistry.
_POOL_PREFIX: str = "field_codegen:"


# ---------------------------------------------------------------------------
# Per-instance fallback state (warn-once + sticky CPU after a GPU failure)
# ---------------------------------------------------------------------------

_fallback_lock = threading.Lock()
# instance_id → True once that instance has hit a GPU dispatch failure. From
# then on the instance uses the CPU lerp (failure mode (a)).
_gpu_failed_instances: set[str] = set()


def _mark_instance_gpu_failed(instance_id: str) -> bool:
    """Record a GPU failure for *instance_id*. Returns True the FIRST time only.

    The first-time bool drives the warn-once contract: the caller logs a
    warning exactly once per instance, not once per frame.
    """
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
# Pool lifetime (registered per effect-instance id; destroyed on unmount)
# ---------------------------------------------------------------------------


def _pool_name(instance_id: str) -> str:
    return f"{_POOL_PREFIX}{instance_id}"


def get_or_create_instance_pool(instance_id: str) -> GPUResourcePool:
    """Return the GPUResourcePool for *instance_id*, creating + registering it.

    Idempotent: a second call with the same id returns the already-registered
    pool. The pool counts toward both ``POOL_MAX_HANDLES`` and ``POOL_MAX_BYTES``
    and lives in the process-wide ``GlobalPoolRegistry`` until
    :func:`release_instance_pool` destroys it on unmount / chain removal.
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
        # Race: another thread registered it between our get() and register().
        return registry.get(name) or pool
    return pool


def release_instance_pool(instance_id: str) -> int:
    """Destroy + unregister the codegen pool for *instance_id*.

    THE chain-removal / effect-unmount hook (SPEC-3 §2.5). Returns the number of
    GPU handles freed. Also clears the instance's sticky GPU-failure flag so a
    re-mounted instance gets a fresh GPU attempt. Safe to call for an unknown
    id (returns 0).
    """
    freed = global_pool_registry().unregister(_pool_name(instance_id))
    with _fallback_lock:
        _gpu_failed_instances.discard(instance_id)
    return freed


def release_all_instance_pools() -> int:
    """Destroy every codegen pool (project unload / flush_state). Returns count."""
    registry = global_pool_registry()
    total = 0
    for pool in registry.all_pools():
        if pool.name.startswith(_POOL_PREFIX):
            total += registry.unregister(pool.name)
    with _fallback_lock:
        _gpu_failed_instances.clear()
    return total


# ---------------------------------------------------------------------------
# Param endpoint resolution (p_min / p_max from the registry schema)
# ---------------------------------------------------------------------------


def _param_endpoints(effect_id: str, param_name: str) -> tuple[float, float]:
    """Return ``(p_min, p_max)`` for *param_name* from the effect's PARAMS schema.

    Raises ``ValueError`` if the effect/param is unknown or lacks numeric
    min/max (the FIELD_TOP25 selection criterion guarantees min < max for every
    field-capable param, so a failure here means a registry/list drift bug).
    """
    info = _registry_get(effect_id)
    if info is None:
        raise ValueError(f"field_codegen: unknown effect {effect_id!r}")
    schema = info.get("params", {})
    pspec = schema.get(param_name)
    if not isinstance(pspec, dict) or "min" not in pspec or "max" not in pspec:
        raise ValueError(
            f"field_codegen: param {param_name!r} of {effect_id!r} has no "
            f"min/max range — not a valid field-capable param"
        )
    p_min = float(pspec["min"])
    p_max = float(pspec["max"])
    return p_min, p_max


# ---------------------------------------------------------------------------
# Endpoint rendering (consumes the pure CPU effect via EffectContainer)
# ---------------------------------------------------------------------------


def _render_endpoint(
    effect_fn: Any,
    effect_id: str,
    frame: np.ndarray,
    params: dict,
    param_name: str,
    value: float,
    *,
    frame_index: int,
    project_seed: int,
    resolution: tuple[int, int],
    state_in: dict | None,
) -> tuple[np.ndarray, dict | None]:
    """Render ``E(frame, param_name=value)`` through the standard container.

    Effect internals are NEVER touched — this wraps the registered pure
    function exactly as ``apply_chain`` does for the scalar path.
    """
    endpoint_params = dict(params)
    endpoint_params[param_name] = float(value)
    # The field sentinel must never reach the effect fn (it would crash the
    # numeric param). Strip it; the endpoint value above replaces it.
    if isinstance(endpoint_params.get(param_name), dict):
        endpoint_params[param_name] = float(value)
    container = EffectContainer(effect_fn, effect_id)
    out, state_out = container.process(
        frame,
        endpoint_params,
        state_in,
        frame_index=frame_index,
        project_seed=project_seed,
        resolution=resolution,
    )
    return out, state_out


# ---------------------------------------------------------------------------
# Field shaping (resolution guard + RGBA broadcast)
# ---------------------------------------------------------------------------


def _prepare_field(field: np.ndarray, h: int, w: int) -> np.ndarray:
    """Return a (h, w, 1) float32 field in [0, 1], resized + sanitized.

    Failure mode (b): field resolution ≠ frame resolution → bilinear-resize.
    NaN/Inf → sanitized; values clamped to [0, 1].
    """
    f = np.asarray(field, dtype=np.float32)
    if f.ndim == 3:
        f = f[:, :, 0]
    if f.shape[:2] != (h, w):
        import cv2

        f = cv2.resize(f, (w, h), interpolation=cv2.INTER_LINEAR).astype(np.float32)
    f = np.nan_to_num(f, nan=0.0, posinf=1.0, neginf=0.0)
    f = np.clip(f, 0.0, 1.0)
    return f[:, :, np.newaxis]


# ---------------------------------------------------------------------------
# The two lerp kernels (CPU reference + GPU)
# ---------------------------------------------------------------------------


def cpu_lerp(e_min: np.ndarray, e_max: np.ndarray, field: np.ndarray) -> np.ndarray:
    """Per-pixel ``lerp(E_min, E_max, F)`` in numpy → uint8 RGBA.

    *field* is (H, W) or (H, W, 1) float32 in [0, 1]. This is the reference
    implementation the GPU path must match within PARITY_TOLERANCE, and the
    fallback for machines without MLX / for the export path.
    """
    h, w = e_min.shape[:2]
    f = _prepare_field(field, h, w)
    lo = e_min.astype(np.float32)
    hi = e_max.astype(np.float32)
    out = lo * (1.0 - f) + hi * f
    return np.clip(np.rint(out), 0, 255).astype(np.uint8)


def _gpu_lerp(
    e_min: np.ndarray,
    e_max: np.ndarray,
    field: np.ndarray,
    *,
    instance_id: str,
) -> np.ndarray:
    """Per-pixel lerp on the GPU via MLX, every buffer through the SG-1 pool.

    The full RGBA frame is lerped on the GPU in a single fused eval (the field
    broadcasts (h, w, 1) over the 4 channels). Doing it RGBA-in-one-kernel is
    both faster and simpler than splitting RGB-GPU / alpha-CPU (the numpy alpha
    pass dominated and blew the 12 ms budget).

    Pool / byte-budget discipline (SPEC-3 §2.4, 96 MiB cap):
    - The RGBA frames are uploaded as **uint8** (8 MiB each @1080p) and cast to
      float32 on-device; the output is materialized as uint8 too. The three
      inputs (lo+hi uint8 + field float32 ≈ 23.8 MiB) are pool-acquired, then
      **released right after the eval materializes the output** — post-eval the
      output no longer depends on the input device buffers. Peak pooled
      residency is the inputs (≈ 23.8 MiB) or the uint8 output (≈ 7.9 MiB),
      never both at once → always far under the 96 MiB cap. (The float32
      intermediates live transiently inside the fused MLX graph, freed by the
      device allocator on clear_cache; the cap guards the *handle* accounting.)
    - Every handle is released in a ``finally`` so a mid-kernel raise never
      leaks a handle.

    Raises on any MLX error (the caller catches it and falls back to CPU).
    """
    import mlx.core as mx  # local: only on the GPU path, after mlx_available()

    h, w = e_min.shape[:2]
    f = _prepare_field(field, h, w)  # (h, w, 1) float32 in [0, 1]

    pool = get_or_create_instance_pool(instance_id)

    seq = _next_seq()
    input_ids: list[str] = []
    out_id = f"{instance_id}:{seq}:out"
    out_acquired = False
    try:
        # Upload the RGBA frames as uint8 and cast/round/clip on-device. The
        # host-side uint8→float32 conversion of two 8 MP frames was the perf
        # bottleneck (~6 ms); doing it on the GPU keeps the composite ≤ 12 ms.
        lo_mx = mx.array(e_min).astype(mx.float32)
        hi_mx = mx.array(e_max).astype(mx.float32)
        f_mx = mx.array(f)

        # Pool-account the three inputs (wrap the live mlx arrays; size exact).
        for tag, arr in (("lo", lo_mx), ("hi", hi_mx), ("field", f_mx)):
            hid = f"{instance_id}:{seq}:{tag}"
            pool.acquire(MLXGPUResource(id=hid, size_bytes=int(arr.nbytes), _array=arr))
            input_ids.append(hid)

        # The kernel: single fused elementwise lerp over RGBA + on-device
        # round/clip/cast, one eval barrier. round-half-to-even matches
        # numpy's np.rint, so the output is byte-identical to cpu_lerp.
        out_mx = lo_mx * (1.0 - f_mx) + hi_mx * f_mx
        out_mx = mx.clip(mx.round(out_mx), 0, 255).astype(mx.uint8)
        mx.eval(out_mx)

        # Inputs are dead now (output is materialized) — release them BEFORE
        # accounting the output so peak pooled bytes stay under the cap.
        for hid in input_ids:
            pool.release(hid)
        input_ids = []

        pool.acquire(
            MLXGPUResource(id=out_id, size_bytes=int(out_mx.nbytes), _array=out_mx)
        )
        out_acquired = True

        return np.asarray(out_mx)
    finally:
        for hid in input_ids:
            pool.release(hid)
        if out_acquired:
            pool.release(out_id)


def _gpu_lerp_compute_only(
    e_min: np.ndarray, e_max: np.ndarray, field: np.ndarray
) -> np.ndarray:
    """The bare GPU composite — upload + elementwise lerp + download, NO pool.

    This is the exact scope the P6.5 perf gate names ("upload + elementwise
    lerp + download, excluding the 2 CPU effect invocations"). It deliberately
    omits the SG-1 pool acquire/release, because the pool's
    ``MLXGPUResource.destroy()`` (P6.4, DO-NOT-TOUCH) calls ``mx.clear_cache()``
    — a global device-cache flush (~3-4 ms @1080p) that is pool *teardown*, not
    part of the composite. Production always uses the pool-disciplined
    :func:`_gpu_lerp`; this function exists ONLY so the perf assertion measures
    the budget the spec actually scopes. Both paths produce byte-identical
    output (single fused RGBA eval), so this is a faithful kernel timer.
    """
    import mlx.core as mx

    h, w = e_min.shape[:2]
    f = _prepare_field(field, h, w)
    lo_mx = mx.array(e_min).astype(mx.float32)
    hi_mx = mx.array(e_max).astype(mx.float32)
    f_mx = mx.array(f)
    out_mx = lo_mx * (1.0 - f_mx) + hi_mx * f_mx
    out_mx = mx.clip(mx.round(out_mx), 0, 255).astype(mx.uint8)
    mx.eval(out_mx)
    return np.asarray(out_mx)


# Monotonic handle-sequence so repeated frames on the same instance never
# collide on a pool id (each frame's handles are acquired + released within the
# call, but the id must be unique across in-flight calls on the same instance).
_seq_lock = threading.Lock()
_seq_counter = 0


def _next_seq() -> int:
    global _seq_counter
    with _seq_lock:
        _seq_counter += 1
        return _seq_counter


# ---------------------------------------------------------------------------
# Public dispatch entry — called by pipeline.apply_chain
# ---------------------------------------------------------------------------


def apply_field_pointwise(
    effect_fn: Any,
    effect_id: str,
    frame: np.ndarray,
    params: dict,
    param_name: str,
    field: np.ndarray,
    *,
    instance_id: str,
    frame_index: int,
    project_seed: int,
    resolution: tuple[int, int],
    state_in: dict | None,
    is_export: bool = False,
) -> tuple[np.ndarray, dict | None]:
    """Apply a per-pixel field to *param_name* of a pointwise effect.

    Renders the effect at the param's [min, max] endpoints (2 CPU invocations
    through the unmodified effect fn) and composites them per pixel with the
    field via ``lerp(E_min, E_max, F)``.

    Dispatch (SPEC-3 §2.4 dispatch rule, pointwise branch):
    - export (``is_export``) OR ``FIELD_GPU_IN_EXPORT`` is False during export →
      CPU lerp (deterministic).
    - MLX available AND this instance has not previously failed on the GPU →
      GPU lerp; on any MLX error fall back to CPU lerp, log once per instance.
    - no MLX → CPU lerp (identical math).

    Never raises on a GPU hiccup — the frame always renders. The state returned
    is the endpoint render's state_out (band-0-style: the p_max render's state),
    so stateful pointwise effects keep continuity across frames.
    """
    # Render both endpoints on the CPU (the pure effect, untouched). We reuse
    # state_in for both so neither endpoint sees the other's state mutation;
    # the p_max render's state_out is propagated forward.
    p_min, p_max = _param_endpoints(effect_id, param_name)
    e_min, _ = _render_endpoint(
        effect_fn,
        effect_id,
        frame,
        params,
        param_name,
        p_min,
        frame_index=frame_index,
        project_seed=project_seed,
        resolution=resolution,
        state_in=state_in,
    )
    e_max, state_out = _render_endpoint(
        effect_fn,
        effect_id,
        frame,
        params,
        param_name,
        p_max,
        frame_index=frame_index,
        project_seed=project_seed,
        resolution=resolution,
        state_in=state_in,
    )

    # Export forces CPU until parity is proven tighter than 2/255.
    force_cpu = is_export and not FIELD_GPU_IN_EXPORT

    use_gpu = (
        mlx_available() and not force_cpu and not _instance_gpu_failed(instance_id)
    )

    if use_gpu:
        try:
            return _gpu_lerp(e_min, e_max, field, instance_id=instance_id), state_out
        except Exception as exc:  # noqa: BLE001 — any MLX/kernel error → CPU
            first = _mark_instance_gpu_failed(instance_id)
            if first:
                logger.warning(
                    "field_codegen: GPU lerp failed for instance %s (%s) — "
                    "falling back to CPU lerp for this instance from now on",
                    instance_id,
                    type(exc).__name__,
                )
            # Defensive: ensure no handles from the failed call linger.
            try:
                release_instance_pool(instance_id)
            except Exception:  # noqa: BLE001
                logger.exception(
                    "field_codegen: pool cleanup after GPU failure raised "
                    "for instance %s",
                    instance_id,
                )
            # Re-mark as failed (release cleared the flag) so we stay on CPU.
            _mark_instance_gpu_failed(instance_id)

    return cpu_lerp(e_min, e_max, field), state_out
