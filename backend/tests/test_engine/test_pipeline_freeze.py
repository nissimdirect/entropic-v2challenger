"""Tests for pipeline.apply_chain freeze_cut/freeze_frame short-circuit."""

import numpy as np
import pytest

pytestmark = pytest.mark.smoke

from engine.pipeline import apply_chain


def _frame(h=100, w=100):
    rng = np.random.default_rng(42)
    return rng.integers(0, 256, (h, w, 4), dtype=np.uint8)


def test_apply_chain_with_freeze_cut():
    """With freeze_cut, only effects after the cut index are applied."""
    frame = _frame()

    # Chain: invert (0) → posterize (1) → invert (2)
    chain = [
        {"effect_id": "fx.invert", "params": {}},
        {"effect_id": "fx.posterize", "params": {"levels": 4}},
        {"effect_id": "fx.invert", "params": {}},
    ]

    # Pretend we froze effects 0 and 1 — provide a "cached" frame
    # and set freeze_cut=1 so only effect 2 (invert) runs
    cached_frame = np.full((100, 100, 4), 128, dtype=np.uint8)

    output, _ = apply_chain(
        frame,
        chain,
        project_seed=42,
        frame_index=0,
        resolution=(100, 100),
        freeze_cut=1,
        freeze_frame=cached_frame,
    )

    # Effect 2 is invert: 255 - 128 = 127
    np.testing.assert_array_equal(output[:, :, 0], 127)
    np.testing.assert_array_equal(output[:, :, 1], 127)
    np.testing.assert_array_equal(output[:, :, 2], 127)


def test_apply_chain_no_freeze():
    """Existing behavior unchanged when freeze params are None (regression)."""
    frame = _frame()
    chain = [{"effect_id": "fx.invert", "params": {}}]

    output, _ = apply_chain(
        frame, chain, project_seed=42, frame_index=0, resolution=(100, 100)
    )

    # Invert should flip RGB channels
    np.testing.assert_array_equal(output[:, :, 0], 255 - frame[:, :, 0])


def test_freeze_cut_skips_all_effects():
    """If freeze_cut >= last index, no effects run — cached frame returned as-is."""
    frame = _frame()
    cached = np.full((100, 100, 4), 42, dtype=np.uint8)

    chain = [
        {"effect_id": "fx.invert", "params": {}},
        {"effect_id": "fx.posterize", "params": {"levels": 4}},
    ]

    output, _ = apply_chain(
        frame,
        chain,
        project_seed=42,
        frame_index=0,
        resolution=(100, 100),
        freeze_cut=1,  # cut at last effect
        freeze_frame=cached,
    )

    # No effects after cut → output is the cached frame
    np.testing.assert_array_equal(output, cached)


def test_freeze_cut_zero_runs_rest():
    """freeze_cut=0 skips only effect 0, runs everything after."""
    frame = _frame()
    cached = np.full((100, 100, 4), 200, dtype=np.uint8)

    chain = [
        {"effect_id": "fx.posterize", "params": {"levels": 4}},
        {"effect_id": "fx.invert", "params": {}},
    ]

    output, _ = apply_chain(
        frame,
        chain,
        project_seed=42,
        frame_index=0,
        resolution=(100, 100),
        freeze_cut=0,
        freeze_frame=cached,
    )

    # Effect 1 (invert) on cached frame: 255 - 200 = 55
    np.testing.assert_array_equal(output[:, :, 0], 55)


def test_freeze_cut_preserves_frozen_state():
    """State for frozen effects is carried forward in new_states."""
    frame = _frame()
    cached = np.full((100, 100, 4), 128, dtype=np.uint8)

    chain = [
        {"effect_id": "fx.posterize", "params": {"levels": 4}},
        {"effect_id": "fx.invert", "params": {}},
    ]

    # Simulate prior state for frozen effect
    prior_states = {"fx.posterize": {"some_key": "some_value"}}

    _, new_states = apply_chain(
        frame,
        chain,
        project_seed=42,
        frame_index=0,
        resolution=(100, 100),
        states=prior_states,
        freeze_cut=0,
        freeze_frame=cached,
    )

    # Frozen effect's state should be preserved in new_states
    assert "fx.posterize" in new_states
    assert new_states["fx.posterize"] == {"some_key": "some_value"}
