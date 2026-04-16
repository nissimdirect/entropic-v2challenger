"""Export job manager — background rendering with progress and cancel."""

import logging
import os
import tempfile
import threading
import time
from dataclasses import dataclass, field
from enum import Enum

import av
import cv2
import numpy as np
import sentry_sdk

from engine.codecs import (
    CODEC_REGISTRY,
    FPS_PRESETS,
    RESOLUTION_PRESETS,
    get_codec_config,
)
from engine.gif_export import export_gif_from_generator
from engine.image_sequence import export_image_sequence_from_generator
from engine.pipeline import apply_chain
from engine.text_renderer import render_text_frame
from video.image_reader import ImageReader, is_image_file
from video.reader import VideoReader
from video.writer import VideoWriter

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Default export settings
# ---------------------------------------------------------------------------

DEFAULT_SETTINGS: dict = {
    "codec": "h264",
    "resolution": "source",
    "custom_width": None,
    "custom_height": None,
    "fps": "source",
    "quality_preset": "medium",
    "bitrate": None,
    "crf": None,
    "region": "full",
    "start_frame": None,
    "end_frame": None,
    "include_audio": True,
    "export_type": "video",
    "gif_max_width": 480,
    "gif_dithering": True,
    "image_format": "png",
    "jpeg_quality": 95,
}


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
    _start_time: float = field(default=0.0, repr=False)

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
        settings: dict | None = None,
        text_layers: list[dict] | None = None,
    ) -> ExportJob:
        """Start a background export. Returns the job for status tracking.

        Parameters
        ----------
        input_path : str
            Source video file.
        output_path : str
            Destination file (or directory for image_sequence).
        chain : list[dict]
            Effect chain to apply per frame.
        project_seed : int
            Deterministic seed for effects.
        settings : dict, optional
            Export settings dict. Missing keys fall back to *DEFAULT_SETTINGS*.

        Raises
        ------
        RuntimeError
            If an export is already running.
        """
        if self._job is not None and self._job.status == ExportStatus.RUNNING:
            raise RuntimeError("Export already in progress")

        merged = {**DEFAULT_SETTINGS, **(settings or {})}

        job = ExportJob(output_path=output_path)
        self._job = job

        thread = threading.Thread(
            target=self._run_export,
            args=(
                job,
                input_path,
                output_path,
                chain,
                project_seed,
                merged,
                text_layers or [],
            ),
            daemon=True,
        )
        job._thread = thread
        job.status = ExportStatus.RUNNING
        job._start_time = time.monotonic()
        thread.start()

        return job

    # ------------------------------------------------------------------
    # Internal: resolve settings into concrete values
    # ------------------------------------------------------------------

    @staticmethod
    def _resolve_resolution(
        settings: dict, source_w: int, source_h: int
    ) -> tuple[int, int]:
        """Return (width, height) for the export."""
        res = settings["resolution"]
        if res == "custom":
            w = settings.get("custom_width")
            h = settings.get("custom_height")
            if w is None or h is None:
                raise ValueError(
                    "custom_width and custom_height are required when resolution='custom'"
                )
            return (int(w), int(h))
        preset = RESOLUTION_PRESETS.get(res)
        if preset is None:
            # "source" or unrecognized -> keep source
            return (source_w, source_h)
        return preset

    @staticmethod
    def _resolve_fps(settings: dict, source_fps: float) -> int:
        """Return target FPS as int."""
        fps_key = settings["fps"]
        preset = FPS_PRESETS.get(fps_key)
        if preset is None:
            return int(source_fps)
        return preset

    @staticmethod
    def _resolve_frame_range(settings: dict, total_frames: int) -> tuple[int, int]:
        """Return (start_frame, end_frame) inclusive range."""
        region = settings["region"]
        if region == "full":
            return (0, total_frames - 1)

        # "loop_region" and "custom" both use start_frame / end_frame
        sf = settings.get("start_frame")
        ef = settings.get("end_frame")
        start = max(0, int(sf)) if sf is not None else 0
        end = min(total_frames - 1, int(ef)) if ef is not None else total_frames - 1
        if start > end:
            start, end = end, start
        return (start, end)

    @staticmethod
    def _compute_frame_indices(
        start: int,
        end: int,
        source_fps: float,
        target_fps: int,
    ) -> list[int]:
        """Build list of source frame indices to render for FPS conversion.

        If target_fps == source_fps, returns range(start, end+1).
        If target_fps < source_fps, frames are skipped (temporal downsampling).
        If target_fps > source_fps, frames are duplicated (temporal upsampling).
        """
        region_length = end - start + 1
        source_fps_int = int(round(source_fps))

        if target_fps == source_fps_int:
            return list(range(start, end + 1))

        # Duration of the region in seconds
        duration = region_length / source_fps
        # Number of output frames
        out_count = max(1, int(round(duration * target_fps)))

        indices: list[int] = []
        for i in range(out_count):
            t = i / target_fps  # time of output frame in seconds
            src_idx = start + int(round(t * source_fps))
            src_idx = min(src_idx, end)
            indices.append(src_idx)
        return indices

    # ------------------------------------------------------------------
    # Core export loop
    # ------------------------------------------------------------------

    def _run_export(
        self,
        job: ExportJob,
        input_path: str,
        output_path: str,
        chain: list[dict],
        project_seed: int,
        settings: dict,
        text_layers: list[dict] | None = None,
    ):
        reader = None
        writer = None
        try:
            if is_image_file(input_path):
                reader = ImageReader(input_path)
            else:
                reader = VideoReader(input_path)
            source_w, source_h = reader.width, reader.height
            source_fps = reader.fps

            # Resolve settings
            target_w, target_h = self._resolve_resolution(settings, source_w, source_h)
            target_fps = self._resolve_fps(settings, source_fps)
            start_frame, end_frame = self._resolve_frame_range(
                settings, reader.frame_count
            )

            needs_resize = (target_w != source_w) or (target_h != source_h)
            frame_indices = self._compute_frame_indices(
                start_frame, end_frame, source_fps, target_fps
            )
            job.total_frames = len(frame_indices)

            export_type = settings["export_type"]

            # Source resolution is what effects see (before our resize)
            resolution = (source_w, source_h)
            states: dict[str, dict | None] = {}

            # ---- GIF export path ----
            if export_type == "gif":
                self._export_gif(
                    job,
                    reader,
                    chain,
                    project_seed,
                    resolution,
                    frame_indices,
                    needs_resize,
                    target_w,
                    target_h,
                    output_path,
                    target_fps,
                    settings,
                    states,
                )
                return

            # ---- Image sequence export path ----
            if export_type == "image_sequence":
                self._export_image_sequence(
                    job,
                    reader,
                    chain,
                    project_seed,
                    resolution,
                    frame_indices,
                    needs_resize,
                    target_w,
                    target_h,
                    output_path,
                    settings,
                    states,
                )
                return

            # ---- Video export path ----
            codec_cfg = get_codec_config(settings["codec"])
            pyav_codec = codec_cfg["pyav_codec"]
            pix_fmt = codec_cfg["pix_fmt"]
            preset_map = codec_cfg.get("quality_presets", {})
            preset_val = preset_map.get(settings["quality_preset"])
            profile = codec_cfg.get("profile")

            writer = VideoWriter(
                output_path,
                target_w,
                target_h,
                fps=target_fps,
                codec=pyav_codec,
                pix_fmt=pix_fmt,
                preset=preset_val if isinstance(preset_val, str) else None,
                bitrate=settings.get("bitrate"),
                crf=settings.get("crf"),
                profile=profile,
            )

            for out_idx, src_idx in enumerate(frame_indices):
                if job._cancel_event.is_set():
                    with job._lock:
                        job.status = ExportStatus.CANCELLED
                    return

                frame = reader.decode_frame(src_idx)

                output, states = apply_chain(
                    frame, chain, project_seed, src_idx, resolution, states
                )

                # Composite text layers on top of the processed frame
                if text_layers:
                    output = self._composite_text_layers(
                        output, text_layers, resolution, src_idx, source_fps
                    )

                if needs_resize:
                    output = cv2.resize(
                        output,
                        (target_w, target_h),
                        interpolation=cv2.INTER_LANCZOS4,
                    )

                writer.write_frame(output)
                with job._lock:
                    job.current_frame = out_idx + 1

            writer.close()
            writer = None

            # Audio muxing (video only, not GIF or image_sequence)
            if settings["include_audio"]:
                self._mux_audio(
                    input_path,
                    output_path,
                    start_frame,
                    end_frame,
                    source_fps,
                )

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
            # Clean up partial output file on cancel or error
            if job.status in (ExportStatus.CANCELLED, ExportStatus.ERROR):
                try:
                    if os.path.exists(output_path):
                        os.unlink(output_path)
                except OSError:
                    pass  # best-effort cleanup

    # ------------------------------------------------------------------
    # Text layer compositing for export
    # ------------------------------------------------------------------

    @staticmethod
    def _composite_text_layers(
        frame: np.ndarray,
        text_layers: list[dict],
        resolution: tuple[int, int],
        frame_index: int,
        fps: float,
    ) -> np.ndarray:
        """Render and alpha-composite text layers onto a video frame.

        Each text layer can optionally include position_s and duration_s
        for time-gated rendering (only render when frame is within range).
        """
        output = frame.copy()
        current_time = frame_index / fps if fps > 0 else 0.0
        for tl in text_layers:
            text_config = tl.get("text_config")
            if not text_config:
                continue
            # Time-gate: skip if frame is outside this text layer's range
            pos_s = tl.get("position_s")
            dur_s = tl.get("duration_s")
            if pos_s is not None and dur_s is not None:
                if current_time < float(pos_s) or current_time >= float(pos_s) + float(
                    dur_s
                ):
                    continue
            opacity = float(tl.get("opacity", 1.0))
            if opacity <= 0:
                continue
            text_frame = render_text_frame(text_config, resolution, frame_index, fps)
            # Alpha composite: use text_frame alpha channel
            alpha = text_frame[:, :, 3:4].astype(np.float32) / 255.0 * opacity
            output[:, :, :3] = (
                output[:, :, :3].astype(np.float32) * (1.0 - alpha)
                + text_frame[:, :, :3].astype(np.float32) * alpha
            ).astype(np.uint8)
        return output

    # ------------------------------------------------------------------
    # GIF export
    # ------------------------------------------------------------------

    def _export_gif(
        self,
        job: ExportJob,
        reader: VideoReader,
        chain: list[dict],
        project_seed: int,
        resolution: tuple[int, int],
        frame_indices: list[int],
        needs_resize: bool,
        target_w: int,
        target_h: int,
        output_path: str,
        target_fps: int,
        settings: dict,
        states: dict,
    ):
        def frame_gen():
            for out_idx, src_idx in enumerate(frame_indices):
                frame = reader.decode_frame(src_idx)
                output, _ = apply_chain(
                    frame, chain, project_seed, src_idx, resolution, states
                )
                if needs_resize:
                    output = cv2.resize(
                        output,
                        (target_w, target_h),
                        interpolation=cv2.INTER_LANCZOS4,
                    )
                yield output

        def progress_cb(current: int, total: int):
            with job._lock:
                job.current_frame = current

        ok = export_gif_from_generator(
            frame_generator=frame_gen(),
            total_frames=len(frame_indices),
            output_path=output_path,
            fps=target_fps,
            max_width=settings.get("gif_max_width", 480),
            dithering=settings.get("gif_dithering", True),
            cancel_event=job._cancel_event,
            progress_callback=progress_cb,
        )

        with job._lock:
            if ok:
                job.status = ExportStatus.COMPLETE
            elif job._cancel_event.is_set():
                job.status = ExportStatus.CANCELLED
            else:
                job.status = ExportStatus.ERROR
                job.error = "GIF export produced no frames"

    # ------------------------------------------------------------------
    # Image sequence export
    # ------------------------------------------------------------------

    def _export_image_sequence(
        self,
        job: ExportJob,
        reader: VideoReader,
        chain: list[dict],
        project_seed: int,
        resolution: tuple[int, int],
        frame_indices: list[int],
        needs_resize: bool,
        target_w: int,
        target_h: int,
        output_dir: str,
        settings: dict,
        states: dict,
    ):
        def frame_gen():
            for out_idx, src_idx in enumerate(frame_indices):
                frame = reader.decode_frame(src_idx)
                output, _ = apply_chain(
                    frame, chain, project_seed, src_idx, resolution, states
                )
                if needs_resize:
                    output = cv2.resize(
                        output,
                        (target_w, target_h),
                        interpolation=cv2.INTER_LANCZOS4,
                    )
                yield output

        def progress_cb(current: int, total: int):
            with job._lock:
                job.current_frame = current

        _paths, ok = export_image_sequence_from_generator(
            frame_generator=frame_gen(),
            total_frames=len(frame_indices),
            output_dir=output_dir,
            format=settings.get("image_format", "png"),
            jpeg_quality=settings.get("jpeg_quality", 95),
            cancel_event=job._cancel_event,
            progress_callback=progress_cb,
        )

        with job._lock:
            if ok:
                job.status = ExportStatus.COMPLETE
            elif job._cancel_event.is_set():
                job.status = ExportStatus.CANCELLED
            else:
                job.status = ExportStatus.ERROR
                job.error = "Image sequence export cancelled or failed"

    # ------------------------------------------------------------------
    # Audio muxing
    # ------------------------------------------------------------------

    @staticmethod
    def _mux_audio(
        input_path: str,
        video_path: str,
        start_frame: int,
        end_frame: int,
        source_fps: float,
    ):
        """Mux audio from *input_path* into the exported *video_path*.

        Copies audio packets (no re-encode). Trims to match the exported
        frame region. Replaces *video_path* atomically via os.replace.
        """
        try:
            src = av.open(input_path)
        except Exception:
            logger.debug("Cannot open input for audio mux: %s", input_path)
            return

        if not src.streams.audio:
            src.close()
            return

        try:
            exported = av.open(video_path, "r")
        except Exception:
            src.close()
            logger.warning("Cannot open exported video for audio mux: %s", video_path)
            return

        # Time boundaries for audio trimming
        start_time = start_frame / source_fps
        end_time = (end_frame + 1) / source_fps

        # Build temp file in the same directory for atomic replace
        out_dir = os.path.dirname(video_path) or "."
        fd, tmp_path = tempfile.mkstemp(
            suffix=os.path.splitext(video_path)[1], dir=out_dir
        )
        os.close(fd)

        try:
            out = av.open(tmp_path, "w")

            # Copy video stream (PyAV 16+: template= kwarg removed, use add_stream_from_template)
            video_in = exported.streams.video[0]
            video_out = out.add_stream_from_template(video_in)

            # Copy audio stream
            audio_in = src.streams.audio[0]
            audio_out = out.add_stream_from_template(audio_in)

            # Mux video packets
            for packet in exported.demux(video_in):
                if packet.dts is None:
                    continue
                packet.stream = video_out
                out.mux(packet)

            # Seek audio to region start and mux trimmed packets
            audio_tb = audio_in.time_base
            if audio_tb and start_time > 0:
                src.seek(int(start_time / float(audio_tb)), stream=audio_in)

            for packet in src.demux(audio_in):
                if packet.dts is None:
                    continue
                pkt_time = float(packet.pts * audio_tb) if packet.pts is not None else 0
                if pkt_time < start_time:
                    continue
                if pkt_time >= end_time:
                    break
                # Rebase packet timestamps relative to region start
                offset = int(start_time / float(audio_tb))
                if packet.pts is not None:
                    packet.pts -= offset
                if packet.dts is not None:
                    packet.dts -= offset
                packet.stream = audio_out
                out.mux(packet)

            out.close()
            exported.close()
            src.close()

            os.replace(tmp_path, video_path)
            logger.info("Audio muxed into %s", video_path)

        except Exception:
            logger.exception("Audio mux failed — exported video left without audio")
            exported.close()
            src.close()
            # Clean up temp file on failure
            try:
                os.unlink(tmp_path)
            except OSError:
                pass

    # ------------------------------------------------------------------
    # Status & cancel
    # ------------------------------------------------------------------

    def get_status(self) -> dict:
        """Return serializable status dict with ETA."""
        if self._job is None:
            return {
                "status": ExportStatus.IDLE.value,
                "progress": 0.0,
                "current_frame": 0,
                "total_frames": 0,
            }
        with self._job._lock:
            progress = round(self._job.progress, 4)
            eta_seconds: float | None = None
            if (
                self._job.status == ExportStatus.RUNNING
                and self._job.current_frame > 0
                and self._job._start_time > 0
            ):
                elapsed = time.monotonic() - self._job._start_time
                fps_rate = self._job.current_frame / elapsed
                remaining = self._job.total_frames - self._job.current_frame
                eta_seconds = round(remaining / fps_rate, 1) if fps_rate > 0 else None

            return {
                "status": self._job.status.value,
                "progress": progress,
                "current_frame": self._job.current_frame,
                "total_frames": self._job.total_frames,
                "output_path": self._job.output_path,
                "error": self._job.error,
                "eta_seconds": eta_seconds,
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
