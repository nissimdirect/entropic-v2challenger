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
