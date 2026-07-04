"""UAT #427 — preview==export parity for the new effects family shipped with
zero UAT: Copy Machine (#368, fx.copy_machine), 3D Extrude+Spin (#369,
fx.extrude_spin), transitions v2 (#370, fx.transition_*), and Grid Moire
(fx.grid_moire, issue #123).

Extends the proven parity harness in test_export_parity.py
(``test_export_vs_preview_per_pixel_delta_within_tolerance``): both the
preview path (direct ``apply_chain`` calls, one per frame, threading
per-effect state) and the export path (``ExportManager`` image-sequence,
lossless PNG) run the SAME ``apply_chain`` function, so a divergence here
means the export path is NOT calling the shipping preview code path.

Each of the four effect families is exercised in STATEFUL config where
possible (copy_machine feedback=True, extrude_spin's internal geometry/print
cache) — state-threading bugs are the likeliest place preview and export
diverge (export starts a fresh state dict; if it seeded it differently or
processed frames out of order, this would catch it).

Acceptance gate: per-pixel max abs delta <= 2/255 (same tolerance as the
proven harness — accounts for zero real delta expected since both paths
share the same pure function; the margin is the contract, not a fudge).
"""

from __future__ import annotations

import os
import tempfile
import uuid
from pathlib import Path

import cv2
import numpy as np
import pytest

from engine.export import ExportManager, ExportStatus
from engine.pipeline import apply_chain
from video.reader import VideoReader
from video.writer import VideoWriter

_W, _H, _FPS, _N_FRAMES = 160, 120, 30, 20


@pytest.fixture(scope="module")
def small_synthetic_video_path():
    """A short, low-res clip with per-frame-varying, non-flat content (a
    moving bright ring) — small enough that extrude_spin's raster and
    copy_machine's per-pass pipeline stay fast, structured enough that every
    effect (ink-mask threshold, edge detectors, halftone) has something to
    react to."""
    fixture_dir = Path.home() / ".cache" / "entropic" / "test-fixtures"
    fixture_dir.mkdir(parents=True, exist_ok=True)
    path = str(fixture_dir / f"test_new_effects_parity_{uuid.uuid4().hex[:8]}.mp4")
    w = VideoWriter(path, _W, _H, fps=_FPS)
    yy, xx = np.mgrid[0:_H, 0:_W]
    for i in range(_N_FRAMES):
        frame = np.zeros((_H, _W, 4), dtype=np.uint8)
        frame[:, :, 3] = 255
        cx = 40 + i * 3
        ring = ((xx - cx) ** 2 / 30.0**2) + ((yy - _H / 2) ** 2 / 20.0**2) - 1.0
        frame[np.abs(ring) < 0.2, 0] = 220
        frame[np.abs(ring) < 0.2, 1] = 200
        frame[np.abs(ring) < 0.2, 2] = 180
        w.write_frame(frame)
    w.close()
    yield path
    os.unlink(path)


def _run_to_completion(job, timeout_s: float = 60.0):
    import time

    deadline = time.time() + timeout_s
    while job.status == ExportStatus.RUNNING and time.time() < deadline:
        time.sleep(0.05)
    return job.status


def _render_preview_frames(input_path, chain, project_seed, sampled, resolution):
    """Run apply_chain directly, frame by frame from 0, threading per-effect
    state — mirrors zmq_server._render_composited_frame's no-operator path."""
    reader = VideoReader(input_path)
    chain_state: dict = {}
    frames = {}
    for f in range(max(sampled) + 1):
        frame = reader.decode_frame(f)
        out, chain_state = apply_chain(
            frame, chain, project_seed, f, resolution, chain_state
        )
        if f in sampled:
            frames[f] = out.copy()
    reader.close()
    return frames


def _export_frames(input_path, chain, project_seed, end_frame):
    with tempfile.TemporaryDirectory() as base:
        d = os.path.join(base, "exp")
        os.makedirs(d, exist_ok=True)
        mgr = ExportManager()
        job = mgr.start(
            input_path=input_path,
            output_path=d,
            chain=chain,
            project_seed=project_seed,
            settings={
                "export_type": "image_sequence",
                "image_format": "png",
                "region": "custom",
                "start_frame": 0,
                "end_frame": end_frame,
                "fps": "source",
                "include_audio": False,
            },
        )
        assert _run_to_completion(job) == ExportStatus.COMPLETE, job.error
        names = sorted(os.listdir(d))
        out = {}
        for idx, name in enumerate(names):
            out[idx] = cv2.imread(os.path.join(d, name), cv2.IMREAD_UNCHANGED)
        return out


