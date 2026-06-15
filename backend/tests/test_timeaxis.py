"""P5b.23 — B9 Y-as-time: per-instrument timeAxis switch (slit-scan footage indexing).

Hard oracle tests (all four required):

  1. test_timeaxis_y_rows_advance_through_footage
     Row r of the output MUST come from frame-bank position r/(H-1).
     Hand-computed fixture: 4 slots, each slot a distinct R-channel value.
     For a 4-row output: row 0 → position 0 → slot[0] (R=10),
                          row 1 → position 1/3 → slot[0..1] blend,
                          row 2 → position 2/3 → slot[1..2] blend,
                          row 3 → position 1   → slot[3] (R=40).
     We use interp='nearest' so each row maps to an exact slot (no blend math).
     Nearest-rounds: pos=0 → slot 0 (R=10); pos=1/3 → idx=1 → slot 1 (R=20);
     pos=2/3 → idx=2 → slot 2 (R=30); pos=1 → slot 3 (R=40).

  2. test_timeaxis_x_symmetric
     Column c of the output MUST come from frame-bank position c/(W-1).
     Same 4-slot fixture, 4-column frame, nearest interp.
     col 0 → pos 0   → slot 0 (R=10)
     col 1 → pos 1/3 → slot 1 (R=20)
     col 2 → pos 2/3 → slot 2 (R=30)
     col 3 → pos 1   → slot 3 (R=40)

  3. test_timeaxis_t_unchanged_legacy
     With timeAxis='t' (or absent), resolve_frame_bank_frame returns byte-identical
     output to the pre-B9 code path (a single frame at `position`).

  4. test_lowercase_axis_only_rejects_uppercase
     validate_frame_bank must reject timeAxis='Y', 'X', 'T' with a descriptive
     error. Lowercase 't'/'y'/'x' must be accepted (gate + sanitize).
"""

from __future__ import annotations

import numpy as np
import pytest

from engine.decoded_frame_cache import DecodedFrameCache
from engine.frame_bank import resolve_frame_bank_frame
from security import FRAMEBANK_BYTE_BUDGET_MIN, validate_frame_bank


# ---------------------------------------------------------------------------
# Fixtures / helpers
# ---------------------------------------------------------------------------

# 4 slots with distinct R values — the "color ladder" bank.
_SLOT_R_VALUES = {0: 10, 1: 20, 2: 30, 3: 40}
# Frame dimensions for the tests.
_H = 4
_W = 4
_SLOTS = [{"clipId": f"clip{i}", "frameIndex": i} for i in range(4)]


def _make_inst(time_axis: str | None = None, interp: str = "nearest") -> dict:
    """Build a sanitized frameBank inst dict for the 4-slot color-ladder bank."""
    raw = {
        "type": "frameBank",
        "slots": _SLOTS,
        "position": 0.5,
        "interp": interp,
        "byteBudget": FRAMEBANK_BYTE_BUDGET_MIN,
    }
    if time_axis is not None:
        raw["timeAxis"] = time_axis
    sanitized, errors = validate_frame_bank(raw)
    assert not errors, f"unexpected validation errors: {errors}"
    assert sanitized is not None
    return sanitized


def _make_cache() -> DecodedFrameCache:
    return DecodedFrameCache(FRAMEBANK_BYTE_BUDGET_MIN)


def _make_decode(h: int = _H, w: int = _W):
    """decode(clip_id, frame_index) → frame with R = _SLOT_R_VALUES[frame_index]."""

    def decode(clip_id: str, frame_index: int) -> np.ndarray:
        frame = np.zeros((h, w, 4), dtype=np.uint8)
        r_val = _SLOT_R_VALUES.get(frame_index, frame_index % 256)
        frame[:, :, 0] = r_val
        frame[:, :, 3] = 255
        return frame

    return decode


# ---------------------------------------------------------------------------
# 1. test_timeaxis_y_rows_advance_through_footage
# ---------------------------------------------------------------------------


def test_timeaxis_y_rows_advance_through_footage():
    """Gate 1 (hard oracle): row r MUST come from frame-bank position r/(H-1).

    Hand-computed slit-scan fixture:
      H=4, W=4, interp='nearest', 4 slots.

      Row 0: pos = 0/(4-1) = 0.0   → nearest slot: round(0.0 * 3) = 0 → R=10
      Row 1: pos = 1/(4-1) = 0.333 → nearest slot: round(0.333*3) = round(1.0) = 1 → R=20
      Row 2: pos = 2/(4-1) = 0.667 → nearest slot: round(0.667*3) = round(2.0) = 2 → R=30
      Row 3: pos = 3/(4-1) = 1.0   → nearest slot: round(1.0 * 3) = 3 → R=40
    """
    inst = _make_inst(time_axis="y", interp="nearest")
    cache = _make_cache()
    decode = _make_decode(h=_H, w=_W)

    result = resolve_frame_bank_frame(inst, 0.0, cache, decode)

    assert result.shape == (_H, _W, 4), f"Unexpected shape: {result.shape}"

    expected_r_per_row = [10, 20, 30, 40]
    for r, expected_r in enumerate(expected_r_per_row):
        actual_r = int(result[r, 0, 0])
        assert actual_r == expected_r, (
            f"Row {r}: expected R={expected_r} (slot {r}), got R={actual_r}. "
            f"Slit-scan must sample slot {r} for row {r} (pos={r / (H - 1):.3f})."
        )


