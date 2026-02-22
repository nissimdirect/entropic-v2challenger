"""Tests for PyAV video reader."""

from video.reader import VideoReader


def test_open_and_decode_frame_0(synthetic_video_path):
    r = VideoReader(synthetic_video_path)
    frame = r.decode_frame(0)
    assert frame.shape == (720, 1280, 4)
    assert frame.dtype.name == "uint8"
    r.close()


def test_metadata(synthetic_video_path):
    r = VideoReader(synthetic_video_path)
    assert r.width == 1280
    assert r.height == 720
    assert r.fps == 30.0
    r.close()


def test_seek_returns_different_frames(synthetic_video_path):
    r = VideoReader(synthetic_video_path)
    f0 = r.decode_frame(0)
    f75 = r.decode_frame(75)
    f149 = r.decode_frame(149)
    # Red channel changes over time in our synthetic video
    assert f0[:, :, 0].mean() != f75[:, :, 0].mean()
    assert f75[:, :, 0].mean() != f149[:, :, 0].mean()
    r.close()
