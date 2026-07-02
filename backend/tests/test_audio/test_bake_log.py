"""Tests for the audio-tracks bake kit (PD.1) and its F6 hardening.

Covers:
  - PD.1a bake-session logger (``audio.bake_log`` + MixerPlayer hooks)
  - PD.1b gate-check script (``scripts/check_bake_gate.py``)
  - end-to-end: writer -> JSONL file -> gate reads it (schema agreement)
  - F6: suite-wide test isolation (zero writes to the REAL bake log),
    ``app_mode`` provenance, and the gate's noise/test-mode filtering

All MixerPlayer tests mock sounddevice (no real audio device opened).
"""

from __future__ import annotations

import importlib.util
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import pytest

from audio import bake_log
from audio import mixer_player as mp_mod
from audio.mixer import AudioMixer
from audio.mixer_player import MixerPlayer
from audio.project_clock import ProjectClock

# --- Load the gate-check script as a module (it lives under scripts/) ---

_SCRIPTS_DIR = Path(__file__).resolve().parents[3] / "scripts"
_GATE_PATH = _SCRIPTS_DIR / "check_bake_gate.py"
_spec = importlib.util.spec_from_file_location("check_bake_gate", _GATE_PATH)
assert _spec and _spec.loader
check_bake_gate = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(check_bake_gate)


# --- Mock sounddevice (mirrors test_mixer_player.py) ---


class _FakeStream:
    def __init__(self, *, samplerate, channels, dtype, callback, blocksize):
        self.callback = callback
        self.started = False
        self.stopped = False
        self.closed = False

    def start(self):
        self.started = True

    def stop(self):
        self.stopped = True

    def close(self):
        self.closed = True


class _FakeSD:
    def __init__(self):
        self.last_stream = None
        self.default = type("D", (), {"device": (0, 0)})()

    def OutputStream(self, **kw):  # noqa: N802
        self.last_stream = _FakeStream(**kw)
        return self.last_stream

    def query_devices(self, idx):
        return {"name": "FakeDevice"}


@pytest.fixture
def fake_sd(monkeypatch):
    fake = _FakeSD()
    monkeypatch.setattr(mp_mod, "sd", fake)
    return fake


@pytest.fixture
def bake_log_path(tmp_path, monkeypatch):
    """Redirect the bake log to a tmp path via CREATRIX_BAKE_LOG."""
    path = tmp_path / "audio-bake-log.jsonl"
    monkeypatch.setenv("CREATRIX_BAKE_LOG", str(path))
    monkeypatch.setenv("EXPERIMENTAL_AUDIO_TRACKS", "true")
    return path


def _read_lines(path: Path) -> list[dict]:
    return [json.loads(ln) for ln in path.read_text().splitlines() if ln.strip()]


# --- PD.1a: logger writes one line per session ---


