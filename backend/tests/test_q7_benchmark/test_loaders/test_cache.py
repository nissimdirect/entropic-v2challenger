"""Test cache resolution + SHA-256 manifest verification."""

from __future__ import annotations

import json
import os

import pytest

from q7_benchmark.loaders import ModelIntegrityError
from q7_benchmark.loaders.cache import (
    cache_root,
    compute_sha256,
    list_weight_files,
    load_verified_marker,
    resolve_cache_dir,
    verify_manifest,
    write_verified_marker,
)


@pytest.fixture
def temp_cache_dir(tmp_path, monkeypatch):
    """Redirect cache_root to a tmp_path for isolation."""
    monkeypatch.setenv("ENTROPIC_Q7_CACHE_DIR", str(tmp_path))
    return tmp_path


@pytest.mark.smoke
def test_cache_root_honors_env_override(temp_cache_dir):
    assert cache_root() == temp_cache_dir


@pytest.mark.smoke
def test_cache_root_defaults_to_home_dot_entropic(monkeypatch):
    monkeypatch.delenv("ENTROPIC_Q7_CACHE_DIR", raising=False)
    root = cache_root()
    assert root.name == "q7"
    assert root.parent.name == "models"
    assert root.parent.parent.name == ".entropic"


@pytest.mark.smoke
def test_resolve_cache_dir_creates_idempotent(temp_cache_dir):
    p1 = resolve_cache_dir("dinov2", "abcdef123456789")
    p2 = resolve_cache_dir("dinov2", "abcdef123456789")
    assert p1 == p2
    assert p1.exists() and p1.is_dir()
    # Path uses first 12 chars of revision
    assert p1.name == "abcdef123456"


@pytest.mark.smoke
def test_resolve_cache_dir_rejects_empty_args(temp_cache_dir):
    with pytest.raises(ValueError):
        resolve_cache_dir("", "abc123")
    with pytest.raises(ValueError):
        resolve_cache_dir("dinov2", "")


@pytest.mark.smoke
def test_compute_sha256_known_value(tmp_path):
    f = tmp_path / "hello.bin"
    f.write_bytes(b"hello world")
    # Pre-computed: sha256("hello world")
    expected = "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9"
    assert compute_sha256(f) == expected


@pytest.mark.smoke
def test_verify_manifest_empty_is_noop(temp_cache_dir):
    """PR #3 contract: empty manifest = placeholder state, no-op."""
    cache_dir = resolve_cache_dir("dinov2", "placeholder1234")
    verify_manifest(cache_dir, {})  # must not raise


@pytest.mark.smoke
def test_verify_manifest_passes_on_match(temp_cache_dir):
    cache_dir = resolve_cache_dir("dinov2", "match-revision1")
    weights = cache_dir / "model.safetensors"
    weights.write_bytes(b"fake weights")
    sha = compute_sha256(weights)
    verify_manifest(cache_dir, {"model.safetensors": sha})


@pytest.mark.smoke
def test_verify_manifest_raises_on_mismatch(temp_cache_dir):
    cache_dir = resolve_cache_dir("dinov2", "mismatch-rev123")
    weights = cache_dir / "model.safetensors"
    weights.write_bytes(b"fake weights")
    wrong_sha = "0" * 64
    with pytest.raises(ModelIntegrityError) as excinfo:
        verify_manifest(cache_dir, {"model.safetensors": wrong_sha})
    assert "model.safetensors" in excinfo.value.file


@pytest.mark.smoke
def test_verify_manifest_raises_on_missing_file(temp_cache_dir):
    cache_dir = resolve_cache_dir("dinov2", "missing-rev0123")
    with pytest.raises(ModelIntegrityError) as excinfo:
        verify_manifest(cache_dir, {"nonexistent.safetensors": "abc"})
    assert "<missing>" in excinfo.value.actual_sha


@pytest.mark.smoke
def test_verified_marker_round_trip(temp_cache_dir):
    cache_dir = resolve_cache_dir("dinov2", "round-trip-rev1")
    manifest = {"model.safetensors": "deadbeef" * 8}
    write_verified_marker(cache_dir, manifest, backend_name="mps")
    marker = load_verified_marker(cache_dir)
    assert marker is not None
    assert marker["manifest_sha256"] == manifest
    assert marker["backend_used_at_verification"] == "mps"
    assert "verified_at" in marker


@pytest.mark.smoke
def test_load_verified_marker_returns_none_when_missing(temp_cache_dir):
    cache_dir = resolve_cache_dir("dinov2", "no-marker-rev01")
    assert load_verified_marker(cache_dir) is None


@pytest.mark.smoke
def test_list_weight_files_finds_extensions(temp_cache_dir):
    cache_dir = resolve_cache_dir("dinov2", "list-weights-rev")
    (cache_dir / "model.safetensors").write_bytes(b"a")
    (cache_dir / "model.bin").write_bytes(b"b")
    (cache_dir / "extra.pt").write_bytes(b"c")
    (cache_dir / "config.json").write_text("{}")  # not a weight file
    weight_names = {p.name for p in list_weight_files(cache_dir)}
    assert weight_names == {"model.safetensors", "model.bin", "extra.pt"}
