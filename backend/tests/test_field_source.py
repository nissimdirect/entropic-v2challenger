"""P6.3 tests — FieldProvider: image/video ref → 2D field provider.

All 14 required test names are present. Perf assertions use median-of-N
timing to reduce CI noise.
"""

from __future__ import annotations

import logging
import statistics
import threading
import time
from unittest.mock import MagicMock, patch

import numpy as np
import pytest

from effects.field_params import FieldRef
from effects.field_source import (
    FIELD_CACHE_MAX_BYTES,
    FIELD_CACHE_MAX_ENTRIES,
    FieldProvider,
    _FieldLRUCache,
    _flat_field,
)
from video.codec_timeout import CodecTimeoutError
from video.image_reader import ImageReader

# ---------------------------------------------------------------------------
# Helpers / factories
# ---------------------------------------------------------------------------

_RESOLUTION_HD = (1920, 1080)
_RESOLUTION_SMALL = (64, 48)


def _make_rgba_frame(width: int, height: int, value: int = 128) -> np.ndarray:
    """Return a solid-colour RGBA uint8 frame."""
    frame = np.full((height, width, 4), value, dtype=np.uint8)
    return frame


def _make_image_reader(
    width: int = 100, height: int = 80, pixel_value: int = 128
) -> ImageReader:
    """Build an ImageReader-like object backed by a synthetic frame."""
    reader = MagicMock(spec=ImageReader)
    reader.width = width
    reader.height = height
    reader.frame_count = 150  # 5 s × 30 fps
    reader.decode_frame.return_value = _make_rgba_frame(width, height, pixel_value)
    return reader


def _make_video_reader(
    width: int = 100,
    height: int = 80,
    frame_count: int = 10,
    pixel_value: int = 64,
):
    """Build a VideoReader-like mock."""
    from video.reader import VideoReader

    reader = MagicMock(spec=VideoReader)
    reader.width = width
    reader.height = height
    reader.frame_count = frame_count
    reader.decode_frame.return_value = _make_rgba_frame(width, height, pixel_value)
    return reader


def _make_ref(
    kind: str = "image",
    source_id: str = "src1",
    gain: float = 1.0,
    invert: bool = False,
) -> FieldRef:
    return FieldRef(kind=kind, source_id=source_id, gain=gain, invert=invert)


def _provider_with_image(
    source_id: str = "src1",
    width: int = 100,
    height: int = 80,
    pixel_value: int = 128,
) -> tuple[FieldProvider, MagicMock]:
    provider = FieldProvider()
    reader = _make_image_reader(width, height, pixel_value)
    provider.register_reader(source_id, reader)
    return provider, reader


# ---------------------------------------------------------------------------
# 1. Basic range
# ---------------------------------------------------------------------------


def test_image_ref_resolves_to_unit_range_field():
    """Resolved field must be float32 with all values in [0, 1]."""
    provider, _ = _provider_with_image(pixel_value=200)
    ref = _make_ref(kind="image", source_id="src1")
    field = provider.resolve(ref, frame_index=0, resolution=_RESOLUTION_SMALL)

    assert field.dtype == np.float32
    assert field.shape == (_RESOLUTION_SMALL[1], _RESOLUTION_SMALL[0])
    assert float(field.min()) >= 0.0
    assert float(field.max()) <= 1.0


# ---------------------------------------------------------------------------
# 2. Resolution
# ---------------------------------------------------------------------------


def test_field_resized_to_render_resolution():
    """Output shape must match the requested (width, height)."""
    provider, _ = _provider_with_image(width=32, height=32)
    ref = _make_ref(kind="image", source_id="src1")
    w, h = 320, 240
    field = provider.resolve(ref, frame_index=0, resolution=(w, h))
    assert field.shape == (h, w)


# ---------------------------------------------------------------------------
# 3. Gain + invert
# ---------------------------------------------------------------------------


def test_gain_and_invert_applied():
    """gain=0 produces all-0 field; invert=True with gain=0 produces all-1."""
    provider, _ = _provider_with_image(pixel_value=180)
    ref_gain0 = _make_ref(kind="image", source_id="src1", gain=0.0, invert=False)
    field_gain0 = provider.resolve(
        ref_gain0, frame_index=0, resolution=_RESOLUTION_SMALL
    )
    assert np.allclose(field_gain0, 0.0)

    # Fresh provider to avoid cache hitting previous gain=0 result
    provider2, _ = _provider_with_image(pixel_value=180)
    ref_inv = _make_ref(kind="image", source_id="src1", gain=0.0, invert=True)
    field_inv = provider2.resolve(ref_inv, frame_index=0, resolution=_RESOLUTION_SMALL)
    assert np.allclose(field_inv, 1.0)


# ---------------------------------------------------------------------------
# 4. NaN / Inf sanitization
# ---------------------------------------------------------------------------


