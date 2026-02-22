"""Edge Detect effect — detects edges using sobel, canny, or laplacian."""

import numpy as np

EFFECT_ID = "fx.edge_detect"
EFFECT_NAME = "Edge Detect"
EFFECT_CATEGORY = "enhance"

PARAMS: dict = {
    "method": {
        "type": "choice",
        "choices": ["sobel", "canny", "laplacian"],
        "default": "sobel",
        "label": "Detection Method",
    }
}


def apply(
    frame: np.ndarray,
    params: dict,
    state_in: dict | None = None,
    *,
    frame_index: int,
    seed: int,
    resolution: tuple[int, int],
) -> tuple[np.ndarray, dict | None]:
    """Detect edges using selected method. Stateless."""
    import cv2

    method = params.get("method", "sobel")
    output = frame.copy()

    # Convert RGB to grayscale for edge detection
    gray = (
        0.299 * frame[:, :, 0].astype(np.float32)
        + 0.587 * frame[:, :, 1].astype(np.float32)
        + 0.114 * frame[:, :, 2].astype(np.float32)
    ).astype(np.uint8)

    if method == "canny":
        edges = cv2.Canny(gray, 100, 200)
    elif method == "laplacian":
        lap = cv2.Laplacian(gray, cv2.CV_64F)
        edges = np.clip(np.abs(lap), 0, 255).astype(np.uint8)
    else:  # sobel
        gx = cv2.Sobel(gray, cv2.CV_64F, 1, 0, ksize=3)
        gy = cv2.Sobel(gray, cv2.CV_64F, 0, 1, ksize=3)
        edges = np.clip(np.sqrt(gx**2 + gy**2), 0, 255).astype(np.uint8)

    # Write edges to all 3 RGB channels, preserve alpha
    output[:, :, 0] = edges
    output[:, :, 1] = edges
    output[:, :, 2] = edges

    return output, None
