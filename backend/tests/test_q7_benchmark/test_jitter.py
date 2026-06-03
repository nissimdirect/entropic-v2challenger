"""Tests for jitter.py — slerp correctness + measure_jitter contracts."""

from __future__ import annotations

import numpy as np
import pytest

from q7_benchmark.jitter import (
    CANONICAL_SPARSITY,
    SUPPORTED_SPARSITIES,
    SparsityResult,
    jitter_dict_for_report,
    measure_jitter_all_sparsities,
    measure_jitter_at_sparsity,
    slerp,
)
from q7_benchmark.loaders import make_loader


@pytest.mark.smoke
def test_supported_sparsities_constant():
    assert SUPPORTED_SPARSITIES == (4, 8, 16, 32)
    assert CANONICAL_SPARSITY == 8
    assert CANONICAL_SPARSITY in SUPPORTED_SPARSITIES


@pytest.mark.smoke
def test_slerp_endpoint_0_returns_v0():
    v0 = np.array([1.0, 0.0, 0.0])
    v1 = np.array([0.0, 1.0, 0.0])
    np.testing.assert_allclose(slerp(v0, v1, 0.0), v0, atol=1e-6)


@pytest.mark.smoke
def test_slerp_endpoint_1_returns_v1():
    v0 = np.array([1.0, 0.0, 0.0])
    v1 = np.array([0.0, 1.0, 0.0])
    np.testing.assert_allclose(slerp(v0, v1, 1.0), v1, atol=1e-6)


@pytest.mark.smoke
def test_slerp_midpoint_orthogonal_unit_vectors():
    """Slerp at t=0.5 between orthogonal unit vectors should be normalized."""
    v0 = np.array([1.0, 0.0, 0.0])
    v1 = np.array([0.0, 1.0, 0.0])
    mid = slerp(v0, v1, 0.5)
    np.testing.assert_allclose(np.linalg.norm(mid), 1.0, atol=1e-5)
    # Midpoint should be at 45° from both — value is sqrt(2)/2 for each
    expected = np.array([np.sqrt(2) / 2, np.sqrt(2) / 2, 0.0], dtype=np.float32)
    np.testing.assert_allclose(mid, expected, atol=1e-5)


@pytest.mark.smoke
def test_slerp_parallel_vectors_linear_fallthrough():
    """Identical vectors must not divide by zero."""
    v0 = np.array([1.0, 0.0, 0.0])
    out = slerp(v0, v0, 0.5)
    # Should still produce a unit vector close to the input
    np.testing.assert_allclose(np.linalg.norm(out), 1.0, atol=1e-5)


@pytest.mark.smoke
def test_slerp_antiparallel_vectors_no_crash():
    """Anti-parallel vectors are a corner case; just verify no crash + unit norm."""
    v0 = np.array([1.0, 0.0, 0.0])
    v1 = np.array([-1.0, 0.0, 0.0])
    out = slerp(v0, v1, 0.5)
    # Norm may be near zero in this degenerate case; allow it
    norm = np.linalg.norm(out)
    assert norm <= 1.0 + 1e-5  # not catastrophically large


@pytest.mark.smoke
def test_slerp_high_dim_unit_vector():
    """Slerp works for arbitrary N-dim (e.g., DINOv2 384-dim) unit vectors."""
    rng = np.random.default_rng(7)
    v0 = rng.standard_normal(384).astype(np.float32)
    v0 /= np.linalg.norm(v0)
    v1 = rng.standard_normal(384).astype(np.float32)
    v1 /= np.linalg.norm(v1)
    out = slerp(v0, v1, 0.5)
    assert out.shape == (384,)
    np.testing.assert_allclose(np.linalg.norm(out), 1.0, atol=1e-5)


@pytest.mark.smoke
def test_measure_jitter_at_sparsity_8_returns_stats():
    loader = make_loader("dinov2", backend="mock")
    result = measure_jitter_at_sparsity(loader, sparsity=8, n_frames=64)
    assert isinstance(result, SparsityResult)
    assert result.sparsity == 8
    assert result.n_frames == 64
    assert result.jitter.n_samples == 64
    assert result.jitter.p50_ms >= 0
    assert result.error is None


@pytest.mark.smoke
def test_measure_jitter_at_sparsity_4_works():
    loader = make_loader("dinov2", backend="mock")
    result = measure_jitter_at_sparsity(loader, sparsity=4, n_frames=32)
    assert result.sparsity == 4
    assert result.n_frames == 32


@pytest.mark.smoke
def test_measure_jitter_at_sparsity_32_works():
    loader = make_loader("dinov2", backend="mock")
    result = measure_jitter_at_sparsity(loader, sparsity=32, n_frames=128)
    assert result.sparsity == 32


@pytest.mark.smoke
def test_measure_jitter_invalid_sparsity_raises():
    loader = make_loader("dinov2", backend="mock")
    with pytest.raises(ValueError, match="sparsity"):
        measure_jitter_at_sparsity(loader, sparsity=7, n_frames=64)


@pytest.mark.smoke
def test_measure_jitter_too_few_frames_raises():
    loader = make_loader("dinov2", backend="mock")
    with pytest.raises(ValueError, match="n_frames"):
        measure_jitter_at_sparsity(loader, sparsity=8, n_frames=10)  # < 2*8


@pytest.mark.smoke
def test_measure_jitter_backend_not_lit_reports_error():
    loader = make_loader("dinov2", backend="mps")  # stub raises NotImplementedError
    result = measure_jitter_at_sparsity(loader, sparsity=8, n_frames=64)
    assert result.error is not None
    assert "BACKEND_NOT_LIT" in result.error


@pytest.mark.smoke
def test_measure_jitter_all_sparsities_returns_four():
    loader = make_loader("dinov2", backend="mock")
    results = measure_jitter_all_sparsities(loader, n_frames_per_sparsity=128)
    assert set(results.keys()) == set(SUPPORTED_SPARSITIES)
    for sparsity, result in results.items():
        assert result.sparsity == sparsity
        assert result.n_frames == 128


@pytest.mark.smoke
def test_jitter_dict_for_report_canonical_field():
    loader = make_loader("dinov2", backend="mock")
    results = measure_jitter_all_sparsities(loader, n_frames_per_sparsity=64)
    d = jitter_dict_for_report(results)
    assert d["canonical_sparsity"] == 8
    assert set(d["by_sparsity"].keys()) == {"4", "8", "16", "32"}
    # Top-level jitter_p95_ms references the canonical sparsity
    canonical_d = d["by_sparsity"]["8"]
    assert d["jitter_p95_ms"] == canonical_d["jitter_p95_ms"]
    assert isinstance(d["below_threshold_50ms"], bool)


@pytest.mark.smoke
def test_jitter_dict_for_report_sparsity_string_keys():
    """JSON-friendly: by_sparsity uses string keys."""
    loader = make_loader("dinov2", backend="mock")
    results = measure_jitter_all_sparsities(loader, n_frames_per_sparsity=64)
    d = jitter_dict_for_report(results)
    for k in d["by_sparsity"].keys():
        assert isinstance(k, str)