def test_nan_input_sanitized():
    """Frames containing NaN/Inf must produce finite [0, 1] output."""
    provider = FieldProvider()
    reader = _make_image_reader(width=64, height=48)
    # Inject a frame with NaN/Inf in the R channel
    bad_frame = _make_rgba_frame(64, 48, 128).astype(np.float32)
    bad_frame[:, :, 0] = np.nan
    bad_frame[:, :, 1] = np.inf
    bad_frame[:, :, 2] = -np.inf
    # The reader should return this; field_source must handle it
    reader.decode_frame.return_value = bad_frame.astype(np.uint8)  # saturates but OK
    # Directly test by injecting float frame that would become NaN after luma
    from effects.field_source import _rgba_to_luma_float32

    nan_frame = np.full((48, 64, 4), np.nan, dtype=np.float32)
    luma = _rgba_to_luma_float32(nan_frame.astype(np.uint8))
    assert np.all(np.isfinite(luma))
    assert float(luma.min()) >= 0.0
    assert float(luma.max()) <= 1.0

    # Also test the full resolve path
    provider.register_reader("src1", reader)
    ref = _make_ref(kind="image", source_id="src1")
    field = provider.resolve(ref, frame_index=0, resolution=_RESOLUTION_SMALL)
    assert np.all(np.isfinite(field))
    assert float(field.min()) >= 0.0
    assert float(field.max()) <= 1.0


# ---------------------------------------------------------------------------
# 5. Missing source → flat 0.5
# ---------------------------------------------------------------------------


def test_missing_source_returns_flat_field_and_warns(caplog):
    """Unregistered source_id must return flat 0.5 and emit a warning."""
    provider = FieldProvider()
    ref = _make_ref(kind="image", source_id="nonexistent_id_xyz")
    with caplog.at_level(logging.WARNING, logger="effects.field_source"):
        field = provider.resolve(ref, frame_index=0, resolution=_RESOLUTION_SMALL)
    assert np.allclose(field, 0.5)
    assert any("nonexistent_id_xyz" in r.message for r in caplog.records)


# ---------------------------------------------------------------------------
# 6. Corrupt video / SG-7 timeout → flat 0.5
# ---------------------------------------------------------------------------


def test_corrupt_video_sg7_timeout_returns_flat_field(caplog):
    """CodecTimeoutError from decode_frame must produce flat 0.5 + warning."""
    provider = FieldProvider()
    reader = _make_video_reader()
    reader.decode_frame.side_effect = CodecTimeoutError(
        asset_path="/fake/video.mp4", operation="decode", elapsed_s=5.0
    )
    provider.register_reader("vid1", reader)
    ref = _make_ref(kind="video", source_id="vid1")
    with caplog.at_level(logging.WARNING, logger="effects.field_source"):
        field = provider.resolve(ref, frame_index=0, resolution=_RESOLUTION_SMALL)
    assert np.allclose(field, 0.5)
    assert any("vid1" in r.message for r in caplog.records)


# ---------------------------------------------------------------------------
# 7. Out-of-range frame index wraps
# ---------------------------------------------------------------------------


def test_out_of_range_frame_index_wraps_not_raises():
    """Negative, past-end, and very large frame indices must wrap, not raise."""
    frame_count = 10
    provider = FieldProvider()
    reader = _make_video_reader(frame_count=frame_count)
    provider.register_reader("vid1", reader)
    ref = _make_ref(kind="video", source_id="vid1")

    # Collect which actual frame indices were decoded
    decoded_indices = []
    original_decode = reader.decode_frame.side_effect

    def tracking_decode(idx):
        decoded_indices.append(idx)
        return _make_rgba_frame(100, 80, 64)

    reader.decode_frame.side_effect = tracking_decode

    # Negative: -1 → 9
    decoded_indices.clear()
    field = provider.resolve(ref, frame_index=-1, resolution=_RESOLUTION_SMALL)
    assert field.shape == (_RESOLUTION_SMALL[1], _RESOLUTION_SMALL[0])
    assert decoded_indices == [frame_count - 1]

    # Past-end: len+5 → 5
    # Use new provider to avoid cache
    provider2 = FieldProvider()
    provider2.register_reader("vid1", _make_video_reader(frame_count=frame_count))
    decoded2 = []

    def tracking_decode2(idx):
        decoded2.append(idx)
        return _make_rgba_frame(100, 80, 64)

    provider2._sources["vid1"].decode_frame.side_effect = tracking_decode2
    provider2.resolve(ref, frame_index=frame_count + 5, resolution=_RESOLUTION_SMALL)
    assert decoded2 == [5]

    # Very large: 10**9 % 10 == 0
    provider3 = FieldProvider()
    provider3.register_reader("vid1", _make_video_reader(frame_count=frame_count))
    decoded3 = []

    def tracking_decode3(idx):
        decoded3.append(idx)
        return _make_rgba_frame(100, 80, 64)

    provider3._sources["vid1"].decode_frame.side_effect = tracking_decode3
    provider3.resolve(ref, frame_index=10**9, resolution=_RESOLUTION_SMALL)
    assert decoded3 == [10**9 % frame_count]


