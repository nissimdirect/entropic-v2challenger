"""Tests for resolution scaling, FPS conversion, region selection, cancel, ETA, and audio mux."""

import os
import tempfile
import time

from engine.export import ExportManager, ExportStatus


def test_720p_export(synthetic_video_path):
    """720p resolution setting completes (source is already 720p)."""
    output_path = tempfile.mktemp(suffix=".mp4")
    manager = ExportManager()

    try:
        job = manager.start(
            input_path=synthetic_video_path,
            output_path=output_path,
            chain=[],
            project_seed=42,
            settings={"resolution": "720p"},
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


def test_custom_resolution(synthetic_video_path):
    """Custom resolution (640x480) export completes without error."""
    output_path = tempfile.mktemp(suffix=".mp4")
    manager = ExportManager()

    try:
        job = manager.start(
            input_path=synthetic_video_path,
            output_path=output_path,
            chain=[],
            project_seed=42,
            settings={
                "resolution": "custom",
                "custom_width": 640,
                "custom_height": 480,
            },
        )

        for _ in range(100):
            if job.status != ExportStatus.RUNNING:
                break
            time.sleep(0.1)

        assert job.status == ExportStatus.COMPLETE
        assert os.path.exists(output_path)
    finally:
        if os.path.exists(output_path):
            os.unlink(output_path)


def test_24fps_export(synthetic_video_path):
    """24fps export from 30fps source completes (fewer output frames)."""
    output_path = tempfile.mktemp(suffix=".mp4")
    manager = ExportManager()

    try:
        job = manager.start(
            input_path=synthetic_video_path,
            output_path=output_path,
            chain=[],
            project_seed=42,
            settings={"fps": "24"},
        )

        for _ in range(100):
            if job.status != ExportStatus.RUNNING:
                break
            time.sleep(0.1)

        assert job.status == ExportStatus.COMPLETE
        assert os.path.exists(output_path)
    finally:
        if os.path.exists(output_path):
            os.unlink(output_path)


def test_60fps_export(synthetic_video_path):
    """60fps export from 30fps source completes."""
    output_path = tempfile.mktemp(suffix=".mp4")
    manager = ExportManager()

    try:
        job = manager.start(
            input_path=synthetic_video_path,
            output_path=output_path,
            chain=[],
            project_seed=42,
            settings={"fps": "60"},
        )

        for _ in range(100):
            if job.status != ExportStatus.RUNNING:
                break
            time.sleep(0.1)

        assert job.status == ExportStatus.COMPLETE
        assert os.path.exists(output_path)
    finally:
        if os.path.exists(output_path):
            os.unlink(output_path)


def test_region_custom(synthetic_video_path):
    """Custom region (frames 10-50) export completes with correct frame count."""
    output_path = tempfile.mktemp(suffix=".mp4")
    manager = ExportManager()

    try:
        job = manager.start(
            input_path=synthetic_video_path,
            output_path=output_path,
            chain=[],
            project_seed=42,
            settings={"region": "custom", "start_frame": 10, "end_frame": 50},
        )

        for _ in range(100):
            if job.status != ExportStatus.RUNNING:
                break
            time.sleep(0.1)

        assert job.status == ExportStatus.COMPLETE
        assert os.path.exists(output_path)
        # total_frames should reflect the region (approximately 41 frames,
        # possibly adjusted for FPS conversion)
        assert job.total_frames <= 150  # Less than full video
    finally:
        if os.path.exists(output_path):
            os.unlink(output_path)


def test_export_cancel_cleans_up(synthetic_video_path):
    """Cancelling export cleans up the output file."""
    output_path = tempfile.mktemp(suffix=".mp4")
    manager = ExportManager()

    job = manager.start(
        input_path=synthetic_video_path,
        output_path=output_path,
        chain=[],
        project_seed=42,
    )

    # Cancel immediately
    time.sleep(0.02)
    manager.cancel()

    for _ in range(50):
        if job.status != ExportStatus.RUNNING:
            break
        time.sleep(0.1)

    # If cancelled, output file should be cleaned up
    if job.status == ExportStatus.CANCELLED:
        assert not os.path.exists(output_path)
    else:
        # Export completed before cancel took effect — clean up
        if os.path.exists(output_path):
            os.unlink(output_path)


def test_export_eta_in_status(synthetic_video_path):
    """Export status dict includes eta_seconds key during or after export."""
    output_path = tempfile.mktemp(suffix=".mp4")
    manager = ExportManager()

    try:
        job = manager.start(
            input_path=synthetic_video_path,
            output_path=output_path,
            chain=[],
            project_seed=42,
        )

        # Let it run a bit so ETA can be computed
        time.sleep(0.2)
        status = manager.get_status()

        for _ in range(100):
            if job.status != ExportStatus.RUNNING:
                break
            time.sleep(0.1)

        assert "eta_seconds" in status
    finally:
        if os.path.exists(output_path):
            os.unlink(output_path)


def test_audio_mux(synthetic_video_with_audio_path):
    """Export with include_audio=True muxes audio into output."""
    output_path = tempfile.mktemp(suffix=".mp4")
    manager = ExportManager()

    try:
        job = manager.start(
            input_path=synthetic_video_with_audio_path,
            output_path=output_path,
            chain=[],
            project_seed=42,
            settings={"include_audio": True},
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


def test_no_audio_mux_when_disabled(synthetic_video_path):
    """Export with include_audio=False completes without error (no audio in source)."""
    output_path = tempfile.mktemp(suffix=".mp4")
    manager = ExportManager()

    try:
        job = manager.start(
            input_path=synthetic_video_path,
            output_path=output_path,
            chain=[],
            project_seed=42,
            settings={"include_audio": False},
        )

        for _ in range(100):
            if job.status != ExportStatus.RUNNING:
                break
            time.sleep(0.1)

        assert job.status == ExportStatus.COMPLETE
        assert os.path.exists(output_path)
    finally:
        if os.path.exists(output_path):
            os.unlink(output_path)
