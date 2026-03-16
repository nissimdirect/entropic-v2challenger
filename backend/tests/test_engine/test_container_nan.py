"""Tests for container NaN/Inf/empty-frame hardening."""

import math

import numpy as np
import pytest

from effects.fx.invert import apply as invert_apply
from engine.container import EffectContainer

pytestmark = pytest.mark.smoke


def _make_frame(r=128, g=64, b=32, a=255, h=100, w=100):
    frame = np.zeros((h, w, 4), dtype=np.uint8)
    frame[:, :, 0] = r
    frame[:, :, 1] = g
    frame[:, :, 2] = b
    frame[:, :, 3] = a
    return frame


def _process(container, frame, params):
    return container.process(
        frame, params, None, frame_index=0, project_seed=42, resolution=(100, 100)
    )


def _spy_effect(frame, params, state_in, *, frame_index, seed, resolution):
    """Effect that records what params it received, then returns frame unchanged."""
    # Store received params in state_out so test can inspect them
    return frame.copy(), {"received_params": dict(params)}


class TestNaNStringParams:
    """String values that parse to NaN/Inf must be dropped before reaching the effect."""

    def test_nan_string_not_passed_to_effect(self):
        container = EffectContainer(_spy_effect, "test.spy")
        frame = _make_frame()
        _, state = _process(container, frame, {"intensity": "NaN"})
        received = state["received_params"]
        assert "intensity" not in received, f"NaN string reached effect: {received}"

    def test_inf_string_not_passed_to_effect(self):
        container = EffectContainer(_spy_effect, "test.spy")
        frame = _make_frame()
        _, state = _process(container, frame, {"intensity": "Infinity"})
        received = state["received_params"]
        assert "intensity" not in received, f"Inf string reached effect: {received}"

    def test_neg_inf_string_not_passed_to_effect(self):
        container = EffectContainer(_spy_effect, "test.spy")
        frame = _make_frame()
        _, state = _process(container, frame, {"intensity": "-Infinity"})
        received = state["received_params"]
        assert "intensity" not in received, f"-Inf string reached effect: {received}"

    def test_numeric_string_not_converted(self):
        """A string like '0.5' should stay as string — effects may want string params."""
        container = EffectContainer(_spy_effect, "test.spy")
        frame = _make_frame()
        _, state = _process(container, frame, {"mode": "0.5"})
        received = state["received_params"]
        # Non-NaN numeric strings are kept as-is (they might be valid string params)
        assert "mode" in received


class TestNumpyScalarParams:
    """Numpy scalars with NaN/Inf must be dropped before reaching the effect."""

    def test_numpy_float64_nan_not_passed(self):
        container = EffectContainer(_spy_effect, "test.spy")
        frame = _make_frame()
        _, state = _process(container, frame, {"intensity": np.float64("nan")})
        received = state["received_params"]
        assert "intensity" not in received, f"numpy NaN reached effect: {received}"

    def test_numpy_float32_inf_not_passed(self):
        container = EffectContainer(_spy_effect, "test.spy")
        frame = _make_frame()
        _, state = _process(container, frame, {"intensity": np.float32("inf")})
        received = state["received_params"]
        assert "intensity" not in received, f"numpy Inf reached effect: {received}"

    def test_numpy_normal_value_kept(self):
        """Normal numpy scalar should pass through (converted to Python native)."""
        container = EffectContainer(_spy_effect, "test.spy")
        frame = _make_frame()
        _, state = _process(container, frame, {"intensity": np.float64(0.5)})
        received = state["received_params"]
        assert "intensity" in received
        assert received["intensity"] == 0.5


class TestEmptyFrame:
    """Empty (0x0) frames must not crash the container."""

    def test_empty_frame_returns_empty(self):
        container = EffectContainer(invert_apply, "fx.invert")
        frame = np.zeros((0, 0, 4), dtype=np.uint8)
        output, _ = _process(container, frame, {})
        assert output.shape == (0, 0, 4)

    def test_zero_height_frame(self):
        container = EffectContainer(invert_apply, "fx.invert")
        frame = np.zeros((0, 100, 4), dtype=np.uint8)
        output, _ = _process(container, frame, {})
        assert output.shape == (0, 100, 4)


class TestNormalParamsUnchanged:
    """Normal params must pass through untouched to the effect."""

    def test_float_param_kept(self):
        container = EffectContainer(_spy_effect, "test.spy")
        frame = _make_frame()
        _, state = _process(container, frame, {"intensity": 0.5})
        assert state["received_params"]["intensity"] == 0.5

    def test_string_param_kept(self):
        container = EffectContainer(_spy_effect, "test.spy")
        frame = _make_frame()
        _, state = _process(container, frame, {"mode": "overlay"})
        assert state["received_params"]["mode"] == "overlay"

    def test_bool_param_kept(self):
        container = EffectContainer(_spy_effect, "test.spy")
        frame = _make_frame()
        _, state = _process(container, frame, {"enabled": True})
        assert state["received_params"]["enabled"] is True

    def test_int_param_kept(self):
        container = EffectContainer(_spy_effect, "test.spy")
        frame = _make_frame()
        _, state = _process(container, frame, {"count": 3})
        assert state["received_params"]["count"] == 3

    def test_python_float_nan_dropped(self):
        """Existing behavior: Python float NaN is dropped."""
        container = EffectContainer(_spy_effect, "test.spy")
        frame = _make_frame()
        _, state = _process(container, frame, {"intensity": float("nan")})
        assert "intensity" not in state["received_params"]

    def test_python_float_inf_dropped(self):
        """Existing behavior: Python float Inf is dropped."""
        container = EffectContainer(_spy_effect, "test.spy")
        frame = _make_frame()
        _, state = _process(container, frame, {"intensity": float("inf")})
        assert "intensity" not in state["received_params"]
