"""MK.12 — AI subject matte (local RVM) source + offline bake job.

Two public surfaces live here:

1. **The ``ai_matte`` procedural evaluator** (``evaluate_ai_matte``) — resolves a
   pre-baked grayscale matte VIDEO into a per-frame float32 (H, W) matte in
   [0, 1] via the SG-7-wrapped ``VideoReader``. Registered into the masking
   ``_EVALUATOR_REGISTRY`` at package import (mirrors MK.6/MK.8). A missing or
   evicted cache file degrades to a flat-0.5 field + a rate-limited warning
   (never a crash — MK.3 skip semantics, P6.3 fallback convention).

2. **The offline bake job** (``AiMatteManager`` / ``AiMatteJob``) — mirrors the
   export-job lifecycle (``engine/export.py``: a SEPARATE job class, never a
   fork of the export queue). It ports ``figure-isolator/backends/rvm_local.py``
   (RVM resnet50, CPU, ``output_format="alpha"``) but runs the model in a
   SEPARATE PYTHON SUBPROCESS (locked decision D6 — the sidecar stays lean;
   torch is NEVER imported into this process). The manager's worker thread
   spawns ``python -m masking.rvm_runner``, streams its progress, and atomically
   renames the temp output into the content-addressed cache.

torch is an OPTIONAL extra (``masking-ai``). ``rvm_available()`` probes for it
via ``importlib`` WITHOUT importing it, so ``import zmq_server`` stays torch-free
at sidecar startup whether or not the extra is installed (the import-guard proof
gate). The runner subprocess is the only place torch is ever loaded.
"""

from __future__ import annotations

import hashlib
import importlib.util
import logging
import os
import subprocess
import sys
import tempfile
import threading
import time
from collections import OrderedDict
from dataclasses import dataclass, field
from enum import Enum

import numpy as np

logger = logging.getLogger(__name__)

# --------------------------------------------------------------------------- #
#  Constants
# --------------------------------------------------------------------------- #

#: Minimum live system headroom (SG-8) required to START a bake. Below this the
#: manager refuses rather than risk an OOM mid-model (4K-source failure mode).
HEADROOM_MIN_BYTES: int = 2 * 1024 * 1024 * 1024  # 2 GiB

#: The optional extra that installs torch. Named verbatim in the actionable
#: error so the user can copy/paste the install command.
MASKING_AI_EXTRA: str = "masking-ai"

#: Bake-param defaults (packet Scope). Mirror figure-isolator rvm_local.py.
DEFAULT_DOWNSAMPLE_RATIO: float = 0.25
DEFAULT_MAX_DIMENSION: int = 1080

#: Flat fallback value when a matte file is missing/evicted (P6.3 convention).
FLAT_FALLBACK_VALUE: float = 0.5


# --------------------------------------------------------------------------- #
#  Availability probe (import-guard — P6.4 MLX pattern, but zero-import)
# --------------------------------------------------------------------------- #


def rvm_available() -> bool:
    """True iff the ``masking-ai`` extra (torch + cv2) is importable.

    Uses ``importlib.util.find_spec`` so it NEVER imports torch — probing must
    not pull the heavy dependency into the sidecar process (the import-guard
    proof: ``python -c "import zmq_server"`` stays clean when the extra is
    absent, and lean when present). Mirrors ``field_codegen``/``mlx_available``
    (P6.4) but without the module-top ``try: import`` so torch load is deferred
    entirely to the runner subprocess.
    """
    try:
        return (
            importlib.util.find_spec("torch") is not None
            and importlib.util.find_spec("cv2") is not None
        )
    except (ImportError, ValueError):
        return False


# --------------------------------------------------------------------------- #
#  Structured errors
# --------------------------------------------------------------------------- #


class RvmUnavailableError(RuntimeError):
    """Raised when a bake is requested but the ``masking-ai`` extra is absent.

    Carries a machine-readable ``code`` and an actionable message naming the
    extra + install command — NO traceback leaks to the user (the negative
    test asserts the message names the extra).
    """

    def __init__(self) -> None:
        self.code = "rvm_unavailable"
        super().__init__(
            "AI matte needs the local RVM model, which is not installed. "
            f"Install the optional extra with: "
            f"pip install 'entropic-backend[{MASKING_AI_EXTRA}]' "
            "(downloads torch; ~103 MB of weights fetch on first run)."
        )


