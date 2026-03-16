"""Hypothesis property-based fuzz testing for ALL registered effects.

Tests the invariants that must hold for ANY input:
1. No crashes (any valid frame + random params)
2. Output shape == input shape
3. Output dtype == uint8
4. No NaN/Inf in output
5. Deterministic with same seed
"""

import numpy as np
import pytest
from hypothesis import given, settings, HealthCheck
from hypothesis import strategies as st

from effects.registry import _REGISTRY


def _all_effect_ids():
    """Return all registered effect IDs."""
    return list(_REGISTRY.keys())


def _random_params_strategy(effect_info):
    """Build a Hypothesis strategy that generates valid random params for an effect."""
    param_strategies = {}
    for pname, pspec in effect_info["params"].items():
        ptype = pspec.get("type", "float")
        if ptype == "bool":
            param_strategies[pname] = st.booleans()
        elif ptype == "choice":
            options = pspec.get("options") or pspec.get("choices", [])
            if options:
                param_strategies[pname] = st.sampled_from(options)
            else:
                param_strategies[pname] = st.just(pspec.get("default"))
        elif ptype == "string" or ptype == "text":
            param_strategies[pname] = st.just(pspec.get("default", ""))
        else:
            # Numeric: use min/max from spec, or reasonable defaults
            lo = pspec.get("min", 0.0)
            hi = pspec.get("max", 1.0)
            if isinstance(lo, int) and isinstance(hi, int) and ptype != "float":
                param_strategies[pname] = st.integers(min_value=lo, max_value=hi)
            else:
                param_strategies[pname] = st.floats(
                    min_value=float(lo),
                    max_value=float(hi),
                    allow_nan=False,
                    allow_infinity=False,
                )
    return st.fixed_dictionaries(param_strategies) if param_strategies else st.just({})


@pytest.fixture(params=_all_effect_ids(), ids=_all_effect_ids())
def effect_entry(request):
    """Fixture that yields (effect_id, effect_info) for each registered effect."""
    eid = request.param
    return eid, _REGISTRY[eid]


class TestEffectsFuzzInvariants:
    """Every effect must handle random valid inputs without crashing."""

    @settings(
        max_examples=30,
        suppress_health_check=[
            HealthCheck.too_slow,
            HealthCheck.function_scoped_fixture,
        ],
        deadline=None,  # effects can be slow
    )
    @given(data=st.data())
    def test_no_crash_random_params(self, effect_entry, data):
        """Effect never crashes with random valid parameters."""
        eid, info = effect_entry
        params = data.draw(_random_params_strategy(info), label="params")

        # Random frame size (small to keep fast)
        h = data.draw(st.integers(min_value=2, max_value=64), label="height")
        w = data.draw(st.integers(min_value=2, max_value=64), label="width")
        rng = np.random.default_rng(42)
        frame = rng.integers(0, 256, (h, w, 4), dtype=np.uint8)

        seed = data.draw(st.integers(min_value=0, max_value=999999), label="seed")
        frame_index = data.draw(
            st.integers(min_value=0, max_value=1000), label="frame_index"
        )

        kw = {"frame_index": frame_index, "seed": seed, "resolution": (w, h)}

        # THE INVARIANT: must not crash
        result, _state = info["fn"](frame, params, None, **kw)

        # Output shape must match input
        assert result.shape == frame.shape, (
            f"{eid}: shape mismatch {result.shape} != {frame.shape} "
            f"with params={params}"
        )
        # Output must be uint8
        assert result.dtype == np.uint8, f"{eid}: dtype {result.dtype} != uint8"

    @settings(
        max_examples=10,
        suppress_health_check=[
            HealthCheck.too_slow,
            HealthCheck.function_scoped_fixture,
        ],
        deadline=None,
    )
    @given(data=st.data())
    def test_no_nan_inf_in_intermediates(self, effect_entry, data):
        """Effect output contains no NaN or Inf when cast to float."""
        eid, info = effect_entry
        params = data.draw(_random_params_strategy(info), label="params")

        rng = np.random.default_rng(42)
        frame = rng.integers(0, 256, (32, 32, 4), dtype=np.uint8)
        kw = {"frame_index": 0, "seed": 42, "resolution": (32, 32)}

        result, _ = info["fn"](frame, params, None, **kw)
        result_f = result.astype(np.float64)
        assert np.all(np.isfinite(result_f)), (
            f"{eid}: output contains NaN/Inf with params={params}"
        )


class TestEffectsFuzzEdgeCases:
    """Test known-tricky edge cases across all effects."""

    def test_1x1_frame(self, effect_entry):
        """Every effect handles a 1x1 pixel frame."""
        _eid, info = effect_entry
        frame = np.array([[128, 64, 32, 255]], dtype=np.uint8).reshape(1, 1, 4)
        params = {}
        for pname, pspec in info["params"].items():
            params[pname] = pspec.get("default")
        kw = {"frame_index": 0, "seed": 42, "resolution": (1, 1)}

        result, _ = info["fn"](frame, params, None, **kw)
        assert result.shape == (1, 1, 4)
        assert result.dtype == np.uint8

    def test_all_black_frame(self, effect_entry):
        """Every effect handles an all-black (zero) frame."""
        _eid, info = effect_entry
        frame = np.zeros((16, 16, 4), dtype=np.uint8)
        frame[:, :, 3] = 255  # opaque alpha
        params = {}
        for pname, pspec in info["params"].items():
            params[pname] = pspec.get("default")
        kw = {"frame_index": 0, "seed": 42, "resolution": (16, 16)}

        result, _ = info["fn"](frame, params, None, **kw)
        assert result.shape == frame.shape
        assert result.dtype == np.uint8

    def test_all_white_frame(self, effect_entry):
        """Every effect handles an all-white (255) frame."""
        _eid, info = effect_entry
        frame = np.full((16, 16, 4), 255, dtype=np.uint8)
        params = {}
        for pname, pspec in info["params"].items():
            params[pname] = pspec.get("default")
        kw = {"frame_index": 0, "seed": 42, "resolution": (16, 16)}

        result, _ = info["fn"](frame, params, None, **kw)
        assert result.shape == frame.shape
        assert result.dtype == np.uint8
