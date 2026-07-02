"""SG-1 GPU resource lifetime contract (SPEC-3 §2).

Every Metal handle (texture, buffer, sampler, pipeline state, command
queue/buffer, render encoder) is owned by an RAII wrapper at allocation
time. Wrappers expose `destroy()` for explicit free; a `weakref.finalize`
RAII fallback catches the unowned/forgotten case at GC time and ALWAYS
frees the underlying resource (logging a WARNING so the leak is visible
in dev).

A texture pool with LRU eviction prevents unbounded GPU memory growth
during codegen paths (Vision Tier 2 C2/C3 per-pixel field shaders, A4
spectral effects, B7 RIFE, B8 Granulator).

**This module is BACKEND-AGNOSTIC.** It ships the Protocol + generic
pool + tests against a MockGPUResource. The real Metal/MLX binding (the
actual `MTLTexture`/`MTLBuffer` underlying handles) lands in the first
Tier 2 effect PR that needs Metal; the RAII + use-after-destroy
semantics here are the contract that binding must satisfy.

Forbidden patterns (enforced by code review until the AST lint follow-up):
- Raw `MTLDevice.makeTexture()` outside a wrapper
- Unowned handles passed as function arguments
- Module-level Metal objects (no clear ownership)
"""

from __future__ import annotations

import logging
import threading
import weakref
from collections import OrderedDict
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, ClassVar, Optional, Protocol, runtime_checkable

logger = logging.getLogger(__name__)


class EvictionPolicy(str, Enum):
    LRU = "lru"  # least-recently-used eviction when pool full
    FAIL = "fail"  # raise PoolExhausted instead of evicting


class PoolExhausted(Exception):
    """Raised when a pool is full and policy=FAIL."""


class DestroyedHandleError(RuntimeError):
    """Raised on any access to the underlying handle after `destroy()`.

    SPEC-3 §2.3: the `raw` accessor "throws if destroyed". Catching
    use-after-free at the wrapper boundary turns a silent GPU fault (or
    worse, a reused-then-corrupted texture) into a loud, traceable error.
    """

    def __init__(self, resource_id: str):
        self.resource_id = resource_id
        super().__init__(
            f"GPU handle {resource_id!r} accessed after destroy() — "
            "use-after-free guarded by SG-1"
        )


@runtime_checkable
class GPUResource(Protocol):
    """Structural type every Metal handle wrapper implements.

    Real implementations (first Tier 2 effect PR + later) hold MTLDevice
    children. This module ships a Mock that satisfies the Protocol
    without Metal — that's enough to test the full lifecycle, including
    the RAII finalizer fallback and use-after-destroy guard.
    """

    id: str

    def destroy(self) -> None:
        """Idempotent free. Subsequent calls + `destroyed` are no-ops."""
        ...

    @property
    def destroyed(self) -> bool: ...

    @property
    def size_bytes(self) -> int: ...

    @property
    def raw(self) -> Any:
        """The underlying GPU object. Raises DestroyedHandleError if freed."""
        ...


# Module-level free function used by `weakref.finalize`. It must NOT close
# over the wrapper instance (that would be a strong ref → the finalizer
# could never fire). It captures only the plain payload: the id, a shared
# mutable `state` dict (so explicit destroy can mark itself done), and the
# raw underlying handle to release. `triggered_by_gc=True` means the
# wrapper was garbage-collected without an explicit destroy() — a leak we
# clean up but loudly warn about.
def _finalize_gpu_resource(
    resource_id: str,
    state: dict,
    raw_handle: Any,
    on_finalizer_free: Optional[Callable[[str], None]],
) -> None:
    if state.get("freed"):
        # Explicit destroy() already ran and detached us — but detach is
        # best-effort across interpreters, so double-guard here.
        return
    state["freed"] = True
    state["freed_by_finalizer"] = True
    logger.warning(
        "SG-1 RAII finalizer freed GPU handle %s that was never explicitly "
        "destroy()'d — forgotten/unowned handle (this is a leak; free it "
        "explicitly or via a pool)",
        resource_id,
    )
    # Release the real underlying resource here. For the mock it's a no-op;
    # for the Metal binding this is where `mtl_texture.setPurgeableState_`
    # / release happens.
    _release_raw_handle(raw_handle)
    if on_finalizer_free is not None:
        try:
            on_finalizer_free(resource_id)
        except Exception:  # noqa: BLE001
            logger.exception("finalizer-free hook raised for %s", resource_id)


def _release_raw_handle(raw_handle: Any) -> None:
    """Release a real underlying GPU handle. No-op for mocks / None."""
    release = getattr(raw_handle, "release", None)
    if callable(release):
        try:
            release()
        except Exception:  # noqa: BLE001
            logger.exception("raw handle release raised")


