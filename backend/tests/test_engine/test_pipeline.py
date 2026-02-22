"""Tests for engine.pipeline — chain execution, ordering, SEC-7 cap."""

import numpy as np
import pytest

from engine.pipeline import MAX_CHAIN_DEPTH, apply_chain


def _frame(h=100, w=100):
    rng = np.random.default_rng(42)
    return rng.integers(0, 256, (h, w, 4), dtype=np.uint8)


def test_single_effect_chain():
    """Single invert in chain produces inverted output."""
    frame = _frame()
    chain = [{"effect_id": "fx.invert", "params": {}}]
    output, states = apply_chain(
        frame, chain, project_seed=42, frame_index=0, resolution=(100, 100)
    )
    assert output.shape == frame.shape
    assert output.dtype == np.uint8
    # Invert: RGB should be 255 - original
    np.testing.assert_array_equal(output[:, :, 0], 255 - frame[:, :, 0])


def test_three_effect_chain():
    """Three effects in chain all apply sequentially."""
    frame = _frame()
    chain = [
        {"effect_id": "fx.invert", "params": {}},
        {"effect_id": "fx.invert", "params": {}},
        {"effect_id": "fx.invert", "params": {}},
    ]
    output, states = apply_chain(
        frame, chain, project_seed=42, frame_index=0, resolution=(100, 100)
    )
    # Three inversions = one inversion (odd number)
    np.testing.assert_array_equal(output[:, :, 0], 255 - frame[:, :, 0])


def test_order_matters():
    """A -> B != B -> A when effects are not commutative."""
    frame = _frame()
    # invert + posterize vs posterize + invert
    chain_ab = [
        {"effect_id": "fx.invert", "params": {}},
        {"effect_id": "fx.posterize", "params": {"levels": 4}},
    ]
    chain_ba = [
        {"effect_id": "fx.posterize", "params": {"levels": 4}},
        {"effect_id": "fx.invert", "params": {}},
    ]
    out_ab, _ = apply_chain(
        frame, chain_ab, project_seed=42, frame_index=0, resolution=(100, 100)
    )
    out_ba, _ = apply_chain(
        frame, chain_ba, project_seed=42, frame_index=0, resolution=(100, 100)
    )
    assert not np.array_equal(out_ab, out_ba)


def test_empty_chain_returns_original():
    """Empty chain returns the original frame unmodified."""
    frame = _frame()
    output, states = apply_chain(
        frame, [], project_seed=42, frame_index=0, resolution=(100, 100)
    )
    np.testing.assert_array_equal(output, frame)


def test_disabled_effect_skipped():
    """Disabled effects are skipped."""
    frame = _frame()
    chain = [{"effect_id": "fx.invert", "params": {}, "enabled": False}]
    output, _ = apply_chain(
        frame, chain, project_seed=42, frame_index=0, resolution=(100, 100)
    )
    np.testing.assert_array_equal(output, frame)


def test_sec7_cap_enforced():
    """Chain exceeding MAX_CHAIN_DEPTH raises ValueError (SEC-7)."""
    frame = _frame()
    chain = [
        {"effect_id": "fx.invert", "params": {}} for _ in range(MAX_CHAIN_DEPTH + 1)
    ]
    with pytest.raises(ValueError, match="SEC-7"):
        apply_chain(frame, chain, project_seed=42, frame_index=0, resolution=(100, 100))


def test_sec7_at_limit_succeeds():
    """Chain at exactly MAX_CHAIN_DEPTH succeeds."""
    frame = _frame()
    chain = [{"effect_id": "fx.invert", "params": {}} for _ in range(MAX_CHAIN_DEPTH)]
    output, _ = apply_chain(
        frame, chain, project_seed=42, frame_index=0, resolution=(100, 100)
    )
    assert output.shape == frame.shape


def test_unknown_effect_raises():
    """Unknown effect ID raises ValueError."""
    frame = _frame()
    chain = [{"effect_id": "fx.nonexistent", "params": {}}]
    with pytest.raises(ValueError, match="unknown effect"):
        apply_chain(frame, chain, project_seed=42, frame_index=0, resolution=(100, 100))
