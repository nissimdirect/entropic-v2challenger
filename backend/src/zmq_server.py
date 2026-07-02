import base64
import collections
import json
import logging
import math
import time
import uuid

import numpy as np
import sentry_sdk
import zmq
from PIL import Image
import io as _io

from effects import registry
from engine.cache import encode_mjpeg
from engine.codecs import CODEC_REGISTRY
from engine.export import ExportManager
from engine.freeze import FreezeManager
from engine.compositor import flatten_rgba, render_composite
from safety.latent_sentinel import detect_nan_in_frame
from engine.composite_tree import (
    collect_group_state_keys,
    expand_group_layer,
    is_group_layer,
    validate_composite_tree,
)
from engine.decoded_frame_cache import DecodedFrameCache
from engine.frame_bank import resolve_frame_bank_layer
from instruments.granulator_instrument import (
    BudgetController,
    GranulatorParams,
    grain_cloud,
    parse_granulator_layer,
    register_sg8_density_hook,
    select_grain_weights,
    select_random_grain_weights,
)
from instruments.granulator_gpu import (
    register_sg8_texture_pool_hook,
    render_grain_layer_dispatch,
)
from engine.guards import clamp_finite, guard_positive
from engine.pipeline import (
    apply_chain,
    flush_timing,
    get_effect_health,
    get_effect_stats,
)
from masking.routing import apply_masks_to_chain
from masking.stack import FrameCtx
from memory.writer import SharedMemoryWriter
from project.schema import V2_UNSUPPORTED_MESSAGE
from safety.pressure.degrade_order import CANONICAL_DEGRADE_ORDER
from safety.pressure.monitor import PressureMonitor
from safety.pressure.registry import global_registry
from security import (
    is_audio_magic,
    resolve_safe_path,
    validate_capture_events,
    validate_chain_depth,
    validate_export_modulation,
    validate_composite_layer_count,
    validate_frame_bank,
    validate_frame_count,
    validate_output_directory,
    validate_output_path,
    validate_upload,
    validate_voice_layers,
)
from audio.decoder import decode_audio
from audio.clock import AVClock
from audio.mixer import AudioMixer
from audio.mixer_player import MixerPlayer
from audio.player import AudioPlayer
from audio.project_clock import ProjectClock
from audio.waveform import compute_peaks
from engine.text_renderer import list_system_fonts, render_text_frame
from video.image_reader import ImageReader, is_image_file
from video.ingest import generate_thumbnails, probe, probe_image
from video.reader import VideoReader
import diagnostics as _diagnostics_mod
import os
from inspector.inline_actions import (
    ActionContext,
    ActionContextKind,
    global_inline_actions,
    reset_global_inline_actions_for_testing as _reset_inline_actions,
)
from inspector.routing_graph import global_routing_graph
from inspector.registry import (
    MAX_PROBES,
    ProbeKind,
    global_probe_registry,
)
from inspector.graph_sync import build_graph_from_project, serialize_graph


def _experimental_audio_tracks_enabled() -> bool:
    """Read EXPERIMENTAL_AUDIO_TRACKS env var. Accepts true/1/yes/on."""
    val = os.environ.get("EXPERIMENTAL_AUDIO_TRACKS", "").strip().lower()
    return val in {"true", "1", "yes", "on"}


