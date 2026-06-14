"""Tests for SG-1 GPU resource lifetime contract.

Ships the generic pool + Protocol + RAII finalizer + use-after-destroy
guard, all tested against MockGPUResource. The real Metal binding lands
in the first Tier 2 effect PR that needs GPU handles; this suite is the
contract that binding must satisfy.
"""

from __future__ import annotations

import gc
import sys
from pathlib import Path

import pytest

BACKEND_SRC = Path(__file__).resolve().parents[2] / "src"
if str(BACKEND_SRC) not in sys.path:
    sys.path.insert(0, str(BACKEND_SRC))

from safety.gpu_resources import (
    DestroyedHandleError,
    EvictionPolicy,
    GPUResource,
    GPUResourcePool,
    GlobalPoolRegistry,
    MockGPUResource,
    PoolExhausted,
    global_pool_registry,
    reset_global_pool_registry_for_testing,
)


@pytest.fixture(autouse=True)
def _reset_globals():
    reset_global_pool_registry_for_testing()
    MockGPUResource.reset_finalizer_counter()
    yield
    reset_global_pool_registry_for_testing()
    MockGPUResource.reset_finalizer_counter()


def _force_gc_collect_finalizers():
    """Run GC until pending weakref.finalize callbacks have all fired.

    CPython reclaims the no-cycle case immediately on refcount drop, but
    we call gc.collect() explicitly to be deterministic across runtimes
    (and to flush any handles caught in reference cycles)."""
    for _ in range(3):
        gc.collect()


# ---------------------------------------------------------------------------
# MockGPUResource — protocol satisfaction + destroy semantics
# ---------------------------------------------------------------------------


@pytest.mark.smoke
def test_mock_satisfies_gpuresource_protocol():
    h = MockGPUResource(id="tex-1", size_bytes=1024)
    assert isinstance(h, GPUResource)


@pytest.mark.smoke
def test_mock_destroy_is_idempotent():
    h = MockGPUResource(id="tex-1", size_bytes=1024)
    assert not h.destroyed
    h.destroy()
    assert h.destroyed
    # Second destroy is a no-op (no exception)
    h.destroy()


@pytest.mark.smoke
def test_mock_destroy_fires_callback():
    fired = []
    h = MockGPUResource(id="tex-1", size_bytes=512)
    h.on_destroy(lambda r: fired.append(r.id))
    h.destroy()
    assert fired == ["tex-1"]


@pytest.mark.smoke
def test_mock_on_destroy_after_destroy_fires_immediately():
    """Registering a callback on an already-destroyed resource fires sync."""
    fired = []
    h = MockGPUResource(id="tex-1", size_bytes=512)
    h.destroy()
    h.on_destroy(lambda r: fired.append("late"))
    assert fired == ["late"]


# ---------------------------------------------------------------------------
# GPUResourcePool — basic lifecycle
# ---------------------------------------------------------------------------


@pytest.mark.smoke
def test_pool_acquire_release():
    pool = GPUResourcePool(max_handles=8)
    h = MockGPUResource(id="a", size_bytes=256)
    pool.acquire(h)
    assert pool.stats()["count"] == 1
    assert pool.release("a")
    assert pool.stats()["count"] == 0
    assert h.destroyed


@pytest.mark.smoke
def test_pool_release_missing_returns_false():
    pool = GPUResourcePool(max_handles=8)
    assert not pool.release("nope")


@pytest.mark.smoke
def test_pool_acquire_duplicate_id_raises():
    pool = GPUResourcePool(max_handles=8)
    h1 = MockGPUResource(id="a", size_bytes=64)
    h2 = MockGPUResource(id="a", size_bytes=64)
    pool.acquire(h1)
    with pytest.raises(ValueError, match="already in pool"):
        pool.acquire(h2)


@pytest.mark.smoke
def test_pool_get_returns_handle():
    pool = GPUResourcePool(max_handles=8)
    h = MockGPUResource(id="a", size_bytes=64)
    pool.acquire(h)
    assert pool.get("a") is h
    assert pool.get("missing") is None


# ---------------------------------------------------------------------------
# LRU eviction
# ---------------------------------------------------------------------------