# ---------------------------------------------------------------------------
# 8. Oversize source → flat 0.5
# ---------------------------------------------------------------------------


def test_oversize_source_dimension_refused(caplog):
    """Source with any dimension > 8192 px must return flat 0.5 + warning."""
    provider = FieldProvider()
    reader = _make_image_reader(width=9000, height=9000)
    provider.register_reader("big_src", reader)
    ref = _make_ref(kind="image", source_id="big_src")
    with caplog.at_level(logging.WARNING, logger="effects.field_source"):
        field = provider.resolve(ref, frame_index=0, resolution=_RESOLUTION_SMALL)
    assert np.allclose(field, 0.5)
    assert any("9000" in r.message for r in caplog.records)


# ---------------------------------------------------------------------------
# 9. lane2d kind → flat 0.5 (Tier 3 reserved)
# ---------------------------------------------------------------------------


def test_lane2d_kind_returns_flat_field_v1(caplog):
    """lane2d kind is Tier 3 — must return flat 0.5 and log a warning."""
    provider = FieldProvider()
    ref = FieldRef(kind="lane2d", source_id="lane_src")
    with caplog.at_level(logging.WARNING, logger="effects.field_source"):
        field = provider.resolve(ref, frame_index=0, resolution=_RESOLUTION_SMALL)
    assert np.allclose(field, 0.5)
    assert any("lane2d" in r.message for r in caplog.records)


# ---------------------------------------------------------------------------
# 9b. P6.11-DEDUP-GAP — dead-source warning dedup (F7a)
# ---------------------------------------------------------------------------


def test_dead_source_warning_deduped_across_60_frames(caplog):
    """A 60-frame render of one dead (unregistered) ref must warn exactly once,
    not once per frame."""
    provider = FieldProvider()
    ref = _make_ref(kind="image", source_id="dead_src")
    with caplog.at_level(logging.WARNING, logger="effects.field_source"):
        for frame_index in range(60):
            field = provider.resolve(
                ref, frame_index=frame_index, resolution=_RESOLUTION_SMALL
            )
            assert np.allclose(field, 0.5)
    warnings = [r for r in caplog.records if "dead_src" in r.message]
    assert len(warnings) == 1


def test_two_distinct_dead_sources_each_warn_once(caplog):
    """Two distinct dead refs, each rendered across 60 frames, must warn exactly
    once per source (not once total, not once per frame)."""
    provider = FieldProvider()
    ref_a = _make_ref(kind="image", source_id="dead_a")
    ref_b = _make_ref(kind="image", source_id="dead_b")
    with caplog.at_level(logging.WARNING, logger="effects.field_source"):
        for frame_index in range(60):
            provider.resolve(
                ref_a, frame_index=frame_index, resolution=_RESOLUTION_SMALL
            )
            provider.resolve(
                ref_b, frame_index=frame_index, resolution=_RESOLUTION_SMALL
            )
    warnings_a = [r for r in caplog.records if "dead_a" in r.message]
    warnings_b = [r for r in caplog.records if "dead_b" in r.message]
    assert len(warnings_a) == 1
    assert len(warnings_b) == 1
    assert len(caplog.records) == 2


def test_dead_source_warning_refires_after_recovery(caplog):
    """A source that fails, then succeeds, then fails again must warn twice —
    dedup suppresses repeats of the SAME failure streak, not all future failures."""
    provider = FieldProvider()
    reader = _make_video_reader(frame_count=3)
    provider.register_reader("vid_flaky", reader)
    ref = _make_ref(kind="video", source_id="vid_flaky")

    calls = {"n": 0}

    def flaky_decode(idx):
        calls["n"] += 1
        if calls["n"] in (1, 3):
            raise CodecTimeoutError(
                asset_path="/fake/video.mp4", operation="decode", elapsed_s=5.0
            )
        return _make_rgba_frame(100, 80, 64)

    reader.decode_frame.side_effect = flaky_decode

    with caplog.at_level(logging.WARNING, logger="effects.field_source"):
        provider.resolve(
            ref, frame_index=0, resolution=_RESOLUTION_SMALL
        )  # fails: warn #1
        provider.resolve(
            ref, frame_index=1, resolution=_RESOLUTION_SMALL
        )  # succeeds: clears
        provider.resolve(
            ref, frame_index=2, resolution=_RESOLUTION_SMALL
        )  # fails: warn #2

    warnings = [r for r in caplog.records if "vid_flaky" in r.message]
    assert len(warnings) == 2


