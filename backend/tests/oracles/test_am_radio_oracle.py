"""Auto-generated oracle for fx.am_radio.

Template: transform (per-pixel function, no spatial coupling).
Oracle: per-pixel L1 distance on flat testsrc input proves pixel mutation.

Catches:
  - Effect silently disabled (output == input, L1 = 0)
  - Bypass bug (CLI chain not applied)

Tolerance is intentionally low (L1 >= 2.0) — some transforms barely shift
pixels at default params. Tighten per-effect if false-positive rate is high.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from .conftest import per_pixel_l1_distance, run_cli_apply

EFFECT_ID = "fx.am_radio"
MIN_L1 = 2.0


@pytest.mark.oracle
def test_am_radio_changes_pixels(testsrc_clip: Path, tmp_path: Path) -> None:
    """am_radio should visibly transform flat testsrc input."""
    out = tmp_path / "out.mp4"
    run_cli_apply(testsrc_clip, out, EFFECT_ID)

    l1 = per_pixel_l1_distance(testsrc_clip, out)

    assert l1 >= MIN_L1, (
        f"{EFFECT_ID} produced no visible change (L1={l1:.2f}, need >= {MIN_L1})\n"
        f"  — effect may be silently disabled or CLI chain broken"
    )
