"""M.2 (Master-Out Bus PRD) — redteam guard #1: export parity for the
single-input (no performance overlay) export path.

docs/plans/2026-07-03-master-out-bus-prd.md's render contract requires ONE
post-composite seam shared by preview and export so a Master effect never
drops on export while showing in preview. `render_composite`'s `master_chain`
param (compositor.py, covered by test_engine/test_compositor.py's
TestMasterChain* classes) is that seam for the multi-track/composite branch.

But `engine/export.py::_run_export` has a SEPARATE single-input fast path
(no performance overlay, never calls `render_composite`) with TWO call
sites — `render_export_frame`'s else-branch (used by GIF + image_sequence
export) and the inline video-encode loop's else-branch (used by "video"
export, the default `export_type`). Before this fix, BOTH branches skipped
`master_chain` entirely: a single-input project with Master-track effects
would render them in preview (multi-track composite branch) but drop them
on export (this single-input branch) — preview/export drift.

These tests pin: a single-input project + a Master `fx.invert` chain must
be inverted in the EXPORTED output, on both single-input call sites.
"""

import os
import sys
import tempfile
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

import numpy as np  # noqa: E402

from engine.export import ExportManager, ExportStatus  # noqa: E402

MASTER_INVERT = [{"effect_id": "fx.invert", "params": {}, "enabled": True}]


def _run_to_completion(job, timeout_s: float = 40.0):
    deadline = time.time() + timeout_s
    while job.status == ExportStatus.RUNNING and time.time() < deadline:
        time.sleep(0.05)
    return job.status


def _export(input_path, out_path, *, export_type, master_chain=None, end_frame=4):
    mgr = ExportManager()
    job = mgr.start(
        input_path=input_path,
        output_path=out_path,
        chain=[],  # empty per-track chain — isolates the master_chain effect
        project_seed=7,
        settings={
            "export_type": export_type,
            "image_format": "png",
            "region": "custom",
            "start_frame": 0,
            "end_frame": end_frame,
            "fps": "source",
            "include_audio": False,
        },
        master_chain=master_chain,
    )
    return mgr, job


# ---------------------------------------------------------------------------
# render_export_frame's else-branch (GIF / image_sequence export) — the
# FIRST single-input call site patched.
# ---------------------------------------------------------------------------
def test_image_sequence_export_applies_master_invert_single_input(synthetic_video_path):
    """A single-input project (no performance overlay) exported as an image
    sequence with a Master `fx.invert` chain must produce INVERTED frames —
    proving master_chain reaches the single-input render_export_frame path,
    not just the multi-track/performance render_composite branch."""
    with tempfile.TemporaryDirectory() as base:
        d_base = os.path.join(base, "baseline")
        d_master = os.path.join(base, "master-invert")

        _, job_base = _export(synthetic_video_path, d_base, export_type="image_sequence")
        _, job_master = _export(
            synthetic_video_path, d_master, export_type="image_sequence", master_chain=MASTER_INVERT,
        )
        assert _run_to_completion(job_base) == ExportStatus.COMPLETE, job_base.error
        assert _run_to_completion(job_master) == ExportStatus.COMPLETE, job_master.error

        import cv2

        base_frames = sorted(os.listdir(d_base))
        master_frames = sorted(os.listdir(d_master))
        assert len(base_frames) == len(master_frames) > 0

        for bf, mf in zip(base_frames, master_frames):
            base_bgr = cv2.imread(os.path.join(d_base, bf), cv2.IMREAD_COLOR)
            master_bgr = cv2.imread(os.path.join(d_master, mf), cv2.IMREAD_COLOR)
            expected = 255 - base_bgr.astype(np.int16)
            np.testing.assert_array_equal(master_bgr.astype(np.int16), expected)


def test_image_sequence_export_empty_master_chain_is_noop(synthetic_video_path):
    """An EMPTY Master effectChain ([]) — what a real project with no master
    effects yet sends — renders byte-identical to no master_chain at all
    (the #1 regression guard, mirrored at the export layer)."""
    with tempfile.TemporaryDirectory() as base:
        d_none = os.path.join(base, "none")
        d_empty = os.path.join(base, "empty")

        _, job_none = _export(synthetic_video_path, d_none, export_type="image_sequence", master_chain=None)
        _, job_empty = _export(synthetic_video_path, d_empty, export_type="image_sequence", master_chain=[])
        assert _run_to_completion(job_none) == ExportStatus.COMPLETE, job_none.error
        assert _run_to_completion(job_empty) == ExportStatus.COMPLETE, job_empty.error

        import cv2

        none_frames = sorted(os.listdir(d_none))
        empty_frames = sorted(os.listdir(d_empty))
        assert len(none_frames) == len(empty_frames) > 0
        for nf, ef in zip(none_frames, empty_frames):
            none_bgr = cv2.imread(os.path.join(d_none, nf), cv2.IMREAD_COLOR)
            empty_bgr = cv2.imread(os.path.join(d_empty, ef), cv2.IMREAD_COLOR)
            np.testing.assert_array_equal(none_bgr, empty_bgr)


# ---------------------------------------------------------------------------
# The inline video-encode loop's else-branch ("video" export_type, the
# DEFAULT) — the SECOND single-input call site patched. h264 is lossy, so
# comparison uses the same <=2/255 tolerance test_export_parity.py's
# preview-vs-export parity test uses (contract margin, not exactness).
# ---------------------------------------------------------------------------
def test_video_export_applies_master_invert_single_input(synthetic_video_path):
    """Same guard as above, but on the DEFAULT "video" export_type's inline
    encode loop — a separate single-input call site from render_export_frame,
    patched identically."""
    with tempfile.TemporaryDirectory() as base:
        f_base = os.path.join(base, "baseline.mp4")
        f_master = os.path.join(base, "master-invert.mp4")

        _, job_base = _export(synthetic_video_path, f_base, export_type="video")
        _, job_master = _export(synthetic_video_path, f_master, export_type="video", master_chain=MASTER_INVERT)
        assert _run_to_completion(job_base) == ExportStatus.COMPLETE, job_base.error
        assert _run_to_completion(job_master) == ExportStatus.COMPLETE, job_master.error

        from video.reader import VideoReader

        r_base = VideoReader(f_base)
        r_master = VideoReader(f_master)
        try:
            for idx in range(3):
                base_frame = r_base.decode_frame(idx)[:, :, :3]
                master_frame = r_master.decode_frame(idx)[:, :, :3]
                expected = 255 - base_frame.astype(np.int16)
                delta = np.abs(master_frame.astype(np.int16) - expected)
                max_delta = int(delta.max())
                assert max_delta <= 2, (
                    f"frame {idx}: master-inverted video export max abs delta "
                    f"{max_delta} > 2/255 tolerance — master_chain not applied "
                    "on the inline video-loop single-input path"
                )
        finally:
            r_base.close()
            r_master.close()
