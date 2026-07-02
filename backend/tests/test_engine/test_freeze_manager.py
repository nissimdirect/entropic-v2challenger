"""Tests for engine.freeze — FreezeManager cache lifecycle."""

import shutil
from pathlib import Path

import numpy as np
import pytest

pytestmark = pytest.mark.smoke

from engine.freeze import FreezeManager


@pytest.fixture
def freeze_dir(home_tmp_path):
    """Isolated freeze cache directory."""
    d = home_tmp_path / "freeze_test"
    d.mkdir()
    yield str(d)
    shutil.rmtree(d, ignore_errors=True)


@pytest.fixture
def manager(freeze_dir):
    mgr = FreezeManager(cache_dir=freeze_dir)
    yield mgr
    mgr.reset()


def test_freeze_prefix_creates_cache_dir(manager, synthetic_video_path, freeze_dir):
    """Freezing creates a subdirectory in the cache dir."""
    cache_id = manager.freeze_prefix(
        synthetic_video_path,
        [{"effect_id": "fx.invert", "params": {}}],
        project_seed=42,
        frame_count=3,
        resolution=(1280, 720),
    )
    assert cache_id
    cache_dir = Path(freeze_dir) / cache_id
    assert cache_dir.exists()
    assert cache_dir.is_dir()


def test_freeze_prefix_frame_count(manager, synthetic_video_path, freeze_dir):
    """Correct number of JPEG files written."""
    frame_count = 5
    cache_id = manager.freeze_prefix(
        synthetic_video_path,
        [{"effect_id": "fx.invert", "params": {}}],
        project_seed=42,
        frame_count=frame_count,
        resolution=(1280, 720),
    )
    frame_dir = Path(freeze_dir) / cache_id
    jpg_files = list(frame_dir.glob("frame_*.jpg"))
    assert len(jpg_files) == frame_count


def test_read_cached_frame_matches_direct(manager, synthetic_video_path):
    """Cached frame matches what apply_chain would produce directly."""
    from engine.pipeline import apply_chain
    from video.reader import VideoReader

    chain = [{"effect_id": "fx.invert", "params": {}}]
    cache_id = manager.freeze_prefix(
        synthetic_video_path,
        chain,
        project_seed=42,
        frame_count=3,
        resolution=(1280, 720),
    )

    # Read frame 0 from cache (returns RGB)
    cached = manager.read_cached_frame(cache_id, 0)
    assert cached.ndim == 3
    assert cached.dtype == np.uint8

    # Apply chain directly
    reader = VideoReader(synthetic_video_path)
    frame = reader.decode_frame(0)
    reader.close()
    direct, _ = apply_chain(frame, chain, 42, 0, (1280, 720))

    # Compare RGB channels (JPEG compression causes minor diffs)
    diff = np.abs(cached.astype(int) - direct[:, :, :3].astype(int))
    assert diff.mean() < 5.0, f"Mean diff {diff.mean()} too high (JPEG tolerance)"


def test_read_cached_frame_invalid_index(manager, synthetic_video_path):
    """Out-of-bounds frame index raises IndexError."""
    cache_id = manager.freeze_prefix(
        synthetic_video_path,
        [{"effect_id": "fx.invert", "params": {}}],
        project_seed=42,
        frame_count=3,
        resolution=(1280, 720),
    )
    with pytest.raises(IndexError):
        manager.read_cached_frame(cache_id, 999)

    with pytest.raises(IndexError):
        manager.read_cached_frame(cache_id, -1)


def test_invalidate_removes_files(manager, synthetic_video_path, freeze_dir):
    """Invalidating a cache removes the directory."""
    cache_id = manager.freeze_prefix(
        synthetic_video_path,
        [{"effect_id": "fx.invert", "params": {}}],
        project_seed=42,
        frame_count=2,
        resolution=(1280, 720),
    )
    cache_dir = Path(freeze_dir) / cache_id
    assert cache_dir.exists()

    manager.invalidate(cache_id)
    assert not cache_dir.exists()
    assert manager.get_cache_info(cache_id) is None


def test_invalidate_unknown_id(manager):
    """Invalidating unknown cache is a no-op."""
    manager.invalidate("nonexistent_cache_id")  # Should not raise


def test_flatten_creates_video(manager, synthetic_video_path, home_tmp_path):
    """Flatten produces a valid video file."""
    cache_id = manager.freeze_prefix(
        synthetic_video_path,
        [{"effect_id": "fx.invert", "params": {}}],
        project_seed=42,
        frame_count=5,
        resolution=(1280, 720),
    )
    output_path = str(home_tmp_path / "flattened.mp4")
    result = manager.flatten(cache_id, output_path, fps=30)
    assert result == output_path
    assert Path(output_path).exists()
    assert Path(output_path).stat().st_size > 0

    # Probe the output to verify it's a valid video
    from video.ingest import probe

    meta = probe(output_path)
    assert meta["frame_count"] == 5
    assert meta["width"] == 1280
    assert meta["height"] == 720


def test_double_freeze_returns_same_id(manager, synthetic_video_path):
    """Same (asset, chain, seed) returns the same cache_id — idempotent."""
    chain = [{"effect_id": "fx.invert", "params": {}}]
    kwargs = dict(
        asset_path=synthetic_video_path,
        chain=chain,
        project_seed=42,
        frame_count=3,
        resolution=(1280, 720),
    )
    id1 = manager.freeze_prefix(**kwargs)
    id2 = manager.freeze_prefix(**kwargs)
    assert id1 == id2


def test_reset_clears_all(manager, synthetic_video_path, freeze_dir):
    """After reset(), all caches are gone."""
    cache_id = manager.freeze_prefix(
        synthetic_video_path,
        [{"effect_id": "fx.invert", "params": {}}],
        project_seed=42,
        frame_count=2,
        resolution=(1280, 720),
    )
    assert manager.get_cache_info(cache_id) is not None

    manager.reset()
    assert manager.get_cache_info(cache_id) is None
    # Cache directory should be cleaned up
    cache_dir = Path(freeze_dir) / cache_id
    assert not cache_dir.exists()
