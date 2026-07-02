"""Tests for text renderer — rendering, animations, font lookup, caching."""

import numpy as np
import pytest

from engine.text_renderer import (
    ANIMATION_PRESETS,
    _apply_animation,
    _parse_hex_color,
    clear_text_cache,
    list_system_fonts,
    render_text_frame,
)


@pytest.fixture(autouse=True)
def clear_cache():
    """Clear text cache before each test."""
    clear_text_cache()
    yield
    clear_text_cache()


# --- render_text_frame ---


def test_render_basic_text():
    """Render simple white text on transparent canvas."""
    config = {
        "text": "Hello",
        "font_family": "Helvetica",
        "font_size": 48,
        "color": "#ffffff",
        "position": [100, 100],
    }
    frame = render_text_frame(config, (1920, 1080))
    assert frame.shape == (1080, 1920, 4)
    assert frame.dtype == np.uint8
    # Frame should not be fully transparent (text was drawn)
    assert frame[:, :, 3].max() > 0


def test_render_empty_text():
    """Empty text returns transparent frame."""
    config = {"text": ""}
    frame = render_text_frame(config, (800, 600))
    assert frame.shape == (600, 800, 4)
    assert frame[:, :, 3].max() == 0


def test_render_custom_color():
    """Text with red color should have red pixels."""
    config = {
        "text": "RED",
        "font_size": 72,
        "color": "#ff0000",
        "position": [100, 100],
    }
    frame = render_text_frame(config, (800, 600))
    # Find non-transparent pixels
    mask = frame[:, :, 3] > 0
    if mask.any():
        # Red channel should dominate
        assert frame[mask, 0].mean() > frame[mask, 2].mean()


def test_render_with_stroke():
    config = {
        "text": "STROKE",
        "font_size": 48,
        "color": "#ffffff",
        "stroke_width": 3,
        "stroke_color": "#000000",
        "position": [100, 100],
    }
    frame = render_text_frame(config, (800, 600))
    assert frame[:, :, 3].max() > 0


def test_render_with_shadow():
    config = {
        "text": "SHADOW",
        "font_size": 48,
        "color": "#ffffff",
        "shadow_offset": [4, 4],
        "shadow_color": "#000000",
        "position": [100, 100],
    }
    frame = render_text_frame(config, (800, 600))
    assert frame[:, :, 3].max() > 0


def test_render_center_alignment():
    config = {
        "text": "CENTERED",
        "font_size": 48,
        "alignment": "center",
        "position": [400, 300],
    }
    frame = render_text_frame(config, (800, 600))
    assert frame[:, :, 3].max() > 0


def test_render_right_alignment():
    config = {
        "text": "RIGHT",
        "font_size": 48,
        "alignment": "right",
        "position": [700, 100],
    }
    frame = render_text_frame(config, (800, 600))
    assert frame[:, :, 3].max() > 0


def test_render_zero_opacity():
    """Zero opacity returns transparent frame."""
    config = {
        "text": "INVISIBLE",
        "opacity": 0.0,
        "position": [100, 100],
    }
    frame = render_text_frame(config, (800, 600))
    assert frame[:, :, 3].max() == 0


# --- Frame cache ---


def test_static_text_caching():
    """Same config should return cached frame."""
    config = {
        "text": "CACHED",
        "font_size": 36,
        "position": [100, 100],
    }
    f1 = render_text_frame(config, (800, 600), frame_index=0)
    f2 = render_text_frame(config, (800, 600), frame_index=5)
    # Static text (no animation) — same config hash, same frame
    assert np.array_equal(f1, f2)


def test_animated_text_different_frames():
    """Animated text should produce different frames at different indices."""
    config = {
        "text": "ANIMATED",
        "font_size": 36,
        "position": [100, 100],
        "animation": "fade_in",
        "animation_duration": 1.0,
    }
    f0 = render_text_frame(config, (800, 600), frame_index=0, fps=30.0)
    f15 = render_text_frame(config, (800, 600), frame_index=15, fps=30.0)
    # Different frames should have different alpha values
    assert not np.array_equal(f0, f15)


# --- Animation presets ---


def test_all_animation_presets_defined():
    assert len(ANIMATION_PRESETS) == 8
    assert "none" in ANIMATION_PRESETS
    assert "typewriter" in ANIMATION_PRESETS


def test_animation_none():
    pos, opacity, scale, visible = _apply_animation(
        "none", 0, 30.0, 30, "Hello", (100, 100), 1.0
    )
    assert pos == (100, 100)
    assert opacity == 1.0
    assert scale == 1.0
    assert visible == 5


def test_animation_fade_in_start():
    _, opacity, _, _ = _apply_animation("fade_in", 0, 30.0, 30, "Hi", (0, 0), 1.0)
    assert opacity == 0.0


def test_animation_fade_in_end():
    _, opacity, _, _ = _apply_animation("fade_in", 30, 30.0, 30, "Hi", (0, 0), 1.0)
    assert opacity == 1.0


def test_animation_typewriter():
    _, _, _, visible = _apply_animation(
        "typewriter", 15, 30.0, 30, "Hello World", (0, 0), 1.0
    )
    # At 50% progress, should show ~half the chars
    assert 1 <= visible <= len("Hello World")
    assert visible < len("Hello World")


def test_animation_scale_up_start():
    _, _, scale, _ = _apply_animation("scale_up", 0, 30.0, 30, "Hi", (0, 0), 1.0)
    assert scale == 0.5


def test_animation_scale_up_end():
    _, _, scale, _ = _apply_animation("scale_up", 30, 30.0, 30, "Hi", (0, 0), 1.0)
    assert scale == 1.0


# --- Font enumeration ---


def test_list_system_fonts():
    """Should find at least one system font."""
    fonts = list_system_fonts()
    assert isinstance(fonts, list)
    assert len(fonts) > 0
    # Each font should have name and path
    assert "name" in fonts[0]
    assert "path" in fonts[0]


def test_list_system_fonts_cached():
    """Second call returns same result (cached)."""
    f1 = list_system_fonts()
    f2 = list_system_fonts()
    assert f1 is f2  # Same object — lru_cache


# --- Color parsing ---


def test_parse_hex_6():
    assert _parse_hex_color("#ff0000") == (255, 0, 0, 255)


def test_parse_hex_8():
    assert _parse_hex_color("#ff000080") == (255, 0, 0, 128)


def test_parse_hex_invalid():
    assert _parse_hex_color("bad") == (255, 255, 255, 255)