@pytest.mark.smoke
class TestBakeLogger:
    def test_bake_logger_appends_one_line_per_session(self, fake_sd, bake_log_path):
        p = MixerPlayer(AudioMixer(), ProjectClock())
        # Two full start/stop cycles -> exactly 2 valid JSONL lines.
        p.start()
        p.stop()
        p.start()
        p.stop()

        lines = _read_lines(bake_log_path)
        assert len(lines) == 2
        for rec in lines:
            assert rec["schema"] == 1
            assert isinstance(rec["ts_start"], str) and rec["ts_start"]
            assert isinstance(rec["ts_end"], str) and rec["ts_end"]
            assert isinstance(rec["duration_s"], (int, float))
            assert "device" in rec
            assert rec["callback_errors"] == 0
            assert rec["flag_on"] is True
            # F6: provenance defaults to the suite-wide CREATRIX_APP_MODE=test
            # set by conftest.py's autouse isolation fixture.
            assert rec["app_mode"] == "test"

    def test_bake_logger_records_callback_error_count(self, fake_sd, bake_log_path):
        mixer = AudioMixer()
        p = MixerPlayer(mixer, ProjectClock(), blocksize=64)
        p.start()

        # Inject a callback error by driving the real callback with a broken mix.
        def boom(*a, **kw):
            raise RuntimeError("boom")

        p._mixer.mix = boom  # type: ignore[method-assign]
        out = np.ones((64, 2), dtype=np.float32)
        fake_sd.last_stream.callback(out, 64, None, None)
        fake_sd.last_stream.callback(out, 64, None, None)
        assert p.callback_error_count == 2

        p.stop()
        lines = _read_lines(bake_log_path)
        assert len(lines) == 1
        # The session delta (baseline 0 -> 2) is recorded.
        assert lines[0]["callback_errors"] == 2

    def test_bake_logger_write_failure_does_not_raise(
        self, fake_sd, tmp_path, monkeypatch
    ):
        # NEGATIVE: point the log at an unwritable path (a dir where a file
        # cannot be created) — start/stop must still succeed, no exception.
        unwritable = tmp_path / "nope"
        unwritable.mkdir()
        # A path whose parent is a FILE -> mkdir + open will fail.
        blocker = tmp_path / "blocker"
        blocker.write_text("x")
        bad_path = blocker / "sub" / "audio-bake-log.jsonl"
        monkeypatch.setenv("CREATRIX_BAKE_LOG", str(bad_path))
        monkeypatch.setenv("EXPERIMENTAL_AUDIO_TRACKS", "true")

        p = MixerPlayer(AudioMixer(), ProjectClock())
        # Must not raise despite the unwritable log path.
        assert p.start() is True
        p.stop()  # must not raise
        assert not p.is_running
        # And the append itself reports failure (fail-silent) rather than raising.
        assert (
            bake_log.append_session(
                ts_start="2026-06-12T00:00:00+00:00",
                ts_end="2026-06-12T00:01:00+00:00",
                duration_s=60.0,
                device="x",
                callback_errors=0,
                flag_on=True,
                # app_mode intentionally omitted — proves the default-via-
                # resolve_app_mode() path (existing callers need no changes).
            )
            is False
        )


# --- F6: app_mode provenance ---


class TestAppModeProvenance:
    def test_resolve_app_mode_reads_env(self, monkeypatch):
        monkeypatch.setenv("CREATRIX_APP_MODE", "packaged")
        assert bake_log.resolve_app_mode() == "packaged"
        monkeypatch.setenv("CREATRIX_APP_MODE", "DEV")  # case-insensitive
        assert bake_log.resolve_app_mode() == "dev"

    def test_resolve_app_mode_defaults_to_unknown_when_absent(self, monkeypatch):
        monkeypatch.delenv("CREATRIX_APP_MODE", raising=False)
        assert bake_log.resolve_app_mode() == "unknown"

    def test_resolve_app_mode_defaults_to_unknown_on_garbage_value(self, monkeypatch):
        # NEGATIVE: an unrecognized value must not be trusted verbatim into
        # the record — falls back to "unknown" rather than passing through
        # arbitrary strings.
        monkeypatch.setenv("CREATRIX_APP_MODE", "definitely-not-a-real-mode")
        assert bake_log.resolve_app_mode() == "unknown"

    def test_logger_records_app_mode_from_env(
        self, fake_sd, bake_log_path, monkeypatch
    ):
        monkeypatch.setenv("CREATRIX_APP_MODE", "packaged")
        p = MixerPlayer(AudioMixer(), ProjectClock())
        p.start()
        p.stop()
        lines = _read_lines(bake_log_path)
        assert lines[0]["app_mode"] == "packaged"

    def test_append_session_explicit_app_mode_overrides_env(
        self, monkeypatch, bake_log_path
    ):
        # Explicit app_mode kwarg wins over whatever CREATRIX_APP_MODE says.
        monkeypatch.setenv("CREATRIX_APP_MODE", "dev")
        bake_log.append_session(
            ts_start="2026-06-12T00:00:00+00:00",
            ts_end="2026-06-12T00:01:00+00:00",
            duration_s=60.0,
            device="x",
            callback_errors=0,
            flag_on=True,
            app_mode="packaged",
        )
        lines = _read_lines(bake_log_path)
        assert lines[0]["app_mode"] == "packaged"


