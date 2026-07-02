"""A2b — clip-transform in the EXPORT path (preview/export parity).

Closes the pre-existing parity bug where a positioned/scaled/rotated clip
rendered correctly in the LIVE preview (``_apply_clip_transform`` at
zmq_server render_frame:768 / render_composite:1605) but exported at DEFAULT
placement — ``engine/export.py`` never applied the clip transform.

The fix extracts the transform math into ``engine.clip_transform`` (the ONE
implementation both preview and export now call) and applies it per exported
frame, folding per-frame ``clipTransform.<clipId>.<field>`` lanes (carried on the
``automation_by_frame`` channel) over the clip's static transform.

FOUR ENFORCED GATES:

  1. REFACTOR BYTE-IDENTITY — the extracted ``apply_clip_transform`` and the
     ZMQ server's thin delegator produce identical pixels (the move changed no
     math). No-transform export stays byte-identical to a raw-decode export.
       test_module_and_server_delegator_are_pixel_identical
       test_no_transform_export_is_raw_decode  (no-transform regression)

  2. STATIC-PARITY — an exported frame with a static transform pixel-matches the
     SAME shared helper applied to the decoded source frame (i.e. what preview
     render_frame produces, since both call the identical function).
       test_static_transform_export_matches_shared_helper

  3. LANE-PARITY — a per-frame ``clipTransform.<clipId>.x`` lane changes the
     exported placement frame-by-frame, each matching the folded transform; a
     no-op guard proves the lane actually drives the export (different x →
     different pixels).
       test_animated_x_lane_export_matches_per_frame_fold
       test_animated_x_lane_actually_moves_the_clip  (anti-dead-flag)

  4. CROSS-LANGUAGE PARITY TABLE (B3.1 pattern) — ``fold_transform_override``
     reproduces the frontend ``mergeTransformOverride`` field-replace semantics
     EXACTLY; expected field values are lifted from the TS contract into backend
     constants. Plus the trust-boundary clamp (lane numerics → store bounds).
       test_fold_matches_frontend_mergeTransformOverride_table
       test_fold_clamps_out_of_range_lane_values

Harness style mirrors test_export_parity.py: drives ExportManager directly to a
lossless PNG image sequence (never the lossy preview MJPEG / H.264 path), then
decodes the frames and compares pixels against the shared helper.
"""

from __future__ import annotations

import os
import sys
import tempfile
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

import cv2  # noqa: E402
import numpy as np  # noqa: E402

from engine.clip_transform import (  # noqa: E402
    apply_clip_transform,
    fold_transform_override,
)
from engine.export import ExportManager, ExportStatus  # noqa: E402
from video.reader import VideoReader  # noqa: E402
from zmq_server import ZMQServer  # noqa: E402

CLIP_ID = "clip-A2b"
SOURCE_FPS = 30


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _run_to_completion(job, timeout_s: float = 40.0):
    deadline = time.time() + timeout_s
    while job.status == ExportStatus.RUNNING and time.time() < deadline:
        time.sleep(0.05)
    return job.status


def _export_png_sequence(
    input_path,
    out_dir,
    *,
    end_frame=5,
    transform=None,
    transform_clip_id=None,
    automation_by_frame=None,
):
    """Export a lossless PNG sequence with an empty chain, so each exported frame
    equals the clip transform applied to the decoded source frame (apply_chain on
    an empty chain is the identity)."""
    os.makedirs(out_dir, exist_ok=True)
    mgr = ExportManager()
    job = mgr.start(
        input_path=input_path,
        output_path=out_dir,
        chain=[],
        project_seed=7,
        settings={
            "export_type": "image_sequence",
            "image_format": "png",
            "region": "custom",
            "start_frame": 0,
            "end_frame": end_frame,
            "fps": str(SOURCE_FPS),
            "include_audio": False,
        },
        transform=transform,
        transform_clip_id=transform_clip_id,
        automation_by_frame=automation_by_frame,
    )
    return mgr, job


def _sorted_pngs(d: str) -> list[str]:
    return [os.path.join(d, n) for n in sorted(os.listdir(d)) if n.endswith(".png")]


def _expected_bgr(src_frame: np.ndarray, transform: dict, resolution) -> np.ndarray:
    """What preview produces for this frame: the SHARED helper applied to the
    decoded source frame, then RGBA->BGR (the PNG writer's conversion)."""
    out = apply_clip_transform(src_frame, transform, resolution)
    return cv2.cvtColor(out, cv2.COLOR_RGBA2BGR)


