"""Diagnostics — faulthandler, structured logging, crash dumps.

Layers:
1. faulthandler: C-level crash tracebacks (SIGSEGV, SIGABRT)
2. sys.excepthook: unhandled Python exceptions → JSON crash dumps
3. Structured logging with RotatingFileHandler
"""

import datetime
import faulthandler
import json
import logging
import logging.handlers
import os
import sys
import traceback
from pathlib import Path


logger = logging.getLogger(__name__)

# Maximum crash reports to keep
MAX_CRASH_REPORTS = 5

# Maximum log age in days
MAX_LOG_AGE_DAYS = 7


def _validate_log_dir(env_dir: str) -> str:
    """Validate APP_LOG_DIR is under ~/.entropic. Returns safe path."""
    default = os.path.expanduser("~/.entropic/logs")
    if env_dir:
        resolved = os.path.realpath(env_dir)
        allowed = os.path.realpath(os.path.expanduser("~/.entropic"))
        if not resolved.startswith(allowed + os.sep) and resolved != allowed:
            logger.warning("APP_LOG_DIR outside allowed prefix, using default")
            return default
        return resolved
    return default


class JSONFormatter(logging.Formatter):
    """Structured JSON log formatter."""

    def format(self, record: logging.LogRecord) -> str:
        log_entry = {
            "timestamp": datetime.datetime.fromtimestamp(
                record.created, tz=datetime.timezone.utc
            ).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        if record.exc_info and record.exc_info[1] is not None:
            log_entry["exception"] = {
                "type": type(record.exc_info[1]).__name__,
                "traceback": self.formatException(record.exc_info),
            }
        return json.dumps(log_entry)


def _cleanup_old_logs(log_dir: str):
    """Delete log files older than MAX_LOG_AGE_DAYS."""
    cutoff = datetime.datetime.now() - datetime.timedelta(days=MAX_LOG_AGE_DAYS)
    try:
        for f in Path(log_dir).glob("sidecar.log*"):
            if f.stat().st_mtime < cutoff.timestamp():
                f.unlink(missing_ok=True)
    except OSError:
        pass


def _cleanup_old_crash_reports(crash_dir: str):
    """Keep only the newest MAX_CRASH_REPORTS crash files."""
    try:
        crash_files = sorted(
            Path(crash_dir).glob("crash_*.json"),
            key=lambda f: f.stat().st_mtime,
            reverse=True,
        )
        for old_file in crash_files[MAX_CRASH_REPORTS:]:
            old_file.unlink(missing_ok=True)
    except OSError:
        pass


def setup_structured_logging(log_dir: str | None = None):
    """Configure structured JSON logging with rotation.

    Args:
        log_dir: Override log directory (validated against ~/.entropic prefix).
    """
    resolved_dir = _validate_log_dir(log_dir or os.environ.get("APP_LOG_DIR", ""))
    os.makedirs(resolved_dir, mode=0o700, exist_ok=True)

    log_path = os.path.join(resolved_dir, "sidecar.log")
    log_level = os.environ.get("APP_LOG_LEVEL", "INFO").upper()

    # Rotating handler: 10MB max, 7 backups
    handler = logging.handlers.RotatingFileHandler(
        log_path,
        maxBytes=10_000_000,
        backupCount=7,
    )
    handler.setFormatter(JSONFormatter())

    root = logging.getLogger()
    root.setLevel(getattr(logging, log_level, logging.INFO))
    root.addHandler(handler)

    # Cleanup old logs
    _cleanup_old_logs(resolved_dir)

    return resolved_dir


def setup_faulthandler(log_dir: str):
    """Enable faulthandler for C-level crash tracebacks.

    Uses a SEPARATE file from the main log (RotatingFileHandler would
    invalidate the faulthandler file descriptor on rotation).
    """
    fault_path = os.path.join(log_dir, "sidecar_fault.log")
    try:
        fault_file = open(fault_path, "a", buffering=1)  # noqa: SIM115
        os.chmod(fault_path, 0o600)
        faulthandler.enable(file=fault_file, all_threads=True)
    except OSError as e:
        print(f"WARNING: Could not enable faulthandler: {e}", file=sys.stderr)


def setup_excepthook():
    """Install sys.excepthook that writes structured crash dumps."""
    crash_dir = os.path.expanduser("~/.entropic/crash_reports")

    def _crash_excepthook(exc_type, exc_value, exc_tb):
        try:
            os.makedirs(crash_dir, mode=0o700, exist_ok=True)

            timestamp = datetime.datetime.now(tz=datetime.timezone.utc).strftime(
                "%Y%m%dT%H%M%SZ"
            )
            crash_path = os.path.join(crash_dir, f"crash_{timestamp}.json")

            # Build crash data (PII-safe)
            tb_lines = traceback.format_exception(exc_type, exc_value, exc_tb)
            crash_data = {
                "timestamp": timestamp,
                "exception_type": exc_type.__name__ if exc_type else "Unknown",
                "exception_message": str(exc_value),
                "traceback": tb_lines,
                "python_version": sys.version,
                "platform": sys.platform,
            }

            # PII stripping on crash data
            crash_str = json.dumps(crash_data, indent=2)
            try:
                from security import strip_pii

                # strip_pii expects Sentry event format, but we can use it
                # on a simple dict by wrapping/unwrapping
                sanitized = strip_pii({"extra": crash_data}, {})
                crash_data = sanitized.get("extra", crash_data)
                crash_str = json.dumps(crash_data, indent=2)
            except ImportError:
                # security module not available — strip paths manually
                home = os.path.expanduser("~")
                username = os.path.basename(home)
                crash_str = crash_str.replace(home, "<HOME>")
                crash_str = crash_str.replace(username, "<USER>")

            # Write with restricted permissions
            old_umask = os.umask(0o077)
            try:
                with open(crash_path, "w") as f:
                    f.write(crash_str)
            finally:
                os.umask(old_umask)

            # Cleanup old reports
            _cleanup_old_crash_reports(crash_dir)

        except Exception:
            # Crash handler failed — fall back to default, don't recurse
            pass

        # Always call the original excepthook
        sys.__excepthook__(exc_type, exc_value, exc_tb)

    sys.excepthook = _crash_excepthook


def init_diagnostics():
    """Initialize all diagnostic layers. Call from main.py."""
    log_dir = setup_structured_logging()
    setup_faulthandler(log_dir)
    setup_excepthook()
    logger.info("Diagnostics initialized: logging=%s, faulthandler=enabled", log_dir)