# --- F6 HARD ORACLE: suite-wide isolation from the real bake log ---


class TestBakeLogSuiteIsolation:
    """Proves the autouse fixture in conftest.py (`_isolate_bake_log_for_suite`)
    isolates EVERY test — not just ones that opt in via the `bake_log_path`
    fixture above — from ~/.creatrix/audio-bake-log.jsonl.

    This is the F6 audit's actual finding: 181 real entries (microsecond
    durations, empty device) landed in the real log from full-suite pytest
    runs before this fix. This test deliberately does NOT set CREATRIX_BAKE_LOG
    itself, to prove isolation is the default, not something each test must
    remember.
    """

    def test_bake_session_writes_zero_lines_to_real_home_path(self, fake_sd):
        real_path = Path.home() / ".creatrix" / "audio-bake-log.jsonl"
        existed_before = real_path.exists()
        snapshot_before = real_path.read_bytes() if existed_before else None

        isolated_path = bake_log.bake_log_path()
        assert isolated_path != real_path, (
            "CREATRIX_BAKE_LOG must already be redirected by the autouse "
            "conftest fixture — this test must not need to set it itself"
        )

        p = MixerPlayer(AudioMixer(), ProjectClock())
        p.start()
        p.stop()

        # The real home-path log is byte-for-byte unchanged (or still absent).
        if existed_before:
            assert real_path.read_bytes() == snapshot_before
        else:
            assert not real_path.exists()

        # The write DID land in the isolated (CREATRIX_BAKE_LOG) path.
        assert isolated_path.exists()
        lines = _read_lines(isolated_path)
        assert len(lines) >= 1
        assert lines[-1]["app_mode"] == "test"


# --- PD.1b: gate-check script ---


def _write_log(path: Path, sessions: list[dict]) -> None:
    lines = []
    for s in sessions:
        rec = {
            "schema": 1,
            "ts_start": s["ts_start"],
            "ts_end": s.get("ts_end", s["ts_start"]),
            "duration_s": s["duration_s"],
            "device": s.get("device", "FakeDevice"),
            "callback_errors": s.get("callback_errors", 0),
            "flag_on": s.get("flag_on", True),
        }
        # Omit app_mode entirely unless the session dict explicitly sets it —
        # this simulates pre-F6 legacy records (no key at all) vs new ones.
        if "app_mode" in s:
            rec["app_mode"] = s["app_mode"]
        lines.append(json.dumps(rec))
    path.write_text("\n".join(lines) + "\n")


def _seven_day_passing_sessions() -> list[dict]:
    """7 distinct days, 2h+ total, zero errors, flag_on."""
    base = datetime(2026, 6, 1, 12, 0, 0, tzinfo=timezone.utc)
    sessions = []
    for i in range(7):
        start = base + timedelta(days=i)
        end = start + timedelta(minutes=20)  # 7 * 20min = 140min > 120min
        sessions.append(
            {
                "ts_start": start.isoformat(),
                "ts_end": end.isoformat(),
                "duration_s": 20 * 60,
                "callback_errors": 0,
                "flag_on": True,
            }
        )
    return sessions


