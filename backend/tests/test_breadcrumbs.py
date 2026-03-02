"""Tests for Sentry breadcrumbs in ZMQ server."""

import pytest
from unittest.mock import patch, call


class TestBreadcrumbs:
    """Test Sentry breadcrumb emission in handle_message."""

    def _make_server(self):
        """Create a minimal ZMQServer with mocked sockets."""
        # We need to mock zmq to avoid socket creation
        with patch("zmq_server.zmq"):
            from zmq_server import ZMQServer

            with patch.object(ZMQServer, "__init__", lambda self: None):
                server = ZMQServer.__new__(ZMQServer)
                server._breadcrumb_frame_counter = 0
                server.token = "test-token"
                server.start_time = 0
                server.last_frame_ms = 0.0
                return server

    @patch("sentry_sdk.add_breadcrumb")
    def test_ingest_breadcrumb_has_metadata(self, mock_breadcrumb):
        """Ingest adds breadcrumb with video metadata."""
        server = self._make_server()
        result = {
            "ok": True,
            "width": 1920,
            "height": 1080,
            "fps": 30,
            "frame_count": 900,
        }

        with patch.object(server, "_handle_ingest", return_value=result):
            server.handle_message(
                {"cmd": "ingest", "path": "/test.mp4", "_token": "test-token"}
            )

        mock_breadcrumb.assert_called_once()
        bc = mock_breadcrumb.call_args
        assert bc.kwargs["category"] == "io"
        assert bc.kwargs["data"]["width"] == 1920
        assert bc.kwargs["data"]["height"] == 1080
        assert bc.kwargs["data"]["fps"] == 30
        assert bc.kwargs["data"]["frame_count"] == 900

    @patch("sentry_sdk.add_breadcrumb")
    def test_ingest_breadcrumb_no_path_in_data(self, mock_breadcrumb):
        """Breadcrumb data contains NO raw file paths."""
        server = self._make_server()
        result = {
            "ok": True,
            "width": 1920,
            "height": 1080,
            "fps": 30,
            "frame_count": 900,
        }

        with patch.object(server, "_handle_ingest", return_value=result):
            server.handle_message(
                {"cmd": "ingest", "path": "/Users/me/video.mp4", "_token": "test-token"}
            )

        bc_data = mock_breadcrumb.call_args.kwargs["data"]
        for value in bc_data.values():
            if isinstance(value, str):
                assert "/Users" not in value

    @patch("sentry_sdk.add_breadcrumb")
    def test_render_frame_rate_limited(self, mock_breadcrumb):
        """render_frame breadcrumb is rate-limited: 60 calls -> exactly 2 breadcrumbs."""
        server = self._make_server()

        with patch.object(server, "_handle_render_frame", return_value={"ok": True}):
            for i in range(60):
                server.handle_message(
                    {
                        "cmd": "render_frame",
                        "path": "/test.mp4",
                        "frame_index": i,
                        "chain": [],
                        "_token": "test-token",
                    }
                )

        assert mock_breadcrumb.call_count == 2

    @patch("sentry_sdk.add_breadcrumb")
    def test_ingest_resets_frame_counter(self, mock_breadcrumb):
        """Ingest resets the frame counter."""
        server = self._make_server()
        server._breadcrumb_frame_counter = 29  # next render would trigger

        result = {
            "ok": True,
            "width": 1920,
            "height": 1080,
            "fps": 30,
            "frame_count": 900,
        }
        with patch.object(server, "_handle_ingest", return_value=result):
            server.handle_message(
                {"cmd": "ingest", "path": "/test.mp4", "_token": "test-token"}
            )

        assert server._breadcrumb_frame_counter == 0

    @patch("sentry_sdk.add_breadcrumb")
    def test_export_start_breadcrumb(self, mock_breadcrumb):
        """export_start adds breadcrumb with chain_length."""
        server = self._make_server()

        with patch.object(server, "_handle_export_start", return_value={"ok": True}):
            server.handle_message(
                {
                    "cmd": "export_start",
                    "input_path": "/in.mp4",
                    "output_path": "/out.mp4",
                    "chain": [{"id": "a"}, {"id": "b"}],
                    "_token": "test-token",
                }
            )

        mock_breadcrumb.assert_called_once()
        assert mock_breadcrumb.call_args.kwargs["category"] == "export"
        assert mock_breadcrumb.call_args.kwargs["data"]["chain_length"] == 2

    @patch("sentry_sdk.add_breadcrumb")
    def test_audio_play_breadcrumb(self, mock_breadcrumb):
        """audio_play adds breadcrumb."""
        server = self._make_server()

        with patch.object(server, "_handle_audio_play", return_value={"ok": True}):
            server.handle_message({"cmd": "audio_play", "_token": "test-token"})

        mock_breadcrumb.assert_called_once()
        assert mock_breadcrumb.call_args.kwargs["category"] == "audio"
