"""Static image reader — loads an image and serves it as a single-frame source."""

import logging
from pathlib import Path

import numpy as np
from PIL import Image

logger = logging.getLogger(__name__)

# Prevent image bomb OOM — reject images larger than 8192x8192
MAX_IMAGE_DIMENSION = 8192

# Supported image extensions (must match security.py ALLOWED_EXTENSIONS)
IMAGE_EXTENSIONS = frozenset(
    {".png", ".jpg", ".jpeg", ".tiff", ".tif", ".webp", ".bmp", ".heic", ".heif"}
)


def is_image_file(path: str) -> bool:
    """Check if a file path has an image extension."""
    return Path(path).suffix.lower() in IMAGE_EXTENSIONS


class ImageReader:
    """Reads a static image and presents it as a single-frame video source.

    The frame is decoded once on init and returned directly from decode_frame()
    (no copy — pipeline creates new arrays via effects).
    """

    def __init__(
        self, path: str, default_fps: float = 30.0, default_duration: float = 5.0
    ):
        self.path = path
        img = Image.open(path)

        # Dimension guard — prevents image bomb OOM
        if img.width > MAX_IMAGE_DIMENSION or img.height > MAX_IMAGE_DIMENSION:
            img.close()
            raise ValueError(
                f"Image dimensions {img.width}x{img.height} exceed maximum "
                f"{MAX_IMAGE_DIMENSION}x{MAX_IMAGE_DIMENSION}"
            )

        # Convert to RGBA uint8 numpy array
        img = img.convert("RGBA")
        self._frame: np.ndarray = np.array(img, dtype=np.uint8)
        img.close()

        self.width: int = self._frame.shape[1]
        self.height: int = self._frame.shape[0]
        self.fps: float = default_fps
        self.duration: float = default_duration
        self.frame_count: int = int(default_fps * default_duration)

    def decode_frame(self, frame_index: int) -> np.ndarray:
        """Return the static image frame (no copy — read-only pipeline)."""
        return self._frame

    def close(self):
        """Release the frame data."""
        self._frame = None  # type: ignore[assignment]
