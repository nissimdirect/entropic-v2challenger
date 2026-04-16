"""Auto-generated oracle for fx.rainbow_shift.

Template: generative (overlays new content — particles, patterns, CA).
Oracle: visible pixel change, even on flat input (overlay is added).
"""

from __future__ import annotations

from pathlib import Path

import pytest

from .conftest import per_pixel_l1_distance, run_cli_apply

EFFECT_ID = "fx.rainbow_shift"
MIN_L1 = 2.0


@pytest.mark.oracle
def test_rainbow_shift_produces_output(testsrc_clip: Path, tmp_path: Path) -> None:
    """rainbow_shift should add visible content to the frame."""
    out = tmp_path / "out.mp4"
    run_cli_apply(testsrc_clip, out, EFFECT_ID)

    l1 = per_pixel_l1_distance(testsrc_clip, out)

    assert l1 >= MIN_L1, (
        f"{EFFECT_ID} added no visible content (L1={l1:.2f}, need >= {MIN_L1})"
    )
