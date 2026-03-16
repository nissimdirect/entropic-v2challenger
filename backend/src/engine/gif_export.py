"""Animated GIF export for Entropic timeline selections."""

import logging
import threading
from typing import Callable

import cv2
import numpy as np
from PIL import Image

logger = logging.getLogger(__name__)

MAX_DURATION_SECONDS = 30


def _downscale_frame(frame: np.ndarray, max_width: int) -> np.ndarray:
    h, w = frame.shape[:2]
    if w <= max_width:
        return frame
    scale = max_width / w
    new_w = max_width
    new_h = int(h * scale)
    return cv2.resize(frame, (new_w, new_h), interpolation=cv2.INTER_AREA)


def _to_pil(frame: np.ndarray, dithering: bool) -> Image.Image:
    rgb = frame[:, :, :3]  # drop alpha
    img = Image.fromarray(rgb)
    dither_mode = Image.Dither.FLOYDSTEINBERG if dithering else Image.Dither.NONE
    return img.quantize(dither=dither_mode).convert("RGB")


def export_gif(
    frames: list[np.ndarray],
    output_path: str,
    fps: int = 15,
    max_width: int = 480,
    dithering: bool = True,
) -> None:
    max_frames = fps * MAX_DURATION_SECONDS
    if len(frames) > max_frames:
        logger.warning(
            "Frame count %d exceeds %d-second max (%d frames). Truncating.",
            len(frames),
            MAX_DURATION_SECONDS,
            max_frames,
        )
        frames = frames[:max_frames]

    duration_ms = int(1000 / fps)
    pil_frames = [_to_pil(_downscale_frame(f, max_width), dithering) for f in frames]

    pil_frames[0].save(
        output_path,
        save_all=True,
        append_images=pil_frames[1:],
        duration=duration_ms,
        loop=0,
    )
    logger.info(
        "GIF exported: %s (%d frames, %d fps)", output_path, len(pil_frames), fps
    )


def export_gif_from_generator(
    frame_generator,
    total_frames: int,
    output_path: str,
    fps: int = 15,
    max_width: int = 480,
    dithering: bool = True,
    cancel_event: threading.Event | None = None,
    progress_callback: Callable[[int, int], None] | None = None,
) -> bool:
    max_frames = fps * MAX_DURATION_SECONDS
    if total_frames > max_frames:
        logger.warning(
            "Total frames %d exceeds %d-second max (%d frames). Will truncate.",
            total_frames,
            MAX_DURATION_SECONDS,
            max_frames,
        )

    pil_frames: list[Image.Image] = []
    for i, frame in enumerate(frame_generator):
        if cancel_event is not None and cancel_event.is_set():
            logger.info("GIF export cancelled at frame %d/%d", i, total_frames)
            return False
        if i >= max_frames:
            break
        pil_frames.append(_to_pil(_downscale_frame(frame, max_width), dithering))
        if progress_callback is not None:
            progress_callback(i + 1, total_frames)

    if not pil_frames:
        logger.warning("No frames collected; GIF not written.")
        return False

    duration_ms = int(1000 / fps)
    pil_frames[0].save(
        output_path,
        save_all=True,
        append_images=pil_frames[1:],
        duration=duration_ms,
        loop=0,
    )
    logger.info(
        "GIF exported: %s (%d frames, %d fps)", output_path, len(pil_frames), fps
    )
    return True
