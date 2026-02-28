"""Per-parameter impact sweep for all effects — verifies each param changes output."""

import numpy as np
import pytest

from effects.registry import _REGISTRY


def _frame(h=64, w=64):
    """Generate a deterministic test frame with varied pixel values."""
    rng = np.random.default_rng(42)
    return rng.integers(0, 256, (h, w, 4), dtype=np.uint8)


KW = {"frame_index": 0, "seed": 42, "resolution": (64, 64)}


def _sweep_cases():
    """Generate (effect_id, param_name, low_value, high_value) test cases."""
    cases = []
    for eid, info in _REGISTRY.items():
        for pname, pspec in info["params"].items():
            ptype = pspec.get("type")
            if ptype in ("float", "int"):
                low = pspec["min"]
                high = pspec["max"]
                cases.append((eid, pname, low, high))
            elif ptype == "bool":
                cases.append((eid, pname, False, True))
            elif ptype == "choice":
                choices = pspec.get("options") or pspec.get("choices", [])
                if len(choices) >= 2:
                    cases.append((eid, pname, choices[0], choices[-1]))
        # Effects with no params (e.g. invert) — skip sweep
    return cases


def _default_params(info):
    """Build a params dict with default values from effect PARAMS."""
    params = {}
    for pname, pspec in info["params"].items():
        params[pname] = pspec.get("default")
    return params


def _case_id(case):
    """Human-readable test ID."""
    eid, pname, low, high = case
    return f"{eid}::{pname}[{low}->{high}]"


SWEEP_CASES = _sweep_cases()


@pytest.mark.parametrize("case", SWEEP_CASES, ids=[_case_id(c) for c in SWEEP_CASES])
class TestParameterSweep:
    """For each parameter, verify that changing it from min to max produces different output."""

    # Params that only have impact when OTHER params are non-default
    # (e.g. channel selector on identity LUT, interpolation on identity curve)
    DEPENDENT_PARAMS = {
        ("util.levels", "channel"),
        ("util.curves", "channel"),
        ("util.curves", "interpolation"),
        (
            "util.curves",
            "points",
        ),  # Numeric sweep meaningless; real input is JSON array
        ("util.hsl_adjust", "target_hue"),
        ("util.color_balance", "preserve_luma"),
        ("fx.invert_bands", "offset"),  # 200 % (band_height*2) == 0 wraps to same as 0
        ("fx.kaleidoscope", "rotation"),  # 0 and 360 degrees are identical rotations
        (
            "fx.wavefold",
            "folds",
        ),  # Single fold already maps values below threshold; extra folds are no-ops
        (
            "fx.rainbow_shift",
            "speed",
        ),  # Speed scales frame_index; at frame_index=0 all speeds are identical
        ("fx.chroma_key", "hue"),  # 0 and 360 degrees are the same hue
        (
            "fx.chroma_key",
            "tolerance",
        ),  # Keying only modifies alpha; RGB diff is always 0
        ("fx.chroma_key", "softness"),  # Same — alpha-only effect
        ("fx.luma_key", "threshold"),  # Same — alpha-only effect
        ("fx.luma_key", "softness"),  # Same — alpha-only effect
        ("fx.luma_key", "mode"),  # Same — alpha-only effect
    }

    def test_param_has_impact(self, case):
        """Changing a single parameter from low to high should change the output."""
        eid, pname, low_val, high_val = case
        if (eid, pname) in self.DEPENDENT_PARAMS:
            pytest.skip(f"{eid}::{pname} only has impact with non-default co-params")
        info = _REGISTRY[eid]
        frame = _frame()

        # Build baseline with default params but target param at low
        params_low = _default_params(info)
        params_low[pname] = low_val

        params_high = _default_params(info)
        params_high[pname] = high_val

        result_low, _ = info["fn"](frame, params_low, None, **KW)
        result_high, _ = info["fn"](frame, params_high, None, **KW)

        diff = np.mean(
            np.abs(
                result_low[:, :, :3].astype(float) - result_high[:, :, :3].astype(float)
            )
        )

        # We expect SOME difference when sweeping min to max.
        # Use a very low threshold — even 0.01 mean diff counts.
        assert diff > 0.01, (
            f"{eid}::{pname}: no visible impact when sweeping {low_val} -> {high_val} "
            f"(mean abs diff = {diff:.6f})"
        )

    def test_sweep_deterministic(self, case):
        """Sweeping the same param twice yields identical results."""
        eid, pname, low_val, high_val = case
        info = _REGISTRY[eid]
        frame = _frame()

        params = _default_params(info)
        params[pname] = high_val

        r1, _ = info["fn"](frame, params, None, **KW)
        r2, _ = info["fn"](frame, params, None, **KW)

        np.testing.assert_array_equal(
            r1, r2, err_msg=f"{eid}::{pname}: non-deterministic at {high_val}"
        )

    def test_output_valid_at_extremes(self, case):
        """Output at both extremes has valid shape and dtype."""
        eid, pname, low_val, high_val = case
        info = _REGISTRY[eid]
        frame = _frame()

        for val in (low_val, high_val):
            params = _default_params(info)
            params[pname] = val
            result, _ = info["fn"](frame, params, None, **KW)
            assert result.shape == frame.shape, f"{eid}::{pname}={val}: shape mismatch"
            assert result.dtype == np.uint8, f"{eid}::{pname}={val}: dtype mismatch"
