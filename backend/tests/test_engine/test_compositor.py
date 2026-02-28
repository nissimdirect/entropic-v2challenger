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