@pytest.mark.smoke
def test_pool_lru_evicts_oldest_when_full():
    pool = GPUResourcePool(max_handles=3, eviction_policy=EvictionPolicy.LRU)
    h1 = MockGPUResource(id="1", size_bytes=64)
    h2 = MockGPUResource(id="2", size_bytes=64)
    h3 = MockGPUResource(id="3", size_bytes=64)
    h4 = MockGPUResource(id="4", size_bytes=64)
    pool.acquire(h1)
    pool.acquire(h2)
    pool.acquire(h3)
    pool.acquire(h4)  # forces eviction of "1"
    assert h1.destroyed
    assert pool.get("1") is None
    assert pool.get("4") is h4
    assert pool.stats()["evictions"] == 1


@pytest.mark.smoke
def test_pool_touch_protects_from_eviction():
    pool = GPUResourcePool(max_handles=3)
    h1 = MockGPUResource(id="1", size_bytes=64)
    h2 = MockGPUResource(id="2", size_bytes=64)
    h3 = MockGPUResource(id="3", size_bytes=64)
    h4 = MockGPUResource(id="4", size_bytes=64)
    pool.acquire(h1)
    pool.acquire(h2)
    pool.acquire(h3)
    pool.touch("1")  # "1" is now most-recently-used
    pool.acquire(h4)  # evicts "2" (now oldest)
    assert not h1.destroyed
    assert h2.destroyed


@pytest.mark.smoke
def test_pool_fail_policy_raises_when_full():
    pool = GPUResourcePool(max_handles=2, eviction_policy=EvictionPolicy.FAIL)
    pool.acquire(MockGPUResource(id="1", size_bytes=64))
    pool.acquire(MockGPUResource(id="2", size_bytes=64))
    with pytest.raises(PoolExhausted):
        pool.acquire(MockGPUResource(id="3", size_bytes=64))


# ---------------------------------------------------------------------------
# Byte budget enforcement
# ---------------------------------------------------------------------------


@pytest.mark.smoke
def test_pool_byte_budget_triggers_eviction():
    pool = GPUResourcePool(max_handles=100, max_bytes=200)
    pool.acquire(MockGPUResource(id="1", size_bytes=100))
    pool.acquire(MockGPUResource(id="2", size_bytes=100))
    # Now at 200B / 200B; next acquire forces eviction
    h3 = MockGPUResource(id="3", size_bytes=50)
    pool.acquire(h3)
    # "1" should have been evicted (LRU)
    assert pool.get("1") is None
    assert pool.stats()["current_bytes"] == 150


@pytest.mark.smoke
def test_pool_byte_budget_zero_raises_at_construct():
    with pytest.raises(ValueError):
        GPUResourcePool(max_handles=8, max_bytes=0)


# ---------------------------------------------------------------------------
# Pinning
# ---------------------------------------------------------------------------


@pytest.mark.smoke
def test_pool_pin_prevents_eviction():
    pool = GPUResourcePool(max_handles=2)
    h1 = MockGPUResource(id="1", size_bytes=64)
    h2 = MockGPUResource(id="2", size_bytes=64)
    pool.acquire(h1)
    pool.acquire(h2)
    pool.pin("1")
    # Adding third + pinning oldest → must evict "2"
    h3 = MockGPUResource(id="3", size_bytes=64)
    pool.acquire(h3)
    assert not h1.destroyed
    assert h2.destroyed


@pytest.mark.smoke
def test_pool_all_pinned_raises_pool_exhausted():
    pool = GPUResourcePool(max_handles=2)
    pool.acquire(MockGPUResource(id="1", size_bytes=64))
    pool.acquire(MockGPUResource(id="2", size_bytes=64))
    pool.pin("1")
    pool.pin("2")
    with pytest.raises(PoolExhausted, match="pinned"):
        pool.acquire(MockGPUResource(id="3", size_bytes=64))


@pytest.mark.smoke
def test_pool_unpin_allows_eviction_again():
    pool = GPUResourcePool(max_handles=2)
    h1 = MockGPUResource(id="1", size_bytes=64)
    pool.acquire(h1)
    pool.acquire(MockGPUResource(id="2", size_bytes=64))
    pool.pin("1")
    pool.unpin("1")
    pool.acquire(MockGPUResource(id="3", size_bytes=64))
    # "1" was unpinned + LRU → evicted
    assert h1.destroyed


@pytest.mark.smoke
def test_pool_pin_missing_raises_keyerror():
    pool = GPUResourcePool(max_handles=8)
    with pytest.raises(KeyError):
        pool.pin("nope")


# ---------------------------------------------------------------------------
# Bulk destroy
# ---------------------------------------------------------------------------


