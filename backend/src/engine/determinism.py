"""Seeded determinism for effect reproducibility."""

import hashlib
import numpy as np


def derive_seed(
    project_seed: int, effect_id: str, frame_index: int, user_seed: int = 0
) -> int:
    """Derive a deterministic seed from context. Same inputs = same output, always."""
    key = f"{project_seed}:{effect_id}:{frame_index}:{user_seed}"
    return int(hashlib.sha256(key.encode()).hexdigest()[:16], 16)


def make_rng(seed: int) -> np.random.Generator:
    """Create a seeded RNG from a derived seed."""
    return np.random.default_rng(seed)
