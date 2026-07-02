#!/usr/bin/env python3
"""Generate factory presets for Entropic v2 Challenger.

Outputs 60 .glitchpreset files to resources/presets/factory/:
  - 50 single-effect presets (10 per category)
  - 10 chain presets (curated multi-effect combos)
"""

import json
import uuid
from pathlib import Path

OUTPUT_DIR = Path(__file__).parent.parent / "resources" / "presets" / "factory"


def make_preset(name, preset_type, tags, effect_data=None, chain_data=None):
    return {
        "id": f"factory-{uuid.uuid4().hex[:8]}",
        "name": name,
        "type": preset_type,
        "created": 1710460800000,  # 2024-03-15T00:00:00Z
        "tags": tags,
        "isFavorite": False,
        **({"effectData": effect_data} if effect_data else {}),
        **({"chainData": chain_data} if chain_data else {}),
    }


# --- Single Effect Presets ---

SINGLE_EFFECTS = {
    "color": [
        ("Neon Pop", "fx.posterize", {"levels": 4}),
        ("Warm Shift", "fx.hue_shift", {"shift": 30}),
        ("Cool Wash", "fx.hue_shift", {"shift": 200}),
        ("Sepia Dream", "fx.color_balance", {"red": 0.2, "green": 0.1, "blue": -0.1}),
        ("Invert Chaos", "fx.invert", {}),
        ("Saturate Max", "fx.saturation", {"amount": 2.0}),
        ("Desaturate", "fx.saturation", {"amount": 0.0}),
        ("High Contrast", "fx.levels", {"black": 0.2, "white": 0.8}),
        ("Low Key", "fx.levels", {"black": 0.3, "white": 0.7, "gamma": 0.6}),
        ("Color Burn", "fx.posterize", {"levels": 2}),
    ],
    "glitch": [
        ("Pixel Storm", "fx.pixelate", {"block_size": 8}),
        ("Blocky", "fx.pixelate", {"block_size": 16}),
        ("Mega Blocks", "fx.pixelate", {"block_size": 32}),
        ("Scan Lines", "fx.scanlines", {"spacing": 4, "intensity": 0.6}),
        ("Heavy Scan", "fx.scanlines", {"spacing": 2, "intensity": 0.9}),
        ("RGB Split", "fx.chromatic_aberration", {"offset": 5}),
        ("Extreme Split", "fx.chromatic_aberration", {"offset": 15}),
        ("Noise Grain", "fx.noise", {"amount": 0.3}),
        ("Heavy Noise", "fx.noise", {"amount": 0.7}),
        ("Digital Rain", "fx.noise", {"amount": 0.5}),
    ],
    "temporal": [
        ("Soft Blur", "fx.blur", {"radius": 3}),
        ("Heavy Blur", "fx.blur", {"radius": 10}),
        ("Edge Detect", "fx.edge_detect", {}),
        ("Sharpen", "fx.sharpen", {"amount": 1.5}),
        ("Over Sharpen", "fx.sharpen", {"amount": 3.0}),
        ("Emboss Light", "fx.emboss", {"strength": 0.5}),
        ("Emboss Heavy", "fx.emboss", {"strength": 1.0}),
        ("Motion Blur H", "fx.blur", {"radius": 8}),
        ("Gaussian Soft", "fx.blur", {"radius": 5}),
        ("Crystal Edge", "fx.edge_detect", {}),
    ],
    "destruction": [
        ("Solarize", "fx.solarize", {"threshold": 128}),
        ("High Solar", "fx.solarize", {"threshold": 64}),
        ("Threshold BW", "fx.threshold", {"level": 128}),
        ("Low Threshold", "fx.threshold", {"level": 64}),
        ("Bit Crush 4", "fx.posterize", {"levels": 4}),
        ("Bit Crush 2", "fx.posterize", {"levels": 2}),
        ("Dither", "fx.posterize", {"levels": 3}),
        ("Overexpose", "fx.levels", {"white": 0.5, "gamma": 2.0}),
        ("Underexpose", "fx.levels", {"black": 0.5, "gamma": 0.3}),
        ("Blown Out", "fx.levels", {"white": 0.3, "gamma": 3.0}),
    ],
    "physics": [
        ("Wave Distort", "fx.wave", {"amplitude": 10, "frequency": 5}),
        ("Ripple", "fx.wave", {"amplitude": 5, "frequency": 10}),
        ("Ocean Wave", "fx.wave", {"amplitude": 20, "frequency": 3}),
        ("Micro Shake", "fx.wave", {"amplitude": 2, "frequency": 20}),
        ("Mirror H", "fx.mirror", {"axis": "horizontal"}),
        ("Mirror V", "fx.mirror", {"axis": "vertical"}),
        ("Kaleidoscope", "fx.mirror", {"axis": "horizontal"}),
        ("Tile 2x2", "fx.pixelate", {"block_size": 4}),
        ("Subtle Warp", "fx.wave", {"amplitude": 3, "frequency": 8}),
        ("Earthquake", "fx.wave", {"amplitude": 15, "frequency": 15}),
    ],
}

# --- Chain Presets ---

