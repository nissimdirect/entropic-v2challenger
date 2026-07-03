"""M.3 (Master-Out Bus PRD) — automation on Master-chain params.

M.1/M.2 gave the Master track a render seam (compositor.py's post-composite
`apply_chain(master_chain, ...)`) and a UI device chain. Automation lanes
(paramPath = "<effectId>.<paramKey>") are entirely param-path generic —
`evaluateAutomationOverrides` doesn't know or care which track an effect
belongs to — so once a lane targets a Master effect's param, the frontend
already computes correct override values (see
frontend/src/__tests__/utils/masterAutomationParity.test.ts for that half).

The gap M.3 closes is backend-side: `master_chain` was previously applied to
every export frame as a STATIC snapshot (see git blame on
engine/export.py's `master_chain=master_chain` call sites, now
`master_chain=frame_master_chain`) — an automated master param would hold
still across the whole export instead of varying per frame. The fix reuses
`modulate_chain_for_frame` (the SAME per-frame resolver the per-clip `chain`
already goes through) on `master_chain` too — no parallel mechanism.

These tests pin: a Master `fx.color_invert.amount` lane sweeping 0 -> 1 over
the export range must produce visibly DIFFERENT (progressively more inverted)
output frames, on both single-input export call sites (image_sequence +
video), proving automation_by_frame reaches master_chain per output frame.
"""

import os
import sys
import tempfile
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

import numpy as np  # noqa: E402

from engine.export import ExportManager, ExportStatus  # noqa: E402

MASTER_INVERT = [
    {
        "effect_id": "fx.color_invert",
        "params": {"channel": "all", "amount": 0.0},
        "enabled": True,
    }
]


def _run_to_completion(job, timeout_s: float = 40.0):
    deadline = time.time() + timeout_s
    while job.status == ExportStatus.RUNNING and time.time() < deadline:
        time.sleep(0.05)
    return job.status


def _automation_sweep(end_frame: int) -> dict:
    """frame f -> {"fx.color_invert.amount": f / end_frame} — a linear 0..1
    sweep across the export range, keyed by the effect TYPE id (the only key
    the backend's apply_modulation can resolve — see
    modulation/engine.py::apply_modulation's `eid = effect.get("effect_id")`
    matching, which reads the serialized chain's effect_id field, always the
    type, never a per-instance id)."""
    return {
        f: {"fx.color_invert.amount": f / end_frame if end_frame else 0.0}
        for f in range(end_frame + 1)
    }


def _export(
    input_path, out_path, *, export_type, automation_by_frame=None, end_frame=6
):
    """`automation_by_frame` here is the MASTER-track sweep (this whole file
    isolates master_chain via an empty `chain=[]`). HIGH silent-parity fix
    (PR #406): master lane overrides now travel via the dedicated
    `master_automation_by_frame` param, NOT the (now clip/track-only)
    `automation_by_frame` — see engine/export.py's docstring. Threading it
    through as `master_automation_by_frame` here keeps this test's intent
    (a Master automation sweep) correct under the fixed API."""
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
        master_chain=MASTER_INVERT,
        master_automation_by_frame=automation_by_frame,
    )
    return mgr, job


