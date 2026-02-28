"""Tests for engine.pipeline — chain execution, ordering, SEC-7 cap, mix, timeout guard, auto-disable."""

import os
import threading
import time

import numpy as np
import pytest

pytestmark = pytest.mark.smoke

from engine.pipeline import (
    DISABLE_THRESHOLD,
    EFFECT_ABORT_MS,
    EFFECT_WARN_MS,
    MAX_CHAIN_DEPTH,
    apply_chain,
    get_effect_health,
    reset_effect_health,
)


def _frame(h=100, w=100):
    rng = np.random.default_rng(42)
    return rng.integers(0, 256, (h, w, 4), dtype=np.uint8)


def test_single_effect_chain():
    """Single invert in chain produces inverted output."""
    frame = _frame()
    chain = [{"effect_id": "fx.invert", "params": {}}]
    output, _ = apply_chain(
        frame, chain, project_seed=42, frame_index=0, resolution=(100, 100)
    )
    assert output.shape == frame.shape
    assert output.dtype == np.uint8
    np.testing.assert_array_equal(output[:, :, 0], 255 - frame[:, :, 0])


def test_three_effect_chain():
    """Three effects in chain all apply sequentially."""
    frame = _frame()
    chain = [
        {"effect_id": "fx.invert", "params": {}},
        {"effect_id": "fx.invert", "params": {}},
        {"effect_id": "fx.invert", "params": {}},
    ]
    output, _ = apply_chain(
        frame, chain, project_seed=42, frame_index=0, resolution=(100, 100)
    )
    np.testing.assert_array_equal(output[:, :, 0], 255 - frame[:, :, 0])


