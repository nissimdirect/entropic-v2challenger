"""Video encoding via PyAV."""

import av
import numpy as np


class VideoWriter:
    def __init__(
        self, path: str, width: int, height: int, fps: int = 30, codec: str = "libx264"
    ):
        self.container = av.open(path, mode="w")
        self.stream = self.container.add_stream(codec, rate=fps)
        self.stream.width = width
        self.stream.height = height
        self.stream.pix_fmt = "yuv420p"
        self.frame_count = 0

    def write_frame(self, frame_rgba: np.ndarray):
        """Write an RGBA frame."""
        frame = av.VideoFrame.from_ndarray(frame_rgba[:, :, :3], format="rgb24")
        for packet in self.stream.encode(frame):
            self.container.mux(packet)
        self.frame_count += 1

    def close(self):
        for packet in self.stream.encode():
            self.container.mux(packet)
        self.container.close()
