"""MK.12 — AI subject matte (local RVM) + Split by matte tests.

The named oracle for the packet:
  1. test_rvm_unavailable_returns_actionable_error        (negative)
  2. test_job_cancel_mid_run_leaves_no_partial_cache_file (negative)
  3. test_matte_video_cache_keyed_by_content_hash
  4. test_ai_matte_node_resolves_per_frame
  5. test_missing_matte_file_flat_field_fallback_and_warns (negative)
  6. test_headroom_guard_refuses_under_2gib                (negative)
  + integration: test_split_by_matte_renders_independent_chains

(The two store-layer named tests — test_split_by_matte_creates_twin_with_inverted_ref
and test_split_is_one_undo_entry — live in the frontend vitest suite.)

CI runs the MOCKED-model path only: the real RVM model is never invoked here —
these tests inject fast fake runners / synthetic matte videos. The real-model
smoke is a separate dev-machine step (see the PR).
"""

from __future__ import annotations

import logging
import os
import sys
import time

import cv2
import numpy as np
import pytest

from masking import ai_matte
from masking.ai_matte import (
    AiMatteManager,
    AiMatteStatus,
    MemoryHeadroomError,
    RvmUnavailableError,
    compute_content_hash,
    evaluate_ai_matte,
    matte_cache_path,
)
from masking.schema import MatteNode
from masking.stack import FrameCtx


# --------------------------------------------------------------------------- #
#  Fixtures / helpers
# --------------------------------------------------------------------------- #


@pytest.fixture(autouse=True)
def _tmp_cache_dir(tmp_path, monkeypatch):
    """Redirect the matte cache to a tmp dir so tests never touch ~/.creatrix."""
    d = tmp_path / "mattes"
    d.mkdir()
    monkeypatch.setattr(ai_matte, "matte_cache_dir", lambda: str(d))
    ai_matte.clear_matte_readers()
    yield str(d)
    ai_matte.clear_matte_readers()


def _write_matte_video(path: str, frames: list[np.ndarray], fps: float = 30.0) -> None:
    """Write a grayscale matte video (single-channel), like rvm_runner does."""
    h, w = frames[0].shape
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(path, fourcc, fps, (w, h), False)
    assert writer.isOpened(), "could not open matte VideoWriter"
    for f in frames:
        writer.write(f.astype(np.uint8))
    writer.release()


def _split_matte_frame(h: int, w: int) -> np.ndarray:
    """Left 40% = white subject (255), right 40% = black background (0)."""
    m = np.zeros((h, w), dtype=np.uint8)
    m[:, : int(w * 0.4)] = 255
    return m


# --------------------------------------------------------------------------- #
#  1. RVM unavailable → actionable, tb-free error (negative)
# --------------------------------------------------------------------------- #


def test_rvm_unavailable_returns_actionable_error(monkeypatch):
    monkeypatch.setattr(ai_matte, "rvm_available", lambda: False)
    mgr = AiMatteManager()
    with pytest.raises(RvmUnavailableError) as exc:
        mgr.start("/some/source.mp4")
    err = exc.value
    assert err.code == "rvm_unavailable"
    # Names the extra so the user can install it — no traceback dump.
    assert "masking-ai" in str(err)
    assert "pip install" in str(err)


# --------------------------------------------------------------------------- #
#  2. Cancel mid-run → no partial cache file, temp removed (negative)
# --------------------------------------------------------------------------- #


def test_job_cancel_mid_run_leaves_no_partial_cache_file(monkeypatch):
    monkeypatch.setattr(ai_matte, "rvm_available", lambda: True)
    monkeypatch.setattr(ai_matte, "_headroom_bytes", lambda: 8 * 1024**3)

    mgr = AiMatteManager()

    # Fake runner: prints progress slowly, never writes the output file. Lets us
    # cancel while "running" and prove no cache/temp file survives.
    def fake_build_cmd(**kw):
        return [
            sys.executable,
            "-c",
            "import time,sys\n"
            "for i in range(200):\n"
            "    print(f'PROGRESS {i+1}/200', flush=True)\n"
            "    time.sleep(0.02)\n",
        ]

    monkeypatch.setattr(mgr, "_build_cmd", fake_build_cmd)

    job = mgr.start("/some/source.mp4")
    cache_path = matte_cache_path(job.content_hash)

    # Wait until it's actually running (progress observed).
    deadline = time.monotonic() + 5.0
    while time.monotonic() < deadline and job.current_frame == 0:
        time.sleep(0.02)
    assert job.current_frame > 0, "fake runner never reported progress"

    assert mgr.cancel() is True
    job._thread.join(timeout=5.0)

    assert job.status == AiMatteStatus.CANCELLED
    assert not os.path.exists(cache_path), "cancel left a partial cache file"
    assert not os.path.exists(job._tmp_path), "cancel left a temp file"


