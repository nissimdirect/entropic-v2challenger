"""Tests for engine.codecs — codec registry, resolution/fps presets, availability."""

import pytest

from engine.codecs import (
    CODEC_REGISTRY,
    FPS_PRESETS,
    RESOLUTION_PRESETS,
    get_codec_config,
    list_available_codecs,
    validate_codec_availability,
)


def test_codec_registry_has_all_entries():
    """All expected codec keys are present in CODEC_REGISTRY."""
    expected = {"h264", "h265", "prores_422", "prores_4444"}
    assert expected.issubset(set(CODEC_REGISTRY.keys()))


def test_get_codec_config_h264():
    """H.264 config returns expected structure."""
    cfg = get_codec_config("h264")
    assert isinstance(cfg, dict)
    assert cfg["pyav_codec"] == "libx264"
    assert "pix_fmt" in cfg
    assert "quality_presets" in cfg


def test_get_codec_config_unknown_raises():
    """Unknown codec name raises ValueError."""
    with pytest.raises(ValueError):
        get_codec_config("unknown_codec")


def test_resolution_presets():
    """Resolution presets map expected keys to tuples."""
    assert RESOLUTION_PRESETS["source"] is None
    assert RESOLUTION_PRESETS["720p"] == (1280, 720)
    assert RESOLUTION_PRESETS["1080p"] == (1920, 1080)
    assert RESOLUTION_PRESETS["4k"] == (3840, 2160)


def test_fps_presets():
    """FPS presets map expected keys to numeric values or None."""
    assert FPS_PRESETS["source"] is None
    assert FPS_PRESETS["24"] == 24
    assert FPS_PRESETS["30"] == 30
    assert FPS_PRESETS["60"] == 60


def test_validate_codec_availability_h264():
    """libx264 should always be available in any ffmpeg/pyav build."""
    assert validate_codec_availability("libx264") is True


def test_validate_codec_availability_fake():
    """Nonexistent codec should return False."""
    assert validate_codec_availability("nonexistent_codec") is False


def test_list_available_codecs():
    """list_available_codecs returns a list containing at least h264."""
    codecs = list_available_codecs()
    assert isinstance(codecs, list)
    assert "h264" in codecs
