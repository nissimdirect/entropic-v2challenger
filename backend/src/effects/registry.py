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


def _register_variant(mod, variant_id: str, variant_name: str, mode_value: str):
    """Register a variant alias for a consolidated effect with a preset mode."""
    params = dict(mod.PARAMS)
    params["mode"] = {**params["mode"], "default": mode_value}
    register(variant_id, mod.apply, params, variant_name, mod.EFFECT_CATEGORY)


def _auto_register():
    """Import and register all built-in effects."""
    # --- Original effects (65) ---
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
        color_invert,
        color_filter,
        cumulative_smear,
        braille_art,
        film_grain_warm,
    )
    from effects.util import (
        levels,
        curves,
        hsl_adjust,
        color_balance,
        auto_levels,
    )

    # --- Phase 8: New effects (64 files) ---
    from effects.fx import (
        # Wave 1 — R&D
        compression_oracle,
        logistic_cascade,
        reaction_diffusion,
        domain_warp,
        entropy_map,
        dct_transform,
        generation_loss,
        surveillance_sim,
        # Wave 2 — Physics ports
        pixel_flow_field,
        pixel_force_field,
        pixel_singularity,
        pixel_dimension_warp,
        pixel_print_emulation,
        pixel_explode,
        pixel_superfluid,
        pixel_melt,
        pixel_bubbles,
        pixel_inkdrop,
        pixel_haunt,
        # Wave 3 — Temporal + DSP ports
        temporal_blend,
        temporal_freeze,
        frame_drop,
        tremolo,
        decimator,
        sample_and_hold,
        granulator,
        beat_repeat,
        strobe,
        dsp_flange,
        dsp_phaser,
        resonant_filter,
        comb_filter,
        feedback_phaser,
        spectral_freeze,
        # Wave 4-5 — Destruction + Sidechain + Codec
        datamosh,
        datamosh_real,
        flow_distort,
        glitch_repeat,
        frame_smash,
        bitcrush,
        sidechain_modulate,
        sidechain_cross_blend,
        sidechain_gate,
        sidechain_interference,
        quant_transform,
        block_crystallize,
        chroma_control,
        mosquito_amplify,
        grid_moire,
        grid_scale_mix,
        cross_codec,
        # Wave 6 — Optics + Medical + Misc
        lens_distortion,
        tilt_shift,
        chromatic_aberration_pro,
        bokeh_shaper,
        lo_fi_lens,
        medical_imaging,
        cellular_automata,
        crystal_growth,
        strange_attractor,
        erosion_sim,
        afterimage,
        moire,
        temporal_crystal,
        spectral_analysis,
        sonification_feedback,
    )

    # Original effects list
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
        color_invert,
        color_filter,
        cumulative_smear,
        braille_art,
        film_grain_warm,
    ]

    # Phase 8 effects (non-consolidated — register directly)
    phase8_mods = [
        compression_oracle,
        logistic_cascade,
        reaction_diffusion,
        domain_warp,
        entropy_map,
        generation_loss,
        pixel_explode,
        pixel_superfluid,
        pixel_melt,
        pixel_bubbles,
        pixel_inkdrop,
        pixel_haunt,
        frame_drop,
        tremolo,
        decimator,
        sample_and_hold,
        granulator,
        beat_repeat,
        strobe,
        resonant_filter,
        comb_filter,
        feedback_phaser,
        spectral_freeze,
        datamosh_real,
        flow_distort,
        glitch_repeat,
        frame_smash,
        bitcrush,
        sidechain_gate,
        sidechain_interference,
        block_crystallize,
        chroma_control,
        mosquito_amplify,
        grid_moire,
        grid_scale_mix,
        cross_codec,
        tilt_shift,
        chromatic_aberration_pro,
        bokeh_shaper,
        lo_fi_lens,
        cellular_automata,
        crystal_growth,
        strange_attractor,
        erosion_sim,
        afterimage,
        moire,
        temporal_crystal,
        sonification_feedback,
    ]

    # Phase 8 consolidated effects (register base + variant aliases)
    phase8_consolidated = [
        dct_transform,
        surveillance_sim,
        pixel_flow_field,
        pixel_force_field,
        pixel_singularity,
        pixel_dimension_warp,
        pixel_print_emulation,
        temporal_blend,
        temporal_freeze,
        dsp_flange,
        dsp_phaser,
        datamosh,
        sidechain_modulate,
        sidechain_cross_blend,
        quant_transform,
        lens_distortion,
        medical_imaging,
        spectral_analysis,
    ]

    # --- Phase 12: Subliminal effect ---
    from effects.fx import subliminal

    phase12_mods = [subliminal]

    # Dev-only effects (UAT crash testing)
    if os.environ.get("APP_ENV") == "development":
        from effects.fx import debug_crash

        mods.append(debug_crash)

    # Register all simple effects
    for mod in mods + phase8_mods + phase8_consolidated + phase12_mods:
        register(
            mod.EFFECT_ID, mod.apply, mod.PARAMS, mod.EFFECT_NAME, mod.EFFECT_CATEGORY
        )

    # Register variant aliases for consolidated effects
    # Each variant appears as its own effect in the browser with a preset mode

    # Physics — pixel_flow_field (liquify/timewarp/vortex)
    _register_variant(pixel_flow_field, "fx.pixel_liquify", "Pixel Liquify", "liquify")
    _register_variant(
        pixel_flow_field, "fx.pixel_timewarp", "Pixel Timewarp", "timewarp"
    )
    _register_variant(pixel_flow_field, "fx.pixel_vortex", "Pixel Vortex", "vortex")

    # Physics — pixel_force_field (gravity/antigravity/magnetic/darkenergy)
    _register_variant(pixel_force_field, "fx.pixel_gravity", "Pixel Gravity", "gravity")
    _register_variant(
        pixel_force_field, "fx.pixel_antigravity", "Pixel Antigravity", "antigravity"
    )
    _register_variant(
        pixel_force_field, "fx.pixel_magnetic", "Pixel Magnetic", "magnetic"
    )
    _register_variant(
        pixel_force_field, "fx.pixel_darkenergy", "Pixel Dark Energy", "darkenergy"
    )

    # Physics — pixel_singularity (blackhole/elastic/quantum)
    _register_variant(
        pixel_singularity, "fx.pixel_blackhole", "Pixel Black Hole", "blackhole"
    )
    _register_variant(pixel_singularity, "fx.pixel_elastic", "Pixel Elastic", "elastic")
    _register_variant(pixel_singularity, "fx.pixel_quantum", "Pixel Quantum", "quantum")

    # Physics — pixel_dimension_warp (dimensionfold/wormhole)
    _register_variant(
        pixel_dimension_warp,
        "fx.pixel_dimensionfold",
        "Pixel Dimension Fold",
        "dimensionfold",
    )
    _register_variant(
        pixel_dimension_warp, "fx.pixel_wormhole", "Pixel Wormhole", "wormhole"
    )

    # Physics — pixel_print_emulation (xerox/fax/risograph)
    _register_variant(pixel_print_emulation, "fx.pixel_xerox", "Pixel Xerox", "xerox")
    _register_variant(pixel_print_emulation, "fx.pixel_fax", "Pixel Fax", "fax")
    _register_variant(
        pixel_print_emulation, "fx.pixel_risograph", "Pixel Risograph", "risograph"
    )

    # Temporal — temporal_blend (feedback/delay/visual_reverb)
    _register_variant(temporal_blend, "fx.feedback", "Feedback", "feedback")
    _register_variant(temporal_blend, "fx.delay", "Delay", "delay")
    _register_variant(
        temporal_blend, "fx.visual_reverb", "Visual Reverb", "visual_reverb"
    )

    # Temporal — temporal_freeze (stutter/tape_stop)
    _register_variant(temporal_freeze, "fx.stutter", "Stutter", "stutter")
    _register_variant(temporal_freeze, "fx.tape_stop", "Tape Stop", "tape_stop")

    # DSP — dsp_flange (video_flanger/spatial_flanger/hue_flanger/freq_flanger)
    _register_variant(dsp_flange, "fx.video_flanger", "Video Flanger", "video_flanger")
    _register_variant(
        dsp_flange, "fx.spatial_flanger", "Spatial Flanger", "spatial_flanger"
    )
    _register_variant(dsp_flange, "fx.hue_flanger", "Hue Flanger", "hue_flanger")
    _register_variant(dsp_flange, "fx.freq_flanger", "Freq Flanger", "freq_flanger")

    # DSP — dsp_phaser (video_phaser/channel_phaser/brightness_phaser)
    _register_variant(dsp_phaser, "fx.video_phaser", "Video Phaser", "video_phaser")
    _register_variant(
        dsp_phaser, "fx.channel_phaser", "Channel Phaser", "channel_phaser"
    )
    _register_variant(
        dsp_phaser, "fx.brightness_phaser", "Brightness Phaser", "brightness_phaser"
    )

    # Destruction — datamosh (melt/bloom/freeze)
    _register_variant(datamosh, "fx.datamosh_melt", "Datamosh Melt", "melt")
    _register_variant(datamosh, "fx.datamosh_bloom", "Datamosh Bloom", "bloom")
    _register_variant(datamosh, "fx.datamosh_freeze", "Datamosh Freeze", "freeze")

    # Sidechain — sidechain_modulate (duck/pump)
    _register_variant(sidechain_modulate, "fx.sidechain_duck", "Sidechain Duck", "duck")
    _register_variant(sidechain_modulate, "fx.sidechain_pump", "Sidechain Pump", "pump")

    # Sidechain — sidechain_cross_blend (cross/crossfeed)
    _register_variant(
        sidechain_cross_blend, "fx.sidechain_cross", "Sidechain Cross", "cross"
    )
    _register_variant(
        sidechain_cross_blend,
        "fx.sidechain_crossfeed",
        "Sidechain Crossfeed",
        "crossfeed",
    )

    # Codec — dct_transform (dct_sculpt/dct_swap/dct_phase_destroy)
    _register_variant(dct_transform, "fx.dct_sculpt", "DCT Sculpt", "dct_sculpt")
    _register_variant(dct_transform, "fx.dct_swap", "DCT Swap", "dct_swap")
    _register_variant(
        dct_transform, "fx.dct_phase_destroy", "DCT Phase Destroy", "dct_phase_destroy"
    )

    # Codec — quant_transform (quant_amplify/quant_morph/quant_table_lerp)
    _register_variant(
        quant_transform, "fx.quant_amplify", "Quant Amplify", "quant_amplify"
    )
    _register_variant(quant_transform, "fx.quant_morph", "Quant Morph", "quant_morph")
    _register_variant(
        quant_transform, "fx.quant_table_lerp", "Quant Table Lerp", "quant_table_lerp"
    )

    # Surveillance — surveillance_sim (surveillance_cam/night_vision/infrared_thermal)
    _register_variant(
        surveillance_sim, "fx.surveillance_cam", "Surveillance Cam", "surveillance_cam"
    )
    _register_variant(
        surveillance_sim, "fx.night_vision", "Night Vision", "night_vision"
    )
    _register_variant(
        surveillance_sim, "fx.infrared_thermal", "Infrared Thermal", "infrared_thermal"
    )

    # Medical — medical_imaging (xray/ultrasound/mri/ct_windowing/pet_scan/microscope)
    _register_variant(medical_imaging, "fx.xray", "X-Ray", "xray")
    _register_variant(medical_imaging, "fx.ultrasound", "Ultrasound", "ultrasound")
    _register_variant(medical_imaging, "fx.mri", "MRI", "mri")
    _register_variant(
        medical_imaging, "fx.ct_windowing", "CT Windowing", "ct_windowing"
    )
    _register_variant(medical_imaging, "fx.pet_scan", "PET Scan", "pet_scan")
    _register_variant(medical_imaging, "fx.microscope", "Microscope", "microscope")

    # Optics — lens_distortion (fisheye/anamorphic/coma)
    _register_variant(lens_distortion, "fx.fisheye", "Fisheye", "fisheye")
    _register_variant(lens_distortion, "fx.anamorphic", "Anamorphic", "anamorphic")
    _register_variant(lens_distortion, "fx.coma", "Coma", "coma")

    # Misc — spectral_analysis (spectral_paint/harmonic_percussive/wavelet_split)
    _register_variant(
        spectral_analysis, "fx.spectral_paint", "Spectral Paint", "spectral_paint"
    )
    _register_variant(
        spectral_analysis,
        "fx.harmonic_percussive",
        "Harmonic Percussive",
        "harmonic_percussive",
    )
    _register_variant(
        spectral_analysis, "fx.wavelet_split", "Wavelet Split", "wavelet_split"
    )

    # Phase 12 — subliminal variants (flash_insert/channel_embed/second_source)
    _register_variant(
        subliminal, "fx.subliminal_flash", "Subliminal Flash", "flash_insert"
    )
    _register_variant(
        subliminal, "fx.subliminal_embed", "Subliminal Embed", "channel_embed"
    )
    _register_variant(
        subliminal, "fx.subliminal_spray", "Subliminal Spray", "second_source"
    )

    # v1 name alias — dropout → frame_drop
    register(
        "fx.dropout",
        frame_drop.apply,
        frame_drop.PARAMS,
        "Dropout",
        frame_drop.EFFECT_CATEGORY,
    )


_auto_register()
