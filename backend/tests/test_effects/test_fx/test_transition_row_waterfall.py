"""Tests for fx.transition_row_waterfall — horizontal rows fill top→down."""

import numpy as np
import pytest

from effects.fx.transition_row_waterfall import EFFECT_ID, PARAMS, apply

pytestmark = pytest.mark.smoke


def _frame(h=64, w=64, seed=42):
    rng = np.random.default_rng(seed)
    f = rng.integers(0, 256, (h, w, 4), dtype=np.uint8)
    f[:, :, 3] = 255
    return f


KW = {"frame_index": 0, "seed": 42, "resolution": (64, 64)}


def test_effect_id():
    assert EFFECT_ID == "fx.transition_row_waterfall"


def test_default_params_sane():
    for pname, pspec in PARAMS.items():
        d = pspec.get("default")
        if pspec["type"] in ("float", "int"):
            assert pspec["min"] <= d <= pspec["max"], pname
        elif pspec["type"] == "choice":
            assert d in pspec["options"], pname
        elif pspec["type"] == "bool":
            assert isinstance(d, bool), pname


def test_no_sidechain_frame_is_exact_identity():
    f = _frame()
    out, state = apply(f, {"progress": 1.0}, None, **KW)
    np.testing.assert_array_equal(out, f)
    assert state is None


def test_returns_shape_and_dtype():
    f = _frame()
    key = _frame(seed=7)
    out, _ = apply(f, {"progress": 0.5, "_sidechain_frame": key}, None, **KW)
    assert out.shape == f.shape
    assert out.dtype == np.uint8


def test_alpha_preserved():
    f = _frame()
    f[:, :, 3] = 128
    key = _frame(seed=7)
    out, _ = apply(f, {"progress": 0.5, "_sidechain_frame": key}, None, **KW)
    np.testing.assert_array_equal(out[:, :, 3], 128)


def test_deterministic_given_same_inputs():
    f = _frame()
    key = _frame(seed=7)
    params = {"progress": 0.4, "_sidechain_frame": key}
    out1, _ = apply(f, params, None, **KW)
    out2, _ = apply(f, params, None, **KW)
    np.testing.assert_array_equal(out1, out2)


def test_param_clamping_at_trust_boundary():
    f = _frame()
    key = _frame(seed=7)
    bad = {
        "progress": 99.0,
        "edge_softness": -5.0,
        "_sidechain_frame": key,
    }
    out, _ = apply(f, bad, None, **KW)
    assert out.dtype == np.uint8
    assert not np.isnan(out.astype(np.float64)).any()


def test_sidechain_mismatched_resolution_resizes():
    f = _frame(h=64, w=64)
    key = _frame(h=32, w=32, seed=7)
    out, _ = apply(f, {"progress": 1.0, "_sidechain_frame": key}, None, **KW)
    assert out.shape == (64, 64, 4)


def test_progress_monotonic_increases_blue_fraction():
    f = np.zeros((64, 64, 4), dtype=np.uint8)
    f[:, :, 0] = 255  # red
    f[:, :, 3] = 255
    key = np.zeros((64, 64, 4), dtype=np.uint8)
    key[:, :, 2] = 255  # blue
    key[:, :, 3] = 255

    means_blue = []
    for progress in (0.0, 0.25, 0.5, 0.75, 1.0):
        out, _ = apply(
            f.copy(), {"progress": progress, "_sidechain_frame": key}, None, **KW
        )
        means_blue.append(float(np.mean(out[:, :, 2])))

    assert means_blue == sorted(means_blue), (
        f"expected monotonic increase in blue channel mean, got {means_blue}"
    )
    assert means_blue[0] < means_blue[-1]


def test_fills_rows_not_columns():
    """Sanity: at progress=0.5 every column within a single row must be
    uniform (row-wise sweep), unlike the column-cascade transitions."""
    f = np.zeros((64, 64, 4), dtype=np.uint8)
    f[:, :, 0] = 255
    f[:, :, 3] = 255
    key = np.zeros((64, 64, 4), dtype=np.uint8)
    key[:, :, 2] = 255
    key[:, :, 3] = 255
    out, _ = apply(
        f.copy(),
        {"progress": 0.5, "edge_softness": 0.02, "_sidechain_frame": key},
        None,
        **KW,
    )
    rgb = out[:, :, :3]
    # Row 0 (top) must be fully layer A; every pixel in that row identical.
    assert np.all(rgb[0] == rgb[0, 0])
    # Row -1 (bottom) must be fully layer B; every pixel in that row identical.
    assert np.all(rgb[-1] == rgb[-1, 0])