# ---------------------------------------------------------------------------
# image_sequence export (render_export_frame's else-branch)
# ---------------------------------------------------------------------------
def test_image_sequence_master_automation_varies_per_frame(synthetic_video_path):
    """Master fx.color_invert.amount automated 0->1 across the export range
    must produce frames that are progressively more inverted — frame 0
    (amount=0) must be UNCHANGED from a no-automation baseline and the last
    frame (amount=1) must be FULLY inverted, proving master_chain is
    re-resolved from automation_by_frame on EVERY output frame, not sent
    once as a static snapshot."""
    end_frame = 6
    auto = _automation_sweep(end_frame)
    with tempfile.TemporaryDirectory() as base:
        d_base = os.path.join(base, "baseline")
        d_auto = os.path.join(base, "master-auto")

        _, job_base = _export(
            synthetic_video_path,
            d_base,
            export_type="image_sequence",
            end_frame=end_frame,
        )
        _, job_auto = _export(
            synthetic_video_path,
            d_auto,
            export_type="image_sequence",
            automation_by_frame=auto,
            end_frame=end_frame,
        )
        assert _run_to_completion(job_base) == ExportStatus.COMPLETE, job_base.error
        assert _run_to_completion(job_auto) == ExportStatus.COMPLETE, job_auto.error

        import cv2

        base_frames = sorted(os.listdir(d_base))
        auto_frames = sorted(os.listdir(d_auto))
        assert len(base_frames) == len(auto_frames) == end_frame + 1

        base0 = cv2.imread(os.path.join(d_base, base_frames[0]), cv2.IMREAD_COLOR)
        auto0 = cv2.imread(os.path.join(d_auto, auto_frames[0]), cv2.IMREAD_COLOR)
        # Frame 0: amount=0 -> master chain no-ops -> byte-identical to baseline.
        np.testing.assert_array_equal(auto0, base0)

        base_last = cv2.imread(os.path.join(d_base, base_frames[-1]), cv2.IMREAD_COLOR)
        auto_last = cv2.imread(os.path.join(d_auto, auto_frames[-1]), cv2.IMREAD_COLOR)
        # Last frame: amount=1 -> fully inverted relative to baseline.
        expected_inverted = 255 - base_last.astype(np.int16)
        np.testing.assert_array_equal(auto_last.astype(np.int16), expected_inverted)

        # Time-varying, not a static snapshot: an early (mostly-original) frame
        # and the fully-inverted last frame must differ from EACH OTHER.
        assert not np.array_equal(auto0, auto_last)


# ---------------------------------------------------------------------------
# video export (the inline video-encode loop, "video" export_type — DEFAULT)
# ---------------------------------------------------------------------------
def test_video_export_master_automation_varies_per_frame(synthetic_video_path):
    """Same guard as above, on the DEFAULT "video" export_type's inline
    encode loop — a separate call site from render_export_frame, patched
    identically (frame_master_chain, not the static master_chain)."""
    end_frame = 6
    auto = _automation_sweep(end_frame)
    with tempfile.TemporaryDirectory() as base:
        f_base = os.path.join(base, "baseline.mp4")
        f_auto = os.path.join(base, "master-auto.mp4")

        _, job_base = _export(
            synthetic_video_path, f_base, export_type="video", end_frame=end_frame
        )
        _, job_auto = _export(
            synthetic_video_path,
            f_auto,
            export_type="video",
            automation_by_frame=auto,
            end_frame=end_frame,
        )
        assert _run_to_completion(job_base) == ExportStatus.COMPLETE, job_base.error
        assert _run_to_completion(job_auto) == ExportStatus.COMPLETE, job_auto.error

        from video.reader import VideoReader

        r_base = VideoReader(f_base)
        r_auto = VideoReader(f_auto)
        try:
            base0 = r_base.decode_frame(0)[:, :, :3]
            auto0 = r_auto.decode_frame(0)[:, :, :3]
            # frame 0: amount=0 -> ~byte-identical (h264 is lossy — small tolerance).
            delta0 = np.abs(auto0.astype(np.int16) - base0.astype(np.int16))
            assert int(delta0.max()) <= 2, "frame 0 (amount=0) should be ~unchanged"

            last_idx = (
                end_frame - 2
            )  # tail-clamp safety margin, mirrors existing parity tests
            last_amount = (
                last_idx / end_frame
            )  # matches _automation_sweep's f/end_frame
            base_last = r_base.decode_frame(last_idx)[:, :, :3]
            auto_last = r_auto.decode_frame(last_idx)[:, :, :3]
            # fx.color_invert's blend: out = base*(1-amount) + (255-base)*amount
            base_last_f = base_last.astype(np.float32)
            expected_blend = (
                base_last_f * (1.0 - last_amount) + (255.0 - base_last_f) * last_amount
            )
            delta_last = np.abs(auto_last.astype(np.float32) - expected_blend)
            max_delta_last = float(delta_last.max())
            assert max_delta_last <= 4, (
                f"frame {last_idx} (amount={last_amount:.3f}): master-automated video "
                f"export max abs delta {max_delta_last} > tolerance — automation_by_frame "
                "not reaching frame_master_chain on the inline video-loop path"
            )

            # Time-varying across the export, not a static bake.
            delta_between = np.abs(auto_last.astype(np.int16) - auto0.astype(np.int16))
            assert int(delta_between.max()) > 10
        finally:
            r_base.close()
            r_auto.close()


