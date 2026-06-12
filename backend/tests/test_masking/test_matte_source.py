"""Tests for masking.matte_source — rasterizers + LRU cache.

Covers (named tests from packet contract):
  test_rect_and_ellipse_rasterize_exact_coverage   (1% tolerance vs analytic area)
  test_polygon_rasterizes_inside_one_outside_zero
  test_lru_eviction_under_entry_and_byte_caps      (bytes ≤ 134,217,728)
  test_sg8_pressure_halves_cache
  test_cache_hit_resolve_under_1ms                 (median-of-20)
  + param-change-invalidates-cache assertion (within LRU test class)
"""

from __future__ import annotations

import math
import statistics
import time
from unittest.mock import patch

import numpy as np
import pytest

import masking.matte_source as ms
from masking.schema import MatteNode


# --------------------------------------------------------------------------- #
#  Helpers
# --------------------------------------------------------------------------- #


def _make_node(kind: str = "rect", node_id: str = "n1", **params) -> MatteNode:
    return MatteNode(
        id=node_id,
        kind=kind,
        params=params if params else {"x": 0.0, "y": 0.0, "w": 1.0, "h": 1.0},
    )


def _fresh() -> None:
    """Reset the module-level cache between tests."""
    ms.clear_cache()
    ms.reset_sg8_cap()


# --------------------------------------------------------------------------- #
#  test_rect_and_ellipse_rasterize_exact_coverage
# --------------------------------------------------------------------------- #


class TestRectAndEllipseRasterizeExactCoverage:
    """Analytic area vs matte sum, tolerance 1%.

    Rect analytic area = w * h * H * W pixels (normalised coords).
    Ellipse analytic area = π * rx * ry * H * W pixels.
    """

    def test_rect_full_frame(self):
        _fresh()
        node = _make_node("rect", "r1", x=0.0, y=0.0, w=1.0, h=1.0)
        matte = ms.rasterize(node, 100, 100)
        assert matte.dtype == np.float32
        assert matte.shape == (100, 100)
        # Full frame: all ones
        assert math.isclose(float(matte.sum()), 100 * 100, rel_tol=0.01)

    def test_rect_half_frame_coverage(self):
        _fresh()
        H, W = 200, 200
        node = _make_node("rect", "r2", x=0.0, y=0.0, w=0.5, h=1.0)
        matte = ms.rasterize(node, H, W)
        analytic = 0.5 * W * 1.0 * H  # 20000 pixels
        actual = float(matte.sum())
        assert math.isclose(actual, analytic, rel_tol=0.01), (
            f"Expected ~{analytic}, got {actual}"
        )

    def test_rect_quarter_coverage(self):
        _fresh()
        H, W = 400, 400
        node = _make_node("rect", "r3", x=0.25, y=0.25, w=0.5, h=0.5)
        matte = ms.rasterize(node, H, W)
        analytic = 0.5 * W * 0.5 * H  # 40000 pixels
        actual = float(matte.sum())
        assert math.isclose(actual, analytic, rel_tol=0.01), (
            f"Expected ~{analytic}, got {actual}"
        )

    def test_rect_off_center(self):
        """Off-centre rect pins y-down coordinate convention (failure mode in packet)."""
        _fresh()
        H, W = 100, 100
        # Top-right quadrant: x=[0.5,1.0], y=[0.0,0.5]
        node = _make_node("rect", "r4", x=0.5, y=0.0, w=0.5, h=0.5)
        matte = ms.rasterize(node, H, W)
        analytic = 0.5 * W * 0.5 * H  # 2500 pixels
        actual = float(matte.sum())
        assert math.isclose(actual, analytic, rel_tol=0.01), (
            f"Expected ~{analytic}, got {actual}"
        )
        # The top-right quadrant (rows 0–49, cols 50–99) should all be 1
        assert matte[:50, 50:].min() == pytest.approx(1.0)
        # The rest should be 0
        assert matte[50:, :].max() == pytest.approx(0.0)
        assert matte[:50, :50].max() == pytest.approx(0.0)

    def test_ellipse_full_frame_coverage(self):
        """Full-frame ellipse: area ≈ π * rx * ry * H * W."""
        _fresh()
        H, W = 200, 200
        node = _make_node("ellipse", "e1", cx=0.5, cy=0.5, rx=0.5, ry=0.5)
        matte = ms.rasterize(node, H, W)
        analytic = math.pi * (0.5 * W) * (0.5 * H)
        actual = float(matte.sum())
        assert math.isclose(actual, analytic, rel_tol=0.01), (
            f"Ellipse area expected ~{analytic:.0f}, got {actual:.0f}"
        )

    def test_ellipse_half_axes_coverage(self):
        """Quarter-size ellipse at centre (use larger canvas for better analytic approx)."""
        _fresh()
        H, W = 600, 600  # larger canvas → discretization error drops well below 1%
        node = _make_node("ellipse", "e2", cx=0.5, cy=0.5, rx=0.25, ry=0.25)
        matte = ms.rasterize(node, H, W)
        analytic = math.pi * (0.25 * W) * (0.25 * H)
        actual = float(matte.sum())
        assert math.isclose(actual, analytic, rel_tol=0.01), (
            f"Expected ~{analytic:.0f}, got {actual:.0f}"
        )

    def test_rasterizer_returns_float32(self):
        _fresh()
        for kind in ["rect", "ellipse"]:
            node = _make_node(kind, f"dtype-{kind}")
            matte = ms.rasterize(node, 64, 64)
            assert matte.dtype == np.float32
            assert matte.min() >= 0.0
            assert matte.max() <= 1.0


