"""Tests for SG-1 GPU resource lifetime contract (PR #16).

PR #16 ships the generic pool + Protocol + tests against MockGPUResource.
Real Metal integration happens in the first Tier 2 effect PR that needs
GPU handles (out-of-scope here).
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

BACKEND_SRC = Path(__file__).resolve().parents[2] / "src"
if str(BACKEND_SRC) not in sys.path:
    sys.path.insert(0, str(BACKEND_SRC))

from safety.gpu_resources import (
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
    yield
    reset_global_pool_registry_for_testing()


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
    """The SPEC-3 §2.5 canonical leak test (against MockGPUResource)."""
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
    # Every acquired handle is eventually destroyed (via eviction or destroy_all)
    assert destroyed_count == 10_000


@pytest.mark.smoke
def test_pool_max_handles_zero_raises():
    with pytest.raises(ValueError):
        GPUResourcePool(max_handles=0)
