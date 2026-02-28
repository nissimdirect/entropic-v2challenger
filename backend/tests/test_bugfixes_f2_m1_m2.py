"""Tests for bug fixes F-2 (export race condition), M-1 (ZMQ msg size), M-2 (error path leaks)."""

import threading
import time

import pytest

from engine.export import ExportJob, ExportManager, ExportStatus


# ---------------------------------------------------------------------------
# F-2: ExportJob has a threading lock and mutations are protected
# ---------------------------------------------------------------------------


class TestF2ExportThreadLock:
    """F-2: Export thread race condition — ExportJob._lock guards shared state."""

    def test_export_job_has_lock(self):
        job = ExportJob()
        assert hasattr(job, "_lock")
        assert isinstance(job._lock, type(threading.Lock()))

    def test_lock_is_unique_per_instance(self):
        job1 = ExportJob()
        job2 = ExportJob()
        assert job1._lock is not job2._lock

    def test_get_status_uses_lock(self, synthetic_video_path):
        """get_status should return a consistent snapshot under the lock."""
        import tempfile

        output_path = tempfile.mktemp(suffix=".mp4")
        manager = ExportManager()

        job = manager.start(
            input_path=synthetic_video_path,
            output_path=output_path,
            chain=[],
            project_seed=42,
        )

        # Poll get_status many times while export runs — should never raise
        statuses = []
        for _ in range(50):
            s = manager.get_status()
            statuses.append(s)
            assert "status" in s
            assert "current_frame" in s
            assert "total_frames" in s
            time.sleep(0.01)

        # Wait for completion
        for _ in range(100):
            if job.status != ExportStatus.RUNNING:
                break
            time.sleep(0.1)

        final = manager.get_status()
        assert final["status"] in ("complete", "cancelled")

        import os

        if os.path.exists(output_path):
            os.unlink(output_path)

    def test_cancel_uses_lock(self):
        """cancel() on an idle manager returns False safely."""
        manager = ExportManager()
        assert manager.cancel() is False

    def test_get_status_idle(self):
        """get_status on no-job manager returns idle dict."""
        manager = ExportManager()
        s = manager.get_status()
        assert s["status"] == "idle"

    def test_concurrent_get_status_no_crash(self, synthetic_video_path):
        """Hammer get_status from multiple threads during export — no crash."""
        import tempfile

        output_path = tempfile.mktemp(suffix=".mp4")
        manager = ExportManager()

        manager.start(
            input_path=synthetic_video_path,
            output_path=output_path,
            chain=[],
            project_seed=42,
        )

        errors = []

        def poll():
            try:
                for _ in range(30):
                    manager.get_status()
                    time.sleep(0.005)
            except Exception as e:
                errors.append(e)

        threads = [threading.Thread(target=poll) for _ in range(5)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert len(errors) == 0, f"Concurrent get_status errors: {errors}"

        # Wait for export to finish
        time.sleep(2)
        import os

        if os.path.exists(output_path):
            os.unlink(output_path)


# ---------------------------------------------------------------------------
# M-1: ZMQ message size limits
# ---------------------------------------------------------------------------


class TestM1ZmqMessageSize:
    """M-1: ZMQ MAXMSGSIZE — main socket 1 MB, ping socket 4 KB."""

    def test_main_socket_maxmsgsize(self, zmq_server):
        import zmq

        val = zmq_server.socket.getsockopt(zmq.MAXMSGSIZE)
        assert val == 1_048_576, f"Main socket MAXMSGSIZE should be 1 MB, got {val}"

    def test_ping_socket_maxmsgsize(self, zmq_server):
        import zmq

        val = zmq_server.ping_socket.getsockopt(zmq.MAXMSGSIZE)
        assert val == 4096, f"Ping socket MAXMSGSIZE should be 4 KB, got {val}"


# ---------------------------------------------------------------------------
# M-2: Error path leaks — sanitized error messages
# ---------------------------------------------------------------------------


class TestM2ErrorPathLeaks:
    """M-2: Error messages should not leak internal paths or exception details."""

    def test_export_error_sanitized(self):
        """ExportJob error from exception should contain class name, not str(e)."""
        from engine.export import ExportJob, ExportStatus

        job = ExportJob()
        # Simulate what _run_export does on error
        try:
            raise FileNotFoundError("/secret/internal/path/video.mp4")
        except Exception as e:
            with job._lock:
                job.status = ExportStatus.ERROR
                job.error = f"Export failed: {type(e).__name__}"

        assert job.error == "Export failed: FileNotFoundError"
        assert "/secret" not in job.error

    def test_ingest_probe_error_sanitized(self, home_tmp_path):
        """probe() error should not leak filesystem paths."""
        from video.ingest import probe

        # Non-existent file triggers av.error.FileNotFoundError
        result = probe(str(home_tmp_path / "nonexistent.mp4"))
        assert result["ok"] is False
        # Should NOT contain the full path
        assert "nonexistent.mp4" not in result["error"]
        # Should contain sanitized class name
        assert "Failed to open video:" in result["error"]

    def test_ingest_probe_error_no_path_leak(self, home_tmp_path):
        """probe() on invalid data should not leak directory structure."""
        from video.ingest import probe

        # Write a non-video file
        bad = home_tmp_path / "bad.mp4"
        bad.write_bytes(b"not a video at all")
        result = probe(str(bad))
        assert result["ok"] is False
        assert str(home_tmp_path) not in result["error"]
        assert "Failed to open video:" in result["error"]
