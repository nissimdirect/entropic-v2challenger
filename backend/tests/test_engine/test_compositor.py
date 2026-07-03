"""Tests for multi-track compositor — blend modes, opacity, mute/solo filtering."""

import numpy as np
import pytest

from engine.compositor import render_composite


RESOLUTION = (100, 100)


def make_solid_frame(r: int, g: int, b: int, a: int = 255) -> np.ndarray:
    """Create a solid color RGBA frame (100x100)."""
    frame = np.full((100, 100, 4), [r, g, b, a], dtype=np.uint8)
    return frame


def make_layer(
    frame: np.ndarray, blend_mode: str = "normal", opacity: float = 1.0, chain=None
):
    """Create a layer dict for render_composite."""
    return {
        "frame": frame,
        "chain": chain or [],
        "opacity": opacity,
        "blend_mode": blend_mode,
        "frame_index": 0,
    }


class TestSingleLayer:
    def test_single_layer_passthrough(self):
        """Single layer → output equals input."""
        frame = make_solid_frame(128, 64, 32)
        result = render_composite([make_layer(frame)], RESOLUTION)

        assert result.dtype == np.uint8
        assert result.shape == (100, 100, 4)
        np.testing.assert_array_equal(result, frame)

    def test_single_layer_with_opacity(self):
        """Single layer at 50% opacity → blended with black canvas."""
        frame = make_solid_frame(200, 100, 50)
        result = render_composite([make_layer(frame, opacity=0.5)], RESOLUTION)

        # 0 * 0.5 + 200 * 0.5 = 100 (canvas starts at 0)
        assert result[0, 0, 0] == 100
        assert result[0, 0, 1] == 50
        assert result[0, 0, 2] == 25


class TestNormalBlend:
    def test_two_layers_normal_100_percent(self):
        """Top layer at 100% opacity completely covers bottom."""
        bottom = make_solid_frame(255, 0, 0)
        top = make_solid_frame(0, 255, 0)
        result = render_composite(
            [make_layer(bottom), make_layer(top)],
            RESOLUTION,
        )
        np.testing.assert_array_equal(result[0, 0, :3], [0, 255, 0])

    def test_two_layers_normal_50_percent(self):
        """Top layer at 50% opacity blends with bottom."""
        bottom = make_solid_frame(200, 0, 0)
        top = make_solid_frame(0, 200, 0)
        result = render_composite(
            [make_layer(bottom), make_layer(top, opacity=0.5)],
            RESOLUTION,
        )
        # R: 200 * 0.5 + 0 * 0.5 = 100
        # G: 0 * 0.5 + 200 * 0.5 = 100
        assert result[0, 0, 0] == 100
        assert result[0, 0, 1] == 100


class TestAddBlend:
    def test_add_blend_clips_to_255(self):
        """Add blend clips to 255, does NOT wrap via uint8 overflow."""
        a = make_solid_frame(200, 200, 200)
        b = make_solid_frame(200, 200, 200)
        result = render_composite(
            [make_layer(a), make_layer(b, blend_mode="add")],
            RESOLUTION,
        )
        # 200 + 200 = 400, clipped to 255 (NOT 144 from uint8 wrap)
        assert result[0, 0, 0] == 255
        assert result[0, 0, 1] == 255
        assert result[0, 0, 2] == 255

    def test_add_blend_known_values(self):
        """Add blend with values that sum below 255."""
        a = make_solid_frame(50, 100, 150)
        b = make_solid_frame(30, 40, 50)
        result = render_composite(
            [make_layer(a), make_layer(b, blend_mode="add")],
            RESOLUTION,
        )
        assert result[0, 0, 0] == 80
        assert result[0, 0, 1] == 140
        assert result[0, 0, 2] == 200


class TestMultiplyBlend:
    def test_multiply_known_values(self):
        """Multiply: (a * b) / 255."""
        a = make_solid_frame(255, 128, 0)
        b = make_solid_frame(128, 255, 128)
        result = render_composite(
            [make_layer(a), make_layer(b, blend_mode="multiply")],
            RESOLUTION,
        )
        # R: (255 * 128) / 255 = 128
        # G: (128 * 255) / 255 = 128
        # B: (0 * 128) / 255 = 0
        assert result[0, 0, 0] == 128
        assert result[0, 0, 1] == 128
        assert result[0, 0, 2] == 0


class TestScreenBlend:
    def test_screen_known_values(self):
        """Screen: 255 - ((255 - a) * (255 - b)) / 255."""
        a = make_solid_frame(128, 128, 128)
        b = make_solid_frame(128, 128, 128)
        result = render_composite(
            [make_layer(a), make_layer(b, blend_mode="screen")],
            RESOLUTION,
        )
        # 255 - ((127 * 127) / 255) ≈ 255 - 63.25 ≈ 192
        expected = int(255.0 - ((255.0 - 128) * (255.0 - 128)) / 255.0)
        assert abs(int(result[0, 0, 0]) - expected) <= 1


