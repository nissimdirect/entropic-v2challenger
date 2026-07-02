"""Auto-generated oracle for fx.duotone.

Template: symbolic (renders glyphs / structure-replacing).
Oracle: dramatic pixel-level change (structure completely redrawn).
"""

from __future__ import annotations

from pathlib import Path

import pytest

from .conftest import per_pixel_l1_distance, run_cli_apply

EFFECT_ID = "fx.duotone"
MIN_L1 = 20.0  # dramatic — symbolic rendering flips structure


@pytest.mark.oracle
def test_duotone_rerenders_structure(testsrc_clip: Path, tmp_path: Path) -> None:
    """duotone should dramatically restructure output."""
    out = tmp_path / "out.mp4"
    run_cli_apply(testsrc_clip, out, EFFECT_ID)

    l1 = per_pixel_l1_distance(testsrc_clip, out)

    assert l1 >= MIN_L1, (
        f"{EFFECT_ID} did not re-render structure (L1={l1:.2f}, need >= {MIN_L1})"
    )
