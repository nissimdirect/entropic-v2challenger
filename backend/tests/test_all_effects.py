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
        # Effects that intentionally modify alpha or rearrange pixels
        ALPHA_EXEMPT = {
            "fx.pixelsort",  # spatial: alpha moves with pixel
            "fx.wave_distort",  # spatial: alpha moves with pixel
            "fx.chroma_key",  # keying: modifies alpha by design
            "fx.luma_key",  # keying: modifies alpha by design
            # Phase 8 physics — spatial displacement moves whole pixels
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
            "fx.datamosh",
            "fx.datamosh_melt",
            "fx.datamosh_bloom",
            "fx.datamosh_freeze",
            "fx.datamosh_real",
            "fx.flow_distort",
            "fx.domain_warp",
            "fx.entropy_domain_warp",
            "fx.lens_distortion",
            "fx.fisheye",
            "fx.anamorphic",
            "fx.coma",
            "fx.chromatic_aberration_pro",
            "fx.dsp_flange",
            "fx.video_flanger",
            "fx.spatial_flanger",
            "fx.strange_attractor",
        }
        eid, info = effect_entry
        if eid in ALPHA_EXEMPT:
            pytest.skip(f"{eid} intentionally modifies alpha channel")
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


def _visible_change_or_warmup(
    fn, params, *, threshold: float = 0.5, max_warmup: int = 8
) -> float:
    """Apply an effect for up to ``max_warmup`` frames and return the highest
    mean-absolute-diff observed relative to the *original* frame.

    WHY WARM-UP EXISTS
    ------------------
    Some effects are intentionally stateful: they seed their internal state on
    frame 0 and return the frame **unchanged** (a "first-frame passthrough").
    Examples: cellular_pixel_sort seeds its CA grid; reaction_mosh initialises
    its Gray-Scott A/B fields; temporal_dispersion fills its phase buffer.
    This passthrough is *correct* — the effect needs a baseline before it can
    apply its transformation.  Testing only frame 0 would falsely flag these
    effects as broken.

    The right test semantics are: "does this effect produce visible change
    within the first N frames of a stream?"  That is exactly what this helper
    checks.  State is threaded across calls (state_out → state_in), frame_index
    is advanced, and a non-repeating moving-gradient input is used so that
    temporal effects have genuinely varying content to act on.

    The helper is GENERAL — it relies only on the diff being ≥ threshold on
    *some* frame within the window.  No effect names are hardcoded.

    ANTI-GAMING GUARANTEE
    ---------------------
    ``max_warmup`` frames of identical passthrough still yield diff=0, so a
    truly-static effect (one that returns frame.copy() for all frames) will
    score 0.0 and the caller's assert will fail.  This is verified by
    ``TestAllEffectsVisibleChange.test_visible_change_test_still_catches_static_effect``.
    """
    h, w = 64, 64
    rng = np.random.default_rng(42)

    state: dict | None = None
    best_diff: float = 0.0

    for fi in range(max_warmup):
        # Vary the input frame per iteration so temporal effects (which compare
        # consecutive frames) always have something new to act on.  Use a
        # deterministic moving gradient: base noise + a shifted sine ramp.
        base = rng.integers(0, 256, (h, w, 4), dtype=np.uint8)
        shift = float(fi * 16)
        ramp = np.clip(
            np.linspace(shift, shift + 255, w, dtype=np.float32)[
                np.newaxis, :, np.newaxis
            ]
            * np.ones((h, 1, 1), dtype=np.float32),
            0,
            255,
        ).astype(np.uint8)
        ramp_rgba = np.concatenate(
            [ramp, ramp, ramp, np.full((h, w, 1), 255, np.uint8)], axis=2
        )
        frame = np.clip(
            base.astype(np.int32) + ramp_rgba.astype(np.int32), 0, 255
        ).astype(np.uint8)

        # Reference is the *original* un-effected frame for this iteration.
        ref = frame.copy()

        kw = {"frame_index": fi, "seed": 42, "resolution": (w, h)}
        result, state = fn(frame, params, state, **kw)

        diff = float(
            np.mean(
                np.abs(
                    result[:, :, :3].astype(np.float64)
                    - ref[:, :, :3].astype(np.float64)
                )
            )
        )
        if diff > best_diff:
            best_diff = diff
        if best_diff >= threshold:
            break

    return best_diff