class TestOverlayBlend:
    def test_overlay_dark_base(self):
        """Overlay with dark base (< 128) uses multiply formula."""
        a = make_solid_frame(64, 64, 64)
        b = make_solid_frame(128, 128, 128)
        result = render_composite(
            [make_layer(a), make_layer(b, blend_mode="overlay")],
            RESOLUTION,
        )
        # base < 128: 2 * 64 * 128 / 255 ≈ 64
        expected = int(2.0 * 64 * 128 / 255.0)
        assert abs(int(result[0, 0, 0]) - expected) <= 1


class TestDifferenceBlend:
    def test_difference_known_values(self):
        """Difference: |a - b|."""
        a = make_solid_frame(200, 50, 100)
        b = make_solid_frame(100, 150, 100)
        result = render_composite(
            [make_layer(a), make_layer(b, blend_mode="difference")],
            RESOLUTION,
        )
        assert result[0, 0, 0] == 100
        assert result[0, 0, 1] == 100
        assert result[0, 0, 2] == 0


class TestExclusionBlend:
    def test_exclusion_known_values(self):
        """Exclusion: a + b - 2ab/255."""
        a = make_solid_frame(128, 128, 128)
        b = make_solid_frame(128, 128, 128)
        result = render_composite(
            [make_layer(a), make_layer(b, blend_mode="exclusion")],
            RESOLUTION,
        )
        # 128 + 128 - 2*128*128/255 ≈ 256 - 128.5 ≈ 128 (rounded)
        expected = int(128 + 128 - 2.0 * 128 * 128 / 255.0)
        assert abs(int(result[0, 0, 0]) - expected) <= 1


class TestDarkenLightenBlend:
    def test_darken(self):
        a = make_solid_frame(200, 50, 100)
        b = make_solid_frame(100, 150, 200)
        result = render_composite(
            [make_layer(a), make_layer(b, blend_mode="darken")],
            RESOLUTION,
        )
        assert result[0, 0, 0] == 100
        assert result[0, 0, 1] == 50
        assert result[0, 0, 2] == 100

    def test_lighten(self):
        a = make_solid_frame(200, 50, 100)
        b = make_solid_frame(100, 150, 200)
        result = render_composite(
            [make_layer(a), make_layer(b, blend_mode="lighten")],
            RESOLUTION,
        )
        assert result[0, 0, 0] == 200
        assert result[0, 0, 1] == 150
        assert result[0, 0, 2] == 200


class TestEdgeCases:
    def test_empty_layers_returns_black(self):
        """Empty layers list → black frame."""
        result = render_composite([], RESOLUTION)
        assert result.shape == (100, 100, 4)
        assert result.dtype == np.uint8
        np.testing.assert_array_equal(result, 0)

    def test_output_dtype_is_uint8(self):
        """Output must be uint8, not float32."""
        frame = make_solid_frame(128, 128, 128)
        result = render_composite([make_layer(frame)], RESOLUTION)
        assert result.dtype == np.uint8

    def test_many_layers(self):
        """Multiple layers composited without error."""
        layers = [make_layer(make_solid_frame(50 * i, 50, 50)) for i in range(5)]
        result = render_composite(layers, RESOLUTION)
        assert result.dtype == np.uint8
        assert result.shape == (100, 100, 4)


