"""Demo trilogy REAL renderer (Tier-1 P0d).

Unlike runner.py (which only validates configs + builds a CLI string), this
script actually RENDERS the three Tier-1 demos by driving the genuine
`modulation.lane_reader.sample_lane` primitive over each frame's 6D coordinate.
It proves the wavetable-axes paradigm: the SAME curve, read through a different
domain axis, produces fundamentally different output.

- y-is-time      : a brightness/hue ramp read with domain=Y → the curve scans
                   DOWN THE ROWS of each frame instead of over time (C1).
- audio-lfo-stripes : a sine curve read with domain=Y and |direction|>>1 →
                   the curve cycles many times across Y → spatial banding that
                   phases over T (C7 audio-LFO-at-video-resolution).
- painted-blur   : a blur-strength field read with domain=Y → a vertical blur
                   gradient (preview of C3 per-pixel parameter fields).

I/O via cv2 ONLY (no `import av`) to avoid the known cv2/av libavdevice dylib
clash. Run:  python3 -m scripts.demo_trilogy.render_demos --source <video> --out <dir>
"""

from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

import cv2
import numpy as np

# Import the REAL Tier-1 primitive (PR #147). backend/src on path → package import.
_BACKEND_SRC = Path(__file__).resolve().parents[2] / "src"
sys.path.insert(0, str(_BACKEND_SRC))
from modulation.lane_reader import FrameCoord, sample_lane  # noqa: E402
from modulation.schema import Lane, LaneDomain, InterpMode, LoopMode  # noqa: E402


def _ramp_curve(n: int = 33) -> list[float]:
    """A monotone 0→1 ramp control-point curve."""
    return [i / (n - 1) for i in range(n)]


def _sine_curve(n: int = 64) -> list[float]:
    """One period of a 0..1 sine, as control points."""
    return [0.5 + 0.5 * math.sin(2 * math.pi * i / (n - 1)) for i in range(n)]


def _read_frames(
    source: str, max_frames: int
) -> tuple[list[np.ndarray], float, int, int]:
    cap = cv2.VideoCapture(source)
    if not cap.isOpened():
        raise SystemExit(f"cannot open source video: {source}")
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    frames: list[np.ndarray] = []
    while len(frames) < max_frames:
        ok, frame = cap.read()
        if not ok:
            break
        frames.append(frame)
    cap.release()
    if not frames:
        raise SystemExit("source produced zero frames")
    h, w = frames[0].shape[:2]
    return frames, fps, w, h


def _writer(path: Path, fps: float, w: int, h: int) -> cv2.VideoWriter:
    path.parent.mkdir(parents=True, exist_ok=True)
    vw = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"mp4v"), fps, (w, h))
    if not vw.isOpened():
        raise SystemExit(f"cannot open writer: {path}")
    return vw


def render_y_is_time(frames, fps, w, h, out: Path) -> Path:
    """domain=Y: a hue ramp scans down the rows. The 'time' axis of the curve
    is now vertical SPACE. Source still plays in T underneath."""
    curve = _ramp_curve()
    lane = Lane(
        domain=LaneDomain.Y,
        direction=1.0,
        interp_mode=InterpMode.LINEAR,
        loop_mode=LoopMode.OFF,
    )
    # Precompute per-row hue offset (constant in T, varies over Y) — the paradigm.
    y_norms = [r / (h - 1) for r in range(h)]
    hue_shift = (
        np.array(
            [sample_lane(curve, lane, FrameCoord(y_norm=y)) for y in y_norms],
            dtype=np.float32,
        )
        * 179.0
    )  # OpenCV hue range 0..179
    vw = _writer(out, fps, w, h)
    for f in frames:
        hsv = cv2.cvtColor(f, cv2.COLOR_BGR2HSV).astype(np.float32)
        hsv[:, :, 0] = (hsv[:, :, 0] + hue_shift[:, None]) % 180.0
        vw.write(cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2BGR))
    vw.release()
    return out


def render_audio_lfo_stripes(frames, fps, w, h, out: Path) -> Path:
    """domain=Y, |direction|=14: a sine curve cycles 14x across Y → spatial
    stripes; phase advances with T → the bands throb/scroll (C7)."""
    curve = _sine_curve()
    n = len(frames)
    y_norms = np.array([r / (h - 1) for r in range(h)], dtype=np.float32)
    vw = _writer(out, fps, w, h)
    for i, f in enumerate(frames):
        t_norm = i / max(1, n - 1)
        # direction carries the spatial frequency; t adds a phase scroll.
        lane = Lane(
            domain=LaneDomain.Y,
            direction=14.0,
            interp_mode=InterpMode.LINEAR,
            loop_mode=LoopMode.LOOP,
        )
        band = np.array(
            [
                sample_lane(
                    curve, lane, FrameCoord(t_norm=t_norm, y_norm=float(y + t_norm))
                )
                for y in y_norms
            ],
            dtype=np.float32,
        )
        gain = (0.45 + 0.55 * band)[:, None, None]  # per-row brightness mult
        out_f = np.clip(f.astype(np.float32) * gain, 0, 255).astype(np.uint8)
        vw.write(out_f)
    vw.release()
    return out


def render_painted_blur(frames, fps, w, h, out: Path) -> Path:
    """domain=Y: blur strength is a field read over Y (preview of C3). Top sharp,
    bottom heavily blurred — a 'painted' parameter gradient, in 8 bands."""
    curve = _ramp_curve()
    lane = Lane(
        domain=LaneDomain.Y,
        direction=1.0,
        interp_mode=InterpMode.LINEAR,
        loop_mode=LoopMode.OFF,
    )
    bands = 8
    band_h = h // bands
    # blur kernel per band from the lane sampled at the band center
    kernels = []
    for b in range(bands):
        yc = (b + 0.5) / bands
        strength = sample_lane(curve, lane, FrameCoord(y_norm=yc))  # 0..1
        k = int(strength * 31) | 1  # odd kernel 1..31
        kernels.append(max(1, k))
    vw = _writer(out, fps, w, h)
    for f in frames:
        out_f = f.copy()
        for b in range(bands):
            y0 = b * band_h
            y1 = h if b == bands - 1 else (b + 1) * band_h
            k = kernels[b]
            if k > 1:
                out_f[y0:y1] = cv2.GaussianBlur(f[y0:y1], (k, k), 0)
        vw.write(out_f)
    vw.release()
    return out


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="render_demos")
    p.add_argument("--source", required=True, help="source video path")
    p.add_argument("--out", default=str(Path.home() / ".entropic" / "demos"))
    p.add_argument("--max-frames", type=int, default=180)
    args = p.parse_args(argv)

    frames, fps, w, h = _read_frames(args.source, args.max_frames)
    out_dir = Path(args.out)
    print(f"[render_demos] source={args.source} frames={len(frames)} {w}x{h}@{fps:.0f}")

    results = {
        "y-is-time": render_y_is_time(frames, fps, w, h, out_dir / "y-is-time.mp4"),
        "audio-lfo-stripes": render_audio_lfo_stripes(
            frames, fps, w, h, out_dir / "audio-lfo-stripes.mp4"
        ),
        "painted-blur": render_painted_blur(
            frames, fps, w, h, out_dir / "painted-blur.mp4"
        ),
    }
    print("[render_demos] DONE — artifacts:")
    for name, path in results.items():
        size = path.stat().st_size if path.exists() else 0
        print(f"  {name:20s} {path}  ({size / 1024:.0f} KB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