def test_image_sequence_master_static_amount_unaffected_by_m3_path(
    synthetic_video_path,
):
    """No automation_by_frame at all (None) — a STATIC (non-zero) master
    amount must still apply IDENTICALLY on every frame (M.2's pre-M.3
    contract), proving the M.3 per-frame resolution path
    (modulate_chain_for_frame's `if not mod_active: return base_chain`
    no-op guard) doesn't disturb the non-automated case."""
    static_chain = [
        {
            "effect_id": "fx.color_invert",
            "params": {"channel": "all", "amount": 1.0},
            "enabled": True,
        }
    ]
    with tempfile.TemporaryDirectory() as base:
        d_base = os.path.join(base, "baseline")
        d_static = os.path.join(base, "static-invert")
        job_base = ExportManager().start(
            input_path=synthetic_video_path,
            output_path=d_base,
            chain=[],
            project_seed=7,
            settings={
                "export_type": "image_sequence",
                "image_format": "png",
                "region": "custom",
                "start_frame": 0,
                "end_frame": 4,
                "fps": "source",
                "include_audio": False,
            },
        )
        job_static = ExportManager().start(
            input_path=synthetic_video_path,
            output_path=d_static,
            chain=[],
            project_seed=7,
            settings={
                "export_type": "image_sequence",
                "image_format": "png",
                "region": "custom",
                "start_frame": 0,
                "end_frame": 4,
                "fps": "source",
                "include_audio": False,
            },
            master_chain=static_chain,
        )
        assert _run_to_completion(job_base) == ExportStatus.COMPLETE, job_base.error
        assert _run_to_completion(job_static) == ExportStatus.COMPLETE, job_static.error

        import cv2

        base_frames = sorted(os.listdir(d_base))
        static_frames = sorted(os.listdir(d_static))
        assert len(base_frames) == len(static_frames) > 0
        for bf, sf in zip(base_frames, static_frames):
            base_bgr = cv2.imread(os.path.join(d_base, bf), cv2.IMREAD_COLOR)
            static_bgr = cv2.imread(os.path.join(d_static, sf), cv2.IMREAD_COLOR)
            expected = 255 - base_bgr.astype(np.int16)
            np.testing.assert_array_equal(static_bgr.astype(np.int16), expected)


# ---------------------------------------------------------------------------
# HIGH silent-parity regression (redteam-confirmed, PR #406): a Master lane's
# automation must NEVER bleed onto a same-type CLIP effect on export.
#
# Root cause (pre-fix): export.py fed the SAME flat `automation_by_frame`
# dict to `modulate_chain_for_frame` for BOTH the per-clip/track chain and
# `master_chain`. Since `apply_modulation` (modulation/engine.py) matches
# chain entries by effect TYPE (`effect_id`), not by which chain/track they
# live on, a Master lane on "fx.color_invert.amount" silently ALSO overrode
# any CLIP effect of that same type — invisible in preview (whose composite
# path never calls `apply_modulation` for the per-clip chain) but present in
# every export. Fix: master lane overrides now travel via the dedicated
# `master_automation_by_frame` param, applied EXCLUSIVELY to `master_chain`.
# ---------------------------------------------------------------------------

CLIP_INVERT = [
    {
        "effect_id": "fx.color_invert",
        "params": {"channel": "all", "amount": 0.0},
        "enabled": True,
    }
]


