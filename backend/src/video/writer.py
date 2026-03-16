"""Video encoding via PyAV."""

import av
import numpy as np


class VideoWriter:
    def __init__(
        self,
        path: str,
        width: int,
        height: int,
        fps: int = 30,
        codec: str = "libx264",
        pix_fmt: str = "yuv420p",
        preset: str | None = None,
        bitrate: int | None = None,
        crf: int | None = None,
        profile: int | None = None,
    ):
        self.container = av.open(path, mode="w")
        self.stream = self.container.add_stream(codec, rate=fps)
        self.stream.width = width
        self.stream.height = height
        self.stream.pix_fmt = pix_fmt
        self.frame_count = 0

        # Codec options applied via stream.options dict
        if preset is not None:
            self.stream.options["preset"] = str(preset)

        if bitrate is not None:
            # CBR mode — set bitrate, disable CRF
            self.stream.bit_rate = bitrate
        elif crf is not None:
            # CRF mode (H.264/H.265 only)
            self.stream.options["crf"] = str(crf)

        if profile is not None:
            self.stream.options["profile"] = str(profile)

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
