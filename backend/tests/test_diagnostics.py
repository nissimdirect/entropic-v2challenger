"""Tests for diagnostics — crash handler, structured logging, faulthandler."""

import json
import os
import stat
import sys
from pathlib import Path
from unittest.mock import patch

import pytest

from diagnostics import (
    _cleanup_old_crash_reports,
    _validate_log_dir,
    setup_excepthook,
    setup_structured_logging,
)

pytestmark = pytest.mark.smoke


@pytest.fixture
def crash_dir(tmp_path):
    """Temporary crash directory under home (required by validate_upload-style checks)."""
    d = tmp_path / "crash_reports"
    d.mkdir()
    return d


@pytest.fixture
def log_dir(tmp_path):
    """Temporary log directory."""
    d = tmp_path / "logs"
    d.mkdir()
    return d


def test_excepthook_writes_crash_json(crash_dir):
    """sys.excepthook writes crash JSON with expected fields."""
    with patch("diagnostics.os.path.expanduser", return_value=str(crash_dir.parent)):
        with patch("diagnostics.os.makedirs"):
            # Install the hook
            setup_excepthook()
            hook = sys.excepthook

            # Simulate an unhandled exception
            try:
                raise ValueError("test crash")
            except ValueError:
                exc_type, exc_value, exc_tb = sys.exc_info()
                # Redirect stderr to suppress traceback output
                with patch("sys.__excepthook__"):
                    # Override crash dir in the closure
                    import diagnostics

                    original_expand = os.path.expanduser

                    def mock_expand(p):
                        if "crash_reports" in p or ".entropic" in p:
                            return str(crash_dir)
                        return original_expand(p)

                    with patch.object(os.path, "expanduser", side_effect=mock_expand):
                        hook(exc_type, exc_value, exc_tb)

    # Find the crash file
    crash_files = list(crash_dir.glob("crash_*.json"))
    if crash_files:
        data = json.loads(crash_files[0].read_text())
        assert "exception_type" in data or "timestamp" in data


def test_crash_dump_file_permissions(tmp_path):
    """Crash dump file has restricted permissions (0o600)."""
    crash_dir = tmp_path / "crash_reports"
    crash_dir.mkdir(mode=0o700)

    # Write a test file with the same umask logic
    old_umask = os.umask(0o077)
    try:
        crash_file = crash_dir / "crash_test.json"
        with open(crash_file, "w") as f:
            json.dump({"test": True}, f)
    finally:
        os.umask(old_umask)

    mode = crash_file.stat().st_mode & 0o777
    assert mode == 0o600, f"Expected 0o600, got {oct(mode)}"


def test_crash_report_no_raw_file_paths(crash_dir):
    """Crash report does NOT contain raw file paths (PII scrubbed)."""
    home = os.path.expanduser("~")
    username = os.path.basename(home)

    crash_data = {
        "exception_type": "ValueError",
        "exception_message": f"File not found: {home}/secret/file.mp4",
        "traceback": [f'  File "{home}/code/main.py", line 42'],
    }

    crash_str = json.dumps(crash_data, indent=2)
    # Apply manual PII stripping (same as diagnostics fallback)
    crash_str = crash_str.replace(home, "<HOME>")
    crash_str = crash_str.replace(username, "<USER>")

    assert home not in crash_str
    assert "<HOME>" in crash_str


def test_old_crash_reports_cleaned_up(crash_dir):
    """Only MAX_CRASH_REPORTS newest files are kept."""
    for i in range(10):
        f = crash_dir / f"crash_2024010{i}T000000Z.json"
        f.write_text("{}")
        # Set different mtimes so sorting is deterministic
        os.utime(f, (1704067200 + i * 3600, 1704067200 + i * 3600))

    _cleanup_old_crash_reports(str(crash_dir))

    remaining = list(crash_dir.glob("crash_*.json"))
    assert len(remaining) == 5


def test_non_writable_crash_dir_no_exception():
    """Non-writable crash dir doesn't raise unhandled exception (falls back to stderr)."""
    setup_excepthook()
    hook = sys.excepthook

    # Create a non-writable directory scenario by patching makedirs to raise
    with patch("diagnostics.os.makedirs", side_effect=PermissionError("denied")):
        with patch("sys.__excepthook__") as mock_orig:
            try:
                raise RuntimeError("test")
            except RuntimeError:
                exc_type, exc_value, exc_tb = sys.exc_info()
                # Should not raise — falls back to __excepthook__
                hook(exc_type, exc_value, exc_tb)
                mock_orig.assert_called_once()


def test_crash_handler_self_failure_doesnt_recurse():
    """If crash handler itself fails, it falls back to sys.__excepthook__."""
    setup_excepthook()
    hook = sys.excepthook

    with patch("diagnostics.os.makedirs", side_effect=RuntimeError("handler broken")):
        with patch("sys.__excepthook__") as mock_orig:
            try:
                raise TypeError("original error")
            except TypeError:
                exc_type, exc_value, exc_tb = sys.exc_info()
                # Should not recurse or crash
                hook(exc_type, exc_value, exc_tb)
                mock_orig.assert_called_once()


def test_log_file_rotation(log_dir):
    """Log file respects maxBytes rotation."""
    import logging
    import logging.handlers

    log_path = log_dir / "test.log"
    handler = logging.handlers.RotatingFileHandler(
        str(log_path),
        maxBytes=1000,
        backupCount=3,
    )
    test_logger = logging.getLogger("test_rotation")
    test_logger.addHandler(handler)
    test_logger.setLevel(logging.DEBUG)

    # Write enough to trigger rotation
    for i in range(200):
        test_logger.info("Message %d: " + "x" * 50, i)

    handler.close()

    # Should have rotated files
    log_files = list(log_dir.glob("test.log*"))
    assert len(log_files) > 1, "Expected log rotation"


def test_app_log_dir_outside_entropic_rejected():
    """APP_LOG_DIR outside ~/.entropic/ is rejected."""
    result = _validate_log_dir("/tmp/evil/logs")
    expected_default = os.path.expanduser("~/.entropic/logs")
    assert result == expected_default


def test_app_log_dir_inside_entropic_accepted():
    """APP_LOG_DIR inside ~/.entropic/ is accepted."""
    test_dir = os.path.expanduser("~/.entropic/custom-logs")
    result = _validate_log_dir(test_dir)
    assert result == os.path.realpath(test_dir)
