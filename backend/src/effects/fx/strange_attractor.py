"""Strange Attractor — Lorenz/Rossler/Thomas attractor particle system."""

import numpy as np

from engine.determinism import make_rng

EFFECT_ID = "fx.strange_attractor"
EFFECT_NAME = "Strange Attractor"
EFFECT_CATEGORY = "warping"

PARAMS: dict = {
    "attractor": {
        "type": "choice",
        "options": ["lorenz", "rossler", "thomas"],
        "default": "lorenz",
        "label": "Attractor",
        "description": "Type of strange attractor",
    },
    "speed": {
        "type": "float",
        "min": 0.1,
        "max": 5.0,
        "default": 1.0,
        "label": "Speed",
        "curve": "linear",
        "unit": "",
        "description": "Integration speed",
    },
    "trail_length": {
        "type": "int",
        "min": 1,
        "max": 30,
        "default": 10,
        "label": "Trail Length",
        "curve": "linear",
        "unit": "",
        "description": "Particle trail persistence",
    },
    "mix": {
        "type": "float",
        "min": 0.0,
        "max": 1.0,
        "default": 0.5,
        "label": "Mix",
        "curve": "linear",
        "unit": "%",
        "description": "Blend between attractor and original",
    },
    "particle_count": {
        "type": "int",
        "min": 100,
        "max": 10000,
        "default": 1000,
        "label": "Particles",
        "curve": "linear",
        "unit": "",
        "description": "Number of attractor particles",
    },
}


def _lorenz_step(pts: np.ndarray, dt: float) -> np.ndarray:
    sigma, rho, beta = 10.0, 28.0, 8.0 / 3.0
    x, y, z = pts[:, 0], pts[:, 1], pts[:, 2]
    dx = sigma * (y - x) * dt
    dy = (x * (rho - z) - y) * dt
    dz = (x * y - beta * z) * dt
    return pts + np.stack([dx, dy, dz], axis=1)


def _rossler_step(pts: np.ndarray, dt: float) -> np.ndarray:
    a, b, c = 0.2, 0.2, 5.7
    x, y, z = pts[:, 0], pts[:, 1], pts[:, 2]
    dx = (-y - z) * dt
    dy = (x + a * y) * dt
    dz = (b + z * (x - c)) * dt
    return pts + np.stack([dx, dy, dz], axis=1)


def _thomas_step(pts: np.ndarray, dt: float) -> np.ndarray:
    b = 0.208186
    x, y, z = pts[:, 0], pts[:, 1], pts[:, 2]
    dx = (np.sin(y) - b * x) * dt
    dy = (np.sin(z) - b * y) * dt
    dz = (np.sin(x) - b * z) * dt
    return pts + np.stack([dx, dy, dz], axis=1)


def apply(
    frame: np.ndarray,
    params: dict,
    state_in: dict | None = None,
    *,
    frame_index: int,
    seed: int,
    resolution: tuple[int, int],
) -> tuple[np.ndarray, dict | None]:
    """Iterate strange attractor, project particles onto frame."""
    attractor = str(params.get("attractor", "lorenz"))
    speed = max(0.1, min(5.0, float(params.get("speed", 1.0))))
    trail_length = max(1, min(30, int(params.get("trail_length", 10))))
    mix = max(0.0, min(1.0, float(params.get("mix", 0.5))))
    particle_count = max(100, min(10000, int(params.get("particle_count", 1000))))

    h, w = frame.shape[:2]
    rgb = frame[:, :, :3]
    alpha = frame[:, :, 3:4]
    rng = make_rng(seed)
    dt = 0.005 * speed

    step_fn = {
        "lorenz": _lorenz_step,
        "rossler": _rossler_step,
        "thomas": _thomas_step,
    }.get(attractor, _lorenz_step)

    # Initialize or restore state
    if state_in is not None and "particles" in state_in:
        particles = state_in["particles"]
        trail_buffer = state_in.get("trail_buffer", np.zeros((h, w), dtype=np.float32))
        if particles.shape[0] != particle_count:
            particles = (
                rng.standard_normal((particle_count, 3)).astype(np.float32) * 0.1
            )
        if trail_buffer.shape != (h, w):
            trail_buffer = np.zeros((h, w), dtype=np.float32)
    else:
        particles = rng.standard_normal((particle_count, 3)).astype(np.float32) * 0.1
        trail_buffer = np.zeros((h, w), dtype=np.float32)

    # Decay trail
    decay = 1.0 - 1.0 / max(trail_length, 1)
    trail_buffer *= decay

    # Iterate attractor
    for _ in range(5):
        particles = step_fn(particles, dt)

    # Clamp to prevent overflow
    particles = np.clip(particles, -100, 100)

    # Project 3D to 2D (use x,y axes, scale to frame)
    px = particles[:, 0]
    py = particles[:, 1]

    # Normalize to frame coordinates
    if attractor == "lorenz":
        px_norm = (px + 30) / 60.0
        py_norm = (py + 30) / 60.0
    elif attractor == "rossler":
        px_norm = (px + 15) / 30.0
        py_norm = (py + 15) / 30.0
    else:  # thomas
        px_norm = (px + 5) / 10.0
        py_norm = (py + 5) / 10.0

    ix = np.clip((px_norm * w).astype(np.int32), 0, w - 1)
    iy = np.clip((py_norm * h).astype(np.int32), 0, h - 1)

    # Accumulate particles into trail buffer
    np.add.at(trail_buffer, (iy, ix), 1.0)

    # Normalize trail for display
    max_val = trail_buffer.max()
    if max_val > 0:
        trail_norm = np.clip(trail_buffer / max(max_val, 1.0), 0, 1)
    else:
        trail_norm = trail_buffer

    # Overlay: bright particles on frame
    trail_rgb = (
        np.stack([trail_norm, trail_norm * 0.7, trail_norm * 0.3], axis=2) * 255.0
    )
    result = rgb.astype(np.float32) * (1.0 - mix) + trail_rgb * mix
    result_rgb = np.clip(result, 0, 255).astype(np.uint8)

    state_out = {"particles": particles, "trail_buffer": trail_buffer}
    return np.concatenate([result_rgb, alpha], axis=2), state_out
