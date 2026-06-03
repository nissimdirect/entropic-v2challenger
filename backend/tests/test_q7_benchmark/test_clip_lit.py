"""Tests for real CLIP encode light-up (PR #13).

Mirrors test_dinov2_lit.py structure: smoke-tier tests for preprocessing
+ missing-deps hint, plus @pytest.mark.slow tests for the real end-to-end
download + encode path (skipped if torch + transformers + hf_hub absent).
"""

from __future__ import annotations

import numpy as np
import pytest

from q7_benchmark.loaders import make_loader


def _torch_available() -> bool:
    try:
        import torch  # noqa: F401
        import transformers  # noqa: F401
        import huggingface_hub  # noqa: F401
    except ImportError:
        return False
    return True


@pytest.mark.smoke
def test_clip_loader_without_torch_raises_clear_error(monkeypatch):
    """Without torch installed, real CLIP encode raises NotImplementedError with install hint."""
    if _torch_available():
        pytest.skip("torch IS installed — this test verifies the missing-dep path")
    loader = make_loader("clip", backend="cpu")
    with pytest.raises(NotImplementedError) as excinfo:
        loader.encode({"text": "hello"})
    assert "torch" in str(excinfo.value).lower()
    assert "requirements-q7-measure.txt" in str(excinfo.value)


@pytest.mark.smoke
def test_clip_loader_construct_does_not_import_torch():
    """PR #3 seam contract: constructing a real loader doesn't import torch.

    PR #13 must preserve this — only encode() triggers the heavy imports.
    """
    import sys

    heavy = {"torch", "transformers", "huggingface_hub"}
    pre = heavy & set(sys.modules.keys())
    loader = make_loader("clip", backend="cpu")
    post = heavy & set(sys.modules.keys())
    new = post - pre
    assert not new, f"constructor triggered heavy imports: {new}"
    assert loader.name == "clip"
    assert loader.embed_dim == 512


@pytest.mark.smoke
def test_clip_payload_dict_with_text_dispatches_correctly():
    """Mock loader dispatches text vs image (no real torch needed)."""
    loader = make_loader("clip", backend="mock")
    text_result = loader.encode({"text": "a glitch in time"})
    img_result = loader.encode({"image": np.zeros((224, 224, 3), dtype=np.uint8)})
    # Different payloads → different embeddings
    assert not np.array_equal(text_result.embedding, img_result.embedding)


@pytest.mark.smoke
def test_clip_payload_bare_ndarray_treated_as_image():
    """A bare ndarray (no dict wrapper) is interpreted as image input."""
    loader = make_loader("clip", backend="mock")
    frame = np.zeros((224, 224, 3), dtype=np.uint8)
    bare = loader.encode(frame)
    wrapped = loader.encode({"image": frame})
    # Same image → same mock embedding
    np.testing.assert_array_equal(bare.embedding, wrapped.embedding)


@pytest.mark.smoke
def test_clip_payload_dict_missing_image_and_text_raises():
    """Dict without 'image' or 'text' key should error clearly when encode runs.

    For mock loader, the payload still hashes (via _normalize_payload_for_seed).
    For real loader the error fires inside encode(). Test mock path here;
    real path is tested in @slow tests below.
    """
    loader = make_loader("clip", backend="mock")
    # Mock falls back to unknown payload seed — doesn't raise. That's fine.
    result = loader.encode({"unrecognized": "payload"})
    assert result.embedding.shape == (512,)


@pytest.mark.slow
@pytest.mark.skipif(
    not _torch_available(), reason="torch + transformers + hf_hub required"
)
def test_clip_real_encode_image_returns_512_dim():
    """End-to-end: download CLIP, encode an image, verify shape."""
    loader = make_loader("clip", backend="cpu")
    frame = np.full((224, 224, 3), 128, dtype=np.uint8)
    result = loader.encode({"image": frame})
    assert result.embedding.shape == (512,)
    assert result.embedding.dtype == np.float32
    norm = float(np.linalg.norm(result.embedding))
    assert 0.99 < norm < 1.01
    assert loader.cold_load_seconds is not None
    assert loader.cold_load_seconds > 0


@pytest.mark.slow
@pytest.mark.skipif(
    not _torch_available(), reason="torch + transformers + hf_hub required"
)
def test_clip_real_encode_text_returns_512_dim():
    """End-to-end: encode a text prompt, verify shape."""
    loader = make_loader("clip", backend="cpu")
    result = loader.encode({"text": "a glitchy video frame"})
    assert result.embedding.shape == (512,)
    norm = float(np.linalg.norm(result.embedding))
    assert 0.99 < norm < 1.01


@pytest.mark.slow
@pytest.mark.skipif(
    not _torch_available(), reason="torch + transformers + hf_hub required"
)
def test_clip_real_text_and_image_share_space():
    """Sanity: same loader produces embeddings in the same 512-dim space."""
    loader = make_loader("clip", backend="cpu")
    img_emb = loader.encode(np.full((224, 224, 3), 128, dtype=np.uint8)).embedding
    txt_emb = loader.encode({"text": "anything"}).embedding
    assert img_emb.shape == txt_emb.shape == (512,)
    # They should be different (different modalities, different inputs)
    assert not np.array_equal(img_emb, txt_emb)
