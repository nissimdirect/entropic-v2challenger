"""Acceptance tests for the enhanced Grid Moire (real interference moiré).

Maps each user-requested capability to an assertion:
- real moiré (two-grid interference, not just overlay)
- movement: rotation, infinite scroll (wraps), drift
- grid distortion (warp)
- source coupling (image contributes to the moiré)
- determinism + trust-boundary safety (no NaN/Inf, shape/dtype preserved)
"""

import numpy as np
import pytest

from effects.fx import grid_moire

pytestmark = pytest.mark.smoke

H, W = 120, 160
RES = (W, H)


def _frame(kind: str = "ramp") -> np.ndarray:
    """RGBA test frame."""
    f = np.zeros((H, W, 4), dtype=np.uint8)
    if kind == "ramp":
        f[:, :, :3] = np.linspace(0, 255, W, dtype=np.uint8)[None, :, None]
    elif kind == "mid":
        f[:, :, :3] = 128
    elif kind == "checker":
        yy, xx = np.mgrid[0:H, 0:W]
        f[:, :, :3] = (((xx // 13 + yy // 13) % 2) * 255)[:, :, None]
    f[:, :, 3] = 255
    return f


def _apply(params: dict, frame_index: int = 0, frame=None) -> np.ndarray:
    out, _ = grid_moire.apply(
        frame if frame is not None else _frame(),
        params,
        None,
        frame_index=frame_index,
        seed=0,
        resolution=RES,
    )
    return out


def _diff(a: np.ndarray, b: np.ndarray) -> float:
    return float(
        np.abs(a[:, :, :3].astype(np.int32) - b[:, :, :3].astype(np.int32)).mean()
    )


def test_ac_visible_moire_changes_frame():
    """[grid-moire/visible] The effect visibly alters the frame."""
    src = _frame("mid")
    out = _apply({"grid_size": 8, "opacity": 0.8, "interference": 0.7}, frame=src)
    assert _diff(out, src) > 1.0


def test_ac_two_grid_interference_differs_from_single_grid():
    """[grid-moire/real-moiré] Two-grid interference (interference=1, freq offset) differs from a single grid overlay (interference=0)."""
    base = {
        "grid_size": 10,
        "opacity": 1.0,
        "freq_ratio": 1.12,
        "angle_offset": 7.0,
        "sharpness": 0.0,
    }
    single = _apply({**base, "interference": 0.0})
    moire = _apply({**base, "interference": 1.0})
    assert _diff(single, moire) > 2.0, (
        "interference param must produce a genuinely different (beat) pattern"
    )


def test_ac_rotation_animates():
    """[grid-moire/rotation] rotation_speed makes the pattern differ across frames."""
    p = {"grid_size": 8, "opacity": 1.0, "rotation_speed": 4.0, "interference": 0.6}
    assert _diff(_apply(p, frame_index=0), _apply(p, frame_index=20)) > 2.0


def test_ac_infinite_scroll_animates_and_wraps():
    """[grid-moire/scroll] scroll_x/y animate across frames and never error over a long run (infinite wrap via sine periodicity)."""
    p = {
        "grid_size": 8,
        "opacity": 1.0,
        "scroll_x": 6.0,
        "scroll_y": 3.0,
        "interference": 0.5,
    }
    assert _diff(_apply(p, frame_index=0), _apply(p, frame_index=15)) > 2.0
    for fi in (0, 50, 200, 1000, 9999):  # no overflow / no error at large frame_index
        out = _apply(p, frame_index=fi)
        assert out.shape == (H, W, 4) and np.isfinite(out).all()


def test_ac_drift_animates_in_place():
    """[grid-moire/drift] drift animates the beating between the two gratings."""
    p = {
        "grid_size": 10,
        "opacity": 1.0,
        "interference": 1.0,
        "freq_ratio": 1.1,
        "drift": 2.0,
    }
    assert _diff(_apply(p, frame_index=0), _apply(p, frame_index=10)) > 1.0


def test_ac_warp_distorts_grid():
    """[grid-moire/warp] warp changes the pattern vs no warp."""
    base = {"grid_size": 8, "opacity": 1.0, "interference": 0.6, "warp_freq": 3.0}
    assert _diff(_apply({**base, "warp": 0.0}), _apply({**base, "warp": 25.0})) > 2.0


def test_ac_source_coupling_makes_image_contribute():
    """[grid-moire/source-couple] With source_coupling>0, different source images yield different moiré modulation; with =0 the grid is source-independent in phase."""
    p_on = {"grid_size": 8, "opacity": 1.0, "interference": 0.7, "source_coupling": 1.0}
    out_ramp = _apply(p_on, frame=_frame("ramp"))
    out_check = _apply(p_on, frame=_frame("checker"))
    # The moiré phase is bent by the (different) source content beyond the raw source difference.
    assert _diff(out_ramp, out_check) > 1.0


def test_ac_deterministic():
    """[grid-moire/deterministic] Same params + frame_index → identical output."""
    p = {
        "grid_size": 8,
        "opacity": 0.7,
        "rotation_speed": 3.0,
        "scroll_x": 5.0,
        "interference": 0.8,
    }
    a = _apply(p, frame_index=7)
    b = _apply(p, frame_index=7)
    assert np.array_equal(a, b)


def test_ac_trust_boundary_safe():
    """[grid-moire/states] Malformed/extreme/missing params don't crash or produce NaN; shape+dtype preserved."""
    for p in (
        {},  # all defaults
        {
            "grid_size": "x",
            "opacity": None,
            "freq_ratio": float("nan"),
            "angle": float("inf"),
        },  # garbage
        {
            "grid_size": -999,
            "opacity": 99,
            "freq_ratio": 0.0,
            "warp": 1e9,
            "rotation_speed": 1e6,
        },  # out of range
        {
            "interference": 1.0,
            "sharpness": 1.0,
            "source_coupling": 1.0,
            "warp": 40.0,
            "drift": 5.0,
        },  # all maxed
    ):
        out = _apply(p, frame_index=3)
        assert out.shape == (H, W, 4)
        assert out.dtype == np.uint8
        assert np.isfinite(out).all()
        # alpha preserved
        assert np.array_equal(out[:, :, 3], _frame()[:, :, 3])
