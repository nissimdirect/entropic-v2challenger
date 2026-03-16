"""Codec configuration registry for Entropic's export system."""

import logging
from typing import Optional

import av

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Codec registry
# ---------------------------------------------------------------------------

CODEC_REGISTRY: dict[str, dict] = {
    "h264": {
        "pyav_codec": "libx264",
        "pix_fmt": "yuv420p",
        "bitrate_range": (1_000_000, 50_000_000),
        "quality_presets": {"fast": "ultrafast", "medium": "medium", "slow": "slow"},
    },
    "h265": {
        "pyav_codec": "libx265",
        "pix_fmt": "yuv420p",
        "bitrate_range": (1_000_000, 50_000_000),
        "quality_presets": {"fast": "ultrafast", "medium": "medium", "slow": "slow"},
    },
    "prores_422": {
        "pyav_codec": "prores_ks",
        "pix_fmt": "yuv422p10le",
        "profile": 2,
        "bitrate_range": None,
        "quality_presets": {"fast": 2, "medium": 2, "slow": 2},
    },
    "prores_4444": {
        "pyav_codec": "prores_ks",
        "pix_fmt": "yuva444p10le",
        "profile": 4,
        "bitrate_range": None,
        "quality_presets": {"fast": 4, "medium": 4, "slow": 4},
    },
}

# ---------------------------------------------------------------------------
# Resolution presets
# ---------------------------------------------------------------------------

RESOLUTION_PRESETS: dict[str, Optional[tuple[int, int]]] = {
    "source": None,
    "720p": (1280, 720),
    "1080p": (1920, 1080),
    "4k": (3840, 2160),
}

# ---------------------------------------------------------------------------
# FPS presets
# ---------------------------------------------------------------------------

FPS_PRESETS: dict[str, Optional[int]] = {
    "source": None,
    "24": 24,
    "25": 25,
    "30": 30,
    "60": 60,
}

# ---------------------------------------------------------------------------
# Public helpers
# ---------------------------------------------------------------------------


def validate_codec_availability(codec_name: str) -> bool:
    """Check whether a PyAV codec is available on this system."""
    try:
        av.CodecContext.create(codec_name, "w")
        return True
    except Exception:
        logger.debug("Codec %s not available", codec_name)
        return False


def get_codec_config(codec_name: str) -> dict:
    """Return the config dict for *codec_name*.

    Raises ``ValueError`` if the codec is not in the registry.
    """
    if codec_name not in CODEC_REGISTRY:
        raise ValueError(
            f"Unknown codec {codec_name!r}. Available: {', '.join(CODEC_REGISTRY)}"
        )
    return CODEC_REGISTRY[codec_name]


def list_available_codecs() -> list[str]:
    """Return registry codec names whose PyAV backend is present."""
    available: list[str] = []
    for name, cfg in CODEC_REGISTRY.items():
        if validate_codec_availability(cfg["pyav_codec"]):
            available.append(name)
    return available
