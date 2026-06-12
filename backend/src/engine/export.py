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

from audio.mixer import AudioMixer
from engine.audio_export import render_mix_to_temp_wav
from engine.codecs import (
    CODEC_REGISTRY,
    FPS_PRESETS,
    RESOLUTION_PRESETS,
    get_codec_config,
)
from engine.compositor import render_composite
from security import validate_composite_layer_count, validate_voice_layers
from engine.gif_export import export_gif_from_generator
from engine.image_sequence import export_image_sequence_from_generator
from engine.voice_replay import encode_voice_id, evaluate_voices
from video.codec_timeout import av_open_timeout
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
    """Manages background export jobs. One job at a time.

    Optional `audio_mixer` injection enables the flag-ON path where the
    final exported video carries a mixdown of the project's audio tracks
    instead of the source video's audio stream.
    """

    def __init__(
        self,
        audio_mixer: AudioMixer | None = None,
        experimental_audio_tracks: bool = False,
    ):
        self._job: ExportJob | None = None
        self._audio_mixer = audio_mixer
        self._experimental_audio_tracks = bool(experimental_audio_tracks)

    def _has_audio_tracks(self) -> bool:
        """True iff the injected mixer has at least one clip to render."""
        return self._audio_mixer is not None and self._audio_mixer.has_tracks()

    def _perform_audio_mux(
        self,
        mux_fn,
        *,
        input_path: str,
        output_path: str,
        start_frame: int,
        end_frame: int,
        source_fps: float,
        cancel_cb=None,
    ) -> None:
        """Route audio muxing to either the project mixdown (flag on + tracks)
        or the source-video audio (legacy).

        Extracted from the main export loop so the decision is unit-testable
        without running the full pipeline. `mux_fn` is typically
        ExportManager._mux_audio but can be injected for tests.
        """
        mixdown_used = False
        if (
            self._experimental_audio_tracks
            and self._audio_mixer is not None
            and self._has_audio_tracks()
        ):
            export_duration_s = (end_frame - start_frame + 1) / max(1e-6, source_fps)
            with render_mix_to_temp_wav(
                self._audio_mixer,
                export_duration_s,
                cancel_cb=cancel_cb,
            ) as wav_path:
                if wav_path is not None:
                    # Mix was rendered successfully — mux from temp WAV.
                    # start_frame=0 because the WAV is already trimmed to
                    # the export region.
                    render_frames = end_frame - start_frame
                    mux_fn(
                        wav_path,
                        output_path,
                        0,
                        render_frames,
                        source_fps,
                    )
                    mixdown_used = True
        if not mixdown_used:
            mux_fn(
                input_path,
                output_path,
                start_frame,
                end_frame,
                source_fps,
            )

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
        performance: dict | None = None,
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
        performance : dict, optional
            P5a.4 composite-replay payload ``{events, instruments, assets}``.
            When present (and non-empty ``events``), the export takes the
            composite branch: each output frame reconstructs the active voice
            layers via ``evaluate_voices`` (a pure mirror of ``voiceFSM.ts``) and
            feeds the already-merged ``render_composite`` with per-voice
            ``layer_states`` threaded across frames — exactly as live preview
            does (O1 in docs/decisions/composite-export-design.md). The caller
            (``_handle_export_start``) is responsible for trust-boundary
            validation (``validate_capture_events``) BEFORE calling start; this
            method assumes the payload already passed that gate. When ``None``
            or events-empty, the export is byte-identical to the legacy
            single-input path.

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
                performance,
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
        performance: dict | None = None,
    ):
        reader = None
        writer = None
        # P5a.4: per-asset reader cache for the composite branch. Voices on the
        # same clip share one reader across the whole export (opened lazily,
        # closed in `finally`) so we never re-open footage per frame.
        voice_readers: dict[str, object] = {}
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

            # P5a.4: the composite-replay branch is active only when a non-empty
            # performance payload is supplied. Empty / None → byte-identical to
            # the legacy single-input path (ROLLBACK contract: old clients
            # unchanged).
            perf_events = (performance or {}).get("events") or []
            perf_active = bool(perf_events)
            # Per-voice layer state cache (keyed `voice:{encoded_voice_id}` — the
            # P5a.2 contract). Threaded across frames exactly like preview's
            # _get_composite_states, but a LOCAL dict (no server singleton),
            # avoiding live-preview cache contention.
            voice_states: dict[str, dict] = {}

            # P5a.4: shared per-frame renderer the GIF / image-sequence
            # generators call. Returns the composited frame for `src_idx`,
            # taking the composite-replay branch when a performance payload is
            # active, else the legacy single-input apply_chain. Threads its own
            # state via closures over `states` / `voice_states`.
            def render_export_frame(src_idx: int) -> np.ndarray:
                nonlocal states, voice_states
                base = reader.decode_frame(src_idx)
                if perf_active:
                    out, voice_states = self._composite_export_frame(
                        base_frame=base,
                        base_chain=chain,
                        performance=performance or {},
                        frame_index=src_idx,
                        resolution=resolution,
                        project_seed=project_seed,
                        voice_states=voice_states,
                        voice_readers=voice_readers,
                    )
                else:
                    out, states = apply_chain(
                        base, chain, project_seed, src_idx, resolution, states
                    )
                if text_layers:
                    out = self._composite_text_layers(
                        out, text_layers, resolution, src_idx, source_fps
                    )
                return out

            # ---- GIF export path ----
            if export_type == "gif":
                self._export_gif(
                    job,
                    render_export_frame,
                    resolution,
                    frame_indices,
                    needs_resize,
                    target_w,
                    target_h,
                    output_path,
                    target_fps,
                    settings,
                )
                return

            # ---- Image sequence export path ----
            if export_type == "image_sequence":
                self._export_image_sequence(
                    job,
                    render_export_frame,
                    resolution,
                    frame_indices,
                    needs_resize,
                    target_w,
                    target_h,
                    output_path,
                    settings,
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

                if perf_active:
                    # P5a.4 composite branch (O1): reconstruct voice layers from
                    # the serialized event list and composite them on top of the
                    # base clip via the already-merged render_composite, threading
                    # per-voice state across frames.
                    output, voice_states = self._composite_export_frame(
                        base_frame=frame,
                        base_chain=chain,
                        performance=performance or {},
                        frame_index=src_idx,
                        resolution=resolution,
                        project_seed=project_seed,
                        voice_states=voice_states,
                        voice_readers=voice_readers,
                    )
                else:
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
                self._perform_audio_mux(
                    self._mux_audio,
                    input_path=input_path,
                    output_path=output_path,
                    start_frame=start_frame,
                    end_frame=end_frame,
                    source_fps=source_fps,
                    cancel_cb=lambda: job._cancel_event.is_set(),
                )

            with job._lock:
                job.status = ExportStatus.COMPLETE

        except Exception as e:
            sentry_sdk.capture_exception(e)
            logger.exception("Export failed")
            with job._lock:
                job.status = ExportStatus.ERROR
                # F-0512-22: drop the "Export failed:" prefix — callers
                # (CLI, toast, inline UI) all prepend their own. Include the
                # exception message so users see *what* went wrong, not just
                # the class name. Set ENTROPIC_DISABLE_F_0512_22=1 to revert
                # to the legacy "Export failed: <Type>" format.
                if os.environ.get("ENTROPIC_DISABLE_F_0512_22") == "1":
                    job.error = f"Export failed: {type(e).__name__}"
                else:
                    msg = str(e).strip()
                    job.error = (
                        f"{type(e).__name__}: {msg}" if msg else type(e).__name__
                    )
        finally:
            if writer is not None:
                writer.close()
            if reader is not None:
                reader.close()
            # P5a.4: close every per-voice footage reader opened by the
            # composite branch (best-effort; one map for the export's lifetime).
            for _vr in voice_readers.values():
                try:
                    close = getattr(_vr, "close", None)
                    if callable(close):
                        close()
                except Exception:  # noqa: BLE001 — cleanup must never raise
                    pass
            # Clean up partial output on cancel or error.
            # red-team RT-2: image_sequence exports write a DIRECTORY of PNGs;
            # os.unlink raises IsADirectoryError (swallowed), leaking partial
            # frames. rmtree the directory case; unlink the single-file case.
            if job.status in (ExportStatus.CANCELLED, ExportStatus.ERROR):
                try:
                    if os.path.isdir(output_path):
                        import shutil

                        shutil.rmtree(output_path, ignore_errors=True)
                    elif os.path.exists(output_path):
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
    # P5a.4 — composite voice replay (O1: per-frame render_composite reuse)
    # ------------------------------------------------------------------

    @staticmethod
    def _compute_voice_footage_frame(
        inst: dict, playhead_frame: int, frame_count: int
    ) -> int:
        """Mirror of frontend computeSamplerVoice's footage-frame math.

        # MIRROR: computeSamplerVoice.ts
        footageFrameIndex = clamp(startFrame + round(speed * playheadFrame),
        0, frameCount-1). Speed clamps [-8, 8]; bad probe → freeze on 0.
        """
        SAMPLER_SPEED_MIN, SAMPLER_SPEED_MAX = -8.0, 8.0
        fc = frame_count if isinstance(frame_count, int) and frame_count > 0 else 1
        last_frame = max(0, fc - 1)

        def clamp_finite(v, lo, hi, fallback):
            if not isinstance(v, (int, float)) or isinstance(v, bool):
                return fallback
            if v != v or v in (float("inf"), float("-inf")):
                return fallback
            return min(hi, max(lo, v))

        speed = clamp_finite(
            inst.get("speed", 1), SAMPLER_SPEED_MIN, SAMPLER_SPEED_MAX, 1
        )
        start = clamp_finite(inst.get("startFrame", 0), 0, last_frame, 0)
        raw = start + round(speed * playhead_frame)
        return int(round(clamp_finite(raw, 0, last_frame, 0)))

    def _get_voice_reader(self, asset_path: str, voice_readers: dict):
        """Lazily open (and cache) a footage reader for the export's lifetime.

        One reader per asset path, shared across voices on the same clip and
        across frames — never re-opened per frame (design Cons mitigation).
        Closed in _run_export's finally.
        """
        reader = voice_readers.get(asset_path)
        if reader is None:
            if is_image_file(asset_path):
                reader = ImageReader(asset_path)
            else:
                reader = VideoReader(asset_path)
            voice_readers[asset_path] = reader
        return reader

    def _composite_export_frame(
        self,
        *,
        base_frame: np.ndarray,
        base_chain: list[dict],
        performance: dict,
        frame_index: int,
        resolution: tuple[int, int],
        project_seed: int,
        voice_states: dict,
        voice_readers: dict,
    ) -> tuple[np.ndarray, dict]:
        """Build the composited frame for one output frame (O1 composite branch).

        Reconstructs the active voices for ``frame_index`` via
        ``evaluate_voices`` (the pure voiceFSM mirror), assembles per-voice layer
        dicts (decode footage + attach chain + colon-free ``voice_id``), and
        feeds the **already-merged** ``render_composite`` with per-voice
        ``layer_states`` keyed ``voice:{encoded_voice_id}`` (P5a.2 contract).
        Reuses the v3 compositor verbatim so preview and export cannot drift.

        The base clip (single input + its chain) is the bottom-most layer; voices
        composite on top in ascending-triggerFrame order (newest on top), exactly
        as ``buildVoiceLayers`` orders them in preview.
        """
        events = performance.get("events") or []
        instruments = performance.get("instruments") or {}
        assets = performance.get("assets") or {}

        # Build the layer list bottom-to-top. Layer 0 = base clip with its chain.
        layers: list[dict] = [
            {
                "frame": base_frame,
                "chain": base_chain,
                "frame_index": frame_index,
                "layer_id": "base",
            }
        ]

        from engine.voice_replay import envelope_value

        # PHASE 1 — reconstruct voice descriptors WITHOUT decoding any footage.
        # Per instrument: evaluate its voices (own ADSR + cap), resolve the
        # footage index + opacity, and stage a layer descriptor. evaluate_voices
        # caps each instrument at its voiceCap, so the descriptor count is
        # bounded by (num_instruments × voiceCap) — never unbounded.
        voice_descriptors: list[dict] = []
        for inst_id, inst in instruments.items():
            adsr = inst.get("adsr") or {
                "attack": 0,
                "decay": 0,
                "sustain": 1,
                "release": 0,
            }
            voice_cap = inst.get("voiceCap", 4)
            inst_chain = inst.get("chain") or []
            clip_id = inst.get("clipId")
            asset = assets.get(clip_id) if clip_id is not None else None
            if not asset or not asset.get("path"):
                # Unsourced sampler — no layers (mirrors buildVoiceLayers early-out).
                continue
            asset_path = asset["path"]
            frame_count = asset.get("frameCount") or 1

            # Per-instrument bucket: this instrument's events PLUS global panic
            # (panic crosses instruments). Keeps each instrument's ADSR / cap /
            # footage resolution independent. For B2 there is one instrument.
            inst_events = [
                e
                for e in events
                if isinstance(e, dict)
                and (e.get("instrumentId") == inst_id or e.get("kind") == "panic")
            ]
            voices = evaluate_voices(
                inst_events, frame_index, {"voiceCap": voice_cap, "adsr": adsr}
            )

            for voice in voices:
                # Footage playhead mirrors buildVoiceLayers (passes
                # voice.footagePos; the FSM tracks lifecycle only, footagePos
                # stays 0 in B2 → freeze on startFrame). Faithful port.
                playhead = voice.get("footagePos", 0)
                env = envelope_value(voice, frame_index, adsr)
                inst_op = inst.get("opacity", 1.0)
                op = inst_op * env
                if not isinstance(op, (int, float)) or op != op:
                    op = 0.0
                op = max(0.0, min(1.0, op))
                vid = encode_voice_id(voice["voiceId"])
                voice_descriptors.append(
                    {
                        "asset_path": asset_path,
                        "frame_count": frame_count,
                        "inst": inst,
                        "playhead": playhead,
                        "chain": inst_chain,
                        "voice_id": vid,
                        "opacity": op,
                        "blend_mode": inst.get("blendMode", "normal"),
                    }
                )

        # ENFORCE-BEFORE-DECODE (design Memory-strategy): validate the per-frame
        # voice budget and the composite layer cap BEFORE opening/decoding any
        # footage, mirroring _handle_render_composite's order. A hostile
        # multi-instrument payload is rejected here, never buffered.
        budget_errors = validate_voice_layers(
            [{"voice_id": d["voice_id"]} for d in voice_descriptors]
        )
        # +1 for the base layer.
        budget_errors += validate_composite_layer_count(len(voice_descriptors) + 1)
        if budget_errors:
            raise ValueError("; ".join(budget_errors))

        # PHASE 2 — decode footage + assemble the final layer list (now safe).
        for d in voice_descriptors:
            reader = self._get_voice_reader(d["asset_path"], voice_readers)
            rfc = getattr(reader, "frame_count", d["frame_count"]) or d["frame_count"]
            footage_idx = self._compute_voice_footage_frame(
                d["inst"], d["playhead"], rfc
            )
            # INJ-3 tail clamp parity with _handle_render_composite.
            if rfc and footage_idx >= rfc - 2:
                footage_idx = max(0, rfc - 3)
            vframe = reader.decode_frame(footage_idx)
            layers.append(
                {
                    "frame": vframe,
                    "chain": d["chain"],
                    "frame_index": frame_index,
                    "voice_id": d["voice_id"],
                    "layer_id": f"voice:{d['voice_id']}",
                    "opacity": d["opacity"],
                    "blend_mode": d["blend_mode"],
                }
            )

        # Reuse the merged compositor verbatim, threading per-voice state.
        out, new_states = render_composite(
            layers, resolution, project_seed, voice_states
        )
        return out, new_states

    # ------------------------------------------------------------------
    # GIF export
    # ------------------------------------------------------------------

    def _export_gif(
        self,
        job: ExportJob,
        render_frame,
        resolution: tuple[int, int],
        frame_indices: list[int],
        needs_resize: bool,
        target_w: int,
        target_h: int,
        output_path: str,
        target_fps: int,
        settings: dict,
    ):
        # `render_frame(src_idx) -> np.ndarray` encapsulates the legacy
        # apply_chain path AND the P5a.4 composite-replay branch (chosen in
        # _run_export). The GIF generator only resizes + yields.
        def frame_gen():
            for out_idx, src_idx in enumerate(frame_indices):
                output = render_frame(src_idx)
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
        render_frame,
        resolution: tuple[int, int],
        frame_indices: list[int],
        needs_resize: bool,
        target_w: int,
        target_h: int,
        output_dir: str,
        settings: dict,
    ):
        # `render_frame(src_idx) -> np.ndarray` encapsulates the legacy
        # apply_chain path AND the P5a.4 composite-replay branch (chosen in
        # _run_export). The sequence generator only resizes + yields.
        def frame_gen():
            for out_idx, src_idx in enumerate(frame_indices):
                output = render_frame(src_idx)
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
            src = av_open_timeout(input_path)
        except Exception:
            logger.debug("Cannot open input for audio mux: %s", input_path)
            return

        if not src.streams.audio:
            src.close()
            return

        try:
            exported = av_open_timeout(video_path, mode="r")
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
            out = av_open_timeout(tmp_path, mode="w")

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
