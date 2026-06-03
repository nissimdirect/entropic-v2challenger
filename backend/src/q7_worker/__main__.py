"""Q7 L-backbone worker (PR #9 real impl — replaces PR #4 stub).

Spawned as a SEPARATE Python process from the main render sidecar per
DEC-Q7-008. Binds a ZMQ REP socket on a configurable port. Accepts:

  - {cmd: 'ping'}                                    → {ok: true, ...}
  - {cmd: 'encode', payload: {model, image|text|audio, ...}} → embedding
  - {cmd: 'stats'}                                   → encode/error counts
  - {cmd: 'shutdown'}                                → reply then exit

Run via:
    python3 -m q7_worker --port 6099 [--backend mps|cpu|mlx]
"""

from __future__ import annotations

import argparse
import signal
import sys
import time

import zmq

from . import __version__
from .dispatcher import Dispatcher

DEFAULT_PORT = 6099
SCHEMA_TAG = "q7-worker-v1"
IDLE_LOG_INTERVAL_S = 60.0

_SHUTDOWN_FLAG = {"requested": False}


def _signal_handler(signum, _frame):  # noqa: ANN001
    sys.stderr.write(f"q7_worker: signal {signum} received, shutting down\n")
    sys.stderr.flush()
    _SHUTDOWN_FLAG["requested"] = True


def _build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="q7_worker",
        description="Q7 L-backbone worker (PR #9). Spawns the L inference subprocess.",
    )
    p.add_argument("--port", type=int, default=DEFAULT_PORT, help="ZMQ REP bind port")
    p.add_argument(
        "--bind",
        type=str,
        default="127.0.0.1",
        help="ZMQ bind address (default localhost)",
    )
    p.add_argument(
        "--backend",
        type=str,
        choices=["mlx", "mps", "cpu"],
        default="cpu",
        help="Backend selection (DEC-Q7-004 cascade). 'cpu' is the safe default.",
    )
    p.add_argument(
        "--once", action="store_true", help="Process one request and exit (for tests)."
    )
    return p


def _handle_ping(req: dict) -> dict:
    return {
        "ok": True,
        "id": req.get("id"),
        "schema": SCHEMA_TAG,
        "version": __version__,
    }


def main(argv: list[str] | None = None) -> int:
    args = _build_parser().parse_args(argv)

    signal.signal(signal.SIGTERM, _signal_handler)
    signal.signal(signal.SIGINT, _signal_handler)

    dispatcher = Dispatcher(backend=args.backend)

    ctx = zmq.Context()
    sock = ctx.socket(zmq.REP)
    sock.setsockopt(zmq.LINGER, 0)
    sock.setsockopt(zmq.RCVTIMEO, 1000)
    addr = f"tcp://{args.bind}:{args.port}"
    sock.bind(addr)
    sys.stderr.write(
        f"q7_worker {__version__} listening on {addr} (backend={args.backend})\n"
    )
    sys.stderr.flush()

    last_activity = time.monotonic()
    try:
        while not _SHUTDOWN_FLAG["requested"]:
            try:
                req = sock.recv_json()
            except zmq.Again:
                now = time.monotonic()
                if now - last_activity > IDLE_LOG_INTERVAL_S:
                    sys.stderr.write(
                        f"q7_worker: idle for {now - last_activity:.0f}s\n"
                    )
                    sys.stderr.flush()
                    last_activity = now
                continue
            last_activity = time.monotonic()

            if not isinstance(req, dict):
                sock.send_json({"ok": False, "error": "non-dict request"})
                continue

            cmd = str(req.get("cmd", ""))
            if cmd == "ping":
                resp = _handle_ping(req)
            elif cmd == "encode":
                payload = req.get("payload") or {}
                resp = dispatcher.handle_encode(payload)
                resp.setdefault("id", req.get("id"))
            elif cmd == "stats":
                resp = dispatcher.handle_stats()
                resp.setdefault("id", req.get("id"))
            elif cmd == "shutdown":
                resp = {"ok": True, "id": req.get("id"), "message": "shutting down"}
                sock.send_json(resp)
                break
            else:
                resp = {
                    "ok": False,
                    "id": req.get("id"),
                    "error": f"unknown cmd: {cmd!r}",
                }
            sock.send_json(resp)
            if args.once:
                break
    finally:
        sock.close(linger=0)
        ctx.term()
        sys.stderr.write("q7_worker: shut down cleanly\n")
        sys.stderr.flush()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
