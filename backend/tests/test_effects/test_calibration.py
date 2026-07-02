"""Tests for effect calibration and param schema validation (Phase 2A)."""

import numpy as np
import pytest

from effects.registry import get, list_all
from effects._calibration import calibrate_all, validate_curves, VALID_CURVES


# --- Schema validation ---


def test_all_curves_are_valid():
    """Every param with a 'curve' field must use a recognized curve name."""
    errors = validate_curves()
    assert errors == [], f"Invalid curves found: {errors}"


def test_numeric_params_have_curve():
    """Every float/int param should have a 'curve' field (Phase 2A requirement)."""
    missing = []
    for effect in list_all():
        for key, pdef in effect["params"].items():
            if pdef.get("type") in ("float", "int") and "curve" not in pdef:
                missing.append(f"{effect['id']}.{key}")
    assert missing == [], f"Params missing 'curve' field: {missing}"


def test_numeric_params_have_unit():
    """Every float/int param should have a 'unit' field (Phase 2A requirement)."""
    missing = []
    for effect in list_all():
        for key, pdef in effect["params"].items():
            if pdef.get("type") in ("float", "int") and "unit" not in pdef:
                missing.append(f"{effect['id']}.{key}")
    assert missing == [], f"Params missing 'unit' field: {missing}"


# --- Boundary tests: all effects with all params at min/max/default ---


def _make_frame() -> np.ndarray:
    rng = np.random.default_rng(42)
    return rng.integers(0, 256, (100, 100, 4), dtype=np.uint8)


def _all_effect_ids() -> list[str]:
    return [e["id"] for e in list_all()]


@pytest.mark.parametrize("effect_id", _all_effect_ids())
def test_effect_at_defaults(effect_id: str):
    """Every effect runs without crash at default params."""
    entry = get(effect_id)
    assert entry is not None
    params = {k: v["default"] for k, v in entry["params"].items()}
    frame = _make_frame()
    out, state = entry["fn"](
        frame, params, None, frame_index=0, seed=42, resolution=(100, 100)
    )
    assert out.shape == frame.shape
    assert out.dtype == np.uint8


@pytest.mark.parametrize("effect_id", _all_effect_ids())
def test_effect_at_min(effect_id: str):
    """Every effect runs without crash at minimum param values."""
    entry = get(effect_id)
    assert entry is not None
    params = {}
    for k, v in entry["params"].items():
        if v["type"] in ("float", "int"):
            params[k] = v.get("min", 0)
        else:
            params[k] = v["default"]
    frame = _make_frame()
    out, _ = entry["fn"](
        frame, params, None, frame_index=0, seed=42, resolution=(100, 100)
    )
    assert out.shape == frame.shape
    assert out.dtype == np.uint8


@pytest.mark.parametrize("effect_id", _all_effect_ids())
def test_effect_at_max(effect_id: str):
    """Every effect runs without crash at maximum param values."""
    entry = get(effect_id)
    assert entry is not None
    params = {}
    for k, v in entry["params"].items():
        if v["type"] in ("float", "int"):
            params[k] = v.get("max", 1)
        else:
            params[k] = v["default"]
    frame = _make_frame()
    out, _ = entry["fn"](
        frame, params, None, frame_index=0, seed=42, resolution=(100, 100)
    )
    assert out.shape == frame.shape
    assert out.dtype == np.uint8


# --- Calibration integration ---


def test_calibration_runs():
    """calibrate_all() completes without error and returns results."""
    results = calibrate_all()
    assert len(results) > 0
    for r in results:
        assert "effect_id" in r
        assert "param" in r
        assert "level_pct" in r
        assert "mean_pixel_diff" in r
        assert r["mean_pixel_diff"] >= 0


def test_calibration_detects_change():
    """At least some params at non-default values produce visible pixel change."""
    results = calibrate_all()
    non_zero = [r for r in results if r["mean_pixel_diff"] > 0]
    assert len(non_zero) > 0, (
        "No params produced any visible change — something is wrong"
    )
