"""Video decoding via PyAV."""

import av
import numpy as np


class VideoReader:
    def __init__(self, path: str):
        self.container = av.open(path)
        self.stream = self.container.streams.video[0]
        self.stream.thread_type = "AUTO"
        self.fps = float(self.stream.average_rate)
        self.duration = float(self.stream.duration * self.stream.time_base)
        self.width = self.stream.width
        self.height = self.stream.height
        self.frame_count = self.stream.frames or int(self.duration * self.fps)

    def decode_frame(self, frame_index: int) -> np.ndarray:
        """Decode a specific frame by index. Returns RGBA uint8 array."""
        time_s = frame_index / self.fps
        self.container.seek(int(time_s / self.stream.time_base), stream=self.stream)
        for frame in self.container.decode(video=0):
            if frame.pts is not None:
                current_idx = int(float(frame.pts * self.stream.time_base) * self.fps)
                if current_idx >= frame_index:
                    return frame.to_ndarray(format="rgba")
        raise IndexError(f"Frame {frame_index} not found")

    def close(self):
        self.container.close()
