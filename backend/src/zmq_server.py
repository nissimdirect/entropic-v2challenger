import base64
import collections
import logging
import time
import uuid

import numpy as np
import sentry_sdk
import zmq

from effects import registry
from engine.cache import encode_mjpeg
from engine.export import ExportManager
from engine.pipeline import apply_chain
from memory.writer import SharedMemoryWriter
from security import (
    validate_chain_depth,
    validate_frame_count,
    validate_output_path,
    validate_upload,
)
from audio.decoder import decode_audio
from video.ingest import probe
from video.reader import VideoReader


class ZMQServer:
    def __init__(self):
        self.context = zmq.Context()
        self.socket = self.context.socket(zmq.REP)
        self.socket.setsockopt(zmq.MAXMSGSIZE, 104857600)  # 100 MB limit
        self.port = self.socket.bind_to_random_port("tcp://127.0.0.1")
        # Dedicated ping socket — never blocked by heavy renders (BUG-4)
        self.ping_socket = self.context.socket(zmq.REP)
        self.ping_socket.setsockopt(zmq.MAXMSGSIZE, 104857600)  # 100 MB limit
        self.ping_port = self.ping_socket.bind_to_random_port("tcp://127.0.0.1")
        # Auth token — prevents unauthorized ZMQ access from other local processes
        self.token = str(uuid.uuid4())
        self.start_time = time.time()
        self.running = False
        self.shm_writer: SharedMemoryWriter | None = None
        self.readers: collections.OrderedDict[str, VideoReader] = (
            collections.OrderedDict()
        )
        self._max_readers = 10
        self.last_frame_ms = 0.0
        self.export_manager = ExportManager()

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

        if cmd == "ping":
            return self._make_ping_response(msg_id)
        elif cmd == "shutdown":
            self.running = False
            return {"id": msg_id, "ok": True}
        elif cmd == "ingest":
            return self._handle_ingest(message, msg_id)
        elif cmd == "seek":
            return self._handle_seek(message, msg_id)
        elif cmd == "render_frame":
            return self._handle_render_frame(message, msg_id)
        elif cmd == "apply_chain":
            return self._handle_apply_chain(message, msg_id)
        elif cmd == "list_effects":
            return {"id": msg_id, "ok": True, "effects": registry.list_all()}
        elif cmd == "audio_decode":
            return self._handle_audio_decode(message, msg_id)
        elif cmd == "export_start":
            return self._handle_export_start(message, msg_id)
        elif cmd == "export_status":
            return self._handle_export_status(msg_id)
        elif cmd == "export_cancel":
            return self._handle_export_cancel(msg_id)
        elif cmd == "flush_state":
            return {"id": msg_id, "ok": True}
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

        result = probe(path)
        result["id"] = msg_id

        # SEC-6: Validate frame count
        if result.get("ok") and result.get("frame_count", 0) > 0:
            fc_errors = validate_frame_count(result["frame_count"])
            if fc_errors:
                return {"id": msg_id, "ok": False, "error": "; ".join(fc_errors)}

        # Store reader for reuse
        if result.get("ok"):
            self._get_reader(path)

        return result

    def _handle_seek(self, message: dict, msg_id: str | None) -> dict:
        path = message.get("path")
        time_s = message.get("time", 0.0)
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
                time_s = message.get("time", 0.0)
                frame_index = int(time_s * reader.fps)

            # F-3: Bounds check on frame_index
            if frame_index < 0:
                return {
                    "id": msg_id,
                    "ok": False,
                    "error": "frame_index must be non-negative",
                }
            if (
                hasattr(reader, "frame_count")
                and reader.frame_count
                and frame_index >= reader.frame_count
            ):
                return {
                    "id": msg_id,
                    "ok": False,
                    "error": f"frame_index {frame_index} exceeds frame count {reader.frame_count}",
                }

            t0 = time.time()
            frame = reader.decode_frame(frame_index)
            resolution = (reader.width, reader.height)

            # Use pipeline engine
            output, _ = apply_chain(frame, chain, project_seed, frame_index, resolution)

            # Encode once for base64 transport (skip mmap — Electron uses base64)
            jpeg_bytes = encode_mjpeg(output)
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

            if (
                hasattr(reader, "frame_count")
                and reader.frame_count
                and frame_index >= reader.frame_count
            ):
                return {
                    "id": msg_id,
                    "ok": False,
                    "error": f"frame_index {frame_index} exceeds frame count {reader.frame_count}",
                }

            t0 = time.time()
            frame = reader.decode_frame(frame_index)
            resolution = (reader.width, reader.height)

            output, _ = apply_chain(frame, chain, project_seed, frame_index, resolution)

            shm = self._ensure_shm()
            shm.write_frame(output)
            self.last_frame_ms = round((time.time() - t0) * 1000, 2)
            return {"id": msg_id, "ok": True, "frame_index": frame_index}
        except Exception as e:
            sentry_sdk.capture_exception(e)
            logging.getLogger(__name__).error(f"Apply chain handler error: {e}")
            return {"id": msg_id, "ok": False, "error": "Internal processing error"}

    def _handle_audio_decode(self, message: dict, msg_id: str | None) -> dict:
        path = message.get("path")
        if not path:
            return {"id": msg_id, "ok": False, "error": "missing path"}

        # SEC-5: Validate path
        errors = validate_upload(path)
        if errors:
            return {"id": msg_id, "ok": False, "error": "; ".join(errors)}

        start_s = float(message.get("start_s", 0.0))
        duration_s = message.get("duration_s")
        if duration_s is not None:
            duration_s = float(duration_s)

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

    def _handle_export_start(self, message: dict, msg_id: str | None) -> dict:
        input_path = message.get("input_path")
        output_path = message.get("output_path")
        chain = message.get("chain", [])
        project_seed = message.get("project_seed", 0)

        if not input_path:
            return {"id": msg_id, "ok": False, "error": "missing input_path"}
        if not output_path:
            return {"id": msg_id, "ok": False, "error": "missing output_path"}

        # SEC-5: Validate input path (prevents path traversal via export)
        errors = validate_upload(input_path)
        if errors:
            return {"id": msg_id, "ok": False, "error": "; ".join(errors)}

        # Validate output path (prevents writing to system dirs)
        out_errors = validate_output_path(output_path)
        if out_errors:
            return {"id": msg_id, "ok": False, "error": "; ".join(out_errors)}

        # SEC-7: Validate chain depth
        errors = validate_chain_depth(chain)
        if errors:
            return {"id": msg_id, "ok": False, "error": "; ".join(errors)}

        try:
            self.export_manager.start(input_path, output_path, chain, project_seed)
            return {"id": msg_id, "ok": True}
        except RuntimeError as e:
            sentry_sdk.capture_exception(e)
            logging.getLogger(__name__).error(f"Export start handler error: {e}")
            return {"id": msg_id, "ok": False, "error": "Internal processing error"}

    def _handle_export_status(self, msg_id: str | None) -> dict:
        status = self.export_manager.get_status()
        status["id"] = msg_id
        status["ok"] = True
        return status

    def _handle_export_cancel(self, msg_id: str | None) -> dict:
        cancelled = self.export_manager.cancel()
        return {"id": msg_id, "ok": True, "cancelled": cancelled}

    def _get_reader(self, path: str) -> VideoReader:
        if path in self.readers:
            self.readers.move_to_end(path)
            return self.readers[path]
        # Evict oldest reader if cache is full
        while len(self.readers) >= self._max_readers:
            _, oldest = self.readers.popitem(last=False)
            oldest.close()
        reader = VideoReader(path)
        self.readers[path] = reader
        return reader

    def run(self):
        self.running = True
        poller = zmq.Poller()
        poller.register(self.socket, zmq.POLLIN)
        poller.register(self.ping_socket, zmq.POLLIN)
        while self.running:
            events = dict(poller.poll(timeout=500))
            # Handle ping socket first (lightweight, never blocked)
            if self.ping_socket in events:
                message = self.ping_socket.recv_json()
                msg_id = message.get("id")
                token_err = self._validate_token(message)
                if token_err:
                    self.ping_socket.send_json(
                        {"id": msg_id, "ok": False, "error": token_err}
                    )
                else:
                    self.ping_socket.send_json(self._make_ping_response(msg_id))
            # Handle main command socket
            if self.socket in events:
                message = self.socket.recv_json()
                response = self.handle_message(message)
                self.socket.send_json(response)
        self.close()

    def close(self):
        for reader in self.readers.values():
            reader.close()
        if self.shm_writer is not None:
            self.shm_writer.close()
        self.ping_socket.close()
        self.socket.close()
        self.context.term()
