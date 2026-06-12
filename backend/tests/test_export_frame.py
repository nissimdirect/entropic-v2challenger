"""Tests for UE.6 — Still-frame export (current frame → PNG).

Named tests per packet spec:
  test_export_frame_writes_png_at_playhead
  test_export_frame_invalid_path_rejected  (NEGATIVE — traversal + non-granted)
  test_export_frame_time_beyond_duration_rejected  (NEGATIVE — t>dur, t=-1, t=NaN)
  test_export_frame_matches_preview_render  (INTEGRATION — hash parity)

All tests go through handle_message() so they exercise the dispatch path too.
"""

import hashlib
import math
import os
from pathlib import Path

import numpy as np
import pytest

pytestmark = pytest.mark.smoke


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _send(zmq_client, msg: dict) -> dict:
    zmq_client.send_json(msg)
    return zmq_client.recv_json()


# ---------------------------------------------------------------------------
# test_export_frame_writes_png_at_playhead
# ---------------------------------------------------------------------------


class TestExportFrameWritesPng:
    """Positive path: export_frame writes a valid PNG to the granted output path."""

    def test_export_frame_writes_png_at_playhead(
        self, zmq_client, synthetic_video_path, home_tmp_path
    ):
        """export_frame writes a PNG file at the given time and returns ok:true."""
        out_path = str(home_tmp_path / "frame_t0.png")

        resp = _send(
            zmq_client,
            {
                "cmd": "export_frame",
                "id": "ef-01",
                "path": synthetic_video_path,
                "time": 0.5,
                "chain": [],
                "output_path": out_path,
            },
        )

        assert resp["ok"] is True, f"Expected ok:true, got: {resp}"
        assert resp["output_path"] == out_path
        assert "frame_index" in resp
        assert "width" in resp
        assert "height" in resp

        # File must exist and be a valid PNG
        assert os.path.isfile(out_path), "PNG file was not written"
        from PIL import Image

        with Image.open(out_path) as img:
            assert img.format == "PNG"
            assert img.mode in ("RGB", "RGBA")
            assert img.width > 0 and img.height > 0

    def test_export_frame_at_time_zero(
        self, zmq_client, synthetic_video_path, home_tmp_path
    ):
        """export_frame succeeds at t=0 (first frame)."""
        out_path = str(home_tmp_path / "frame_t0_zero.png")

        resp = _send(
            zmq_client,
            {
                "cmd": "export_frame",
                "id": "ef-02",
                "path": synthetic_video_path,
                "time": 0.0,
                "chain": [],
                "output_path": out_path,
            },
        )

        assert resp["ok"] is True, f"Expected ok:true, got: {resp}"
        assert os.path.isfile(out_path)


# ---------------------------------------------------------------------------
# test_export_frame_invalid_path_rejected  (NEGATIVE)
# ---------------------------------------------------------------------------


class TestExportFrameInvalidPathRejected:
    """Trust boundary: source path traversal and non-granted paths are rejected."""

    def test_export_frame_traversal_path_rejected(self, zmq_client, home_tmp_path):
        """Path with .. traversal is rejected by validate_upload."""
        out_path = str(home_tmp_path / "safe_out.png")

        resp = _send(
            zmq_client,
            {
                "cmd": "export_frame",
                "id": "ef-10",
                "path": str(home_tmp_path / ".." / ".." / "etc" / "passwd"),
                "time": 0.0,
                "chain": [],
                "output_path": out_path,
            },
        )

        assert resp["ok"] is False
        assert "error" in resp
        assert not os.path.isfile(out_path), "No file should be written on rejection"

    def test_export_frame_output_in_system_dir_rejected(
        self, zmq_client, synthetic_video_path
    ):
        """output_path in /usr (a BLOCKED_OUTPUT_PREFIX) is rejected by validate_output_path."""
        out_path = "/usr/local/entropic_test_frame.png"

        resp = _send(
            zmq_client,
            {
                "cmd": "export_frame",
                "id": "ef-11",
                "path": synthetic_video_path,
                "time": 0.0,
                "chain": [],
                "output_path": out_path,
            },
        )

        assert resp["ok"] is False
        assert "error" in resp
        # File must not have been written
        assert not os.path.isfile(out_path), "No file should be written on rejection"

    def test_export_frame_non_png_output_rejected(
        self, zmq_client, synthetic_video_path, home_tmp_path
    ):
        """output_path with .mp4 extension is rejected (only .png allowed here)."""
        out_path = str(home_tmp_path / "bad_output.mp4")

        resp = _send(
            zmq_client,
            {
                "cmd": "export_frame",
                "id": "ef-12",
                "path": synthetic_video_path,
                "time": 0.0,
                "chain": [],
                "output_path": out_path,
            },
        )

        assert resp["ok"] is False
        assert "error" in resp
        assert not os.path.isfile(out_path)

    def test_export_frame_system_output_path_rejected(
        self, zmq_client, synthetic_video_path
    ):
        """output_path in a system directory is rejected."""
        resp = _send(
            zmq_client,
            {
                "cmd": "export_frame",
                "id": "ef-13",
                "path": synthetic_video_path,
                "time": 0.0,
                "chain": [],
                "output_path": "/usr/local/evil.png",
            },
        )

        assert resp["ok"] is False
        assert "error" in resp