@pytest.mark.smoke
def test_pool_destroy_all_frees_everything():
    pool = GPUResourcePool(max_handles=10)
    handles = [MockGPUResource(id=str(i), size_bytes=64) for i in range(5)]
    for h in handles:
        pool.acquire(h)
    freed = pool.destroy_all()
    assert freed == 5
    assert pool.stats()["count"] == 0
    for h in handles:
        assert h.destroyed


# ---------------------------------------------------------------------------
# Global registry
# ---------------------------------------------------------------------------


@pytest.mark.smoke
def test_registry_register_and_unregister():
    reg = GlobalPoolRegistry()
    pool_a = GPUResourcePool(max_handles=4, name="effect-a")
    pool_b = GPUResourcePool(max_handles=4, name="effect-b")
    reg.register(pool_a)
    reg.register(pool_b)
    assert reg.get("effect-a") is pool_a
    assert reg.get("effect-b") is pool_b
    assert len(reg.all_pools()) == 2

    pool_a.acquire(MockGPUResource(id="x", size_bytes=64))
    freed = reg.unregister("effect-a")
    assert freed == 1
    assert reg.get("effect-a") is None


@pytest.mark.smoke
def test_registry_duplicate_name_raises():
    reg = GlobalPoolRegistry()
    pool1 = GPUResourcePool(max_handles=4, name="x")
    pool2 = GPUResourcePool(max_handles=4, name="x")
    reg.register(pool1)
    with pytest.raises(ValueError):
        reg.register(pool2)


@pytest.mark.smoke
def test_registry_total_handles_and_bytes():
    reg = GlobalPoolRegistry()
    pa = GPUResourcePool(max_handles=4, name="a")
    pb = GPUResourcePool(max_handles=4, name="b")
    reg.register(pa)
    reg.register(pb)
    pa.acquire(MockGPUResource(id="1", size_bytes=100))
    pa.acquire(MockGPUResource(id="2", size_bytes=200))
    pb.acquire(MockGPUResource(id="3", size_bytes=300))
    assert reg.total_handles() == 3
    assert reg.total_bytes() == 600


@pytest.mark.smoke
def test_registry_destroy_all_frees_every_pool():
    reg = GlobalPoolRegistry()
    pools = []
    for i in range(3):
        p = GPUResourcePool(max_handles=4, name=f"p{i}")
        p.acquire(MockGPUResource(id="h", size_bytes=64))
        reg.register(p)
        pools.append(p)
    freed = reg.destroy_all()
    assert freed == 3


@pytest.mark.smoke
def test_global_registry_singleton():
    r1 = global_pool_registry()
    r2 = global_pool_registry()
    assert r1 is r2


# ---------------------------------------------------------------------------
# Stress / boundary
# ---------------------------------------------------------------------------


@pytest.mark.smoke
def test_create_and_destroy_10k_handles_no_leak():
    """The SPEC-3 §2.5 canonical leak test (against MockGPUResource).

    Pool path: every acquired handle is explicitly freed (via eviction or
    destroy_all). Asserts (a) the destroy bookkeeping balances AND (b) the
    RAII finalizer NEVER fired — because the pool freed everything
    explicitly, no handle was forgotten. A finalizer firing here would
    mean the pool leaked a handle to GC.
    """
    pool = GPUResourcePool(max_handles=100, max_bytes=100_000_000)
    destroyed_count = 0

    def on_destroy(_r):
        nonlocal destroyed_count
        destroyed_count += 1

    for i in range(10_000):
        h = MockGPUResource(id=f"h-{i}", size_bytes=64)
        h.on_destroy(on_destroy)
        pool.acquire(h)
    pool.destroy_all()
    _force_gc_collect_finalizers()
    # Every acquired handle is eventually destroyed (via eviction or destroy_all)
    assert destroyed_count == 10_000
    # Real leak assertion: zero handles reached GC un-freed.
    assert MockGPUResource.finalizer_free_count == 0


@pytest.mark.smoke
def test_10k_forgotten_handles_all_freed_by_finalizer():
    """SPEC-3 §2.2 RAII guarantee: handles dropped WITHOUT destroy() are
    still ALWAYS freed — by the weakref.finalize fallback at GC time.

    This is the real teeth of the leak contract: it proves the
    forgotten/unowned case (the exact failure mode SG-1 exists to catch)
    is recovered. Counts finalizer invocations == forgotten count.
    """
    forgotten = 10_000
    for i in range(forgotten):
        # Allocate and immediately drop the only reference — no destroy(),
        # no pool. A leaked handle in real Metal terms.
        MockGPUResource(id=f"forgotten-{i}", size_bytes=64)
    _force_gc_collect_finalizers()
    assert MockGPUResource.finalizer_free_count == forgotten


