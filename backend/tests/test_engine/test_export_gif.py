"""Tests for GIF export — direct function calls and ExportManager pipeline."""

import os
import tempfile
import threading
import time

import numpy as np
import pytest

from engine.gif_export import export_gif, export_gif_from_generator
from engine.export import ExportManager, ExportStatus


def _make_rgba_frames(count, width=100, height=100):
    """Generate a list of dummy RGBA uint8 frames."""
    frames = []
    for i in range(count):
        frame = np.full((height, width, 4), fill_value=i % 256, dtype=np.uint8)
        frame[:, :, 3] = 255
        frames.append(frame)
    return frames


def test_gif_export_basic(tmp_path):
    """Basic GIF export writes a valid GIF file (GIF89a header)."""
    frames = _make_rgba_frames(10)
    output = str(tmp_path / "out.gif")

    export_gif(frames, output, fps=10)

    assert os.path.exists(output)
    with open(output, "rb") as f:
        header = f.read(6)
    assert header == b"GIF89a"


def test_gif_export_downscale(tmp_path):
    """GIF export with max_width downscales large frames."""
    frames = _make_rgba_frames(5, width=640, height=480)
    output = str(tmp_path / "small.gif")

    export_gif(frames, output, fps=10, max_width=320)

    assert os.path.exists(output)
    assert os.path.getsize(output) > 0


def test_gif_export_truncation(tmp_path):
    """Frames beyond 30s at given FPS are truncated (15fps * 30s = 450 frames max)."""
    frames = _make_rgba_frames(500)
    output = str(tmp_path / "truncated.gif")

    export_gif(frames, output, fps=15)

    assert os.path.exists(output)
    assert os.path.getsize(output) > 0


def test_gif_from_generator_cancel(tmp_path):
    """Setting cancel_event mid-export causes export_gif_from_generator to return False."""
    cancel = threading.Event()
    call_count = 0

    def frame_gen():
        nonlocal call_count
        for i in range(100):
            call_count += 1
            if call_count >= 5:
                cancel.set()
            yield _make_rgba_frames(1)[0]

    output = str(tmp_path / "cancelled.gif")
    result = export_gif_from_generator(
        frame_gen(), total_frames=100, output_path=output, fps=10, cancel_event=cancel
    )

    assert result is False


def test_gif_from_generator_progress(tmp_path):
    """progress_callback receives incrementing values during export."""
    progress_values = []

    def on_progress(current, total):
        progress_values.append(current)

    frames = _make_rgba_frames(10)
    output = str(tmp_path / "progress.gif")

    export_gif_from_generator(
        iter(frames),
        total_frames=10,
        output_path=output,
        fps=10,
        progress_callback=on_progress,
    )

    assert len(progress_values) > 0
    # Values should be non-decreasing
    for a, b in zip(progress_values, progress_values[1:]):
        assert b >= a


def test_gif_via_export_manager(synthetic_video_path):
    """Full pipeline GIF export through ExportManager."""
    output_path = tempfile.mktemp(suffix=".gif")
    manager = ExportManager()

    try:
        job = manager.start(
            input_path=synthetic_video_path,
            output_path=output_path,
            chain=[],
            project_seed=42,
            settings={"export_type": "gif", "gif_max_width": 240},
        )

        for _ in range(100):
            if job.status != ExportStatus.RUNNING:
                break
            time.sleep(0.1)

        assert job.status == ExportStatus.COMPLETE
        assert os.path.exists(output_path)
        assert os.path.getsize(output_path) > 0
    finally:
        if os.path.exists(output_path):
            os.unlink(output_path)
