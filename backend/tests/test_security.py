"""Tests for security validation gates — SEC-5, SEC-6, SEC-7, PII stripping."""

import os
from pathlib import Path

import pytest

from security import (
    ALLOWED_EXTENSIONS,
    MAX_CHAIN_DEPTH,
    MAX_FRAME_COUNT,
    MAX_UPLOAD_SIZE,
    strip_pii,
    validate_chain_depth,
    validate_frame_count,
    validate_upload,
)


class TestSEC5Upload:
    """SEC-5: File upload validation."""

    def test_valid_mp4_accepted(self, home_tmp_path):
        f = home_tmp_path / "test.mp4"
        f.write_bytes(b"\x00" * 1024)
        errors = validate_upload(str(f))
        assert errors == []

    def test_valid_mov_accepted(self, home_tmp_path):
        f = home_tmp_path / "test.mov"
        f.write_bytes(b"\x00" * 1024)
        errors = validate_upload(str(f))
        assert errors == []

    def test_exe_rejected(self, home_tmp_path):
        f = home_tmp_path / "test.exe"
        f.write_bytes(b"\x00" * 1024)
        errors = validate_upload(str(f))
        assert any("not allowed" in e for e in errors)

    def test_txt_rejected(self, home_tmp_path):
        f = home_tmp_path / "test.txt"
        f.write_bytes(b"\x00" * 1024)
        errors = validate_upload(str(f))
        assert any("not allowed" in e for e in errors)

    def test_nonexistent_file_rejected(self):
        errors = validate_upload(str(Path.home() / "nonexistent" / "video.mp4"))
        assert any("not found" in e.lower() for e in errors)

    def test_symlink_rejected(self, home_tmp_path):
        real = home_tmp_path / "real.mp4"
        real.write_bytes(b"\x00" * 1024)
        link = home_tmp_path / "link.mp4"
        link.symlink_to(real)
        errors = validate_upload(str(link))
        assert any("symlink" in e.lower() for e in errors)

    def test_oversized_file_rejected(self, home_tmp_path):
        f = home_tmp_path / "big.mp4"
        # Create sparse file to test size check without writing 500MB
        with open(f, "wb") as fh:
            fh.seek(MAX_UPLOAD_SIZE + 1)
            fh.write(b"\x00")
        errors = validate_upload(str(f))
        assert any("too large" in e.lower() for e in errors)

    def test_all_allowed_extensions(self, home_tmp_path):
        for ext in ALLOWED_EXTENSIONS:
            f = home_tmp_path / f"test{ext}"
            f.write_bytes(b"\x00" * 1024)
            errors = validate_upload(str(f))
            assert errors == [], f"Extension {ext} should be allowed"


@pytest.mark.smoke
class TestSEC6FrameCount:
    """SEC-6: Frame count cap."""

    def test_valid_frame_count(self):
        errors = validate_frame_count(100)
        assert errors == []

    def test_at_limit(self):
        errors = validate_frame_count(MAX_FRAME_COUNT)
        assert errors == []

    def test_over_limit(self):
        errors = validate_frame_count(MAX_FRAME_COUNT + 1)
        assert any("SEC-6" in e for e in errors)

    def test_zero_frames(self):
        errors = validate_frame_count(0)
        assert errors == []


@pytest.mark.smoke
class TestSEC7ChainDepth:
    """SEC-7: Effect chain depth cap."""

    def test_valid_chain(self):
        chain = [{"effect_id": "fx.invert"}] * 5
        errors = validate_chain_depth(chain)
        assert errors == []

    def test_at_limit(self):
        chain = [{"effect_id": "fx.invert"}] * MAX_CHAIN_DEPTH
        errors = validate_chain_depth(chain)
        assert errors == []

    def test_over_limit(self):
        chain = [{"effect_id": "fx.invert"}] * (MAX_CHAIN_DEPTH + 1)
        errors = validate_chain_depth(chain)
        assert any("SEC-7" in e for e in errors)

    def test_empty_chain(self):
        errors = validate_chain_depth([])
        assert errors == []


# --- PII stripping tests (Item 4) ---


@pytest.mark.smoke
class TestStripPII:
    """PII stripping for Sentry events and crash dumps."""

    def test_removes_home_dir_from_exception(self):
        """strip_pii removes home dir path from exception message."""
        home = os.path.expanduser("~")
        event = {
            "exception": {
                "values": [{"value": f"File not found: {home}/secret/video.mp4"}]
            }
        }
        result = strip_pii(event, {})
        result_str = str(result)
        assert home not in result_str
        assert "<HOME>" in result_str or "<REDACTED_PATH>" in result_str

    def test_removes_token_from_extra(self):
        """strip_pii removes _token key from extra context."""
        event = {"extra": {"_token": "abc-secret-123", "effect_id": "fx.invert"}}
        result = strip_pii(event, {})
        assert result["extra"]["_token"] == "<REDACTED>"
        assert result["extra"]["effect_id"] == "fx.invert"

    def test_replaces_users_path(self):
        """strip_pii replaces /Users/username with <REDACTED_PATH>."""
        event = {
            "message": "Error at /Users/johndoe/project/main.py:42",
        }
        result = strip_pii(event, {})
        assert "/Users/johndoe" not in result["message"]
        assert "<REDACTED_PATH>" in result["message"]

    def test_preserves_non_sensitive_data(self):
        """strip_pii preserves non-sensitive data unchanged."""
        event = {
            "extra": {
                "effect_id": "fx.invert",
                "frame_index": 42,
                "resolution": [1920, 1080],
            },
            "tags": {"environment": "development"},
        }
        result = strip_pii(event, {})
        assert result["extra"]["effect_id"] == "fx.invert"
        assert result["extra"]["frame_index"] == 42
        assert result["extra"]["resolution"] == [1920, 1080]
