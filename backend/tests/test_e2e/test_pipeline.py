"""E2E pipeline smoke test: ingest → decode → effect → memory → bytes."""

import struct

import numpy as np
import pytest

from video.ingest import probe
from video.reader import VideoReader
from engine.container import EffectContainer
from effects import registry
from memory.writer import SharedMemoryWriter, HEADER_SIZE


@pytest.fixture
def test_video(tmp_path):
    """Generate a synthetic 720p 5-second test video using PyAV."""
    import av

    path = str(tmp_path / "test_720p.mp4")
    container = av.open(path, mode="w")
    stream = container.add_stream("libx264", rate=30)
    stream.width = 1280
    stream.height = 720
    stream.pix_fmt = "yuv420p"

    for i in range(150):  # 5 seconds at 30fps
        img = np.zeros((720, 1280, 3), dtype=np.uint8)
        # Color gradient that changes per frame
        img[:, :, 0] = int(255 * i / 150)  # Red ramps up
        img[:, :, 1] = 128
        img[:, :, 2] = 64
        frame = av.VideoFrame.from_ndarray(img, format="rgb24")
        for packet in stream.encode(frame):
            container.mux(packet)

    for packet in stream.encode():
        container.mux(packet)
    container.close()

    return path


class TestE2EPipeline:
    """Full pipeline: ingest → decode → effect → shared memory → bytes."""

    def test_probe_metadata(self, test_video):
        """Step 1: Probe returns correct metadata."""
        meta = probe(test_video)
        assert meta["ok"] is True
        assert meta["width"] == 1280
        assert meta["height"] == 720
        assert meta["fps"] == 30.0
        assert 4.5 <= meta["duration_s"] <= 5.5
        assert meta["codec"] == "h264"

    def test_decode_frame_shape(self, test_video):
        """Step 2: Decoded frame is RGBA with correct dimensions."""
        reader = VideoReader(test_video)
        frame = reader.decode_frame(0)
        reader.close()

        assert frame.shape == (720, 1280, 4)
        assert frame.dtype == np.uint8
        # Alpha channel should be 255 (opaque) from RGBA conversion
        assert frame[:, :, 3].min() == 255

    def test_invert_effect_processing(self, test_video):
        """Step 3: Invert effect correctly inverts RGB, preserves alpha."""
        reader = VideoReader(test_video)
        frame = reader.decode_frame(0)
        reader.close()

        # Get the invert effect from registry
        effect_info = registry.get("fx.invert")
        assert effect_info is not None

        container = EffectContainer(effect_info["fn"], "fx.invert")
        output, state = container.process(
            frame,
            {},
            None,
            frame_index=0,
            project_seed=42,
            resolution=(1280, 720),
        )

        assert output.shape == frame.shape
        assert output.dtype == np.uint8

        # Verify inversion: RGB channels should be 255 - input
        np.testing.assert_array_equal(output[:, :, :3], 255 - frame[:, :, :3])
        # Alpha preserved
        np.testing.assert_array_equal(output[:, :, 3], frame[:, :, 3])

    def test_shared_memory_write_and_read(self, test_video, tmp_path):
        """Step 4: Frame written to shared memory produces valid MJPEG."""
        reader = VideoReader(test_video)
        frame = reader.decode_frame(0)
        reader.close()

        # Process through invert
        effect_info = registry.get("fx.invert")
        container = EffectContainer(effect_info["fn"], "fx.invert")
        output, _ = container.process(
            frame,
            {},
            None,
            frame_index=0,
            project_seed=42,
            resolution=(1280, 720),
        )

        # Write to shared memory
        shm_path = str(tmp_path / "test_frames")
        writer = SharedMemoryWriter(path=shm_path)
        slot_idx = writer.write_frame(output)
        assert slot_idx == 0

        # Read back raw bytes from the mmap buffer
        # Slot 0 starts at HEADER_SIZE, first 4 bytes = frame data length
        data_len = struct.unpack_from("<I", writer.buf, HEADER_SIZE)[0]
        assert data_len > 0

        frame_bytes = bytes(writer.buf[HEADER_SIZE + 4 : HEADER_SIZE + 4 + data_len])

        # JPEG magic bytes: FF D8 FF
        assert frame_bytes[:2] == b"\xff\xd8", (
            "MJPEG data should start with JPEG SOI marker"
        )
        assert frame_bytes[2] == 0xFF, "Third byte should be FF (JPEG marker)"

        writer.close()

    def test_full_pipeline_end_to_end(self, test_video, tmp_path):
        """Step 5: Complete pipeline from file to shared memory bytes."""
        # 1. Ingest/probe
        meta = probe(test_video)
        assert meta["ok"] is True

        # 2. Decode
        reader = VideoReader(test_video)
        frame = reader.decode_frame(0)
        reader.close()
        assert frame.shape == (meta["height"], meta["width"], 4)

        # 3. Effect
        effect_info = registry.get("fx.invert")
        container = EffectContainer(effect_info["fn"], "fx.invert")
        output, _ = container.process(
            frame,
            {},
            None,
            frame_index=0,
            project_seed=42,
            resolution=(meta["width"], meta["height"]),
        )

        # 4. Shared memory
        shm_path = str(tmp_path / "pipeline_frames")
        writer = SharedMemoryWriter(path=shm_path)
        writer.write_frame(output)

        # 5. Verify header metadata in mmap
        w_idx, f_cnt, slot_sz, ring_sz, hdr_w, hdr_h = struct.unpack_from(
            "<IIIIII", writer.buf, 0
        )
        assert w_idx == 1  # One frame written
        assert f_cnt == 1
        assert hdr_w == meta["width"]
        assert hdr_h == meta["height"]

        # 6. Verify MJPEG data is present and non-trivial
        data_len = struct.unpack_from("<I", writer.buf, HEADER_SIZE)[0]
        assert data_len > 1000, "JPEG for 720p frame should be > 1KB"

        writer.close()