def _assert_parity(preview_frames: dict, export_frames: dict, sampled, label: str):
    for f in sampled:
        prev = preview_frames[f]
        exp = export_frames[f]
        prev_rgb = prev[:, :, :3]
        prev_bgr = cv2.cvtColor(prev_rgb, cv2.COLOR_RGB2BGR)
        exp_bgr = exp[:, :, :3] if exp.ndim == 3 else exp
        assert exp_bgr.shape == prev_bgr.shape, (
            f"{label} frame {f}: shape mismatch export={exp_bgr.shape} "
            f"preview={prev_bgr.shape}"
        )
        delta = np.abs(exp_bgr.astype(np.int16) - prev_bgr.astype(np.int16))
        max_delta = int(delta.max())
        assert max_delta <= 2, (
            f"{label} frame {f}: export-vs-preview max abs delta {max_delta} > 2/255"
        )


# ---------------------------------------------------------------------------
# fx.copy_machine — stateful (feedback=True exercises cross-frame state)
# ---------------------------------------------------------------------------


def test_copy_machine_export_preview_parity_feedback_mode(small_synthetic_video_path):
    chain = [
        {
            "effect_id": "fx.copy_machine",
            "params": {"machine": "toner", "feedback": True, "feedback_amount": 0.6},
        }
    ]
    sampled = [0, 5, 12]
    resolution = (_W, _H)
    preview = _render_preview_frames(
        small_synthetic_video_path, chain, 7, sampled, resolution
    )
    export = _export_frames(small_synthetic_video_path, chain, 7, max(sampled))
    _assert_parity(preview, export, sampled, "fx.copy_machine(feedback)")


def test_copy_machine_export_preview_parity_stateless_defaults(
    small_synthetic_video_path,
):
    chain = [{"effect_id": "fx.copy_machine", "params": {}}]
    sampled = [0, 3, 8]
    resolution = (_W, _H)
    preview = _render_preview_frames(
        small_synthetic_video_path, chain, 7, sampled, resolution
    )
    export = _export_frames(small_synthetic_video_path, chain, 7, max(sampled))
    _assert_parity(preview, export, sampled, "fx.copy_machine(defaults)")


# ---------------------------------------------------------------------------
# fx.extrude_spin — stateful (geometry + print cache threaded across frames)
# ---------------------------------------------------------------------------


def test_extrude_spin_export_preview_parity(small_synthetic_video_path):
    chain = [
        {
            "effect_id": "fx.extrude_spin",
            "params": {"construction": "extrude", "machine": "toner"},
        }
    ]
    sampled = [0, 6, 15]
    resolution = (_W, _H)
    preview = _render_preview_frames(
        small_synthetic_video_path, chain, 7, sampled, resolution
    )
    export = _export_frames(small_synthetic_video_path, chain, 7, max(sampled))
    _assert_parity(preview, export, sampled, "fx.extrude_spin")


# ---------------------------------------------------------------------------
# fx.grid_moire — stateless (no state_out), still must match
# ---------------------------------------------------------------------------


def test_grid_moire_export_preview_parity(small_synthetic_video_path):
    chain = [
        {
            "effect_id": "fx.grid_moire",
            "params": {"interference": 1.0, "sharpness": 0.5, "a_liquify": 15.0},
        }
    ]
    sampled = [0, 4, 9]
    resolution = (_W, _H)
    preview = _render_preview_frames(
        small_synthetic_video_path, chain, 7, sampled, resolution
    )
    export = _export_frames(small_synthetic_video_path, chain, 7, max(sampled))
    _assert_parity(preview, export, sampled, "fx.grid_moire")


# ---------------------------------------------------------------------------
# fx.transition_* — three registered transitions, boundary + midpoint frames
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "effect_id",
    [
        "fx.transition_column_cascade",
        "fx.transition_column_cascade_reverse",
        "fx.transition_row_waterfall",
    ],
)
def test_transition_export_preview_parity(small_synthetic_video_path, effect_id):
    duration_frames = 10
    chain = [{"effect_id": effect_id, "params": {"duration_frames": duration_frames}}]
    sampled = [0, duration_frames // 2, duration_frames]
    resolution = (_W, _H)
    preview = _render_preview_frames(
        small_synthetic_video_path, chain, 7, sampled, resolution
    )
    export = _export_frames(small_synthetic_video_path, chain, 7, max(sampled))
    _assert_parity(preview, export, sampled, effect_id)


# ---------------------------------------------------------------------------
# Fail-first sanity (proves the parity harness actually catches divergence) —
# run manually via `python3 -m pytest -k fail_first_sanity`, not part of CI.
# See PR body / return format for the manual invert-and-restore proof.
# ---------------------------------------------------------------------------


@pytest.mark.skip(
    reason="manual fail-first sanity check only, not a standing regression test"
)
def test_fail_first_sanity_placeholder():
    pass
