"""V6: Determinism Test — same inputs always produce byte-identical output."""

import numpy as np

from effects.fx.invert import apply as invert_apply
from engine.container import EffectContainer


def test_v6_determinism_byte_identical():
    """Run fx.invert on same frame with same seed twice.
    PASS: np.array_equal(result1, result2) == True"""
    container = EffectContainer(invert_apply, "fx.invert")
    rng = np.random.default_rng(42)
    frame = rng.integers(0, 256, (480, 640, 4), dtype=np.uint8)
    params = {"_mix": 0.75}
    kwargs = {"frame_index": 10, "project_seed": 999, "resolution": (640, 480)}

    result1, state1 = container.process(frame, params, None, **kwargs)
    result2, state2 = container.process(frame, params, None, **kwargs)

    assert np.array_equal(result1, result2), "Determinism violation: results differ"
    assert state1 == state2, "Determinism violation: states differ"


def test_v6_determinism_across_seeds():
    """Different project seeds must produce different results (when effect uses rng)."""
    # For fx.invert this doesn't matter (it's deterministic without rng),
    # but the container should produce different seeds
    from engine.determinism import derive_seed

    seed_a = derive_seed(100, "fx.invert", 0)
    seed_b = derive_seed(200, "fx.invert", 0)
    assert seed_a != seed_b, (
        "Different project seeds should yield different derived seeds"
    )