# ---------------------------------------------------------------------------
# Gate 1 — refactor byte-identity + no-transform regression
# ---------------------------------------------------------------------------


def test_module_and_server_delegator_are_pixel_identical():
    """The extracted apply_clip_transform and the ZMQ server's thin delegator
    (unbound, self unused) produce byte-identical pixels — the extraction moved
    the math verbatim (preview call sites unchanged)."""
    rng = np.random.default_rng(0)
    frame = rng.integers(0, 256, size=(64, 96, 4), dtype=np.uint8)
    transform = {"scaleX": 0.7, "scaleY": 1.3, "x": 20, "y": -15, "rotation": 12.0}
    res = (96, 64)
    via_module = apply_clip_transform(frame, transform, res)
    via_server = ZMQServer._apply_clip_transform(None, frame, transform, res)
    assert np.array_equal(via_module, via_server)


def test_no_transform_export_is_raw_decode(synthetic_video_path):
    """No-transform regression: export with transform=None applies NOTHING — each
    frame equals the raw decoded source (empty chain identity). Guards that the
    A2b path is inert when no transform is supplied (byte-identical legacy)."""
    reader = VideoReader(synthetic_video_path)
    resolution = (reader.width, reader.height)
    with tempfile.TemporaryDirectory() as d:
        _, job = _export_png_sequence(synthetic_video_path, d, end_frame=3)
        assert _run_to_completion(job) == ExportStatus.COMPLETE, job.error
        pngs = _sorted_pngs(d)
        indices = ExportManager._compute_frame_indices(
            0, 3, float(SOURCE_FPS), SOURCE_FPS
        )
        assert len(pngs) == len(indices)
        for png, src_idx in zip(pngs, indices):
            expected = cv2.cvtColor(reader.decode_frame(src_idx), cv2.COLOR_RGBA2BGR)
            got = cv2.imread(png)
            assert np.array_equal(got, expected), (
                f"frame src={src_idx} altered w/o transform"
            )
    reader.close()


# ---------------------------------------------------------------------------
# Gate 2 — static-parity
# ---------------------------------------------------------------------------


def test_static_transform_export_matches_shared_helper(synthetic_video_path):
    """A static transform (scale + offset + rotation) exports frames that
    pixel-match the shared helper applied to each decoded source frame — the
    SAME function preview render_frame calls (preview/export parity)."""
    reader = VideoReader(synthetic_video_path)
    resolution = (reader.width, reader.height)
    transform = {"scaleX": 0.5, "scaleY": 0.5, "x": 120, "y": -80, "rotation": 15.0}
    with tempfile.TemporaryDirectory() as d:
        _, job = _export_png_sequence(
            synthetic_video_path,
            d,
            end_frame=4,
            transform=transform,
            transform_clip_id=CLIP_ID,
        )
        assert _run_to_completion(job) == ExportStatus.COMPLETE, job.error
        pngs = _sorted_pngs(d)
        indices = ExportManager._compute_frame_indices(
            0, 4, float(SOURCE_FPS), SOURCE_FPS
        )
        assert len(pngs) == len(indices)
        moved_any = False
        for png, src_idx in zip(pngs, indices):
            src = reader.decode_frame(src_idx)
            expected = _expected_bgr(src, transform, resolution)
            got = cv2.imread(png)
            assert np.array_equal(got, expected), (
                f"static transform mismatch src={src_idx}"
            )
            if not np.array_equal(got, cv2.cvtColor(src, cv2.COLOR_RGBA2BGR)):
                moved_any = True
        assert moved_any, (
            "transform had NO visible effect on export — transform dropped"
        )
    reader.close()


# ---------------------------------------------------------------------------
# Gate 3 — lane-parity (per-frame clipTransform.<clipId>.x)
# ---------------------------------------------------------------------------