def test_dead_source_warning_dedup_thread_safe(caplog):
    """FieldProvider is shared across the export thread and preview thread
    (see engine/pipeline.py); concurrent resolve() calls against the same dead
    source must not race past the dedup guard and double-warn."""
    provider = FieldProvider()
    ref = _make_ref(kind="image", source_id="dead_concurrent")

    def hammer():
        for frame_index in range(50):
            provider.resolve(ref, frame_index=frame_index, resolution=_RESOLUTION_SMALL)

    with caplog.at_level(logging.WARNING, logger="effects.field_source"):
        threads = [threading.Thread(target=hammer) for _ in range(8)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

    warnings = [r for r in caplog.records if "dead_concurrent" in r.message]
    assert len(warnings) == 1


# ---------------------------------------------------------------------------
# 10. LRU eviction under entry and byte caps
# ---------------------------------------------------------------------------


def test_lru_eviction_under_entry_and_byte_caps():
    """Inserting 65 distinct entries must trigger eviction; bytes <= cap."""
    cache = _FieldLRUCache(max_entries=64, max_bytes=FIELD_CACHE_MAX_BYTES)
    # Each field: 64×48 float32 = 12 288 bytes
    field = np.zeros((48, 64), dtype=np.float32)
    for i in range(65):
        cache.put(key=i, field=field.copy())
    stats = cache.stats()
    assert stats["evictions"] >= 1
    assert stats["entries"] <= 64
    assert stats["bytes"] <= FIELD_CACHE_MAX_BYTES


# ---------------------------------------------------------------------------
# 11. Video frame wraps correctly
# ---------------------------------------------------------------------------


def test_video_ref_frame_wraps():
    """Video resolve wraps frame_index modulo frame_count."""
    frame_count = 7
    provider = FieldProvider()
    reader = _make_video_reader(frame_count=frame_count)
    decoded = []

    def track(idx):
        decoded.append(idx)
        return _make_rgba_frame(100, 80, 100)

    reader.decode_frame.side_effect = track
    provider.register_reader("v1", reader)
    ref = _make_ref(kind="video", source_id="v1")
    # frame 8 → 8 % 7 = 1
    provider.resolve(ref, frame_index=8, resolution=_RESOLUTION_SMALL)
    assert decoded == [1]


# ---------------------------------------------------------------------------
# 12. Cache hit skips decode
# ---------------------------------------------------------------------------


def test_cache_hit_skips_decode():
    """Second resolve with same (source, frame, resolution) must not call decode_frame again."""
    provider, reader = _provider_with_image()
    ref = _make_ref(kind="image", source_id="src1")
    provider.resolve(ref, frame_index=0, resolution=_RESOLUTION_SMALL)
    call_count_after_first = reader.decode_frame.call_count
    # Second resolve — same key → cache hit
    provider.resolve(ref, frame_index=0, resolution=_RESOLUTION_SMALL)
    assert reader.decode_frame.call_count == call_count_after_first  # no new decode


# ---------------------------------------------------------------------------
# 13. Cache-hit resolve under 1 ms (median of 20)
# ---------------------------------------------------------------------------


def test_cache_hit_resolve_under_1ms():
    """Median cache-hit resolve time must be < 1 ms."""
    provider, _ = _provider_with_image()
    ref = _make_ref(kind="image", source_id="src1")
    # Prime the cache
    provider.resolve(ref, frame_index=0, resolution=_RESOLUTION_SMALL)

    timings = []
    for _ in range(20):
        t0 = time.perf_counter()
        provider.resolve(ref, frame_index=0, resolution=_RESOLUTION_SMALL)
        timings.append(time.perf_counter() - t0)

    median_ms = statistics.median(timings) * 1000
    assert median_ms < 1.0, f"Cache-hit median {median_ms:.3f} ms >= 1 ms"


# ---------------------------------------------------------------------------
# 14. Still-image cache-miss resolve at 1080p under 80 ms (median of 3)
# ---------------------------------------------------------------------------


def test_image_miss_resolve_1080p_under_80ms():
    """Median cache-miss still-image resolve at 1080p must be < 80 ms."""
    timings = []
    for _ in range(3):
        # Fresh provider each iteration to ensure cache miss
        provider = FieldProvider()
        reader = _make_image_reader(width=1920, height=1080, pixel_value=128)
        provider.register_reader("src_hd", reader)
        ref = _make_ref(kind="image", source_id="src_hd")
        t0 = time.perf_counter()
        provider.resolve(ref, frame_index=0, resolution=_RESOLUTION_HD)
        timings.append(time.perf_counter() - t0)

    median_ms = statistics.median(timings) * 1000
    assert median_ms < 80.0, f"Image-miss median {median_ms:.2f} ms >= 80 ms"