# ---------------------------------------------------------------------------
# 2. test_timeaxis_x_symmetric
# ---------------------------------------------------------------------------


def test_timeaxis_x_symmetric():
    """Gate 2 (hard oracle): column c MUST come from frame-bank position c/(W-1).

    Column-symmetric case:
      W=4, H=4, interp='nearest', 4 slots.

      Col 0: pos = 0/(4-1) = 0.0   → nearest: round(0.0*3) = 0 → R=10
      Col 1: pos = 1/(4-1) = 0.333 → nearest: round(1.0) = 1 → R=20
      Col 2: pos = 2/(4-1) = 0.667 → nearest: round(2.0) = 2 → R=30
      Col 3: pos = 3/(4-1) = 1.0   → nearest: round(3.0) = 3 → R=40
    """
    inst = _make_inst(time_axis="x", interp="nearest")
    cache = _make_cache()
    decode = _make_decode(h=_H, w=_W)

    result = resolve_frame_bank_frame(inst, 0.0, cache, decode)

    assert result.shape == (_H, _W, 4), f"Unexpected shape: {result.shape}"

    expected_r_per_col = [10, 20, 30, 40]
    for c, expected_r in enumerate(expected_r_per_col):
        actual_r = int(result[0, c, 0])  # check first row of each column
        assert actual_r == expected_r, (
            f"Col {c}: expected R={expected_r} (slot {c}), got R={actual_r}. "
            f"X-axis slit-scan must sample slot {c} for col {c}."
        )


# ---------------------------------------------------------------------------
# 3. test_timeaxis_t_unchanged_legacy
# ---------------------------------------------------------------------------


def test_timeaxis_t_unchanged_legacy():
    """Gate 3: timeAxis='t' (or absent) output MUST be byte-identical to legacy.

    With position=0.0 and interp='nearest', the result is slot[0]'s frame (R=10)
    regardless of timeAxis='t' or timeAxis absent. This proves the 't' path is
    a pure pass-through (no slit-scan, no behavior change).
    """
    # Inst with timeAxis='t' explicitly
    inst_t = _make_inst(time_axis="t", interp="nearest")
    # Inst without timeAxis (legacy / absent)
    inst_absent = _make_inst(time_axis=None, interp="nearest")

    decode = _make_decode()

    for label, inst in [("timeAxis='t'", inst_t), ("timeAxis absent", inst_absent)]:
        cache = _make_cache()
        result = resolve_frame_bank_frame(inst, 0.0, cache, decode)
        # Legacy behavior at position=0: nearest → slot 0 → R=10. All pixels same.
        assert result.shape == (_H, _W, 4), (
            f"[{label}] Unexpected shape: {result.shape}"
        )
        assert np.all(result[:, :, 0] == 10), (
            f"[{label}] Expected all-10 R channel (slot 0 at position=0), "
            f"got unique values {np.unique(result[:, :, 0])}"
        )
        # Verify it is NOT a slit-scan (all rows identical)
        for r in range(_H):
            assert np.array_equal(result[0], result[r]), (
                f"[{label}] Row {r} differs from row 0 — should be uniform (no slit-scan)"
            )


def test_timeaxis_t_byte_identical_at_various_positions():
    """timeAxis='t' at position=0.5 and position=1.0 are byte-identical to
    the same inst without timeAxis — the 't' path does NOT modify any pixel."""
    for position in [0.0, 0.5, 1.0]:
        inst_t = _make_inst(time_axis="t", interp="nearest")
        inst_absent = _make_inst(time_axis=None, interp="nearest")
        decode = _make_decode()

        result_t = resolve_frame_bank_frame(inst_t, position, _make_cache(), decode)
        result_absent = resolve_frame_bank_frame(
            inst_absent, position, _make_cache(), decode
        )
        assert np.array_equal(result_t, result_absent), (
            f"position={position}: timeAxis='t' differs from absent — must be byte-identical"
        )


# ---------------------------------------------------------------------------
# 4. test_lowercase_axis_only_rejects_uppercase
# ---------------------------------------------------------------------------


