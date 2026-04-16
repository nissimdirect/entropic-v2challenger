"""Auto-generated oracle for fx.cumulative_smear.

Template: temporal (stateful, frame-index dependent, or accumulator).
Oracle: single-frame L1 + frame-diff pattern change.

NOTE: Temporal oracles are inherently weaker than pure-function oracles —
a single invocation may not reveal state accumulation. Pairs well with
multi-frame regression in a follow-up sprint.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from .conftest import per_pixel_l1_distance, run_cli_apply

EFFECT_ID = "fx.cumulative_smear"
MIN_L1 = 2.0


@pytest.mark.oracle
def test_cumulative_smear_changes_output(mandelbrot_clip: Path, tmp_path: Path) -> None:
    """cumulative_smear should produce a detectable first-frame difference."""
    out = tmp_path / "out.mp4"
    run_cli_apply(mandelbrot_clip, out, EFFECT_ID)

    l1 = per_pixel_l1_distance(mandelbrot_clip, out)

    assert l1 >= MIN_L1, (
        f"{EFFECT_ID} produced no visible change on first frame (L1={l1:.2f}, need >= {MIN_L1})"
    )
