import time

import zmq

from effects import registry
from engine.container import EffectContainer
from memory.writer import SharedMemoryWriter
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
        elif cmd == "list_effects":
            return {"id": msg_id, "ok": True, "effects": registry.list_all()}
        elif cmd == "flush_state":
            return {"id": msg_id, "ok": True}
        else:
            return {"id": msg_id, "ok": False, "error": f"unknown: {cmd}"}

    def _handle_ingest(self, message: dict, msg_id: str | None) -> dict:
        path = message.get("path")
        if not path:
            return {"id": msg_id, "ok": False, "error": "missing path"}
        result = probe(path)
        result["id"] = msg_id
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
            self.last_frame_ms = round((time.time() - t0) * 1000, 2)
            return {"id": msg_id, "ok": True, "frame_index": frame_index}
        except Exception as e:
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

            # Run effect chain
            for effect_instance in chain:
                effect_id = effect_instance.get("effect_id")
                params = effect_instance.get("params", {})
                effect_info = registry.get(effect_id)
                if effect_info is None:
                    return {
                        "id": msg_id,
                        "ok": False,
                        "error": f"unknown effect: {effect_id}",
                    }
                container = EffectContainer(effect_info["fn"], effect_id)
                frame, _ = container.process(
                    frame,
                    params,
                    None,
                    frame_index=frame_index,
                    project_seed=project_seed,
                    resolution=resolution,
                )

            shm = self._ensure_shm()
            shm.write_frame(frame)
            self.last_frame_ms = round((time.time() - t0) * 1000, 2)
            return {"id": msg_id, "ok": True, "frame_index": frame_index}
        except Exception as e:
            return {"id": msg_id, "ok": False, "error": str(e)}

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
