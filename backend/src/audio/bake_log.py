"""Bake-session logger — append-only JSONL telemetry for the audio-tracks bake.

The audio-tracks 1-week user bake (PR-4 gate) must be machine-checkable, not
vibes. This module appends one JSONL line per audio session to
``~/.creatrix/audio-bake-log.jsonl`` so ``scripts/check_bake_gate.py`` can prove
the bake actually happened (≥7 distinct days, ≥2h cumulative, zero callback
errors).

Line schema (``schema: 1``)::

    {
      "schema": 1,
      "ts_start": "<iso8601>",
      "ts_end": "<iso8601>",
      "duration_s": <float>,
      "device": "<sounddevice device name>",
      "callback_errors": <int session delta>,
      "flag_on": <bool>
    }

HARD REQUIREMENT — fail-silent: every filesystem / serialization operation here
is wrapped so that an I/O error appending the log NEVER raises into the audio
start/stop path. A broken log must never kill playback. The log is append-only
(``open(..., "a")`` + flush per line).

Test override: set ``CREATRIX_BAKE_LOG=<path>`` to redirect the log file.
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path

log = logging.getLogger(__name__)

SCHEMA_VERSION = 1

_DEFAULT_LOG_PATH = Path.home() / ".creatrix" / "audio-bake-log.jsonl"


def bake_log_path() -> Path:
    """Resolve the bake-log path, honoring the ``CREATRIX_BAKE_LOG`` override.

    Never raises — falls back to the default path if the env var is unusable.
    """
    try:
        override = os.environ.get("CREATRIX_BAKE_LOG", "").strip()
        if override:
            return Path(override)
    except Exception:  # pragma: no cover — os.environ access should not fail
        pass
    return _DEFAULT_LOG_PATH


def now_iso() -> str:
    """Current UTC time as an ISO-8601 string. Never raises."""
    try:
        return datetime.now(timezone.utc).isoformat()
    except Exception:  # pragma: no cover
        return ""


def append_session(
    *,
    ts_start: str,
    ts_end: str,
    duration_s: float,
    device: str,
    callback_errors: int,
    flag_on: bool,
) -> bool:
    """Append one bake-session JSONL line. Fail-silent.

    Returns True on a successful write, False if anything went wrong (the
    failure is swallowed and logged at debug level — it never propagates into
    the audio path). Append-only: opens in "a" mode and flushes per line.
    """
    try:
        record = {
            "schema": SCHEMA_VERSION,
            "ts_start": ts_start,
            "ts_end": ts_end,
            "duration_s": float(duration_s),
            "device": str(device),
            "callback_errors": int(callback_errors),
            "flag_on": bool(flag_on),
        }
        line = json.dumps(record, separators=(",", ":"))
        path = bake_log_path()
        # Best-effort parent-dir creation; swallow if it fails.
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
        except Exception:
            pass
        with open(path, "a", encoding="utf-8") as fh:
            fh.write(line + "\n")
            fh.flush()
        return True
    except Exception as e:
        # Fail-silent — an unwritable log must NEVER break the audio path.
        try:
            log.debug("bake_log.append_session swallowed error: %s", e)
        except Exception:
            pass
        return False