@pytest.mark.smoke
class TestBakeGate:
    def test_bake_gate_passes_on_seven_days_two_hours_zero_errors(self, tmp_path):
        log = tmp_path / "log.jsonl"
        _write_log(log, _seven_day_passing_sessions())
        passed, msg = check_bake_gate.check_bake_gate(log, None)
        assert passed is True, msg
        assert check_bake_gate.main(["--log", str(log)]) == 0

    def test_bake_gate_fails_on_missing_log(self, tmp_path):
        missing = tmp_path / "does-not-exist.jsonl"
        passed, msg = check_bake_gate.check_bake_gate(missing, None)
        assert passed is False
        assert "log missing" in msg
        assert check_bake_gate.main(["--log", str(missing)]) == 1

    def test_bake_gate_fails_on_tampered_line(self, tmp_path):
        log = tmp_path / "log.jsonl"
        _write_log(log, _seven_day_passing_sessions())
        # Append a truncated/garbage line to an otherwise-passing log.
        with open(log, "a") as fh:
            fh.write('{"schema":1,"ts_start":"2026-06-08T12:00:00+0')
        passed, msg = check_bake_gate.check_bake_gate(log, None)
        assert passed is False
        assert "malformed" in msg
        assert check_bake_gate.main(["--log", str(log)]) == 1

    def test_bake_gate_fails_under_seven_distinct_days(self, tmp_path):
        log = tmp_path / "log.jsonl"
        sessions = _seven_day_passing_sessions()[:6]  # only 6 days
        # Pad duration so ONLY the day-count fails.
        for s in sessions:
            s["duration_s"] = 30 * 60
        _write_log(log, sessions)
        passed, msg = check_bake_gate.check_bake_gate(log, None)
        assert passed is False
        assert "under 7 days" in msg

    def test_bake_gate_fails_on_nonzero_callback_errors(self, tmp_path):
        log = tmp_path / "log.jsonl"
        sessions = _seven_day_passing_sessions()
        sessions[0]["callback_errors"] = 1
        _write_log(log, sessions)
        passed, msg = check_bake_gate.check_bake_gate(log, None)
        assert passed is False
        assert "callback error" in msg.lower()

    def test_bake_gate_empty_log_fails(self, tmp_path):
        log = tmp_path / "log.jsonl"
        log.write_text("")
        passed, msg = check_bake_gate.check_bake_gate(log, None)
        assert passed is False
        assert "empty" in msg

    def test_bake_gate_ignores_flag_off_sessions(self, tmp_path):
        log = tmp_path / "log.jsonl"
        sessions = _seven_day_passing_sessions()
        # Add a flag_off session with a huge error count — must be ignored.
        sessions.append(
            {
                "ts_start": "2026-06-20T12:00:00+00:00",
                "ts_end": "2026-06-20T13:00:00+00:00",
                "duration_s": 3600,
                "callback_errors": 99,
                "flag_on": False,
            }
        )
        _write_log(log, sessions)
        passed, msg = check_bake_gate.check_bake_gate(log, None)
        assert passed is True, msg

    def test_bake_gate_since_filters_older_sessions(self, tmp_path):
        log = tmp_path / "log.jsonl"
        _write_log(log, _seven_day_passing_sessions())  # all in early June
        # --since after all sessions -> nothing counts -> "no real usage yet"
        # (F6: distinct from "under 7 days" — zero counted sessions is a
        # different state than some-but-not-enough).
        passed, msg = check_bake_gate.check_bake_gate(log, "2026-06-15")
        assert passed is False
        assert "no real usage yet" in msg

    # --- F6: app_mode + duration-noise filtering ---

    def test_bake_gate_no_real_usage_yet_on_zero_counted_sessions(self, tmp_path):
        # A well-formed, non-empty log whose only session is filtered out as
        # noise -> zero counted sessions -> "no real usage yet" (distinct
        # from "log empty" / criterion 5, and from "under 7 days").
        log = tmp_path / "log.jsonl"
        _write_log(
            log,
            [
                {
                    "ts_start": "2026-06-01T00:00:00+00:00",
                    "duration_s": 0.01,  # below NOISE_DURATION_S
                }
            ],
        )
        passed, msg = check_bake_gate.check_bake_gate(log, None)
        assert passed is False
        assert "no real usage yet" in msg

    def test_bake_gate_excludes_test_app_mode_sessions(self, tmp_path):
        log = tmp_path / "log.jsonl"
        sessions = _seven_day_passing_sessions()
        for s in sessions:
            s["app_mode"] = "test"
        _write_log(log, sessions)
        # All 7 real-looking days are app_mode="test" -> zero real usage.
        passed, msg = check_bake_gate.check_bake_gate(log, None)
        assert passed is False
        assert "no real usage yet" in msg

    def test_bake_gate_counts_missing_app_mode_as_real_usage(self, tmp_path):
        # Back-compat: legacy pre-F6 records have NO app_mode key at all —
        # they must still count (default "unknown"), not be excluded.
        log = tmp_path / "log.jsonl"
        _write_log(log, _seven_day_passing_sessions())  # no app_mode key
        passed, msg = check_bake_gate.check_bake_gate(log, None)
        assert passed is True, msg

    def test_bake_gate_counts_packaged_and_dev_app_modes(self, tmp_path):
        log = tmp_path / "log.jsonl"
        sessions = _seven_day_passing_sessions()
        for i, s in enumerate(sessions):
            s["app_mode"] = "packaged" if i % 2 == 0 else "dev"
        _write_log(log, sessions)
        passed, msg = check_bake_gate.check_bake_gate(log, None)
        assert passed is True, msg

    def test_bake_gate_excludes_short_noise_sessions(self, tmp_path):
        # NEGATIVE: microsecond-duration sessions (the audit's actual symptom
        # — rapid test start/stop cycles) must not count toward the gate even
        # if they otherwise look like flag_on, non-test sessions.
        log = tmp_path / "log.jsonl"
        base = datetime(2026, 6, 1, 12, 0, 0, tzinfo=timezone.utc)
        sessions = []
        for i in range(20):
            sessions.append(
                {
                    "ts_start": (base + timedelta(hours=i)).isoformat(),
                    "duration_s": 0.0004,  # microsecond-scale, below the 5s floor
                    "app_mode": "dev",
                }
            )
        _write_log(log, sessions)
        passed, msg = check_bake_gate.check_bake_gate(log, None)
        assert passed is False
        assert "no real usage yet" in msg

    def test_bake_gate_noise_floor_does_not_exclude_real_sessions(self, tmp_path):
        # POSITIVE control: a passing log where every session is exactly at
        # (or above) the 5s noise floor must still pass.
        log = tmp_path / "log.jsonl"
        sessions = _seven_day_passing_sessions()
        for s in sessions:
            s["app_mode"] = "packaged"
        _write_log(log, sessions)
        passed, msg = check_bake_gate.check_bake_gate(log, None)
        assert passed is True, msg


# --- INTEGRATION: writer -> file -> gate agree on schema ---


@pytest.mark.smoke
class TestBakeEndToEnd:
    def test_bake_session_end_to_end_logs_and_gate_reads(self, fake_sd, bake_log_path):
        # Full chain: MixerPlayer.start() -> stop() writes a real line to the
        # CREATRIX_BAKE_LOG tmpfile, then check_bake_gate parses it. Under
        # test the session is both app_mode="test" (conftest's autouse
        # CREATRIX_APP_MODE) and sub-5s duration — the gate correctly
        # excludes it on BOTH grounds, landing on "no real usage yet" (0
        # counted) rather than "under 7 days" (some, but not enough) — this
        # IS the schema agreement proof: the gate parsed app_mode + duration_s
        # from the writer's line and applied F6 filtering correctly.
        p = MixerPlayer(AudioMixer(), ProjectClock())
        p.start()
        p.stop()

        lines = _read_lines(bake_log_path)
        assert len(lines) == 1
        assert lines[0]["schema"] == 1
        assert lines[0]["flag_on"] is True
        assert lines[0]["app_mode"] == "test"

        passed, msg = check_bake_gate.check_bake_gate(bake_log_path, None)
        assert passed is False
        assert "no real usage yet" in msg