@dataclass
class MockGPUResource:
    """Minimal stand-in for tests. Tracks destroy + size; no real Metal.

    Carries a real `weakref.finalize` RAII fallback so the lifecycle test
    exercises the SAME code path the Metal binding will use: if an
    instance is dropped without `destroy()`, the finalizer fires at GC,
    frees, and increments a class-level counter so tests can assert the
    forgotten-handle guarantee.
    """

    # Class-level counter: how many handles were freed by the finalizer
    # (i.e. forgotten, never explicitly destroyed). Tests read + reset it.
    # ClassVar so the dataclass does NOT treat it as an instance field.
    finalizer_free_count: ClassVar[int] = 0

    id: str
    size_bytes: int
    _destroyed: bool = field(default=False, init=False, repr=False)
    _destroy_callbacks: list[Callable[["MockGPUResource"], None]] = field(
        default_factory=list, init=False, repr=False
    )
    # Shared mutable state between the instance and its detached finalizer.
    _state: dict = field(default_factory=dict, init=False, repr=False)
    _finalizer: Any = field(default=None, init=False, repr=False)
    # Stand-in for the underlying MTLTexture/MTLBuffer. None for the mock.
    _raw: Any = field(default=None, init=False, repr=False)

    def __post_init__(self) -> None:
        self._state = {"freed": False, "freed_by_finalizer": False}
        # Register the RAII fallback. Note: passes only plain payload +
        # a classmethod hook (bound to the class, not the instance) so no
        # strong ref to `self` is captured.
        self._finalizer = weakref.finalize(
            self,
            _finalize_gpu_resource,
            self.id,
            self._state,
            self._raw,
            type(self)._on_finalizer_free,
        )

    @classmethod
    def _on_finalizer_free(cls, _resource_id: str) -> None:
        cls.finalizer_free_count += 1

    @classmethod
    def reset_finalizer_counter(cls) -> None:
        cls.finalizer_free_count = 0

    def destroy(self) -> None:
        if self._destroyed:
            return
        self._destroyed = True
        # Mark + detach the finalizer FIRST so an explicit destroy never
        # double-frees or trips the forgotten-handle warning.
        self._state["freed"] = True
        if self._finalizer is not None:
            self._finalizer.detach()
        _release_raw_handle(self._raw)
        for cb in list(self._destroy_callbacks):
            try:
                cb(self)
            except Exception:  # noqa: BLE001
                logger.exception("destroy callback raised for %s", self.id)
        self._destroy_callbacks.clear()

    @property
    def destroyed(self) -> bool:
        return self._destroyed

    @property
    def raw(self) -> Any:
        """Accessor for the underlying handle. Throws once destroyed.

        SPEC-3 §2.3: "throws if destroyed". For the mock the underlying
        object is a sentinel; the point is the guard, not the payload.
        """
        if self._destroyed:
            raise DestroyedHandleError(self.id)
        return self._raw

    def freed_by_finalizer(self) -> bool:
        """True if the RAII finalizer (not an explicit destroy) freed this."""
        return bool(self._state.get("freed_by_finalizer"))

    def on_destroy(self, callback: Callable[["MockGPUResource"], None]) -> None:
        if self._destroyed:
            callback(self)
        else:
            self._destroy_callbacks.append(callback)