class ZMQServer:
    def __init__(self):
        self.context = zmq.Context()
        self.socket = self.context.socket(zmq.REP)
        self.socket.setsockopt(zmq.MAXMSGSIZE, 1_048_576)  # 1 MB limit
        self.port = self.socket.bind_to_random_port("tcp://127.0.0.1")
        # Dedicated ping socket — never blocked by heavy renders (BUG-4)
        self.ping_socket = self.context.socket(zmq.REP)
        self.ping_socket.setsockopt(zmq.MAXMSGSIZE, 4096)  # 4 KB limit (pings only)
        self.ping_port = self.ping_socket.bind_to_random_port("tcp://127.0.0.1")
        # Auth token — prevents unauthorized ZMQ access from other local processes
        self.token = str(uuid.uuid4())
        self.start_time = time.time()
        self.running = False
        self.shm_writer: SharedMemoryWriter | None = None
        self.readers: collections.OrderedDict[str, VideoReader | ImageReader] = (
            collections.OrderedDict()
        )
        self._max_readers = 10
        self.last_frame_ms = 0.0
        # ExportManager is constructed after the audio mixer + flag below so
        # it can receive the mixer + flag state for the mixdown export path.
        self.freeze_manager = FreezeManager()
        # Waveform peak cache — keyed by (path, num_bins), LRU eviction
        self._waveform_cache: collections.OrderedDict[tuple[str, int], list] = (
            collections.OrderedDict()
        )
        self._max_waveform_cache = 64
        # Audio playback engine — singleton bed (legacy path)
        self.audio_player = AudioPlayer()
        # Project clock — multi-track path, driven by time.monotonic()
        self.project_clock = ProjectClock()
        # Audio mixer — sums N tracks × N clips when flag ON. Always
        # instantiated; empty state = silent output. State pushed via
        # audio_tracks_set / audio_tracks_clear ZMQ commands.
        self.audio_mixer = AudioMixer()
        # MixerPlayer — PortAudio output stream for flag-ON path.
        # Construction is cheap (no device open); start() opens the stream.
        self.mixer_player = MixerPlayer(self.audio_mixer, self.project_clock)
        # Feature-flag routing: EXPERIMENTAL_AUDIO_TRACKS=true swaps AVClock
        # source to project_clock. When off, AudioPlayer remains master (legacy).
        self._experimental_audio_tracks = _experimental_audio_tracks_enabled()
        clock_source = (
            self.project_clock if self._experimental_audio_tracks else self.audio_player
        )
        self.av_clock = AVClock(clock_source)
        # ExportManager receives audio_mixer + flag so that flag-on exports
        # mux the project audio mixdown INTO the video instead of the source
        # video's audio stream.
        self.export_manager = ExportManager(
            audio_mixer=self.audio_mixer,
            experimental_audio_tracks=self._experimental_audio_tracks,
        )
        # Sentry breadcrumb rate-limiter for render_frame (every 30th frame)
        self._breadcrumb_frame_counter = 0
        # Signal engine for operator modulation (Phase 6A)
        self._signal_engine = None
        self._signal_state: dict = {}
        # P5b.21 (B9): change-gated mod-edge validation cache for the per-frame
        # render path. The render IPC fires 30×/sec; we must NOT re-validate the
        # whole operator list every frame. Cache the hash of the last-validated
        # operators + the result, and only re-run validate_operator_mod_edges
        # when the operators payload actually CHANGES (review Tiger 1b perf note).
        self._mod_edges_validated_hash: int | None = None
        self._mod_edges_validation_errors: list[str] = []
        # Per-effect state cache for preview render path. Mirrors how
        # export.py threads the `states` dict frame-by-frame so stateful
        # effects (datamosh, reaction_mosh, frame_drop, generation_loss,
        # temporal_dispersion, etc.) actually accumulate across frames.
        # Reset on path change or non-monotonic frame jump (seek/scrub).
        self._render_states: dict[str, dict | None] = {}
        # (path, last_frame_index) — used to detect discontinuities.
        self._render_state_key: tuple[str | None, int] = (None, -1)
        # SG-8 (P5b.1): live memory-pressure monitor. Constructed here (cheap,
        # no thread spawned) and STARTED in run() so that merely constructing a
        # ZMQServer in a test does not leak a background thread. Wired to the
        # process-wide FeatureRegistry so degrade/restore callbacks fire from
        # monitor threshold crossings (see safety/pressure/monitor.py
        # _evaluate_and_fire seam). stop() is called in close().
        self.pressure_monitor = PressureMonitor(registry=global_registry())
        # P5b.17 (SG-8): register the B8 Granulator's density-halving degrade
        # hook against canonical stage `a1_grain_density_halved` (order #3:
        # latent grains → spectral → density). When memory pressure crosses that
        # threshold the monitor fires the hook, latching half-density until
        # restore. Idempotent at the registry (unregister-first by label), so
        # constructing a second server in one process does not duplicate the hook.
        register_sg8_density_hook(global_registry())
        # P5b.28 (SG-8): register the B8 Granulator GPU texture-pool release hook
        # against canonical stage `gpu_texture_pool_released` (order #6 @85%). When
        # memory pressure crosses that threshold the monitor calls destroy_all()
        # on every granulator GPU pool; renders continue (CPU fallback or lazy
        # pool recreation next frame). Idempotent at the registry (unregister-first
        # by label), so a second server in one process does not duplicate the hook.
        register_sg8_texture_pool_hook(global_registry())
        # P5b.17: previous grain-render eval time (ms), fed into the budget
        # controller so a frame that blew the 16ms budget degrades subsequent
        # density. The controller (TIGER 3 fix) carries a sticky degrade floor
        # with a recovery deadband so the budget guard CONVERGES instead of
        # strobing full↔half every frame.
        self._granulator_last_frame_ms: float | None = None
        self._granulator_budget = BudgetController()
        # P5b.18: persistent onset-follower state for the `onset` selection rule
        # (spectral-flux needs the previous frame's spectrum). Threaded across
        # render frames; reset on project reset (see reset_state).
        self._granulator_onset_state: dict | None = None
        # SG-3 clause-2 (P5b.4): render-output NaN/Inf gate state.
        #   _last_good_frames: last finite preview frame PER (path-tag, shape),
        #     served in place of a NaN/Inf frame so a glitched lane never ships a
        #     corrupt JPEG / blanks the canvas mid-session. Keyed by frame `.shape`
        #     (not just resolution) because `resolution` is per-request from the
        #     message payload and can change mid-session without reset_state — a
        #     last-good cached at shape A must NEVER be served against a reply
        #     advertising shape B (TIGER 4). Falls back to opaque black at the
        #     requested resolution before the first finite frame of that shape.
        #
        #   Honest scope note (NOT a per-lane abort): a NaN at the composed-frame
        #   choke point is NOT attributable to a specific modulation lane (the
        #   composite has already merged every layer/lane), so there is no per-lane
        #   reader to mute. `lane_aborted.lane_id` is therefore always "unknown".
        #   The gate serves last-known-good until the frame self-heals (the NaN
        #   lane stops emitting non-finite output); it does NOT permanently disable
        #   a lane. The reply still carries `lane_aborted` so the frontend can warn.
        self._last_good_frames: dict[tuple, np.ndarray] = {}

    def reset_state(self):
        """Clear accumulated state without closing sockets/context.

        Used by session-scoped test fixtures to reset between tests
        while keeping the server running.
        """
        # Close and clear video readers
        for reader in self.readers.values():
            reader.close()
        self.readers.clear()

        # P5b.17: reset the granulator budget controller so a new project starts
        # at full density (no carried-over degrade floor from the prior session).
        self._granulator_last_frame_ms = None
        if hasattr(self, "_granulator_budget"):
            self._granulator_budget.reset()
        # P5b.18: clear the onset-follower state so a new project's `onset`
        # selection starts with no carried-over spectral-flux history.
        self._granulator_onset_state = None

        # Clear waveform cache
        self._waveform_cache.clear()

        # Reset audio player (stop playback, unload)
        self.audio_player.stop()

        # Reset project clock state + A/V clock (source follows flag state)
        self.project_clock = ProjectClock()
        clock_source = (
            self.project_clock if self._experimental_audio_tracks else self.audio_player
        )
        self.av_clock = AVClock(clock_source)

        # Clear mixer state + release all decoder handles + stop PortAudio stream
        self.mixer_player.close()
        self.audio_mixer.close()
        self.audio_mixer = AudioMixer()
        self.mixer_player = MixerPlayer(self.audio_mixer, self.project_clock)

        # Cancel any in-flight export. Re-create with the current mixer +
        # flag so the mixdown path continues to work after reset.
        self.export_manager.cancel()
        self.export_manager = ExportManager(
            audio_mixer=self.audio_mixer,
            experimental_audio_tracks=self._experimental_audio_tracks,
        )

        # Close shared memory writer (will be re-created on demand)
        if self.shm_writer is not None:
            self.shm_writer.close()
            self.shm_writer = None

        # Reset frame timing
        self.last_frame_ms = 0.0

        # Reset breadcrumb frame counter
        self._breadcrumb_frame_counter = 0

        # Reset signal engine state
        self._signal_state = {}

        # Reset per-effect render-state cache
        self._render_states = {}
        self._render_state_key = (None, -1)

        # SG-3 clause-2: drop the per-shape last-known-good frame cache so the
        # output gate starts clean each session (mirrors test-fixture isolation).
        self._last_good_frames = {}

        # Reset composite per-voice/per-layer state cache (P5a.2 red-team RT-1:
        # these lazily-init attrs were not cleared here, leaking stale per-voice
        # numpy buffers across a reset — breaks test isolation on the shared
        # session server; reset_state is a public method, so the invariant must hold).
        if hasattr(self, "_composite_states"):
            self._composite_states = {}
        if hasattr(self, "_composite_last_signature"):
            self._composite_last_signature = None
        if hasattr(self, "_composite_last_frame"):
            self._composite_last_frame = None

        # B6.2 — reset the per-frameBank preview decoded-frame caches (mirror of
        # export's `frame_bank_caches`, but persisted on the server across preview
        # frames). Leaking these would hold decoded RAM resident across a reset.
        if hasattr(self, "_frame_bank_caches"):
            self._frame_bank_caches = {}

        # Reset freeze caches
        self.freeze_manager.reset()

    def _ensure_shm(self) -> SharedMemoryWriter:
        if self.shm_writer is None:
            self.shm_writer = SharedMemoryWriter()
        return self.shm_writer

    def _get_render_states(self, path: str, frame_index: int) -> dict[str, dict | None]:
        """Return the per-effect state dict for a preview render call.

        Resets to an empty dict when:
          - the source path changes (different video/image), or
          - frame_index is not monotonically the next frame after the
            previous render call (seek, scrub, replay).

        This mirrors export.py's frame-by-frame state threading and is the
        contract `apply_chain` expects (see engine/pipeline.py docstring).
        """
        last_path, last_index = self._render_state_key
        is_continuous = path == last_path and frame_index == last_index + 1
        if not is_continuous:
            self._render_states = {}
        return self._render_states

    def _store_render_states(
        self,
        path: str,
        frame_index: int,
        new_states: dict[str, dict | None],
    ) -> None:
        """Persist post-frame states for the next monotonic call."""
        self._render_states = new_states
        self._render_state_key = (path, frame_index)

    def _validate_token(self, message: dict) -> str | None:
        """Validate auth token. Returns error message or None if valid."""
        msg_token = message.get("_token")
        if msg_token != self.token:
            return "invalid or missing auth token"
        return None

    def _make_ping_response(self, msg_id: str | None) -> dict:
        return {
            "id": msg_id,
            "status": "alive",
            "uptime_s": round(time.time() - self.start_time, 1),
            "last_frame_ms": self.last_frame_ms,
        }

    def handle_message(self, message: dict) -> dict:
        cmd = message.get("cmd")
        msg_id = message.get("id")

        # Auth token required on all commands
        token_err = self._validate_token(message)
        if token_err:
            return {"id": msg_id, "ok": False, "error": token_err}

        # Set Sentry tag and crash dump context for crash context
        if cmd and cmd != "ping":
            sentry_sdk.set_tag("last_command", cmd)
            _diagnostics_mod._last_command = cmd

        if cmd == "ping":
            return self._make_ping_response(msg_id)
        elif cmd == "shutdown":
            self.running = False
            return {"id": msg_id, "ok": True}
        elif cmd == "ingest":
            result = self._handle_ingest(message, msg_id)
            if result.get("ok"):
                self._breadcrumb_frame_counter = 0
                video_ctx = {
                    "width": result.get("width"),
                    "height": result.get("height"),
                    "fps": result.get("fps"),
                    "frame_count": result.get("frame_count"),
                }
                sentry_sdk.add_breadcrumb(
                    category="io",
                    message="ingest",
                    data=video_ctx,
                    level="info",
                )
                sentry_sdk.set_context("video", video_ctx)
            return result
        elif cmd == "seek":
            return self._handle_seek(message, msg_id)
        elif cmd == "render_frame":
            self._breadcrumb_frame_counter += 1
            if self._breadcrumb_frame_counter % 30 == 0:
                sentry_sdk.add_breadcrumb(
                    category="render",
                    message="render_frame",
                    data={
                        "frame_index": message.get("frame_index", 0),
                        "chain_length": len(message.get("chain", [])),
                    },
                    level="info",
                )
            chain = message.get("chain", [])
            effect_ids = [
                e.get("effectId", e.get("effect_id", ""))
                for e in chain
                if isinstance(e, dict)
            ]
            sentry_sdk.set_context(
                "effect_chain",
                {
                    "chain_length": len(chain),
                    "effect_ids": effect_ids[:20],  # Cap to avoid huge context
                },
            )
            return self._handle_render_frame(message, msg_id)
        elif cmd == "render_composite":
            return self._handle_render_composite(message, msg_id)
        elif cmd == "apply_chain":
            return self._handle_apply_chain(message, msg_id)
        elif cmd == "list_effects":
            return {"id": msg_id, "ok": True, "effects": registry.list_all()}
        elif cmd == "list_fonts":
            return self._handle_list_fonts(msg_id)
        elif cmd == "render_text_frame":
            return self._handle_render_text_frame(message, msg_id)
        elif cmd == "audio_decode":
            return self._handle_audio_decode(message, msg_id)
        elif cmd == "waveform":
            return self._handle_waveform(message, msg_id)
        elif cmd == "audio_load":
            result = self._handle_audio_load(message, msg_id)
            sentry_sdk.add_breadcrumb(
                category="audio",
                message="audio_load",
                data={"has_audio": True},
                level="info",
            )
            return result
        elif cmd == "audio_play":
            result = self._handle_audio_play(msg_id)
            sentry_sdk.add_breadcrumb(
                category="audio",
                message="audio_play",
                data={},
                level="info",
            )
            return result
        elif cmd == "audio_pause":
            result = self._handle_audio_pause(msg_id)
            sentry_sdk.add_breadcrumb(
                category="audio",
                message="audio_pause",
                data={},
                level="info",
            )
            return result
        elif cmd == "audio_seek":
            return self._handle_audio_seek(message, msg_id)
        elif cmd == "audio_volume":
            return self._handle_audio_volume(message, msg_id)
        elif cmd == "audio_position":
            return self._handle_audio_position(msg_id)
        elif cmd == "audio_meter":
            return self._handle_audio_meter(message, msg_id)
        elif cmd == "audio_stop":
            return self._handle_audio_stop(msg_id)
        elif cmd == "project_clock_play":
            return self._handle_project_clock_play(msg_id)
        elif cmd == "project_clock_pause":
            return self._handle_project_clock_pause(msg_id)
        elif cmd == "project_clock_seek":
            return self._handle_project_clock_seek(message, msg_id)
        elif cmd == "project_clock_set_duration":
            return self._handle_project_clock_set_duration(message, msg_id)
        elif cmd == "project_clock_state":
            return self._handle_project_clock_state(msg_id)
        elif cmd == "audio_tracks_set":
            return self._handle_audio_tracks_set(message, msg_id)
        elif cmd == "audio_tracks_clear":
            return self._handle_audio_tracks_clear(msg_id)
        elif cmd == "clock_sync":
            return self._handle_clock_sync(msg_id)
        elif cmd == "clock_set_fps":
            return self._handle_clock_set_fps(message, msg_id)
        elif cmd == "export_start":
            sentry_sdk.add_breadcrumb(
                category="export",
                message="export_start",
                data={"chain_length": len(message.get("chain", []))},
                level="info",
            )
            return self._handle_export_start(message, msg_id)
        elif cmd == "export_status":
            return self._handle_export_status(msg_id)
        elif cmd == "export_cancel":
            sentry_sdk.add_breadcrumb(
                category="export",
                message="export_cancel",
                data={},
                level="info",
            )
            return self._handle_export_cancel(msg_id)
        elif cmd == "effect_health":
            return {"id": msg_id, "ok": True, **get_effect_health()}
        elif cmd == "effect_stats":
            return {"id": msg_id, "ok": True, "stats": get_effect_stats()}
        elif cmd == "check_dag":
            return self._handle_check_dag(message, msg_id)
        elif cmd == "flush_state":
            flush_timing()
            # P6.5: project unload / chain teardown also destroys every codegen
            # GPU pool (SPEC-3 §2.5 chain-removal hook) so no field-effect GPU
            # buffers survive a project switch.
            from effects.field_codegen import release_all_instance_pools

            release_all_instance_pools()
            # P6.7: clear probe history on project unload so stale readings
            # from a previous project don't bleed into the next session.
            global_probe_registry().clear_history()
            return {"id": msg_id, "ok": True}
        elif cmd == "probe_register":
            return self._handle_probe_register(message, msg_id)
        elif cmd == "probe_unregister":
            return self._handle_probe_unregister(message, msg_id)
        elif cmd == "probe_mount":
            return self._handle_probe_mount(msg_id)
        elif cmd == "probe_unmount":
            return self._handle_probe_unmount(msg_id)
        elif cmd == "probe_snapshot":
            return self._handle_probe_snapshot(msg_id)
        # P6.9 — I2 Routing Canvas backend
        elif cmd == "routing_graph_get":
            return self._handle_routing_graph_get(message, msg_id)
        elif cmd == "routing_edge_update":
            return self._handle_routing_edge_update(message, msg_id)
        elif cmd == "freeze_prefix":
            return self._handle_freeze_prefix(message, msg_id)
        elif cmd == "read_freeze":
            return self._handle_read_freeze(message, msg_id)
        elif cmd == "bake_performance_track":
            return self._handle_bake_performance_track(message, msg_id)
        elif cmd == "flatten":
            return self._handle_flatten(message, msg_id)
        elif cmd == "invalidate_cache":
            return self._handle_invalidate_cache(message, msg_id)
        elif cmd == "memory_status":
            return self._handle_memory_status(msg_id)
        elif cmd == "pressure_status":
            return self._handle_pressure_status(msg_id)
        elif cmd == "thumbnails":
            return self._handle_thumbnails(message, msg_id)
        elif cmd == "export_frame":
            return self._handle_export_frame(message, msg_id)
        elif cmd == "inline_actions_list":
            return self._handle_inline_actions_list(message, msg_id)
        elif cmd == "inline_actions_invoke":
            return self._handle_inline_actions_invoke(message, msg_id)
        elif cmd == "mask_wand_sample":
            return self._handle_mask_wand_sample(message, msg_id)
        elif cmd == "mask_gc_sidecars":
            return self._handle_mask_gc_sidecars(message, msg_id)
        elif cmd == "mask_thumbnail":
            return self._handle_mask_thumbnail(message, msg_id)
        else:
            return {"id": msg_id, "ok": False, "error": f"unknown: {cmd}"}

    def _handle_ingest(self, message: dict, msg_id: str | None) -> dict:
        path = message.get("path")
        if not path:
            return {"id": msg_id, "ok": False, "error": "missing path"}

        # SEC-5: Validate upload
        errors = validate_upload(path)
        if errors:
            return {"id": msg_id, "ok": False, "error": "; ".join(errors)}

        # Route to image or video probe based on extension
        if is_image_file(path):
            result = probe_image(path)
        else:
            result = probe(path)
        result["id"] = msg_id

        # SEC-6: Validate frame count (videos only — images have frame_count=0)
        if result.get("ok") and result.get("frame_count", 0) > 0:
            fc_errors = validate_frame_count(result["frame_count"])
            if fc_errors:
                return {"id": msg_id, "ok": False, "error": "; ".join(fc_errors)}

        # Store reader for reuse (images use ImageReader)
        if result.get("ok"):
            self._get_reader(path)
            # Sync video frame count to audio clock so it never overshoots
            fc = result.get("frame_count", 0)
            if fc > 0:
                self.av_clock.set_video_frame_count(fc)

        return result

    def _handle_thumbnails(self, message: dict, msg_id: str | None) -> dict:
        path = message.get("path")
        if not path:
            return {"id": msg_id, "ok": False, "error": "missing path"}

        # SEC-5: Validate upload path
        errors = validate_upload(path)
        if errors:
            return {"id": msg_id, "ok": False, "error": "; ".join(errors)}

        count = int(message.get("count", 8))
        result = generate_thumbnails(path, count=count)
        result["id"] = msg_id
        return result

    def _handle_seek(self, message: dict, msg_id: str | None) -> dict:
        path = message.get("path")
        time_s = clamp_finite(float(message.get("time", 0.0)), 0.0, 86400.0, 0.0)
        if not path:
            return {"id": msg_id, "ok": False, "error": "missing path"}

        # SEC-5: Validate path (same gate as ingest — prevents path traversal)
        errors = validate_upload(path)
        if errors:
            return {"id": msg_id, "ok": False, "error": "; ".join(errors)}

        try:
            reader = self._get_reader(path)
            frame_index = int(time_s * reader.fps)
            t0 = time.time()
            frame = reader.decode_frame(frame_index)
            # Encode once for base64 transport (skip mmap — Electron uses base64)
            jpeg_bytes = encode_mjpeg(frame)
            frame_b64 = base64.b64encode(jpeg_bytes).decode("ascii")
            self.last_frame_ms = round((time.time() - t0) * 1000, 2)
            return {
                "id": msg_id,
                "ok": True,
                "frame_index": frame_index,
                "frame_data": frame_b64,
                "width": reader.width,
                "height": reader.height,
            }
        except Exception as e:
            sentry_sdk.capture_exception(e)
            logging.getLogger(__name__).error(f"Seek handler error: {e}")
            return {"id": msg_id, "ok": False, "error": "Internal processing error"}

    def _render_composited_frame(
        self, message: dict
    ) -> tuple[np.ndarray, int, object, object]:
        """Extract the render core of _handle_render_frame for reuse by export_frame.

        Returns (output_ndarray, frame_index, reader, operator_values).
        Raises on any error (callers wrap in try/except).
        Caller is responsible for validating path and chain before calling this.
        The internal end-buffer clamp (frame_count-3) is applied here, matching
        the preview render path — this is safe after trust-boundary validation.
        """
        path = message["path"]
        chain = list(message.get("chain", []))
        project_seed = message.get("project_seed", 0)

        reader = self._get_reader(path)
        # Accept frame_index directly, fall back to time_s * fps
        if "frame_index" in message:
            frame_index = int(message["frame_index"])
        else:
            time_s = clamp_finite(float(message.get("time", 0.0)), 0.0, 86400.0, 0.0)
            frame_index = int(time_s * reader.fps)

        # F-3: Bounds check on frame_index (callers may also check)
        if frame_index < 0:
            raise ValueError("frame_index must be non-negative")

        # Clamp to safe range — MKV/VP9 containers often can't decode
        # the very last frames. Leave a 2-frame buffer from the end.
        if (
            hasattr(reader, "frame_count")
            and reader.frame_count
            and frame_index >= reader.frame_count - 2
        ):
            frame_index = max(0, reader.frame_count - 3)

        frame = reader.decode_frame(frame_index)
        resolution = (reader.width, reader.height)

        # Phase 6A: Apply operator modulation if operators present
        operators = message.get("operators")
        operator_values = None
        if operators and isinstance(operators, list):
            # P5b.21 (B9): the render IPC is the LIVE production trust boundary for
            # mod-routing edges (deserialize/validate is the .glitch path only and
            # never runs here). Change-gated validation rejects flag-off/unknown
            # binding rules, malformed axes, non-finite depths, and the
            # MAX_MOD_EDGES_TOTAL cap BEFORE resolve_routings can consume them. On
            # failure: skip modulation entirely (render unmodulated) and warn —
            # the hostile rule NEVER reaches the resolver (review Tiger 1b/4).
            mod_edge_errors = self._validate_mod_edges_change_gated(operators)
            if mod_edge_errors:
                logging.getLogger(__name__).warning(
                    "B9: rejecting operator modulation for this render — %s",
                    "; ".join(mod_edge_errors),
                )
                operators = None
        if operators and isinstance(operators, list):
            engine = self._get_signal_engine()
            # Get audio PCM window for audio follower
            audio_pcm = self._get_audio_pcm_for_frame(frame_index, reader.fps)
            audio_sr = (
                self.audio_player._sample_rate if self.audio_player.loaded else 44100
            )
            # P4.2: host BPM drives bpm_sync-enabled operators (kentaroCluster).
            # Non-finite / out-of-range input clamps to the 120.0 default.
            bpm = clamp_finite(message.get("bpm", 120.0), 1.0, 999.0, 120.0)
            operator_values, self._signal_state = engine.evaluate_all(
                operators,
                frame_index,
                reader.fps,
                audio_pcm=audio_pcm,
                audio_sample_rate=audio_sr,
                video_frame=frame,
                state=self._signal_state,
                bpm=bpm,
            )
            # Phase 7: Extract automation overrides from frontend
            auto_overrides = message.get("automation_overrides")
            if auto_overrides and not isinstance(auto_overrides, dict):
                auto_overrides = None

            # P6.7 probe site 4 — lane_output: auto_overrides are the
            # frontend-evaluated T-domain lane values (one per effect.param).
            # Record each before apply_modulation consumes them.
            # Guard: no-op when inspector not mounted (one attr check).
            _probe_reg = global_probe_registry()
            if _probe_reg.is_mounted() and auto_overrides:
                for _lane_key, _lane_val in auto_overrides.items():
                    _probe_reg.record(f"{_lane_key}:lane_output", float(_lane_val))

            # TODO(P7.9c): C5 latent-trajectory enforcement hooks here
            # (per-lane evaluation seam — SG-8/sentinel wiring; phase-7 P7.9c
            #  greps for the marker line above verbatim).

            chain = engine.apply_modulation(
                operators,
                operator_values,
                chain,
                registry.get,
                automation_overrides=auto_overrides,
            )

        # Apply clip transform if present (before effect chain)
        transform = message.get("transform")
        if transform and isinstance(transform, dict):
            frame = self._apply_clip_transform(frame, transform, resolution)

        # MK.3 universal mask routing (SPEC §4.2). Both scopes are additive and
        # trust-boundary-guarded: bad/unknown refs skip + warn, never crash the
        # frame. Absent mask_stack / refs → byte-identical legacy path.
        #   frame_hw is the matte's required (H, W) — taken from the (possibly
        #   transformed) frame so the matte always broadcasts against it.
        frame_hw = (frame.shape[0], frame.shape[1])
        mask_stack = message.get("mask_stack")
        mask_ctx = FrameCtx(frame=frame, frame_index=frame_index, clip_id=str(path))
        # MK.3 — the ONE shared mask-routing seam. Runs, in order: MK.8
        # keying-as-performance operator modulation → per-device _mask injection
        # (container.py GT-6 seam) → per-chain wet/dry matte. Identical logic is
        # called by render_composite, composite_tree, and export so the four
        # paths CANNOT drift (preview/export parity). Absent mask_stack /
        # chain_mask → byte-identical no-mask path (rollback guarantee).
        chain, chain_mask = apply_masks_to_chain(
            chain,
            mask_stack,
            mask_ctx,
            frame_hw,
            chain_mask_ref=message.get("chain_mask"),
            operators=operators,
            operator_values=operator_values,
        )

        # Use pipeline engine — thread per-effect state across frames so
        # stateful effects (datamosh, reaction_mosh, frame_drop, etc.)
        # accumulate. Resets on path change or seek; see _get_render_states.
        # P6.1: extract optional axis_lanes from message.
        # Each entry: {effect_id, param, curve:[float], domain, direction,
        #              interp_mode, loop_mode, n_bands}.
        # Trust boundary: must be a list; non-list → silently ignored.
        raw_axis_lanes = message.get("axis_lanes")
        axis_lanes: list[dict] | None = None
        if isinstance(raw_axis_lanes, list) and raw_axis_lanes:
            axis_lanes = raw_axis_lanes

        states_in = self._get_render_states(path, frame_index)
        output, states_out = apply_chain(
            frame,
            chain,
            project_seed,
            frame_index,
            resolution,
            states_in,
            chain_mask=chain_mask,
            axis_lanes=axis_lanes,
        )
        self._store_render_states(path, frame_index, states_out)

        return output, frame_index, reader, operator_values

    def _apply_output_gate(
        self, output: np.ndarray, resolution_wh: tuple[int, int], path_tag: str
    ) -> tuple[np.ndarray, dict | None]:
        """SG-3 clause-2 render-output NaN/Inf gate — the single shared seam.

        Finite-checks `output` (ONE np.isfinite reduction, integer dtype short-
        circuits). Used by EVERY preview frame→encode path that can carry
        modulation-stack / composited output (render_frame, render_composite) so
        the SG-3 contract "NaN/Inf NEVER silently passes downstream" holds
        APP-WIDE, not just on one handler.

        Finite frame → pure pass-through: cached as last-known-good keyed by its
        `.shape`, returned verbatim, no `lane_aborted` (None). Zero byte change to
        the happy path.

        NaN/Inf frame → substitute the last-known-good frame OF THE SAME SHAPE
        (TIGER 4: `resolution` is per-request and can change mid-session, so a
        last-good of a different shape must never be served against this reply); if
        none exists yet, an opaque-black canvas at the requested resolution with
        the same channel count as `output`. Returns `(safe_output, lane_aborted)`
        where `lane_aborted = {lane_id: "unknown", reason: ...}` — "unknown"
        because a composed/processed frame is not attributable to one lane.

        `path_tag` namespaces the per-shape cache so the single-clip and composite
        paths never serve each other's frames even at identical dims.
        """
        # Lazy init — keeps the gate robust on `ZMQServer.__new__(...)` instances
        # (test fixtures that skip __init__) without relying on every caller to
        # pre-seed the attribute. Mirrors `_get_composite_states`' lazy pattern.
        if not hasattr(self, "_last_good_frames"):
            self._last_good_frames = {}

        if not detect_nan_in_frame(output):
            # Finite: pass through unchanged + remember as last-good for its shape.
            # Defensive copy: store a snapshot so that if the caller reuses the
            # underlying ndarray buffer in-place (e.g. writes NaN into it on the
            # next render), the cached last-good is not silently mutated.
            self._last_good_frames[(path_tag, output.shape)] = output.copy()
            return output, None

        logging.getLogger(__name__).warning(
            "SG-3 output gate: non-finite frame on %s; serving last-known-good",
            path_tag,
        )
        lane_aborted = {
            "lane_id": "unknown",
            "reason": "render output contained NaN/Inf; serving last-known-good",
        }
        res_w, res_h = resolution_wh
        # Prefer a last-good of the EXACT shape the corrupt frame had (so the
        # served frame matches what the chain/composite would have produced).
        last_good = self._last_good_frames.get((path_tag, output.shape))
        if last_good is not None:
            return last_good, lane_aborted
        # No same-shape good frame yet → opaque black at the requested resolution,
        # preserving the corrupt frame's channel count (3=RGB, 4=RGBA).
        channels = output.shape[2] if output.ndim == 3 else 4
        black = np.zeros((res_h, res_w, channels), dtype=np.uint8)
        if channels == 4:
            black[:, :, 3] = 255
        return black, lane_aborted

    def _handle_render_frame(self, message: dict, msg_id: str | None) -> dict:
        path = message.get("path")
        chain = message.get("chain", [])
        if not path:
            return {"id": msg_id, "ok": False, "error": "missing path"}

        # SEC-5: Validate path (prevents path traversal via render_frame)
        errors = validate_upload(path)
        if errors:
            return {"id": msg_id, "ok": False, "error": "; ".join(errors)}

        # SEC-7: Validate chain depth
        errors = validate_chain_depth(chain)
        if errors:
            return {"id": msg_id, "ok": False, "error": "; ".join(errors)}

        try:
            t0 = time.time()
            output, frame_index, reader, operator_values = (
                self._render_composited_frame(message)
            )

            # SG-3 clause-2 (TIGER 1): this is the LIVE single-clip preview path
            # (frontend sends cmd:'render_frame' for every single-video-clip
            # timeline — the COMMON case; render_composite is multi-layer only). It
            # runs the full modulation stack, so a NaN lane could ship a corrupt
            # JPEG here un-gated. Apply the same gate as render_composite before
            # encode: finite → pass-through; NaN/Inf → last-known-good (or opaque
            # black) + `lane_aborted` on the reply. NaN NEVER reaches encode.
            output, lane_aborted = self._apply_output_gate(
                output, (reader.width, reader.height), path_tag="render_frame"
            )

            # Encode once for base64 transport (skip mmap — Electron uses base64)
            jpeg_bytes = encode_mjpeg(output)
            frame_b64 = base64.b64encode(jpeg_bytes).decode("ascii")
            self.last_frame_ms = round((time.time() - t0) * 1000, 2)
            response = {
                "id": msg_id,
                "ok": True,
                "frame_index": frame_index,
                "frame_data": frame_b64,
                "width": reader.width,
                "height": reader.height,
            }
            if lane_aborted is not None:
                response["lane_aborted"] = lane_aborted
            # Piggyback operator values on render response
            if operator_values is not None:
                response["operator_values"] = operator_values
            # Piggyback disabled effects on render response
            health = get_effect_health()
            if health["disabled_effects"]:
                response["disabled_effects"] = health["disabled_effects"]
            return response
        except Exception as e:
            sentry_sdk.capture_exception(e)
            logging.getLogger(__name__).error(f"Render frame handler error: {e}")
            return {"id": msg_id, "ok": False, "error": "Internal processing error"}

    def _handle_export_frame(self, message: dict, msg_id: str | None) -> dict:
        """Export the composited frame at a given time as a PNG file.

        Trust boundary (UE.6 spec):
          - path: validated via validate_upload
          - chain: validated via validate_chain_depth
          - output_path: validated via validate_output_path (must end in .png)
          - time: must be a real finite number (not bool), in [0, duration];
                  out-of-range / NaN / -1 → ok:false, no file written, server stays up.
                  NEVER silently clamps time (helper's internal end-buffer clamp is fine
                  after validation — preview does the same, parity maintained).
        """
        path = message.get("path")
        chain = message.get("chain", [])
        output_path = message.get("output_path")

        if not path:
            return {"id": msg_id, "ok": False, "error": "missing path"}
        if not output_path:
            return {"id": msg_id, "ok": False, "error": "missing output_path"}

        # SEC-5: Validate source path
        errors = validate_upload(path)
        if errors:
            return {"id": msg_id, "ok": False, "error": "; ".join(errors)}

        # SEC-7: Validate chain depth
        errors = validate_chain_depth(chain)
        if errors:
            return {"id": msg_id, "ok": False, "error": "; ".join(errors)}

        # Validate output path (checks extension allowlist, writability, no traversal)
        # .png was added to ALLOWED_OUTPUT_EXTENSIONS for this command.
        from pathlib import Path as _Path

        if not str(output_path).lower().endswith(".png"):
            return {
                "id": msg_id,
                "ok": False,
                "error": "output_path must have .png extension",
            }
        errors = validate_output_path(output_path)
        if errors:
            return {"id": msg_id, "ok": False, "error": "; ".join(errors)}

        # Validate time: must be a real finite number (not bool), within [0, duration].
        # Out-of-range / NaN / infinity → reject; no file written, server stays up.
        raw_time = message.get("time")
        if raw_time is None:
            return {"id": msg_id, "ok": False, "error": "missing time"}
        if isinstance(raw_time, bool):
            return {
                "id": msg_id,
                "ok": False,
                "error": "time must be a number, not bool",
            }
        try:
            t_secs = float(raw_time)
        except (TypeError, ValueError):
            return {"id": msg_id, "ok": False, "error": "time must be a finite number"}
        if not math.isfinite(t_secs):
            return {"id": msg_id, "ok": False, "error": "time must be a finite number"}
        if t_secs < 0:
            return {"id": msg_id, "ok": False, "error": "time must be >= 0"}

        # Check time <= duration using the reader
        try:
            reader = self._get_reader(path)
        except Exception as e:
            sentry_sdk.capture_exception(e)
            return {"id": msg_id, "ok": False, "error": "Internal processing error"}

        if reader.fps and reader.fps > 0:
            duration = reader.frame_count / reader.fps
            if t_secs > duration:
                return {
                    "id": msg_id,
                    "ok": False,
                    "error": f"time {t_secs:.3f}s exceeds clip duration {duration:.3f}s",
                }

        # Render via the same core the preview path uses (call-don't-fork per packet).
        # frame_index is NOT passed — we use time so the same time→frame mapping is used.
        render_message = dict(message)
        render_message["path"] = path
        # Remove frame_index if frontend accidentally sends both; time is canonical here.
        render_message.pop("frame_index", None)

        try:
            output, frame_index, reader, _operator_values = (
                self._render_composited_frame(render_message)
            )

            # Write PNG — use RGB (drop alpha channel, matching encode_mjpeg convention
            # so pixels match what preview shows: RGBA→RGB→JPEG in preview, RGBA→RGB→PNG here).
            img = Image.fromarray(output[:, :, :3])  # RGBA → RGB, matches encode_mjpeg
            buf = _io.BytesIO()
            img.save(buf, format="PNG")
            png_bytes = buf.getvalue()

            out_p = _Path(output_path)
            out_p.parent.mkdir(parents=False, exist_ok=True)
            out_p.write_bytes(png_bytes)

            sentry_sdk.add_breadcrumb(
                category="export",
                message="export_frame",
                data={"frame_index": frame_index, "output_path": output_path},
                level="info",
            )
            return {
                "id": msg_id,
                "ok": True,
                "frame_index": frame_index,
                "output_path": output_path,
                "width": reader.width,
                "height": reader.height,
            }
        except Exception as e:
            sentry_sdk.capture_exception(e)
            logging.getLogger(__name__).error(f"Export frame handler error: {e}")
            return {"id": msg_id, "ok": False, "error": "Internal processing error"}

    def _handle_apply_chain(self, message: dict, msg_id: str | None) -> dict:
        path = message.get("path")
        frame_index = message.get("frame_index", 0)
        chain = message.get("chain", [])
        project_seed = message.get("project_seed", 0)
        if not path:
            return {"id": msg_id, "ok": False, "error": "missing path"}

        # SEC-5: Validate path (prevents path traversal via apply_chain)
        errors = validate_upload(path)
        if errors:
            return {"id": msg_id, "ok": False, "error": "; ".join(errors)}

        # SEC-7: Validate chain depth
        errors = validate_chain_depth(chain)
        if errors:
            return {"id": msg_id, "ok": False, "error": "; ".join(errors)}

        # F-3: Bounds check on frame_index
        if frame_index < 0:
            return {
                "id": msg_id,
                "ok": False,
                "error": "frame_index must be non-negative",
            }

        try:
            reader = self._get_reader(path)

            # Clamp to last valid frame (same as render_frame)
            if (
                hasattr(reader, "frame_count")
                and reader.frame_count
                and frame_index >= reader.frame_count
            ):
                frame_index = reader.frame_count - 1

            t0 = time.time()
            frame = reader.decode_frame(frame_index)
            resolution = (reader.width, reader.height)

            # Thread per-effect state for stateful effects (see _handle_render_frame).
            states_in = self._get_render_states(path, frame_index)
            output, states_out = apply_chain(
                frame, chain, project_seed, frame_index, resolution, states_in
            )
            self._store_render_states(path, frame_index, states_out)

            shm = self._ensure_shm()
            shm.write_frame(output)
            self.last_frame_ms = round((time.time() - t0) * 1000, 2)
            response = {"id": msg_id, "ok": True, "frame_index": frame_index}
            health = get_effect_health()
            if health["disabled_effects"]:
                response["disabled_effects"] = health["disabled_effects"]
            return response
        except Exception as e:
            sentry_sdk.capture_exception(e)
            logging.getLogger(__name__).error(f"Apply chain handler error: {e}")
            return {"id": msg_id, "ok": False, "error": "Internal processing error"}

    def _get_composite_states(
        self,
        layer_signature: tuple,
        frame_index: int,
        extra_live_ids: set | None = None,
    ) -> dict[str, dict]:
        """Return per-layer state cache for composite rendering.

        Mirrors `_get_render_states` (PR #51) but for the multi-layer composite
        path. Two reset triggers, handled INDEPENDENTLY (P5a.2):

        - **Scrub (non-monotonic frame jump)** → full reset. We require the
          incoming frame to be exactly `last_frame + 1`; any other jump means
          the user scrubbed and every effect must start cold.
        - **Layer-set change (add/remove/reorder/voice steal)** → *surgical*
          per-layer-id diff. Survivors whose `layer_id` is still in the new
          signature KEEP their state dict (identity preserved); only departed
          ids are dropped. Previously this was an all-or-nothing reset, which
          meant stealing one voice cold-started every other voice on the same
          render — the exact orphan-cleanup / state-leak class this packet
          fixes (INSTRUMENTS.md §10 P1-1).

        Stateful effects (datamosh, reaction_mosh, frame_drop, etc.) need this
        for correct multi-frame preview output. Without it every preview frame
        starts cold and stateful effects silently no-op.

        Returns the layer_states dict to pass into `render_composite`. After the
        render the caller should write the returned `new_states` back via
        `_save_composite_states`.

        B5.3 (#69 — nested-state eviction fix): ``extra_live_ids`` is the set of
        NESTED composite-state keys a group layer writes when expanded
        (``collect_group_state_keys``). The pre-expansion ``layer_signature``
        carries only the TOP-LEVEL group id (``group:{group_id}``), not its nested
        descendants (``voice:{path}`` leaves / nested ``group:{path}`` keys), so
        without this union those nested keys would be evicted EVERY frame —
        resetting nested stateful effects per-frame. ``extra_live_ids`` is added to
        the eviction live-id SET only; it does NOT alter the
        signature-change detection (add/remove/reorder of the top-level layer set
        is still keyed off ``layer_signature`` exactly as before). FLAT PATH:
        ``extra_live_ids`` defaults to ``None`` → the live-id set is the bare
        ``set(layer_signature)`` → byte-identical flat eviction.
        """
        # Lazy init — keeps __init__ untouched and avoids merge conflicts with
        # PR #51 which adds parallel `_render_states` for the single-frame path.
        if not hasattr(self, "_composite_states"):
            self._composite_states: dict[str, dict] = {}
            self._composite_last_signature: tuple | None = None
            self._composite_last_frame: int | None = None

        # 1) Scrub detection: any non-monotonic frame jump cold-starts everything.
        #    First render (last_frame is None) is treated as monotonic start.
        is_monotonic = (
            self._composite_last_frame is not None
            and frame_index == self._composite_last_frame + 1
        )
        if not is_monotonic:
            self._composite_states = {}
            return self._composite_states

        # 2) Layer-set change: surgical diff. Keep survivors, drop departed ids.
        #    `layer_signature` is the ordered tuple of layer_ids; the SET of ids
        #    is what state keys must intersect with (reorder alone keeps state,
        #    which is correct — per-layer effect state is order-independent).
        if layer_signature != self._composite_last_signature:
            # B5.3 (#69): the live-id set is the top-level signature ids UNION the
            # nested descendant keys a group writes this frame. Flat path:
            # extra_live_ids is None → `live_ids == set(layer_signature)` exactly
            # (byte-identical flat eviction). Nested path: the nested voice:/group:
            # keys are RETAINED so nested stateful effects don't reset per-frame.
            live_ids = set(layer_signature)
            if extra_live_ids:
                live_ids |= extra_live_ids
            # Mutate in place so survivor state dicts keep object identity (the
            # acceptance gate asserts `is`-level survival across a steal).
            for stale_id in [k for k in self._composite_states if k not in live_ids]:
                del self._composite_states[stale_id]

        return self._composite_states

    def _save_composite_states(
        self,
        new_layer_states: dict[str, dict],
        layer_signature: tuple,
        frame_index: int,
    ) -> None:
        self._composite_states = new_layer_states
        self._composite_last_signature = layer_signature
        self._composite_last_frame = frame_index

    @staticmethod
    def _is_v2_compositing_shape(layer_info: dict) -> bool:
        """True when a VIDEO-CLIP layer carries v2-era track-level compositing.

        P2.2c (Decision D1 clean break): video-track compositing moved out of
        layer-level `opacity`/`blend_mode` fields (the removed `Track.opacity` /
        `Track.blendMode`) into a TERMINAL `composite` effect on the chain. The
        v2-era signature is a VIDEO CLIP that carries a real effect chain AND
        orphaned top-level `opacity`/`blend_mode` AND no terminal composite — that
        is a pre-v3 payload, rejected loudly (no crash, sidecar stays alive) rather
        than silently honored.

        Deliberately NARROW so legitimate v3 layers are never flagged:
          * VOICE layers are exempt (P1-B) — instrument/sampler/rack/frame-bank/
            granulator voices carry a voice MARKER (`voice_id`, or a `voice:` /
            `framebank:` `layer_id`) and legitimately use top-level opacity/blend
            with ANY chain (a rack pad's per-pad INSERT chain rides its voice layer
            with no terminal composite). The compositor reads their opacity/blend
            from the top-level fields (`:1630-1633`), so exempting them here keeps
            preview == export with zero frontend-builder changes. This is the first
            check so it wins over the video-shape branches below.
          * `layer_type != "video"` (text) is exempt — text composites in normal
            mode and forwards its fade via `clip_opacity`.
          * An EMPTY chain is exempt (P1-B) — the sampler/instrument voice path AND
            the silent-track no-clip fallback (`buildSamplerLayer`, which emits NO
            voice_id so the marker check above cannot catch it). NOTE: the v2-era
            builder ALSO emitted an empty chain for an EFFECT-LESS track carrying
            top-level opacity/blend (git 316a207~1 App.tsx:895), so this branch DOES
            admit that empty-chain v2 clip. That is safe — with no terminal composite
            the compositor's `_resolve_compositing` (compositor.py) reads the SAME
            clamped top-level opacity + `BLEND_MODES`-validated (normal-fallback) mode
            for the v2 clip and a legitimate voice alike, so the two render
            byte-identically. This is verified in the regression suite.
          * A chain ENDING in a terminal composite is exempt — it is v3-shaped even
            if a belt-and-suspenders sender also passed stray top-level fields.
        Only a marker-less video layer with a NON-EMPTY chain, top-level
        opacity/blend_mode, and no terminal composite is the v2 shape we reject.

        Trust boundary: a FORGED voice-marker on a genuine v2 clip IS exempted here,
        but that is not a vulnerability and does NOT rely on load-time rejection —
        `render_composite` arrives over IPC, where `schema.MIN_SUPPORTED_MAJOR` never
        runs. The admitted layer renders CORRECTLY via the clamped
        `_resolve_compositing` fallback (identical to the legitimate voice path), and
        the render endpoint is a 127.0.0.1 ZMQ socket gated by per-session token auth
        — that, not this shape check, is the security boundary.
        """
        if not isinstance(layer_info, dict):
            return False
        # P1-B voice-marker exemption (FIRST — wins over the video-shape checks).
        if layer_info.get("voice_id"):
            return False
        layer_id = layer_info.get("layer_id")
        if isinstance(layer_id, str) and (
            layer_id.startswith("voice:") or layer_id.startswith("framebank:")
        ):
            return False
        if layer_info.get("layer_type", "video") != "video":
            return False
        has_v2_fields = "opacity" in layer_info or "blend_mode" in layer_info
        if not has_v2_fields:
            return False
        chain = layer_info.get("chain") or []
        if not chain:
            # P1-B (reverses the original red-team HT-2 rejection): admit an
            # EMPTY-chain video layer. It is normally an instrument/sampler voice or
            # the silent-track no-clip fallback — but the v2-era builder ALSO emitted
            # chain:[] for an effect-less track (git 316a207~1 App.tsx:895), so an
            # empty-chain v2 clip is admitted too. Safe: with no terminal composite,
            # _resolve_compositing (compositor.py) applies identical clamped v2/v3
            # semantics (clamped opacity + normal-fallback blend), so it renders
            # byte-identically to the legitimate voice path. Not relying on load-time
            # rejection — render_composite is IPC-only (localhost + token auth).
            return False
        terminal = chain[-1]
        has_terminal_composite = (
            isinstance(terminal, dict) and terminal.get("effect_id") == "composite"
        )
        return not has_terminal_composite

    def _decode_composite_leaf(
        self, child: dict, resolution: tuple[int, int]
    ) -> np.ndarray:
        """B5.1 — decode ONE leaf-voice child of a composite-tree group → RGBA.

        Mirrors the video/image decode branch of `_handle_render_composite`'s
        layer loop (asset validation, INJ-3 tail clamp, B3.3 per-channel RGB
        offset) so a branch child renders byte-identically to the SAME leaf on the
        flat path. Used by `engine.composite_tree.expand_group_layer` via a
        `decode_leaf` closure. Text children are not supported inside a branch in
        this slice (branches hold sampler leaves); a text child decodes as a
        transparent frame (no-op).
        """
        layer_type = child.get("layer_type", "video")
        frame_index = max(0, int(child.get("frame_index", 0)))
        if layer_type == "text":
            # Branch children are sampler leaves in B5.1; a text child is not
            # produced by flattenRackTree. Render nothing (transparent) defensively.
            w, h = resolution
            return np.zeros((h, w, 4), dtype=np.uint8)

        asset_path = child.get("asset_path")
        if not asset_path:
            w, h = resolution
            return np.zeros((h, w, 4), dtype=np.uint8)
        # SEC-5: validate the child asset path (trust boundary — same as flat).
        errors = validate_upload(asset_path)
        if errors:
            raise ValueError("; ".join(errors))
        reader = self._get_reader(asset_path)
        # INJ-3 tail clamp (parity with the flat leaf path).
        if (
            hasattr(reader, "frame_count")
            and reader.frame_count
            and frame_index >= reader.frame_count - 2
        ):
            frame_index = max(0, reader.frame_count - 3)

        rgb_fi = child.get("rgb_frame_indices")
        if rgb_fi and isinstance(rgb_fi, dict):
            rfc_c = (
                reader.frame_count
                if hasattr(reader, "frame_count") and reader.frame_count
                else None
            )

            def _tail_clamp_zmq(idx, rfc_c=rfc_c):
                if rfc_c and idx >= rfc_c - 2:
                    return max(0, rfc_c - 3)
                return max(0, idx)

            r_idx = _tail_clamp_zmq(int(rgb_fi.get("r", frame_index)))
            g_idx = _tail_clamp_zmq(int(rgb_fi.get("g", frame_index)))
            b_idx = _tail_clamp_zmq(int(rgb_fi.get("b", frame_index)))
            vframe_r = reader.decode_frame(r_idx)
            vframe_g = reader.decode_frame(g_idx)
            vframe_b = reader.decode_frame(b_idx)
            base_frame = reader.decode_frame(frame_index)
            return np.stack(
                [
                    vframe_r[:, :, 0],
                    vframe_g[:, :, 1],
                    vframe_b[:, :, 2],
                    base_frame[:, :, 3],
                ],
                axis=2,
            )
        return reader.decode_frame(frame_index)

    @staticmethod
    def _parse_granulator_layer(
        gran_raw: dict,
    ) -> tuple[GranulatorParams | None, list[str]]:
        """Parse + validate a `performance.granulator` payload (TRUST BOUNDARY).

        Delegates to the SHARED contract source
        ``instruments.granulator_instrument.parse_granulator_layer`` so the
        preview render path (here) and the EXPORT render path
        (``engine.export``) cannot drift — both consume the identical parser.
        Kept as a thin staticmethod forwarder so existing callers/tests that
        reference ``ZMQServer._parse_granulator_layer`` are unchanged.
        """
        return parse_granulator_layer(gran_raw)

    def _handle_render_composite(self, message: dict, msg_id: str | None) -> dict:
        raw_layers = message.get("layers", [])
        raw_res = message.get("resolution", [1920, 1080])
        project_seed = message.get("project_seed", 0)

        if not isinstance(raw_layers, list):
            return {"id": msg_id, "ok": False, "error": "layers must be a list"}

        # INJ-3: backend-enforced layer cap BEFORE the decode loop (the 4-voice
        # UX limit is not a security boundary; 50×4K layers would OOM-freeze).
        layer_count_errors = validate_composite_layer_count(len(raw_layers))
        if layer_count_errors:
            return {"id": msg_id, "ok": False, "error": "; ".join(layer_count_errors)}

        # P5a.2: voice-layer cap + voice_id validation BEFORE the decode loop
        # (mirrors INJ-3 placement). Rejects > MAX_TOTAL_VOICES_PER_RENDER
        # voice-keyed layers, malformed/duplicate voice_ids. Layers without a
        # voice_id are untouched (back-compat with B1 / PR #167 frontends).
        voice_errors = validate_voice_layers(raw_layers)
        if voice_errors:
            return {"id": msg_id, "ok": False, "error": "; ".join(voice_errors)}

        # B5.1 — Sample Rack grouping (composite-tree) caps. A render carrying
        # GROUP layers (nested branches) is validated BEFORE the decode loop:
        # MAX_BRANCH_DEPTH / MAX_BRANCH_VOICES_PER_RENDER (the recursion trust
        # boundary). A render with NO group layers passes through untouched —
        # flat byte-identical (this is a no-op for the flat path).
        tree_errors = validate_composite_tree(raw_layers)
        if tree_errors:
            return {"id": msg_id, "ok": False, "error": "; ".join(tree_errors)}

        if not isinstance(raw_res, list) or len(raw_res) != 2:
            return {"id": msg_id, "ok": False, "error": "resolution must be [w, h]"}
        res_w: int = max(1, min(8192, int(raw_res[0])))
        res_h: int = max(1, min(8192, int(raw_res[1])))
        resolution: tuple[int, int] = (res_w, res_h)

        try:
            layers = []
            for layer_info in raw_layers:
                # B5.1 — Sample Rack grouping (composite-tree): a GROUP layer
                # (nested branch) is expanded AFTER the state cache is gathered
                # (its sub-frame composite + branch chain need layer_states). Stage
                # a placeholder here to preserve z-order; expand in the second pass
                # below. The group's signature contribution is its `group_id`.
                if is_group_layer(layer_info):
                    grp_id = str(layer_info.get("group_id", ""))
                    layers.append(
                        {
                            "__group__": layer_info,
                            "frame_index": int(layer_info.get("frame_index", 0)),
                            "layer_id": f"group:{grp_id}",
                        }
                    )
                    continue
                layer_type = layer_info.get("layer_type", "video")
                chain = layer_info.get("chain", [])
                # SEC-7: Validate chain depth per layer
                errors = validate_chain_depth(chain)
                if errors:
                    return {"id": msg_id, "ok": False, "error": "; ".join(errors)}

                frame_index = int(layer_info.get("frame_index", 0))
                # INJ-3: reject negative seek (mirrors _handle_render_frame:515).
                # The composite path was unguarded — reader._decode_with_seek
                # would negative-seek on a hand-edited / malformed project.
                if frame_index < 0:
                    return {
                        "id": msg_id,
                        "ok": False,
                        "error": "layer frame_index must be non-negative",
                    }

                # P2.2c (slice 3c, Decision D1 clean break): compositing now lives
                # in the TERMINAL `composite` effect of the layer's chain — the
                # compositor reads opacity/mode from there. A render request that
                # still carries v2-era layer-level `opacity`/`blend_mode` fields
                # WITHOUT a terminal composite is a pre-v3 shape and is rejected
                # LOUDLY (no crash, sidecar stays alive) — never silently honored.
                if self._is_v2_compositing_shape(layer_info):
                    return {
                        "id": msg_id,
                        "ok": False,
                        "error": V2_UNSUPPORTED_MESSAGE,
                    }

                if layer_type == "text":
                    # Text layer — render text config to RGBA frame
                    text_config = layer_info.get("text_config")
                    if not text_config:
                        continue
                    fps = float(layer_info.get("fps", 30.0))
                    frame = render_text_frame(text_config, resolution, frame_index, fps)
                else:
                    # Video/image layer — decode from asset
                    asset_path = layer_info.get("asset_path")
                    if not asset_path:
                        continue
                    # SEC-5: Validate each asset path
                    errors = validate_upload(asset_path)
                    if errors:
                        return {"id": msg_id, "ok": False, "error": "; ".join(errors)}
                    reader = self._get_reader(asset_path)
                    # INJ-3: clamp top with a 2-frame tail buffer (mirrors the
                    # single-clip path; MKV/VP9 containers often can't decode the
                    # last frames). The clamped value flows into the stored layer
                    # dict + anchor_frame below.
                    if (
                        hasattr(reader, "frame_count")
                        and reader.frame_count
                        and frame_index >= reader.frame_count - 2
                    ):
                        frame_index = max(0, reader.frame_count - 3)

                    # P5b.23 — B9: slit-scan decode for timeAxis 'y' or 'x'.
                    # When the layer carries time_axis='y', output row r samples
                    # footage frame clamp(r, 0, frame_count-1) — scanline-as-time.
                    # time_axis='x' is the column-symmetric case.
                    # Absent / 't' → fall through to legacy single-frame decode.
                    # Trust boundary: only 'y'/'x' trigger this path; any other
                    # value is treated as absent (legacy, byte-identical). The
                    # frontend validator (P1-A axis canon) rejects uppercase upstream;
                    # the backend guard here is defense-in-depth.
                    time_axis_val = layer_info.get("time_axis")
                    if time_axis_val in ("y", "x"):
                        rfc_slit = (
                            reader.frame_count
                            if hasattr(reader, "frame_count") and reader.frame_count
                            else 1
                        )
                        # Decode the anchor frame to get dimensions.
                        anchor_idx = max(0, min(rfc_slit - 1, frame_index))
                        anchor_frame = reader.decode_frame(anchor_idx)
                        h_slit, w_slit = anchor_frame.shape[:2]
                        channels_slit = (
                            anchor_frame.shape[2] if anchor_frame.ndim == 3 else 1
                        )
                        out_slit = np.empty(
                            (h_slit, w_slit, channels_slit)
                            if channels_slit > 1
                            else (h_slit, w_slit),
                            dtype=np.uint8,
                        )
                        if time_axis_val == "y":
                            dim = h_slit
                            for i in range(dim):
                                fi = max(0, min(rfc_slit - 1, i))
                                row_f = reader.decode_frame(fi)
                                if row_f.shape[1] != w_slit:
                                    row_f = (
                                        row_f[:, :w_slit]
                                        if row_f.shape[1] > w_slit
                                        else np.pad(
                                            row_f,
                                            (
                                                (0, 0),
                                                (0, w_slit - row_f.shape[1]),
                                                (0, 0),
                                            ),
                                            constant_values=0,
                                        )
                                    )
                                src_row = min(i, row_f.shape[0] - 1)
                                out_slit[i] = row_f[src_row]
                        else:  # 'x'
                            dim = w_slit
                            for j in range(dim):
                                fi = max(0, min(rfc_slit - 1, j))
                                col_f = reader.decode_frame(fi)
                                if col_f.shape[0] != h_slit:
                                    col_f = (
                                        col_f[:h_slit]
                                        if col_f.shape[0] > h_slit
                                        else np.pad(
                                            col_f,
                                            (
                                                (0, h_slit - col_f.shape[0]),
                                                (0, 0),
                                                (0, 0),
                                            ),
                                            constant_values=0,
                                        )
                                    )
                                src_col = min(j, col_f.shape[1] - 1)
                                out_slit[:, j] = col_f[:, src_col]
                        frame = out_slit
                    # B3.3 — per-channel RGB offset (chromatic time-displacement).
                    # When the layer carries rgb_frame_indices, decode a frame per
                    # channel and combine them. Absent → single decode (B3.2 parity).
                    elif (rgb_fi := layer_info.get("rgb_frame_indices")) and isinstance(
                        rgb_fi, dict
                    ):
                        rfc_c = (
                            reader.frame_count
                            if hasattr(reader, "frame_count") and reader.frame_count
                            else None
                        )

                        def _tail_clamp_zmq(idx, rfc_c=rfc_c):
                            if rfc_c and idx >= rfc_c - 2:
                                return max(0, rfc_c - 3)
                            return max(0, idx)

                        r_idx = _tail_clamp_zmq(int(rgb_fi.get("r", frame_index)))
                        g_idx = _tail_clamp_zmq(int(rgb_fi.get("g", frame_index)))
                        b_idx = _tail_clamp_zmq(int(rgb_fi.get("b", frame_index)))
                        vframe_r = reader.decode_frame(r_idx)
                        vframe_g = reader.decode_frame(g_idx)
                        vframe_b = reader.decode_frame(b_idx)
                        base_frame = reader.decode_frame(frame_index)
                        frame = np.stack(
                            [
                                vframe_r[:, :, 0],
                                vframe_g[:, :, 1],
                                vframe_b[:, :, 2],
                                base_frame[:, :, 3],
                            ],
                            axis=2,
                        )
                    else:
                        frame = reader.decode_frame(frame_index)

                    # Apply per-layer clip transform if present
                    layer_transform = layer_info.get("transform")
                    if layer_transform and isinstance(layer_transform, dict):
                        frame = self._apply_clip_transform(
                            frame, layer_transform, resolution
                        )

                # Stable per-layer key for state cache. P5a.2: a voice_id (when
                # present) wins — independent voices on the SAME clip must keep
                # independent stateful-effect state, so the key must be the voice
                # identity, not the shared asset path. Already validated at
                # request entry by validate_voice_layers (charset/length/dupes),
                # so any voice_id reaching here is safe to use as a cache key.
                # Fall back to asset_path for video/image, synthesized id for
                # text (back-compat: B1 / PR #167 frontends send no voice_id, so
                # this branch is byte-identical to before). Reorder/swap → new
                # signature → cache diffs (see _get_composite_states).
                voice_id = layer_info.get("voice_id")
                if voice_id is not None:
                    layer_id = f"voice:{voice_id}"
                elif layer_type == "text":
                    layer_id = f"text:{layer_info.get('text_config', {}).get('id', len(layers))}"
                else:
                    layer_id = f"asset:{layer_info.get('asset_path', '')}"

                # P2.2c (Decision D3/D4): video-clip track compositing is resolved
                # by the compositor from the TERMINAL composite in `chain`.
                # `clip_opacity` (a distinct per-clip multiplier, not track
                # compositing) is forwarded so faded clips still fade. Top-level
                # `opacity`/`blend_mode` are forwarded ONLY as the legitimate
                # fallback transport for layers with no terminal composite — sampler/
                # instrument voices and text (the v2 video-track-clip shape that
                # carries them with a real chain is rejected upstream by
                # _is_v2_compositing_shape, so anything reaching here is legitimate).
                # MK.3 — composite-preview mask parity. Resolve THIS layer's
                # mask_stack (per-clip mattes) against its post-transform frame and
                # route it through the SAME shared helper render_frame uses, so a
                # masked device / chain renders identically once a 2nd layer exists
                # (was: composite dropped all masks → masks blinked by layer count).
                # MK.8 keying-as-performance is NOT applied here: the composite path
                # pre-modulates chains on the frontend and carries no per-frame
                # operator_values, so mask-node operator modulation is single-clip-
                # only for now (deferred — no operator_values on this path).
                mask_frame_hw = (frame.shape[0], frame.shape[1])
                mask_ctx = FrameCtx(
                    frame=frame, frame_index=frame_index, clip_id=str(layer_id)
                )
                chain, layer_chain_mask = apply_masks_to_chain(
                    chain,
                    layer_info.get("mask_stack"),
                    mask_ctx,
                    mask_frame_hw,
                    chain_mask_ref=layer_info.get("chain_mask"),
                )

                layer_dict = {
                    "frame": frame,
                    "chain": chain,
                    "clip_opacity": layer_info.get("clip_opacity", 1.0),
                    "frame_index": frame_index,
                    "layer_id": layer_id,
                }
                if layer_chain_mask is not None:
                    layer_dict["chain_mask"] = layer_chain_mask
                if "opacity" in layer_info:
                    layer_dict["opacity"] = layer_info["opacity"]
                if "blend_mode" in layer_info:
                    layer_dict["blend_mode"] = layer_info["blend_mode"]
                layers.append(layer_dict)

            # B6.2 — Frame-Bank (wavetable) PREVIEW render. EXACT mirror of the
            # EXPORT path (_composite_export_frame): when the render request carries
            # `performance.frameBanks`, each declared bank's CLAMPED position
            # selects/interpolates slot frames decoded through a per-bank byte-
            # budget DecodedFrameCache (the OOM guard + SG-8 pressure-degrade), and
            # ONE voice layer per bank is appended — so preview == export (same
            # resolved frame, same compositor path). The cache is PERSISTED on the
            # server (`self._frame_bank_caches`, keyed by bank id) across preview
            # frames, exactly as export persists `frame_bank_caches` across output
            # frames (a continuous position-scan reuses decoded slots). Absent /
            # empty `frameBanks` → no layers appended → preview byte-identical
            # (regression-safe). Caps are enforced BEFORE decode (validate_frame_bank).
            performance = message.get("performance")
            frame_banks = (performance or {}).get("frameBanks") or {}
            # B6.2 NO-LEAK: drop caches for banks no longer present in this render
            # (a removed frameBank must not retain its decoded RAM). Runs OUTSIDE
            # the `if frame_banks:` guard so that emptying the bank set (last bank
            # removed → `frameBanks` absent/empty) ALSO evicts the now-stale caches
            # — otherwise a deleted bank's decoded RAM would leak indefinitely.
            if hasattr(self, "_frame_bank_caches"):
                live_fb_ids = set(frame_banks.keys())
                for stale_id in [
                    k for k in self._frame_bank_caches if k not in live_fb_ids
                ]:
                    del self._frame_bank_caches[stale_id]
            if frame_banks:
                fb_assets = (performance or {}).get("assets") or {}
                if not hasattr(self, "_frame_bank_caches"):
                    self._frame_bank_caches: dict[str, DecodedFrameCache] = {}
                fb_caches = self._frame_bank_caches

                fb_anchor_frame = min(
                    (int(layer.get("frame_index", 0)) for layer in layers),
                    default=0,
                )

                def _fb_decode(clip_id: str, slot_frame_index: int) -> np.ndarray:
                    # Resolve clipId → asset path via the SAME assets table the
                    # export path uses, decode through the shared reader cache.
                    fb_asset = fb_assets.get(clip_id)
                    if not fb_asset or not fb_asset.get("path"):
                        raise ValueError(
                            f"frameBank slot clipId {clip_id!r} has no asset path"
                        )
                    # SEC-5: validate each slot asset path (mirror video layers).
                    path_errors = validate_upload(fb_asset["path"])
                    if path_errors:
                        raise ValueError("; ".join(path_errors))
                    reader = self._get_reader(fb_asset["path"])
                    rfc = getattr(reader, "frame_count", None)
                    idx = int(slot_frame_index)
                    if rfc:
                        # Clamp the slot frameIndex into the clip's real range (a
                        # stale project may reference a frame past a shorter clip).
                        idx = max(0, min(rfc - 1, idx))
                    return reader.decode_frame(idx)

                for fb_id, raw_fb in frame_banks.items():
                    # ENFORCE-BEFORE-DECODE: validate + sanitize (clamp position /
                    # byteBudget, reject over-cap slots / bad refs) BEFORE decode.
                    sanitized, fb_errors = validate_frame_bank(raw_fb)
                    if fb_errors or sanitized is None:
                        return {
                            "id": msg_id,
                            "ok": False,
                            "error": "; ".join(fb_errors) or "invalid frameBank",
                        }
                    # One byte-budget cache per bank id, sized to its CLAMPED
                    # budget, persisted across preview frames (position-scan reuse).
                    cache = fb_caches.get(fb_id)
                    if (
                        cache is None
                        or getattr(cache, "byte_budget", None)
                        != sanitized["byteBudget"]
                    ):
                        cache = DecodedFrameCache(sanitized["byteBudget"])
                        fb_caches[fb_id] = cache
                    # voice_id keys per-voice compositor state; encode colon-free
                    # and bounded so a hostile fb_id can't escape the namespace
                    # (mirror export's encoding exactly so preview == export).
                    vid = f"framebank_{fb_id}"[:128]
                    vid = "".join(c if c.isalnum() or c in "_-" else "_" for c in vid)
                    layers.append(
                        resolve_frame_bank_layer(
                            sanitized,
                            sanitized["position"],
                            cache,
                            _fb_decode,
                            frame_index=fb_anchor_frame,
                            voice_id=vid,
                            opacity=sanitized.get("opacity", 1.0),
                            blend_mode=sanitized.get("blendMode", "normal"),
                        )
                    )

            # --- P5b.17 — B8 Granulator render arm -----------------------------
            # When the render carries `performance.granulator`, the granulator
            # SAMPLES an existing decoded layer (the first video/image frame in
            # `layers`, or a transparent frame if none), produces a seeded grain
            # cloud (P5b.16 engine), composites the grains into ONE RGBA layer,
            # and appends it as a single voice layer (mirrors the frameBank arm:
            # validate-before-decode, ONE layer out, voice-keyed). Absent /
            # malformed-empty `granulator` → no layer appended → byte-identical
            # (regression-safe). ROLLBACK: this whole `if gran_raw:` block is the
            # named dispatch-arm hunk — delete it to revert the granulator render.
            gran_raw = (performance or {}).get("granulator")
            if gran_raw:
                gran_params, gran_errors = self._parse_granulator_layer(gran_raw)
                # TRUST BOUNDARY: reject malformed params BEFORE any decode/sample
                # (every numeric clamped + finite-guarded; bad shape → loud reject,
                # never a silent default that masks a corrupt project).
                if gran_errors:
                    return {
                        "id": msg_id,
                        "ok": False,
                        "error": "; ".join(gran_errors),
                    }

                # Render-budget guard (TIGER 3): the stateful BudgetController
                # advances one frame from the PREVIOUS grain-render eval time. It
                # carries a sticky degrade floor with a recovery deadband (trip at
                # >16ms, recover only after sustained <12ms) so density CONVERGES
                # instead of strobing full↔half. SG-8 memory pressure is applied
                # multiplicatively inside step().
                density = self._granulator_budget.step(
                    gran_params.density,
                    last_frame_ms=self._granulator_last_frame_ms,
                )
                gran_params.density = density

                # Source = first decoded video/image/text frame already in
                # `layers` (the layer the granulator operates on). None → a
                # transparent source (grains sample nothing → transparent layer;
                # still ONE layer out).
                gran_source = None
                for _layer in layers:
                    _f = _layer.get("frame")
                    if isinstance(_f, np.ndarray) and _f.size:
                        gran_source = _f
                        break
                if gran_source is None:
                    gran_source = np.zeros(
                        (resolution[1], resolution[0], 4), dtype=np.uint8
                    )

                gran_anchor = min(
                    (int(layer.get("frame_index", 0)) for layer in layers),
                    default=0,
                )
                gran_seed = int(project_seed) if isinstance(project_seed, int) else 0
                gran_inst_id = str(gran_raw.get("instrument_id", "granulator"))[:128]

                # P5b.18 — SELECTION consumption on the LIVE render path. Compute
                # per-grain T-weights for the active rule and bias the grain cloud
                # by them. `random` → seeded weights, strength 0 → byte-identical to
                # the pre-P5b.18 engine (no behavior change for existing projects).
                # `onset` → consume the audio_follower onset trigger (from optional
                # PCM in the payload) so a transient pulls grains toward the onset;
                # the onset strength is the bias amount. latentSimilarity/scenePayload
                # are already rejected at the parser (never reach here).
                sel_weights: list[float] | None = None
                sel_strength = 0.0
                try:
                    if gran_params.selection == "onset":
                        pcm_raw = gran_raw.get("pcm")
                        pcm_arr = None
                        if isinstance(pcm_raw, list) and pcm_raw:
                            pcm_arr = np.asarray(pcm_raw, dtype=np.float32)
                            # Finite-guard PCM at the trust boundary (a hostile
                            # payload could carry NaN/Inf samples).
                            if not np.all(np.isfinite(pcm_arr)):
                                pcm_arr = None
                        sr_raw = gran_raw.get("sample_rate", 48000)
                        sample_rate = (
                            int(sr_raw)
                            if isinstance(sr_raw, (int, float))
                            and math.isfinite(float(sr_raw))
                            and 0 < sr_raw <= 384000
                            else 48000
                        )
                        onset_params = gran_raw.get("onset_params")
                        if not isinstance(onset_params, dict):
                            onset_params = {}
                        # Compute onset FFT ONCE per frame (audit #12: dedup).
                        # evaluate_audio returns (strength, state_out); we
                        # thread state_out forward so spectral-flux has its
                        # previous spectrum.  The bias weights are then derived
                        # from that single strength value using the same formula
                        # as select_onset_grain_weights — no second FFT call.
                        from modulation.audio_follower import evaluate_audio

                        _onset_strength_raw, self._granulator_onset_state = (
                            evaluate_audio(
                                pcm_arr,
                                "onset",
                                onset_params,
                                sample_rate,
                                self._granulator_onset_state,
                            )
                        )
                        sel_strength = (
                            max(0.0, min(1.0, float(_onset_strength_raw)))
                            if math.isfinite(_onset_strength_raw)
                            else 0.0
                        )
                        # Build per-grain T-weights from the single onset strength
                        # (mirrors select_onset_grain_weights without a second FFT).
                        _base_weights = select_random_grain_weights(
                            gran_seed,
                            gran_inst_id,
                            gran_anchor,
                            gran_params.density,
                        )
                        sel_weights = [
                            max(0.0, min(1.0, w + (1.0 - w) * sel_strength))
                            for w in _base_weights
                        ]
                    elif gran_params.selection == "random":
                        # Seeded weights computed but strength 0 → no T-bias, so the
                        # descriptor set is byte-identical to the pre-P5b.18 engine.
                        sel_weights, _ = select_grain_weights(
                            "random",
                            gran_seed,
                            gran_inst_id,
                            gran_anchor,
                            gran_params.density,
                        )
                        sel_strength = 0.0
                except Exception:  # noqa: BLE001 — selection is best-effort bias
                    # A selection-compute failure must NEVER crash the render — fall
                    # back to the unbiased seeded cloud (random behavior).
                    sel_weights = None
                    sel_strength = 0.0

                cloud = grain_cloud(
                    gran_seed,
                    gran_inst_id,
                    gran_anchor,
                    gran_params,
                    selection_weights=sel_weights,
                    selection_strength=sel_strength,
                )
                _gran_t0 = time.time()
                # P5b.28 — dispatch CPU/GPU. PREVIEW path → is_export=False, so a
                # 'gpu' render_path is honored (MLX); on ANY GPU error the
                # dispatcher falls back to the CPU render_grain_layer (never
                # crashes the render). Export NEVER reaches here (export composites
                # via engine/compositor.render_composite on the CPU path), and the
                # dispatcher additionally coerces 'gpu'→'cpu' under is_export.
                grain_frame = render_grain_layer_dispatch(
                    gran_source,
                    cloud,
                    resolution=resolution,
                    render_path=gran_params.render_path,
                    is_export=False,
                    instance_id=gran_inst_id,
                )
                # Record THIS frame's grain-render eval time; the next frame's
                # effective_density() reads it and degrades density if it blew
                # the 16ms budget (per-frame back-pressure).
                self._granulator_last_frame_ms = (time.time() - _gran_t0) * 1000.0

                gran_op = gran_raw.get("opacity", 1.0)
                if not isinstance(gran_op, (int, float)) or gran_op != gran_op:
                    gran_op = 1.0
                gran_op = max(0.0, min(1.0, float(gran_op)))
                gran_blend = gran_raw.get("blend_mode", "normal")
                if not isinstance(gran_blend, str):
                    gran_blend = "normal"
                gran_vid = "".join(
                    c if c.isalnum() or c in "_-" else "_"
                    for c in f"gran_{gran_inst_id}"[:128]
                )
                layers.append(
                    {
                        "frame": grain_frame,
                        "chain": [],
                        "frame_index": gran_anchor,
                        "voice_id": gran_vid,
                        "layer_id": f"granulator:{gran_vid}",
                        "opacity": gran_op,
                        "blend_mode": gran_blend,
                    }
                )
            # -------------------------------------------------------------------

            # Build a layer signature from ordered layer_ids — invalidates cache
            # on add/remove/reorder. Use the smallest frame_index across layers
            # as the monotonic-iteration anchor (composite renders per project,
            # not per layer, so they all advance together in normal playback).
            layer_signature = tuple(layer.get("layer_id", "") for layer in layers)
            anchor_frame = min(
                (layer.get("frame_index", 0) for layer in layers), default=0
            )
            # B5.3 (#69 — nested-state eviction fix): collect the NESTED descendant
            # state keys every staged group will write when expanded
            # (`voice:{path}` leaves + nested `group:{path}` branch-chain keys).
            # These are NOT in `layer_signature` (built pre-expansion from
            # top-level ids only), so the eviction live-id set must be augmented
            # with them — otherwise a group's nested state is dropped every frame
            # and nested stateful effects reset per-frame. Flat render → no
            # `__group__` layers → empty set → byte-identical flat eviction.
            extra_live_ids: set[str] = set()
            for layer in layers:
                if "__group__" in layer:
                    extra_live_ids |= collect_group_state_keys(layer["__group__"])
            layer_states = self._get_composite_states(
                layer_signature,
                anchor_frame,
                extra_live_ids=extra_live_ids or None,
            )

            # B5.1 — second pass: expand any staged GROUP placeholders into
            # frame-bearing layers. Each group recursively composites its children
            # into a sub-frame (the SAME render_composite), applies the branch
            # chain to that sub-frame, and emits ONE layer the parent composite
            # blends upward. State is threaded through layer_states/group_new_states
            # keyed by the PATH-FROM-ROOT ids so sibling branches don't alias.
            # A flat render has no placeholders → this loop is a no-op.
            group_new_states: dict[str, dict] = {}
            if any("__group__" in layer for layer in layers):

                def _decode_leaf(child: dict) -> np.ndarray:
                    return self._decode_composite_leaf(child, resolution)

                expanded: list[dict] = []
                for layer in layers:
                    if "__group__" in layer:
                        expanded.append(
                            expand_group_layer(
                                layer["__group__"],
                                decode_leaf=_decode_leaf,
                                resolution=resolution,
                                project_seed=project_seed,
                                frame_index=layer["frame_index"],
                                layer_states=layer_states,
                                new_states=group_new_states,
                            )
                        )
                    else:
                        expanded.append(layer)
                layers = expanded

            t0 = time.time()
            output, new_layer_states = render_composite(
                layers, resolution, project_seed, layer_states=layer_states
            )
            # Fold the sub-frame / branch-chain states into the saved cache so
            # nested stateful effects persist across frames (B5.1).
            if group_new_states:
                new_layer_states = {**new_layer_states, **group_new_states}
            self._save_composite_states(new_layer_states, layer_signature, anchor_frame)

            # --- SG-3 clause-2 (P5b.4) render-output NaN/Inf gate -------------
            # CHOKE POINT: the single seam where the composed frame exits toward
            # flatten/encode. Shared `_apply_output_gate` does ONE np.isfinite
            # reduction: finite → pure pass-through (no byte change to the happy
            # path); NaN/Inf → last-known-good of the same shape (or opaque black)
            # + `lane_aborted` on THIS REQ/REP reply. NaN frames NEVER reach encode.
            output, lane_aborted = self._apply_output_gate(
                output, resolution, path_tag="render_composite"
            )
            # -----------------------------------------------------------------

            # MK.2 (SPEC §7-2): the composite carries meaningful per-pixel alpha
            # now (keyed-out / transparent regions). Flatten onto opaque surface-0
            # (#0B0B10) before encode so encode_mjpeg's alpha-truncation does not
            # leak the RGB that rode under alpha=0 — this is what makes
            # fx.chroma_key / fx.luma_key visible in preview (GT-3). Export
            # (MK.10) is NOT flattened; only this preview boundary is.
            flattened = flatten_rgba(output)
            jpeg_bytes = encode_mjpeg(flattened)
            frame_b64 = base64.b64encode(jpeg_bytes).decode("ascii")
            self.last_frame_ms = round((time.time() - t0) * 1000, 2)

            response = {
                "id": msg_id,
                "ok": True,
                "frame_data": frame_b64,
                "width": resolution[0],
                "height": resolution[1],
            }
            # SG-3 clause-2: ride the abort info on the REQ/REP reply when fired.
            if lane_aborted is not None:
                response["lane_aborted"] = lane_aborted
            return response
        except Exception as e:
            sentry_sdk.capture_exception(e)
            logging.getLogger(__name__).error(f"Render composite handler error: {e}")
            return {"id": msg_id, "ok": False, "error": "Internal processing error"}

    def _handle_audio_decode(self, message: dict, msg_id: str | None) -> dict:
        path = message.get("path")
        if not path:
            return {"id": msg_id, "ok": False, "error": "missing path"}

        # SEC-5: Validate path + resolve realpath (TOCTOU defense)
        resolved, errors = resolve_safe_path(path)
        if errors or resolved is None:
            return {"id": msg_id, "ok": False, "error": "; ".join(errors)}
        safe_path = str(resolved)

        start_s = clamp_finite(float(message.get("start_s", 0.0)), 0.0, 86400.0, 0.0)
        duration_s = message.get("duration_s")
        if duration_s is not None:
            duration_s = clamp_finite(float(duration_s), 0.0, 86400.0, 1.0)

        try:
            result = decode_audio(safe_path, start_s=start_s, duration_s=duration_s)
            if not result["ok"]:
                return {"id": msg_id, "ok": False, "error": result["error"]}

            samples = result["samples"]
            return {
                "id": msg_id,
                "ok": True,
                "sample_rate": result["sample_rate"],
                "channels": result["channels"],
                "duration_s": result["duration_s"],
                "num_samples": samples.shape[0],
                "peak": float(np.abs(samples).max()) if samples.size > 0 else 0.0,
            }
        except Exception as e:
            sentry_sdk.capture_exception(e)
            logging.getLogger(__name__).error(f"Audio decode handler error: {e}")
            return {"id": msg_id, "ok": False, "error": "Internal processing error"}

    def _handle_waveform(self, message: dict, msg_id: str | None) -> dict:
        path = message.get("path")
        num_bins = max(1, min(int(message.get("num_bins", 800)), 4096))
        if not path:
            return {"id": msg_id, "ok": False, "error": "missing path"}

        # SEC-5: Validate path + resolve realpath (TOCTOU defense)
        resolved, errors = resolve_safe_path(path)
        if errors or resolved is None:
            return {"id": msg_id, "ok": False, "error": "; ".join(errors)}
        safe_path = str(resolved)

        # Check cache (keyed by resolved realpath to avoid dup entries for symlink paths)
        cache_key = (safe_path, num_bins)
        if cache_key in self._waveform_cache:
            return {
                "id": msg_id,
                "ok": True,
                "peaks": self._waveform_cache[cache_key],
                "num_bins": num_bins,
                "cached": True,
            }

        try:
            result = decode_audio(safe_path)
            if not result["ok"]:
                return {"id": msg_id, "ok": False, "error": result["error"]}

            samples = result["samples"]
            peaks = compute_peaks(samples, num_bins=num_bins)

            # Serialize peaks to nested list for JSON transport
            peaks_list = peaks.tolist()
            self._waveform_cache[cache_key] = peaks_list
            # LRU eviction
            while len(self._waveform_cache) > self._max_waveform_cache:
                self._waveform_cache.popitem(last=False)

            return {
                "id": msg_id,
                "ok": True,
                "peaks": peaks_list,
                "num_bins": num_bins,
                "channels": result["channels"],
                "duration_s": result["duration_s"],
                "cached": False,
            }
        except Exception as e:
            sentry_sdk.capture_exception(e)
            logging.getLogger(__name__).error(f"Waveform handler error: {e}")
            return {"id": msg_id, "ok": False, "error": "Internal processing error"}

    def _handle_audio_load(self, message: dict, msg_id: str | None) -> dict:
        path = message.get("path")
        if not path:
            return {"id": msg_id, "ok": False, "error": "missing path"}

        # Resolve realpath post-validation (TOCTOU defense) + magic-byte check.
        resolved, errors = resolve_safe_path(path)
        if errors or resolved is None:
            return {"id": msg_id, "ok": False, "error": "; ".join(errors)}

        safe_path = str(resolved)
        if not is_audio_magic(safe_path):
            return {
                "id": msg_id,
                "ok": False,
                "error": "File does not appear to be audio (magic-byte mismatch)",
            }

        try:
            result = self.audio_player.load(safe_path)
            result["id"] = msg_id
            return result
        except Exception as e:
            sentry_sdk.capture_exception(e)
            logging.getLogger(__name__).error(f"Audio load handler error: {e}")
            return {"id": msg_id, "ok": False, "error": "Internal processing error"}

    def _handle_audio_play(self, msg_id: str | None) -> dict:
        try:
            ok = self.audio_player.play()
            if not ok:
                return {"id": msg_id, "ok": False, "error": "no audio loaded"}
            return {"id": msg_id, "ok": True, "is_playing": True}
        except Exception as e:
            sentry_sdk.capture_exception(e)
            logging.getLogger(__name__).error("Audio play error: %s", type(e).__name__)
            return {"id": msg_id, "ok": False, "error": "Internal processing error"}

    def _handle_audio_pause(self, msg_id: str | None) -> dict:
        try:
            self.audio_player.pause()
            return {"id": msg_id, "ok": True, "is_playing": False}
        except Exception as e:
            sentry_sdk.capture_exception(e)
            logging.getLogger(__name__).error("Audio pause error: %s", type(e).__name__)
            return {"id": msg_id, "ok": False, "error": "Internal processing error"}

    def _handle_audio_seek(self, message: dict, msg_id: str | None) -> dict:
        try:
            time_s = clamp_finite(float(message.get("time", 0.0)), 0.0, 86400.0, 0.0)
            ok = self.audio_player.seek(time_s)
            if not ok:
                return {"id": msg_id, "ok": False, "error": "no audio loaded"}
            return {
                "id": msg_id,
                "ok": True,
                "position_s": self.audio_player.position_seconds,
            }
        except Exception as e:
            sentry_sdk.capture_exception(e)
            logging.getLogger(__name__).error("Audio seek error: %s", type(e).__name__)
            return {"id": msg_id, "ok": False, "error": "Internal processing error"}

    def _handle_audio_volume(self, message: dict, msg_id: str | None) -> dict:
        try:
            volume = clamp_finite(float(message.get("volume", 1.0)), 0.0, 1.0, 1.0)
            self.audio_player.set_volume(volume)
            return {"id": msg_id, "ok": True, "volume": self.audio_player.volume}
        except Exception as e:
            sentry_sdk.capture_exception(e)
            logging.getLogger(__name__).error(
                "Audio volume error: %s", type(e).__name__
            )
            return {"id": msg_id, "ok": False, "error": "Internal processing error"}

    def _handle_audio_position(self, msg_id: str | None) -> dict:
        try:
            return {
                "id": msg_id,
                "ok": True,
                "position_s": self.audio_player.position_seconds,
                "position_samples": self.audio_player.position,
                "duration_s": self.audio_player.duration_seconds,
                "is_playing": self.audio_player.is_playing,
                "volume": self.audio_player.volume,
            }
        except Exception as e:
            sentry_sdk.capture_exception(e)
            logging.getLogger(__name__).error(
                "Audio position error: %s", type(e).__name__
            )
            return {"id": msg_id, "ok": False, "error": "Internal processing error"}

    def _handle_audio_stop(self, msg_id: str | None) -> dict:
        try:
            self.audio_player.stop()
            return {"id": msg_id, "ok": True}
        except Exception as e:
            sentry_sdk.capture_exception(e)
            logging.getLogger(__name__).error("Audio stop error: %s", type(e).__name__)
            return {"id": msg_id, "ok": False, "error": "Internal processing error"}

    def _handle_audio_meter(self, message: dict, msg_id: str | None) -> dict:
        """F-0516-6 phase 2: meter reading for current playback position.

        Returns {rms_db, peak_db, clipped} computed from a 1024-sample
        window centered on current position. Caller polls at ~30Hz
        from the frontend GainMeter component.

        Returns floor reading (silence) if audio is not loaded or not
        playing — callers can render the bar at minimum without special-
        casing the no-audio state.
        """
        from audio.meter import METER_FLOOR_DB, compute_meter

        try:
            if not self.audio_player.loaded or self.audio_player._samples is None:
                return {
                    "id": msg_id,
                    "ok": True,
                    "rms_db": METER_FLOOR_DB,
                    "peak_db": METER_FLOOR_DB,
                    "clipped": False,
                }

            # Take a small window centered on the current playback position.
            samples = self.audio_player._samples
            sample_rate = self.audio_player._sample_rate or 48000
            pos = self.audio_player.position  # samples
            window = 1024  # ~21ms at 48kHz — fast meter response

            start = max(0, pos - window // 2)
            end = min(samples.shape[0], start + window)
            if end <= start:
                return {
                    "id": msg_id,
                    "ok": True,
                    "rms_db": METER_FLOOR_DB,
                    "peak_db": METER_FLOOR_DB,
                    "clipped": False,
                }

            chunk = samples[start:end]
            # Multichannel → meter aggregates across channels (in compute_meter).
            reading = compute_meter(chunk)
            return {
                "id": msg_id,
                "ok": True,
                "rms_db": reading["rms_db"],
                "peak_db": reading["peak_db"],
                "clipped": reading["clipped"],
            }
        except Exception as e:
            sentry_sdk.capture_exception(e)
            logging.getLogger(__name__).error("Audio meter error: %s", type(e).__name__)
            return {"id": msg_id, "ok": False, "error": "Internal processing error"}

    # --- ProjectClock handlers (flag ON path) ---

    def _handle_project_clock_play(self, msg_id: str | None) -> dict:
        try:
            self.project_clock.play()
            # When the flag is on, start the PortAudio stream so the mixer is
            # actually heard. Failure to open the device is non-fatal — the
            # clock still advances silently.
            mixer_started = False
            if self._experimental_audio_tracks:
                mixer_started = self.mixer_player.start()
            return {
                "id": msg_id,
                "ok": True,
                "is_playing": self.project_clock.is_playing,
                "position_s": self.project_clock.position_seconds,
                "mixer_started": mixer_started,
            }
        except Exception as e:
            sentry_sdk.capture_exception(e)
            logging.getLogger(__name__).error(
                "Project clock play error: %s", type(e).__name__
            )
            return {"id": msg_id, "ok": False, "error": "Internal processing error"}

    def _handle_project_clock_pause(self, msg_id: str | None) -> dict:
        try:
            self.project_clock.pause()
            # Stop the PortAudio stream to avoid burning CPU on silent output.
            if self._experimental_audio_tracks:
                self.mixer_player.stop()
            return {
                "id": msg_id,
                "ok": True,
                "is_playing": self.project_clock.is_playing,
                "position_s": self.project_clock.position_seconds,
            }
        except Exception as e:
            sentry_sdk.capture_exception(e)
            logging.getLogger(__name__).error(
                "Project clock pause error: %s", type(e).__name__
            )
            return {"id": msg_id, "ok": False, "error": "Internal processing error"}

    def _handle_project_clock_seek(self, message: dict, msg_id: str | None) -> dict:
        try:
            time_s = clamp_finite(float(message.get("time", 0.0)), 0.0, 86400.0, 0.0)
            ok = self.project_clock.seek(time_s)
            return {
                "id": msg_id,
                "ok": bool(ok),
                "position_s": self.project_clock.position_seconds,
            }
        except (TypeError, ValueError):
            return {"id": msg_id, "ok": False, "error": "invalid time"}
        except Exception as e:
            sentry_sdk.capture_exception(e)
            logging.getLogger(__name__).error(
                "Project clock seek error: %s", type(e).__name__
            )
            return {"id": msg_id, "ok": False, "error": "Internal processing error"}

    def _handle_project_clock_set_duration(
        self, message: dict, msg_id: str | None
    ) -> dict:
        try:
            dur = clamp_finite(float(message.get("duration_s", 0.0)), 0.0, 86400.0, 0.0)
            self.project_clock.set_duration(dur)
            return {
                "id": msg_id,
                "ok": True,
                "duration_s": self.project_clock.duration_seconds,
            }
        except (TypeError, ValueError):
            return {"id": msg_id, "ok": False, "error": "invalid duration"}
        except Exception as e:
            sentry_sdk.capture_exception(e)
            logging.getLogger(__name__).error(
                "Project clock set_duration error: %s", type(e).__name__
            )
            return {"id": msg_id, "ok": False, "error": "Internal processing error"}

    def _handle_audio_tracks_set(self, message: dict, msg_id: str | None) -> dict:
        """Replace mixer state with the given tracks. Each clip path is
        resolve_safe_path-validated before the mixer sees it to defend against
        TOCTOU / symlink escape; failed paths are dropped silently with a log."""
        try:
            tracks_raw = message.get("tracks", [])
            if not isinstance(tracks_raw, list):
                return {"id": msg_id, "ok": False, "error": "tracks must be a list"}
            # Resolve every clip path through the security guard; strip invalid ones.
            sanitized: list[dict] = []
            dropped = 0
            for t in tracks_raw:
                if not isinstance(t, dict):
                    continue
                t_copy = dict(t)
                clips = t_copy.get("audioClips") or []
                if not isinstance(clips, list):
                    continue
                safe_clips: list[dict] = []
                for c in clips:
                    if not isinstance(c, dict):
                        continue
                    path = c.get("path")
                    if not isinstance(path, str):
                        continue
                    resolved, errors = resolve_safe_path(path)
                    if errors or resolved is None:
                        dropped += 1
                        logging.getLogger(__name__).warning(
                            "audio_tracks_set: dropping clip with bad path %s: %s",
                            path,
                            errors,
                        )
                        continue
                    # Replace the untrusted user path with the validated realpath
                    c_copy = dict(c)
                    c_copy["path"] = str(resolved)
                    safe_clips.append(c_copy)
                t_copy["audioClips"] = safe_clips
                sanitized.append(t_copy)
            self.audio_mixer.set_tracks(sanitized)
            return {
                "id": msg_id,
                "ok": True,
                "num_tracks": len(sanitized),
                "dropped_clips": dropped,
                "flag_enabled": self._experimental_audio_tracks,
            }
        except Exception as e:
            sentry_sdk.capture_exception(e)
            logging.getLogger(__name__).error(
                "audio_tracks_set error: %s", type(e).__name__
            )
            return {"id": msg_id, "ok": False, "error": "Internal processing error"}

    def _handle_audio_tracks_clear(self, msg_id: str | None) -> dict:
        try:
            self.audio_mixer.clear()
            return {"id": msg_id, "ok": True}
        except Exception as e:
            sentry_sdk.capture_exception(e)
            logging.getLogger(__name__).error(
                "audio_tracks_clear error: %s", type(e).__name__
            )
            return {"id": msg_id, "ok": False, "error": "Internal processing error"}

    def _handle_project_clock_state(self, msg_id: str | None) -> dict:
        try:
            return {
                "id": msg_id,
                "ok": True,
                "is_playing": self.project_clock.is_playing,
                "position_s": round(self.project_clock.position_seconds, 6),
                "duration_s": round(self.project_clock.duration_seconds, 6),
                "volume": self.project_clock.volume,
                "flag_enabled": self._experimental_audio_tracks,
            }
        except Exception as e:
            sentry_sdk.capture_exception(e)
            logging.getLogger(__name__).error(
                "Project clock state error: %s", type(e).__name__
            )
            return {"id": msg_id, "ok": False, "error": "Internal processing error"}

    def _handle_clock_sync(self, msg_id: str | None) -> dict:
        try:
            state = self.av_clock.sync_state()
            state["id"] = msg_id
            state["ok"] = True
            return state
        except Exception as e:
            sentry_sdk.capture_exception(e)
            logging.getLogger(__name__).error("Clock sync error: %s", type(e).__name__)
            return {"id": msg_id, "ok": False, "error": "Internal processing error"}

    def _handle_clock_set_fps(self, message: dict, msg_id: str | None) -> dict:
        try:
            fps = message.get("fps")
            if fps is None:
                return {"id": msg_id, "ok": False, "error": "missing fps"}
            fps = guard_positive(float(fps), "fps")
            self.av_clock.set_fps(fps)
            return {"id": msg_id, "ok": True, "fps": self.av_clock.fps}
        except ValueError as e:
            return {"id": msg_id, "ok": False, "error": str(e)}
        except Exception as e:
            sentry_sdk.capture_exception(e)
            logging.getLogger(__name__).error(
                "Clock set fps error: %s", type(e).__name__
            )
            return {"id": msg_id, "ok": False, "error": "Internal processing error"}

    @staticmethod
    def _validate_export_settings(settings: dict) -> list[str]:
        """Validate multi-codec export settings. Returns list of error strings (empty = valid)."""
        errors: list[str] = []

        export_type = settings.get("export_type", "video")
        if export_type not in ("video", "gif", "image_sequence"):
            errors.append(
                f"invalid export_type {export_type!r}; must be video, gif, or image_sequence"
            )

        codec = settings.get("codec", "h264")
        if codec not in CODEC_REGISTRY:
            errors.append(
                f"unknown codec {codec!r}; available: {', '.join(sorted(CODEC_REGISTRY))}"
            )

        resolution = settings.get("resolution", "source")
        valid_resolutions = ("source", "720p", "1080p", "4k", "custom")
        if resolution not in valid_resolutions:
            errors.append(
                f"invalid resolution {resolution!r}; must be one of {valid_resolutions}"
            )

        if resolution == "custom":
            cw = settings.get("custom_width")
            ch = settings.get("custom_height")
            if not isinstance(cw, int) or cw <= 0:
                errors.append(
                    "custom_width must be a positive integer when resolution is 'custom'"
                )
            if isinstance(cw, int) and cw > 7680:
                errors.append("custom_width must not exceed 7680")
            if not isinstance(ch, int) or ch <= 0:
                errors.append(
                    "custom_height must be a positive integer when resolution is 'custom'"
                )
            if isinstance(ch, int) and ch > 4320:
                errors.append("custom_height must not exceed 4320")

        fps = settings.get("fps", "source")
        valid_fps = ("source", "24", "25", "30", "60")
        if fps not in valid_fps:
            errors.append(f"invalid fps {fps!r}; must be one of {valid_fps}")

        quality_preset = settings.get("quality_preset", "medium")
        if quality_preset not in ("fast", "medium", "slow"):
            errors.append(
                f"invalid quality_preset {quality_preset!r}; must be fast, medium, or slow"
            )

        if "crf" in settings:
            crf = settings["crf"]
            if not isinstance(crf, int) or crf < 0 or crf > 51:
                errors.append("crf must be an integer between 0 and 51")

        if "bitrate" in settings:
            bitrate = settings["bitrate"]
            if not isinstance(bitrate, int) or bitrate <= 0:
                errors.append("bitrate must be a positive integer")

        if "gif_max_width" in settings:
            gmw = settings["gif_max_width"]
            if not isinstance(gmw, int) or gmw <= 0:
                errors.append("gif_max_width must be a positive integer")
            elif gmw > 1920:
                errors.append("gif_max_width must not exceed 1920")

        if "image_format" in settings:
            ifmt = settings["image_format"]
            if ifmt not in ("png", "jpeg", "tiff"):
                errors.append(
                    f"invalid image_format {ifmt!r}; must be png, jpeg, or tiff"
                )

        if "jpeg_quality" in settings:
            jq = settings["jpeg_quality"]
            if not isinstance(jq, int) or jq < 1 or jq > 100:
                errors.append("jpeg_quality must be an integer between 1 and 100")

        return errors

    def _handle_export_start(self, message: dict, msg_id: str | None) -> dict:
        input_path = message.get("input_path")
        output_path = message.get("output_path")
        chain = message.get("chain", [])
        project_seed = message.get("project_seed", 0)
        settings = message.get("settings", {})
        text_layers = message.get("text_layers", [])
        # P5a.4: optional composite-replay payload {events, instruments, assets}.
        performance = message.get("performance")
        # P2.3: optional export-parity modulation payloads. `operators` is the
        # serialized operator list (same shape preview sends to render_frame);
        # `automation_by_frame` is the frontend-pre-resolved per-source-frame
        # override map {frameIndex: {"effectId.paramKey": value}}. Both absent →
        # legacy export, byte-identical.
        operators = message.get("operators")
        automation_by_frame = message.get("automation_by_frame")
        # MK.10 — the active clip's matte stack (per-clip mattes referenced by
        # the chain's device mask_refs). Optional/additive: absent → legacy export.
        # Trust boundary: a non-list degrades to the no-mask path inside the
        # shared helper (build_node_index coerces → empty), never crashes the job.
        mask_stack = message.get("mask_stack")
        if mask_stack is not None and not isinstance(mask_stack, list):
            mask_stack = None

        if not input_path:
            return {"id": msg_id, "ok": False, "error": "missing input_path"}
        if not output_path:
            return {"id": msg_id, "ok": False, "error": "missing output_path"}

        # SEC-5: Validate input path (prevents path traversal via export)
        errors = validate_upload(input_path)
        if errors:
            return {"id": msg_id, "ok": False, "error": "; ".join(errors)}

        # Validate output path (prevents writing to system dirs)
        if settings.get("export_type") == "image_sequence":
            out_errors = validate_output_directory(output_path)
        else:
            out_errors = validate_output_path(output_path)
        if out_errors:
            return {"id": msg_id, "ok": False, "error": "; ".join(out_errors)}

        # SEC-7: Validate chain depth
        errors = validate_chain_depth(chain)
        if errors:
            return {"id": msg_id, "ok": False, "error": "; ".join(errors)}

        # Validate multi-codec export settings
        settings_errors = self._validate_export_settings(settings)
        if settings_errors:
            return {"id": msg_id, "ok": False, "error": "; ".join(settings_errors)}

        # P2.3: enforce-before-decode trust boundary on the export-parity
        # modulation payloads (operators + per-frame automation overrides). A
        # malformed snapshot (unknown operator type, NaN automation point) is
        # REJECTED here, BEFORE the export thread spawns — never a partial file.
        mod_errors = validate_export_modulation(operators, automation_by_frame)
        if mod_errors:
            return {"id": msg_id, "ok": False, "error": "; ".join(mod_errors)}

        # P5a.4: enforce-before-decode trust boundary on the performance payload.
        # The serialized event list is replayed by evaluate_voices to reconstruct
        # voice layers; reject a malformed / oversized list BEFORE the export
        # thread spawns (never truncate). A None / absent payload skips this
        # entirely (legacy single-input export, byte-identical).
        if performance is not None:
            if not isinstance(performance, dict):
                return {
                    "id": msg_id,
                    "ok": False,
                    "error": "performance must be an object",
                }
            ev_errors = validate_capture_events(performance.get("events", []))
            if ev_errors:
                return {"id": msg_id, "ok": False, "error": "; ".join(ev_errors)}
            # red-team RT-1 (SEC-5): every asset path in the performance payload
            # is decoded + composited into the export output. Without validation
            # a hostile payload exfiltrates any user-readable file into the
            # artifact. Validate each the same way the primary input_path is.
            # assets is a dict {assetId: {path, ...}} (see export.py
            # _composite_export_frame: instruments.items() / assets.get(clip_id)).
            assets = performance.get("assets") or {}
            if isinstance(assets, dict):
                for a in assets.values():
                    apath = a.get("path") if isinstance(a, dict) else None
                    if apath:
                        a_errors = validate_upload(apath)
                        if a_errors:
                            return {
                                "id": msg_id,
                                "ok": False,
                                "error": "; ".join(a_errors),
                            }
            # red-team HT-2 (SEC-7): per-instrument chains bypass the top-level
            # depth check — validate each so a 100-effect instrument chain can't
            # slip past MAX_CHAIN_DEPTH inside the performance payload.
            # instruments is a dict {instrumentId: {chain?, ...}}.
            instruments = performance.get("instruments") or {}
            if isinstance(instruments, dict):
                for inst in instruments.values():
                    inst_chain = (
                        (inst.get("chain") or []) if isinstance(inst, dict) else []
                    )
                    c_errors = validate_chain_depth(inst_chain)
                    if c_errors:
                        return {"id": msg_id, "ok": False, "error": "; ".join(c_errors)}
            # Per-frame voice budget is additionally enforced inside the
            # compositor reuse (validate_voice_layers / MAX_TOTAL_VOICES_PER_RENDER
            # via the FSM voiceCap); the event-list cap here bounds the replay
            # input.

        try:
            self.export_manager.start(
                input_path,
                output_path,
                chain,
                project_seed,
                settings=settings,
                text_layers=text_layers or None,
                performance=performance,
                # P2.3: export-parity modulation. The audio follower reads the
                # SAME per-frame PCM window preview uses (_get_audio_pcm_for_frame)
                # so audio-driven modulation matches preview; absent audio → None
                # (graceful degrade, identical to preview with no audio loaded).
                operators=operators,
                automation_by_frame=automation_by_frame,
                audio_pcm_provider=self._get_audio_pcm_for_frame,
                mask_stack=mask_stack,
            )
            return {"id": msg_id, "ok": True}
        except Exception as e:
            sentry_sdk.capture_exception(e)
            logging.getLogger(__name__).error(
                "Export start error: %s", type(e).__name__
            )
            return {"id": msg_id, "ok": False, "error": "Internal processing error"}

    def _handle_export_status(self, msg_id: str | None) -> dict:
        try:
            status = self.export_manager.get_status()
            status["id"] = msg_id
            status["ok"] = True
            return status
        except Exception as e:
            sentry_sdk.capture_exception(e)
            logging.getLogger(__name__).error(
                "Export status error: %s", type(e).__name__
            )
            return {"id": msg_id, "ok": False, "error": "Internal processing error"}

    def _handle_export_cancel(self, msg_id: str | None) -> dict:
        try:
            cancelled = self.export_manager.cancel()
            return {"id": msg_id, "ok": True, "cancelled": cancelled}
        except Exception as e:
            sentry_sdk.capture_exception(e)
            logging.getLogger(__name__).error(
                "Export cancel error: %s", type(e).__name__
            )
            return {"id": msg_id, "ok": False, "error": "Internal processing error"}

    def _get_signal_engine(self):
        """Lazy-init signal engine."""
        if self._signal_engine is None:
            from modulation.engine import SignalEngine

            self._signal_engine = SignalEngine()
        return self._signal_engine

    def _validate_mod_edges_change_gated(self, operators: list) -> list[str]:
        """Validate B9 mod-routing edges, change-gated for the per-frame path.

        The render IPC fires 30×/sec; full validation every frame would burn
        budget. We hash the operators payload and only re-run
        ``security.validate_operator_mod_edges`` when it CHANGES since the last
        validated frame (review Tiger 1b perf note). The cached error list is
        returned on a cache hit — so a hostile operator set stays rejected on
        every subsequent frame, not just the first.

        Returns the validation error list (empty == valid).
        """
        try:
            # repr() is a cheap, deterministic key for the (already-small) operator
            # list; hashing it avoids deep-comparing the dicts each frame.
            key = hash(repr(operators))
        except Exception:
            # Unhashable / pathological payload — force a fresh validation.
            key = None

        if key is not None and key == self._mod_edges_validated_hash:
            return self._mod_edges_validation_errors

        from security import validate_operator_mod_edges

        errors = validate_operator_mod_edges(operators)
        self._mod_edges_validated_hash = key
        self._mod_edges_validation_errors = errors
        return errors

    def _get_audio_pcm_for_frame(self, frame_index: int, fps: float):
        """Extract a window of PCM audio for the current frame.

        Returns mono float32 ndarray or None if no audio loaded.
        """
        if not self.audio_player.loaded or self.audio_player._samples is None:
            return None
        samples = self.audio_player._samples
        sample_rate = self.audio_player._sample_rate

        # Window: one frame's worth of audio centered on the frame time
        safe_fps = clamp_finite(fps, 1.0, 240.0, 30.0)
        frame_duration_s = 1.0 / safe_fps
        center_sample = int((frame_index / safe_fps) * sample_rate)
        window_samples = max(1, int(frame_duration_s * sample_rate))

        start = max(0, center_sample - window_samples // 2)
        end = min(samples.shape[0], start + window_samples)

        if end <= start:
            return None

        chunk = samples[start:end]
        # Convert to mono if stereo
        if chunk.ndim > 1 and chunk.shape[1] > 1:
            chunk = chunk.mean(axis=1)
        return chunk.astype(np.float32)

    def _handle_check_dag(self, message: dict, msg_id: str | None) -> dict:
        """Check if adding a routing edge would create a DAG cycle."""
        from modulation.routing import check_cycle

        routings = message.get("routings", [])
        new_edge = message.get("new_edge", [])
        if not isinstance(new_edge, (list, tuple)) or len(new_edge) != 2:
            return {
                "id": msg_id,
                "ok": False,
                "error": "new_edge must be [source, target]",
            }
        # Convert routings to list of tuples
        edges = [
            (r[0], r[1])
            for r in routings
            if isinstance(r, (list, tuple)) and len(r) == 2
        ]
        is_valid = not check_cycle(edges, (new_edge[0], new_edge[1]))
        return {"id": msg_id, "ok": True, "is_valid": is_valid}

    # --- Text rendering handlers ---

    def _handle_list_fonts(self, msg_id: str | None) -> dict:
        """Return enumerated system fonts (cached)."""
        try:
            fonts = list_system_fonts()
            return {"id": msg_id, "ok": True, "fonts": fonts}
        except Exception as e:
            sentry_sdk.capture_exception(e)
            return {"id": msg_id, "ok": False, "error": "Failed to enumerate fonts"}

    def _handle_render_text_frame(self, message: dict, msg_id: str | None) -> dict:
        """Render a text config to RGBA and return as base64 JPEG."""
        text_config = message.get("text_config")
        if not text_config or not isinstance(text_config, dict):
            return {"id": msg_id, "ok": False, "error": "text_config required"}

        raw_res = message.get("resolution", [1920, 1080])
        if not isinstance(raw_res, list) or len(raw_res) != 2:
            return {"id": msg_id, "ok": False, "error": "resolution must be [w, h]"}
        res_w: int = max(1, min(8192, int(raw_res[0])))
        res_h: int = max(1, min(8192, int(raw_res[1])))
        resolution: tuple[int, int] = (res_w, res_h)
        frame_index = max(0, int(message.get("frame_index", 0)))
        fps = max(1.0, min(120.0, float(message.get("fps", 30.0))))

        try:
            t0 = time.time()
            frame = render_text_frame(text_config, resolution, frame_index, fps)
            jpeg_bytes = encode_mjpeg(frame)
            frame_b64 = base64.b64encode(jpeg_bytes).decode("ascii")
            self.last_frame_ms = round((time.time() - t0) * 1000, 2)
            return {
                "id": msg_id,
                "ok": True,
                "frame_data": frame_b64,
                "width": resolution[0],
                "height": resolution[1],
            }
        except Exception as e:
            sentry_sdk.capture_exception(e)
            logging.getLogger(__name__).error(f"Render text frame error: {e}")
            return {"id": msg_id, "ok": False, "error": "Internal processing error"}

    def _get_reader(self, path: str) -> VideoReader | ImageReader:
        if path in self.readers:
            self.readers.move_to_end(path)
            return self.readers[path]
        # Evict oldest reader if cache is full
        while len(self.readers) >= self._max_readers:
            _, oldest = self.readers.popitem(last=False)
            oldest.close()
        if is_image_file(path):
            reader: VideoReader | ImageReader = ImageReader(path)
        else:
            reader = VideoReader(path)
        self.readers[path] = reader
        return reader

    def _apply_clip_transform(
        self, frame: np.ndarray, transform: dict, resolution: tuple[int, int]
    ) -> np.ndarray:
        """Apply position/scale/rotation/flip transform to frame.

        Supports: scaleX/scaleY (independent), anchorX/anchorY, flipH/flipV.
        Falls back to legacy 'scale' field for old project compatibility.
        All values are clamped at the trust boundary via clamp_finite.
        """
        import cv2

        try:
            # Support both new scaleX/scaleY and legacy scale field
            legacy_scale = transform.get("scale", None)
            scale_x = clamp_finite(
                float(
                    transform.get(
                        "scaleX", legacy_scale if legacy_scale is not None else 1.0
                    )
                ),
                0.01,
                100.0,
                1.0,
            )
            scale_y = clamp_finite(
                float(
                    transform.get(
                        "scaleY", legacy_scale if legacy_scale is not None else 1.0
                    )
                ),
                0.01,
                100.0,
                1.0,
            )
            rotation = clamp_finite(
                float(transform.get("rotation", 0.0)), -36000.0, 36000.0, 0.0
            )
            tx = clamp_finite(float(transform.get("x", 0.0)), -10000.0, 10000.0, 0.0)
            ty = clamp_finite(float(transform.get("y", 0.0)), -10000.0, 10000.0, 0.0)
            anchor_x = clamp_finite(
                float(transform.get("anchorX", 0.0)), -10000.0, 10000.0, 0.0
            )
            anchor_y = clamp_finite(
                float(transform.get("anchorY", 0.0)), -10000.0, 10000.0, 0.0
            )
            flip_h = bool(transform.get("flipH", False))
            flip_v = bool(transform.get("flipV", False))
        except (ValueError, TypeError):
            return frame  # Malformed transform values — render unmodified

        # No-op check
        if (
            scale_x == 1.0
            and scale_y == 1.0
            and rotation == 0.0
            and tx == 0.0
            and ty == 0.0
            and anchor_x == 0.0
            and anchor_y == 0.0
            and not flip_h
            and not flip_v
        ):
            return frame

        h, w = frame.shape[:2]
        canvas_w, canvas_h = resolution

        # Flip
        if flip_h:
            frame = cv2.flip(frame, 1)
        if flip_v:
            frame = cv2.flip(frame, 0)

        # Scale (independent X/Y)
        if scale_x != 1.0 or scale_y != 1.0:
            new_w = max(1, int(w * scale_x))
            new_h = max(1, int(h * scale_y))
            frame = cv2.resize(frame, (new_w, new_h), interpolation=cv2.INTER_LINEAR)
            h, w = frame.shape[:2]

        # Create canvas and center the frame
        channels = frame.shape[2] if frame.ndim == 3 else 1
        canvas = np.zeros((canvas_h, canvas_w, channels), dtype=np.uint8)
        x_off = int((canvas_w - w) / 2 + tx)
        y_off = int((canvas_h - h) / 2 + ty)

        # Compute source and destination regions (clip to canvas bounds)
        src_x1 = max(0, -x_off)
        src_y1 = max(0, -y_off)
        dst_x1 = max(0, x_off)
        dst_y1 = max(0, y_off)
        copy_w = min(w - src_x1, canvas_w - dst_x1)
        copy_h = min(h - src_y1, canvas_h - dst_y1)

        if copy_w > 0 and copy_h > 0:
            canvas[dst_y1 : dst_y1 + copy_h, dst_x1 : dst_x1 + copy_w] = frame[
                src_y1 : src_y1 + copy_h, src_x1 : src_x1 + copy_w
            ]

        # Rotation (around anchor point offset from canvas center)
        if rotation != 0.0:
            center = (canvas_w / 2 + anchor_x, canvas_h / 2 + anchor_y)
            rot_mat = cv2.getRotationMatrix2D(center, rotation, 1.0)
            canvas = cv2.warpAffine(canvas, rot_mat, (canvas_w, canvas_h))

        return canvas

    # --- Freeze/Flatten handlers ---

    _CACHE_ID_RE = __import__("re").compile(r"^[0-9a-f]{16}$")

    def _validate_cache_id(
        self, cache_id: str | None, msg_id: str | None
    ) -> dict | None:
        """Validate cache_id format. Returns error dict or None if valid."""
        if not cache_id or not isinstance(cache_id, str):
            return {"id": msg_id, "ok": False, "error": "cache_id required"}
        if not self._CACHE_ID_RE.match(cache_id):
            return {"id": msg_id, "ok": False, "error": "invalid cache_id format"}
        return None

    def _handle_freeze_prefix(self, message: dict, msg_id: str | None) -> dict:
        """Freeze an effect chain prefix to disk cache."""
        asset_path = message.get("asset_path")
        chain = message.get("chain", [])
        project_seed = message.get("project_seed", 0)
        frame_count = message.get("frame_count", 0)
        raw_res = message.get("resolution", [1280, 720])

        if not asset_path or not isinstance(asset_path, str):
            return {"id": msg_id, "ok": False, "error": "asset_path required"}

        if not isinstance(raw_res, list) or len(raw_res) != 2:
            return {"id": msg_id, "ok": False, "error": "resolution must be [w, h]"}
        resolution: tuple[int, int] = (
            max(1, min(8192, int(raw_res[0]))),
            max(1, min(8192, int(raw_res[1]))),
        )

        # SEC-5: validate asset path (prevents path traversal)
        upload_errors = validate_upload(asset_path)
        if upload_errors:
            return {"id": msg_id, "ok": False, "error": "; ".join(upload_errors)}

        if frame_count <= 0:
            return {"id": msg_id, "ok": False, "error": "frame_count must be > 0"}

        # SEC-6: frame count cap
        fc_errors = validate_frame_count(frame_count)
        if fc_errors:
            return {"id": msg_id, "ok": False, "error": "; ".join(fc_errors)}

        # SEC-7: chain depth cap
        cd_errors = validate_chain_depth(chain)
        if cd_errors:
            return {"id": msg_id, "ok": False, "error": "; ".join(cd_errors)}

        if (
            not isinstance(resolution, (list, tuple))
            or len(resolution) != 2
            or not all(isinstance(v, (int, float)) for v in resolution)
        ):
            return {
                "id": msg_id,
                "ok": False,
                "error": "resolution must be [width, height]",
            }

        try:
            cache_id = self.freeze_manager.freeze_prefix(
                asset_path,
                chain,
                project_seed,
                frame_count,
                (int(resolution[0]), int(resolution[1])),
            )
            return {"id": msg_id, "ok": True, "cache_id": cache_id}
        except Exception as e:
            sentry_sdk.capture_exception(e)
            return {"id": msg_id, "ok": False, "error": str(e)}

    def _handle_read_freeze(self, message: dict, msg_id: str | None) -> dict:
        """Read a single cached frame from a freeze cache."""
        cache_id = message.get("cache_id")
        frame_index = message.get("frame_index", 0)

        err = self._validate_cache_id(cache_id, msg_id)
        if err:
            return err

        try:
            frame = self.freeze_manager.read_cached_frame(cache_id, frame_index)
            jpeg_data = encode_mjpeg(
                np.dstack([frame, np.full(frame.shape[:2], 255, dtype=np.uint8)])
            )
            frame_b64 = base64.b64encode(jpeg_data).decode("ascii")
            return {
                "id": msg_id,
                "ok": True,
                "frame_data": frame_b64,
                "width": frame.shape[1],
                "height": frame.shape[0],
            }
        except (KeyError, IndexError) as e:
            return {"id": msg_id, "ok": False, "error": str(e)}

    def _handle_bake_performance_track(self, message: dict, msg_id: str | None) -> dict:
        """B10.1b — bake ONE performance track's voices to a clip (Ableton freeze).

        Mirrors `_handle_export_start`'s trust-boundary validation (the
        performance payload is replayed by evaluate_voices + every asset path is
        decoded), but renders SYNCHRONOUSLY via
        `ExportManager.bake_performance_track` (a single track over a black
        base) and returns `{ok, clipId, path, frames}`. Reuses the export
        compositor — no parallel renderer.
        """
        track_id = message.get("track_id")
        if not track_id or not isinstance(track_id, str):
            return {"id": msg_id, "ok": False, "error": "missing track_id"}

        output_path = message.get("output_path")
        if not output_path or not isinstance(output_path, str):
            return {"id": msg_id, "ok": False, "error": "output_path required"}
        path_errors = validate_output_path(output_path)
        if path_errors:
            return {"id": msg_id, "ok": False, "error": "; ".join(path_errors)}

        performance = message.get("performance")
        if not isinstance(performance, dict):
            return {
                "id": msg_id,
                "ok": False,
                "error": "performance must be an object",
            }

        # Trust boundary — identical to _handle_export_start's performance gate:
        # the event list is replayed (evaluate_voices), every asset path is
        # decoded into the artifact, and per-instrument chains bypass the
        # top-level depth check. Reject a malformed/oversized/hostile payload
        # BEFORE any render (never a partial file, never path-traversal exfil).
        ev_errors = validate_capture_events(performance.get("events", []))
        if ev_errors:
            return {"id": msg_id, "ok": False, "error": "; ".join(ev_errors)}
        assets = performance.get("assets") or {}
        if isinstance(assets, dict):
            for a in assets.values():
                apath = a.get("path") if isinstance(a, dict) else None
                if apath:
                    a_errors = validate_upload(apath)
                    if a_errors:
                        return {
                            "id": msg_id,
                            "ok": False,
                            "error": "; ".join(a_errors),
                        }
        instruments = performance.get("instruments") or {}
        if isinstance(instruments, dict):
            for inst in instruments.values():
                inst_chain = (inst.get("chain") or []) if isinstance(inst, dict) else []
                c_errors = validate_chain_depth(inst_chain)
                if c_errors:
                    return {"id": msg_id, "ok": False, "error": "; ".join(c_errors)}

        # Resolution + frame range — clamp the numeric trust boundary (IPC
        # numerics: every value crossing here passes a clamp/guard).
        raw_res = message.get("resolution", [1920, 1080])
        if not isinstance(raw_res, (list, tuple)) or len(raw_res) != 2:
            return {"id": msg_id, "ok": False, "error": "resolution must be [w, h]"}
        res_w = max(1, min(8192, int(clamp_finite(float(raw_res[0]), 1, 8192, 1920))))
        res_h = max(1, min(8192, int(clamp_finite(float(raw_res[1]), 1, 8192, 1080))))
        start_frame = max(
            0, int(clamp_finite(float(message.get("start_frame", 0)), 0, 1e9, 0))
        )
        end_frame = max(
            start_frame,
            int(
                clamp_finite(
                    float(message.get("end_frame", start_frame)), 0, 1e9, start_frame
                )
            ),
        )
        project_seed = int(message.get("project_seed", 0))
        fps = int(clamp_finite(float(message.get("fps", 30)), 1.0, 240.0, 30.0))

        try:
            result = self.export_manager.bake_performance_track(
                track_id=track_id,
                performance=performance,
                output_path=output_path,
                resolution=(res_w, res_h),
                start_frame=start_frame,
                end_frame=end_frame,
                project_seed=project_seed,
                fps=fps,
            )
            return {
                "id": msg_id,
                "ok": bool(result.get("ok", False)),
                "clipId": result.get("clipId"),
                "path": result.get("path"),
                "frames": result.get("frames", 0),
            }
        except Exception as e:
            sentry_sdk.capture_exception(e)
            logging.getLogger(__name__).error(
                "bake_performance_track error: %s", type(e).__name__
            )
            return {"id": msg_id, "ok": False, "error": "Internal processing error"}

    def _handle_flatten(self, message: dict, msg_id: str | None) -> dict:
        """Flatten a freeze cache to a new video file."""
        cache_id = message.get("cache_id")
        output_path = message.get("output_path")
        fps = int(clamp_finite(float(message.get("fps", 30)), 1.0, 120.0, 30.0))

        err = self._validate_cache_id(cache_id, msg_id)
        if err:
            return err
        if not output_path or not isinstance(output_path, str):
            return {"id": msg_id, "ok": False, "error": "output_path required"}

        # Validate output path — check return value (returns list of errors)
        path_errors = validate_output_path(output_path)
        if path_errors:
            return {"id": msg_id, "ok": False, "error": "; ".join(path_errors)}

        try:
            result_path = self.freeze_manager.flatten(cache_id, output_path, fps=fps)
            return {"id": msg_id, "ok": True, "output_path": result_path}
        except Exception as e:
            sentry_sdk.capture_exception(e)
            return {"id": msg_id, "ok": False, "error": str(e)}

    def _handle_invalidate_cache(self, message: dict, msg_id: str | None) -> dict:
        """Invalidate (delete) a freeze cache."""
        cache_id = message.get("cache_id")
        err = self._validate_cache_id(cache_id, msg_id)
        if err:
            return err

        self.freeze_manager.invalidate(cache_id)
        return {"id": msg_id, "ok": True}

    def _handle_memory_status(self, msg_id: str | None) -> dict:
        """Return process and system memory info."""
        import os

        try:
            import psutil

            proc = psutil.Process(os.getpid())
            mem = proc.memory_info()
            vm = psutil.virtual_memory()
            return {
                "id": msg_id,
                "ok": True,
                "rss_mb": mem.rss // (1024 * 1024),
                "percent": vm.percent,
                "available_mb": vm.available // (1024 * 1024),
            }
        except ImportError:
            # psutil not installed — return basic info from os
            import resource
            import sys

            rusage = resource.getrusage(resource.RUSAGE_SELF)
            # macOS: ru_maxrss is in bytes; Linux: in kilobytes
            rss_bytes = (
                rusage.ru_maxrss
                if sys.platform == "darwin"
                else rusage.ru_maxrss * 1024
            )
            return {
                "id": msg_id,
                "ok": True,
                "rss_mb": rss_bytes // (1024 * 1024),
                "percent": -1,
                "available_mb": -1,
            }

    def _handle_pressure_status(self, msg_id: str | None) -> dict:
        """SG-8 (P5b.1): poll the live pressure monitor / feature registry.

        Returns ``{level, current_pct, degraded_features[]}`` where:
          - ``current_pct`` is the latest memory-pressure reading in [0, 100],
            clamped + finite-guarded at the trust boundary (the value crosses
            IPC into the frontend, so a NaN/Inf/None must never escape).
          - ``level`` is the SPEC-3 §5.2 status band derived from current_pct:
            ok (<60) · warn (>=60) · auto_disable (>=75) · emergency (>=90).
          - ``degraded_features`` is the set of currently-degraded canonical
            stage names, ordered by CANONICAL_DEGRADE_ORDER.
        """
        # current_pct: read the monitor's last poll, falling back to a fresh
        # read if the background loop hasn't ticked yet. clamp_finite hardens
        # against NaN/Inf/non-numeric — the only numeric we hand to the frontend.
        try:
            raw_pct = self.pressure_monitor.stats().last_pressure_pct
        except Exception:  # noqa: BLE001 — never let status polling crash
            raw_pct = 0.0
        current_pct = clamp_finite(raw_pct, 0.0, 100.0, fallback=0.0)

        if current_pct >= 90.0:
            level = "emergency"
        elif current_pct >= 75.0:
            level = "auto_disable"
        elif current_pct >= 60.0:
            level = "warn"
        else:
            level = "ok"

        # degraded_features ordered canonically (UI lists them in degrade order).
        try:
            active = global_registry().active_stages()
        except Exception:  # noqa: BLE001
            active = frozenset()
        degraded_features = [
            stage.name for stage in CANONICAL_DEGRADE_ORDER if stage.name in active
        ]

        return {
            "id": msg_id,
            "ok": True,
            "level": level,
            "current_pct": round(current_pct, 1),
            "degraded_features": degraded_features,
        }

    # ── I3 Inline Probe handlers ─────────────────────────────────────────────

    def _handle_inline_actions_list(self, message: dict, msg_id: str | None) -> dict:
        """List eligible inline actions for a given context.

        Expected payload:
          {cmd: "inline_actions_list", kind: str, node_id: str,
           param_path?: str, track_id?: str}
        Returns:
          {ok: True, actions: [{id, label, shortcut}]}
        """
        kind_str = message.get("kind", "")
        node_id = message.get("node_id", "")
        if not kind_str or not node_id:
            return {"id": msg_id, "ok": False, "error": "missing kind or node_id"}
        try:
            kind = ActionContextKind(kind_str)
        except ValueError:
            return {
                "id": msg_id,
                "ok": False,
                "error": f"unknown action context kind: {kind_str!r}",
            }
        ctx = ActionContext(
            kind=kind,
            node_id=node_id,
            param_path=message.get("param_path") or None,
            track_id=message.get("track_id") or None,
        )
        actions = global_inline_actions().list_actions_for(ctx)
        return {
            "id": msg_id,
            "ok": True,
            "actions": [
                {"id": a.id, "label": a.label, "shortcut": a.shortcut} for a in actions
            ],
        }

    def _handle_inline_actions_invoke(self, message: dict, msg_id: str | None) -> dict:
        """Invoke a specific inline action for a context.

        Expected payload:
          {cmd: "inline_actions_invoke", action_id: str, kind: str,
           node_id: str, param_path?: str, track_id?: str}
        Returns:
          {ok: bool, message: str, payload: dict}
        """
        action_id = message.get("action_id", "")
        kind_str = message.get("kind", "")
        node_id = message.get("node_id", "")
        if not action_id or not kind_str or not node_id:
            return {
                "id": msg_id,
                "ok": False,
                "error": "missing action_id, kind, or node_id",
            }
        try:
            kind = ActionContextKind(kind_str)
        except ValueError:
            return {
                "id": msg_id,
                "ok": False,
                "error": f"unknown action context kind: {kind_str!r}",
            }
        ctx = ActionContext(
            kind=kind,
            node_id=node_id,
            param_path=message.get("param_path") or None,
            track_id=message.get("track_id") or None,
        )
        result = global_inline_actions().invoke(action_id, ctx, global_routing_graph())
        return {
            "id": msg_id,
            "ok": result.ok,
            "message": result.message,
            "payload": result.payload,
        }

    def _handle_mask_wand_sample(self, message: dict, msg_id: str | None) -> dict:
        """IPC handler for the MK.6 magic wand tool.

        Performs a contiguous flood-fill at (x, y) in the frame at *frame_index*,
        bakes the resulting matte to a PNG sidecar, and returns a bitmap MatteNode
        payload ready for addMatteNode on the frontend.

        Expected payload (all fields trust-boundary validated before use):
          {
            cmd:         "mask_wand_sample",
            path:        str  — asset file path (SEC-5 validated)
            clip_id:     str  — ^[A-Za-z0-9_-]{1,64}$  (used to name the sidecar)
            node_id:     str  — ^[A-Za-z0-9_-]{1,64}$  (the new MatteNode id)
            frame_index: int  — in [0, frame_count)
            x:           int  — pixel column in [0, width)
            y:           int  — pixel row in [0, height)
            tolerance:   float — RGB Euclidean distance [0, 441.67]; clamped
          }

        Returns:
          {ok: true, node: {id, kind:"bitmap", params:{sidecar_path:...}, ...}}
          {ok: false, error: str}

        Security:
          - path: validated via validate_upload (SEC-5)
          - clip_id, node_id: ^[A-Za-z0-9_-]{1,64}$ pattern enforced
          - frame_index: must be int in [0, frame_count)
          - x, y: must be ints within [0, width/height) — out-of-bounds → error
          - tolerance: finite float, clamped to [0, 441.67]
          - sidecar write path: validated via masking.wand.validate_sidecar_write_path
        """
        import math as _math
        import re as _re

        _ID_PATTERN = _re.compile(r"^[A-Za-z0-9_-]{1,64}$")

        # --- path (SEC-5) ---
        path = message.get("path")
        if not path or not isinstance(path, str):
            return {
                "id": msg_id,
                "ok": False,
                "error": "mask_wand_sample: missing path",
            }
        upload_errors = validate_upload(path)
        if upload_errors:
            return {"id": msg_id, "ok": False, "error": "; ".join(upload_errors)}

        # --- clip_id ---
        clip_id = message.get("clip_id")
        if not isinstance(clip_id, str) or not _ID_PATTERN.match(clip_id):
            return {
                "id": msg_id,
                "ok": False,
                "error": "mask_wand_sample: clip_id must match ^[A-Za-z0-9_-]{1,64}$",
            }

        # --- node_id ---
        node_id = message.get("node_id")
        if not isinstance(node_id, str) or not _ID_PATTERN.match(node_id):
            return {
                "id": msg_id,
                "ok": False,
                "error": "mask_wand_sample: node_id must match ^[A-Za-z0-9_-]{1,64}$",
            }

        # --- frame_index ---
        frame_index_raw = message.get("frame_index")
        if isinstance(frame_index_raw, bool) or not isinstance(frame_index_raw, int):
            return {
                "id": msg_id,
                "ok": False,
                "error": "mask_wand_sample: frame_index must be an int",
            }

        # --- x, y ---
        x_raw = message.get("x")
        y_raw = message.get("y")
        if isinstance(x_raw, bool) or not isinstance(x_raw, int):
            return {
                "id": msg_id,
                "ok": False,
                "error": "mask_wand_sample: x must be an int",
            }
        if isinstance(y_raw, bool) or not isinstance(y_raw, int):
            return {
                "id": msg_id,
                "ok": False,
                "error": "mask_wand_sample: y must be an int",
            }

        # --- tolerance ---
        tol_raw = message.get("tolerance", 30.0)
        if isinstance(tol_raw, bool):
            return {
                "id": msg_id,
                "ok": False,
                "error": "mask_wand_sample: tolerance must be a finite number",
            }
        try:
            tol = float(tol_raw)
        except (TypeError, ValueError):
            return {
                "id": msg_id,
                "ok": False,
                "error": "mask_wand_sample: tolerance must be a finite number",
            }
        if not _math.isfinite(tol):
            tol = 0.0  # NaN/Inf → 0 (clamped)
        # Clamp to sane range [0, 441.67]
        tol = max(0.0, min(441.67, tol))

        try:
            reader = self._get_reader(path)
            frame_count = reader.frame_count or 0
            width = reader.width
            height = reader.height

            # --- frame_index range check ---
            if frame_index_raw < 0 or (
                frame_count > 0 and frame_index_raw >= frame_count
            ):
                return {
                    "id": msg_id,
                    "ok": False,
                    "error": f"mask_wand_sample: frame_index {frame_index_raw} out of range [0, {frame_count})",
                }

            # --- x, y bounds check ---
            if not (0 <= x_raw < width):
                return {
                    "id": msg_id,
                    "ok": False,
                    "error": f"mask_wand_sample: x={x_raw} out of range [0, {width})",
                }
            if not (0 <= y_raw < height):
                return {
                    "id": msg_id,
                    "ok": False,
                    "error": f"mask_wand_sample: y={y_raw} out of range [0, {height})",
                }

            frame = reader.decode_frame(frame_index_raw)

            # Perform flood-fill
            from masking.wand import flood_fill, save_bitmap_sidecar  # noqa: PLC0415

            matte = flood_fill(frame, (x_raw, y_raw), tol)

            # Save sidecar
            sidecar_path_str, save_errors = save_bitmap_sidecar(matte, node_id)
            if save_errors:
                return {"id": msg_id, "ok": False, "error": "; ".join(save_errors)}

            # Build node payload (MatteNode shape, bitmap kind)
            node_payload = {
                "id": node_id,
                "kind": "bitmap",
                "params": {"sidecar_path": sidecar_path_str},
                "op": "add",
                "invert": False,
                "feather": 0.0,
                "growShrink": 0.0,
                "enabled": True,
            }
            return {"id": msg_id, "ok": True, "node": node_payload}

        except Exception as e:
            import sentry_sdk as _sentry  # noqa: PLC0415

            _sentry.capture_exception(e)
            logging.getLogger(__name__).error(f"mask_wand_sample error: {e}")
            return {"id": msg_id, "ok": False, "error": "Internal processing error"}

    def _handle_mask_gc_sidecars(self, message: dict, msg_id: str | None) -> dict:
        """IPC handler for ``mask_gc_sidecars``.

        Expected payload::

            {
                "cmd": "mask_gc_sidecars",
                "active_node_ids": ["node-abc", "node-xyz", ...]
            }

        The frontend sends the full set of node IDs that are currently live in
        the project.  The handler deletes any ``~/.creatrix/mask-bitmaps/*.png``
        whose stem is NOT in *active_node_ids*.

        Typical trigger: the frontend calls this after removing a MatteNode
        (e.g. from ``removeMatteNode``) or on project close/load.

        Returns::

            {"id": ..., "ok": true, "deleted": <count>}
        """
        from masking.wand import gc_orphan_sidecars

        raw_ids = message.get("active_node_ids")
        if not isinstance(raw_ids, list):
            return {
                "id": msg_id,
                "ok": False,
                "error": "mask_gc_sidecars: active_node_ids must be a list",
            }

        # Accept only safe strings; silently discard anything else
        active: set[str] = set()
        for item in raw_ids:
            if isinstance(item, str) and item:
                active.add(item)

        try:
            deleted = gc_orphan_sidecars(active)
        except Exception as e:  # noqa: BLE001
            logging.getLogger(__name__).error(f"mask_gc_sidecars error: {e}")
            return {"id": msg_id, "ok": False, "error": "Internal GC error"}

        return {"id": msg_id, "ok": True, "deleted": deleted}

    def _handle_mask_thumbnail(self, message: dict, msg_id: str | None) -> dict:
        """IPC handler for the MK.13 matte-presence thumbnail.

        Rasterizes a static MatteNode to a 64×36 (default) grayscale PNG and
        returns it as a base64 string.  Procedural kinds (chroma_key, luma_key,
        color_range, ai_matte) return ``thumbnail: null, kind: 'procedural'``
        because they need per-frame context — the frontend keeps its text badge
        for those nodes.

        Expected payload::

            {
                "cmd":     "mask_thumbnail",
                "clip_id": str,              # ^[A-Za-z0-9_-]{1,64}$ (cache key)
                "node":    dict,             # full MatteNode payload (validated here)
                "width":   int | None,       # default 64; clamped [1, 512]
                "height":  int | None        # default 36; clamped [1, 512]
            }

        Returns::

            {ok: true,  thumbnail: "<base64-png>", width: int, height: int}
            {ok: true,  thumbnail: null, kind: "procedural"}   # procedural node
            {ok: false, error: str}                            # validation failure
        """
        import base64 as _b64
        import math as _math
        import re as _re

        import cv2
        from masking.schema import MatteNode as _MatteNode
        from masking.matte_source import rasterize as _rasterize

        _STATIC_KINDS = frozenset({"rect", "ellipse", "polygon", "bitmap"})
        _ID_RE = _re.compile(r"^[A-Za-z0-9_-]{1,64}$")

        # --- clip_id --------------------------------------------------------
        clip_id = message.get("clip_id", "")
        if not isinstance(clip_id, str) or not _ID_RE.match(clip_id):
            return {
                "id": msg_id,
                "ok": False,
                "error": "mask_thumbnail: clip_id must match ^[A-Za-z0-9_-]{1,64}$",
            }

        # --- node (trust-boundary validated via MatteNode.from_dict) --------
        node_raw = message.get("node")
        if not isinstance(node_raw, dict):
            return {
                "id": msg_id,
                "ok": False,
                "error": "mask_thumbnail: node must be a dict",
            }
        node = _MatteNode.from_dict(node_raw)
        if node is None:
            return {
                "id": msg_id,
                "ok": False,
                "error": "mask_thumbnail: node failed validation (bad id or unknown kind)",
            }

        # --- width / height (optional, default 64×36) -----------------------
        def _parse_dim(value: object, default: int) -> int:
            if value is None:
                return default
            try:
                n = int(value)
            except (TypeError, ValueError):
                return default
            if _math.isnan(float(n)) or _math.isinf(float(n)):
                return default
            return max(1, min(512, n))

        width = _parse_dim(message.get("width"), 64)
        height = _parse_dim(message.get("height"), 36)

        # --- procedural fallback --------------------------------------------
        if node.kind not in _STATIC_KINDS:
            return {
                "id": msg_id,
                "ok": True,
                "thumbnail": None,
                "kind": "procedural",
            }

        # --- rasterize (cached by matte_source LRU) -------------------------
        try:
            matte_f32 = _rasterize(node, height, width, clip_id)
        except Exception as e:  # noqa: BLE001
            logging.getLogger(__name__).error(f"mask_thumbnail rasterize error: {e}")
            return {"id": msg_id, "ok": False, "error": "Internal rasterize error"}

        # float32 [0,1] → uint8 [0,255] grayscale, encode PNG, base64
        try:
            gray_u8 = (matte_f32 * 255.0).clip(0, 255).astype(np.uint8)
            ok_enc, buf = cv2.imencode(".png", gray_u8)
            if not ok_enc:
                return {"id": msg_id, "ok": False, "error": "PNG encode failed"}
            thumbnail_b64 = _b64.b64encode(buf.tobytes()).decode("ascii")
        except Exception as e:  # noqa: BLE001
            logging.getLogger(__name__).error(f"mask_thumbnail encode error: {e}")
            return {"id": msg_id, "ok": False, "error": "Internal encode error"}

        return {
            "id": msg_id,
            "ok": True,
            "thumbnail": thumbnail_b64,
            "width": width,
            "height": height,
        }

    def run(self):
        self.running = True
        # SG-8 (P5b.1): start the live memory-pressure monitor alongside the
        # ZMQ server. start() is idempotent (guards an already-alive thread),
        # so a second call never leaks a thread. Threshold crossings are logged
        # by the monitor itself (safety.pressure.monitor logger → sidecar.log).
        self.pressure_monitor.start()
        logging.getLogger(__name__).info(
            "SG-8 pressure monitor started (budget_anchor=session-start)"
        )
        poller = zmq.Poller()
        poller.register(self.socket, zmq.POLLIN)
        poller.register(self.ping_socket, zmq.POLLIN)
        while self.running:
            events = dict(poller.poll(timeout=500))

            # Handle ping socket first (lightweight, never blocked)
            if self.ping_socket in events:
                try:
                    raw = self.ping_socket.recv()
                    message = json.loads(raw)
                    msg_id = message.get("id")
                    token_err = self._validate_token(message)
                    if token_err:
                        self.ping_socket.send_json(
                            {"id": msg_id, "ok": False, "error": token_err}
                        )
                    else:
                        self.ping_socket.send_json(self._make_ping_response(msg_id))
                except json.JSONDecodeError:
                    self.ping_socket.send_json(
                        {"ok": False, "error": "Invalid message format"}
                    )
                except zmq.ZMQError:
                    logging.getLogger(__name__).error("ZMQ error on ping socket")
                    break  # socket state is unrecoverable

            # Handle main command socket
            if self.socket in events:
                try:
                    raw = self.socket.recv()
                    message = json.loads(raw)
                except json.JSONDecodeError:
                    # MUST send reply before next recv (REP protocol)
                    self.socket.send_json(
                        {"ok": False, "error": "Invalid message format"}
                    )
                    continue
                except zmq.ZMQError:
                    logging.getLogger(__name__).error("ZMQ error on main socket")
                    break

                t0 = time.monotonic()
                try:
                    response = self.handle_message(message)
                except Exception as e:
                    sentry_sdk.capture_exception(e)
                    logging.getLogger(__name__).error(
                        "Unhandled handler error: %s",
                        type(e).__name__,
                        exc_info=True,
                    )
                    response = {"ok": False, "error": "Internal processing error"}

                cmd = message.get("cmd")
                if cmd and cmd != "ping":
                    elapsed_ms = (time.monotonic() - t0) * 1000
                    logging.getLogger(__name__).info(
                        "IPC handled: id=%s cmd=%s elapsed_ms=%.1f ok=%s",
                        message.get("id"),
                        cmd,
                        elapsed_ms,
                        response.get("ok"),
                    )

                self.socket.send_json(response)
        self.close()

    # ── P6.7 I1 Probe handlers ───────────────────────────────────────────────

    def _handle_probe_register(self, message: dict, msg_id: str | None) -> dict:
        """Register a named probe.

        Expected payload:
          {cmd: "probe_register", probe_id: str, kind: str, label: str,
           track_id?: str, effect_id?: str, param_path?: str}

        Trust boundary: all string fields length-capped ≤ 256 chars.
        Returns {ok: True, probe_id: str} or {ok: False, error: str}.
        Returns the same probe when re-registering an existing probe_id (idempotent).
        Returns {ok: False} when MAX_PROBES (64) would be exceeded.
        """
        _MAX_FIELD = 256

        def _cap(val: object) -> str | None:
            if val is None:
                return None
            s = str(val)[:_MAX_FIELD]
            return s if s else None

        probe_id = _cap(message.get("probe_id"))
        kind_str = _cap(message.get("kind"))
        label = _cap(message.get("label")) or ""

        if not probe_id:
            return {"id": msg_id, "ok": False, "error": "missing probe_id"}
        if not kind_str:
            return {"id": msg_id, "ok": False, "error": "missing kind"}

        try:
            kind = ProbeKind(kind_str)
        except ValueError:
            valid = [k.value for k in ProbeKind]
            return {
                "id": msg_id,
                "ok": False,
                "error": f"unknown probe kind {kind_str!r}; valid: {valid}",
            }

        try:
            global_probe_registry().register(
                probe_id,
                kind,
                label,
                track_id=_cap(message.get("track_id")),
                effect_id=_cap(message.get("effect_id")),
                param_path=_cap(message.get("param_path")),
            )
        except ValueError as exc:
            return {"id": msg_id, "ok": False, "error": str(exc)}

        return {"id": msg_id, "ok": True, "probeId": probe_id}

    def _handle_probe_unregister(self, message: dict, msg_id: str | None) -> dict:
        """Unregister a probe by id.

        Returns {ok: True, removed: bool}.
        """
        probe_id = message.get("probe_id")
        if not probe_id:
            return {"id": msg_id, "ok": False, "error": "missing probe_id"}
        removed = global_probe_registry().unregister(str(probe_id))
        return {"id": msg_id, "ok": True, "removed": removed}

    def _handle_probe_mount(self, msg_id: str | None) -> dict:
        """Mount the inspector — enables probe recording."""
        global_probe_registry().mount()
        return {"id": msg_id, "ok": True, "mounted": True}

    def _handle_probe_unmount(self, msg_id: str | None) -> dict:
        """Unmount the inspector — disables probe recording (history preserved)."""
        global_probe_registry().unmount()
        return {"id": msg_id, "ok": True, "mounted": False}

    def _handle_probe_snapshot(self, msg_id: str | None) -> dict:
        """Return a snapshot of all probes and their most-recent readings.

        The snapshot is serialized to camelCase per IPC conventions.
        Each probe carries id, kind, label, track_id, effect_id, param_path,
        the bounded history (≤ 32 readings), and the latest reading.
        """
        snap = global_probe_registry().snapshot()

        probes_payload = {}
        for probe_id, probe in snap.probes.items():
            latest = probe.latest()
            probes_payload[probe_id] = {
                "id": probe.id,
                "kind": probe.kind.value,
                "label": probe.label,
                "trackId": probe.track_id,
                "effectId": probe.effect_id,
                "paramPath": probe.param_path,
                "history": [
                    {"value": r.value, "timestampS": r.timestamp_s}
                    for r in probe.history
                ],
                "latestValue": latest.value if latest is not None else None,
                "latestTimestampS": latest.timestamp_s if latest is not None else None,
            }

        return {
            "id": msg_id,
            "ok": True,
            "mounted": snap.mounted,
            "capturedAtS": snap.captured_at_s,
            "probes": probes_payload,
        }

    def _handle_routing_graph_get(self, message: dict, msg_id: str | None) -> dict:
        """Build a RoutingGraph projection and return it serialized.

        Expected payload:
          {
            cmd: "routing_graph_get",
            operators: [...],          # operator config list (same shape as render_frame)
            lanesByTrack: {            # track_id -> list of lane dicts
              "<track_id>": [
                {laneId, effectId, paramKey, label?}, ...
              ]
            },
            chainByTrack: {            # track_id -> effect chain list (backend snake_case)
              "<track_id>": [
                {effect_id, params: {...}, ...}, ...
              ]
            }
          }

        The frontend is the source of truth for all project stores. This command
        does NOT cache state server-side; every call is a fresh projection.

        Returns:
          {ok: True, nodes: [...], edges: [...], hasCycle: bool, cycleNodeIds: [...]}
          or {ok: False, error: str}
        """
        operators = message.get("operators")
        lanes_by_track_raw = message.get("lanesByTrack", {})
        chain_by_track_raw = message.get("chainByTrack", {})

        if not isinstance(operators, list):
            operators = []
        if not isinstance(lanes_by_track_raw, dict):
            lanes_by_track_raw = {}
        if not isinstance(chain_by_track_raw, dict):
            chain_by_track_raw = {}

        # Normalize: ensure values are lists
        lanes_by_track: dict[str, list[dict]] = {}
        for tid, lanes in lanes_by_track_raw.items():
            if isinstance(lanes, list):
                lanes_by_track[str(tid)] = lanes

        chain_by_track: dict[str, list[dict]] = {}
        for tid, chain in chain_by_track_raw.items():
            if isinstance(chain, list):
                chain_by_track[str(tid)] = chain

        try:
            graph = build_graph_from_project(operators, lanes_by_track, chain_by_track)
            payload = serialize_graph(graph)
        except Exception as exc:
            logging.getLogger(__name__).error(
                "routing_graph_get: unexpected error: %s", exc
            )
            return {"id": msg_id, "ok": False, "error": "Internal error building graph"}

        return {"id": msg_id, "ok": True, **payload}

    def _handle_routing_edge_update(self, message: dict, msg_id: str | None) -> dict:
        """Validate an edge depth/amount change and return the updated mapping.

        The graph is a PROJECTION — this command validates range and maps the
        edge id back to the underlying operator mapping fields so the frontend
        can commit the change to its store. No server-side state is mutated.

        Expected payload:
          {
            cmd: "routing_edge_update",
            edgeId: str,               # e.g. "op-edge:{op_id}:{effect_id}:{param}"
            amount: float,             # new depth/amount in [-1, 1]
            operators: [...],          # current operators (to locate the mapping)
            lanesByTrack: {...},
            chainByTrack: {...}
          }

        Returns:
          {ok: True, edgeId, amount, operatorId, targetEffectId, targetParamKey}
          or {ok: False, error: str}

        Trust boundary: edgeId is parsed; unknown edge id → error reply (no crash).
        Amount must be in [-1, 1]; out-of-range → rejected with error reply.
        """
        edge_id = message.get("edgeId") or message.get("edge_id")
        raw_amount = message.get("amount")

        if not edge_id:
            return {"id": msg_id, "ok": False, "error": "missing edgeId"}
        edge_id = str(edge_id)[:512]

        if raw_amount is None:
            return {"id": msg_id, "ok": False, "error": "missing amount"}
        try:
            amount = float(raw_amount)
        except (TypeError, ValueError):
            return {"id": msg_id, "ok": False, "error": "amount must be a number"}

        import math as _math

        if not _math.isfinite(amount):
            return {"id": msg_id, "ok": False, "error": "amount must be finite"}
        if not (-1.0 <= amount <= 1.0):
            return {
                "id": msg_id,
                "ok": False,
                "error": f"amount {amount!r} out of range [-1, 1]",
            }

        # Parse the edge id to recover operator_id / effect_id / param_key.
        # Format: "op-edge:{op_id}:{effect_id}:{param_key}"
        if not edge_id.startswith("op-edge:"):
            return {
                "id": msg_id,
                "ok": False,
                "error": f"unknown edge id {edge_id!r}; only operator edges are updatable",
            }

        # Rebuild the graph to validate the edge actually exists in the current state
        operators = message.get("operators")
        lanes_by_track_raw = message.get("lanesByTrack", {})
        chain_by_track_raw = message.get("chainByTrack", {})

        if not isinstance(operators, list):
            operators = []
        if not isinstance(lanes_by_track_raw, dict):
            lanes_by_track_raw = {}
        if not isinstance(chain_by_track_raw, dict):
            chain_by_track_raw = {}

        lanes_by_track: dict[str, list[dict]] = {}
        for tid, lanes in lanes_by_track_raw.items():
            if isinstance(lanes, list):
                lanes_by_track[str(tid)] = lanes

        chain_by_track: dict[str, list[dict]] = {}
        for tid, chain in chain_by_track_raw.items():
            if isinstance(chain, list):
                chain_by_track[str(tid)] = chain

        try:
            graph = build_graph_from_project(operators, lanes_by_track, chain_by_track)
        except Exception as exc:
            logging.getLogger(__name__).error(
                "routing_edge_update: error building graph: %s", exc
            )
            return {
                "id": msg_id,
                "ok": False,
                "error": "Internal error validating edge",
            }

        existing_edge = graph.get_edge(edge_id)
        if existing_edge is None:
            return {
                "id": msg_id,
                "ok": False,
                "error": f"edge id {edge_id!r} not found in current project state",
            }

        # Decompose: "op-edge:{op_id}:{effect_id}:{param_key}"
        # op_id may contain colons? No — operator IDs are alphanumeric per schema.
        # Split on first 3 colons after "op-edge:"
        remainder = edge_id[len("op-edge:") :]
        parts = remainder.split(":", 2)
        if len(parts) < 3:
            return {
                "id": msg_id,
                "ok": False,
                "error": f"malformed edge id {edge_id!r}",
            }
        op_id_part, effect_id_part, param_key_part = parts

        return {
            "id": msg_id,
            "ok": True,
            "edgeId": edge_id,
            "amount": amount,
            "operatorId": op_id_part,
            "targetEffectId": effect_id_part,
            "targetParamKey": param_key_part,
        }

    def close(self):
        # SG-8 (P5b.1): stop the pressure monitor thread on clean shutdown.
        # stop() is safe to call even if start() was never invoked (e.g. a test
        # that constructs ZMQServer + calls close() without run()).
        self.pressure_monitor.stop()
        self.audio_player.close()
        self.freeze_manager.reset()
        for reader in self.readers.values():
            reader.close()
        if self.shm_writer is not None:
            self.shm_writer.close()
        self.ping_socket.close()
        self.socket.close()
        self.context.term()
