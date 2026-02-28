"""Effect registry — central lookup for all registered effects."""

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
    )
    from effects.util import (
        levels,
        curves,
        hsl_adjust,
        color_balance,
        auto_levels,
    )

    for mod in [
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
    ]:
        register(
            mod.EFFECT_ID, mod.apply, mod.PARAMS, mod.EFFECT_NAME, mod.EFFECT_CATEGORY
        )


_auto_register()