class GPUResourcePool:
    """Bounded GPU-handle pool with LRU eviction.

    Thread-safe. Tracks handles by id; counts toward `max_handles` AND
    `max_bytes`. Eviction removes oldest non-pinned handles first;
    `pin(id)` marks a handle as ineligible for eviction (e.g., currently
    in flight on the GPU command queue).
    """

    def __init__(
        self,
        *,
        max_handles: int = 32,
        max_bytes: Optional[int] = None,
        eviction_policy: EvictionPolicy = EvictionPolicy.LRU,
        name: str = "default",
    ):
        if max_handles < 1:
            raise ValueError(f"max_handles must be >= 1, got {max_handles}")
        if max_bytes is not None and max_bytes < 1:
            raise ValueError(f"max_bytes must be >= 1 or None, got {max_bytes}")

        self.max_handles = max_handles
        self.max_bytes = max_bytes
        self.eviction_policy = eviction_policy
        self.name = name

        # OrderedDict gives us LRU naturally: most-recent at the right end.
        self._handles: OrderedDict[str, GPUResource] = OrderedDict()
        self._pinned: set[str] = set()
        self._lock = threading.RLock()
        self._evictions = 0

    def acquire(self, resource: GPUResource) -> None:
        """Register a freshly-allocated handle. Evicts to make room."""
        with self._lock:
            if resource.id in self._handles:
                raise ValueError(
                    f"resource id={resource.id!r} already in pool {self.name!r}"
                )
            self._make_room_for(resource)
            self._handles[resource.id] = resource

    def release(self, resource_id: str) -> bool:
        """Mark a handle as freed + destroy it. Returns True if removed."""
        with self._lock:
            if resource_id not in self._handles:
                return False
            resource = self._handles.pop(resource_id)
            self._pinned.discard(resource_id)
        resource.destroy()
        return True

    def touch(self, resource_id: str) -> None:
        """Mark a handle as recently-used (moves to LRU tail)."""
        with self._lock:
            if resource_id in self._handles:
                self._handles.move_to_end(resource_id)

    def pin(self, resource_id: str) -> None:
        """Mark a handle as ineligible for eviction."""
        with self._lock:
            if resource_id not in self._handles:
                raise KeyError(f"resource {resource_id!r} not in pool {self.name!r}")
            self._pinned.add(resource_id)

    def unpin(self, resource_id: str) -> None:
        with self._lock:
            self._pinned.discard(resource_id)

    def get(self, resource_id: str) -> Optional[GPUResource]:
        """Return handle if present (touches it; does NOT pin)."""
        with self._lock:
            if resource_id not in self._handles:
                return None
            self._handles.move_to_end(resource_id)
            return self._handles[resource_id]

    def is_pinned(self, resource_id: str) -> bool:
        with self._lock:
            return resource_id in self._pinned

    def destroy_all(self) -> int:
        """Free every handle in the pool. Returns count freed."""
        with self._lock:
            handles = list(self._handles.values())
            self._handles.clear()
            self._pinned.clear()
        for h in handles:
            h.destroy()
        return len(handles)

    def stats(self) -> dict:
        with self._lock:
            return {
                "name": self.name,
                "count": len(self._handles),
                "pinned_count": len(self._pinned),
                "max_handles": self.max_handles,
                "max_bytes": self.max_bytes,
                "current_bytes": sum(h.size_bytes for h in self._handles.values()),
                "eviction_policy": self.eviction_policy.value,
                "evictions": self._evictions,
            }

    def _current_bytes(self) -> int:
        return sum(h.size_bytes for h in self._handles.values())

    def _make_room_for(self, resource: GPUResource) -> None:
        """Evict until room available, or raise PoolExhausted."""
        while len(self._handles) >= self.max_handles or (
            self.max_bytes is not None
            and self._current_bytes() + resource.size_bytes > self.max_bytes
        ):
            if self.eviction_policy == EvictionPolicy.FAIL:
                raise PoolExhausted(
                    f"pool {self.name!r} full: {len(self._handles)}/{self.max_handles} "
                    f"handles, {self._current_bytes()}B / {self.max_bytes}B"
                )
            evicted = self._evict_lru()
            if evicted is None:
                # No non-pinned candidates → can't evict
                raise PoolExhausted(f"pool {self.name!r} full and all handles pinned")

    def _evict_lru(self) -> Optional[GPUResource]:
        """Evict the oldest non-pinned handle. Returns the evicted resource or None."""
        for resource_id in list(self._handles.keys()):
            if resource_id in self._pinned:
                continue
            resource = self._handles.pop(resource_id)
            self._evictions += 1
            logger.info(
                "SG-1 pool %s: evicted %s (size=%dB)",
                self.name,
                resource_id,
                resource.size_bytes,
            )
            try:
                resource.destroy()
            except Exception:  # noqa: BLE001
                logger.exception("destroy raised during eviction for %s", resource_id)
            return resource
        return None


class GlobalPoolRegistry:
    """Process-wide registry of named pools (e.g., one per effect instance).

    Effects register their pool on mount; unmount destroys the pool +
    all its handles. SG-8 (PR #11) can iterate pools to release GPU
    memory during pressure.
    """

    def __init__(self) -> None:
        self._pools: dict[str, GPUResourcePool] = {}
        self._lock = threading.RLock()

    def register(self, pool: GPUResourcePool) -> None:
        with self._lock:
            if pool.name in self._pools:
                raise ValueError(f"pool {pool.name!r} already registered")
            self._pools[pool.name] = pool

    def unregister(self, name: str) -> int:
        """Destroy + remove a registered pool. Returns count of freed handles."""
        with self._lock:
            pool = self._pools.pop(name, None)
        if pool is None:
            return 0
        return pool.destroy_all()

    def get(self, name: str) -> Optional[GPUResourcePool]:
        with self._lock:
            return self._pools.get(name)

    def all_pools(self) -> list[GPUResourcePool]:
        with self._lock:
            return list(self._pools.values())

    def total_handles(self) -> int:
        return sum(len(p._handles) for p in self.all_pools())

    def total_bytes(self) -> int:
        return sum(p._current_bytes() for p in self.all_pools())

    def destroy_all(self) -> int:
        """Free every handle in every pool. Returns total count."""
        freed = 0
        for pool in self.all_pools():
            freed += pool.destroy_all()
        return freed


# Module-level singleton — effects import this directly
_GLOBAL: Optional[GlobalPoolRegistry] = None


def global_pool_registry() -> GlobalPoolRegistry:
    global _GLOBAL
    if _GLOBAL is None:
        _GLOBAL = GlobalPoolRegistry()
    return _GLOBAL


def reset_global_pool_registry_for_testing() -> None:
    global _GLOBAL
    _GLOBAL = None