def test_lowercase_axis_only_rejects_uppercase():
    """Gate 4 (P1-A axis canon): validate_frame_bank MUST reject uppercase timeAxis.

    'Y', 'X', 'T' are all invalid (canon: lowercase only). Each must return a
    non-empty error list and sanitized=None. Lowercase 't'/'y'/'x' must be
    accepted (no errors, sanitized is a dict with timeAxis set correctly).
    """
    base = {
        "type": "frameBank",
        "slots": _SLOTS,
        "position": 0.5,
        "interp": "blend",
        "byteBudget": FRAMEBANK_BYTE_BUDGET_MIN,
    }

    # --- Uppercase (must be rejected) ---
    for bad_axis in ("Y", "X", "T", "Z", "TIME", "Blend"):
        raw = {**base, "timeAxis": bad_axis}
        sanitized, errors = validate_frame_bank(raw)
        assert sanitized is None, (
            f"timeAxis={bad_axis!r}: expected rejection (sanitized=None), got {sanitized!r}"
        )
        assert len(errors) > 0, (
            f"timeAxis={bad_axis!r}: expected error list, got empty errors"
        )
        # Error message must name the bad value
        assert bad_axis in errors[0] or "timeAxis" in errors[0], (
            f"timeAxis={bad_axis!r}: error message doesn't mention the bad axis: {errors}"
        )

    # --- Lowercase (must be accepted) ---
    for good_axis in ("t", "y", "x"):
        raw = {**base, "timeAxis": good_axis}
        sanitized, errors = validate_frame_bank(raw)
        assert not errors, f"timeAxis={good_axis!r}: unexpected errors: {errors}"
        assert sanitized is not None, (
            f"timeAxis={good_axis!r}: expected sanitized dict, got None"
        )
        assert sanitized["timeAxis"] == good_axis, (
            f"timeAxis={good_axis!r}: sanitized['timeAxis'] = {sanitized['timeAxis']!r}"
        )

    # --- Absent timeAxis (must default to 't') ---
    raw = {**base}
    raw.pop("timeAxis", None)
    sanitized, errors = validate_frame_bank(raw)
    assert not errors, f"absent timeAxis: unexpected errors: {errors}"
    assert sanitized is not None
    assert sanitized["timeAxis"] == "t", (
        f"absent timeAxis: expected default 't', got {sanitized.get('timeAxis')!r}"
    )


# ---------------------------------------------------------------------------
# Additional correctness: slit-scan with 2 slots (boundary case)
# ---------------------------------------------------------------------------


def test_timeaxis_y_two_slots_boundary():
    """With 2 slots, row 0 → slot 0 (R=10) and row 3 → slot 1 (R=20).

    Two-slot nearest: pos=0 → slot 0; pos=1 → slot 1.
    pos=1/3 ≈ 0.333 → round(0.333*1) = round(0.333) = 0 → slot 0.
    pos=2/3 ≈ 0.667 → round(0.667*1) = round(0.667) = 1 → slot 1.
    """
    raw = {
        "type": "frameBank",
        "slots": [
            {"clipId": "clip0", "frameIndex": 0},
            {"clipId": "clip1", "frameIndex": 1},
        ],
        "position": 0.5,
        "interp": "nearest",
        "byteBudget": FRAMEBANK_BYTE_BUDGET_MIN,
        "timeAxis": "y",
    }
    sanitized, errors = validate_frame_bank(raw)
    assert not errors
    assert sanitized is not None

    cache = _make_cache()
    decode = _make_decode(h=_H, w=_W)
    result = resolve_frame_bank_frame(sanitized, 0.0, cache, decode)

    assert result.shape == (_H, _W, 4)
    # Row 0: pos=0 → slot 0 → R=10
    assert int(result[0, 0, 0]) == 10, f"Row 0: expected R=10, got {result[0, 0, 0]}"
    # Row 3: pos=1 → slot 1 → R=20
    assert int(result[3, 0, 0]) == 20, f"Row 3: expected R=20, got {result[3, 0, 0]}"


def test_timeaxis_y_single_slot_all_same_row():
    """With 1 slot, every row maps to position 0 → same slot → uniform output."""
    raw = {
        "type": "frameBank",
        "slots": [{"clipId": "clip0", "frameIndex": 0}],
        "position": 0.5,
        "interp": "nearest",
        "byteBudget": FRAMEBANK_BYTE_BUDGET_MIN,
        "timeAxis": "y",
    }
    sanitized, errors = validate_frame_bank(raw)
    assert not errors
    assert sanitized is not None

    cache = _make_cache()
    decode = _make_decode(h=_H, w=_W)
    result = resolve_frame_bank_frame(sanitized, 0.0, cache, decode)

    assert result.shape == (_H, _W, 4)
    # All rows must be identical (only one slot → all positions resolve to slot 0)
    for r in range(_H):
        assert np.array_equal(result[0], result[r]), (
            f"Single-slot y-axis: row {r} differs from row 0"
        )


# H constant for the hand-computed assertion comment (avoids NameError).
H = _H
