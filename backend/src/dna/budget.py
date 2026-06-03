"""SG-2 resource budget descriptor (SPEC-3 §2 + SPEC-6).

Every `.dna` patch declares its resource expectations. The runtime
checks them at load time and refuses to instantiate patches whose
declared budget exceeds the current device's capacity.

Budget shape:
  {
    "estimated_memory_mb": int,
    "estimated_gpu_textures": int,
    "estimated_grains": int,
    "requires_l_backbones": list[str],   // e.g. ["dinov2", "clip"]
    "min_apple_silicon_tier": str | null  // "M1", "M2_Max", "M3_Max", or null
  }
"""

from __future__ import annotations

from dataclasses import dataclass, asdict, field

# Reasonable defaults for a Tier 1 patch
DEFAULT_BUDGET_MEMORY_MB = 256
DEFAULT_BUDGET_TEXTURES = 16
DEFAULT_BUDGET_GRAINS = 0


@dataclass(frozen=True)
class BudgetDescriptor:
    estimated_memory_mb: int = DEFAULT_BUDGET_MEMORY_MB
    estimated_gpu_textures: int = DEFAULT_BUDGET_TEXTURES
    estimated_grains: int = DEFAULT_BUDGET_GRAINS
    requires_l_backbones: tuple[str, ...] = field(default_factory=tuple)
    min_apple_silicon_tier: str | None = None

    def to_dict(self) -> dict:
        return {
            "estimated_memory_mb": self.estimated_memory_mb,
            "estimated_gpu_textures": self.estimated_gpu_textures,
            "estimated_grains": self.estimated_grains,
            "requires_l_backbones": list(self.requires_l_backbones),
            "min_apple_silicon_tier": self.min_apple_silicon_tier,
        }


def default_budget() -> BudgetDescriptor:
    return BudgetDescriptor()


KNOWN_L_BACKBONES = frozenset({"dinov2", "clip", "clap"})
KNOWN_APPLE_SILICON_TIERS = frozenset({"M1", "M2", "M2_Max", "M3", "M3_Max"})


def validate_budget(raw: dict) -> BudgetDescriptor:
    """Validate a budget dict from a `.dna` patch. Raises ValueError on bad input."""
    if not isinstance(raw, dict):
        raise ValueError(f"budget must be a dict, got {type(raw)}")

    mem = raw.get("estimated_memory_mb", DEFAULT_BUDGET_MEMORY_MB)
    textures = raw.get("estimated_gpu_textures", DEFAULT_BUDGET_TEXTURES)
    grains = raw.get("estimated_grains", DEFAULT_BUDGET_GRAINS)

    if not isinstance(mem, int) or mem < 0:
        raise ValueError(f"estimated_memory_mb must be non-negative int, got {mem!r}")
    if not isinstance(textures, int) or textures < 0:
        raise ValueError(
            f"estimated_gpu_textures must be non-negative int, got {textures!r}"
        )
    if not isinstance(grains, int) or grains < 0:
        raise ValueError(f"estimated_grains must be non-negative int, got {grains!r}")

    backbones = raw.get("requires_l_backbones", [])
    if not isinstance(backbones, list):
        raise ValueError(f"requires_l_backbones must be a list, got {type(backbones)}")
    for b in backbones:
        if b not in KNOWN_L_BACKBONES:
            raise ValueError(
                f"unknown L backbone {b!r}; known: {sorted(KNOWN_L_BACKBONES)}"
            )

    tier = raw.get("min_apple_silicon_tier")
    if tier is not None and tier not in KNOWN_APPLE_SILICON_TIERS:
        raise ValueError(
            f"unknown tier {tier!r}; known: {sorted(KNOWN_APPLE_SILICON_TIERS)}"
        )

    return BudgetDescriptor(
        estimated_memory_mb=mem,
        estimated_gpu_textures=textures,
        estimated_grains=grains,
        requires_l_backbones=tuple(backbones),
        min_apple_silicon_tier=tier,
    )
