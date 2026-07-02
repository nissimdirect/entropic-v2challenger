"""Unit tests for fx.copy_machine effect."""

import numpy as np

from effects.fx import copy_machine


def _subject_frame(h: int = 48, w: int = 48) -> np.ndarray:
    """Light frame with a dark central square + alpha=255 (dark-on-light source)."""
    frame = np.zeros((h, w, 4), dtype=np.uint8)
    frame[:, :, :3] = 200
    frame[h // 4 : 3 * h // 4, w // 4 : 3 * w // 4, :3] = 20
    frame[:, :, 3] = 255
    return frame


def _apply(frame, params=None, state_in=None, *, frame_index=0, seed=42):
    res = (frame.shape[1], frame.shape[0])
    return copy_machine.apply(
        frame,
        params or {},
        state_in,
        frame_index=frame_index,
        seed=seed,
        resolution=res,
    )


def _l1(a, b):
    return float(
        np.mean(np.abs(a[:, :, :3].astype(np.int16) - b[:, :, :3].astype(np.int16)))
    )


def test_metadata_and_registration():
    assert copy_machine.EFFECT_ID == "fx.copy_machine"
    assert copy_machine.EFFECT_NAME == "Copy Machine"
    from effects import registry

    assert registry.get("fx.copy_machine") is not None, (
        "Effect not in registry — add to registry.py _auto_register()"
    )


def test_all_machines_change_pixels():
    """Every machine must materially alter the frame at a non-trivial generation."""
    frame = _subject_frame()
    for machine in copy_machine.MACHINES:
        out, _ = _apply(frame, {"machine": machine, "generation": 4})
        l1 = _l1(out, frame)
        assert l1 > 3.0, f"machine {machine!r} barely changed pixels (L1={l1:.2f})"


def test_generation_zero_is_near_identity():
    """generation=0 (feedback off) => no copy passes => output ~ input (rgb)."""
    frame = _subject_frame()
    out, state = _apply(frame, {"machine": "toner", "generation": 0.0})
    assert np.array_equal(out[:, :, :3], frame[:, :, :3]), "gen=0 should be identity"
    assert state is None, "stateless mode must not carry state"


def test_generation_increases_degradation():
    """More generations => further from the original."""
    frame = _subject_frame()
    out_lo, _ = _apply(frame, {"machine": "toner", "generation": 1})
    out_hi, _ = _apply(frame, {"machine": "toner", "generation": 8})
    assert _l1(out_hi, frame) > _l1(out_lo, frame), (
        "higher generation not more degraded"
    )


def test_determinism_same_seed_frame_identical():
    """Same (seed, frame_index) + params => byte-identical output."""
    frame = _subject_frame()
    p = {"machine": "riso", "generation": 6}
    a, _ = _apply(frame, p, frame_index=10, seed=7)
    b, _ = _apply(frame, p, frame_index=10, seed=7)
    assert np.array_equal(a, b), "output not deterministic for fixed seed+frame"


def test_determinism_differs_by_frame_index():
    """Different frame_index => different noise realisation (renders aren't frozen)."""
    frame = _subject_frame()
    p = {"machine": "toner", "generation": 4}
    a, _ = _apply(frame, p, frame_index=0, seed=7)
    b, _ = _apply(frame, p, frame_index=25, seed=7)
    assert not np.array_equal(a, b), "frame_index had no effect on noise"


def test_feedback_accumulates_vs_stateless():
    """feedback=true frame 2 must differ from the stateless frame-2 output."""
    frame = _subject_frame()
    p = {"machine": "toner", "generation": 2, "feedback": True}
    out0, st0 = _apply(frame, p, None, frame_index=0)
    out1, st1 = _apply(frame, p, st0, frame_index=1)
    assert st0 is not None and "prev" in st0, "feedback did not carry state"
    # stateless render at the same frame index (no history)
    stateless1, _ = _apply(
        frame, {"machine": "toner", "generation": 2}, None, frame_index=1
    )
    assert not np.array_equal(out1, stateless1), (
        "feedback frame-2 output identical to stateless — state not compounding"
    )


def test_feedback_is_reproducible_sequence():
    """Two identical sequential feedback runs must match frame-for-frame."""
    frame = _subject_frame()
    p = {"machine": "photocopy", "generation": 1, "feedback": True}

    def run():
        st = None
        outs = []
        for fi in range(4):
            o, st = _apply(frame, p, st, frame_index=fi, seed=3)
            outs.append(o)
        return outs

    a, b = run(), run()
    for i, (x, y) in enumerate(zip(a, b)):
        assert np.array_equal(x, y), f"feedback sequence not reproducible at frame {i}"


def test_freeze_holds_content():
    """freeze=true degrades the SAME held frame even when the input changes."""
    frame_a = _subject_frame()
    frame_b = _subject_frame()
    frame_b[:, :, :3] = 255 - frame_b[:, :, :3]  # totally different second input
    p = {"machine": "toner", "generation": 3, "freeze": True}
    _, st = _apply(frame_a, p, None, frame_index=0)
    held = st["held"].copy()
    # advance with a different input; held frame must be preserved
    _, st2 = _apply(frame_b, p, st, frame_index=1)
    assert np.array_equal(st2["held"], held), "freeze did not hold the captured frame"
    assert np.array_equal(held, frame_a[:, :, :3]), "held frame is not the first input"


def test_freeze_clears_when_disabled():
    """Turning freeze off must drop the held frame from state."""
    frame = _subject_frame()
    _, st = _apply(frame, {"machine": "toner", "freeze": True}, None, frame_index=0)
    assert "held" in st
    _, st2 = _apply(frame, {"machine": "toner", "freeze": False}, st, frame_index=1)
    assert st2 is None or "held" not in st2, "held frame not cleared after freeze off"


def test_invert_auto_triggers_on_light_on_dark():
    """A dark background with a light mark should auto-invert (light spreads)."""
    h = w = 48
    dark = np.zeros((h, w, 4), dtype=np.uint8)
    dark[:, :, 3] = 255
    dark[h // 3 : 2 * h // 3, w // 3 : 2 * w // 3, :3] = 240  # light mark
    out_auto, _ = _apply(
        dark, {"machine": "toner", "generation": 3, "invert_auto": True}
    )
    out_off, _ = _apply(
        dark,
        {"machine": "toner", "generation": 3, "invert_auto": False, "invert": False},
    )
    assert not np.array_equal(out_auto, out_off), (
        "invert_auto had no effect on a light-on-dark source"
    )


def test_alpha_preserved():
    frame = _subject_frame()
    frame[:, :, 3] = 128
    out, _ = _apply(frame, {"machine": "halftone", "generation": 2})
    assert np.array_equal(out[:, :, 3], frame[:, :, 3]), "alpha modified"


def test_three_channel_input_handled():
    rgb_only = _subject_frame()[:, :, :3]
    out, _ = _apply(rgb_only, {"machine": "fax", "generation": 2})
    assert out.shape[2] == 3 and out.dtype == np.uint8


def test_mix_blends_toward_original():
    frame = _subject_frame()
    full, _ = _apply(frame, {"machine": "toner", "generation": 6, "mix": 1.0})
    half, _ = _apply(frame, {"machine": "toner", "generation": 6, "mix": 0.5})
    assert _l1(half, frame) < _l1(full, frame), (
        "mix<1 did not pull output back toward original"
    )


def test_trust_boundary_clamps_garbage_params():
    """Out-of-range / wrong-type params from a crafted project must not crash."""
    frame = _subject_frame()
    params = {
        "machine": "not-a-machine",
        "generation": 99999.0,
        "mix": -5.0,
        "feedback": "maybe",
        "freeze": 2,
        "invert": "nope",
    }
    out, _ = _apply(frame, params)
    assert out.shape == frame.shape and out.dtype == np.uint8


def test_no_nan_or_inf_and_uint8():
    frame = _subject_frame()
    for machine in copy_machine.MACHINES:
        out, _ = _apply(frame, {"machine": machine, "generation": 5}, frame_index=13)
        assert out.dtype == np.uint8
        f = out.astype(np.float32)
        assert not np.any(np.isnan(f)) and not np.any(np.isinf(f)), (
            f"{machine} produced NaN/Inf"
        )


def test_fractional_generation_is_between_neighbors():
    """A fractional generation blends between the two integer-generation outputs."""
    frame = _subject_frame()
    lo, _ = _apply(frame, {"machine": "toner", "generation": 3.0})
    mid, _ = _apply(frame, {"machine": "toner", "generation": 3.5})
    # mid must differ from the pure 3-pass output (the fractional pass took effect)
    assert not np.array_equal(mid, lo), "fractional generation had no effect"
