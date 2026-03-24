import base64
import collections
import json
import logging
import time
import uuid

import numpy as np
import sentry_sdk
import zmq

from effects import registry
from engine.cache import encode_mjpeg
from engine.codecs import CODEC_REGISTRY
from engine.export import ExportManager
from engine.freeze import FreezeManager
from engine.compositor import render_composite
from engine.guards import clamp_finite, guard_positive
from engine.pipeline import (
    apply_chain,
    flush_timing,
    get_effect_health,
    get_effect_stats,
)
from memory.writer import SharedMemoryWriter
from security import (
    validate_chain_depth,
    validate_frame_count,
    validate_output_directory,
    validate_output_path,
    validate_upload,
)
from audio.decoder import decode_audio
from audio.clock import AVClock
from audio.player import AudioPlayer
from audio.waveform import compute_peaks
from engine.text_renderer import list_system_fonts, render_text_frame
from video.image_reader import ImageReader, is_image_file
from video.ingest import probe, probe_image
from video.reader import VideoReader
import diagnostics as _diagnostics_mod


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
        self.export_manager = ExportManager()
        self.freeze_manager = FreezeManager()
        # Waveform peak cache — keyed by (path, num_bins), LRU eviction
        self._waveform_cache: collections.OrderedDict[tuple[str, int], list] = (
            collections.OrderedDict()
        )
        self._max_waveform_cache = 10
        # Audio playback engine
        self.audio_player = AudioPlayer()
        # A/V sync clock — audio master, video slave
        self.av_clock = AVClock(self.audio_player)
        # Sentry breadcrumb rate-limiter for render_frame (every 30th frame)
        self._breadcrumb_frame_counter = 0
        # Signal engine for operator modulation (Phase 6A)
        self._signal_engine = None
        self._signal_state: dict = {}

    def reset_state(self):
        """Clear accumulated state without closing sockets/context.

        Used by session-scoped test fixtures to reset between tests
        while keeping the server running.
        """
        # Close and clear video readers
        for reader in self.readers.values():
            reader.close()
        self.readers.clear()

        # Clear waveform cache
        self._waveform_cache.clear()

        # Reset audio player (stop playback, unload)
        self.audio_player.stop()

        # Reset A/V clock
        self.av_clock = AVClock(self.audio_player)

        # Cancel any in-flight export
        self.export_manager.cancel()
        self.export_manager = ExportManager()

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

        # Reset freeze caches
        self.freeze_manager.reset()

    def _ensure_shm(self) -> SharedMemoryWriter:
        if self.shm_writer is None:
            self.shm_writer = SharedMemoryWriter()
        return self.shm_writer

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
        elif cmd == "audio_stop":
            return self._handle_audio_stop(msg_id)
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
            return {"id": msg_id, "ok": True}
        elif cmd == "freeze_prefix":
            return self._handle_freeze_prefix(message, msg_id)
        elif cmd == "read_freeze":
            return self._handle_read_freeze(message, msg_id)
        elif cmd == "flatten":
            return self._handle_flatten(message, msg_id)
        elif cmd == "invalidate_cache":
            return self._handle_invalidate_cache(message, msg_id)
        elif cmd == "memory_status":
            return self._handle_memory_status(msg_id)
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

    def _handle_render_frame(self, message: dict, msg_id: str | None) -> dict:
        path = message.get("path")
        chain = message.get("chain", [])
        project_seed = message.get("project_seed", 0)
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
            reader = self._get_reader(path)
            # Accept frame_index directly, fall back to time_s * fps
            if "frame_index" in message:
                frame_index = int(message["frame_index"])
            else:
                time_s = clamp_finite(
                    float(message.get("time", 0.0)), 0.0, 86400.0, 0.0
                )
                frame_index = int(time_s * reader.fps)

            # F-3: Bounds check on frame_index
            if frame_index < 0:
                return {
                    "id": msg_id,
                    "ok": False,
                    "error": "frame_index must be non-negative",
                }
            # Clamp to last valid frame instead of rejecting —
            # audio clock can overshoot video frame count by 1-2 frames
            if (
                hasattr(reader, "frame_count")
                and reader.frame_count
                and frame_index >= reader.frame_count
            ):
                frame_index = reader.frame_count - 1

            t0 = time.time()
            frame = reader.decode_frame(frame_index)
            resolution = (reader.width, reader.height)

            # Phase 6A: Apply operator modulation if operators present
            operators = message.get("operators")
            operator_values = None
            if operators and isinstance(operators, list):
                engine = self._get_signal_engine()
                # Get audio PCM window for audio follower
                audio_pcm = self._get_audio_pcm_for_frame(frame_index, reader.fps)
                audio_sr = (
                    self.audio_player._sample_rate
                    if self.audio_player.loaded
                    else 44100
                )
                operator_values, self._signal_state = engine.evaluate_all(
                    operators,
                    frame_index,
                    reader.fps,
                    audio_pcm=audio_pcm,
                    audio_sample_rate=audio_sr,
                    video_frame=frame,
                    state=self._signal_state,
                )
                # Phase 7: Extract automation overrides from frontend
                auto_overrides = message.get("automation_overrides")
                if auto_overrides and not isinstance(auto_overrides, dict):
                    auto_overrides = None

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

            # Use pipeline engine
            output, _ = apply_chain(frame, chain, project_seed, frame_index, resolution)

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

            output, _ = apply_chain(frame, chain, project_seed, frame_index, resolution)

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

    def _handle_render_composite(self, message: dict, msg_id: str | None) -> dict:
        raw_layers = message.get("layers", [])
        resolution = message.get("resolution", [1920, 1080])
        project_seed = message.get("project_seed", 0)

        if not isinstance(raw_layers, list):
            return {"id": msg_id, "ok": False, "error": "layers must be a list"}

        try:
            layers = []
            for layer_info in raw_layers:
                layer_type = layer_info.get("layer_type", "video")
                chain = layer_info.get("chain", [])
                # SEC-7: Validate chain depth per layer
                errors = validate_chain_depth(chain)
                if errors:
                    return {"id": msg_id, "ok": False, "error": "; ".join(errors)}

                frame_index = int(layer_info.get("frame_index", 0))
                opacity = clamp_finite(
                    float(layer_info.get("opacity", 1.0)), 0.0, 1.0, 1.0
                )
                blend_mode = layer_info.get("blend_mode", "normal")

                if layer_type == "text":
                    # Text layer — render text config to RGBA frame
                    text_config = layer_info.get("text_config")
                    if not text_config:
                        continue
                    fps = float(layer_info.get("fps", 30.0))
                    frame = render_text_frame(
                        text_config, tuple(resolution), frame_index, fps
                    )
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
                    frame = reader.decode_frame(frame_index)

                    # Apply per-layer clip transform if present
                    layer_transform = layer_info.get("transform")
                    if layer_transform and isinstance(layer_transform, dict):
                        frame = self._apply_clip_transform(
                            frame, layer_transform, tuple(resolution)
                        )

                layers.append(
                    {
                        "frame": frame,
                        "chain": chain,
                        "opacity": opacity,
                        "blend_mode": blend_mode,
                        "frame_index": frame_index,
                    }
                )

            t0 = time.time()
            output = render_composite(layers, tuple(resolution), project_seed)

            jpeg_bytes = encode_mjpeg(output)
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
            logging.getLogger(__name__).error(f"Render composite handler error: {e}")
            return {"id": msg_id, "ok": False, "error": "Internal processing error"}

    def _handle_audio_decode(self, message: dict, msg_id: str | None) -> dict:
        path = message.get("path")
        if not path:
            return {"id": msg_id, "ok": False, "error": "missing path"}

        # SEC-5: Validate path
        errors = validate_upload(path)
        if errors:
            return {"id": msg_id, "ok": False, "error": "; ".join(errors)}

        start_s = clamp_finite(float(message.get("start_s", 0.0)), 0.0, 86400.0, 0.0)
        duration_s = message.get("duration_s")
        if duration_s is not None:
            duration_s = clamp_finite(float(duration_s), 0.0, 86400.0, 1.0)

        try:
            result = decode_audio(path, start_s=start_s, duration_s=duration_s)
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

        # SEC-5: Validate path
        errors = validate_upload(path)
        if errors:
            return {"id": msg_id, "ok": False, "error": "; ".join(errors)}

        # Check cache
        cache_key = (path, num_bins)
        if cache_key in self._waveform_cache:
            return {
                "id": msg_id,
                "ok": True,
                "peaks": self._waveform_cache[cache_key],
                "num_bins": num_bins,
                "cached": True,
            }

        try:
            result = decode_audio(path)
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

        errors = validate_upload(path)
        if errors:
            return {"id": msg_id, "ok": False, "error": "; ".join(errors)}

        try:
            result = self.audio_player.load(path)
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

        try:
            self.export_manager.start(
                input_path,
                output_path,
                chain,
                project_seed,
                settings=settings,
                text_layers=text_layers or None,
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
        resolution = [
            max(1, min(8192, int(raw_res[0]))),
            max(1, min(8192, int(raw_res[1]))),
        ]
        frame_index = max(0, int(message.get("frame_index", 0)))
        fps = max(1.0, min(120.0, float(message.get("fps", 30.0))))

        try:
            t0 = time.time()
            frame = render_text_frame(text_config, tuple(resolution), frame_index, fps)
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
        """Apply position/scale/rotation transform to frame.

        All values are clamped at the trust boundary via clamp_finite.
        """
        import cv2

        try:
            scale = clamp_finite(float(transform.get("scale", 1.0)), 0.01, 4.0, 1.0)
            rotation = clamp_finite(
                float(transform.get("rotation", 0.0)), -360.0, 360.0, 0.0
            )
            tx = clamp_finite(float(transform.get("x", 0.0)), -10000.0, 10000.0, 0.0)
            ty = clamp_finite(float(transform.get("y", 0.0)), -10000.0, 10000.0, 0.0)
        except (ValueError, TypeError):
            return frame  # Malformed transform values — render unmodified

        # No-op check
        if scale == 1.0 and rotation == 0.0 and tx == 0.0 and ty == 0.0:
            return frame

        h, w = frame.shape[:2]
        canvas_w, canvas_h = resolution

        # Scale
        if scale != 1.0:
            new_w = max(1, int(w * scale))
            new_h = max(1, int(h * scale))
            frame = cv2.resize(frame, (new_w, new_h), interpolation=cv2.INTER_LINEAR)
            h, w = frame.shape[:2]

        # Create canvas and center the frame
        canvas = np.zeros((canvas_h, canvas_w, 3), dtype=np.uint8)
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

        # Rotation (around center of canvas)
        if rotation != 0.0:
            center = (canvas_w / 2, canvas_h / 2)
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
        resolution = message.get("resolution", [1280, 720])

        if not asset_path or not isinstance(asset_path, str):
            return {"id": msg_id, "ok": False, "error": "asset_path required"}

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

    def run(self):
        self.running = True
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
                        "Unhandled handler error: %s", type(e).__name__
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

    def close(self):
        self.audio_player.close()
        self.freeze_manager.reset()
        for reader in self.readers.values():
            reader.close()
        if self.shm_writer is not None:
            self.shm_writer.close()
        self.ping_socket.close()
        self.socket.close()
        self.context.term()
