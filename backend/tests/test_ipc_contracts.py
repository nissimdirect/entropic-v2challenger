"""IPC contract tests — validate that apply_chain() correctly consumes snake_case
fields from the chain dict, matching what the frontend serialises over ZMQ.

These tests exercise the contract at the pipeline level (not through ZMQ transport)
so they run without a server process and without the auth token dependency.

Contract:
  Frontend serialises effect instances as:
    { "effect_id": str, "enabled": bool, "params": dict }
  apply_chain() reads: effect_instance.get("effect_id")
                       effect_instance.get("params", {})
                       effect_instance.get("enabled", True)
"""

import numpy as np
import pytest

from engine.pipeline import apply_chain

pytestmark = pytest.mark.smoke


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _frame_1080p() -> np.ndarray:
    """Create a deterministic 1920x1080 RGBA uint8 frame."""
    rng = np.random.default_rng(0)
    return rng.integers(0, 256, (1080, 1920, 4), dtype=np.uint8)


def _frame_small() -> np.ndarray:
    """Create a small deterministic RGBA uint8 frame for fast tests."""
    rng = np.random.default_rng(0)
    return rng.integers(0, 256, (64, 64, 4), dtype=np.uint8)


_KWARGS = dict(project_seed=0, frame_index=0, resolution=(64, 64))
_KWARGS_1080 = dict(project_seed=0, frame_index=0, resolution=(1920, 1080))


# ---------------------------------------------------------------------------
# Test: camelCase field names produce unknown-effect error
# ---------------------------------------------------------------------------


def test_render_frame_camelcase_chain_fails():
    """camelCase field names should produce 'unknown effect' error.

    The frontend must serialise as snake_case.  If it accidentally sends
    camelCase (effectId), effect_id resolves to None and pipeline raises
    ValueError('unknown effect: None').
    """
    frame = _frame_small()
    # effectId is camelCase — pipeline reads effect_instance.get("effect_id") → None
    chain = [{"effectId": "fx.invert", "params": {}, "enabled": True}]

    with pytest.raises(ValueError, match="unknown effect"):
        apply_chain(frame, chain, **_KWARGS)


# ---------------------------------------------------------------------------
# Test: snake_case field names succeed and produce a valid output frame
# ---------------------------------------------------------------------------


def test_render_frame_snakecase_chain_succeeds():
    """snake_case field names should produce a valid output frame.

    This is the positive-path contract: the exact keys the frontend must send.
    """
    frame = _frame_small()
    chain = [{"effect_id": "fx.invert", "params": {}, "enabled": True}]

    output, states = apply_chain(frame, chain, **_KWARGS)

    assert output.shape == frame.shape, "Output shape must match input"
    assert output.dtype == np.uint8, "Output dtype must be uint8"
    # Invert: RGB channels must all be flipped
    np.testing.assert_array_equal(
        output[:, :, :3],
        255 - frame[:, :, :3],
        err_msg="snake_case chain: invert output incorrect",
    )
    # State dict should contain an entry for the effect
    assert "fx.invert" in states


# ---------------------------------------------------------------------------
# Test: missing effect_id raises ValueError
# ---------------------------------------------------------------------------


def test_render_frame_missing_effect_id_fails():
    """Chain item with no effect_id key should raise ValueError.

    When effect_id is absent, get("effect_id") returns None.
    The registry lookup for None returns None, which triggers the
    'unknown effect' error.
    """
    frame = _frame_small()
    # No effect_id key at all
    chain = [{"params": {}, "enabled": True}]

    with pytest.raises(ValueError, match="unknown effect"):
        apply_chain(frame, chain, **_KWARGS)


# ---------------------------------------------------------------------------
# Test: missing effect_id with explicit None raises ValueError
# ---------------------------------------------------------------------------


def test_render_frame_explicit_none_effect_id_fails():
    """effect_id=None should raise ValueError('unknown effect: None')."""
    frame = _frame_small()
    chain = [{"effect_id": None, "params": {}, "enabled": True}]

    with pytest.raises(ValueError, match="unknown effect"):
        apply_chain(frame, chain, **_KWARGS)


# ---------------------------------------------------------------------------
# Test: extra fields alongside correct snake_case are silently ignored
# ---------------------------------------------------------------------------


