"""Oracle for the audio-mux path in engine/export.py.

Catches the 2026-04-16 regression where PyAV 16+ removed `add_stream(template=)`
and the engine silently lost audio on every export (try-block caught the error
and logged "Audio mux failed" — user got video without sound).

See: engine/export.py _mux_audio (add_stream_from_template).
"""

from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

from .conftest import _FIXTURE_CACHE, run_cli_apply


@pytest.fixture(scope="session")
def testsrc_with_audio() -> Path:
    """testsrc video with a sine-wave audio track — exercises the mux path."""
    out = _FIXTURE_CACHE / "testsrc_with_audio_1s.mp4"
    if not out.exists():
        out.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-loglevel",
                "error",
                "-f",
                "lavfi",
                "-i",
                "testsrc=duration=1:size=160x120:rate=10",
                "-f",
                "lavfi",
                "-i",
                "sine=frequency=440:duration=1",
                "-c:v",
                "libx264",
                "-pix_fmt",
                "yuv420p",
                "-shortest",
                str(out),
            ],
            check=True,
        )
    return out


def _has_audio_stream(path: Path) -> bool:
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "a",
            "-show_entries",
            "stream=codec_type",
            "-of",
            "csv=p=0",
            str(path),
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    return "audio" in result.stdout


@pytest.mark.oracle
def test_audio_survives_export(testsrc_with_audio: Path, tmp_path: Path) -> None:
    """CLI export must preserve audio track from input."""
    assert _has_audio_stream(testsrc_with_audio), "precondition: input has audio"

    out = tmp_path / "out.mp4"
    run_cli_apply(testsrc_with_audio, out, "fx.color_invert")

    assert _has_audio_stream(out), (
        "audio was lost during export — likely a regression in "
        "engine/export.py:_mux_audio (check add_stream_from_template call)"
    )