class TestResolutionMismatch:
    """Layers with different resolutions than the canvas should be resized."""

    def test_smaller_layer_resized_to_canvas(self):
        """A 50x50 layer composited onto a 100x100 canvas."""
        small_frame = np.full((50, 50, 4), [200, 100, 50, 255], dtype=np.uint8)
        result = render_composite(
            [make_layer(small_frame)],
            RESOLUTION,  # 100x100
        )
        assert result.shape == (100, 100, 4)
        assert result.dtype == np.uint8
        # Should be the resized solid color, not crash
        assert result[0, 0, 0] == 200

    def test_larger_layer_resized_to_canvas(self):
        """A 200x200 layer composited onto a 100x100 canvas."""
        large_frame = np.full((200, 200, 4), [100, 200, 50, 255], dtype=np.uint8)
        result = render_composite(
            [make_layer(large_frame)],
            RESOLUTION,
        )
        assert result.shape == (100, 100, 4)
        assert result[0, 0, 0] == 100

    def test_mixed_resolution_layers(self):
        """Two layers with different resolutions blend correctly."""
        frame_a = np.full((100, 100, 4), [255, 0, 0, 255], dtype=np.uint8)
        frame_b = np.full((50, 75, 4), [0, 255, 0, 255], dtype=np.uint8)
        result = render_composite(
            [make_layer(frame_a), make_layer(frame_b, opacity=0.5)],
            RESOLUTION,
        )
        assert result.shape == (100, 100, 4)
        # R: 255 * 0.5 + 0 * 0.5 ≈ 128
        assert abs(int(result[0, 0, 0]) - 128) <= 1
        # G: 0 * 0.5 + 255 * 0.5 ≈ 128
        assert abs(int(result[0, 0, 1]) - 128) <= 1

    def test_720p_on_1080p_canvas(self):
        """Real-world case: 720p video on 1080p canvas."""
        frame_720p = np.full((720, 1280, 4), [128, 128, 128, 255], dtype=np.uint8)
        result = render_composite(
            [make_layer(frame_720p)],
            (1920, 1080),
        )
        assert result.shape == (1080, 1920, 4)
        assert result.dtype == np.uint8
        assert result[540, 960, 0] == 128  # center pixel

    def test_non_standard_aspect_ratio(self):
        """Layer with different aspect ratio still composites."""
        wide_frame = np.full((50, 200, 4), [64, 128, 192, 255], dtype=np.uint8)
        result = render_composite(
            [make_layer(wide_frame)],
            RESOLUTION,
        )
        assert result.shape == (100, 100, 4)
        # Content should be stretched to fit (not letter-boxed)

    def test_zero_height_layer_skipped(self):
        """A degenerate frame with zero height should be skipped, not crash."""
        zero_frame = np.zeros((0, 100, 4), dtype=np.uint8)
        result = render_composite(
            [make_layer(zero_frame)],
            RESOLUTION,
        )
        # Should return black canvas (layer skipped)
        assert result.shape == (100, 100, 4)
        np.testing.assert_array_equal(result, 0)

    def test_zero_width_layer_skipped(self):
        """A degenerate frame with zero width should be skipped."""
        zero_frame = np.zeros((100, 0, 4), dtype=np.uint8)
        result = render_composite(
            [make_layer(zero_frame)],
            RESOLUTION,
        )
        assert result.shape == (100, 100, 4)
        np.testing.assert_array_equal(result, 0)

    def test_zero_dim_mixed_with_valid(self):
        """A degenerate layer mixed with a valid layer — valid still composites."""
        zero_frame = np.zeros((0, 0, 4), dtype=np.uint8)
        valid_frame = make_solid_frame(200, 100, 50)
        result = render_composite(
            [make_layer(zero_frame), make_layer(valid_frame)],
            RESOLUTION,
        )
        assert result.shape == (100, 100, 4)
        assert result[0, 0, 0] == 200  # valid layer composited


# ---------------------------------------------------------------------------
# M.1 (Master-Out Bus PRD, docs/plans/2026-07-03-master-out-bus-prd.md) —
# `render_composite`'s `master_chain` param: the ONE post-composite seam
# shared by preview (_handle_render_composite) and export
# (_composite_export_frame). Three hard-oracle properties:
#   (a) NO-OP PARITY — an empty/absent master chain renders BYTE-IDENTICAL.
#   (b) SUM APPLY — a master effect runs on the COMPOSITED SUM of all layers,
#       not per-layer.
#   (c) migration (bootstrap/hydrate injecting the Master track itself) is
#       covered on the frontend — see
#       frontend/src/__tests__/stores/{timeline,project-persistence}.test.ts.
# ---------------------------------------------------------------------------
class TestMasterChainNoOpParity:
    """(a) NO-OP PARITY — the #1 regression guard from the PRD."""

    def _two_track_composite(self, **kwargs):
        bottom = make_solid_frame(200, 60, 30)
        top = make_solid_frame(10, 180, 220)
        return render_composite(
            [make_layer(bottom), make_layer(top, opacity=0.5, blend_mode="screen")],
            RESOLUTION,
            **kwargs,
        )

    def test_absent_master_chain_matches_pre_m1_default(self):
        """No `master_chain` kwarg at all (the pre-M.1 call shape every existing
        caller/test in this file uses) — byte-identical to explicitly passing
        `master_chain=None`."""
        before = self._two_track_composite()
        after = self._two_track_composite(master_chain=None)
        np.testing.assert_array_equal(before, after)

    def test_empty_master_chain_is_true_noop_byte_identical(self):
        """An EMPTY Master effectChain ([]) — what every real preview/export call
        sends for a project whose Master track has no effects yet — renders
        BYTE-IDENTICAL to no master chain at all. This is the golden no-op gate:
        shipping M.1 must not change a single existing render's output."""
        before = self._two_track_composite()  # simulates "before M.1 shipped"
        after = self._two_track_composite(master_chain=[])
        np.testing.assert_array_equal(before, after)
        assert after.dtype == np.uint8
        assert after.shape == (100, 100, 4)

    def test_empty_master_chain_noop_holds_for_single_layer_too(self):
        """Same no-op guarantee on the single-layer composite path."""
        frame = make_solid_frame(128, 64, 32)
        before = render_composite([make_layer(frame)], RESOLUTION)
        after = render_composite([make_layer(frame)], RESOLUTION, master_chain=[])
        np.testing.assert_array_equal(before, after)

    def test_recursive_group_subframe_never_sees_master_chain(self):
        """`master_chain` defaults to None and is never threaded into a
        composite_tree recursive sub-frame render (that sub-frame is NOT the
        final output) — verified indirectly: calling render_composite with no
        master_chain kwarg (what composite_tree.expand_group_layer's internal
        calls do) is exactly the pre-M.1 call shape, already covered above.
        This test just pins the DEFAULT is None, not []."""
        import inspect

        sig = inspect.signature(render_composite)
        assert sig.parameters["master_chain"].default is None


