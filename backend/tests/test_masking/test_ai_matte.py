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
    is_valid_matte_path,
    matte_cache_path,
    validate_matte_path,
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


def test_ai_matte_node_resolves_per_frame(_tmp_cache_dir):
    h, w = 48, 64
    # 4 frames: 0,1 fully white (alpha≈1); 2,3 fully black (alpha≈0).
    frames = [
        np.full((h, w), 255, np.uint8),
        np.full((h, w), 255, np.uint8),
        np.zeros((h, w), np.uint8),
        np.zeros((h, w), np.uint8),
    ]
    # Matte MUST live inside the jail (~/.creatrix/mattes, redirected to tmp).
    matte_path = os.path.join(_tmp_cache_dir, "matte.mp4")
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


def test_missing_matte_file_flat_field_fallback_and_warns(caplog, _tmp_cache_dir):
    h, w = 32, 40
    # A VALID in-jail path that was evicted/never written → the missing branch
    # (distinct from the jail-reject branch which the security tests cover).
    gone = os.path.join(_tmp_cache_dir, "evicted.mp4")
    node = MatteNode.from_dict(
        {"id": "ai_missing", "kind": "ai_matte", "params": {"matte_path": gone}}
    )
    assert node is not None
    with caplog.at_level(logging.WARNING):
        m = evaluate_ai_matte(node, FrameCtx(frame_index=0), h, w)
    assert m.shape == (h, w)
    assert np.allclose(m, 0.5), "missing file must degrade to a flat-0.5 field"
    assert any("missing" in r.message.lower() for r in caplog.records)


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


def test_split_by_matte_renders_independent_chains(_tmp_cache_dir):
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
    # Must live inside the jail (~/.creatrix/mattes, redirected to tmp).
    matte_path = os.path.join(_tmp_cache_dir, "m.mp4")
    _write_matte_video(matte_path, [_split_matte_frame(h, w)] * 3)

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


# --------------------------------------------------------------------------- #
#  SECURITY — matte_path sidecar jail (qa-redteam Surface 3+4)
# --------------------------------------------------------------------------- #


def _spy_reader(monkeypatch):
    """Install a spy on VideoReader so we can assert av.open is NEVER reached."""
    calls = {"opened": []}

    class _Boom:
        def __init__(self, path):
            calls["opened"].append(path)
            raise AssertionError(f"VideoReader/av.open reached for {path!r}")

    import video.reader as _vr

    monkeypatch.setattr(_vr, "VideoReader", _Boom)
    return calls


@pytest.mark.parametrize(
    "bad_path,label",
    [
        ("/etc/passwd", "arbitrary local file"),
        ("http://169.254.169.254/latest/meta-data/", "SSRF metadata URL"),
        ("rtsp://evil.example/stream", "rtsp URL"),
        ("~/.creatrix/mattes/../../../etc/passwd", "dot-dot traversal"),
        ("relative/mattes/x.mp4", "non-absolute"),
        ("/tmp/evil.mp4", "outside the jail"),
    ],
)
def test_ai_matte_path_jail_rejects_hostile_paths(bad_path, label, monkeypatch):
    """(a) /etc/passwd (b) 169.254 SSRF (c/…) traversal/relative/outside jail →
    all rejected → flat-0.5 fallback, and av.open is NEVER reached."""
    ai_matte.clear_matte_readers()
    calls = _spy_reader(monkeypatch)

    assert is_valid_matte_path(bad_path) is False, f"{label} should be rejected"
    assert validate_matte_path(bad_path), f"{label} must yield error strings"

    node = MatteNode(id="ai-bad", kind="ai_matte", params={"matte_path": bad_path})
    m = evaluate_ai_matte(node, FrameCtx(frame_index=0), 24, 32)
    assert np.allclose(m, 0.5), f"{label} did not degrade to flat-0.5"
    assert calls["opened"] == [], f"{label} reached av.open — jail bypassed"
    ai_matte.clear_matte_readers()


def test_ai_matte_path_jail_rejects_symlink_escaping_jail(tmp_path, monkeypatch):
    """A symlink INSIDE the jail pointing OUTSIDE is rejected (resolve() escape)."""
    jail = tmp_path / "mattes"
    jail.mkdir(exist_ok=True)
    monkeypatch.setattr(ai_matte, "matte_cache_dir", lambda: str(jail))
    ai_matte.clear_matte_readers()

    secret = tmp_path / "secret.mp4"
    secret.write_bytes(b"not a matte")
    link = jail / "escape.mp4"
    os.symlink(secret, link)  # inside jail by name, resolves outside

    assert is_valid_matte_path(str(link)) is False
    calls = _spy_reader(monkeypatch)
    node = MatteNode(id="ai-sym", kind="ai_matte", params={"matte_path": str(link)})
    m = evaluate_ai_matte(node, FrameCtx(frame_index=0), 16, 16)
    assert np.allclose(m, 0.5)
    assert calls["opened"] == []
    ai_matte.clear_matte_readers()


