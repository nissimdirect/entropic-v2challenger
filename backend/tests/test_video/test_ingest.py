"""Tests for video ingest/probing."""

from video.ingest import probe


def test_probe_synthetic_clip(synthetic_video_path):
    result = probe(synthetic_video_path)
    assert result["ok"] is True
    assert result["width"] == 1280
    assert result["height"] == 720
    assert result["fps"] == 30.0
    assert result["codec"] == "h264"
    assert result["has_audio"] is False
    assert result["duration_s"] > 0


def test_probe_nonexistent_file():
    result = probe("/nonexistent/path/video.mp4")
    assert result["ok"] is False
    assert "error" in result