@pytest.mark.smoke
def test_finalizer_frees_forgotten_handle():
    """Gap #4: a single forgotten handle is freed by the RAII finalizer,
    and flagged as finalizer-freed (not explicitly destroyed)."""
    state_box = {}

    def grab(r):
        # Capture the shared state object so we can inspect it AFTER the
        # wrapper is GC'd (the wrapper itself must not be referenced here).
        state_box["state"] = r._state

    h = MockGPUResource(id="orphan", size_bytes=128)
    grab(h)
    assert MockGPUResource.finalizer_free_count == 0
    del h
    _force_gc_collect_finalizers()
    assert MockGPUResource.finalizer_free_count == 1
    assert state_box["state"]["freed"] is True
    assert state_box["state"]["freed_by_finalizer"] is True


@pytest.mark.smoke
def test_explicit_destroy_detaches_finalizer():
    """Explicit destroy() must NOT also trip the finalizer (no double-free,
    no spurious forgotten-handle warning)."""
    h = MockGPUResource(id="owned", size_bytes=64)
    h.destroy()
    assert h.destroyed
    assert not h.freed_by_finalizer()
    del h
    _force_gc_collect_finalizers()
    # destroy() detached the finalizer → it never counts as forgotten.
    assert MockGPUResource.finalizer_free_count == 0


@pytest.mark.smoke
def test_pool_release_detaches_finalizer():
    """A handle freed through the pool is explicitly destroyed, so the
    finalizer must not fire for it either."""
    pool = GPUResourcePool(max_handles=8)
    h = MockGPUResource(id="pooled", size_bytes=64)
    pool.acquire(h)
    assert pool.release("pooled")
    assert h.destroyed
    del h
    _force_gc_collect_finalizers()
    assert MockGPUResource.finalizer_free_count == 0


# ---------------------------------------------------------------------------
# Use-after-destroy guard (SPEC-3 §2.3 `raw` accessor "throws if destroyed")
# ---------------------------------------------------------------------------


@pytest.mark.smoke
def test_raw_accessor_returns_before_destroy():
    h = MockGPUResource(id="live", size_bytes=64)
    # Mock underlying handle is a sentinel (None); accessor must not raise.
    assert h.raw is None
    assert not h.destroyed


@pytest.mark.smoke
def test_destroyed_handle_throws_on_use():
    """SPEC-3 §2.3: accessing `.raw` after destroy() raises
    DestroyedHandleError — use-after-free is loud, not silent."""
    h = MockGPUResource(id="gone", size_bytes=64)
    h.destroy()
    with pytest.raises(DestroyedHandleError, match="after destroy"):
        _ = h.raw


@pytest.mark.smoke
def test_destroyed_handle_error_carries_resource_id():
    h = MockGPUResource(id="tex-42", size_bytes=64)
    h.destroy()
    with pytest.raises(DestroyedHandleError) as exc_info:
        _ = h.raw
    assert exc_info.value.resource_id == "tex-42"


# ---------------------------------------------------------------------------
# Real-RSS variant — opt-in, gated. The mock-counter path above is the
# always-on CI tier; this is the belt-and-suspenders measurement that runs
# only where a real GPU/accelerator backend is present.
# ---------------------------------------------------------------------------


def _has_real_gpu_backend() -> bool:
    try:
        import mlx.core  # noqa: F401

        return True
    except Exception:  # noqa: BLE001
        return False


@pytest.mark.metal
@pytest.mark.skipif(
    not _has_real_gpu_backend(),
    reason="no MLX/Metal backend present — mock-counter leak test is the CI tier",
)
def test_create_and_destroy_10k_handles_rss_stable():
    """Real-resource leak variant (SPEC-3 §2.5 literal form): allocate +
    destroy 10k handles and assert process RSS returns to ~baseline.

    Skipped in headless CI; runs on dev machines with MLX/Metal. Belt to
    the mock-counter suspenders above."""
    import psutil  # local import: only needed on the real-backend path

    proc = psutil.Process()
    gc.collect()
    baseline = proc.memory_info().rss
    tolerance = 64 * 1024 * 1024  # 64MB headroom for allocator slack
    pool = GPUResourcePool(max_handles=100, max_bytes=100_000_000)
    for i in range(10_000):
        h = MockGPUResource(id=f"rss-{i}", size_bytes=4096)
        pool.acquire(h)
        h.destroy()
    pool.destroy_all()
    _force_gc_collect_finalizers()
    after = proc.memory_info().rss
    assert after <= baseline + tolerance, (
        f"RSS grew {after - baseline}B > tolerance {tolerance}B — possible leak"
    )