CHAIN_PRESETS = [
    (
        "VHS Nostalgia",
        ["glitch", "color", "temporal"],
        [
            {
                "effectId": "fx.chromatic_aberration",
                "parameters": {"offset": 3},
                "modulations": {},
            },
            {
                "effectId": "fx.scanlines",
                "parameters": {"spacing": 3, "intensity": 0.4},
                "modulations": {},
            },
            {"effectId": "fx.noise", "parameters": {"amount": 0.15}, "modulations": {}},
        ],
    ),
    (
        "Cyberpunk Neon",
        ["color", "glitch"],
        [
            {
                "effectId": "fx.posterize",
                "parameters": {"levels": 5},
                "modulations": {},
            },
            {
                "effectId": "fx.hue_shift",
                "parameters": {"shift": 280},
                "modulations": {},
            },
            {
                "effectId": "fx.sharpen",
                "parameters": {"amount": 2.0},
                "modulations": {},
            },
        ],
    ),
    (
        "Dream Sequence",
        ["temporal", "color"],
        [
            {"effectId": "fx.blur", "parameters": {"radius": 4}, "modulations": {}},
            {
                "effectId": "fx.saturation",
                "parameters": {"amount": 1.5},
                "modulations": {},
            },
            {
                "effectId": "fx.hue_shift",
                "parameters": {"shift": 15},
                "modulations": {},
            },
        ],
    ),
    (
        "Surveillance",
        ["glitch", "destruction"],
        [
            {
                "effectId": "fx.pixelate",
                "parameters": {"block_size": 4},
                "modulations": {},
            },
            {
                "effectId": "fx.scanlines",
                "parameters": {"spacing": 2, "intensity": 0.7},
                "modulations": {},
            },
            {"effectId": "fx.noise", "parameters": {"amount": 0.3}, "modulations": {}},
        ],
    ),
    (
        "Acid Trip",
        ["color", "physics"],
        [
            {"effectId": "fx.invert", "parameters": {}, "modulations": {}},
            {
                "effectId": "fx.wave",
                "parameters": {"amplitude": 8, "frequency": 6},
                "modulations": {},
            },
            {
                "effectId": "fx.posterize",
                "parameters": {"levels": 6},
                "modulations": {},
            },
        ],
    ),
    (
        "Film Grain",
        ["temporal", "subtle"],
        [
            {"effectId": "fx.noise", "parameters": {"amount": 0.1}, "modulations": {}},
            {
                "effectId": "fx.levels",
                "parameters": {"black": 0.05, "white": 0.95},
                "modulations": {},
            },
        ],
    ),
    (
        "Datamosh Lite",
        ["glitch", "destruction"],
        [
            {
                "effectId": "fx.pixelate",
                "parameters": {"block_size": 6},
                "modulations": {},
            },
            {
                "effectId": "fx.chromatic_aberration",
                "parameters": {"offset": 8},
                "modulations": {},
            },
        ],
    ),
    (
        "Noir",
        ["color", "temporal"],
        [
            {
                "effectId": "fx.saturation",
                "parameters": {"amount": 0.0},
                "modulations": {},
            },
            {
                "effectId": "fx.levels",
                "parameters": {"black": 0.15, "white": 0.85, "gamma": 0.8},
                "modulations": {},
            },
            {
                "effectId": "fx.sharpen",
                "parameters": {"amount": 1.2},
                "modulations": {},
            },
        ],
    ),
    (
        "Glitch Stack",
        ["glitch"],
        [
            {
                "effectId": "fx.chromatic_aberration",
                "parameters": {"offset": 10},
                "modulations": {},
            },
            {
                "effectId": "fx.scanlines",
                "parameters": {"spacing": 3, "intensity": 0.5},
                "modulations": {},
            },
            {
                "effectId": "fx.pixelate",
                "parameters": {"block_size": 3},
                "modulations": {},
            },
            {"effectId": "fx.noise", "parameters": {"amount": 0.2}, "modulations": {}},
        ],
    ),
    (
        "Thermal Vision",
        ["color", "destruction"],
        [
            {"effectId": "fx.edge_detect", "parameters": {}, "modulations": {}},
            {"effectId": "fx.invert", "parameters": {}, "modulations": {}},
            {
                "effectId": "fx.hue_shift",
                "parameters": {"shift": 120},
                "modulations": {},
            },
        ],
    ),
]


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    count = 0

    # Generate single-effect presets
    for category, effects in SINGLE_EFFECTS.items():
        for name, effect_id, params in effects:
            preset = make_preset(
                name=name,
                preset_type="single_effect",
                tags=[category],
                effect_data={
                    "effectId": effect_id,
                    "parameters": params,
                    "modulations": {},
                },
            )
            path = OUTPUT_DIR / f"{preset['id']}.glitchpreset"
            path.write_text(json.dumps(preset, indent=2))
            count += 1

    # Generate chain presets
    for name, tags, effects in CHAIN_PRESETS:
        chain_effects = []
        for eff in effects:
            chain_effects.append(
                {
                    "id": f"eff-{uuid.uuid4().hex[:8]}",
                    "effectId": eff["effectId"],
                    "isEnabled": True,
                    "isFrozen": False,
                    "parameters": eff["parameters"],
                    "modulations": eff["modulations"],
                    "mix": 1,
                    "mask": None,
                }
            )
        preset = make_preset(
            name=name,
            preset_type="effect_chain",
            tags=["chain", *tags],
            chain_data={
                "effects": chain_effects,
                "macros": [],
            },
        )
        path = OUTPUT_DIR / f"{preset['id']}.glitchpreset"
        path.write_text(json.dumps(preset, indent=2))
        count += 1

    print(f"Generated {count} factory presets in {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
