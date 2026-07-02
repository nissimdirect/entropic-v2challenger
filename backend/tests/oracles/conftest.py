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
    """A short FFmpeg testsrc clip — colour bars, predictable content.

    Best for effects whose signature is a per-pixel transform (color invert,
    blur, channel destroy). Bad for effects that need within-segment
    brightness variation to do anything (e.g. pixel sort) — see mandelbrot_clip.
    """
    out = _FIXTURE_CACHE / "testsrc_2s_320x240_30fps.mp4"
    if not out.exists():
        _ffmpeg_testsrc(out)
    return out


@pytest.fixture(scope="session")
def mandelbrot_clip() -> Path:
    """A short FFmpeg mandelbrot clip — fractal gradient with rich brightness variation.

    Best for effects that rearrange or sort pixels based on luminance
    (pixel sort, datamosh, generation_loss).
    """
    out = _FIXTURE_CACHE / "mandelbrot_2s_320x240_30fps.mp4"
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
                "mandelbrot=size=320x240:rate=30",
                "-t",
                "2",
                "-c:v",
                "libx264",
                "-pix_fmt",
                "yuv420p",
                str(out),
            ],
            check=True,
        )
    return out


def first_frame_bgr_mean(path: Path) -> np.ndarray:
    """Return per-channel BGR mean of the first frame."""
    cap = cv2.VideoCapture(str(path))
    ok, frame = cap.read()
    cap.release()
    assert ok and frame is not None, f"could not read first frame of {path}"
    return frame.mean(axis=(0, 1))


def first_frame_bgr(path: Path) -> np.ndarray:
    """Return the first frame as a BGR uint8 array (H, W, 3)."""
    cap = cv2.VideoCapture(str(path))
    ok, frame = cap.read()
    cap.release()
    assert ok and frame is not None, f"could not read first frame of {path}"
    return frame


def per_pixel_l1_distance(path_a: Path, path_b: Path) -> float:
    """Mean per-pixel absolute difference between first frames of two videos.

    Sensitive to permutations — pixelsort, glitch, datamosh all move pixels
    around without changing channel means, so this is the right metric for
    'did the effect actually mutate the image'.
    """
    a = first_frame_bgr(path_a).astype(np.int16)
    b = first_frame_bgr(path_b).astype(np.int16)
    if a.shape != b.shape:
        raise AssertionError(f"frame shape mismatch: {a.shape} vs {b.shape}")
    return float(np.abs(a - b).mean())


def nth_frame_l1_distance(path_a: Path, path_b: Path, n: int = 10) -> float:
    """Mean per-pixel L1 distance at frame N.

    Use for temporal effects whose first frame is often pass-through — state
    accumulates by frame 10-30, revealing the effect's signature.
    """

    def _nth(path: Path) -> np.ndarray:
        cap = cv2.VideoCapture(str(path))
        frame = None
        for _ in range(n + 1):
            ok, frame = cap.read()
            if not ok:
                break
        cap.release()
        assert frame is not None, f"could not read frame {n} of {path}"
        return frame

    a = _nth(path_a).astype(np.int16)
    b = _nth(path_b).astype(np.int16)
    if a.shape != b.shape:
        raise AssertionError(f"frame shape mismatch at n={n}: {a.shape} vs {b.shape}")
    return float(np.abs(a - b).mean())


def laplacian_variance(path: Path) -> float:
    """Sharpness signal — high-frequency content. Blur reduces this drastically."""
    frame = first_frame_bgr(path)
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())


def row_transitions(path: Path, n_rows: int = 10) -> float:
    """Mean direction-changes per sampled row of luminance.

    A 'sorted' row (monotonic) has 0 transitions; chaotic content has many.
    Pixelsort drives this number down.
    """
    frame = first_frame_bgr(path)
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY).astype(np.int16)
    h = gray.shape[0]
    step = max(1, h // (n_rows + 1))
    sample = gray[step::step][:n_rows]
    if len(sample) == 0:
        return 0.0
    total = 0
    for row in sample:
        diffs = np.diff(row)
        signs = np.sign(diffs)
        # Count zero-crossings: signs[i] * signs[i+1] < 0 ⇒ direction flipped.
        nonzero = signs[signs != 0]
        if len(nonzero) < 2:
            continue
        total += int(np.sum(nonzero[:-1] * nonzero[1:] < 0))
    return total / len(sample)


def frame_diff_mean(path: Path, n_frames: int = 10) -> float:
    """Mean absolute frame-to-frame pixel difference across N frames.

    Datamosh / strobe / glitch effects modulate this — accumulating effects
    smear it down, fragmenting effects spike it up.
    """
    cap = cv2.VideoCapture(str(path))
    frames = []
    for _ in range(n_frames):
        ok, f = cap.read()
        if not ok:
            break
        frames.append(f.astype(np.int16))
    cap.release()
    if len(frames) < 2:
        return 0.0
    diffs = [
        float(np.abs(frames[i + 1] - frames[i]).mean()) for i in range(len(frames) - 1)
    ]
    return float(np.mean(diffs))


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
