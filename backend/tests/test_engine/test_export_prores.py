"""Tests for ProRes export via ExportManager."""

import os
import tempfile
import time

import pytest

from engine.codecs import validate_codec_availability
from engine.export import ExportManager, ExportStatus

pytestmark = pytest.mark.skipif(
    not validate_codec_availability("prores_ks"),
    reason="ProRes codec not available",
)


def test_prores_422_export(synthetic_video_path):
    """ProRes 422 export produces a valid .mov file."""
    output_path = tempfile.mktemp(suffix=".mov")
    manager = ExportManager()

    try:
        job = manager.start(
            input_path=synthetic_video_path,
            output_path=output_path,
            chain=[],
            project_seed=42,
            settings={"codec": "prores_422"},
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


def test_prores_4444_export(synthetic_video_path):
    """ProRes 4444 export produces a valid .mov file."""
    output_path = tempfile.mktemp(suffix=".mov")
    manager = ExportManager()

    try:
        job = manager.start(
            input_path=synthetic_video_path,
            output_path=output_path,
            chain=[],
            project_seed=42,
            settings={"codec": "prores_4444"},
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