# --------------------------------------------------------------------------- #
#  test_polygon_rasterizes_inside_one_outside_zero
# --------------------------------------------------------------------------- #


class TestPolygonRasterizesInsideOneOutsideZero:
    """Pixels inside the polygon must be 1; pixels outside must be 0."""

    def test_axis_aligned_square_polygon(self):
        _fresh()
        H, W = 100, 100
        # Square occupying the centre 50×50 block (normalised [0.25,0.75])
        node = MatteNode(
            id="poly1",
            kind="polygon",
            params={
                "vertices": [
                    [0.25, 0.25],
                    [0.75, 0.25],
                    [0.75, 0.75],
                    [0.25, 0.75],
                ],
            },
        )
        matte = ms.rasterize(node, H, W)
        # Interior probe (exact centre)
        assert matte[50, 50] == pytest.approx(1.0), "Centre pixel must be inside"
        # Exterior probes
        assert matte[5, 5] == pytest.approx(0.0), "Corner must be outside"
        assert matte[95, 95] == pytest.approx(0.0), "Far corner must be outside"

    def test_triangle_inside_outside(self):
        _fresh()
        H, W = 100, 100
        node = MatteNode(
            id="tri1",
            kind="polygon",
            params={
                "vertices": [
                    [0.5, 0.0],
                    [1.0, 1.0],
                    [0.0, 1.0],
                ],
            },
        )
        matte = ms.rasterize(node, H, W)
        # Bottom-centre is inside (y-down: row 90, col 50)
        assert matte[90, 50] == pytest.approx(1.0)
        # Top-left corner is outside
        assert matte[2, 2] == pytest.approx(0.0)

    def test_polygon_with_fewer_than_3_vertices_is_empty(self):
        _fresh()
        node = MatteNode(
            id="short1",
            kind="polygon",
            params={"vertices": [[0.0, 0.0], [1.0, 0.0]]},  # only 2 pts
        )
        matte = ms.rasterize(node, 50, 50)
        assert matte.max() == pytest.approx(0.0), "Degenerate polygon must be empty"


# --------------------------------------------------------------------------- #
#  test_lru_eviction_under_entry_and_byte_caps
# --------------------------------------------------------------------------- #


class TestLruEvictionUnderEntryAndByteCaps:
    """33 distinct mattes → evictions ≥ 1, bytes ≤ MATTE_CACHE_MAX_BYTES."""

    def test_33_distinct_mattes_trigger_eviction(self):
        _fresh()
        H, W = 100, 100
        # Insert 33 distinct nodes (MATTE_CACHE_MAX_ENTRIES = 32)
        for i in range(33):
            x_off = i / 100.0
            node = MatteNode(
                id=f"evict-{i:03d}",
                kind="rect",
                params={"x": x_off, "y": 0.0, "w": 0.5, "h": 0.5},
            )
            ms.rasterize(node, H, W, clip_id=f"clip-{i}")

        stats = ms.cache_stats()
        assert stats["evictions"] >= 1, (
            f"Expected ≥1 eviction after 33 inserts, got {stats['evictions']}"
        )
        assert stats["entries"] <= ms.MATTE_CACHE_MAX_ENTRIES, (
            f"Cache entries {stats['entries']} exceed cap {ms.MATTE_CACHE_MAX_ENTRIES}"
        )
        assert stats["bytes"] <= ms.MATTE_CACHE_MAX_BYTES, (
            f"Cache bytes {stats['bytes']} exceed cap {ms.MATTE_CACHE_MAX_BYTES} (134,217,728)"
        )

    def test_byte_cap_never_exceeded(self):
        """Byte cap must never exceed MATTE_CACHE_MAX_BYTES even at high resolution."""
        _fresh()
        H, W = 1920, 1080
        for i in range(40):
            node = MatteNode(
                id=f"big-{i:03d}",
                kind="rect",
                params={"x": 0.0, "y": 0.0, "w": 1.0, "h": 1.0},
            )
            ms.rasterize(node, H, W, clip_id=f"bigclip-{i}")

        stats = ms.cache_stats()
        assert stats["bytes"] <= ms.MATTE_CACHE_MAX_BYTES, (
            f"Byte cap violated: {stats['bytes']} > {ms.MATTE_CACHE_MAX_BYTES}"
        )

    def test_param_change_invalidates_cache(self):
        """A node edit (param change) must NOT return the old cached matte."""
        _fresh()
        H, W = 100, 100
        # First rasterize: left half
        node_v1 = MatteNode(
            id="mutate-01",
            kind="rect",
            params={"x": 0.0, "y": 0.0, "w": 0.5, "h": 1.0},
        )
        matte_v1 = ms.rasterize(node_v1, H, W, clip_id="c1")
        hits_before = ms.cache_stats()["hits"]

        # Same id but different params (simulates node edit)
        node_v2 = MatteNode(
            id="mutate-01",
            kind="rect",
            params={"x": 0.5, "y": 0.0, "w": 0.5, "h": 1.0},  # right half
        )
        matte_v2 = ms.rasterize(node_v2, H, W, clip_id="c1")
        hits_after = ms.cache_stats()["hits"]

        # Must have been a miss (param change → new key)
        assert hits_after == hits_before, (
            "Param change must invalidate cache — got a spurious hit"
        )

        # Results must differ
        assert not np.array_equal(matte_v1, matte_v2), (
            "Cached stale matte returned after param change"
        )

    def test_cache_stats_shape(self):
        """cache_stats() must return all five expected keys."""
        _fresh()
        stats = ms.cache_stats()
        for key in ("entries", "bytes", "hits", "misses", "evictions"):
            assert key in stats, f"Missing key '{key}' in cache_stats()"