class MemoryHeadroomError(RuntimeError):
    """Raised when live SG-8 headroom is below :data:`HEADROOM_MIN_BYTES`."""

    def __init__(self, available: int) -> None:
        self.code = "insufficient_memory_headroom"
        self.available_bytes = int(available)
        gib = available / (1024**3)
        need = HEADROOM_MIN_BYTES / (1024**3)
        super().__init__(
            f"AI matte bake needs at least {need:.0f} GiB of free memory to "
            f"start; only {gib:.2f} GiB is available. Close other apps and "
            "retry."
        )


# --------------------------------------------------------------------------- #
#  Cache addressing (~/.creatrix/mattes/<content_hash>.mp4)
# --------------------------------------------------------------------------- #


def matte_cache_dir() -> str:
    """Return (creating) the matte cache directory under the runtime home."""
    d = os.path.expanduser("~/.creatrix/mattes")
    os.makedirs(d, exist_ok=True)
    return d


def compute_content_hash(
    source_path: str,
    *,
    start_frame: int,
    end_frame: int,
    downsample_ratio: float,
    max_dimension: int,
) -> str:
    """Stable content hash keying the cache (source + range + bake params).

    Same source + same range + same params → same hash → cache hit (the
    ``test_matte_video_cache_keyed_by_content_hash`` oracle: no re-bake). Any
    param change → new hash → new bake (PRD §Cache).
    """
    parts = "|".join(
        str(x)
        for x in (
            os.path.abspath(source_path),
            int(start_frame),
            int(end_frame),
            round(float(downsample_ratio), 4),
            int(max_dimension),
        )
    )
    return hashlib.sha256(parts.encode()).hexdigest()[:32]


def matte_cache_path(content_hash: str) -> str:
    """Absolute cache path for a content hash."""
    return os.path.join(matte_cache_dir(), f"{content_hash}.mp4")


# --------------------------------------------------------------------------- #
#  Headroom probe (indirected so tests can monkeypatch a low value)
# --------------------------------------------------------------------------- #


def _headroom_bytes() -> int:
    """Live SG-8 headroom in bytes. Thin wrapper so tests patch ONE symbol."""
    try:
        from safety.pressure.budget import headroom_bytes

        return int(headroom_bytes())
    except Exception:  # noqa: BLE001 — never let the probe crash the gate
        return HEADROOM_MIN_BYTES


# --------------------------------------------------------------------------- #
#  Bake job lifecycle (mirrors engine/export.py ExportJob/ExportManager)
# --------------------------------------------------------------------------- #


class AiMatteStatus(Enum):
    IDLE = "idle"
    RUNNING = "running"
    COMPLETE = "complete"
    CANCELLED = "cancelled"
    ERROR = "error"


@dataclass
class AiMatteJob:
    """Tracks one offline RVM bake. Mirrors ExportJob's status/cancel shape."""

    content_hash: str = ""
    matte_path: str = ""
    status: AiMatteStatus = AiMatteStatus.IDLE
    current_frame: int = 0
    total_frames: int = 0
    error: str | None = None
    cached: bool = False
    _lock: threading.Lock = field(default_factory=threading.Lock)
    _cancel_event: threading.Event = field(default_factory=threading.Event)
    _thread: threading.Thread | None = field(default=None, repr=False)
    _proc: subprocess.Popen | None = field(default=None, repr=False)
    _tmp_path: str = field(default="", repr=False)
    _start_time: float = field(default=0.0, repr=False)

    @property
    def progress(self) -> float:
        if self.total_frames <= 0:
            return 0.0
        return min(1.0, self.current_frame / self.total_frames)

    def cancel(self) -> None:
        self._cancel_event.set()
        proc = self._proc
        if proc is not None and proc.poll() is None:
            try:
                proc.terminate()
            except Exception:  # noqa: BLE001 — best-effort; finally cleans temp
                pass