def test_master_automation_does_not_contaminate_same_type_clip_effect(
    synthetic_video_path,
):
    """A CLIP `fx.color_invert` (static amount=0, never automated) plus a
    MASTER `fx.color_invert` swept 0->1 via `master_automation_by_frame`:
    the clip effect's own param must stay UNCHANGED by the master lane.

    Oracle: `fx.color_invert` at amount=1 is self-cancelling when applied
    TWICE (out = 255 - base, so invert(invert(x)) == x). If the bug were
    present, the master override would ALSO force the clip's amount to 1
    (same type key), so the clip pass would already invert the frame and the
    master pass would invert it AGAIN — cancelling back to the ORIGINAL
    uninverted pixels. The fixed behavior must show exactly ONE inversion
    (from the master pass only) on the last (amount=1) frame.
    """
    end_frame = 6
    auto = _automation_sweep(end_frame)
    settings = {
        "export_type": "image_sequence",
        "image_format": "png",
        "region": "custom",
        "start_frame": 0,
        "end_frame": end_frame,
        "fps": "source",
        "include_audio": False,
    }
    with tempfile.TemporaryDirectory() as base:
        d_clip_only = os.path.join(base, "clip-only")
        d_both = os.path.join(base, "clip-plus-automated-master")

        job_clip_only = ExportManager().start(
            input_path=synthetic_video_path,
            output_path=d_clip_only,
            chain=CLIP_INVERT,
            project_seed=7,
            settings=settings,
        )
        job_both = ExportManager().start(
            input_path=synthetic_video_path,
            output_path=d_both,
            chain=CLIP_INVERT,
            project_seed=7,
            settings=settings,
            master_chain=MASTER_INVERT,
            master_automation_by_frame=auto,
        )
        assert _run_to_completion(job_clip_only) == ExportStatus.COMPLETE, (
            job_clip_only.error
        )
        assert _run_to_completion(job_both) == ExportStatus.COMPLETE, job_both.error

        import cv2

        clip_only_frames = sorted(os.listdir(d_clip_only))
        both_frames = sorted(os.listdir(d_both))
        assert len(clip_only_frames) == len(both_frames) == end_frame + 1

        # Frame 0: master amount=0 too (sweep starts at 0) -> both runs match
        # (clip's own amount was never automated — stays at its static 0).
        c0 = cv2.imread(
            os.path.join(d_clip_only, clip_only_frames[0]), cv2.IMREAD_COLOR
        )
        b0 = cv2.imread(os.path.join(d_both, both_frames[0]), cv2.IMREAD_COLOR)
        np.testing.assert_array_equal(c0, b0)

        # Last frame: master amount=1 -> exactly ONE inversion of whatever
        # the (untouched) clip pass produced.
        c_last = cv2.imread(
            os.path.join(d_clip_only, clip_only_frames[-1]), cv2.IMREAD_COLOR
        )
        b_last = cv2.imread(os.path.join(d_both, both_frames[-1]), cv2.IMREAD_COLOR)
        expected_single_invert = 255 - c_last.astype(np.int16)
        np.testing.assert_array_equal(b_last.astype(np.int16), expected_single_invert)
        assert not np.array_equal(b_last, c_last), (
            "CLIP effect was contaminated by the Master automation lane — "
            "the clip's own amount was ALSO forced to 1, so the double "
            "invert cancelled back to the uninverted baseline (the exact "
            "PR #406 HIGH silent-parity bug)"
        )


def test_master_own_param_automation_still_works_after_scoping_fix(
    synthetic_video_path,
):
    """Regression guard for the scoping fix itself: with NO clip chain at
    all (chain=[]), the Master's OWN param automation via
    `master_automation_by_frame` must still vary per frame end-to-end —
    proving the fix didn't accidentally break M.3's headline feature while
    closing the cross-chain leak."""
    end_frame = 6
    auto = _automation_sweep(end_frame)
    with tempfile.TemporaryDirectory() as base:
        d_auto = os.path.join(base, "master-auto-only")
        job_auto = ExportManager().start(
            input_path=synthetic_video_path,
            output_path=d_auto,
            chain=[],
            project_seed=7,
            settings={
                "export_type": "image_sequence",
                "image_format": "png",
                "region": "custom",
                "start_frame": 0,
                "end_frame": end_frame,
                "fps": "source",
                "include_audio": False,
            },
            master_chain=MASTER_INVERT,
            master_automation_by_frame=auto,
        )
        assert _run_to_completion(job_auto) == ExportStatus.COMPLETE, job_auto.error

        import cv2

        auto_frames = sorted(os.listdir(d_auto))
        assert len(auto_frames) == end_frame + 1
        f0 = cv2.imread(os.path.join(d_auto, auto_frames[0]), cv2.IMREAD_COLOR)
        f_last = cv2.imread(os.path.join(d_auto, auto_frames[-1]), cv2.IMREAD_COLOR)
        # amount=0 at frame 0 vs amount=1 at the last frame must differ —
        # the master effect is genuinely time-varying, not a static bake.
        assert not np.array_equal(f0, f_last)
