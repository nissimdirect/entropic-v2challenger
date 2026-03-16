"""Tests for H.265 export via ExportManager."""

import os
import tempfile
import time

import pytest

from engine.codecs import validate_codec_availability
from engine.export import ExportManager, ExportStatus

pytestmark = pytest.mark.skipif(
    not validate_codec_availability("libx265"),
    reason="H.265 codec not available",
)


def test_h265_export_produces_file(synthetic_video_path):
    """H.265 export produces a non-empty output file."""
    output_path = tempfile.mktemp(suffix=".mp4")
    manager = ExportManager()

    try:
        job = manager.start(
            input_path=synthetic_video_path,
            output_path=output_path,
            chain=[],
            project_seed=42,
            settings={"codec": "h265"},
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


def test_h265_export_with_crf(synthetic_video_path):
    """H.265 export with explicit CRF value completes successfully."""
    output_path = tempfile.mktemp(suffix=".mp4")
    manager = ExportManager()

    try:
        job = manager.start(
            input_path=synthetic_video_path,
            output_path=output_path,
            chain=[],
            project_seed=42,
            settings={"codec": "h265", "crf": 28},
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
