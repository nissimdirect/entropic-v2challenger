"""Tests for real DINOv2 encode light-up (PR #6).

These tests are marked @pytest.mark.slow because they may download
~22MB of DINOv2 weights on first run. CI smoke skips them via
`-m "smoke and not slow"`.

To run locally:
    pytest tests/test_q7_benchmark/test_dinov2_lit.py -m slow -v

Skipped automatically when torch/transformers/huggingface_hub aren't
installed (smoke-tier environment).
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
def test_dinov2_loader_without_torch_raises_clear_error(monkeypatch):
    """Without torch installed, real encode raises NotImplementedError with install hint."""
    if _torch_available():
        pytest.skip("torch IS installed — this test verifies the missing-dep path")
    loader = make_loader("dinov2", backend="cpu")
    with pytest.raises(NotImplementedError) as excinfo:
        loader.encode(np.zeros((224, 224, 3), dtype=np.uint8))
    assert "torch" in str(excinfo.value).lower()
    assert "requirements-q7-measure.txt" in str(excinfo.value)


@pytest.mark.smoke
def test_preprocess_grayscale_input_handled():
    """Without invoking the model, the preprocessor accepts 2D input."""
    from q7_benchmark.loaders.dinov2 import _preprocess_frame

    grayscale = np.zeros((480, 640), dtype=np.uint8)
    out = _preprocess_frame(grayscale)
    assert out.shape == (1, 3, 224, 224)
    assert out.dtype == np.float32


@pytest.mark.smoke
def test_preprocess_rgba_input_handled():
    from q7_benchmark.loaders.dinov2 import _preprocess_frame

    rgba = np.zeros((480, 640, 4), dtype=np.uint8)
    out = _preprocess_frame(rgba)
    assert out.shape == (1, 3, 224, 224)


@pytest.mark.smoke
def test_preprocess_imagenet_normalized():
    """Output must be roughly mean-zero (ImageNet-normalized zeros become ~ -mean/std)."""
    from q7_benchmark.loaders.dinov2 import _preprocess_frame

    out = _preprocess_frame(np.zeros((224, 224, 3), dtype=np.uint8))
    # The zero input pixel = -mean/std after normalization. Mean shouldn't
    # be near 0 (it's the normalized representation of 0 pixels).
    assert -3.0 < out.mean() < 0.0  # roughly negative bias from normalization


@pytest.mark.smoke
def test_preprocess_rejects_invalid_channel_count():
    from q7_benchmark.loaders.dinov2 import _preprocess_frame

    weird = np.zeros((100, 100, 5), dtype=np.uint8)  # 5 channels?
    with pytest.raises(ValueError, match="3"):
        _preprocess_frame(weird)


@pytest.mark.slow
@pytest.mark.skipif(
    not _torch_available(), reason="torch + transformers + hf_hub required"
)
def test_dinov2_real_encode_returns_384_dim():
    """Full end-to-end: load real model, encode a frame, verify shape.

    First run downloads ~22MB to ~/.entropic/models/q7/dinov2/.
    Subsequent runs use the cache.
    """
    loader = make_loader("dinov2", backend="cpu")
    frame = np.full((224, 224, 3), 128, dtype=np.uint8)
    result = loader.encode(frame)
    assert result.embedding.shape == (384,)
    assert result.embedding.dtype == np.float32
    # Unit-normalized
    norm = float(np.linalg.norm(result.embedding))
    assert 0.99 < norm < 1.01
    # Cold-load was captured
    assert loader.cold_load_seconds is not None
    assert loader.cold_load_seconds > 0


@pytest.mark.slow
@pytest.mark.skipif(
    not _torch_available(), reason="torch + transformers + hf_hub required"
)
def test_dinov2_real_encode_second_call_skips_cold_load():
    """After first encode, cold_load_seconds is set; second encode is faster."""
    loader = make_loader("dinov2", backend="cpu")
    frame = np.full((224, 224, 3), 128, dtype=np.uint8)
    first = loader.encode(frame)
    cold = loader.cold_load_seconds
    second = loader.encode(frame)
    # cold_load_seconds persists; second encode is steady-state
    assert loader.cold_load_seconds == cold
    # Second call is at most as slow as first; typically much faster
    assert second.elapsed_ms <= first.elapsed_ms + 100
