"""Histogram utility — computes per-channel and luminance histograms."""

import numpy as np


def compute_histogram(frame: np.ndarray) -> dict:
    """
    Compute per-channel and luminance histograms.

    Args:
        frame: (H, W, 4) uint8 RGBA image

    Returns:
        {"r": [256 ints], "g": [...], "b": [...], "a": [...], "luma": [...]}
    """
    if frame.size == 0:
        empty = [0] * 256
        return {
            "r": list(empty),
            "g": list(empty),
            "b": list(empty),
            "a": list(empty),
            "luma": list(empty),
        }

    r = frame[:, :, 0].ravel()
    g = frame[:, :, 1].ravel()
    b = frame[:, :, 2].ravel()
    a = frame[:, :, 3].ravel()

    # Luminance (BT.601)
    luma = (
        0.299 * r.astype(np.float32)
        + 0.587 * g.astype(np.float32)
        + 0.114 * b.astype(np.float32)
    )
    luma = np.clip(luma, 0, 255).astype(np.uint8)

    r_hist = np.bincount(r, minlength=256)[:256].tolist()
    g_hist = np.bincount(g, minlength=256)[:256].tolist()
    b_hist = np.bincount(b, minlength=256)[:256].tolist()
    a_hist = np.bincount(a, minlength=256)[:256].tolist()
    luma_hist = np.bincount(luma, minlength=256)[:256].tolist()

    return {"r": r_hist, "g": g_hist, "b": b_hist, "a": a_hist, "luma": luma_hist}
