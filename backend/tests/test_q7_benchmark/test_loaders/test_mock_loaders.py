"""Mock-loader behavior: shapes, determinism, encode contract."""

from __future__ import annotations

import numpy as np
import pytest

from q7_benchmark.loaders import LoaderResult, make_loader


@pytest.mark.smoke
def test_mock_dinov2_returns_384_dim_unit_vector():
    loader = make_loader("dinov2", backend="mock")
    frame = np.zeros((224, 224, 3), dtype=np.uint8)
    result = loader.encode(frame)
    assert isinstance(result, LoaderResult)
    assert result.embedding.shape == (384,)
    assert result.embedding.dtype == np.float32
    norm = np.linalg.norm(result.embedding)
    assert 0.99 < norm < 1.01, f"expected unit vector, got norm={norm}"
    assert result.backend_name == "mock"


@pytest.mark.smoke
def test_mock_clip_image_returns_512_dim():
    loader = make_loader("clip", backend="mock")
    result = loader.encode({"image": np.zeros((224, 224, 3), dtype=np.uint8)})
    assert result.embedding.shape == (512,)
    assert result.embedding.dtype == np.float32


@pytest.mark.smoke
def test_mock_clip_text_returns_512_dim():
    loader = make_loader("clip", backend="mock")
    result = loader.encode({"text": "a glitchy video frame"})
    assert result.embedding.shape == (512,)


@pytest.mark.smoke
def test_mock_clap_audio_returns_512_dim():
    loader = make_loader("clap", backend="mock")
    audio = np.zeros(48000 * 3, dtype=np.float32)  # 3s @ 48kHz
    result = loader.encode({"audio": audio, "sample_rate": 48000})
    assert result.embedding.shape == (512,)


@pytest.mark.smoke
def test_mock_clap_text_returns_512_dim():
    loader = make_loader("clap", backend="mock")
    result = loader.encode({"text": "footsteps in snow"})
    assert result.embedding.shape == (512,)


@pytest.mark.smoke
def test_mock_dinov2_is_deterministic_per_loader_instance():
    """Same loader instance + same call → same output (mock has no input dep)."""
    loader = make_loader("dinov2", backend="mock")
    r1 = loader.encode(np.zeros((224, 224, 3), dtype=np.uint8))
    r2 = loader.encode(np.ones((224, 224, 3), dtype=np.uint8))
    # DINOv2 mock seed depends only on revision, so it advances on each call;
    # but two fresh loaders with same entry give same first vector.
    loader2 = make_loader("dinov2", backend="mock")
    r3 = loader2.encode(np.zeros((224, 224, 3), dtype=np.uint8))
    np.testing.assert_array_equal(r1.embedding, r3.embedding)
    # Subsequent calls in same loader produce DIFFERENT (advancing RNG)
    assert not np.array_equal(r1.embedding, r2.embedding)


@pytest.mark.smoke
def test_mock_clip_is_deterministic_per_payload():
    """Same payload → same vector across loader instances."""
    l1 = make_loader("clip", backend="mock")
    l2 = make_loader("clip", backend="mock")
    text = "x glitchy y"
    r1 = l1.encode({"text": text})
    r2 = l2.encode({"text": text})
    np.testing.assert_array_equal(r1.embedding, r2.embedding)
    # Different text → different vector
    r3 = l1.encode({"text": "different prompt"})
    assert not np.array_equal(r1.embedding, r3.embedding)


@pytest.mark.smoke
def test_mock_clap_audio_seed_uses_mean():
    """Two audio arrays with same mean produce same mock vector."""
    loader = make_loader("clap", backend="mock")
    a = np.zeros(48000 * 3, dtype=np.float32)
    b = np.zeros(48000 * 3, dtype=np.float32)
    r1 = loader.encode({"audio": a, "sample_rate": 48000})
    r2 = loader.encode({"audio": b, "sample_rate": 48000})
    np.testing.assert_array_equal(r1.embedding, r2.embedding)


@pytest.mark.smoke
def test_mock_cold_load_seconds_is_zero():
    """Mock loaders don't have a cold-load phase."""
    for name in ("dinov2", "clip", "clap"):
        loader = make_loader(name, backend="mock")
        assert loader.cold_load_seconds == 0.0


@pytest.mark.smoke
def test_mock_loader_does_not_import_torch():
    """PR #3 contract: smoke tier must not transitively import torch.

    If torch is installed locally this test only confirms loaders don't
    require it at import time; if not installed, the import below would
    fail too.
    """
    import sys

    # Snapshot which heavy modules are loaded BEFORE importing loaders.
    heavy = {"torch", "transformers", "mlx", "mlx.core", "huggingface_hub"}
    pre = heavy & set(sys.modules.keys())

    # Re-import loaders (already imported via the test, but importing again
    # is a no-op; we're checking the side-effect contract is preserved).
    from q7_benchmark.loaders import make_loader

    loader = make_loader("dinov2", backend="mock")
    _ = loader.encode(np.zeros((224, 224, 3), dtype=np.uint8))

    post = heavy & set(sys.modules.keys())
    new_loads = post - pre
    assert not new_loads, f"mock path triggered heavy imports: {new_loads}"
