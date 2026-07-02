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
    # §14-3 decision: INCLUDED (D3 — user approved 2026-06-12 "your recs are good").
    # HONEST alpha gate: list_available_codecs() runs alpha_codec_preserves_alpha()
    # for this entry (pix_fmt has 'a'). Presence of libvpx-vp9 is NOT enough — the
    # codec is only offered when a real encode→decode round-trip proves the alpha
    # plane survives on the running build. The registry entry stays as the single
    # source of truth; the probe ensures it is never offered as silently-opaque.
    "webm_vp9_alpha": {
        "pyav_codec": "libvpx-vp9",
        "pix_fmt": "yuva420p",
        "bitrate_range": (500_000, 20_000_000),
        "quality_presets": {"fast": "realtime", "medium": "good", "slow": "best"},
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
    """Check whether a PyAV codec is available on this system (presence only)."""
    try:
        av.CodecContext.create(codec_name, "w")
        return True
    except Exception:
        logger.debug("Codec %s not available", codec_name)
        return False


def alpha_codec_preserves_alpha(pyav_codec: str, pix_fmt: str) -> bool:
    """HONEST alpha gate: does this build actually preserve alpha for *pix_fmt*?

    Codec *presence* is not enough. Some builds (e.g. certain libvpx-vp9 builds)
    accept an alpha pix_fmt like ``yuva420p`` but silently downgrade to an opaque
    pix_fmt (``yuv420p``) at encode time — the codec looks selectable but produces
    a fully-opaque file with no error. Offering such a codec in the export list is
    the dead-flag pattern (cf. MK.8): the user picks it expecting transparency and
    gets an opaque video.

    This probe does a real in-memory encode→decode round-trip of a 16×16 frame
    whose alpha is 0 in the left half and 255 in the right half, then confirms the
    decoded alpha plane still has that structure (mean |Δalpha| ≈ 0). If the build
    drops alpha, the probe returns False and the codec is reported UNAVAILABLE.

    Returns True only when the alpha plane demonstrably survives the round-trip.
    """
    import io

    import numpy as np

    try:
        # Build a known-alpha test frame: left half transparent, right half opaque.
        h, w = 16, 16
        frame_rgba = np.zeros((h, w, 4), dtype=np.uint8)
        frame_rgba[:, :, 0] = 200  # recognisable RGB so the encode has real content
        frame_rgba[:, :, 1] = 100
        frame_rgba[:, :, 2] = 50
        frame_rgba[:, : w // 2, 3] = 0  # left half fully transparent
        frame_rgba[:, w // 2 :, 3] = 255  # right half fully opaque

        buf = io.BytesIO()
        # BytesIO has no filename, so PyAV cannot infer the container — name it
        # explicitly per codec (webm for VP-family, mov for ProRes/everything else).
        container_fmt = "webm" if "vp" in pyav_codec else "mov"
        out = av.open(buf, mode="w", format=container_fmt)
        stream = out.add_stream(pyav_codec, rate=30)
        stream.width = w
        stream.height = h
        stream.pix_fmt = pix_fmt

        av_frame = av.VideoFrame.from_ndarray(frame_rgba, format="rgba")
        for pkt in stream.encode(av_frame):
            out.mux(pkt)
        for pkt in stream.encode():
            out.mux(pkt)
        out.close()

        # If the muxed stream's pix_fmt has no alpha, the build downgraded it.
        buf.seek(0)
        inp = av.open(buf, mode="r", format=container_fmt)
        vstream = inp.streams.video[0]
        muxed_pix_fmt = vstream.codec_context.pix_fmt or ""
        if "a" not in muxed_pix_fmt:
            logger.debug(
                "Alpha probe: %s/%s downgraded to %s — alpha NOT preserved",
                pyav_codec,
                pix_fmt,
                muxed_pix_fmt,
            )
            inp.close()
            return False

        decoded_alpha = None
        for f in inp.decode(video=0):
            decoded_alpha = f.to_ndarray(format="rgba")[:, :, 3]
            break
        inp.close()

        if decoded_alpha is None:
            return False

        # The decoded alpha must still distinguish the two halves.
        left_mean = float(decoded_alpha[:, : w // 2].mean())
        right_mean = float(decoded_alpha[:, w // 2 :].mean())
        # Left should be ~0, right ~255; require a clear separation surviving the codec.
        if left_mean > 32 or right_mean < 223:
            logger.debug(
                "Alpha probe: %s/%s lost alpha structure (left=%.1f right=%.1f)",
                pyav_codec,
                pix_fmt,
                left_mean,
                right_mean,
            )
            return False
        return True
    except Exception as exc:  # noqa: BLE001 — any failure means "don't offer it"
        logger.debug("Alpha probe failed for %s/%s: %s", pyav_codec, pix_fmt, exc)
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
    """Return registry codec names that are usable on this build.

    For RGB codecs this means the PyAV backend is present. For ALPHA codecs
    (registry pix_fmt contains 'a') presence is NOT enough — the alpha plane must
    be proven to survive a real encode→decode round-trip on this build, else the
    codec would be offered as transparent-capable but silently produce an opaque
    file (the dead-flag pattern, cf. MK.8). Such codecs are excluded here so they
    are never offered in the export list.
    """
    available: list[str] = []
    for name, cfg in CODEC_REGISTRY.items():
        if not validate_codec_availability(cfg["pyav_codec"]):
            continue
        pix_fmt = cfg.get("pix_fmt", "")
        if "a" in pix_fmt:
            # Alpha codec — honest gate: must actually preserve alpha on this build.
            if not alpha_codec_preserves_alpha(cfg["pyav_codec"], pix_fmt):
                logger.info(
                    "Codec %s present but drops alpha on this build — not offered", name
                )
                continue
        available.append(name)
    return available
