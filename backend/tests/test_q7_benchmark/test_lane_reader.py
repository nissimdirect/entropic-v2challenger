"""Tests for B1 lane reader + C1 Scanline-as-Time + C7 Audio-LFO-at-video-rate."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

BACKEND_SRC = Path(__file__).resolve().parents[2] / "src"
if str(BACKEND_SRC) not in sys.path:
    sys.path.insert(0, str(BACKEND_SRC))

from modulation.lane_reader import (  # noqa: E402
    FrameCoord,
    sample_lane,
    sample_lane_row,
)
from modulation.schema import (  # noqa: E402
    InterpMode,
    Lane,
    LaneDomain,
    LoopMode,
)


# ---- Domain projection (the paradigm shift in one test) ----


@pytest.mark.smoke
def test_same_curve_different_domains_samples_different_axes():
    """Vision §3: a curve is data; the lane decides which axis projects through it.

    The whole paradigm reduces to: same curve, different domain, different
    samples. This is the test that proves the paradigm is wired.
    """
    curve = [0.0, 0.5, 1.0]
    coord = FrameCoord(t_norm=0.0, y_norm=1.0)  # frame start, last row
    lane_t = Lane(domain=LaneDomain.T)
    lane_y = Lane(domain=LaneDomain.Y)
    assert sample_lane(curve, lane_t, coord) == 0.0  # T-axis at start
    assert sample_lane(curve, lane_y, coord) == 1.0  # Y-axis at bottom row


# ---- T-domain (legacy timeline automation) ----


@pytest.mark.smoke
def test_t_domain_samples_over_time():
    curve = [0.0, 1.0]
    lane = Lane(domain=LaneDomain.T)
    assert sample_lane(curve, lane, FrameCoord(t_norm=0.0)) == 0.0
    assert sample_lane(curve, lane, FrameCoord(t_norm=1.0)) == 1.0
    mid = sample_lane(curve, lane, FrameCoord(t_norm=0.5))
    assert abs(mid - 0.5) < 1e-9


# ---- C1 Scanline-as-Time ----


@pytest.mark.smoke
def test_c1_scanline_as_time_top_row_is_curve_start():
    """C1: domain=Y → top of frame samples curve start, bottom samples end."""
    curve = [10.0, 20.0, 30.0]
    lane = Lane(domain=LaneDomain.Y)
    assert sample_lane(curve, lane, FrameCoord(y_norm=0.0)) == 10.0
    assert sample_lane(curve, lane, FrameCoord(y_norm=1.0)) == 30.0


@pytest.mark.smoke
def test_c1_full_scanline_sweep_returns_full_curve():
    """C1 demo path: scanning Y across 100 rows of a frame produces 100 samples."""
    curve = [0.0, 1.0]
    lane = Lane(domain=LaneDomain.Y)
    ys = [i / 99 for i in range(100)]
    values = sample_lane_row(curve, lane, t_norm=0.0, y_norms=ys)
    assert len(values) == 100
    assert values[0] == 0.0
    assert values[-1] == 1.0
    assert values[50] > values[0] and values[50] < values[-1]


# ---- Signed-axis-direction (Vision Round-1 decision) ----


@pytest.mark.smoke
def test_direction_negative_reverses_scan():
    """Vision Round-1: signed-axis-direction. -1 = reverse scan."""
    curve = [0.0, 1.0]
    lane_fwd = Lane(domain=LaneDomain.Y, direction=1.0, loop_mode=LoopMode.LOOP)
    lane_rev = Lane(domain=LaneDomain.Y, direction=-1.0, loop_mode=LoopMode.LOOP)
    # At y=0.25, forward samples curve at u=0.25; reverse samples at u=-0.25 → wraps to 0.75
    v_fwd = sample_lane(curve, lane_fwd, FrameCoord(y_norm=0.25))
    v_rev = sample_lane(curve, lane_rev, FrameCoord(y_norm=0.25))
    assert v_fwd != v_rev


# ---- C7 Audio-LFO-at-video-resolution ----


@pytest.mark.smoke
def test_c7_high_direction_aliases_curve_into_stripes():
    """C7: |direction| >> 1 cycles the curve faster than the axis can resolve.

    A sine-shaped curve with direction=20 over Y produces a striped pattern —
    the visual aliasing that Vision §6 C7 calls 'audio-LFO at video resolution.'
    """
    import math

    curve = [math.sin(2 * math.pi * i / 99) for i in range(100)]
    lane = Lane(domain=LaneDomain.Y, direction=20.0, loop_mode=LoopMode.LOOP)
    ys = [i / 999 for i in range(1000)]
    values = sample_lane_row(curve, lane, t_norm=0.0, y_norms=ys)
    # If aliasing is happening, the signal must cross zero many times — far more
    # than the 1 crossing a non-aliased linear scan would produce.
    crossings = sum(
        1 for i in range(1, len(values)) if (values[i] >= 0) != (values[i - 1] >= 0)
    )
    assert crossings > 10, (
        f"expected many zero-crossings from audio-rate aliasing, got {crossings}"
    )


# ---- Loop modes ----


@pytest.mark.smoke
def test_loop_off_clamps_out_of_range():
    curve = [0.0, 1.0]
    lane = Lane(domain=LaneDomain.T, loop_mode=LoopMode.OFF)
    assert sample_lane(curve, lane, FrameCoord(t_norm=2.0)) == 1.0  # clamped
    assert sample_lane(curve, lane, FrameCoord(t_norm=-1.0)) == 0.0  # clamped


@pytest.mark.smoke
def test_loop_loop_wraps():
    curve = [0.0, 1.0]
    lane = Lane(domain=LaneDomain.T, loop_mode=LoopMode.LOOP)
    # u=2.25 wraps to 0.25
    assert abs(sample_lane(curve, lane, FrameCoord(t_norm=2.25)) - 0.25) < 1e-9


@pytest.mark.smoke
def test_loop_ping_pong_reflects():
    curve = [0.0, 1.0]
    lane = Lane(domain=LaneDomain.T, loop_mode=LoopMode.PING_PONG)
    # u=1.5 reflects to 0.5
    assert abs(sample_lane(curve, lane, FrameCoord(t_norm=1.5)) - 0.5) < 1e-9


# ---- Interp modes ----


@pytest.mark.smoke
def test_step_interp_no_interpolation():
    curve = [0.0, 10.0, 20.0]
    lane = Lane(domain=LaneDomain.T, interp_mode=InterpMode.STEP)
    # At u=0.4, step samples index int(0.4 * 2) = 0
    assert sample_lane(curve, lane, FrameCoord(t_norm=0.4)) == 0.0


@pytest.mark.smoke
def test_ease_in_out_smooths():
    curve = [0.0, 1.0]
    lane_lin = Lane(domain=LaneDomain.T, interp_mode=InterpMode.LINEAR)
    lane_ease = Lane(domain=LaneDomain.T, interp_mode=InterpMode.EASE_IN_OUT)
    coord = FrameCoord(t_norm=0.25)
    v_lin = sample_lane(curve, lane_lin, coord)
    v_ease = sample_lane(curve, lane_ease, coord)
    # smoothstep(0.25) = 3*0.0625 - 2*0.015625 ≈ 0.156 vs linear 0.25
    assert v_ease < v_lin


# ---- Empty / degenerate curves ----


@pytest.mark.smoke
def test_empty_curve_returns_zero():
    lane = Lane(domain=LaneDomain.T)
    assert sample_lane([], lane, FrameCoord()) == 0.0


@pytest.mark.smoke
def test_single_sample_curve_returns_constant():
    lane = Lane(domain=LaneDomain.T)
    assert sample_lane([42.0], lane, FrameCoord(t_norm=0.0)) == 42.0
    assert sample_lane([42.0], lane, FrameCoord(t_norm=1.0)) == 42.0
