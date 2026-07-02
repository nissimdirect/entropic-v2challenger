"""Auto-generated oracle for fx.sample_and_hold.

Template: temporal (stateful, frame-index dependent, or accumulator).
Oracle: single-frame L1 + frame-diff pattern change.

NOTE: Temporal oracles are inherently weaker than pure-function oracles —
a single invocation may not reveal state accumulation. Pairs well with
multi-frame regression in a follow-up sprint.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from .conftest import nth_frame_l1_distance, run_cli_apply

EFFECT_ID = "fx.sample_and_hold"
MIN_L1 = 2.0


@pytest.mark.oracle
def test_sample_and_hold_changes_output(mandelbrot_clip: Path, tmp_path: Path) -> None:
    """sample_and_hold should produce a detectable first-frame difference."""
    out = tmp_path / "out.mp4"
    run_cli_apply(mandelbrot_clip, out, EFFECT_ID)

    l1 = nth_frame_l1_distance(mandelbrot_clip, out, n=15)

    assert l1 >= MIN_L1, (
        f"{EFFECT_ID} produced no visible change at frame 15 (L1={l1:.2f}, need >= {MIN_L1})"
    )
