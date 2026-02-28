"""Effect registry — central lookup for all registered effects."""

import os
from typing import Any, Callable

EffectFn = Callable[..., tuple[Any, dict | None]]

_REGISTRY: dict[str, dict] = {}


def register(effect_id: str, fn: EffectFn, params: dict, name: str, category: str):
    """Register an effect."""
    _REGISTRY[effect_id] = {
        "fn": fn,
        "params": params,
        "name": name,
        "category": category,
    }


def get(effect_id: str) -> dict | None:
    """Get effect info by ID."""
    return _REGISTRY.get(effect_id)


def list_all() -> list[dict]:
    """List all registered effects with metadata."""
    return [
        {
            "id": eid,
            "name": info["name"],
            "category": info["category"],
            "params": info["params"],
        }
        for eid, info in _REGISTRY.items()
    ]


def _auto_register():
    """Import and register all built-in effects."""
    from effects.fx import (
        invert,
        hue_shift,
        noise,
        blur,
        posterize,
        pixelsort,
        edge_detect,
        vhs,
        wave_distort,
        channelshift,
        byte_corrupt,
        block_corrupt,
        row_shift,
        jpeg_artifacts,
        invert_bands,
        data_bend,
        film_grain,
        xor_glitch,
        pixel_annihilate,
        channel_destroy,
        solarize,
        duotone,
        emboss,
        median_filter,
        false_color,
        histogram_eq,
        clahe,
        parallel_compression,
        contrast_crush,
        saturation_warp,
        brightness_exposure,
        color_temperature,
        tape_saturation,
        cyanotype,
        infrared,
        displacement,
        mirror,
        chromatic_aberration,
        pencil_sketch,
        sharpen,
        tv_static,
        contour_lines,
        scanlines,
        kaleidoscope,
        soft_bloom,
        shape_overlay,
        lens_flare,
        watercolor,
        gate,
        wavefold,
        am_radio,
        ring_mod,
        rainbow_shift,
        sparkle,
        chroma_key,
        luma_key,
        ascii_art,
    )
    from effects.util import (
        levels,
        curves,
        hsl_adjust,
        color_balance,
        auto_levels,
    )

    mods = [
        invert,
        hue_shift,
        noise,
        blur,
        posterize,
        pixelsort,
        edge_detect,
        vhs,
        wave_distort,
        channelshift,
        levels,
        curves,
        hsl_adjust,
        color_balance,
        auto_levels,
        byte_corrupt,
        block_corrupt,
        row_shift,
        jpeg_artifacts,
        invert_bands,
        data_bend,
        film_grain,
        xor_glitch,
        pixel_annihilate,
        channel_destroy,
        solarize,
        duotone,
        emboss,
        median_filter,
        false_color,
        histogram_eq,
        clahe,
        parallel_compression,
        contrast_crush,
        saturation_warp,
        brightness_exposure,
        color_temperature,
        tape_saturation,
        cyanotype,
        infrared,
        displacement,
        mirror,
        chromatic_aberration,
        pencil_sketch,
        sharpen,
        tv_static,
        contour_lines,
        scanlines,
        kaleidoscope,
        soft_bloom,
        shape_overlay,
        lens_flare,
        watercolor,
        gate,
        wavefold,
        am_radio,
        ring_mod,
        rainbow_shift,
        sparkle,
        chroma_key,
        luma_key,
        ascii_art,
    ]

    # Dev-only effects (UAT crash testing)
    if os.environ.get("APP_ENV") == "development":
        from effects.fx import debug_crash

        mods.append(debug_crash)

    for mod in mods:
        register(
            mod.EFFECT_ID, mod.apply, mod.PARAMS, mod.EFFECT_NAME, mod.EFFECT_CATEGORY
        )


_auto_register()
