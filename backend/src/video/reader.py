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
        self._last_decoded_index: int = -1
        self._decoder = self.container.decode(video=0)

    def decode_frame(self, frame_index: int) -> np.ndarray:
        """Decode a specific frame by index. Returns RGBA uint8 array.

        Optimized for sequential access: if frame_index == last_index + 1,
        uses next() on the existing decoder iterator instead of seeking.
        Seeking is only performed for non-sequential access (scrubbing,
        jumping backward, or skipping frames).
        """
        is_sequential = frame_index == self._last_decoded_index + 1

        if is_sequential:
            # Sequential read: just advance the decoder — avoids costly seek
            return self._decode_next_sequential(frame_index)
        else:
            # Non-sequential: seek to the target position
            return self._decode_with_seek(frame_index)

    def _decode_next_sequential(self, frame_index: int) -> np.ndarray:
        """Advance decoder by one frame without seeking."""
        try:
            frame = next(self._decoder)
            self._last_decoded_index = frame_index
            return frame.to_ndarray(format="rgba")
        except StopIteration:
            raise IndexError(f"Frame {frame_index} not found (end of stream)")

    def _decode_with_seek(self, frame_index: int) -> np.ndarray:
        """Seek to target frame and decode. Used for scrubbing/jumping."""
        time_s = frame_index / self.fps
        self.container.seek(int(time_s / self.stream.time_base), stream=self.stream)
        # Reset the decoder iterator after seeking
        self._decoder = self.container.decode(video=0)
        for frame in self._decoder:
            if frame.pts is not None:
                current_idx = int(float(frame.pts * self.stream.time_base) * self.fps)
                if current_idx >= frame_index:
                    self._last_decoded_index = frame_index
                    return frame.to_ndarray(format="rgba")
        raise IndexError(f"Frame {frame_index} not found")

    def close(self):
        self.container.close()
