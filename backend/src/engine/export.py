"""Export job manager — background rendering with progress and cancel."""

import logging
import threading
from dataclasses import dataclass, field
from enum import Enum

import sentry_sdk

from engine.pipeline import apply_chain
from video.reader import VideoReader
from video.writer import VideoWriter

logger = logging.getLogger(__name__)


class ExportStatus(Enum):
    IDLE = "idle"
    RUNNING = "running"
    COMPLETE = "complete"
    CANCELLED = "cancelled"
    ERROR = "error"


@dataclass
class ExportJob:
    """Tracks state of a background export."""

    status: ExportStatus = ExportStatus.IDLE
    current_frame: int = 0
    total_frames: int = 0
    error: str | None = None
    output_path: str = ""
    _lock: threading.Lock = field(default_factory=threading.Lock)
    _cancel_event: threading.Event = field(default_factory=threading.Event)
    _thread: threading.Thread | None = field(default=None, repr=False)

    @property
    def progress(self) -> float:
        if self.total_frames == 0:
            return 0.0
        return self.current_frame / self.total_frames

    def cancel(self):
        self._cancel_event.set()


class ExportManager:
    """Manages background export jobs. One job at a time."""

    def __init__(self):
        self._job: ExportJob | None = None

    @property
    def job(self) -> ExportJob | None:
        return self._job

    def start(
        self,
        input_path: str,
        output_path: str,
        chain: list[dict],
        project_seed: int,
    ) -> ExportJob:
        """Start a background export. Returns the job for status tracking.

        Raises:
            RuntimeError: If an export is already running.
        """
        if self._job is not None and self._job.status == ExportStatus.RUNNING:
            raise RuntimeError("Export already in progress")

        job = ExportJob(output_path=output_path)
        self._job = job

        thread = threading.Thread(
            target=self._run_export,
            args=(job, input_path, output_path, chain, project_seed),
            daemon=True,
        )
        job._thread = thread
        job.status = ExportStatus.RUNNING
        thread.start()

        return job

    def _run_export(
        self,
        job: ExportJob,
        input_path: str,
        output_path: str,
        chain: list[dict],
        project_seed: int,
    ):
        reader = None
        writer = None
        try:
            reader = VideoReader(input_path)
            job.total_frames = reader.frame_count
            resolution = (reader.width, reader.height)

            writer = VideoWriter(
                output_path,
                reader.width,
                reader.height,
                fps=int(reader.fps),
            )

            states: dict[str, dict | None] = {}

            for i in range(job.total_frames):
                if job._cancel_event.is_set():
                    with job._lock:
                        job.status = ExportStatus.CANCELLED
                    return

                frame = reader.decode_frame(i)

                output, states = apply_chain(
                    frame, chain, project_seed, i, resolution, states
                )

                writer.write_frame(output)
                with job._lock:
                    job.current_frame = i + 1

            with job._lock:
                job.status = ExportStatus.COMPLETE

        except Exception as e:
            sentry_sdk.capture_exception(e)
            logger.exception("Export failed")
            with job._lock:
                job.status = ExportStatus.ERROR
                job.error = f"Export failed: {type(e).__name__}"
        finally:
            if writer is not None:
                writer.close()
            if reader is not None:
                reader.close()

    def get_status(self) -> dict:
        """Return serializable status dict."""
        if self._job is None:
            return {
                "status": ExportStatus.IDLE.value,
                "progress": 0.0,
                "current_frame": 0,
                "total_frames": 0,
            }
        with self._job._lock:
            return {
                "status": self._job.status.value,
                "progress": round(self._job.progress, 4),
                "current_frame": self._job.current_frame,
                "total_frames": self._job.total_frames,
                "output_path": self._job.output_path,
                "error": self._job.error,
            }

    def cancel(self) -> bool:
        """Cancel the running export. Returns True if a job was cancelled."""
        if self._job is None:
            return False
        with self._job._lock:
            if self._job.status == ExportStatus.RUNNING:
                self._job.cancel()
                return True
        return False
