"""Ring buffer shared memory writer for frame transport."""

import mmap
import os
import struct
from pathlib import Path

import numpy as np

from engine.cache import encode_mjpeg

HEADER_SIZE = 64
DEFAULT_RING_SIZE = 4
DEFAULT_SLOT_SIZE = 4 * 1024 * 1024  # 4MB


def default_shm_path() -> str:
    return os.environ.get(
        "ENTROPIC_SHM_PATH",
        str(Path.home() / ".cache" / "entropic" / "frames"),
    )


class SharedMemoryWriter:
    def __init__(
        self,
        path: str | None = None,
        ring_size: int = DEFAULT_RING_SIZE,
        slot_size: int = DEFAULT_SLOT_SIZE,
    ):
        self.path = path or default_shm_path()
        self.ring_size = ring_size
        self.slot_size = slot_size
        self.total_size = HEADER_SIZE + (ring_size * slot_size)
        self.write_index = 0
        self.frame_count = 0
        # Create parent dirs, open/truncate file, mmap it
        Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        self.fd = os.open(self.path, os.O_RDWR | os.O_CREAT | os.O_TRUNC)
        os.ftruncate(self.fd, self.total_size)
        self.buf = mmap.mmap(self.fd, self.total_size)
        self._write_header(0, 0, 0, 0)  # Initialize header

    def _write_header(
        self,
        width: int,
        height: int,
        write_idx: int | None = None,
        frame_cnt: int | None = None,
    ):
        wi = write_idx if write_idx is not None else self.write_index
        fc = frame_cnt if frame_cnt is not None else self.frame_count
        struct.pack_into(
            "<IIIIII",
            self.buf,
            0,
            wi,
            fc,
            self.slot_size,
            self.ring_size,
            width,
            height,
        )

    def write_frame(self, frame_rgba: np.ndarray, quality: int = 95) -> int:
        data = encode_mjpeg(frame_rgba, quality)
        if len(data) + 4 > self.slot_size:
            raise ValueError(
                f"MJPEG frame ({len(data)} bytes) exceeds slot size ({self.slot_size})"
            )
        slot = self.write_index % self.ring_size
        offset = HEADER_SIZE + (slot * self.slot_size)
        struct.pack_into("<I", self.buf, offset, len(data))
        self.buf[offset + 4 : offset + 4 + len(data)] = data
        self.write_index += 1
        self.frame_count += 1
        h, w = frame_rgba.shape[:2]
        self._write_header(w, h)
        return self.write_index - 1

    def close(self):
        self.buf.close()
        os.close(self.fd)
