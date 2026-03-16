"""Video analyzer operator — extracts control signals from video frames.

Analyzes a 64x64 proxy-downscaled frame to extract:
  - luminance: average brightness (0.0-1.0)
  - motion: frame-to-frame pixel delta (0.0-1.0)
  - color: dominant hue normalized (0.0-1.0)
  - edges: edge density via Sobel approximation (0.0-1.0)
  - histogram_peak: location of brightest histogram peak (0.0-1.0)
"""

import math

import numpy as np

PROXY_SIZE = 64


def downscale_proxy(frame: np.ndarray) -> np.ndarray:
    """Downscale a frame to PROXY_SIZE x PROXY_SIZE using area averaging.

    Args:
        frame: HxWx3 uint8 BGR/RGB array.

    Returns:
        PROXY_SIZE x PROXY_SIZE x 3 uint8 array.
    """
    if frame is None or frame.size == 0:
        return np.zeros((PROXY_SIZE, PROXY_SIZE, 3), dtype=np.uint8)

    h, w = frame.shape[:2]
    if h == PROXY_SIZE and w == PROXY_SIZE:
        return frame.copy()

    # Block averaging — no OpenCV dependency for downscale
    bh = max(1, h // PROXY_SIZE)
    bw = max(1, w // PROXY_SIZE)
    cropped_h = bh * PROXY_SIZE
    cropped_w = bw * PROXY_SIZE
    cropped = frame[:cropped_h, :cropped_w]

    if len(cropped.shape) == 3:
        blocks = cropped.reshape(PROXY_SIZE, bh, PROXY_SIZE, bw, cropped.shape[2])
        proxy = blocks.mean(axis=(1, 3)).astype(np.uint8)
    else:
        blocks = cropped.reshape(PROXY_SIZE, bh, PROXY_SIZE, bw)
        proxy = blocks.mean(axis=(1, 3)).astype(np.uint8)
        proxy = np.stack([proxy, proxy, proxy], axis=-1)

    return proxy


def _to_gray(proxy: np.ndarray) -> np.ndarray:
    """Convert proxy to grayscale float 0.0-1.0."""
    if len(proxy.shape) == 3 and proxy.shape[2] >= 3:
        # ITU-R BT.601 luma
        gray = (
            0.299 * proxy[:, :, 0].astype(np.float32)
            + 0.587 * proxy[:, :, 1].astype(np.float32)
            + 0.114 * proxy[:, :, 2].astype(np.float32)
        )
    else:
        gray = proxy.astype(np.float32)
    return gray / 255.0


def analyze_luminance(proxy: np.ndarray) -> float:
    """Average brightness of proxy frame, 0.0-1.0."""
    gray = _to_gray(proxy)
    val = float(np.mean(gray))
    if math.isnan(val) or math.isinf(val):
        return 0.0
    return max(0.0, min(1.0, val))


def analyze_motion(proxy: np.ndarray, prev_proxy: np.ndarray | None) -> float:
    """Frame-to-frame pixel delta, 0.0-1.0.

    Returns 0.0 on first frame (no previous).
    """
    if prev_proxy is None:
        return 0.0

    curr = _to_gray(proxy)
    prev = _to_gray(prev_proxy)

    delta = float(np.mean(np.abs(curr - prev)))
    if math.isnan(delta) or math.isinf(delta):
        return 0.0
    # Scale: typical motion delta is 0.0-0.3, normalize to 0-1
    scaled = min(1.0, delta * 3.33)
    return max(0.0, scaled)


def analyze_color(proxy: np.ndarray) -> float:
    """Dominant hue of proxy frame, normalized 0.0-1.0.

    Uses simplified RGB-to-hue without OpenCV.
    """
    if proxy.size == 0:
        return 0.0

    # Average color across all pixels
    avg = proxy.astype(np.float32).mean(axis=(0, 1))
    if len(avg) < 3:
        return 0.0

    r, g, b = avg[0] / 255.0, avg[1] / 255.0, avg[2] / 255.0
    cmax = max(r, g, b)
    cmin = min(r, g, b)
    delta = cmax - cmin

    if delta < 1e-6:
        return 0.0  # Achromatic

    if cmax == r:
        hue = ((g - b) / delta) % 6.0
    elif cmax == g:
        hue = (b - r) / delta + 2.0
    else:
        hue = (r - g) / delta + 4.0

    hue_norm = hue / 6.0
    if math.isnan(hue_norm) or math.isinf(hue_norm):
        return 0.0
    return max(0.0, min(1.0, hue_norm))


def analyze_edges(proxy: np.ndarray) -> float:
    """Edge density via Sobel approximation, 0.0-1.0."""
    gray = _to_gray(proxy)

    # Sobel kernels applied via simple convolution
    # Horizontal: [-1, 0, 1] across columns
    gx = np.abs(gray[:, 2:] - gray[:, :-2])
    # Vertical: [-1, 0, 1] across rows
    gy = np.abs(gray[2:, :] - gray[:-2, :])

    # Average gradient magnitude
    edge_x = float(np.mean(gx))
    edge_y = float(np.mean(gy))
    magnitude = math.sqrt(edge_x**2 + edge_y**2)

    if math.isnan(magnitude) or math.isinf(magnitude):
        return 0.0

    # Normalize: typical edge values 0.0-0.3
    scaled = min(1.0, magnitude * 4.0)
    return max(0.0, scaled)


def analyze_histogram_peak(proxy: np.ndarray) -> float:
    """Location of brightest histogram peak, 0.0-1.0."""
    gray = _to_gray(proxy)
    flat = (gray * 255).astype(np.uint8).ravel()

    if flat.size == 0:
        return 0.0

    # Build histogram with 256 bins
    hist = np.bincount(flat, minlength=256)
    peak_bin = int(np.argmax(hist))
    return peak_bin / 255.0


def evaluate_video_analyzer(
    method: str,
    proxy: np.ndarray,
    state_in: dict | None = None,
) -> tuple[float, dict]:
    """Evaluate a video analyzer method on a proxy frame.

    Args:
        method: One of 'luminance', 'motion', 'color', 'edges', 'histogram_peak'.
        proxy: 64x64x3 uint8 proxy frame.
        state_in: Previous state (stores prev_proxy for motion).

    Returns:
        (value, state_out) where value is 0.0-1.0.
    """
    if state_in is None:
        state_in = {}

    if proxy is None or proxy.size == 0:
        return 0.0, state_in

    if method == "luminance":
        value = analyze_luminance(proxy)
    elif method == "motion":
        prev = state_in.get("prev_proxy")
        value = analyze_motion(proxy, prev)
    elif method == "color":
        value = analyze_color(proxy)
    elif method == "edges":
        value = analyze_edges(proxy)
    elif method == "histogram_peak":
        value = analyze_histogram_peak(proxy)
    else:
        value = 0.0

    state_out = {"prev_proxy": proxy.copy()}
    return value, state_out
