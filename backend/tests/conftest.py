import sys
import os
import threading
import time

import pytest
import zmq

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from zmq_server import ZMQServer


@pytest.fixture
def zmq_server():
    """Start a ZMQ server in a background thread."""
    srv = ZMQServer()
    thread = threading.Thread(target=srv.run, daemon=True)
    thread.start()
    time.sleep(0.1)
    yield srv
    srv.running = False
    time.sleep(0.6)  # Wait for poller timeout cycle


@pytest.fixture
def zmq_client(zmq_server):
    """REQ socket connected to the test server."""
    ctx = zmq.Context()
    sock = ctx.socket(zmq.REQ)
    sock.connect(f"tcp://127.0.0.1:{zmq_server.port}")
    yield sock
    sock.close()
    ctx.term()
