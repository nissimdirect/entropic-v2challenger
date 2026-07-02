"""Acceptance tests for Grid Moire v2 — two independent liquify-able meshes.

Maps each capability to an assertion:
- real moiré (two-mesh interference, not overlay) + BRIGHTNESS PRESERVED (the v1 black-collapse bug)
- per-mesh INDEPENDENT motion (rotate) and distortion (liquify)
- infinite scroll (wraps), liquify animation, source coupling
- determinism + trust-boundary safety
"""

import numpy as np
import pytest

from effects.fx import grid_moire

pytestmark = pytest.mark.smoke

H, W = 120, 160
RES = (W, H)


def _gray(v=128):
    f = np.full((H, W, 4), v, np.uint8)
    f[:, :, 3] = 255
    return f


def _frame(kind="gray"):
    if kind == "gray":
        return _gray()
    f = np.zeros((H, W, 4), np.uint8)
    if kind == "ramp":
        f[:, :, :3] = np.linspace(0, 255, W, dtype=np.uint8)[None, :, None]
    elif kind == "checker":
        yy, xx = np.mgrid[0:H, 0:W]
        f[:, :, :3] = (((xx // 13 + yy // 13) % 2) * 255).astype(np.uint8)[:, :, None]
    f[:, :, 3] = 255
    return f


def _apply(params, fi=0, frame=None):
    out, _ = grid_moire.apply(
        frame if frame is not None else _gray(),
        params,
        None,
        frame_index=fi,
        seed=0,
        resolution=RES,
    )
    return out


def _diff(a, b):
    return float(np.abs(a[:, :, :3].astype(int) - b[:, :, :3].astype(int)).mean())


def test_ac_visible_and_brightness_preserved():
    """[grid-moire/visible+brightness] Two-mesh moiré is visible AND does not collapse to near-black (the v1 regression)."""
    g = _gray(128)
    out = _apply(
        {"a_size": 14, "b_size": 16, "interference": 1.0, "opacity": 1.0}, frame=g
    )
    mean = float(out[:, :, :3].mean())
    assert _diff(out, g) > 1.0, "must visibly change the frame"
    assert mean > 40.0, (
        f"moiré collapsed to near-black (mean {mean:.1f}); v1 bug rendered ~8"
    )


def test_ac_two_mesh_interference_differs_from_single():
    """[grid-moire/real-moiré] interference=1 (two-mesh beat) differs from interference=0 (single overlay)."""
    base = {"a_size": 14, "b_size": 16, "b_angle": 7.0, "opacity": 1.0}
    assert (
        _diff(
            _apply({**base, "interference": 0.0}), _apply({**base, "interference": 1.0})
        )
        > 2.0
    )


def test_ac_per_mesh_independent_rotation():
    """[grid-moire/independent-motion] Meshes A and B rotate independently — A-only spin differs from B-only spin."""
    a_only = _apply(
        {"a_size": 12, "b_size": 14, "a_rotate": 5.0, "b_rotate": 0.0, "opacity": 1.0},
        fi=12,
    )
    b_only = _apply(
        {"a_size": 12, "b_size": 14, "a_rotate": 0.0, "b_rotate": 5.0, "opacity": 1.0},
        fi=12,
    )
    assert _diff(a_only, b_only) > 2.0, "per-mesh rotation must be independent"


def test_ac_rotation_animates():
    """[grid-moire/rotation] Rotation animates across frames."""
    p = {"a_size": 12, "b_size": 14, "a_rotate": 4.0, "opacity": 1.0}
    assert _diff(_apply(p, 0), _apply(p, 11)) > 2.0


def test_ac_infinite_scroll_wraps():
    """[grid-moire/scroll] Per-mesh scroll animates and never errors over a long run."""
    p = {"a_size": 10, "a_scroll_x": 8.0, "b_scroll_y": 5.0, "opacity": 1.0}
    assert _diff(_apply(p, 0), _apply(p, 13)) > 2.0
    for fi in (0, 100, 1000, 9999):
        out = _apply(p, fi)
        assert out.shape == (H, W, 4) and np.isfinite(out).all()


def test_ac_liquify_distorts_and_animates():
    """[grid-moire/liquify] Liquify distorts the mesh and the flow animates over time."""
    base = {"a_size": 10, "b_size": 12, "opacity": 1.0}
    assert (
        _diff(_apply({**base, "a_liquify": 0.0}), _apply({**base, "a_liquify": 45.0}))
        > 2.0
    ), "liquify changes the pattern"
    p = {**base, "a_liquify": 40.0, "a_liquify_speed": 1.0}
    assert _diff(_apply(p, 0), _apply(p, 15)) > 2.0, "liquify flow must animate"


def test_ac_per_mesh_independent_liquify():
    """[grid-moire/independent-distortion] Liquifying only A differs from liquifying only B."""
    a_liq = _apply(
        {
            "a_size": 12,
            "b_size": 15,
            "a_liquify": 40.0,
            "b_liquify": 0.0,
            "opacity": 1.0,
        },
        fi=10,
    )
    b_liq = _apply(
        {
            "a_size": 12,
            "b_size": 12,
            "a_liquify": 0.0,
            "b_liquify": 40.0,
            "opacity": 1.0,
        },
        fi=10,
    )
    assert _diff(a_liq, b_liq) > 2.0, "per-mesh liquify must be independent"


def test_ac_source_coupling():
    """[grid-moire/source-couple] With coupling on, different source images bend the moiré differently."""
    p = {"a_size": 10, "b_size": 12, "source_coupling": 1.0, "opacity": 1.0}
    assert (
        _diff(_apply(p, frame=_frame("ramp")), _apply(p, frame=_frame("checker"))) > 1.0
    )


def test_ac_deterministic():
    """[grid-moire/deterministic] Same params + frame_index → identical output."""
    p = {
        "a_size": 12,
        "b_size": 14,
        "a_rotate": 3.0,
        "a_liquify": 30.0,
        "b_scroll_x": 5.0,
        "opacity": 0.8,
    }
    assert np.array_equal(_apply(p, 7), _apply(p, 7))


def test_ac_trust_boundary_safe():
    """[grid-moire/states] Garbage/extreme/missing params never crash or NaN; shape+dtype+alpha preserved."""
    for p in (
        {},
        {
            "a_size": "x",
            "opacity": None,
            "interference": float("nan"),
            "a_angle": float("inf"),
        },
        {
            "a_size": -999,
            "b_size": 0,
            "opacity": 99,
            "a_liquify": 1e9,
            "a_rotate": 1e6,
            "b_scroll_x": 1e9,
        },
        {
            "interference": 1.0,
            "sharpness": 1.0,
            "source_coupling": 1.0,
            "a_liquify": 60.0,
            "b_liquify": 60.0,
            "a_rotate": 15.0,
            "b_rotate": -15.0,
        },
    ):
        out = _apply(p, fi=3)
        assert out.shape == (H, W, 4) and out.dtype == np.uint8
        assert np.isfinite(out).all()
        assert np.array_equal(out[:, :, 3], _gray()[:, :, 3])