class TestMasterChainAppliesToCompositedSum:
    """(b) SUM APPLY — a master effect runs on the COMPOSITED SUM, not per-layer."""

    def test_master_invert_applies_to_composited_sum_not_per_layer(self):
        """Two tracks composite to some blended color; a master `fx.invert`
        chain must invert THAT composited result — proving it runs once, on
        the sum, not twice (once per layer)."""
        bottom = make_solid_frame(200, 60, 30)
        top = make_solid_frame(10, 180, 220)
        layers = [make_layer(bottom), make_layer(top, opacity=0.5, blend_mode="screen")]

        composited = render_composite(layers, RESOLUTION)
        inverted = render_composite(
            layers,
            RESOLUTION,
            master_chain=[{"effect_id": "fx.invert", "params": {}, "enabled": True}],
        )

        assert inverted.shape == composited.shape
        # Master ran on the SUM: RGB is exactly 255-composited (alpha untouched
        # per fx.invert.apply's contract). If it had run per-layer BEFORE the
        # blend instead, this exact relationship would not hold post-blend.
        expected_rgb = 255 - composited[:, :, :3].astype(np.int16)
        np.testing.assert_array_equal(inverted[:, :, :3], expected_rgb.astype(np.uint8))
        np.testing.assert_array_equal(inverted[:, :, 3], composited[:, :, 3])
        # And it must actually differ from the un-inverted composite (sanity —
        # rules out a no-op bug masquerading as a pass).
        assert not np.array_equal(inverted, composited)

    def test_master_chain_runs_once_regardless_of_layer_count(self):
        """3 layers composited, then master-inverted — still ONE inversion of
        the final sum (not one per layer, which would be a no-op for an
        involution like invert applied an odd vs even number of times)."""
        layers = [
            make_layer(make_solid_frame(255, 0, 0)),
            make_layer(make_solid_frame(0, 255, 0), opacity=0.5),
            make_layer(make_solid_frame(0, 0, 255), opacity=0.5, blend_mode="add"),
        ]
        composited = render_composite(layers, RESOLUTION)
        inverted = render_composite(
            layers,
            RESOLUTION,
            master_chain=[{"effect_id": "fx.invert", "params": {}, "enabled": True}],
        )
        expected_rgb = 255 - composited[:, :, :3].astype(np.int16)
        np.testing.assert_array_equal(inverted[:, :, :3], expected_rgb.astype(np.uint8))

    def test_master_chain_with_layer_states_tuple_return_shape(self):
        """When layer_states is passed (2-tuple return contract), a master
        chain still applies to the final frame and the tuple shape is
        preserved (new_states is layer state, NOT master state — M.1 does not
        thread master-effect state, see compositor.py docstring)."""
        bottom = make_solid_frame(200, 60, 30)
        top = make_solid_frame(10, 180, 220)
        layers = [
            make_layer(bottom) | {"layer_id": "bottom"},
            make_layer(top, opacity=0.5) | {"layer_id": "top"},
        ]
        out, new_states = render_composite(
            layers,
            RESOLUTION,
            layer_states={},
            master_chain=[{"effect_id": "fx.invert", "params": {}, "enabled": True}],
        )
        assert isinstance(new_states, dict)
        no_master_out, _ = render_composite(layers, RESOLUTION, layer_states={})
        expected_rgb = 255 - no_master_out[:, :, :3].astype(np.int16)
        np.testing.assert_array_equal(out[:, :, :3], expected_rgb.astype(np.uint8))
