"""Tests for real CLAP encode light-up (PR #14).

Mirrors test_dinov2_lit.py and test_clip_lit.py: smoke + @slow tiers.
Real encode @slow tests download ~300MB on first run.
"""

from __future__ import annotations

import numpy as np
import pytest

from q7_benchmark.loaders import make_loader
from q7_benchmark.loaders.clap import (
    CLAP_MIN_DURATION_S,
    CLAP_MIN_SAMPLES,
    CLAP_SAMPLE_RATE,
)


def _torch_available() -> bool:
    try:
        import torch  # noqa: F401
        import transformers  # noqa: F401
        import huggingface_hub  # noqa: F401
    except ImportError:
        return False
    return True


@pytest.mark.smoke
def test_clap_constants_match_spec():
    """Sentinel — DEC-Q7-005 + DEC-Q7-006 spec."""
    assert CLAP_SAMPLE_RATE == 48000
    assert CLAP_MIN_DURATION_S == 3.0
    assert CLAP_MIN_SAMPLES == 48000 * 3


@pytest.mark.smoke
def test_clap_loader_without_torch_raises_clear_error(monkeypatch):
    if _torch_available():
        pytest.skip("torch IS installed — this test verifies the missing-dep path")
    loader = make_loader("clap", backend="cpu")
    with pytest.raises(NotImplementedError) as excinfo:
        loader.encode({"text": "footsteps in snow"})
    assert "torch" in str(excinfo.value).lower()
    assert "requirements-q7-measure.txt" in str(excinfo.value)


@pytest.mark.smoke
def test_clap_loader_construct_does_not_import_torch():
    import sys

    heavy = {"torch", "transformers", "huggingface_hub"}
    pre = heavy & set(sys.modules.keys())
    loader = make_loader("clap", backend="cpu")
    post = heavy & set(sys.modules.keys())
    new = post - pre
    assert not new, f"constructor triggered heavy imports: {new}"
    assert loader.name == "clap"
    assert loader.embed_dim == 512


@pytest.mark.smoke
def test_clap_payload_dict_with_text_dispatches():
    loader = make_loader("clap", backend="mock")
    text_result = loader.encode({"text": "wind in trees"})
    audio_result = loader.encode(
        {"audio": np.zeros(CLAP_MIN_SAMPLES, dtype=np.float32), "sample_rate": 48000}
    )
    assert not np.array_equal(text_result.embedding, audio_result.embedding)


@pytest.mark.slow
@pytest.mark.skipif(
    not _torch_available(), reason="torch + transformers + hf_hub required"
)
def test_clap_real_encode_audio_returns_512_dim():
    loader = make_loader("clap", backend="cpu")
    audio = np.zeros(CLAP_MIN_SAMPLES, dtype=np.float32)
    result = loader.encode({"audio": audio, "sample_rate": 48000})
    assert result.embedding.shape == (512,)
    norm = float(np.linalg.norm(result.embedding))
    assert 0.99 < norm < 1.01


@pytest.mark.slow
@pytest.mark.skipif(
    not _torch_available(), reason="torch + transformers + hf_hub required"
)
def test_clap_real_encode_text_returns_512_dim():
    loader = make_loader("clap", backend="cpu")
    result = loader.encode({"text": "a glitchy synth bass"})
    assert result.embedding.shape == (512,)
    norm = float(np.linalg.norm(result.embedding))
    assert 0.99 < norm < 1.01


@pytest.mark.slow
@pytest.mark.skipif(
    not _torch_available(), reason="torch + transformers + hf_hub required"
)
def test_clap_real_rejects_wrong_sample_rate():
    loader = make_loader("clap", backend="cpu")
    audio = np.zeros(int(44100 * 3), dtype=np.float32)
    with pytest.raises(ValueError, match="48000"):
        loader.encode({"audio": audio, "sample_rate": 44100})


@pytest.mark.slow
@pytest.mark.skipif(
    not _torch_available(), reason="torch + transformers + hf_hub required"
)
def test_clap_real_rejects_too_short_audio():
    loader = make_loader("clap", backend="cpu")
    audio = np.zeros(int(48000 * 1.0), dtype=np.float32)  # 1s < 3s minimum
    with pytest.raises(ValueError, match="3.0s|minimum|short"):
        loader.encode({"audio": audio, "sample_rate": 48000})


@pytest.mark.slow
@pytest.mark.skipif(
    not _torch_available(), reason="torch + transformers + hf_hub required"
)
def test_clap_real_stereo_to_mono_via_mean():
    """Stereo audio gets converted to mono via channel-mean."""
    loader = make_loader("clap", backend="cpu")
    stereo = np.zeros((CLAP_MIN_SAMPLES, 2), dtype=np.float32)
    result = loader.encode({"audio": stereo, "sample_rate": 48000})
    assert result.embedding.shape == (512,)


@pytest.mark.slow
@pytest.mark.skipif(
    not _torch_available(), reason="torch + transformers + hf_hub required"
)
def test_clap_real_audio_and_text_share_space():
    loader = make_loader("clap", backend="cpu")
    audio_emb = loader.encode(
        {"audio": np.zeros(CLAP_MIN_SAMPLES, dtype=np.float32), "sample_rate": 48000}
    ).embedding
    text_emb = loader.encode({"text": "silence"}).embedding
    assert audio_emb.shape == text_emb.shape == (512,)
    assert not np.array_equal(audio_emb, text_emb)