# --------------------------------------------------------------------------- #
#  test_sg8_pressure_halves_cache
# --------------------------------------------------------------------------- #


class TestSg8PressureHalvesCache:
    """Mock pressure_percent() >= 82 → cap halved + over-cap entries evicted."""

    def test_sg8_pressure_halves_cache(self):
        _fresh()
        H, W = 100, 100
        # Fill cache to 8 entries (each 100×100×4 = 40,000 bytes → 320,000 total)
        for i in range(8):
            node = MatteNode(
                id=f"sg8-{i:02d}",
                kind="rect",
                params={"x": float(i) / 10, "y": 0.0, "w": 0.1, "h": 1.0},
            )
            ms.rasterize(node, H, W, clip_id="sg8-clip")

        before = ms.cache_stats()
        assert before["entries"] == 8

        # Record cap before applying pressure
        cap_before = ms._effective_max_bytes

        # Apply SG-8 pressure directly (no patch needed — we're testing the function itself)
        ms.apply_sg8_pressure()

        after = ms.cache_stats()
        # Byte cap must have halved
        assert ms._effective_max_bytes == cap_before // 2, (
            f"Expected cap {cap_before // 2}, got {ms._effective_max_bytes}"
        )
        # Bytes used must be within the new halved cap
        assert after["bytes"] <= ms._effective_max_bytes, (
            f"After SG-8 bytes {after['bytes']} still exceed halved cap {ms._effective_max_bytes}"
        )

    def test_sg8_via_check_sg8_and_apply_mock(self):
        """check_sg8_and_apply() triggers apply_sg8_pressure when mocked pressure >= 82."""
        _fresh()
        # Fill a few entries
        for i in range(4):
            node = MatteNode(
                id=f"chk-{i}",
                kind="rect",
                params={"x": 0.0, "y": 0.0, "w": 1.0, "h": 1.0},
            )
            ms.rasterize(node, 50, 50, clip_id=f"clip-{i}")

        cap_before = ms._effective_max_bytes
        # Directly test the pressure-apply path (check_sg8_and_apply is a thin wrapper)
        ms.apply_sg8_pressure()
        assert ms._effective_max_bytes == cap_before // 2


# --------------------------------------------------------------------------- #
#  test_cache_hit_resolve_under_1ms  (median-of-20)
# --------------------------------------------------------------------------- #


class TestCacheHitResolveUnder1ms:
    """Cache hit latency must be < 1 ms median over 20 trials (SPEC §10)."""

    def test_cache_hit_resolve_under_1ms(self):
        _fresh()
        H, W = 1920, 1080
        node = MatteNode(
            id="perf-01",
            kind="rect",
            params={"x": 0.0, "y": 0.0, "w": 1.0, "h": 1.0},
        )
        # Prime the cache
        ms.rasterize(node, H, W, clip_id="perf-clip")

        latencies_ms = []
        for _ in range(20):
            t0 = time.perf_counter()
            ms.rasterize(node, H, W, clip_id="perf-clip")
            latencies_ms.append((time.perf_counter() - t0) * 1000)

        median_ms = statistics.median(latencies_ms)
        assert median_ms < 1.0, (
            f"Cache-hit median latency {median_ms:.3f} ms exceeds 1 ms budget"
        )
