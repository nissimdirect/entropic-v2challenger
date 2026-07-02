"""Oracle validator for fx.datamosh_melt.

Signature: output frame-to-frame absolute difference shifts measurably from
input baseline. Datamosh accumulates and smears frames — the temporal
character of the video changes either by smearing (lower diff) or fragmenting
(higher diff). We assert ANY measurable shift > 1.0 BGR unit.

Catches:
  - Effect disabled (frame-to-frame change identical to input)
  - State not propagated between frames (per-frame independence — would
    keep frame_diff identical to input)
"""

from __future__ import annotations

from pathlib import Path

import pytest

from .conftest import frame_diff_mean, run_cli_apply

EFFECT_ID = "fx.datamosh_melt"
MIN_TEMPORAL_DELTA = 1.0  # BGR unit shift in mean frame-to-frame difference


@pytest.mark.oracle
def test_datamosh_alters_temporal_signature(testsrc_clip: Path, tmp_path: Path) -> None:
    out = tmp_path / "datamoshed.mp4"
    run_cli_apply(testsrc_clip, out, EFFECT_ID, params={"intensity": 1.0})

    in_diff = frame_diff_mean(testsrc_clip)
    out_diff = frame_diff_mean(out)
    shift = abs(out_diff - in_diff)

    assert shift >= MIN_TEMPORAL_DELTA, (
        f"{EFFECT_ID} did not change the temporal signature\n"
        f"  input  frame-diff mean: {in_diff:.2f}\n"
        f"  output frame-diff mean: {out_diff:.2f}\n"
        f"  shift:                  {shift:.2f} (must be >= {MIN_TEMPORAL_DELTA})"
    )
