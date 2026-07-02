"""Video encoding via PyAV."""

import av
import numpy as np

from video.codec_timeout import av_open_timeout


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
        self.container = av_open_timeout(path, mode="w")
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
        """Write an RGBA frame.

        Routing is pix_fmt-aware:
        - Alpha-capable targets ('a' in pix_fmt, e.g. yuva444p10le for ProRes 4444
          or yuva420p for WebM/VP9-alpha) receive the full RGBA array as "rgba" and
          let PyAV reformat to the target pix_fmt, preserving the alpha channel.
        - All other targets (yuv420p, yuv422p10le, etc.) receive the existing
          rgb24 slice byte-identically — no behaviour change for h264/h265/prores_422.
        """
        if "a" in self.stream.pix_fmt:
            # Alpha-capable codec: pass full RGBA so PyAV preserves the alpha plane.
            frame = av.VideoFrame.from_ndarray(frame_rgba, format="rgba")
        else:
            # RGB-only codec: slice to rgb24 — BYTE-IDENTICAL to the legacy path.
            frame = av.VideoFrame.from_ndarray(frame_rgba[:, :, :3], format="rgb24")
        for packet in self.stream.encode(frame):
            self.container.mux(packet)
        self.frame_count += 1

    def close(self):
        for packet in self.stream.encode():
            self.container.mux(packet)
        self.container.close()