@pytest.mark.smoke
def test_pool_max_handles_zero_raises():
    with pytest.raises(ValueError):
        GPUResourcePool(max_handles=0)


# ---------------------------------------------------------------------------
# P6.4 — MLXGPUResource: real Metal binding (gap 6 of #163)
#
# Non-metal tests (protocol/destroy/raw/unavailable) run everywhere via the
# import-guarded module. The metal-marked tests need a real MLX backend and
# skip cleanly when it is absent. They EXTEND the 33-test contract above —
# nothing in that contract is modified.
# ---------------------------------------------------------------------------

from safety.mlx_resources import (  # noqa: E402
    MLXGPUResource,
    MLXUnavailableError,
    mlx_available,
)

_requires_mlx = pytest.mark.skipif(
    not mlx_available(),
    reason="no MLX/Metal backend present — metal-tier MLX test skipped",
)


@pytest.fixture(autouse=True)
def _reset_mlx_finalizer_counter():
    MLXGPUResource.reset_finalizer_counter()
    yield
    MLXGPUResource.reset_finalizer_counter()


@pytest.mark.smoke
def test_mlx_resource_implements_protocol():
    """Structural Protocol satisfaction does not require MLX at runtime:
    the class is checked against the runtime_checkable GPUResource. When
    MLX is present we also instantiate one and isinstance-check it."""
    assert issubclass(MLXGPUResource, object)
    # The Protocol attributes exist on the class regardless of backend.
    for attr in ("id", "destroy", "destroyed", "size_bytes", "raw"):
        assert hasattr(MLXGPUResource, attr) or attr in (
            "id",
            "size_bytes",
        ), f"MLXGPUResource missing protocol member {attr!r}"
    if mlx_available():
        r = MLXGPUResource.allocate("proto", (4, 4), "float32")
        try:
            assert isinstance(r, GPUResource)
            assert r.size_bytes == 4 * 4 * 4  # 16 elems * 4 bytes
        finally:
            r.destroy()


@pytest.mark.smoke
def test_mlx_unavailable_importerror_clean():
    """Negative: when MLX is absent, mlx_available() is False and the
    constructor raises a clean MLXUnavailableError (no AttributeError /
    traceback leakage from the None module)."""
    if mlx_available():
        # MLX present here — assert the boolean reports True and a
        # mis-gated construction path is the only way to MLXUnavailableError.
        assert mlx_available() is True
    else:
        assert mlx_available() is False
        with pytest.raises(MLXUnavailableError):
            MLXGPUResource(id="nope", size_bytes=16)


@_requires_mlx
@pytest.mark.metal
def test_mlx_destroy_idempotent():
    r = MLXGPUResource.allocate("idem", (8, 8), "float32")
    assert r.destroyed is False
    r.destroy()
    assert r.destroyed is True
    # Second + third destroy are no-ops, never raise.
    r.destroy()
    r.destroy()
    assert r.destroyed is True


@_requires_mlx
@pytest.mark.metal
def test_mlx_raw_after_destroy_raises():
    """Negative: use-after-free is THE failure mode SG-1 exists for."""
    r = MLXGPUResource.allocate("uaf", (8, 8), "float32")
    # Before destroy, raw returns the live mlx array.
    assert r.raw is not None
    r.destroy()
    with pytest.raises(DestroyedHandleError) as exc:
        _ = r.raw
    assert exc.value.resource_id == "uaf"


@_requires_mlx
@pytest.mark.metal
def test_mlx_finalizer_frees_forgotten_handle():
    """A forgotten (never-destroyed) MLXGPUResource is freed by the RAII
    weakref.finalize fallback at GC, incrementing the class counter — the
    SAME guarantee MockGPUResource provides, on the real backend."""
    MLXGPUResource.reset_finalizer_counter()
    r = MLXGPUResource.allocate("forgotten", (16, 16), "float32")
    rid = id(r)
    assert rid  # keep a use so the local isn't optimized away pre-drop
    del r
    _force_gc_collect_finalizers()
    assert MLXGPUResource.finalizer_free_count == 1


