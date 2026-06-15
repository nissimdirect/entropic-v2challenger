"""Export job manager — background rendering with progress and cancel."""

import copy
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
from effects import registry
from engine.compositor import render_composite
from engine.composite_tree import expand_group_layer, validate_composite_tree
from safety.latent_sentinel import detect_nan_in_frame
from engine.guards import clamp_finite
from modulation.engine import SignalEngine
from security import (
    MAX_BRANCH_DEPTH,
    validate_composite_layer_count,
    validate_frame_bank,
    validate_voice_layers,
)
from engine.decoded_frame_cache import DecodedFrameCache
from engine.frame_bank import resolve_frame_bank_layer
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
        operators: list[dict] | None = None,
        automation_by_frame: dict | None = None,
        audio_pcm_provider=None,
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
        operators : list[dict], optional
            P2.3 export-parity payload — the serialized operator list (LFO,
            audio_follower, video_analyzer, envelope, step_sequencer, fusion).
            When present, each output frame runs the ``SignalEngine`` exactly as
            the preview render path does (``_render_composited_frame`` in
            ``zmq_server``): ``evaluate_all`` at the frame, then
            ``apply_modulation`` onto the chain — so export operator modulation
            matches preview. Deterministic: LFO/sequencer/envelope key on
            ``frame_index``; audio/video followers read the frame's PCM/pixels.
        automation_by_frame : dict, optional
            P2.3 export-parity payload — automation overrides PRE-RESOLVED on the
            frontend per output frame, keyed ``{source_frame_index: {"<effectId>.<paramKey>":
            value}}``. The frontend reuses the SAME ``evaluateAutomationOverrides``
            evaluator preview uses, so the values are byte-identical to preview;
            the export applies them per frame via ``apply_modulation``'s
            automation-override path (replace, clamped to param bounds).
        audio_pcm_provider : callable, optional
            ``(frame_index: int, fps: float) -> np.ndarray | None``. Supplies the
            per-frame mono PCM window for the ``audio_follower`` operator so audio
            modulation matches preview. Absent → audio followers read ``None``
            (no audio modulation), the same graceful degrade preview uses when no
            audio is loaded.
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

        # P2.3 (snapshot isolation): deep-clone every mutable payload at job start
        # so the background export thread renders from a frozen snapshot — edits to
        # the caller's project/timeline/effect/automation/operator state AFTER the
        # export starts cannot change the exported frames. Mirrors the PR-B plan's
        # "snapshot at job start: deep-clone {project,timeline,effect,automation,
        # operator}". The audio_pcm_provider is a bound method (read-only sampler),
        # not cloned. project_seed/input_path/output_path are immutable scalars.
        snap_chain = copy.deepcopy(chain) if chain else chain
        snap_text_layers = copy.deepcopy(text_layers) if text_layers else []
        snap_performance = copy.deepcopy(performance) if performance else performance
        snap_operators = copy.deepcopy(operators) if operators else None
        snap_automation = (
            copy.deepcopy(automation_by_frame) if automation_by_frame else None
        )

        job = ExportJob(output_path=output_path)
        self._job = job

        thread = threading.Thread(
            target=self._run_export,
            args=(
                job,
                input_path,
                output_path,
                snap_chain,
                project_seed,
                merged,
                snap_text_layers,
                snap_performance,
            ),
            kwargs={
                "operators": snap_operators,
                "automation_by_frame": snap_automation,
                "audio_pcm_provider": audio_pcm_provider,
            },
            daemon=True,
        )
        job._thread = thread
        job.status = ExportStatus.RUNNING
        job._start_time = time.monotonic()
        thread.start()

        return job

    # ------------------------------------------------------------------
    # B10.1b — Ableton-style performance-track FREEZE bake (synchronous).
    # ------------------------------------------------------------------

    def bake_performance_track(
        self,
        *,
        track_id: str,
        performance: dict,
        output_path: str,
        resolution: tuple[int, int],
        start_frame: int,
        end_frame: int,
        project_seed: int = 0,
        fps: int = 30,
    ) -> dict:
        """Bake ONE performance track's voices to a video clip, SYNCHRONOUSLY.

        This is the REAL bake behind the B10.1 freeze FSM (Ableton-style:
        freeze → bake the track's current voice output to a clip → the track
        plays the baked clip while live voices are released). Unlike `start`
        (the async, base-video export job), this renders a *single* track's
        voices over a TRANSPARENT/BLACK base across ``[start_frame, end_frame]``
        and returns when the file is written.

        It REUSES ``_composite_export_frame`` verbatim (the SAME compositor the
        export path uses) — there is NO parallel renderer. The performance
        payload is scoped to ``track_id`` by the caller (``_handle_bake_perf``)
        so only that track's instruments/racks/events bake.

        Returns ``{"ok": bool, "clipId": str, "path": str, "frames": int}``.
        Raises on a hard failure (unknown reader, encode error) so the IPC
        handler maps it to ``ok: false`` without crashing the sidecar.
        """
        events = (performance or {}).get("events") or []
        racks = (performance or {}).get("racks") or {}
        frame_banks = (performance or {}).get("frameBanks") or {}
        instruments = (performance or {}).get("instruments") or {}
        # Nothing to bake (no voices on this track) is NOT an error — but it is
        # a no-op clip. The caller validates trackId presence; here we just
        # honor whatever scoped payload arrived.
        res_w = max(1, min(8192, int(resolution[0])))
        res_h = max(1, min(8192, int(resolution[1])))
        safe_fps = int(clamp_finite(float(fps), 1.0, 240.0, 30.0))
        sf = max(0, int(start_frame))
        ef = max(sf, int(end_frame))

        voice_readers: dict[str, object] = {}
        frame_bank_caches: dict[str, object] = {}
        voice_states: dict[str, dict] = {}
        writer = None
        frames_written = 0
        try:
            # H.264 over a black base; alpha is flattened (the baked clip is a
            # normal video the render loop plays as a video layer). Reuse the
            # project's default codec config so the file is broadly decodable.
            codec_cfg = get_codec_config(DEFAULT_SETTINGS["codec"])
            writer = VideoWriter(
                output_path,
                res_w,
                res_h,
                fps=safe_fps,
                codec=codec_cfg["pyav_codec"],
                pix_fmt=codec_cfg["pix_fmt"],
            )
            scoped_perf = {
                "events": events,
                "instruments": instruments,
                "racks": racks,
                "frameBanks": frame_banks,
                "assets": (performance or {}).get("assets") or {},
            }
            for src_idx in range(sf, ef + 1):
                # Black RGBA base — the track's voices composite on top of it.
                base = np.zeros((res_h, res_w, 4), dtype=np.uint8)
                base[:, :, 3] = 255
                out, voice_states = self._composite_export_frame(
                    base_frame=base,
                    base_chain=[],
                    performance=scoped_perf,
                    frame_index=src_idx,
                    resolution=(res_w, res_h),
                    project_seed=project_seed,
                    voice_states=voice_states,
                    voice_readers=voice_readers,
                    operators=None,
                    operator_values=None,
                    frame_bank_caches=frame_bank_caches,
                )
                # SG-3 clause-2: export FAILS LOUDLY on a NaN/Inf frame — never a
                # silent substitution inside a deterministic export. A non-finite
                # composite means a modulation lane produced garbage; the export
                # job must error so the user re-renders, not ship a corrupt frame.
                if detect_nan_in_frame(out):
                    raise ValueError(
                        f"SG-3 output gate: non-finite (NaN/Inf) frame at "
                        f"index {src_idx} during export; aborting job"
                    )
                writer.write_frame(out)
                frames_written += 1
            writer.close()
            writer = None
        finally:
            if writer is not None:
                try:
                    writer.close()
                except Exception:  # noqa: BLE001 — best-effort cleanup
                    pass
            for _vr in voice_readers.values():
                close = getattr(_vr, "close", None)
                if callable(close):
                    try:
                        close()
                    except Exception:  # noqa: BLE001
                        pass

        return {
            "ok": True,
            "clipId": f"perf-bake:{track_id}",
            "path": output_path,
            "frames": frames_written,
        }

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
        operators: list[dict] | None = None,
        automation_by_frame: dict | None = None,
        audio_pcm_provider=None,
    ):
        reader = None
        writer = None
        # P5a.4: per-asset reader cache for the composite branch. Voices on the
        # same clip share one reader across the whole export (opened lazily,
        # closed in `finally`) so we never re-open footage per frame.
        voice_readers: dict[str, object] = {}
        # B6.1: per-frame-bank byte-budget decoded-frame caches (the OOM guard).
        # One DecodedFrameCache per frameBank id, created lazily in
        # _composite_export_frame, sized to that bank's CLAMPED byteBudget. Lives
        # for the whole export (a continuous position-scan reuses decoded slots
        # across output frames); the readers it decodes through are voice_readers.
        frame_bank_caches: dict[str, object] = {}
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
            # B6.1: a Frame-Bank is a CONTINUOUS scanner with NO trigger events,
            # so the composite-replay branch must also activate when frameBanks
            # are present (else a frameBank-only project falls into the legacy
            # single-input path and never renders). Absent both → byte-identical
            # legacy path (regression-safe).
            perf_frame_banks = (performance or {}).get("frameBanks") or {}
            perf_active = bool(perf_events) or bool(perf_frame_banks)
            # Per-voice layer state cache (keyed `voice:{encoded_voice_id}` — the
            # P5a.2 contract). Threaded across frames exactly like preview's
            # _get_composite_states, but a LOCAL dict (no server singleton),
            # avoiding live-preview cache contention.
            voice_states: dict[str, dict] = {}

            # P2.3: export-parity modulation engine. When operators and/or
            # pre-resolved automation overrides are supplied, the export runs the
            # SAME modulation the preview render path runs
            # (`_render_composited_frame`, zmq_server.py): per frame, evaluate the
            # operators via SignalEngine, then apply_modulation onto the chain —
            # so export operator/automation modulation matches preview. A single
            # SignalEngine + its state dict are threaded across the export's
            # frames (the operators' own LFO/slew/audio state accumulate), the
            # same per-server-singleton pattern preview uses but as a LOCAL engine
            # (no live-preview contention). Empty operators AND empty automation →
            # `modulate_chain_for_frame` returns the chain unchanged (legacy
            # path byte-identical).
            mod_operators = operators if isinstance(operators, list) else []
            mod_active = bool(mod_operators) or bool(automation_by_frame)
            signal_engine = SignalEngine() if mod_active else None
            signal_state: dict = {}
            # B3.2: the most recent per-frame operator values, captured so the
            # composite path can resolve `sampler.<id>.<param>` modulations with
            # the SAME values used for chain routing this frame (preview parity).
            last_operator_values: dict = {}

            def modulate_chain_for_frame(
                base_chain: list[dict], src_idx: int, video_frame
            ) -> list[dict]:
                """Return the per-frame modulated chain (operators + automation).

                Mirrors zmq_server._render_composited_frame's modulation order:
                evaluate_all → apply_modulation (operator routings first, then
                automation overrides replace). Returns the chain unchanged when no
                modulation is active so the legacy export stays byte-identical.
                """
                nonlocal signal_state, last_operator_values
                if not mod_active:
                    last_operator_values = {}
                    return base_chain
                auto_overrides = None
                if automation_by_frame:
                    # Frontend pre-resolved per source-frame override map (keyed by
                    # source frame index, stringified over the IPC/JSON boundary).
                    auto_overrides = automation_by_frame.get(
                        src_idx
                    ) or automation_by_frame.get(str(src_idx))
                    if auto_overrides is not None and not isinstance(
                        auto_overrides, dict
                    ):
                        auto_overrides = None
                if not mod_operators and not auto_overrides:
                    return base_chain
                values: dict = {}
                if mod_operators:
                    audio_pcm = None
                    if audio_pcm_provider is not None:
                        try:
                            audio_pcm = audio_pcm_provider(src_idx, source_fps)
                        except Exception:  # noqa: BLE001 — degrade like preview
                            audio_pcm = None
                    values, signal_state = signal_engine.evaluate_all(
                        mod_operators,
                        src_idx,
                        source_fps,
                        audio_pcm=audio_pcm,
                        video_frame=video_frame,
                        state=signal_state,
                    )
                last_operator_values = values
                return signal_engine.apply_modulation(
                    mod_operators,
                    values,
                    base_chain,
                    registry.get,
                    automation_overrides=auto_overrides,
                )

            # P5a.4: shared per-frame renderer the GIF / image-sequence
            # generators call. Returns the composited frame for `src_idx`,
            # taking the composite-replay branch when a performance payload is
            # active, else the legacy single-input apply_chain. Threads its own
            # state via closures over `states` / `voice_states`.
            def render_export_frame(src_idx: int) -> np.ndarray:
                nonlocal states, voice_states
                base = reader.decode_frame(src_idx)
                # P2.3: modulate the base chain per frame (operators + automation)
                # before it is applied — same as preview. video_frame=base feeds
                # the video_analyzer operator its proxy.
                frame_chain = modulate_chain_for_frame(chain, src_idx, base)
                if perf_active:
                    out, voice_states = self._composite_export_frame(
                        base_frame=base,
                        base_chain=frame_chain,
                        performance=performance or {},
                        frame_index=src_idx,
                        resolution=resolution,
                        project_seed=project_seed,
                        voice_states=voice_states,
                        voice_readers=voice_readers,
                        operators=mod_operators,
                        operator_values=last_operator_values,
                        frame_bank_caches=frame_bank_caches,
                    )
                else:
                    out, states = apply_chain(
                        base, frame_chain, project_seed, src_idx, resolution, states
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

                # P2.3: per-frame operator + automation modulation (export==preview).
                # Returns `chain` unchanged when no modulation is active.
                frame_chain = modulate_chain_for_frame(chain, src_idx, frame)

                if perf_active:
                    # P5a.4 composite branch (O1): reconstruct voice layers from
                    # the serialized event list and composite them on top of the
                    # base clip via the already-merged render_composite, threading
                    # per-voice state across frames.
                    output, voice_states = self._composite_export_frame(
                        base_frame=frame,
                        base_chain=frame_chain,
                        performance=performance or {},
                        frame_index=src_idx,
                        resolution=resolution,
                        project_seed=project_seed,
                        voice_states=voice_states,
                        voice_readers=voice_readers,
                        operators=mod_operators,
                        operator_values=last_operator_values,
                        frame_bank_caches=frame_bank_caches,
                    )
                else:
                    output, states = apply_chain(
                        frame, frame_chain, project_seed, src_idx, resolution, states
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

                # SG-3 clause-2: export FAILS LOUDLY on a NaN/Inf frame — never a
                # silent substitution inside a deterministic export (see the
                # mixdown-export site above for rationale).
                if detect_nan_in_frame(output):
                    raise ValueError(
                        f"SG-3 output gate: non-finite (NaN/Inf) frame at "
                        f"index {src_idx} during export; aborting job"
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
    def _apply_glide_ramp(
        target_offset: float, glide_frames: int, elapsed_frames: int
    ) -> float:
        """B3.3 — Apply position/speed glide (portamento) ramp.

        On retrigger (elapsed_frames = frames since the new voice was triggered),
        the playhead offset LERPs from 0 → target_offset over `glide_frames`
        instead of jumping instantly. After `glide_frames` it holds at target_offset.

        glide_frames <= 0 → instant jump (returns target_offset).
        Regression-safe: glide absent/0 → byte-identical to B3.2 behavior.

        # MIRROR: computeSamplerVoice.ts → applyGlideRamp
        """
        SAMPLER_GLIDE_MAX = 300

        def clamp_finite_local(v, lo, hi, fallback):
            if not isinstance(v, (int, float)) or isinstance(v, bool):
                return fallback
            if v != v or v in (float("inf"), float("-inf")):
                return fallback
            return min(hi, max(lo, v))

        gf = int(round(clamp_finite_local(glide_frames, 0, SAMPLER_GLIDE_MAX, 0)))
        if gf <= 0:
            return target_offset
        ef = max(0, elapsed_frames)
        if ef >= gf:
            return target_offset
        t = ef / gf
        return target_offset * t

    @staticmethod
    def _compute_voice_rgb_frame_indices(
        inst: dict, base_frame: int, frame_count: int
    ) -> dict | None:
        """B3.3 — Compute per-channel R/G/B footage frame indices.

        Each channel's frame index = clamp(base_frame + channelOffset, loBound, hiBound)
        where [loBound, hiBound] is the sampler's playable bounds:
          - loop.enabled  → [loopIn, loopOut]
          - otherwise     → [0, endFrame|last]

        Returns None when rgbOffset is absent or {0,0,0} → caller uses
        base_frame for all channels (byte-identical to B3.2).

        # MIRROR: computeSamplerVoice.ts → computeRgbFrameIndices
        """
        rgb_off = inst.get("rgbOffset")
        if not rgb_off or not isinstance(rgb_off, dict):
            return None
        r_off = rgb_off.get("r", 0)
        g_off = rgb_off.get("g", 0)
        b_off = rgb_off.get("b", 0)
        if r_off == 0 and g_off == 0 and b_off == 0:
            return None

        def clamp_finite_local(v, lo, hi, fallback):
            if not isinstance(v, (int, float)) or isinstance(v, bool):
                return fallback
            if v != v or v in (float("inf"), float("-inf")):
                return fallback
            return min(hi, max(lo, v))

        fc = frame_count if isinstance(frame_count, int) and frame_count > 0 else 1
        last_frame = max(0, fc - 1)

        loop = inst.get("loop")
        if loop and loop.get("enabled"):
            li = int(round(clamp_finite_local(loop.get("in", 0), 0, last_frame, 0)))
            lo_raw = int(
                round(
                    clamp_finite_local(
                        loop.get("out", last_frame), 0, last_frame, last_frame
                    )
                )
            )
            lo_bound = min(li, lo_raw)
            hi_bound = max(li, lo_raw)
        else:
            lo_bound = 0
            end_raw = inst.get("endFrame", last_frame)
            hi_bound = int(
                round(clamp_finite_local(end_raw, 0, last_frame, last_frame))
            )

        def clamp_ch(offset):
            raw = base_frame + offset
            v = int(round(clamp_finite_local(raw, lo_bound, hi_bound, base_frame)))
            return max(0, min(last_frame, v))

        return {"r": clamp_ch(r_off), "g": clamp_ch(g_off), "b": clamp_ch(b_off)}

    @staticmethod
    def _apply_melodic(inst: dict, start: float, speed: float, note) -> tuple:
        """B3.4 — Apply the melodic (note → param) transform to start/speed.

        When ``inst.melodic`` is present AND ``melodic.enabled`` is truthy AND a
        finite ``note`` (MIDI 0–127) is supplied, the voice's startFrame OR speed
        is transposed relative to ``melodic.rootNote``:

          mode == 'startFrame' → start += (note - rootNote)
              Each semitone shifts the playback start by exactly 1 frame. Clean,
              integral mapping (documented choice; no fractional-frame ambiguity).
          mode == 'speed'      → speed *= 2 ** ((note - rootNote) / 12)
              Chromatic pitch-shift via playback rate. note == rootNote + 12 → 2×.

        ``melodic`` absent / ``enabled`` falsy / ``note`` absent-or-non-finite →
        returns (start, speed) UNCHANGED → byte-identical to B3.3 (regression-
        safe). The caller clamps the returned values exactly as before, so the
        melodic transform never widens the existing [-8,8] speed / [0,last] start
        bounds.

        # MIRROR: computeSamplerVoice.ts → applyMelodic
        """
        melodic = inst.get("melodic")
        if not melodic or not isinstance(melodic, dict) or not melodic.get("enabled"):
            return start, speed
        # note must be a finite MIDI number; bool is not a note.
        if isinstance(note, bool) or not isinstance(note, (int, float)):
            return start, speed
        if note != note or note in (float("inf"), float("-inf")):
            return start, speed

        root = melodic.get("rootNote", 60)
        if isinstance(root, bool) or not isinstance(root, (int, float)):
            root = 60
        if root != root or root in (float("inf"), float("-inf")):
            root = 60
        semitones = note - root

        mode = melodic.get("mode", "startFrame")
        if mode == "speed":
            speed = speed * (2.0 ** (semitones / 12.0))
        else:
            # 'startFrame' (default / unknown) — 1 frame per semitone.
            start = start + semitones
        return start, speed

    @staticmethod
    def _compute_voice_footage_frame(
        inst: dict,
        playhead_frame: int,
        frame_count: int,
        elapsed_frames: int | None = None,
        note=None,
    ) -> int:
        """Mirror of frontend computeSamplerVoice's footage-frame math.

        B1/B2 (loop disabled / absent):
          footageFrameIndex = clamp(startFrame + round(speed * playheadFrame),
          0, frameCount-1). Speed clamps [-8, 8]; bad probe → freeze on 0.
          Byte-identical to the original implementation.

        B3.1 (loop.enabled = True):
          The raw playhead offset is wrapped within [loopIn, loopOut] according
          to loop.dir: 'fwd' → wraps out→in; 'rev' → plays in←out wrapping;
          'pingpong' → bounces at in/out. Speed magnitude is respected; the sign
          of speed interacts with dir (negative speed reverses travel direction).

        B3.3 (glide > 0, elapsed_frames supplied):
          The raw speed*playhead offset is ramped from 0 → target over `glide`
          frames. elapsed_frames defaults to playhead_frame when None.
          Regression-safe: glide absent/0 → instant jump = B3.2 behavior.

        B3.4 (melodic.enabled, note supplied):
          The voice's startFrame OR speed is transposed relative to
          melodic.rootNote before all existing math (see _apply_melodic).
          melodic absent/disabled or note absent → no transpose = B3.3 behavior.

        # MIRROR: computeSamplerVoice.ts → computeLoopFrameIndex
        """
        SAMPLER_SPEED_MIN, SAMPLER_SPEED_MAX = -8.0, 8.0
        LOOP_CROSSFADE_MAX = 32
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

        # B3.4 — melodic note→param transform. Applied AFTER the base clamp of
        # speed/start but BEFORE the loop/glide/scrub math, then re-clamped to the
        # existing bounds (the transform never widens them). melodic absent/off or
        # note absent → start/speed unchanged → byte-identical to B3.3.
        start, speed = ExportManager._apply_melodic(inst, start, speed, note)
        speed = clamp_finite(speed, SAMPLER_SPEED_MIN, SAMPLER_SPEED_MAX, 1)
        start = clamp_finite(start, 0, last_frame, 0)

        # B3.2 — `scrub` modulation destination. When a finite scrub is present
        # (written by resolve_sampler_modulations), the playhead position is
        # DRIVEN by scrub (0..1) across the sampler's playable range — overriding
        # the playhead-derived offset. Absent scrub → None → B3.1 path unchanged
        # (regression-safe). The scrubbed frame still honors loop bounds.
        scrub_raw = inst.get("scrub")
        has_scrub = (
            isinstance(scrub_raw, (int, float))
            and not isinstance(scrub_raw, bool)
            and scrub_raw == scrub_raw
            and scrub_raw not in (float("inf"), float("-inf"))
        )
        scrub = clamp_finite(scrub_raw, 0.0, 1.0, 0.0) if has_scrub else None

        # B3.3 — glide ramp. When inst.glide > 0, the raw speed*playhead offset
        # is ramped from 0 → target over `glide` frames.
        # elapsed_frames defaults to playhead_frame (same-voice forward playback).
        glide_frames_raw = inst.get("glide", 0)
        glide_frames = int(round(clamp_finite(glide_frames_raw, 0, 300, 0)))
        ef = elapsed_frames if elapsed_frames is not None else playhead_frame

        # B1/B2 path: no loop or loop disabled → original formula, byte-identical
        # when scrub is absent; scrub maps across [startFrame, endFrame|last].
        loop = inst.get("loop")
        if not loop or not loop.get("enabled"):
            if scrub is not None:
                end_raw = inst.get("endFrame", last_frame)
                end = int(round(clamp_finite(end_raw, 0, last_frame, last_frame)))
                lo, hi = min(int(round(start)), end), max(int(round(start)), end)
                raw = lo + scrub * (hi - lo)
                return int(round(clamp_finite(raw, 0, last_frame, 0)))
            # B3.3 glide: ramp the speed*playhead offset.
            target_offset = speed * playhead_frame
            ramped_offset = ExportManager._apply_glide_ramp(
                target_offset, glide_frames, ef
            )
            raw = start + round(ramped_offset)
            return int(round(clamp_finite(raw, 0, last_frame, 0)))

        # B3.1 loop path.
        loop_in_raw = loop.get("in", 0)
        loop_out_raw = loop.get("out", last_frame)
        loop_in = int(round(clamp_finite(loop_in_raw, 0, last_frame, 0)))
        loop_out = int(round(clamp_finite(loop_out_raw, 0, last_frame, last_frame)))

        # Enforce in <= out; if violated treat as degenerate → freeze at loop_in.
        l_in = min(loop_in, loop_out)
        l_out = max(loop_in, loop_out)
        loop_len = l_out - l_in + 1  # always >= 1

        # B3.2 — scrub overrides the loop traversal: map scrub (0..1) directly
        # onto [l_in, l_out]. The operator becomes the playhead.
        if scrub is not None:
            raw = l_in + scrub * (l_out - l_in)
            return int(round(clamp_finite(raw, 0, last_frame, 0)))

        # Raw offset from loopIn, incorporating speed magnitude.
        # B3.3 glide: ramp the abs_speed * playhead_frame offset.
        abs_sp = abs(speed)
        target_loop_offset = abs_sp * playhead_frame
        ramped_loop_offset = ExportManager._apply_glide_ramp(
            target_loop_offset, glide_frames, ef
        )
        raw_offset = int(round(ramped_loop_offset))
        dir_flipped = speed < 0

        direction = loop.get("dir", "fwd")
        if direction not in ("fwd", "rev", "pingpong"):
            direction = "fwd"

        # Effective direction after speed-sign interaction.
        if direction == "pingpong":
            effective_dir = "pingpong"
        elif dir_flipped:
            effective_dir = "rev" if direction == "fwd" else "fwd"
        else:
            effective_dir = direction

        if effective_dir == "fwd":
            frame_index = l_in + (raw_offset % loop_len)
        elif effective_dir == "rev":
            frame_index = l_out - (raw_offset % loop_len)
        else:
            # pingpong: period = 2 * (loop_len - 1); bounce at boundaries.
            period = max(1, 2 * (loop_len - 1))
            phase = raw_offset % period
            if phase < loop_len:
                frame_index = l_in + phase
            else:
                frame_index = l_out - (phase - (loop_len - 1))

        return int(round(clamp_finite(frame_index, 0, last_frame, 0)))

    @staticmethod
    def _compute_voice_crossfade_weight(
        inst: dict, playhead_frame: int, frame_count: int
    ) -> float:
        """B3.1: Compute crossfade blend weight for the loop seam.

        Returns a value in [0.0, 1.0] representing how much of the far-end
        blend frame should be mixed in at this playhead position.
        0.0 = pure current frame (no blend); 1.0 = at seam (maximum blend).

        # MIRROR: computeSamplerVoice.ts → computeLoopCrossfadeWeight
        """
        LOOP_CROSSFADE_MAX = 32

        loop = inst.get("loop")
        if not loop or not loop.get("enabled"):
            return 0.0

        def clamp_finite(v, lo, hi, fallback):
            if not isinstance(v, (int, float)) or isinstance(v, bool):
                return fallback
            if v != v or v in (float("inf"), float("-inf")):
                return fallback
            return min(hi, max(lo, v))

        crossfade = int(
            round(clamp_finite(loop.get("crossfade", 0), 0, LOOP_CROSSFADE_MAX, 0))
        )
        if crossfade <= 0:
            return 0.0

        fc = frame_count if isinstance(frame_count, int) and frame_count > 0 else 1
        last_frame = max(0, fc - 1)
        loop_in_raw = loop.get("in", 0)
        loop_out_raw = loop.get("out", last_frame)
        l_in = int(round(clamp_finite(loop_in_raw, 0, last_frame, 0)))
        l_out = int(round(clamp_finite(loop_out_raw, 0, last_frame, last_frame)))
        l_in, l_out = min(l_in, l_out), max(l_in, l_out)

        frame_index = ExportManager._compute_voice_footage_frame(
            inst, playhead_frame, frame_count
        )

        dist_from_out = l_out - frame_index
        dist_from_in = frame_index - l_in
        min_dist = min(dist_from_out, dist_from_in)
        if min_dist < 0:
            return 0.0
        return float(1 - min_dist / crossfade) if min_dist < crossfade else 0.0

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
        operators: list[dict] | None = None,
        operator_values: dict | None = None,
        frame_bank_caches: dict | None = None,
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
        # B4-export — Sample Rack channel summing in the EXPORT path.
        # A rack is N pads; each pad is a CHANNEL whose Sampler renders one-or-
        # more voice layers via the SAME B3 sampler math the per-instrument loop
        # uses. The pad channels are summed into the SAME `layers` list (the
        # existing compositor reads each layer's opacity + blend_mode). Macros
        # are STATIC at export time and are already resolved on the FRONTEND
        # (resolveRackMacros) before serialization — there is no per-frame macro
        # automation, so the backend does NOT re-resolve macros. Absent / empty
        # `racks` → no rack descriptors appended → export byte-identical to the
        # per-instrument path (regression-safe). Mirrors buildRackLayers.ts.
        racks = performance.get("racks") or {}

        # B3.2 — resolve `sampler.<id>.<param>` operator modulation into the
        # instruments dict BEFORE any footage frame is computed, so the modulated
        # scrub/speed reaches _compute_voice_footage_frame this frame (preview
        # parity: the frontend applies the same resolver before buildVoiceLayers).
        # No operators / empty values → instruments returned unchanged (no-op,
        # regression-safe). Mirrors MK.8's resolve_mask_modulations placement.
        if operators and isinstance(operators, list) and operator_values:
            from modulation.routing import resolve_sampler_modulations

            instruments = resolve_sampler_modulations(
                operator_values, operators, instruments
            )

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
        # B5.1 — branch GROUP descriptors (composite-tree). Populated by the
        # recursive rack walk below; expanded after PHASE 2 decode. Empty for a
        # flat project (no branch pads) → export byte-identical.
        group_descriptors: list[dict] = []
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
                        # B3.4 — carry the voice's MIDI note so the melodic
                        # note→startFrame/speed transform can be applied per-voice
                        # in PHASE 2. The FSM voice always carries `note` (used for
                        # release matching); melodic absent/off → ignored.
                        "note": voice.get("note"),
                    }
                )

        # B4-export — Sample Rack channel summing (mirror of buildRackLayers.ts).
        # Each rack hosts pads (channels); pads are emitted in array order so
        # later pads composite ON TOP of earlier pads (z-order). Within a pad,
        # voices keep ascending-triggerFrame order (evaluate_voices). The summing
        # gates EXACTLY mirror the frontend:
        #   MUTE:  a muted pad emits NOTHING.
        #   SOLO:  if ANY pad is soloed, only soloed pads render (a muted pad is
        #          still silent even if soloed — mute is the harder gate).
        #   OPACITY: per-pad opacity MULTIPLIES onto each voice layer's opacity
        #            (which already folds instrument opacity × ADSR env),
        #            clamped [0, 1] (trust boundary).
        #   BLEND: per-pad blend REPLACES the layer's blend_mode.
        # Pad voices reuse the SAME B3 sampler render math (footage frame via
        # _compute_voice_footage_frame, rgb/glide/melodic via the inst dict) as
        # the per-instrument loop. Descriptors are appended to the SAME
        # voice_descriptors list, so they flow through the budget validation +
        # PHASE 2 decode unchanged.
        def _clamp_finite(v, lo, hi, fallback):
            if not isinstance(v, (int, float)) or isinstance(v, bool):
                return fallback
            if v != v or v in (float("inf"), float("-inf")):
                return fallback
            return min(hi, max(lo, v))

        # B5.1 — build ONE leaf pad's voice descriptors (extracted so the flat
        # loop and the recursive branch walk share ONE leaf path → flat output is
        # byte-identical). `event_key` is the PATH-FROM-ROOT pad event key (flat
        # pad → `${trackId}:${padId}`, UNCHANGED); `voice_id_prefix` path-prefixes
        # nested leaf voice_ids so sibling branches don't alias.
        def _leaf_pad_descriptors(
            pad, rack_track_id, event_key, voice_id_prefix
        ) -> list[dict]:
            pad_inst = pad.get("instrument")
            if not isinstance(pad_inst, dict):
                return []
            pad_adsr = pad.get("adsr") or {
                "attack": 0,
                "decay": 0,
                "sustain": 1,
                "release": 0,
            }
            pad_voice_cap = pad.get("voiceCap", 4)
            pad_chain = pad_inst.get("chain") or []
            pad_clip_id = pad_inst.get("clipId")
            pad_asset = assets.get(pad_clip_id) if pad_clip_id is not None else None
            if not pad_asset or not pad_asset.get("path"):
                return []
            pad_asset_path = pad_asset["path"]
            pad_frame_count = pad_asset.get("frameCount") or 1
            pad_events = [
                e
                for e in events
                if isinstance(e, dict)
                and (e.get("instrumentId") == event_key or e.get("kind") == "panic")
            ]
            pad_voices = evaluate_voices(
                pad_events,
                frame_index,
                {"voiceCap": pad_voice_cap, "adsr": pad_adsr},
            )
            if not pad_voices:
                return []
            pad_opacity = _clamp_finite(pad.get("opacity", 1.0), 0.0, 1.0, 1.0)
            pad_blend = pad.get("blend", "normal")
            descs: list[dict] = []
            for voice in pad_voices:
                playhead = voice.get("footagePos", 0)
                env = envelope_value(voice, frame_index, pad_adsr)
                inst_op = pad_inst.get("opacity", 1.0)
                op = inst_op * env * pad_opacity
                if not isinstance(op, (int, float)) or op != op:
                    op = 0.0
                op = max(0.0, min(1.0, op))
                vid = encode_voice_id(voice["voiceId"])
                # NESTED only: path-prefix the voice_id (flat prefix '' →
                # UNCHANGED → byte-identical). Cap to MAX_VOICE_ID_LENGTH.
                if voice_id_prefix:
                    vid = f"{voice_id_prefix}_{vid}"[:128]
                descs.append(
                    {
                        "asset_path": pad_asset_path,
                        "frame_count": pad_frame_count,
                        "inst": pad_inst,
                        "playhead": playhead,
                        "chain": pad_chain,
                        "voice_id": vid,
                        "opacity": op,
                        "blend_mode": pad_blend,
                        "note": voice.get("note"),
                    }
                )
            return descs

        # B5.1 — recursive rack walk (post-order, mirror of flattenRackTree.ts).
        # Leaf pads append to `voice_descriptors` (flat path, byte-identical);
        # branch pads build a GROUP descriptor (children + branch chain/composite)
        # appended to `group_descriptors`, expanded after PHASE 2 decode. Depth is
        # bounded by MAX_BRANCH_DEPTH (fail-closed — a branch past the cap is
        # dropped, never recursed → no stack overflow).
        def _walk_rack_export(rack_node, rack_track_id, depth, branch_path):
            pads = rack_node.get("pads")
            if not isinstance(pads, list) or not pads:
                return []
            any_solo = any(isinstance(p, dict) and p.get("solo") is True for p in pads)
            out_nodes: list = []  # ordered: leaf descriptor lists / group dicts
            for pad_index, pad in enumerate(pads):
                if not isinstance(pad, dict):
                    continue
                if pad.get("mute"):
                    continue
                if any_solo and not pad.get("solo"):
                    continue
                branch = pad.get("branch")
                if isinstance(branch, dict):
                    # BRANCH pad — depth cap (fail-closed, no recursion past cap).
                    if depth + 1 > MAX_BRANCH_DEPTH:
                        continue
                    seg = f"b{pad_index}"
                    child_path = seg if branch_path == "" else f"{branch_path}_{seg}"
                    children = _walk_rack_export(
                        branch, rack_track_id, depth + 1, child_path
                    )
                    if not children:
                        continue
                    comp = branch.get("composite") or {}
                    branch_op = _clamp_finite(comp.get("opacity", 1.0), 0.0, 1.0, 1.0)
                    pad_op = _clamp_finite(pad.get("opacity", 1.0), 0.0, 1.0, 1.0)
                    group = {
                        "layer_type": "group",
                        "group_id": child_path,
                        "children": children,
                        "chain": branch.get("chain") or [],
                        "opacity": max(0.0, min(1.0, branch_op * pad_op)),
                        "blend_mode": comp.get("blend", "normal"),
                    }
                    out_nodes.append(group)
                    continue
                # LEAF pad.
                pad_id = pad.get("id")
                if pad_id is None:
                    continue
                event_key = (
                    f"{rack_track_id}:{pad_id}"
                    if branch_path == ""
                    else f"{rack_track_id}:{branch_path}_{pad_id}"
                )
                for d in _leaf_pad_descriptors(
                    pad, rack_track_id, event_key, branch_path
                ):
                    out_nodes.append(d)
            return out_nodes

        for rack_track_id, rack in racks.items():
            if not isinstance(rack, dict):
                continue
            nodes = _walk_rack_export(rack, rack_track_id, 0, "")
            for node in nodes:
                if isinstance(node, dict) and node.get("layer_type") == "group":
                    group_descriptors.append(node)
                else:
                    voice_descriptors.append(node)

        # ENFORCE-BEFORE-DECODE (design Memory-strategy): validate the per-frame
        # voice budget and the composite layer cap BEFORE opening/decoding any
        # footage, mirroring _handle_render_composite's order. A hostile
        # multi-instrument payload is rejected here, never buffered.
        budget_errors = validate_voice_layers(
            [{"voice_id": d["voice_id"]} for d in voice_descriptors]
        )
        # B5.1 — composite-tree caps (depth + tree-wide voice count) for the
        # branch GROUP descriptors. Mirrors the PREVIEW path's validate_composite_tree
        # (enforce-before-decode). Empty group_descriptors → no-op (flat parity).
        budget_errors += validate_composite_tree(group_descriptors)
        # +1 for the base layer; +1 per top-level group (one emitted layer each);
        # +1 per frameBank (each emits exactly ONE position-scan voice layer).
        budget_errors += validate_composite_layer_count(
            len(voice_descriptors)
            + len(group_descriptors)
            + len(performance.get("frameBanks") or {})
            + 1
        )
        if budget_errors:
            raise ValueError("; ".join(budget_errors))

        # PHASE 2 — decode footage + assemble the final layer list (now safe).
        for d in voice_descriptors:
            vframe = self._decode_voice_descriptor(d, voice_readers)
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

        # B5.1 — expand any branch GROUP descriptors (composite-tree). Each group
        # recursively composites its children into a sub-frame, applies the branch
        # chain to that sub-frame, and emits ONE layer the parent composite blends
        # upward — the SAME engine.composite_tree.expand_group_layer the PREVIEW
        # path uses (preview == export). The leaf children are decoded via the
        # SAME _decode_voice_descriptor (footage parity). State keys are the
        # PATH-FROM-ROOT ids (no sibling aliasing). No branch pads → no groups →
        # export byte-identical to the flat path.
        group_new_states: dict = {}
        for group in group_descriptors:

            def _decode_leaf(child: dict) -> np.ndarray:
                return self._decode_voice_descriptor(child, voice_readers)

            layers.append(
                expand_group_layer(
                    group,
                    decode_leaf=_decode_leaf,
                    resolution=resolution,
                    project_seed=project_seed,
                    frame_index=frame_index,
                    layer_states=voice_states,
                    new_states=group_new_states,
                )
            )

        # B6.1 — Frame-Bank (wavetable) instrument layers. A frameBank is a
        # CONTINUOUS position-scanner (NO trigger events): for each declared bank,
        # the CLAMPED position selects/interpolates slot frames decoded through a
        # per-bank byte-budget cache (the OOM guard) and emits ONE voice layer that
        # composites through the SAME render_composite path as every other voice.
        # Caps are enforced at the boundary BEFORE decode (validate_frame_bank);
        # the cache bounds resident decoded RAM regardless of slot count. Absent /
        # empty `frameBanks` → no layers appended → export byte-identical
        # (regression-safe). Per-frame `position` modulation is DEFERRED (SG-8 /
        # later slice) — this slice scans the static clamped position.
        frame_banks = performance.get("frameBanks") or {}
        if frame_banks:
            fb_caches = frame_bank_caches if frame_bank_caches is not None else {}

            def _fb_decode(clip_id: str, slot_frame_index: int) -> np.ndarray:
                # Resolve clipId → asset path via the SAME assets table samplers
                # use, then decode through the shared per-asset reader cache.
                fb_asset = assets.get(clip_id)
                if not fb_asset or not fb_asset.get("path"):
                    raise ValueError(
                        f"frameBank slot clipId {clip_id!r} has no asset path"
                    )
                reader = self._get_voice_reader(fb_asset["path"], voice_readers)
                rfc = getattr(reader, "frame_count", None)
                idx = int(slot_frame_index)
                if rfc:
                    # Clamp the slot frameIndex into the clip's real range (a
                    # stale project may reference a frame past a re-imported,
                    # shorter clip — clamp, never IndexError mid-export).
                    idx = max(0, min(rfc - 1, idx))
                return reader.decode_frame(idx)

            for fb_id, raw_fb in frame_banks.items():
                # ENFORCE-BEFORE-DECODE: validate + sanitize (clamp position /
                # byteBudget, reject over-cap slots / bad refs) BEFORE any decode.
                sanitized, fb_errors = validate_frame_bank(raw_fb)
                if fb_errors or sanitized is None:
                    raise ValueError("; ".join(fb_errors) or "invalid frameBank")
                # One byte-budget cache per bank id, sized to its CLAMPED budget,
                # persisted across output frames (the position-scan reuses slots).
                cache = fb_caches.get(fb_id)
                if (
                    cache is None
                    or getattr(cache, "byte_budget", None) != sanitized["byteBudget"]
                ):
                    cache = DecodedFrameCache(sanitized["byteBudget"])
                    fb_caches[fb_id] = cache
                # voice_id keys per-voice compositor state; encode colon-free and
                # bounded so a hostile fb_id can't escape the cache key namespace.
                vid = f"framebank_{fb_id}"[:128]
                vid = "".join(c if c.isalnum() or c in "_-" else "_" for c in vid)
                layers.append(
                    resolve_frame_bank_layer(
                        sanitized,
                        sanitized["position"],
                        cache,
                        _fb_decode,
                        frame_index=frame_index,
                        voice_id=vid,
                        opacity=sanitized.get("opacity", 1.0),
                        blend_mode=sanitized.get("blendMode", "normal"),
                    )
                )

        # Reuse the merged compositor verbatim, threading per-voice state.
        out, new_states = render_composite(
            layers, resolution, project_seed, voice_states
        )
        if group_new_states:
            new_states = {**new_states, **group_new_states}
        return out, new_states

    def _decode_voice_descriptor(self, d: dict, voice_readers: dict) -> np.ndarray:
        """B5.1 — decode ONE voice descriptor to an RGBA frame (extracted PHASE 2).

        Footage frame via ``_compute_voice_footage_frame`` + INJ-3 tail clamp +
        B3.3 per-channel RGB offset, exactly as the flat PHASE 2 loop did. Used
        both by the flat loop and by the composite-tree group expander's
        ``decode_leaf`` callback so a branch child decodes byte-identically to the
        same leaf on the flat path (export parity).
        """
        reader = self._get_voice_reader(d["asset_path"], voice_readers)
        rfc = getattr(reader, "frame_count", d["frame_count"]) or d["frame_count"]
        footage_idx = self._compute_voice_footage_frame(
            d["inst"], d["playhead"], rfc, note=d.get("note")
        )
        # INJ-3 tail clamp parity with _handle_render_composite.
        if rfc and footage_idx >= rfc - 2:
            footage_idx = max(0, rfc - 3)

        rgb_indices = self._compute_voice_rgb_frame_indices(d["inst"], footage_idx, rfc)
        if rgb_indices is not None:

            def _tail_clamp(idx, rfc=rfc):
                if rfc and idx >= rfc - 2:
                    return max(0, rfc - 3)
                return idx

            r_idx = _tail_clamp(rgb_indices["r"])
            g_idx = _tail_clamp(rgb_indices["g"])
            b_idx = _tail_clamp(rgb_indices["b"])
            vframe_r = reader.decode_frame(r_idx)
            vframe_g = reader.decode_frame(g_idx)
            vframe_b = reader.decode_frame(b_idx)
            vframe_base = reader.decode_frame(footage_idx)
            return np.stack(
                [
                    vframe_r[:, :, 0],
                    vframe_g[:, :, 1],
                    vframe_b[:, :, 2],
                    vframe_base[:, :, 3],
                ],
                axis=2,
            )
        return reader.decode_frame(footage_idx)

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