# --------------------------------------------------------------------------- #
#  3. Cache keyed by content hash → same clip twice is a cache hit (0 reruns)
# --------------------------------------------------------------------------- #


def test_matte_video_cache_keyed_by_content_hash(monkeypatch):
    monkeypatch.setattr(ai_matte, "rvm_available", lambda: True)
    monkeypatch.setattr(ai_matte, "_headroom_bytes", lambda: 8 * 1024**3)

    src = "/some/source.mp4"
    h = compute_content_hash(
        src, start_frame=0, end_frame=-1, downsample_ratio=0.25, max_dimension=1080
    )
    # Determinism: same inputs → same hash.
    assert h == compute_content_hash(
        src, start_frame=0, end_frame=-1, downsample_ratio=0.25, max_dimension=1080
    )
    # A param change → different hash (new bake).
    assert h != compute_content_hash(
        src, start_frame=0, end_frame=-1, downsample_ratio=0.4, max_dimension=1080
    )

    # Pre-seed the cache file at the expected path.
    cache_path = matte_cache_path(h)
    with open(cache_path, "wb") as fh:
        fh.write(b"fake-matte")

    mgr = AiMatteManager()
    built = {"called": False}

    def spy_build_cmd(**kw):
        built["called"] = True
        return ["true"]

    monkeypatch.setattr(mgr, "_build_cmd", spy_build_cmd)

    job = mgr.start(src)
    assert job.cached is True
    assert job.status == AiMatteStatus.COMPLETE
    assert job.matte_path == cache_path
    assert built["called"] is False, "cache hit still spawned a bake (rerun)"


# --------------------------------------------------------------------------- #
#  4. ai_matte node resolves per frame (different index → different frame)
# --------------------------------------------------------------------------- #


def test_ai_matte_node_resolves_per_frame(tmp_path):
    h, w = 48, 64
    # 4 frames: 0,1 fully white (alpha≈1); 2,3 fully black (alpha≈0).
    frames = [
        np.full((h, w), 255, np.uint8),
        np.full((h, w), 255, np.uint8),
        np.zeros((h, w), np.uint8),
        np.zeros((h, w), np.uint8),
    ]
    matte_path = str(tmp_path / "matte.mp4")
    _write_matte_video(matte_path, frames)

    node = MatteNode.from_dict(
        {
            "id": "ai1",
            "kind": "ai_matte",
            "params": {"matte_path": matte_path, "start_frame": 0},
        }
    )
    assert node is not None

    def alpha_at(idx: int) -> float:
        m = evaluate_ai_matte(node, FrameCtx(frame_index=idx), h, w)
        assert m.shape == (h, w)
        return float(m.mean())

    assert alpha_at(0) > 0.8  # white frame
    assert alpha_at(3) < 0.2  # black frame
    # Out-of-range index wrap-clamps to the last frame (black).
    assert alpha_at(99) < 0.2


# --------------------------------------------------------------------------- #
#  5. Missing matte file → flat-0.5 fallback + warning (negative)
# --------------------------------------------------------------------------- #


def test_missing_matte_file_flat_field_fallback_and_warns(caplog):
    h, w = 32, 40
    node = MatteNode.from_dict(
        {
            "id": "ai_missing",
            "kind": "ai_matte",
            "params": {"matte_path": "/no/such/matte.mp4"},
        }
    )
    assert node is not None
    with caplog.at_level(logging.WARNING):
        m = evaluate_ai_matte(node, FrameCtx(frame_index=0), h, w)
    assert m.shape == (h, w)
    assert np.allclose(m, 0.5), "missing file must degrade to a flat-0.5 field"
    assert any(
        "missing" in r.message.lower() or "flat" in r.message.lower()
        for r in caplog.records
    )