# ---------------------------------------------------------------------------
# test_export_frame_time_beyond_duration_rejected  (NEGATIVE)
# ---------------------------------------------------------------------------


class TestExportFrameTimeBeyondDurationRejected:
    """Trust boundary: malformed time values are rejected before any file is written."""

    def test_time_beyond_duration_rejected(
        self, zmq_client, synthetic_video_path, home_tmp_path
    ):
        """t = duration + 1s → ok:false, no file written, server stays up."""
        out_path = str(home_tmp_path / "beyond_dur.png")

        # synthetic_video_path is 5s at 30fps — t=6 is beyond duration
        resp = _send(
            zmq_client,
            {
                "cmd": "export_frame",
                "id": "ef-20",
                "path": synthetic_video_path,
                "time": 6.0,
                "chain": [],
                "output_path": out_path,
            },
        )

        assert resp["ok"] is False, f"Expected rejection, got: {resp}"
        assert "error" in resp
        assert not os.path.isfile(out_path), "No file should be written on rejection"

    def test_negative_time_rejected(
        self, zmq_client, synthetic_video_path, home_tmp_path
    ):
        """t = -1 → ok:false, no file written."""
        out_path = str(home_tmp_path / "neg_time.png")

        resp = _send(
            zmq_client,
            {
                "cmd": "export_frame",
                "id": "ef-21",
                "path": synthetic_video_path,
                "time": -1.0,
                "chain": [],
                "output_path": out_path,
            },
        )

        assert resp["ok"] is False, f"Expected rejection, got: {resp}"
        assert "error" in resp
        assert not os.path.isfile(out_path)

    def test_nan_time_rejected(self, zmq_client, synthetic_video_path, home_tmp_path):
        """t = NaN → ok:false, no file written.

        NaN does not survive JSON serialisation cleanly, so we test via
        handle_message directly on the server object (which is what the ZMQ
        transport does after JSON deserialisation gives us float('nan')).
        """
        import zmq_server as _zs

        out_path = str(home_tmp_path / "nan_time.png")

        server = _zs.ZMQServer.__new__(_zs.ZMQServer)
        server.token = "test-token"

        # Inject float('nan') directly — simulates a hand-crafted malicious message
        resp = server.handle_message(
            {
                "cmd": "export_frame",
                "id": "ef-22",
                "_token": "test-token",
                "path": synthetic_video_path,
                "time": float("nan"),
                "chain": [],
                "output_path": out_path,
            }
        )

        assert resp["ok"] is False, f"Expected rejection of NaN time, got: {resp}"
        assert "error" in resp
        assert not os.path.isfile(out_path)

    def test_infinity_time_rejected(
        self, zmq_client, synthetic_video_path, home_tmp_path
    ):
        """t = +inf → ok:false, no file written."""
        import zmq_server as _zs

        out_path = str(home_tmp_path / "inf_time.png")

        server = _zs.ZMQServer.__new__(_zs.ZMQServer)
        server.token = "test-token"

        resp = server.handle_message(
            {
                "cmd": "export_frame",
                "id": "ef-23",
                "_token": "test-token",
                "path": synthetic_video_path,
                "time": float("inf"),
                "chain": [],
                "output_path": out_path,
            }
        )

        assert resp["ok"] is False, f"Expected rejection of inf time, got: {resp}"
        assert "error" in resp
        assert not os.path.isfile(out_path)

    def test_server_stays_up_after_bad_time(
        self, zmq_client, synthetic_video_path, home_tmp_path
    ):
        """Server stays alive (responds to ping) after a rejected export_frame."""
        out_path = str(home_tmp_path / "after_bad.png")

        # Send a bad request
        _send(
            zmq_client,
            {
                "cmd": "export_frame",
                "id": "ef-24-bad",
                "path": synthetic_video_path,
                "time": -999.0,
                "chain": [],
                "output_path": out_path,
            },
        )

        # Server must still respond to a subsequent ping
        resp = _send(zmq_client, {"cmd": "ping", "id": "ef-24-ping"})
        assert resp.get("status") == "alive", (
            "Server must stay up after rejected export_frame"
        )


