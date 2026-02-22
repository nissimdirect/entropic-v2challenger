import base64
import time

import sentry_sdk
import zmq

from effects import registry
from engine.cache import encode_mjpeg
from engine.export import ExportManager
from engine.pipeline import apply_chain
from memory.writer import SharedMemoryWriter
from security import validate_chain_depth, validate_frame_count, validate_upload
from video.ingest import probe
from video.reader import VideoReader


class ZMQServer:
    def __init__(self):
        self.context = zmq.Context()
        self.socket = self.context.socket(zmq.REP)
        self.port = self.socket.bind_to_random_port("tcp://127.0.0.1")
        self.start_time = time.time()
        self.running = False
        self.shm_writer: SharedMemoryWriter | None = None
        self.readers: dict[str, VideoReader] = {}
        self.last_frame_ms = 0.0
        self.export_manager = ExportManager()

    def _ensure_shm(self) -> SharedMemoryWriter:
        if self.shm_writer is None:
            self.shm_writer = SharedMemoryWriter()
        return self.shm_writer

    def handle_message(self, message: dict) -> dict:
        cmd = message.get("cmd")
        msg_id = message.get("id")

        if cmd == "ping":
            return {
                "id": msg_id,
                "status": "alive",
                "uptime_s": round(time.time() - self.start_time, 1),
                "last_frame_ms": self.last_frame_ms,
            }
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
        try:
            reader = self._get_reader(path)
            frame_index = int(time_s * reader.fps)
            t0 = time.time()
            frame = reader.decode_frame(frame_index)
            shm = self._ensure_shm()
            shm.write_frame(frame)
            # Interim: also return frame as base64 MJPEG for ZMQ transport
            # (until C++ shared memory module is ready)
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
            return {"id": msg_id, "ok": False, "error": str(e)}

    def _handle_render_frame(self, message: dict, msg_id: str | None) -> dict:
        path = message.get("path")
        time_s = message.get("time", 0.0)
        chain = message.get("chain", [])
        project_seed = message.get("project_seed", 0)
        if not path:
            return {"id": msg_id, "ok": False, "error": "missing path"}
        try:
            reader = self._get_reader(path)
            frame_index = int(time_s * reader.fps)
            t0 = time.time()
            frame = reader.decode_frame(frame_index)
            resolution = (reader.width, reader.height)

            # Use pipeline engine
            output, _ = apply_chain(frame, chain, project_seed, frame_index, resolution)

            shm = self._ensure_shm()
            shm.write_frame(output)
            # Interim: also return frame as base64 MJPEG for ZMQ transport
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
            return {"id": msg_id, "ok": False, "error": str(e)}

    def _handle_apply_chain(self, message: dict, msg_id: str | None) -> dict:
        path = message.get("path")
        frame_index = message.get("frame_index", 0)
        chain = message.get("chain", [])
        project_seed = message.get("project_seed", 0)
        if not path:
            return {"id": msg_id, "ok": False, "error": "missing path"}

        # SEC-7: Validate chain depth
        errors = validate_chain_depth(chain)
        if errors:
            return {"id": msg_id, "ok": False, "error": "; ".join(errors)}

        try:
            reader = self._get_reader(path)
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
            return {"id": msg_id, "ok": False, "error": str(e)}

    def _handle_export_start(self, message: dict, msg_id: str | None) -> dict:
        input_path = message.get("input_path")
        output_path = message.get("output_path")
        chain = message.get("chain", [])
        project_seed = message.get("project_seed", 0)

        if not input_path:
            return {"id": msg_id, "ok": False, "error": "missing input_path"}
        if not output_path:
            return {"id": msg_id, "ok": False, "error": "missing output_path"}

        # SEC-7: Validate chain depth
        errors = validate_chain_depth(chain)
        if errors:
            return {"id": msg_id, "ok": False, "error": "; ".join(errors)}

        try:
            self.export_manager.start(input_path, output_path, chain, project_seed)
            return {"id": msg_id, "ok": True}
        except RuntimeError as e:
            sentry_sdk.capture_exception(e)
            return {"id": msg_id, "ok": False, "error": str(e)}

    def _handle_export_status(self, msg_id: str | None) -> dict:
        status = self.export_manager.get_status()
        status["id"] = msg_id
        status["ok"] = True
        return status

    def _handle_export_cancel(self, msg_id: str | None) -> dict:
        cancelled = self.export_manager.cancel()
        return {"id": msg_id, "ok": True, "cancelled": cancelled}

    def _get_reader(self, path: str) -> VideoReader:
        if path not in self.readers:
            self.readers[path] = VideoReader(path)
        return self.readers[path]

    def run(self):
        self.running = True
        poller = zmq.Poller()
        poller.register(self.socket, zmq.POLLIN)
        while self.running:
            events = dict(poller.poll(timeout=500))
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
        self.socket.close()
        self.context.term()