def test_ai_matte_node_rejected_at_schema_boundary_for_bad_path(monkeypatch):
    """The schema trust boundary drops an ai_matte node with an out-of-jail path
    (validate_stack → the ref degrades to no-mask), matching render_composite/
    export payload validation."""
    from masking.schema import validate_stack

    good_dir = ai_matte.matte_cache_dir()
    good = os.path.join(good_dir, "deadbeef.mp4")

    raw = [
        {"id": "evil", "kind": "ai_matte", "params": {"matte_path": "/etc/passwd"}},
        {"id": "ok", "kind": "ai_matte", "params": {"matte_path": good}},
    ]
    nodes = validate_stack(raw)
    ids = {n.id for n in nodes}
    assert "evil" not in ids, "hostile matte_path node survived schema validation"
    assert "ok" in ids, "legit in-jail matte_path node was wrongly dropped"


def test_ai_matte_legit_cache_path_passes_jail_and_renders(tmp_path, monkeypatch):
    """A legit server-issued cache path under the jail resolves and renders."""
    jail = tmp_path / "mattes"
    jail.mkdir(exist_ok=True)
    monkeypatch.setattr(ai_matte, "matte_cache_dir", lambda: str(jail))
    ai_matte.clear_matte_readers()

    h, w = 32, 48
    matte_path = str(jail / "abc123.mp4")
    _write_matte_video(matte_path, [np.full((h, w), 255, np.uint8)] * 2)

    assert is_valid_matte_path(matte_path) is True
    node = MatteNode.from_dict(
        {"id": "ok", "kind": "ai_matte", "params": {"matte_path": matte_path}}
    )
    assert node is not None, "legit in-jail node rejected at schema boundary"
    m = evaluate_ai_matte(node, FrameCtx(frame_index=0), h, w)
    assert float(m.mean()) > 0.8, "legit matte did not render (white subject)"
    ai_matte.clear_matte_readers()


def test_corrupt_matte_open_failure_warns_once_not_per_frame(
    tmp_path, monkeypatch, caplog
):
    """A corrupt-but-existing matte inside the jail warns ONCE across many
    frames (dedup) and does not re-open VideoReader every frame."""
    jail = tmp_path / "mattes"
    jail.mkdir(exist_ok=True)
    monkeypatch.setattr(ai_matte, "matte_cache_dir", lambda: str(jail))
    ai_matte.clear_matte_readers()

    corrupt = jail / "corrupt.mp4"
    corrupt.write_bytes(b"\x00\x01\x02 not a video")

    open_count = {"n": 0}
    import video.reader as _vr

    class _Boom:
        def __init__(self, path):
            open_count["n"] += 1
            raise ValueError("bad file")

    monkeypatch.setattr(_vr, "VideoReader", _Boom)

    node = MatteNode(
        id="ai-corrupt", kind="ai_matte", params={"matte_path": str(corrupt)}
    )
    with caplog.at_level(logging.WARNING):
        for idx in range(10):
            m = evaluate_ai_matte(node, FrameCtx(frame_index=idx), 16, 16)
            assert np.allclose(m, 0.5)

    assert open_count["n"] == 1, "corrupt matte re-opened every frame (no dedup)"
    warn_lines = [r for r in caplog.records if "corrupt.mp4" in r.getMessage()]
    assert len(warn_lines) == 1, f"expected 1 warning, got {len(warn_lines)}"
    ai_matte.clear_matte_readers()


def test_rvm_runner_rejects_reversed_frame_range():
    """rvm_runner: reversed non-sentinel range (end < start, end >= 0) exits
    with an error instead of silently matting the whole source."""
    import subprocess

    r = subprocess.run(
        [
            sys.executable,
            "-m",
            "masking.rvm_runner",
            "--input",
            "/nonexistent.mp4",
            "--output",
            "/tmp/x.mp4",
            "--start-frame",
            "50",
            "--end-frame",
            "10",
        ],
        cwd=os.path.join(os.path.dirname(__file__), "..", "..", "src"),
        capture_output=True,
        text=True,
        timeout=60,
    )
    assert r.returncode != 0, "reversed range should be a hard error"
    assert "reversed frame range" in r.stderr.lower()
