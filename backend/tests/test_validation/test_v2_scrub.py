"""V2: PyAV Scrub Test — seek performance on 1080p content."""

import time

import numpy as np

from video.reader import VideoReader


def test_scrub_100_seeks(synthetic_video_path):
    """Seek to 100 positions in synthetic video. PASS: <50ms per seek at 720p."""
    reader = VideoReader(synthetic_video_path)
    rng = np.random.default_rng(42)
    positions = rng.integers(0, reader.frame_count, size=100)

    times = []
    for pos in positions:
        t0 = time.perf_counter()
        frame = reader.decode_frame(int(pos))
        elapsed = (time.perf_counter() - t0) * 1000
        times.append(elapsed)
        assert frame.shape[0] == reader.height
        assert frame.shape[1] == reader.width

    reader.close()

    avg_ms = sum(times) / len(times)
    p95 = sorted(times)[94]
    # 720p synthetic clip — should be well under 50ms
    assert avg_ms < 50.0, f"Average seek {avg_ms:.1f}ms exceeds 50ms budget"
    assert p95 < 100.0, f"P95 seek {p95:.1f}ms exceeds 100ms budget"
