import logging
import os
import threading
from typing import Callable, Generator

import cv2
import numpy as np

logger = logging.getLogger(__name__)

SUPPORTED_FORMATS = {"png", "jpeg", "tiff"}


def _frame_path(output_dir: str, index: int, width: int, ext: str) -> str:
    return os.path.join(output_dir, f"frame_{str(index).zfill(width)}.{ext}")


def _write_frame(frame: np.ndarray, path: str, fmt: str, jpeg_quality: int) -> None:
    bgr = cv2.cvtColor(frame, cv2.COLOR_RGBA2BGR)
    if fmt == "jpeg":
        cv2.imwrite(path, bgr, [cv2.IMWRITE_JPEG_QUALITY, jpeg_quality])
    else:
        cv2.imwrite(path, bgr)


def export_image_sequence(
    frames: list[np.ndarray],
    output_dir: str,
    format: str = "png",
    jpeg_quality: int = 95,
) -> list[str]:
    if format not in SUPPORTED_FORMATS:
        raise ValueError(
            f"Unsupported format '{format}'. Must be one of {SUPPORTED_FORMATS}"
        )
    os.makedirs(output_dir, exist_ok=True)
    ext = "jpg" if format == "jpeg" else format
    width = max(len(str(len(frames))), 1)
    paths: list[str] = []
    for i, frame in enumerate(frames, start=1):
        path = _frame_path(output_dir, i, width, ext)
        _write_frame(frame, path, format, jpeg_quality)
        paths.append(path)
    logger.info("Exported %d frames to %s", len(paths), output_dir)
    return paths


def export_image_sequence_from_generator(
    frame_generator: Generator[np.ndarray, None, None],
    total_frames: int,
    output_dir: str,
    format: str = "png",
    jpeg_quality: int = 95,
    cancel_event: threading.Event | None = None,
    progress_callback: Callable[[int, int], None] | None = None,
) -> tuple[list[str], bool]:
    if format not in SUPPORTED_FORMATS:
        raise ValueError(
            f"Unsupported format '{format}'. Must be one of {SUPPORTED_FORMATS}"
        )
    os.makedirs(output_dir, exist_ok=True)
    ext = "jpg" if format == "jpeg" else format
    width = max(len(str(total_frames)), 1)
    paths: list[str] = []
    for i, frame in enumerate(frame_generator, start=1):
        if cancel_event and cancel_event.is_set():
            logger.info("Export cancelled at frame %d/%d", i, total_frames)
            return paths, False
        path = _frame_path(output_dir, i, width, ext)
        _write_frame(frame, path, format, jpeg_quality)
        paths.append(path)
        if progress_callback:
            progress_callback(i, total_frames)
    logger.info("Exported %d frames to %s", len(paths), output_dir)
    return paths, True
