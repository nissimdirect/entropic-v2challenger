"""Tests for PyAV video reader."""

import time

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


# --- Sequential decode optimization tests ---


def test_sequential_decode_returns_valid_frames(synthetic_video_path):
    """Sequential decode (frame N, N+1, N+2...) returns valid RGBA frames."""
    r = VideoReader(synthetic_video_path)
    for i in range(10):
        frame = r.decode_frame(i)
        assert frame.shape == (720, 1280, 4)
        assert frame.dtype.name == "uint8"
    r.close()


def test_sequential_decode_uses_fast_path(synthetic_video_path):
    """Sequential reads should track _last_decoded_index correctly."""
    r = VideoReader(synthetic_video_path)
    r.decode_frame(0)
    assert r._last_decoded_index == 0
    r.decode_frame(1)
    assert r._last_decoded_index == 1
    r.decode_frame(2)
    assert r._last_decoded_index == 2
    r.close()


def test_sequential_then_seek_then_sequential(synthetic_video_path):
    """Mix of sequential reads and seeks returns correct frames."""
    r = VideoReader(synthetic_video_path)
    # Sequential: 0, 1, 2
    f0 = r.decode_frame(0)
    f1 = r.decode_frame(1)
    f2 = r.decode_frame(2)
    assert f0.shape == (720, 1280, 4)
    assert f1.shape == (720, 1280, 4)
    assert f2.shape == (720, 1280, 4)

    # Seek backward to frame 75
    f75 = r.decode_frame(75)
    assert f75.shape == (720, 1280, 4)
    assert r._last_decoded_index == 75

    # Sequential again: 76, 77
    f76 = r.decode_frame(76)
    f77 = r.decode_frame(77)
    assert f76.shape == (720, 1280, 4)
    assert f77.shape == (720, 1280, 4)
    assert r._last_decoded_index == 77

    # Seek forward (skip) to frame 100
    f100 = r.decode_frame(100)
    assert f100.shape == (720, 1280, 4)
    assert r._last_decoded_index == 100
    r.close()


def test_sequential_decode_faster_than_seeking(synthetic_video_path):
    """Sequential decode of 120 frames should average <5ms/frame.

    This validates the core optimization: sequential next() is faster
    than seek() + decode for every frame.
    """
    r = VideoReader(synthetic_video_path)

    # Warm up: decode frame 0 to initialize the decoder
    r.decode_frame(0)

    # Measure sequential decode for frames 1-120
    num_frames = 120
    times = []
    for i in range(1, num_frames + 1):
        t0 = time.perf_counter()
        frame = r.decode_frame(i)
        elapsed_ms = (time.perf_counter() - t0) * 1000
        times.append(elapsed_ms)
        assert frame.shape == (720, 1280, 4)

    avg_ms = sum(times) / len(times)
    p95 = sorted(times)[int(len(times) * 0.95) - 1]
    r.close()

    assert avg_ms < 5.0, (
        f"Sequential decode avg {avg_ms:.2f}ms exceeds 5ms budget. "
        f"P95={p95:.2f}ms. This suggests seek-per-frame may still be active."
    )


def test_backward_seek_works(synthetic_video_path):
    """Seeking backward (frame 100 -> frame 50) still works correctly."""
    r = VideoReader(synthetic_video_path)
    f100 = r.decode_frame(100)
    assert r._last_decoded_index == 100

    # Backward seek should use _decode_with_seek
    f50 = r.decode_frame(50)
    assert r._last_decoded_index == 50
    assert f50.shape == (720, 1280, 4)

    # Frames should differ (red gradient changes over time)
    assert f100[:, :, 0].mean() != f50[:, :, 0].mean()
    r.close()


def test_skip_frames_triggers_seek(synthetic_video_path):
    """Skipping frames (e.g., 10 -> 50) triggers seek, not sequential read."""
    r = VideoReader(synthetic_video_path)
    r.decode_frame(10)
    assert r._last_decoded_index == 10

    # frame 50 is not 10+1, so this should seek
    r.decode_frame(50)
    assert r._last_decoded_index == 50
    r.close()