class AiMatteManager:
    """Manages background RVM matte bakes. One job at a time (like ExportManager).

    NOT a fork of the export queue — a separate job class that reuses the same
    thread + cancel-event + status-dict pattern (DO-NOT-TOUCH: export job queue).
    """

    def __init__(self) -> None:
        self._job: AiMatteJob | None = None

    @property
    def job(self) -> AiMatteJob | None:
        return self._job

    # -- command builder (indirected so tests inject a fast fake runner) ----- #

    def _build_cmd(
        self,
        *,
        input_path: str,
        output_path: str,
        downsample_ratio: float,
        max_dimension: int,
        start_frame: int,
        end_frame: int,
    ) -> list[str]:
        """Argv that runs the RVM matting in a SEPARATE python process.

        The child (``masking.rvm_runner``) is the ONLY place torch is imported —
        keeping this (sidecar) process lean (D6). Tests monkeypatch this method
        to point at a fast fake so cancel/cache paths don't need the real model.
        """
        return [
            sys.executable,
            "-m",
            "masking.rvm_runner",
            "--input",
            input_path,
            "--output",
            output_path,
            "--downsample-ratio",
            str(downsample_ratio),
            "--max-dimension",
            str(max_dimension),
            "--start-frame",
            str(start_frame),
            "--end-frame",
            str(end_frame),
        ]

    def start(
        self,
        input_path: str,
        *,
        downsample_ratio: float = DEFAULT_DOWNSAMPLE_RATIO,
        max_dimension: int = DEFAULT_MAX_DIMENSION,
        start_frame: int = 0,
        end_frame: int = -1,
    ) -> AiMatteJob:
        """Start (or cache-hit) a matte bake. Returns the tracking job.

        Order of gates (fail BEFORE spawning anything):
          1. A running job → RuntimeError (one at a time, like export).
          2. cache hit → return a COMPLETE job immediately, NO subprocess
             (0 reruns — the cache oracle).
          3. ``rvm_available()`` false → RvmUnavailableError (actionable).
          4. live headroom < 2 GiB → MemoryHeadroomError (the SG-8 guard).
        """
        if self._job is not None and self._job.status == AiMatteStatus.RUNNING:
            raise RuntimeError("An AI matte bake is already in progress")

        content_hash = compute_content_hash(
            input_path,
            start_frame=start_frame,
            end_frame=end_frame,
            downsample_ratio=downsample_ratio,
            max_dimension=max_dimension,
        )
        cache_path = matte_cache_path(content_hash)

        # Gate 2 — cache hit: no model, no subprocess, no rerun.
        if os.path.exists(cache_path):
            job = AiMatteJob(
                content_hash=content_hash,
                matte_path=cache_path,
                status=AiMatteStatus.COMPLETE,
                cached=True,
            )
            self._job = job
            return job

        # Gate 3 — model availability (import-guarded; zero torch import here).
        if not rvm_available():
            raise RvmUnavailableError()

        # Gate 4 — live memory headroom (SG-8). Refuse rather than OOM mid-model.
        avail = _headroom_bytes()
        if avail < HEADROOM_MIN_BYTES:
            raise MemoryHeadroomError(avail)

        job = AiMatteJob(content_hash=content_hash, matte_path=cache_path)
        self._job = job

        # Temp sibling in the cache dir → atomic os.replace on success; the temp
        # NEVER becomes the cache file unless the bake completed (cancel/error
        # remove it — the "no partial cache file" oracle).
        fd, tmp_path = tempfile.mkstemp(
            prefix=f".{content_hash}.", suffix=".tmp.mp4", dir=matte_cache_dir()
        )
        os.close(fd)
        os.unlink(tmp_path)  # runner writes it; we only reserved the unique name
        job._tmp_path = tmp_path

        cmd = self._build_cmd(
            input_path=input_path,
            output_path=tmp_path,
            downsample_ratio=downsample_ratio,
            max_dimension=max_dimension,
            start_frame=start_frame,
            end_frame=end_frame,
        )

        thread = threading.Thread(
            target=self._run_bake,
            args=(job, cmd, cache_path),
            daemon=True,
        )
        job._thread = thread
        job.status = AiMatteStatus.RUNNING
        job._start_time = time.monotonic()
        thread.start()
        return job

    def _run_bake(self, job: AiMatteJob, cmd: list[str], cache_path: str) -> None:
        """Worker-thread body: spawn runner, stream progress, atomically publish.

        Runs on a background thread (export-pattern) so the render loop's 1 s
        heartbeat is never blocked by the CPU-bound model.
        """
        proc = None
        try:
            proc = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1,
            )
            job._proc = proc

            # Stream stdout: the runner prints "PROGRESS <n>/<total>" per chunk.
            assert proc.stdout is not None
            for line in proc.stdout:
                if job._cancel_event.is_set():
                    break
                line = line.strip()
                if line.startswith("PROGRESS "):
                    try:
                        n_str, total_str = line[len("PROGRESS ") :].split("/", 1)
                        with job._lock:
                            job.current_frame = int(n_str)
                            job.total_frames = int(total_str)
                    except (ValueError, IndexError):
                        pass

            if job._cancel_event.is_set():
                self._terminate(proc)
                with job._lock:
                    job.status = AiMatteStatus.CANCELLED
                return

            ret = proc.wait()
            if ret != 0:
                stderr_tail = ""
                if proc.stderr is not None:
                    stderr_tail = (proc.stderr.read() or "").strip()[-400:]
                with job._lock:
                    job.status = AiMatteStatus.ERROR
                    job.error = f"RVM bake failed (exit {ret})" + (
                        f": {stderr_tail}" if stderr_tail else ""
                    )
                return

            if not os.path.exists(job._tmp_path):
                with job._lock:
                    job.status = AiMatteStatus.ERROR
                    job.error = "RVM bake produced no output file"
                return

            # Atomic publish: temp → content-addressed cache path.
            os.replace(job._tmp_path, cache_path)
            with job._lock:
                job.status = AiMatteStatus.COMPLETE
                job.matte_path = cache_path

        except Exception as e:  # noqa: BLE001 — surface, don't crash the sidecar
            logger.exception("AI matte bake failed")
            with job._lock:
                job.status = AiMatteStatus.ERROR
                job.error = f"{type(e).__name__}: {e}"
        finally:
            # Remove any partial temp on cancel/error (never a partial cache
            # file — the negative oracle). On success it was renamed away.
            if job._tmp_path and os.path.exists(job._tmp_path):
                try:
                    os.unlink(job._tmp_path)
                except OSError:
                    pass

    @staticmethod
    def _terminate(proc: subprocess.Popen) -> None:
        if proc.poll() is None:
            try:
                proc.terminate()
                proc.wait(timeout=5)
            except Exception:  # noqa: BLE001
                try:
                    proc.kill()
                except Exception:  # noqa: BLE001
                    pass

    def get_status(self) -> dict:
        """Serializable status dict (mirrors ExportManager.get_status shape)."""
        if self._job is None:
            return {
                "status": AiMatteStatus.IDLE.value,
                "progress": 0.0,
                "current_frame": 0,
                "total_frames": 0,
            }
        job = self._job
        with job._lock:
            return {
                "status": job.status.value,
                "progress": round(job.progress, 4),
                "current_frame": job.current_frame,
                "total_frames": job.total_frames,
                "content_hash": job.content_hash,
                "matte_path": job.matte_path
                if job.status == AiMatteStatus.COMPLETE
                else "",
                "cached": job.cached,
                "error": job.error,
            }

    def cancel(self) -> bool:
        """Cancel the running bake. Returns True if a job was cancelled."""
        if self._job is None:
            return False
        with self._job._lock:
            running = self._job.status == AiMatteStatus.RUNNING
        if running:
            self._job.cancel()
            return True
        return False