def test_animated_x_lane_export_matches_per_frame_fold(synthetic_video_path):
    """A per-frame x lane on automation_by_frame folds over the static base and
    each exported frame matches the manually-folded transform (parity table per
    frame; NOT computed via the SUT's fold — expected merged dict built by hand)."""
    reader = VideoReader(synthetic_video_path)
    resolution = (reader.width, reader.height)
    base = {"scaleX": 0.5, "scaleY": 0.5, "x": 0, "y": 0, "rotation": 0.0}
    # A distinct x per source frame (the lane value the frontend pre-resolves).
    x_by_frame = {0: -200.0, 1: -100.0, 2: 0.0, 3: 100.0, 4: 200.0}
    automation = {f: {f"clipTransform.{CLIP_ID}.x": x} for f, x in x_by_frame.items()}
    with tempfile.TemporaryDirectory() as d:
        _, job = _export_png_sequence(
            synthetic_video_path,
            d,
            end_frame=4,
            transform=base,
            transform_clip_id=CLIP_ID,
            automation_by_frame=automation,
        )
        assert _run_to_completion(job) == ExportStatus.COMPLETE, job.error
        pngs = _sorted_pngs(d)
        indices = ExportManager._compute_frame_indices(
            0, 4, float(SOURCE_FPS), SOURCE_FPS
        )
        for png, src_idx in zip(pngs, indices):
            # Manually folded expected transform: x REPLACED by the lane value,
            # every other field kept from base (mergeTransformOverride semantics).
            expected_t = {**base, "x": x_by_frame[src_idx]}
            expected = _expected_bgr(
                reader.decode_frame(src_idx), expected_t, resolution
            )
            got = cv2.imread(png)
            assert np.array_equal(got, expected), f"lane fold mismatch src={src_idx}"
    reader.close()


def test_animated_x_lane_actually_moves_the_clip(synthetic_video_path):
    """Anti-dead-flag: two frames whose x lane differs export DIFFERENT pixels —
    proves the per-frame lane actually drives placement (not a static stub)."""
    reader = VideoReader(synthetic_video_path)
    base = {"scaleX": 0.5, "scaleY": 0.5}
    automation = {
        0: {f"clipTransform.{CLIP_ID}.x": -300.0},
        1: {f"clipTransform.{CLIP_ID}.x": 300.0},
    }
    with tempfile.TemporaryDirectory() as d:
        _, job = _export_png_sequence(
            synthetic_video_path,
            d,
            end_frame=1,
            transform=base,
            transform_clip_id=CLIP_ID,
            automation_by_frame=automation,
        )
        assert _run_to_completion(job) == ExportStatus.COMPLETE, job.error
        pngs = _sorted_pngs(d)
        assert len(pngs) == 2
        f0, f1 = cv2.imread(pngs[0]), cv2.imread(pngs[1])
        assert not np.array_equal(f0, f1), "x lane had no per-frame effect (dead lane)"
    reader.close()


# ---------------------------------------------------------------------------
# Gate 4 — cross-language parity table + trust-boundary clamp
# ---------------------------------------------------------------------------


def test_fold_matches_frontend_mergeTransformOverride_table():
    """B3.1 cross-language parity: fold_transform_override reproduces the frontend
    mergeTransformOverride field-replace semantics EXACTLY.

    Expected values are lifted from the TS contract (transformLanes.ts
    mergeTransformOverride + types.ts normalizeTransform): for each of the 5
    automatable fields {x, y, scaleX, scaleY, rotation}, a present override value
    REPLACES the base; flip/anchor always come from the (normalized) base.
    """
    base = {
        "x": 10,
        "y": 20,
        "scaleX": 2,
        "scaleY": 3,
        "rotation": 45,
        "anchorX": 5,
        "anchorY": -5,
        "flipH": True,
        "flipV": False,
    }
    per_frame = {
        f"clipTransform.{CLIP_ID}.x": 100.0,
        f"clipTransform.{CLIP_ID}.rotation": 90.0,
        # a foreign clip's lane and a non-transform lane must be ignored:
        "clipTransform.other-clip.x": 999.0,
        "fx.hue_shift.amount": 0.5,
    }
    # Expected merged transform — hand-computed from the frontend semantics.
    EXPECTED = {
        "x": 100.0,  # replaced by lane
        "y": 20,  # kept from base
        "scaleX": 2,  # kept
        "scaleY": 3,  # kept
        "rotation": 90.0,  # replaced by lane
        "anchorX": 5,  # flip/anchor always from base
        "anchorY": -5,
        "flipH": True,
        "flipV": False,
    }
    assert fold_transform_override(base, per_frame, CLIP_ID) == EXPECTED


def test_fold_clamps_out_of_range_lane_values():
    """Trust boundary: a lane value outside a field's store range clamps to the
    SAME bounds apply_clip_transform enforces (scaleX [0.01,100], x [-1e4,1e4])."""
    per_frame = {
        f"clipTransform.{CLIP_ID}.scaleX": 999.0,  # -> 100.0
        f"clipTransform.{CLIP_ID}.x": 99999.0,  # -> 10000.0
        f"clipTransform.{CLIP_ID}.scaleY": 0.0,  # -> 0.01
    }
    merged = fold_transform_override(None, per_frame, CLIP_ID)
    assert merged["scaleX"] == 100.0
    assert merged["x"] == 10000.0
    assert merged["scaleY"] == 0.01
