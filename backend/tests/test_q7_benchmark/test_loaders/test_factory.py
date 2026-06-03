"""Test the make_loader factory: name validation, backend dispatch, registry."""

from __future__ import annotations

import numpy as np
import pytest

from q7_benchmark.loaders import (
    KNOWN_MODELS,
    Loader,
    LoaderResult,
    ModelEntry,
    load_model_registry,
    make_loader,
)


@pytest.mark.smoke
def test_registry_has_three_models():
    reg = load_model_registry()
    assert set(reg.keys()) == {"dinov2", "clip", "clap"}
    assert reg["dinov2"].embed_dim == 384
    assert reg["clip"].embed_dim == 512
    assert reg["clap"].embed_dim == 512


@pytest.mark.smoke
def test_known_models_constant_matches_registry():
    assert KNOWN_MODELS == set(load_model_registry().keys())


@pytest.mark.smoke
@pytest.mark.parametrize("name", ["dinov2", "clip", "clap"])
def test_mock_backend_returns_loader(name):
    loader = make_loader(name, backend="mock")
    assert isinstance(loader, Loader)
    assert loader.name == name
    assert loader.modality in {"vision", "vision_text", "audio_text"}


@pytest.mark.smoke
def test_invalid_name_raises():
    with pytest.raises(ValueError, match="unknown model"):
        make_loader("not_a_model", backend="mock")


@pytest.mark.smoke
@pytest.mark.parametrize("backend", ["mlx", "mps", "cpu"])
def test_real_backend_loader_seam_does_not_load_models(backend):
    """Constructing a real loader must NOT import torch/mlx (PR #3 seam).

    PR #6 lights up DINOv2 encode, so we use CLIP (still a stub) to
    verify the seam still works for non-DINOv2 backbones.
    """
    loader = make_loader("clip", backend=backend)
    assert loader.name == "clip"
    # cold_load_seconds is None until first real encode
    assert loader.cold_load_seconds is None
    # CLIP encode still raises NotImplementedError in PR #6 (only DINOv2 lit)
    with pytest.raises(NotImplementedError, match="PR #4"):
        loader.encode({"image": np.zeros((224, 224, 3), dtype=np.uint8)})


@pytest.mark.smoke
def test_model_entry_modality_alignment():
    reg = load_model_registry()
    assert reg["dinov2"].modality == "vision"
    assert reg["clip"].modality == "vision_text"
    assert reg["clap"].modality == "audio_text"


@pytest.mark.smoke
def test_model_entry_is_frozen():
    reg = load_model_registry()
    with pytest.raises(Exception):  # FrozenInstanceError
        reg["dinov2"].revision = "tampered"  # type: ignore[misc]