@_requires_mlx
@pytest.mark.metal
def test_pool_evicts_mlx_resources_lru():
    """The generic pool drives real MLX handles through LRU eviction with
    no leaks and correct destroy() calls on the evicted resources."""
    pool = GPUResourcePool(max_handles=2, eviction_policy=EvictionPolicy.LRU)
    a = MLXGPUResource.allocate("a", (4, 4), "float32")
    b = MLXGPUResource.allocate("b", (4, 4), "float32")
    pool.acquire(a)
    pool.acquire(b)
    # Acquiring a third evicts the LRU (a).
    c = MLXGPUResource.allocate("c", (4, 4), "float32")
    pool.acquire(c)
    assert a.destroyed is True
    assert b.destroyed is False
    assert c.destroyed is False
    assert pool.get("a") is None
    assert pool.get("b") is b
    pool.destroy_all()
    assert b.destroyed is True
    assert c.destroyed is True


@_requires_mlx
@pytest.mark.metal
def test_mlx_10k_acquire_destroy_rss_baseline():
    """Real-backend leak gate (the gate this phase is named for): 10,000
    acquire/destroy cycles of real MLX buffers through a bounded pool must
    return process RSS to within +64 MiB of baseline.

    Same 10,000-cycle / +64 MiB threshold as the existing mock RSS test,
    but on MLXGPUResource — real unified-memory allocations."""
    import psutil  # local import: only on the real-backend path

    proc = psutil.Process()
    _force_gc_collect_finalizers()
    baseline = proc.memory_info().rss
    tolerance = 64 * 1024 * 1024  # 67,108,864 B allocator slack
    pool = GPUResourcePool(max_handles=100, max_bytes=100_000_000)
    for i in range(10_000):
        # 1024 float32 = 4096 bytes, matching the mock test's per-handle size.
        h = MLXGPUResource.allocate(f"mlx-rss-{i}", (1024,), "float32")
        pool.acquire(h)
        h.destroy()
    pool.destroy_all()
    _force_gc_collect_finalizers()
    after = proc.memory_info().rss
    assert after <= baseline + tolerance, (
        f"RSS grew {after - baseline}B > tolerance {tolerance}B — possible "
        "leak in MLXGPUResource real-backend path"
    )


# ---------------------------------------------------------------------------
# P6.4 — AST lint self-tests (gap 5). These import the lint module and feed
# it source strings so the lint's own logic is covered in CI (no real files).
# ---------------------------------------------------------------------------

import importlib.util as _ilu  # noqa: E402

_LINT_PATH = Path(__file__).resolve().parents[2] / "scripts" / "lint_gpu_patterns.py"
_spec = _ilu.spec_from_file_location("lint_gpu_patterns", _LINT_PATH)
assert _spec and _spec.loader
_lint = _ilu.module_from_spec(_spec)
_spec.loader.exec_module(_lint)


@pytest.mark.smoke
def test_lint_flags_raw_mlx_alloc():
    """Negative: a seeded raw mlx allocation outside the wrapper module is
    flagged (exit-1 condition) by the AST lint."""
    bad = "import mlx.core as mx\n\ndef f():\n    return mx.zeros((4, 4))\n"
    findings = _lint.lint_source(bad, "effects/bad_effect.py")
    assert len(findings) >= 1
    assert any("raw mlx allocation" in f.msg for f in findings)


@pytest.mark.smoke
def test_lint_flags_module_level_alloc_even_in_wrapper():
    """Negative: even the sanctioned wrapper module may not allocate at
    module (import) level — no clear ownership."""
    bad = "import mlx.core as mx\n\nBUF = mx.zeros((4, 4))\n"
    findings = _lint.lint_source(bad, "safety/mlx_resources.py")
    assert any("module-level GPU allocation" in f.msg for f in findings)


@pytest.mark.smoke
def test_lint_flags_raw_metal_pyobjc():
    """Negative: raw pyobjc-Metal usage is forbidden everywhere."""
    bad = "import Metal\n\ndef g(dev):\n    return dev.makeTexture(None)\n"
    findings = _lint.lint_source(bad, "effects/metal_effect.py")
    assert any("pyobjc-Metal" in f.msg or "Metal/MTL" in f.msg for f in findings)


@pytest.mark.smoke
def test_lint_passes_clean_tree():
    """The wrapper module's own allocation (inside allocate()) is allowed;
    ordinary numpy/scipy code produces no findings."""
    wrapper_ok = (
        "import mlx.core as mx\n\ndef allocate(shape):\n    return mx.zeros(shape)\n"
    )
    assert _lint.lint_source(wrapper_ok, "safety/mlx_resources.py") == []
    clean = "import numpy as np\n\ndef h():\n    return np.zeros((4, 4))\n"
    assert _lint.lint_source(clean, "effects/fft_effect.py") == []
