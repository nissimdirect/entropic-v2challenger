"""SG-1 real Metal binding via MLX (SPEC-3 §2, gap 6 of PR #163).

`MLXGPUResource` is the first concrete `GPUResource` backed by real GPU
memory: it wraps an `mlx.core.array` (a unified-memory buffer on
Apple-Silicon Metal). It satisfies the exact same lifetime contract the
generic pool + `MockGPUResource` already test:

- `destroy()` is idempotent, drops the array reference, and calls
  `mlx.core.clear_cache()` so the Metal allocator can reclaim the freed
  buffers (MLX caches device allocations; without the cache flush the
  RSS-stability gate would see retained memory).
- `raw` raises `DestroyedHandleError` after `destroy()` — the
  use-after-free guard SG-1 exists for.
- A `weakref.finalize` RAII fallback fires at GC for forgotten handles
  using the SAME module-level `_finalize_gpu_resource` payload-only
  function as the mock (that shared code path was #163's design intent).

MLX is import-guarded so non-Apple CI never breaks. `mlx_available()`
reports whether the backend is present; constructing `MLXGPUResource`
without MLX raises a clean `MLXUnavailableError` (no traceback leakage).
"""

from __future__ import annotations

import logging
import weakref
from dataclasses import dataclass, field
from typing import Any, Callable, ClassVar, Optional

from safety.gpu_resources import (
    DestroyedHandleError,
    GPUResource,
    _finalize_gpu_resource,
    _release_raw_handle,
)

logger = logging.getLogger(__name__)


# Import-guard MLX exactly once at module load. Non-Apple / headless CI
# has no MLX wheel; we must degrade to a clean boolean, never an import
# traceback at call sites.
try:
    import mlx.core as _mx  # type: ignore

    _MLX_IMPORT_ERROR: Optional[BaseException] = None
except Exception as exc:  # noqa: BLE001 — ImportError on non-Apple, RuntimeError if Metal absent
    _mx = None  # type: ignore
    _MLX_IMPORT_ERROR = exc


class MLXUnavailableError(RuntimeError):
    """Raised when an `MLXGPUResource` is constructed but MLX is absent.

    Callers that gate on `mlx_available()` first never hit this; it exists
    so a forgotten guard surfaces loudly instead of as an `AttributeError`
    on the `None` module.
    """

    def __init__(self) -> None:
        super().__init__(
            "MLX (mlx.core) is not available in this environment — "
            "cannot allocate a real Metal GPU buffer. Gate on "
            "mlx_resources.mlx_available() before constructing "
            "MLXGPUResource, or use MockGPUResource for non-GPU paths."
        )


def mlx_available() -> bool:
    """True iff the MLX Metal backend imported cleanly."""
    return _mx is not None


# Map a small set of dtype names to byte widths so `size_bytes` is exact
# (dtype itemsize × element count) without depending on numpy. MLX dtypes
# expose `.size` in recent builds, but we compute defensively from a table
# to keep the contract stable across MLX versions.
_DTYPE_BYTES: dict[str, int] = {
    "float32": 4,
    "float16": 2,
    "bfloat16": 2,
    "float64": 8,
    "int8": 1,
    "uint8": 1,
    "int16": 2,
    "uint16": 2,
    "int32": 4,
    "uint32": 4,
    "int64": 8,
    "uint64": 8,
    "complex64": 8,
    "bool_": 1,
    "bool": 1,
}


def _dtype_itemsize(dtype: Any) -> int:
    """Bytes-per-element for an MLX dtype, defensively across versions."""
    # Newer MLX exposes `.size` (itemsize in bytes) directly.
    size = getattr(dtype, "size", None)
    if isinstance(size, int) and size > 0:
        return size
    name = str(dtype).rsplit(".", 1)[-1]  # "mlx.core.float32" -> "float32"
    return _DTYPE_BYTES.get(name, 4)


