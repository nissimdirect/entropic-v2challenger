import time
import zmq


class ZMQServer:
    def __init__(self):
        self.context = zmq.Context()
        self.socket = self.context.socket(zmq.REP)
        self.port = self.socket.bind_to_random_port("tcp://127.0.0.1")
        self.start_time = time.time()
        self.running = False

    def handle_message(self, message: dict) -> dict:
        cmd = message.get("cmd")
        msg_id = message.get("id")

        if cmd == "ping":
            return {
                "id": msg_id,
                "status": "alive",
                "uptime_s": round(time.time() - self.start_time, 1),
            }
        elif cmd == "shutdown":
            self.running = False
            return {"id": msg_id, "ok": True}
        else:
            return {"id": msg_id, "ok": False, "error": f"unknown: {cmd}"}

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
        self.socket.close()
        self.context.term()
