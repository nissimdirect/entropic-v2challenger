"""Shared fixtures for oracle validators.

Oracle tests run `entropic-cli apply` on a known-good input and verify the
output matches a programmatic signature (FFmpeg/OpenCV check, no LLM).

Pattern:
  1. Generate (or reuse) a deterministic test clip
  2. Run cli.cmd_apply on it with one effect
  3. Read first frame of input + output via OpenCV
  4. Assert pixel/FFT/motion signature matches expectation

See plan: ~/.claude/plans/lucid-swarm-loom.md (Part B).
"""

from __future__ import annotations

import subprocess
from pathlib import Path

import cv2
import numpy as np
import pytest

# Where to put generated test clips (cached across runs to keep the suite fast)
_FIXTURE_CACHE = Path(__file__).resolve().parent / "_cache"


def _ffmpeg_testsrc(
    out: Path, duration: int = 2, size: str = "320x240", rate: int = 30
) -> None:
    """Generate a deterministic test pattern via FFmpeg's `testsrc` source."""
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
            f"testsrc=duration={duration}:size={size}:rate={rate}",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            str(out),
        ],
        check=True,
    )


@pytest.fixture(scope="session")
def testsrc_clip() -> Path:
    """A short FFmpeg testsrc clip — colour bars, predictable content."""
    out = _FIXTURE_CACHE / "testsrc_2s_320x240_30fps.mp4"
    if not out.exists():
        _ffmpeg_testsrc(out)
    return out


def first_frame_bgr_mean(path: Path) -> np.ndarray:
    """Return per-channel BGR mean of the first frame."""
    cap = cv2.VideoCapture(str(path))
    ok, frame = cap.read()
    cap.release()
    assert ok and frame is not None, f"could not read first frame of {path}"
    return frame.mean(axis=(0, 1))


def run_cli_apply(
    input_path: Path,
    output_path: Path,
    effect_id: str,
    params: dict | None = None,
) -> None:
    """Invoke entropic-cli apply via subprocess (clean process, no shared state)."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    if output_path.exists():
        output_path.unlink()
    cli = Path(__file__).resolve().parents[2] / "src" / "cli.py"
    cmd = [
        "python3",
        str(cli),
        "apply",
        str(input_path),
        "--effect",
        effect_id,
        "-o",
        str(output_path),
    ]
    if params is not None:
        import json as _json

        cmd.extend(["--params", _json.dumps({effect_id: params})])
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    assert result.returncode == 0, (
        f"cli failed (rc={result.returncode})\n"
        f"stdout: {result.stdout}\n"
        f"stderr: {result.stderr}"
    )
    assert output_path.exists(), (
        f"cli reported success but output missing: {output_path}"
    )