# --------------------------------------------------------------------------- #
#  Procedural evaluator: ai_matte (per-frame lookup via SG-7 VideoReader)
# --------------------------------------------------------------------------- #

# Small LRU of open matte readers keyed by path so per-frame resolve_stack calls
# don't re-open the video every frame. Bounded to keep FDs in check.
_MATTE_READER_CACHE_MAX = 4
_matte_readers: "OrderedDict[str, tuple[object, int]]" = OrderedDict()
_missing_warned: set[str] = set()


def _get_matte_reader(path: str) -> tuple[object, int] | None:
    """Return (reader, frame_count) for a matte video, opening lazily. None on error."""
    cached = _matte_readers.get(path)
    if cached is not None:
        _matte_readers.move_to_end(path)
        return cached
    try:
        from video.reader import VideoReader  # SG-7-wrapped decoder

        reader = VideoReader(path)
        count = int(reader.frame_count) if reader.frame_count else 0
        if count <= 0:
            count = 1
        entry = (reader, count)
    except Exception as e:  # noqa: BLE001 — a bad matte file must degrade, not crash
        logger.warning(
            "ai_matte: failed to open matte video %r (%s) — flat fallback",
            path,
            type(e).__name__,
        )
        return None
    _matte_readers[path] = entry
    _matte_readers.move_to_end(path)
    while len(_matte_readers) > _MATTE_READER_CACHE_MAX:
        _, (old_reader, _) = _matte_readers.popitem(last=False)
        close = getattr(old_reader, "close", None)
        if callable(close):
            try:
                close()
            except Exception:  # noqa: BLE001
                pass
    return entry


