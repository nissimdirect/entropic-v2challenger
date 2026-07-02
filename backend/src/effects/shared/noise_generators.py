"""Seeded noise generators for effects — value noise, fractal noise."""

import numpy as np

from engine.determinism import make_rng


def value_noise_2d(h: int, w: int, scale: float = 64.0, seed: int = 42) -> np.ndarray:
    """Generate 2D value noise (smooth random field).

    Returns float32 array (H, W) in range [0, 1].
    """
    rng = make_rng(seed)
    # Grid of random values at low resolution, then interpolate
    grid_h = max(2, int(h / scale) + 2)
    grid_w = max(2, int(w / scale) + 2)
    grid = rng.random((grid_h, grid_w)).astype(np.float32)

    # Bilinear interpolation to full resolution
    y_coords = np.linspace(0, grid_h - 1, h).astype(np.float32)
    x_coords = np.linspace(0, grid_w - 1, w).astype(np.float32)

    y0 = np.floor(y_coords).astype(int)
    x0 = np.floor(x_coords).astype(int)
    y1 = np.minimum(y0 + 1, grid_h - 1)
    x1 = np.minimum(x0 + 1, grid_w - 1)

    fy = (y_coords - y0).reshape(-1, 1)
    fx = (x_coords - x0).reshape(1, -1)

    # Smooth step for better visual quality
    fy = fy * fy * (3 - 2 * fy)
    fx = fx * fx * (3 - 2 * fx)

    v00 = grid[y0][:, x0]
    v01 = grid[y0][:, x1]
    v10 = grid[y1][:, x0]
    v11 = grid[y1][:, x1]

    return (
        v00 * (1 - fx) * (1 - fy)
        + v01 * fx * (1 - fy)
        + v10 * (1 - fx) * fy
        + v11 * fx * fy
    )


def fractal_noise_2d(
    h: int,
    w: int,
    octaves: int = 4,
    base_scale: float = 64.0,
    persistence: float = 0.5,
    seed: int = 42,
) -> np.ndarray:
    """Generate 2D fractal (fBm) noise by layering value noise octaves.

    Returns float32 array (H, W) in range [0, 1].
    """
    result = np.zeros((h, w), dtype=np.float32)
    amplitude = 1.0
    total_amplitude = 0.0

    for i in range(octaves):
        scale = base_scale / (2**i)
        result += value_noise_2d(h, w, scale, seed + i * 1000) * amplitude
        total_amplitude += amplitude
        amplitude *= persistence

    return result / total_amplitude