# --------------------------------------------------------------------------- #
#  6. Headroom guard refuses under 2 GiB (negative)
# --------------------------------------------------------------------------- #


def test_headroom_guard_refuses_under_2gib(monkeypatch):
    monkeypatch.setattr(ai_matte, "rvm_available", lambda: True)
    # Mock SG-8: only 1 GiB free → below the 2 GiB start gate.
    monkeypatch.setattr(ai_matte, "_headroom_bytes", lambda: 1 * 1024**3)

    mgr = AiMatteManager()
    with pytest.raises(MemoryHeadroomError) as exc:
        mgr.start("/some/source.mp4")
    assert exc.value.code == "insufficient_memory_headroom"
    assert exc.value.available_bytes == 1 * 1024**3


# --------------------------------------------------------------------------- #
#  Integration — twin-track render: figure byte-stable, background changed
# --------------------------------------------------------------------------- #


def test_split_by_matte_renders_independent_chains(tmp_path):
    """The music-video proof, at the sidecar seam.

    Background track = source through a glitch chain (fx.invert) routed via the
    INVERTED ai_matte (chain_mask). Subject pixels (matte→0 after invert) must be
    byte-identical to the unsplit source; background pixels (matte→1) must change.
    Exercises: ai_matte evaluator → apply_masks_to_chain → apply_chain wet/dry.
    """
    from engine.pipeline import apply_chain
    from masking.routing import apply_masks_to_chain

    h, w = 48, 80
    # Crisp binary matte: left 40% subject(white), right 40% background(black).
    _write_matte_video(str(tmp_path / "m.mp4"), [_split_matte_frame(h, w)] * 3)
    matte_path = str(tmp_path / "m.mp4")

    # Deterministic non-uniform source so invert is observable.
    rng = np.random.default_rng(7)
    source = np.empty((h, w, 4), np.uint8)
    source[:, :, :3] = rng.integers(30, 220, size=(h, w, 3), dtype=np.uint8)
    source[:, :, 3] = 255

    mask_stack = [
        {
            "id": "aimatte",
            "kind": "ai_matte",
            "params": {"matte_path": matte_path, "start_frame": 0},
            "op": "add",
            "invert": False,
            "feather": 0.0,
            "growShrink": 0.0,
            "enabled": True,
        }
    ]
    chain = [{"effect_id": "fx.invert", "params": {}, "enabled": True}]

    # BACKGROUND twin: whole-chain routed through the INVERTED matte ref.
    masked_chain, chain_mask = apply_masks_to_chain(
        list(chain),
        mask_stack,
        FrameCtx(frame=source, frame_index=0, clip_id="clip"),
        (h, w),
        chain_mask_ref={"node_id": "aimatte", "invert": True},
    )
    assert chain_mask is not None
    bg_out, _ = apply_chain(
        source, masked_chain, 0, 0, (w, h), {}, chain_mask=chain_mask
    )

    # Reference UNSPLIT render (full invert, no mask).
    unsplit, _ = apply_chain(source, list(chain), 0, 0, (w, h), {})

    # Regions safely interior to each half (avoid the compression-soft boundary).
    subj = np.s_[:, : int(w * 0.30)]
    bg = np.s_[:, int(w * 0.70) :]

    # Figure (subject) pixels: byte-stable vs the ORIGINAL source.
    assert np.array_equal(bg_out[subj][:, :, :3], source[subj][:, :, :3]), (
        "subject pixels changed — split leaked the background glitch onto the figure"
    )
    # Background pixels: changed (glitched), and match the unsplit invert there.
    assert not np.array_equal(bg_out[bg][:, :, :3], source[bg][:, :, :3]), (
        "background pixels unchanged — the glitch never reached the background"
    )
    assert np.array_equal(bg_out[bg][:, :, :3], unsplit[bg][:, :, :3])