def clear_matte_readers() -> None:
    """Close + drop all cached matte readers (tests + cache invalidation)."""
    for _reader, _ in _matte_readers.values():
        close = getattr(_reader, "close", None)
        if callable(close):
            try:
                close()
            except Exception:  # noqa: BLE001
                pass
    _matte_readers.clear()
    _missing_warned.clear()


def _flat_field(height: int, width: int) -> np.ndarray:
    return np.full((height, width), FLAT_FALLBACK_VALUE, dtype=np.float32)


def evaluate_ai_matte(node, ctx, height: int, width: int) -> np.ndarray:
    """Procedural ``ai_matte`` evaluator: resolve the baked matte for this frame.

    Params (on the MatteNode):
      matte_path  — absolute path to the baked grayscale matte video.
      start_frame — source frame index the matte's frame 0 corresponds to
                    (default 0; whole-clip bakes).

    Behavior:
      * Missing/unreadable file → flat-0.5 field + one rate-limited warning
        (P6.3 fallback; MK.3 never-crash-the-frame contract).
      * Out-of-range frame index → CLAMPED into [0, frame_count-1] (wrap-clamp).
      * Grayscale matte pixel (0..255) → float32 alpha in [0, 1].
    """
    params = getattr(node, "params", {}) or {}
    path = params.get("matte_path")
    if not path or not isinstance(path, str) or not os.path.exists(path):
        if isinstance(path, str) and path not in _missing_warned:
            _missing_warned.add(path)
            logger.warning(
                "ai_matte: matte file %r missing/evicted — flat %.1f fallback "
                "(re-bake to restore)",
                path,
                FLAT_FALLBACK_VALUE,
            )
        return _flat_field(height, width)

    entry = _get_matte_reader(path)
    if entry is None:
        return _flat_field(height, width)
    reader, count = entry

    start_frame = params.get("start_frame", 0)
    try:
        start_frame = int(start_frame)
    except (TypeError, ValueError):
        start_frame = 0

    matte_idx = int(ctx.frame_index) - start_frame
    # Wrap-clamp out-of-range (packet): negative → 0, beyond end → last frame.
    if matte_idx < 0:
        matte_idx = 0
    elif matte_idx >= count:
        matte_idx = count - 1

    try:
        frame = reader.decode_frame(matte_idx)  # RGBA uint8 (grayscale replicated)
    except Exception as e:  # noqa: BLE001 — decode failure degrades, never crashes
        logger.warning(
            "ai_matte: decode of frame %d from %r failed (%s) — flat fallback",
            matte_idx,
            path,
            type(e).__name__,
        )
        return _flat_field(height, width)

    # Grayscale alpha: any channel (R==G==B for a gray matte). Normalize 0..1.
    alpha = frame[:, :, 0].astype(np.float32) / 255.0
    if alpha.shape != (height, width):
        import cv2

        alpha = cv2.resize(alpha, (width, height), interpolation=cv2.INTER_LINEAR)
    return np.clip(alpha, 0.0, 1.0)


def register_ai_matte_evaluator() -> None:
    """Wire ``ai_matte`` into the masking stack registry (called at import)."""
    from masking.stack import register_evaluator

    register_evaluator("ai_matte", evaluate_ai_matte)


# Module-level manager singleton the zmq handlers share (like ExportManager,
# but constructed lazily by the server; kept here for test convenience).
_manager: AiMatteManager | None = None


def get_manager() -> AiMatteManager:
    global _manager
    if _manager is None:
        _manager = AiMatteManager()
    return _manager