def test_render_frame_extra_fields_ignored():
    """Extra fields (like effectId alongside effect_id) should be ignored safely.

    The pipeline only reads effect_id, params, and enabled.  Any other keys
    are ignored — the chain item is still processed correctly.
    """
    frame = _frame_small()
    chain = [
        {
            "effect_id": "fx.invert",  # correct snake_case key
            "effectId": "fx.noise",  # stale camelCase duplicate — ignored
            "extra_field": "should be dropped",
            "params": {},
            "enabled": True,
        }
    ]

    output, states = apply_chain(frame, chain, **_KWARGS)

    # Must succeed and apply invert (not noise)
    assert output.shape == frame.shape
    assert output.dtype == np.uint8
    np.testing.assert_array_equal(
        output[:, :, :3],
        255 - frame[:, :, :3],
        err_msg="Extra fields caused wrong effect to run",
    )


# ---------------------------------------------------------------------------
# Test: enabled=False skips the effect — output equals input
# ---------------------------------------------------------------------------


def test_render_frame_disabled_effect_skipped():
    """Chain item with enabled=False must be skipped entirely."""
    frame = _frame_small()
    chain = [{"effect_id": "fx.invert", "params": {}, "enabled": False}]

    output, states = apply_chain(frame, chain, **_KWARGS)

    np.testing.assert_array_equal(
        output, frame, err_msg="Disabled effect modified frame"
    )
    # Disabled items leave no state entry
    assert "fx.invert" not in states


# ---------------------------------------------------------------------------
# Test: enabled key absent defaults to True (effect runs)
# ---------------------------------------------------------------------------


def test_render_frame_missing_enabled_defaults_true():
    """Missing 'enabled' key should default to True (effect executes)."""
    frame = _frame_small()
    chain = [{"effect_id": "fx.invert", "params": {}}]  # no "enabled" key

    output, states = apply_chain(frame, chain, **_KWARGS)

    # Invert must have run
    np.testing.assert_array_equal(
        output[:, :, :3],
        255 - frame[:, :, :3],
        err_msg="Missing 'enabled' key: effect did not run",
    )


# ---------------------------------------------------------------------------
# Test: multi-item snake_case chain all execute in order
# ---------------------------------------------------------------------------


def test_render_frame_multi_item_snakecase_chain():
    """All snake_case items in a multi-effect chain execute in order."""
    frame = _frame_small()
    chain = [
        {"effect_id": "fx.invert", "params": {}, "enabled": True},
        {"effect_id": "fx.invert", "params": {}, "enabled": True},
    ]

    output, states = apply_chain(frame, chain, **_KWARGS)

    # Double invert cancels out: output should equal input
    np.testing.assert_array_equal(
        output,
        frame,
        err_msg="Double invert chain did not cancel out",
    )
    assert "fx.invert" in states


# ---------------------------------------------------------------------------
# Test: params dict is forwarded correctly to the effect
# ---------------------------------------------------------------------------


def test_render_frame_params_forwarded():
    """params dict values must reach the effect function."""
    frame = _frame_small()
    # blur with radius 0 returns the frame unchanged
    chain = [{"effect_id": "fx.blur", "params": {"radius": 0.0}, "enabled": True}]

    output, _ = apply_chain(frame, chain, **_KWARGS)

    np.testing.assert_array_equal(
        output,
        frame,
        err_msg="fx.blur with radius=0 should not modify the frame",
    )


# ---------------------------------------------------------------------------
# Test: mixed enabled/disabled chain processes only enabled items
# ---------------------------------------------------------------------------


def test_render_frame_mixed_enabled_disabled():
    """Only enabled items in a mixed chain should be applied."""
    frame = _frame_small()
    chain = [
        {"effect_id": "fx.invert", "params": {}, "enabled": True},  # runs
        {"effect_id": "fx.invert", "params": {}, "enabled": False},  # skipped
    ]

    output, _ = apply_chain(frame, chain, **_KWARGS)

    # Only one invert ran; output should be inverted
    np.testing.assert_array_equal(
        output[:, :, :3],
        255 - frame[:, :, :3],
        err_msg="Mixed chain: second disabled invert should not cancel out the first",
    )