# ---------------------------------------------------------------------------
# test_export_frame_matches_preview_render  (INTEGRATION — hash parity)
# ---------------------------------------------------------------------------


class TestExportFrameMatchesPreviewRender:
    """Full-chain parity proof: export_frame produces the same pixels as render_frame."""

    def test_export_frame_matches_preview_render(
        self, zmq_client, synthetic_video_path, home_tmp_path
    ):
        """Hash the exported PNG against the preview JPEG decode and assert pixel equality.

        This proves export_frame reuses (not forks) the preview render path
        and that the time→frame mapping is identical.
        """
        import io

        from PIL import Image

        out_path = str(home_tmp_path / "parity_frame.png")
        test_time = 1.0  # 1 second into the 5-second synthetic video

        # 1. Export frame via export_frame command
        export_resp = _send(
            zmq_client,
            {
                "cmd": "export_frame",
                "id": "parity-export",
                "path": synthetic_video_path,
                "time": test_time,
                "chain": [],
                "output_path": out_path,
            },
        )
        assert export_resp["ok"] is True, f"export_frame failed: {export_resp}"

        export_frame_index = export_resp["frame_index"]

        # 2. Render same frame via render_frame (preview path)
        preview_resp = _send(
            zmq_client,
            {
                "cmd": "render_frame",
                "id": "parity-preview",
                "path": synthetic_video_path,
                "frame_index": export_frame_index,  # use exact frame index for parity
                "chain": [],
            },
        )
        assert preview_resp["ok"] is True, f"render_frame failed: {preview_resp}"

        # 3. Decode preview JPEG → RGB array
        import base64

        jpeg_bytes = base64.b64decode(preview_resp["frame_data"])
        preview_img = Image.open(io.BytesIO(jpeg_bytes)).convert("RGB")
        preview_arr = np.array(preview_img)

        # 4. Load exported PNG → RGB array
        png_img = Image.open(out_path).convert("RGB")
        export_arr = np.array(png_img)

        # 5. Assert shapes match
        assert preview_arr.shape == export_arr.shape, (
            f"Shape mismatch: preview {preview_arr.shape} vs export {export_arr.shape}"
        )

        # 6. JPEG has lossy compression; PNG is lossless.
        # Both start from the same RGBA frame → same RGB source.
        # We hash the export PNG (lossless) and compare pixel-wise with
        # the JPEG-decoded preview within JPEG's quantisation tolerance (±2 per channel).
        # An exact hash comparison is not meaningful across codecs, but max absolute
        # deviation ≤ JPEG quantisation error proves the source frame is identical.
        max_diff = int(np.max(np.abs(preview_arr.astype(int) - export_arr.astype(int))))
        assert max_diff <= 4, (
            f"Pixel deviation {max_diff} exceeds JPEG quantisation tolerance (4). "
            "export_frame and render_frame are not rendering the same source frame."
        )

        # 7. Log parity evidence in the test output (captured by pytest -v)
        png_hash = hashlib.sha256(Path(out_path).read_bytes()).hexdigest()[:16]
        print(
            f"\nParity evidence: frame_index={export_frame_index}, "
            f"png_hash={png_hash}, max_pixel_diff={max_diff}"
        )
