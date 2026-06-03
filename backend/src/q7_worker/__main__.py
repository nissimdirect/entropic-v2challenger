"""Q7 L-backbone worker — STUB entry-point.

PR #4 scope: prove the separate-process topology from DEC-Q7-008 works.
The worker binds a ZMQ REP socket on the chosen port, accepts {cmd, id,
_token, payload} messages, and responds to:

  - cmd='ping'    → {ok: true, schema: 'q7-worker-stub', version: '0.0.1'}
  - cmd='encode'  → {ok: true, embedding: <synthetic 384/512-dim vector>,
                     embed_dim: <dim>, backend: 'stub'}
  - cmd='shutdown' → {ok: true, message: 'shutting down'}, then exits

NO real models are loaded. PR #9 replaces this stub with the actual L
backbone worker that lazy-loads DINOv2 + CLIP + CLAP, manages the
shared queue, and obeys SG-3 / SG-4 / SG-8 contracts.
"""

from __future__ import annotations

import argparse
import sys

import zmq

from . import __version__

STUB_SCHEMA = "q7-worker-stub"
DEFAULT_PORT = 6099


def _make_synth_embedding(name: str, dim: int) -> list[float]:
    """Deterministic synthetic embedding based on model name + dim."""
    import random

    rng = random.Random(f"q7-worker-stub:{name}:{dim}")
    vec = [rng.uniform(-1.0, 1.0) for _ in range(dim)]
    # Don't bother L2-normalizing; the stub is for IPC shape, not real maths.
    return vec


def _handle_ping(req: dict) -> dict:
    return {
        "ok": True,
        "id": req.get("id"),
        "schema": STUB_SCHEMA,
        "version": __version__,
    }


def _handle_encode(req: dict) -> dict:
    payload = req.get("payload") or {}
    model_name = str(payload.get("model", "dinov2"))
    embed_dim = {"dinov2": 384, "clip": 512, "clap": 512}.get(model_name, 384)
    return {
        "ok": True,
        "id": req.get("id"),
        "embedding": _make_synth_embedding(model_name, embed_dim),
        "embed_dim": embed_dim,
        "backend": "stub",
        "model": model_name,
    }


def _handle_shutdown(req: dict) -> dict:
    return {
        "ok": True,
        "id": req.get("id"),
        "message": "shutting down",
    }


DISPATCH = {
    "ping": _handle_ping,
    "encode": _handle_encode,
    "shutdown": _handle_shutdown,
}


def _build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="q7_worker",
        description="Q7 L-backbone worker — STUB (PR #4). Real impl in PR #9.",
    )
    p.add_argument("--port", type=int, default=DEFAULT_PORT, help="ZMQ REP bind port")
    p.add_argument(
        "--bind",
        type=str,
        default="127.0.0.1",
        help="ZMQ bind address (default: 127.0.0.1, localhost only)",
    )
    p.add_argument(
        "--once",
        action="store_true",
        help="Process one request and exit (for tests)",
    )
    return p


def main(argv: list[str] | None = None) -> int:
    args = _build_parser().parse_args(argv)
    ctx = zmq.Context()
    sock = ctx.socket(zmq.REP)
    addr = f"tcp://{args.bind}:{args.port}"
    sock.bind(addr)
    sys.stderr.write(f"q7_worker stub listening on {addr}\n")
    sys.stderr.flush()

    try:
        while True:
            req = sock.recv_json()
            if not isinstance(req, dict):
                sock.send_json({"ok": False, "error": "non-dict request"})
                continue
            cmd = str(req.get("cmd", ""))
            handler = DISPATCH.get(cmd)
            if handler is None:
                sock.send_json(
                    {
                        "ok": False,
                        "id": req.get("id"),
                        "error": f"unknown cmd: {cmd!r}",
                    }
                )
                continue
            resp = handler(req)
            sock.send_json(resp)
            if cmd == "shutdown" or args.once:
                break
    finally:
        sock.close(linger=0)
        ctx.term()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
