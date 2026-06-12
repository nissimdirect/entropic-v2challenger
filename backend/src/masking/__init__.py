"""Creatrix masking subsystem — MK.1 (matte data model + cache + persistence).

Public surface:
  masking.schema      — MatteNode dataclass, validate_stack, MAX_MATTE_NODES_PER_CLIP
  masking.matte_source — rasterize(), cache_stats(), apply_sg8_pressure()
  masking.stack       — resolve_stack(), register_evaluator(), FrameCtx
"""

from masking.schema import MatteNode, validate_stack, MAX_MATTE_NODES_PER_CLIP
from masking.matte_source import (
    rasterize,
    cache_stats,
    apply_sg8_pressure,
    MATTE_CACHE_MAX_ENTRIES,
    MATTE_CACHE_MAX_BYTES,
)
from masking.stack import (
    resolve_stack,
    register_evaluator,
    FrameCtx,
    MAX_PROCEDURAL_MATTES_PER_RENDER,
    ProceduralMatteBudgetError,
)

# MK.8: register the chroma/luma procedural matte evaluators on package import
# so a render touching a key node finds its evaluator wired up.
from masking.key_kernels import register_key_evaluators as _register_key_evaluators

_register_key_evaluators()

__all__ = [
    "MatteNode",
    "validate_stack",
    "MAX_MATTE_NODES_PER_CLIP",
    "rasterize",
    "cache_stats",
    "apply_sg8_pressure",
    "MATTE_CACHE_MAX_ENTRIES",
    "MATTE_CACHE_MAX_BYTES",
    "resolve_stack",
    "register_evaluator",
    "FrameCtx",
    "MAX_PROCEDURAL_MATTES_PER_RENDER",
    "ProceduralMatteBudgetError",
]
