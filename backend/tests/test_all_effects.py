"""Parametrized tests over ALL registered effects — visible change, boundary values, determinism."""

import numpy as np
import pytest

from effects.registry import _REGISTRY


def _frame(h=64, w=64):
    """Generate a deterministic test frame with varied pixel values."""
    rng = np.random.default_rng(42)
    return rng.integers(0, 256, (h, w, 4), dtype=np.uint8)


KW = {"frame_index": 0, "seed": 42, "resolution": (64, 64)}


def _default_params(effect_info):
    """Build a params dict with default values from effect PARAMS."""
    params = {}
    for pname, pspec in effect_info["params"].items():
        params[pname] = pspec.get("default")
    return params


def _all_effect_ids():
    """Return all registered effect IDs."""
    return list(_REGISTRY.keys())


@pytest.fixture(params=_all_effect_ids(), ids=_all_effect_ids())
def effect_entry(request):
    """Fixture that yields (effect_id, effect_info) for each registered effect."""
    eid = request.param
    return eid, _REGISTRY[eid]


class TestAllEffectsBasic:
    """Every effect must produce valid output with default params."""

    def test_output_shape_and_dtype(self, effect_entry):
        """Output shape == input shape, dtype == uint8."""
        eid, info = effect_entry
        frame = _frame()
        params = _default_params(info)
        result, _state = info["fn"](frame, params, None, **KW)
        assert result.shape == frame.shape, f"{eid}: shape mismatch"
        assert result.dtype == np.uint8, f"{eid}: dtype mismatch"

    def test_alpha_preserved(self, effect_entry):
        """Alpha channel must be preserved for per-pixel color effects.

        Spatial effects (pixelsort, wave_distort) move entire pixels including
        alpha, so they are excluded from this check.
        """
        # Spatial effects rearrange pixels — alpha moves with the pixel
        SPATIAL_EFFECTS = {"fx.pixelsort", "fx.wave_distort"}
        eid, info = effect_entry
        if eid in SPATIAL_EFFECTS:
            pytest.skip(f"{eid} is a spatial effect — alpha moves with pixels")
        frame = _frame()
        params = _default_params(info)
        result, _ = info["fn"](frame, params, None, **KW)
        np.testing.assert_array_equal(
            result[:, :, 3], frame[:, :, 3], err_msg=f"{eid}: alpha channel modified"
        )


class TestAllEffectsDeterminism:
    """Same inputs must produce identical outputs."""

    def test_deterministic_output(self, effect_entry):
        """Two calls with same args produce identical results."""
        eid, info = effect_entry
        frame = _frame()
        params = _default_params(info)
        r1, _ = info["fn"](frame, params, None, **KW)
        r2, _ = info["fn"](frame, params, None, **KW)
        np.testing.assert_array_equal(
            r1, r2, err_msg=f"{eid}: non-deterministic output"
        )


class TestAllEffectsVisibleChange:
    """Effects with non-trivial default params should visibly change the frame."""

    # Color correction tools (util.*) are identity-by-default by design
    IDENTITY_BY_DEFAULT = {
        "util.levels",
        "util.curves",
        "util.hsl_adjust",
        "util.color_balance",
    }

    def test_visible_change_with_defaults(self, effect_entry):
        """Effect with non-zero default params produces a different frame."""
        eid, info = effect_entry
        if eid in self.IDENTITY_BY_DEFAULT:
            pytest.skip(f"{eid} is identity-by-default (color correction tool)")
        frame = _frame()
        params = _default_params(info)

        # Some effects like channelshift with g_offset=0 may not change
        # if only some channels have zero offsets, but overall should differ.
        result, _ = info["fn"](frame, params, None, **KW)
        diff = np.mean(
            np.abs(result[:, :, :3].astype(float) - frame[:, :, :3].astype(float))
        )

        # Every effect should modify the frame with default params.
        # Even invert (no params) changes pixels.
        assert diff > 0.5, (
            f"{eid}: mean absolute diff = {diff:.4f}, expected visible change"
        )


class TestAllEffectsBoundary:
    """Test min and max values for every numeric parameter."""

    def test_min_params(self, effect_entry):
        """Effect runs without error at all-min parameter values."""
        eid, info = effect_entry
        frame = _frame()
        params = {}
        for pname, pspec in info["params"].items():
            if "min" in pspec:
                params[pname] = pspec["min"]
            elif pspec.get("type") == "bool":
                params[pname] = False
            elif pspec.get("type") == "choice":
                params[pname] = (pspec.get("options") or pspec.get("choices", []))[0]
            else:
                params[pname] = pspec.get("default")

        result, _ = info["fn"](frame, params, None, **KW)
        assert result.shape == frame.shape, f"{eid}: shape mismatch at min"
        assert result.dtype == np.uint8, f"{eid}: dtype mismatch at min"

    def test_max_params(self, effect_entry):
        """Effect runs without error at all-max parameter values."""
        eid, info = effect_entry
        frame = _frame()
        params = {}
        for pname, pspec in info["params"].items():
            if "max" in pspec:
                params[pname] = pspec["max"]
            elif pspec.get("type") == "bool":
                params[pname] = True
            elif pspec.get("type") == "choice":
                params[pname] = (pspec.get("options") or pspec.get("choices", []))[-1]
            else:
                params[pname] = pspec.get("default")

        result, _ = info["fn"](frame, params, None, **KW)
        assert result.shape == frame.shape, f"{eid}: shape mismatch at max"
        assert result.dtype == np.uint8, f"{eid}: dtype mismatch at max"

    def test_empty_params_uses_defaults(self, effect_entry):
        """Effect runs with empty params dict (should use internal defaults)."""
        eid, info = effect_entry
        frame = _frame()
        result, _ = info["fn"](frame, {}, None, **KW)
        assert result.shape == frame.shape, f"{eid}: shape mismatch with empty params"
        assert result.dtype == np.uint8, f"{eid}: dtype mismatch with empty params"


class TestAllEffectsFrameSize:
    """Effects must handle various frame sizes."""

    @pytest.mark.parametrize("h,w", [(1, 1), (2, 2), (16, 32), (100, 100)])
    def test_various_sizes(self, effect_entry, h, w):
        """Effect runs on frames of various sizes."""
        eid, info = effect_entry
        rng = np.random.default_rng(42)
        frame = rng.integers(0, 256, (h, w, 4), dtype=np.uint8)
        params = _default_params(info)
        kw = {"frame_index": 0, "seed": 42, "resolution": (w, h)}
        result, _ = info["fn"](frame, params, None, **kw)
        assert result.shape == (h, w, 4), f"{eid}: wrong shape for {h}x{w}"
        assert result.dtype == np.uint8
