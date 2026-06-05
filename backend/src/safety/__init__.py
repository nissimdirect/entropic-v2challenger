"""Safety contracts package.

SG-1 (GPU resource lifetime) lands here first; later safety gates
(memory pressure, latent sentinel, etc.) join as sibling modules.
"""

from .gpu_resources import (
    DestroyedHandleError,
    EvictionPolicy,
    GlobalPoolRegistry,
    GPUResource,
    GPUResourcePool,
    MockGPUResource,
    PoolExhausted,
    global_pool_registry,
)

__all__ = [
    "DestroyedHandleError",
    "EvictionPolicy",
    "GlobalPoolRegistry",
    "GPUResource",
    "GPUResourcePool",
    "MockGPUResource",
    "PoolExhausted",
    "global_pool_registry",
]