def test_order_matters():
    """A -> B != B -> A when effects are not commutative."""
    frame = _frame()
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
    output, _ = apply_chain(
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


# --- Mix tests (P2 fix) ---


def test_mix_from_top_level_applied():
    """Top-level mix field is injected into params as _mix for EffectContainer."""
    frame = _frame()
    chain = [{"effect_id": "fx.invert", "params": {}, "mix": 0.0}]
    output, _ = apply_chain(
        frame, chain, project_seed=42, frame_index=0, resolution=(100, 100)
    )
    np.testing.assert_array_equal(output, frame)


def test_mix_half_blends():
    """mix=0.5 should produce a blend between dry and wet."""
    frame = _frame()
    chain_full = [{"effect_id": "fx.invert", "params": {}, "mix": 1.0}]
    chain_half = [{"effect_id": "fx.invert", "params": {}, "mix": 0.5}]
    out_full, _ = apply_chain(
        frame, chain_full, project_seed=42, frame_index=0, resolution=(100, 100)
    )
    out_half, _ = apply_chain(
        frame, chain_half, project_seed=42, frame_index=0, resolution=(100, 100)
    )
    assert not np.array_equal(out_half, frame)
    assert not np.array_equal(out_half, out_full)


def test_mix_default_is_fully_wet():
    """Without mix field, effect applies at full strength (mix=1.0 default)."""
    frame = _frame()
    chain_no_mix = [{"effect_id": "fx.invert", "params": {}}]
    chain_full = [{"effect_id": "fx.invert", "params": {}, "mix": 1.0}]
    out_no_mix, _ = apply_chain(
        frame, chain_no_mix, project_seed=42, frame_index=0, resolution=(100, 100)
    )
    out_full, _ = apply_chain(
        frame, chain_full, project_seed=42, frame_index=0, resolution=(100, 100)
    )
    np.testing.assert_array_equal(out_no_mix, out_full)


# --- Timeout guard tests (BUG-4 fix) ---


def test_timeout_constants():
    """BUG-4: verify timeout thresholds are exported and sane."""
    assert EFFECT_WARN_MS == 100
    assert EFFECT_ABORT_MS == 500
    assert EFFECT_WARN_MS < EFFECT_ABORT_MS


def test_slow_effect_returns_input_frame(monkeypatch):
    """BUG-4: if an effect exceeds EFFECT_ABORT_MS, return input frame unchanged."""
    frame = _frame()

    call_count = 0
    real_monotonic = time.monotonic

    def fake_monotonic():
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return 0.0
        elif call_count == 2:
            return 0.6  # 600ms > 500ms abort
        return real_monotonic()

    monkeypatch.setattr(time, "monotonic", fake_monotonic)

    chain = [{"effect_id": "fx.invert", "params": {}}]
    output, _ = apply_chain(
        frame, chain, project_seed=42, frame_index=0, resolution=(100, 100)
    )
    np.testing.assert_array_equal(output, frame)


def test_fast_effect_applies_normally(monkeypatch):
    """BUG-4: effects under EFFECT_WARN_MS apply normally."""
    frame = _frame()

    call_count = 0

    def fake_monotonic():
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return 0.0
        elif call_count == 2:
            return 0.010  # 10ms
        return 0.0

    monkeypatch.setattr(time, "monotonic", fake_monotonic)

    chain = [{"effect_id": "fx.invert", "params": {}}]
    output, _ = apply_chain(
        frame, chain, project_seed=42, frame_index=0, resolution=(100, 100)
    )
    np.testing.assert_array_equal(output[:, :, 0], 255 - frame[:, :, 0])


# --- Auto-disable tests (Item 2) ---


@pytest.fixture(autouse=True)
def _reset_health():
    """Reset health tracking between tests."""
    reset_effect_health()
    yield
    reset_effect_health()


def _ensure_debug_crash():
    """Register debug.crash effect if not already registered."""
    os.environ["APP_ENV"] = "development"
    from effects.fx import debug_crash
    from effects import registry

    if registry.get("debug.crash") is None:
        registry.register(
            debug_crash.EFFECT_ID,
            debug_crash.apply,
            debug_crash.PARAMS,
            debug_crash.EFFECT_NAME,
            debug_crash.EFFECT_CATEGORY,
        )


def test_effect_disabled_after_consecutive_failures():
    """Effect is disabled after DISABLE_THRESHOLD consecutive failures."""
    _ensure_debug_crash()
    frame = _frame()
    chain = [{"effect_id": "debug.crash", "params": {}}]

    for i in range(DISABLE_THRESHOLD):
        apply_chain(frame, chain, project_seed=42, frame_index=i, resolution=(100, 100))

    health = get_effect_health()
    assert "debug.crash" in health["disabled_effects"]


def test_success_resets_consecutive_counter():
    """Successful calls keep counter at 0 — invert never disabled."""
    frame = _frame()
    invert_chain = [{"effect_id": "fx.invert", "params": {}}]
    for i in range(5):
        apply_chain(
            frame, invert_chain, project_seed=42, frame_index=i, resolution=(100, 100)
        )

    health = get_effect_health()
    assert "fx.invert" not in health["disabled_effects"]
    assert health["failure_counts"].get("fx.invert", 0) == 0


def test_disabled_effect_is_skipped():
    """Auto-disabled effect is not called, remaining effects still run."""
    _ensure_debug_crash()
    frame = _frame()
    chain = [
        {"effect_id": "debug.crash", "params": {}},
        {"effect_id": "fx.invert", "params": {}},
    ]

    # Trigger disable
    for i in range(DISABLE_THRESHOLD):
        apply_chain(frame, chain, project_seed=42, frame_index=i, resolution=(100, 100))

    # Now debug.crash is disabled — should be skipped, only invert runs
    output, _ = apply_chain(
        frame, chain, project_seed=42, frame_index=99, resolution=(100, 100)
    )
    np.testing.assert_array_equal(output[:, :, 0], 255 - frame[:, :, 0])


def test_reset_effect_health_clears_state():
    """reset_effect_health() clears all tracking."""
    _ensure_debug_crash()
    frame = _frame()
    chain = [{"effect_id": "debug.crash", "params": {}}]
    for i in range(DISABLE_THRESHOLD):
        apply_chain(frame, chain, project_seed=42, frame_index=i, resolution=(100, 100))

    assert "debug.crash" in get_effect_health()["disabled_effects"]

    reset_effect_health()
    health = get_effect_health()
    assert health["disabled_effects"] == []
    assert health["failure_counts"] == {}


def test_non_failing_effects_unaffected():
    """Non-failing effects are not affected by neighbor's failures."""
    _ensure_debug_crash()
    frame = _frame()
    chain = [
        {"effect_id": "debug.crash", "params": {}},
        {"effect_id": "fx.invert", "params": {}},
    ]

    for i in range(DISABLE_THRESHOLD + 1):
        apply_chain(frame, chain, project_seed=42, frame_index=i, resolution=(100, 100))

    health = get_effect_health()
    assert "debug.crash" in health["disabled_effects"]
    assert "fx.invert" not in health["disabled_effects"]
    assert health["failure_counts"].get("fx.invert", 0) == 0


def test_all_effects_disabled_returns_raw_frame():
    """If all effects in chain are disabled, returns the raw input frame."""
    _ensure_debug_crash()
    frame = _frame()
    chain = [{"effect_id": "debug.crash", "params": {}}]

    for i in range(DISABLE_THRESHOLD):
        apply_chain(frame, chain, project_seed=42, frame_index=i, resolution=(100, 100))

    output, _ = apply_chain(
        frame, chain, project_seed=42, frame_index=99, resolution=(100, 100)
    )
    np.testing.assert_array_equal(output, frame)


def test_concurrent_apply_chain_thread_safety():
    """Concurrent apply_chain from 2 threads doesn't crash or corrupt state."""
    _ensure_debug_crash()
    frame = _frame()
    chain = [{"effect_id": "debug.crash", "params": {}}]
    errors = []

    def worker(thread_id):
        try:
            for i in range(DISABLE_THRESHOLD + 2):
                apply_chain(
                    frame,
                    chain,
                    project_seed=42,
                    frame_index=thread_id * 100 + i,
                    resolution=(100, 100),
                )
        except Exception as e:
            errors.append(e)

    t1 = threading.Thread(target=worker, args=(1,))
    t2 = threading.Thread(target=worker, args=(2,))
    t1.start()
    t2.start()
    t1.join()
    t2.join()

    assert errors == [], f"Unexpected errors in threads: {errors}"
    health = get_effect_health()
    assert "debug.crash" in health["disabled_effects"]
    assert health["failure_counts"]["debug.crash"] >= DISABLE_THRESHOLD