@dataclass
class MLXGPUResource:
    """Real Metal-backed `GPUResource`: owns one `mlx.core.array`.

    Construct via :meth:`allocate` (the normal path — allocates a zeroed
    unified-memory buffer of a given shape/dtype) or wrap an existing
    array via the constructor's `_array` for advanced cases.

    Lifetime semantics are identical to `MockGPUResource`: idempotent
    `destroy()`, `raw` throws after destroy, and a `weakref.finalize`
    RAII fallback frees forgotten handles at GC while logging a WARNING.
    """

    # Class-level counter mirroring MockGPUResource so leak tests can
    # assert the forgotten-handle guarantee against the real backend too.
    finalizer_free_count: ClassVar[int] = 0

    id: str
    size_bytes: int
    _array: Any = field(default=None, repr=False)
    _destroyed: bool = field(default=False, init=False, repr=False)
    _destroy_callbacks: list[Callable[["MLXGPUResource"], None]] = field(
        default_factory=list, init=False, repr=False
    )
    _state: dict = field(default_factory=dict, init=False, repr=False)
    _finalizer: Any = field(default=None, init=False, repr=False)

    def __post_init__(self) -> None:
        if not mlx_available():
            raise MLXUnavailableError()
        self._state = {"freed": False, "freed_by_finalizer": False}
        # Register the RAII fallback with the SAME payload-only function
        # the mock uses. We pass `self._array` as the raw handle: MLX
        # arrays have no `.release()`, so `_release_raw_handle` is a no-op
        # on them — actual reclamation is the dropped reference + the
        # clear_cache() in destroy(). The finalizer guarantees the
        # reference is dropped even for forgotten handles.
        self._finalizer = weakref.finalize(
            self,
            _finalize_gpu_resource,
            self.id,
            self._state,
            None,  # raw_handle: nothing with .release(); ref-drop frees it
            type(self)._on_finalizer_free,
        )

    @classmethod
    def allocate(
        cls,
        resource_id: str,
        shape: tuple[int, ...],
        dtype: str = "float32",
    ) -> "MLXGPUResource":
        """Allocate a zeroed unified-memory buffer of `shape`/`dtype`.

        This is THE wrapper through which raw `mlx.core` allocations are
        permitted (the AST lint allowlists exactly this module). Effects
        must never call `mlx.core.zeros/array/...` directly.
        """
        if not mlx_available():
            raise MLXUnavailableError()
        mx_dtype = getattr(_mx, dtype)
        arr = _mx.zeros(shape, dtype=mx_dtype)
        # Force materialization so the buffer is really allocated now (MLX
        # is lazy); otherwise the leak test would measure deferred work.
        _mx.eval(arr)
        itemsize = _dtype_itemsize(mx_dtype)
        count = 1
        for d in shape:
            count *= int(d)
        return cls(id=resource_id, size_bytes=itemsize * count, _array=arr)

    @classmethod
    def _on_finalizer_free(cls, _resource_id: str) -> None:
        cls.finalizer_free_count += 1
        # A forgotten real buffer: the array reference is dropped with the
        # wrapper, but the MLX allocator may still cache the device pages.
        # Flush so RSS actually returns toward baseline for leak tests.
        if _mx is not None:
            try:
                _mx.clear_cache()
            except Exception:  # noqa: BLE001
                logger.exception("mlx.clear_cache() raised in finalizer")

    @classmethod
    def reset_finalizer_counter(cls) -> None:
        cls.finalizer_free_count = 0

    def destroy(self) -> None:
        if self._destroyed:
            return
        self._destroyed = True
        # Mark + detach FIRST so an explicit destroy never double-frees or
        # trips the forgotten-handle warning (mirrors MockGPUResource).
        self._state["freed"] = True
        if self._finalizer is not None:
            self._finalizer.detach()
        _release_raw_handle(self._array)
        # Drop the buffer reference, then let MLX reclaim its device cache.
        self._array = None
        if _mx is not None:
            try:
                _mx.clear_cache()
            except Exception:  # noqa: BLE001
                logger.exception("mlx.clear_cache() raised in destroy")
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
        """The underlying `mlx.core.array`. Raises once destroyed."""
        if self._destroyed:
            raise DestroyedHandleError(self.id)
        return self._array

    def freed_by_finalizer(self) -> bool:
        """True if the RAII finalizer (not an explicit destroy) freed this."""
        return bool(self._state.get("freed_by_finalizer"))

    def on_destroy(self, callback: Callable[["MLXGPUResource"], None]) -> None:
        if self._destroyed:
            callback(self)
        else:
            self._destroy_callbacks.append(callback)


# Static assertion the wrapper structurally satisfies the SG-1 Protocol.
# (runtime_checkable Protocol — exercised for real in the test suite.)
_: type[GPUResource] = MLXGPUResource
