"""B1 lane reader — projects an automation curve through the lane's domain.

Vision §6 C1 Scanline-as-Time: `Lane(domain=Y)` reads the curve over Y within one
frame (so each row of pixels gets a different sampled value). Vision §6 C7
Audio-LFO-at-video-resolution: same reader at audio sample rate produces
high-frequency curves that visually alias as stripes/moire (the curves are
modulating video parameters at frequencies above the visual Nyquist).

This is the runtime side of B1. Schema defined parameters with a lane;
this module is how the engine samples them per frame / per scanline / per pixel.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

from .schema import InterpMode, Lane, LaneDomain, LoopMode


def _wrap_normalized(u: float, loop_mode: LoopMode) -> float:
    """Normalize u into [0, 1] honoring the lane's loop_mode."""
    if loop_mode == LoopMode.OFF:
        return max(0.0, min(1.0, u))
    if loop_mode == LoopMode.LOOP:
        return u - int(u) if u >= 0 else 1.0 + (u - int(u))
    # PING_PONG
    period = (u % 2.0 + 2.0) % 2.0  # safe positive mod
    return period if period <= 1.0 else 2.0 - period


def _interp(samples: Sequence[float], u: float, mode: InterpMode) -> float:
    """Sample the curve at normalized position u in [0, 1]."""
    if not samples:
        return 0.0
    n = len(samples)
    if n == 1:
        return float(samples[0])
    if u <= 0.0:
        return float(samples[0])
    if u >= 1.0:
        return float(samples[-1])
    if mode == InterpMode.STEP:
        idx = int(u * (n - 1))
        return float(samples[idx])
    # LINEAR + EASE_IN_OUT
    pos = u * (n - 1)
    lo = int(pos)
    hi = min(lo + 1, n - 1)
    t = pos - lo
    if mode == InterpMode.EASE_IN_OUT:
        t = t * t * (3.0 - 2.0 * t)  # smoothstep
    return float(samples[lo] * (1.0 - t) + samples[hi] * t)


@dataclass(frozen=True)
class FrameCoord:
    """Where in the rendered output we're sampling.

    All fields are normalized to [0, 1]:
    - t_norm: clip time
    - y_norm: pixel row (0 = top, 1 = bottom)
    - x_norm: pixel column (0 = left, 1 = right)
    - c_norm: channel (0 = R, 0.5 = G, 1 = B; or stem index)
    - f_norm: frequency band index
    - l_norm: latent-space position
    """

    t_norm: float = 0.0
    y_norm: float = 0.0
    x_norm: float = 0.0
    c_norm: float = 0.0
    f_norm: float = 0.0
    l_norm: float = 0.0


def _coord_for_domain(coord: FrameCoord, domain: LaneDomain) -> float:
    """Project a 6D frame coordinate onto a single domain axis."""
    if domain == LaneDomain.T:
        return coord.t_norm
    if domain == LaneDomain.Y:
        return coord.y_norm
    if domain == LaneDomain.X:
        return coord.x_norm
    if domain == LaneDomain.C:
        return coord.c_norm
    if domain == LaneDomain.F:
        return coord.f_norm
    return coord.l_norm  # L


def sample_lane(curve: Sequence[float], lane: Lane, coord: FrameCoord) -> float:
    """Return the lane's sampled value at the given frame coordinate.

    The core paradigm move (Vision §3 thesis): a curve is just data; the lane
    decides which axis projects through it. With `domain=T` this is normal
    automation. With `domain=Y` the same curve scans over pixel rows within
    a single frame — that's C1 Scanline-as-Time.

    `direction` (signed real) controls scan polarity. Positive → forward, negative
    → reverse. Magnitude > 1 cycles the curve faster than the axis (audio-rate LFO
    when domain=T and |direction| >> 1 — that's C7).
    """
    axis_value = _coord_for_domain(coord, lane.domain)
    # Apply direction: magnitude scales speed; sign reverses.
    u_raw = axis_value * lane.direction
    u = _wrap_normalized(u_raw, lane.loop_mode)
    return _interp(curve, u, lane.interp_mode)


def sample_lane_row(
    curve: Sequence[float], lane: Lane, t_norm: float, y_norms: Sequence[float]
) -> list[float]:
    """Sample a lane across an entire scanline (or any 1D sweep) at fixed t.

    Convenience for the C1 demo + the C7 aliasing visualization. With `domain=Y`
    this returns N values — one per pixel row — driven by the curve.
    """
    return [
        sample_lane(curve, lane, FrameCoord(t_norm=t_norm, y_norm=y)) for y in y_norms
    ]
