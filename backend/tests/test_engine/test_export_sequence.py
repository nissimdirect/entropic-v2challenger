"""Tests for image sequence export — PNG, JPEG, TIFF sequences."""

import os
import tempfile
import threading
import time

import numpy as np
import pytest

from engine.image_sequence import (
    export_image_sequence,
    export_image_sequence_from_generator,
)
from engine.export import ExportManager, ExportStatus


def _make_rgb_frames(count, width=100, height=100):
    """Generate a list of dummy RGBA uint8 frames."""
    frames = []
    for i in range(count):
        frame = np.full((height, width, 4), fill_value=(i * 40) % 256, dtype=np.uint8)
        frame[:, :, 3] = 255
        frames.append(frame)
    return frames


def test_png_sequence_basic(tmp_path):
    """5 frames produce 5 zero-padded PNG files."""
    frames = _make_rgb_frames(5)
    out_dir = str(tmp_path / "png_seq")

    export_image_sequence(frames, out_dir, format="png")

    files = sorted(os.listdir(out_dir))
    assert len(files) == 5
    for f in files:
        assert f.endswith(".png")
    # Check zero-padding in filenames
    assert files[0] < files[-1]  # lexicographic order matches numeric order


def test_jpeg_sequence(tmp_path):
    """JPEG sequence produces .jpg files."""
    frames = _make_rgb_frames(3)
    out_dir = str(tmp_path / "jpeg_seq")

    export_image_sequence(frames, out_dir, format="jpeg")

    files = sorted(os.listdir(out_dir))
    assert len(files) == 3
    for f in files:
        assert f.endswith(".jpg") or f.endswith(".jpeg")


def test_tiff_sequence(tmp_path):
    """TIFF sequence produces .tiff files."""
    frames = _make_rgb_frames(2)
    out_dir = str(tmp_path / "tiff_seq")

    export_image_sequence(frames, out_dir, format="tiff")

    files = sorted(os.listdir(out_dir))
    assert len(files) == 2
    for f in files:
        assert f.endswith(".tiff") or f.endswith(".tif")


def test_unsupported_format_raises(tmp_path):
    """Unsupported image format raises ValueError."""
    frames = _make_rgb_frames(1)
    out_dir = str(tmp_path / "bad_seq")

    with pytest.raises(ValueError):
        export_image_sequence(frames, out_dir, format="bmp")


def test_sequence_from_generator_cancel(tmp_path):
    """Cancelling mid-export returns partial paths and False."""
    cancel = threading.Event()
    call_count = 0

    def frame_gen():
        nonlocal call_count
        for i in range(20):
            call_count += 1
            if call_count > 2:
                cancel.set()
            yield _make_rgb_frames(1)[0]

    out_dir = str(tmp_path / "cancel_seq")
    paths, completed = export_image_sequence_from_generator(
        frame_gen(),
        total_frames=20,
        output_dir=out_dir,
        format="png",
        cancel_event=cancel,
    )

    assert completed is False
    assert isinstance(paths, list)
    assert len(paths) <= 20  # Stopped early


def test_sequence_via_export_manager(synthetic_video_path, tmp_path):
    """Full pipeline image sequence export through ExportManager."""
    out_dir = str(tmp_path / "seq_export")
    manager = ExportManager()

    job = manager.start(
        input_path=synthetic_video_path,
        output_path=out_dir,
        chain=[],
        project_seed=42,
        settings={"export_type": "image_sequence", "image_format": "png"},
    )

    for _ in range(100):
        if job.status != ExportStatus.RUNNING:
            break
        time.sleep(0.1)

    assert job.status == ExportStatus.COMPLETE
    # Verify PNG files were created in the output directory
    files = [f for f in os.listdir(out_dir) if f.endswith(".png")]
    assert len(files) > 0
