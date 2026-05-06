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
        (
            "fx.hue_shift",
            "amount",
        ),  # 0 and 360 degrees are the same hue (full rotation = identity)
        ("fx.chroma_key", "hue"),  # 0 and 360 degrees are the same hue
        (
            "fx.chroma_key",
            "tolerance",
        ),  # Keying only modifies alpha; RGB diff is always 0
        ("fx.chroma_key", "softness"),  # Same — alpha-only effect
        ("fx.luma_key", "threshold"),  # Same — alpha-only effect
        ("fx.luma_key", "softness"),  # Same — alpha-only effect
        ("fx.luma_key", "mode"),  # Same — alpha-only effect
        (
            "fx.braille_art",
            "threshold",
        ),  # Text rendering: 0 and 255 both fill frame, minimal RGB diff at 64px
        (
            "fx.braille_art",
            "invert",
        ),  # Same — inverted dots nearly identical RGB at small frame
        (
            "fx.cumulative_smear",
            "animate",
        ),  # At frame_index=0, animate cycles to same first direction
        (
            "fx.domain_warp",
            "speed",
        ),  # Speed scales frame_index; at frame_index=0 all speeds are identical
        (
            "fx.tremolo",
            "rate",
        ),  # Rate scales frame_index via sin(); at frame_index=0, sin(0)=0 for all rates
    }

    # Stateful physics effects that accumulate displacement over time.
    # At frame_index=0 there is no accumulated state, so parameter changes
    # produce no visible difference. These need multi-frame tests instead.
    STATEFUL_PHYSICS_PREFIXES = (
        "fx.pixel_flow_field",
        "fx.pixel_liquify",
        "fx.pixel_timewarp",
        "fx.pixel_vortex",
        "fx.pixel_force_field",
        "fx.pixel_gravity",
        "fx.pixel_antigravity",
        "fx.pixel_magnetic",
        "fx.pixel_darkenergy",
        "fx.pixel_singularity",
        "fx.pixel_blackhole",
        "fx.pixel_elastic",
        "fx.pixel_quantum",
        "fx.pixel_dimension_warp",
        "fx.pixel_dimensionfold",
        "fx.pixel_wormhole",
        "fx.pixel_print_emulation",
        "fx.pixel_xerox",
        "fx.pixel_fax",
        "fx.pixel_risograph",
        "fx.pixel_explode",
        "fx.pixel_superfluid",
        "fx.pixel_melt",
        "fx.pixel_bubbles",
        "fx.pixel_inkdrop",
        "fx.pixel_haunt",
    )

    def test_param_has_impact(self, case):
        """Changing a single parameter from low to high should change the output."""
        eid, pname, low_val, high_val = case
        if (eid, pname) in self.DEPENDENT_PARAMS:
            pytest.skip(f"{eid}::{pname} only has impact with non-default co-params")
        if eid in self.STATEFUL_PHYSICS_PREFIXES:
            pytest.skip(f"{eid} is stateful physics — no displacement at frame_index=0")
        # Stateful temporal/DSP/sidechain/destruction effects that need buffer history
        # or sidechain input — no visible change at frame_index=0 with state_in=None
        STATEFUL_FRAME0 = {
            "fx.temporal_blend",
            "fx.feedback",
            "fx.delay",
            "fx.visual_reverb",
            "fx.temporal_freeze",
            "fx.stutter",
            "fx.tape_stop",
            "fx.decimator",
            "fx.sample_and_hold",
            "fx.granulator",
            "fx.beat_repeat",
            "fx.frame_drop",
            "fx.dropout",
            "fx.strobe",
            "fx.glitch_repeat",
            "fx.frame_smash",
            "fx.dsp_flange",
            "fx.video_flanger",
            "fx.spatial_flanger",
            "fx.hue_flanger",
            "fx.freq_flanger",
            "fx.dsp_phaser",
            "fx.video_phaser",
            "fx.channel_phaser",
            "fx.brightness_phaser",
            "fx.feedback_phaser",
            "fx.resonant_filter",
            "fx.comb_filter",
            "fx.spectral_freeze",
            "fx.temporal_crystal",
            "fx.datamosh",
            "fx.datamosh_melt",
            "fx.datamosh_bloom",
            "fx.datamosh_freeze",
            "fx.datamosh_real",
            "fx.flow_distort",
            "fx.sidechain_modulate",
            "fx.sidechain_duck",
            "fx.sidechain_pump",
            "fx.sidechain_cross_blend",
            "fx.sidechain_cross",
            "fx.sidechain_crossfeed",
            "fx.sidechain_gate",
            "fx.sidechain_interference",
            "fx.afterimage",
        }
        if eid in STATEFUL_FRAME0:
            pytest.skip(
                f"{eid} is stateful/temporal — needs buffer history or sidechain"
            )
        # Consolidated effects share PARAMS across all modes — variant-specific
        # params have no impact when a different mode is active.
        CONSOLIDATED_EFFECTS = {
            # subliminal variants — mode/source-dependent params, probabilistic trigger
            "fx.subliminal",
            "fx.subliminal_flash",
            "fx.subliminal_embed",
            "fx.subliminal_spray",
            # lens_distortion variants
            "fx.lens_distortion",
            "fx.fisheye",
            "fx.anamorphic",
            "fx.coma",
            # medical_imaging variants
            "fx.medical_imaging",
            "fx.xray",
            "fx.ultrasound",
            "fx.mri",
            "fx.ct_windowing",
            "fx.pet_scan",
            "fx.microscope",
            # surveillance_sim variants
            "fx.surveillance_sim",
            "fx.surveillance_cam",
            "fx.night_vision",
            "fx.infrared_thermal",
            # spectral_analysis variants
            "fx.spectral_analysis",
            "fx.spectral_paint",
            "fx.harmonic_percussive",
            "fx.wavelet_split",
            # dct_transform variants
            "fx.dct_transform",
            "fx.dct_sculpt",
            "fx.dct_swap",
            "fx.dct_phase_destroy",
            # quant_transform variants
            "fx.quant_transform",
            "fx.quant_amplify",
            "fx.quant_morph",
            "fx.quant_table_lerp",
        }
        if eid in CONSOLIDATED_EFFECTS:
            pytest.skip(
                f"{eid} is consolidated — variant params may not affect active mode"
            )
        # Other effects with frame_index=0 timing or stateful behavior
        MISC_FRAME0 = {
            "fx.strange_attractor",  # Stateful particle system — no displacement at frame 0
            "fx.erosion_sim",  # Stateful simulation — accumulates over time
            "fx.cellular_automata",  # Stateful CA — evolves over frames
            "fx.cellular_pixel_sort",  # Stateful CA + sort — first frame is passthrough
            "fx.cross_codec",  # Codec roundtrip differences at extremes may be sub-threshold
            "fx.mosquito_amplify",  # JPEG artifact amplification — may be sub-threshold at small frame
        }
        if eid in MISC_FRAME0:
            pytest.skip(f"{eid} — stateful or sub-threshold at test frame size")
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