class TestAllEffectsVisibleChange:
    """Effects with non-trivial default params should visibly change the frame."""

    # Color correction tools (util.*) are identity-by-default by design
    # Keying effects modify alpha only — RGB diff is zero
    IDENTITY_BY_DEFAULT = {
        "util.levels",
        "util.curves",
        "util.hsl_adjust",
        "util.color_balance",
        # P2.2c: `composite` is the terminal compositing primitive — its `apply`
        # is an identity no-op by design (Decision D3: the compositor applies the
        # blend, apply_chain skips this entry). Frame mutation is asserted in
        # test_composite_render_terminal.py, not the generic visible-change sweep.
        "composite",
        "fx.chroma_key",
        "fx.luma_key",
        # Phase 8: sidechain effects need _sidechain_frame to produce visible change
        "fx.sidechain_modulate",
        "fx.sidechain_duck",
        "fx.sidechain_pump",
        "fx.sidechain_cross_blend",
        "fx.sidechain_cross",
        "fx.sidechain_crossfeed",
        "fx.sidechain_gate",
        "fx.sidechain_interference",
        # 53-transitions content sprint (docs/addendums/LAYER-TRANSITIONS.md):
        # transitions read the incoming layer via the same `_sidechain_frame`
        # convention as the sidechain effects above — no key frame present
        # (as in this generic sweep) means identity passthrough by design.
        "fx.transition_column_cascade",
        "fx.transition_column_cascade_reverse",
        "fx.transition_row_waterfall",
        # Stateful effects that may not visibly change on frame_index=0
        "fx.logistic_generation_loss",
        "fx.datamosh",
        "fx.datamosh_melt",
        "fx.datamosh_bloom",
        "fx.datamosh_freeze",
        "fx.flow_distort",
        "fx.spectral_freeze",
        "fx.frequency_mosh",
        "fx.afterimage",
        # Entropy domain warp uses temporal smoothing — first frame may be near-identity on flat synthetic frames
        "fx.entropy_domain_warp",
        # Physics effects that accumulate over time — no displacement at frame 0
        "fx.pixel_melt",
        "fx.pixel_haunt",
        # Probabilistic effects that may not trigger at test seed
        "fx.frame_drop",
        "fx.dropout",
        "fx.strobe",
        "fx.glitch_repeat",
        "fx.frame_smash",
        # Temporal hold effects — pass through on first frame
        "fx.decimator",
        "fx.sample_and_hold",
        "fx.temporal_blend",
        "fx.feedback",
        "fx.delay",
        "fx.visual_reverb",
        "fx.temporal_freeze",
        "fx.stutter",
        "fx.tape_stop",
        "fx.beat_repeat",
        "fx.granulator",
        # Temporal DSP — need buffer to fill before visible change
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
        "fx.resonant_paulstretch",
        "fx.temporal_crystal",
        # Attractor kaleidoscope — solver state at frame 0 with default angle
        # may produce sub-threshold rotation; first-frame visible diff is small.
        "fx.attractor_kaleidoscope",
        # Subliminal — probabilistic trigger (5% default), not guaranteed visible
        "fx.subliminal",
        "fx.subliminal_flash",
        "fx.subliminal_embed",
        "fx.subliminal_spray",
    }

    # Visible-change threshold (mean absolute diff over RGB channels, 0-255 scale).
    DIFF_THRESHOLD: float = 0.5
    # Maximum frames to feed an effect when frame-0 diff is below threshold.
    WARMUP_FRAMES: int = 8

    def test_visible_change_with_defaults(self, effect_entry):
        """Effect with non-zero default params produces a different frame.

        Stateful effects (e.g. cellular_pixel_sort, reaction_mosh,
        temporal_dispersion) legitimately return the frame UNCHANGED on frame 0
        while seeding their internal state.  This is correct behaviour — the
        effect needs a baseline (CA grid, Gray-Scott A/B fields, phase buffer)
        before it can apply its transformation.

        When the first-frame diff is below threshold we run a short warm-up
        sequence (up to WARMUP_FRAMES), threading state_out → state_in and
        advancing frame_index with varied input, then assert visible change
        appeared within that window.  This is the right test semantics: "does
        the effect produce visible change in the first N frames of a stream?"

        The warm-up is GENERAL — no effect names are hardcoded.  A truly-static
        effect (one that always returns frame.copy()) will score 0.0 through the
        entire window and still fail this test.  That guarantee is verified by
        test_visible_change_test_still_catches_static_effect below.
        """
        eid, info = effect_entry
        if eid in self.IDENTITY_BY_DEFAULT:
            pytest.skip(f"{eid} is identity-by-default (color correction tool)")

        params = _default_params(info)

        # First attempt — single frame, no prior state (existing behaviour).
        frame = _frame()
        result, state_out = info["fn"](frame, params, None, **KW)
        diff = float(
            np.mean(
                np.abs(
                    result[:, :, :3].astype(np.float64)
                    - frame[:, :, :3].astype(np.float64)
                )
            )
        )

        if diff >= self.DIFF_THRESHOLD:
            # Fast path: effect already produces visible change on frame 0.
            return

        # Slow path: effect returned ~0 diff on frame 0.  This is expected for
        # stateful effects that seed state before transforming.  Run the warm-up
        # window to verify that visible change appears on a subsequent frame.
        best_diff = _visible_change_or_warmup(
            info["fn"],
            params,
            threshold=self.DIFF_THRESHOLD,
            max_warmup=self.WARMUP_FRAMES,
        )

        assert best_diff >= self.DIFF_THRESHOLD, (
            f"{eid}: no visible change in {self.WARMUP_FRAMES} warm-up frames "
            f"(best mean abs diff = {best_diff:.4f}, threshold = {self.DIFF_THRESHOLD}). "
            f"Either add {eid!r} to IDENTITY_BY_DEFAULT (if identity-by-design) "
            f"or fix the effect so it produces visible change within the warm-up window."
        )

    def test_visible_change_test_still_catches_static_effect(self):
        """Anti-gaming guard: warm-up helper must FAIL a truly-static effect.

        A deliberately-static effect that returns frame.copy() for ALL frames
        (including warm-up frames) must NOT pass the visible-change check.
        If this test fails it means the warm-up logic is too lenient — a static
        passthrough would slip through and the CI check would be meaningless.
        """

        def static_apply(frame, params, state_in, *, frame_index, seed, resolution):
            """Trivially static: always returns the input frame unchanged."""
            return frame.copy(), state_in  # no-op for every frame

        params: dict = {}
        best_diff = _visible_change_or_warmup(
            static_apply,
            params,
            threshold=self.DIFF_THRESHOLD,
            max_warmup=self.WARMUP_FRAMES,
        )

        # The guard must score below threshold — static effects must not pass.
        assert best_diff < self.DIFF_THRESHOLD, (
            f"Anti-gaming guard BROKEN: static passthrough effect scored diff={best_diff:.4f} "
            f">= threshold={self.DIFF_THRESHOLD}. The warm-up helper is too lenient."
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
