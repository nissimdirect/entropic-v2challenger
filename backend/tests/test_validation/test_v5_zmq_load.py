"""V5: ZMQ Command Latency Under Load — measure ping and list_effects round-trip
times while a background thread writes frames to shared memory at ~30fps.
PASS: P95 round-trip < 10ms for both commands.
"""

import threading
import time
import uuid

import numpy as np


def _background_frame_writer(stop_event: threading.Event, fps: int = 30):
    """Write synthetic frames to shared memory at ~fps until stop_event is set."""
    from memory.writer import SharedMemoryWriter

    shm = SharedMemoryWriter()
    frame = np.zeros((720, 1280, 4), dtype=np.uint8)
    frame[:, :, 3] = 255  # opaque alpha
    interval = 1.0 / fps
    try:
        while not stop_event.is_set():
            # Vary the frame slightly so MJPEG encoding isn't degenerate
            frame[:, :, 0] = np.random.randint(0, 256, dtype=np.uint8)
            shm.write_frame(frame)
            stop_event.wait(interval)
    finally:
        shm.close()


def test_v5_zmq_ping_latency_under_load(zmq_server, zmq_client):
    """Send 60 ping commands while background thread writes 30fps frames.
    PASS: P95 round-trip < 10ms."""
    stop = threading.Event()
    writer_thread = threading.Thread(
        target=_background_frame_writer, args=(stop,), daemon=True
    )
    writer_thread.start()

    # Let the writer spin up
    time.sleep(0.15)

    n_commands = 60
    times = []
    try:
        for _ in range(n_commands):
            msg_id = str(uuid.uuid4())
            t0 = time.perf_counter()
            zmq_client.send_json({"cmd": "ping", "id": msg_id})
            resp = zmq_client.recv_json()
            elapsed_ms = (time.perf_counter() - t0) * 1000
            times.append(elapsed_ms)
            assert resp["id"] == msg_id
            assert resp["status"] == "alive"
    finally:
        stop.set()
        writer_thread.join(timeout=2)

    p95 = sorted(times)[int(len(times) * 0.95)]
    avg_ms = sum(times) / len(times)
    print(f"\n  ping latency: avg={avg_ms:.2f}ms  P95={p95:.2f}ms  n={n_commands}")
    assert p95 < 10.0, f"P95 ping latency {p95:.2f}ms exceeds 10ms budget"


def test_v5_list_effects_latency(zmq_server, zmq_client):
    """Send 60 list_effects commands while background thread writes 30fps frames.
    PASS: P95 round-trip < 10ms."""
    stop = threading.Event()
    writer_thread = threading.Thread(
        target=_background_frame_writer, args=(stop,), daemon=True
    )
    writer_thread.start()

    time.sleep(0.15)

    n_commands = 60
    times = []
    try:
        for _ in range(n_commands):
            msg_id = str(uuid.uuid4())
            t0 = time.perf_counter()
            zmq_client.send_json({"cmd": "list_effects", "id": msg_id})
            resp = zmq_client.recv_json()
            elapsed_ms = (time.perf_counter() - t0) * 1000
            times.append(elapsed_ms)
            assert resp["id"] == msg_id
            assert resp["ok"] is True
            assert len(resp["effects"]) > 0
    finally:
        stop.set()
        writer_thread.join(timeout=2)

    p95 = sorted(times)[int(len(times) * 0.95)]
    avg_ms = sum(times) / len(times)
    print(
        f"\n  list_effects latency: avg={avg_ms:.2f}ms  P95={p95:.2f}ms  n={n_commands}"
    )
    assert p95 < 10.0, f"P95 list_effects latency {p95:.2f}ms exceeds 10ms budget"
