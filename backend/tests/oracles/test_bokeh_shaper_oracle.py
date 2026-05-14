"""Auto-generated oracle for fx.bokeh_shaper.

Template: composite (multi-mode — validated with conservative "any-change" oracle).
Oracle: per-pixel L1 distance >= 2.0 on flat testsrc input.

Composite effects have multiple modes or complex parameter interactions.
This oracle catches silent-disable and CLI-bypass at default params.
Tighten per-effect if defaults hit a no-op mode.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from .conftest import per_pixel_l1_distance, run_cli_apply

EFFECT_ID = "fx.bokeh_shaper"
MIN_L1 = 2.0


@pytest.mark.oracle
def test_bokeh_shaper_produces_output(testsrc_clip: Path, tmp_path: Path) -> None:
    """bokeh_shaper should produce visible change at default params."""
    out = tmp_path / "out.mp4"
    run_cli_apply(testsrc_clip, out, EFFECT_ID)

    l1 = per_pixel_l1_distance(testsrc_clip, out)

    assert l1 >= MIN_L1, (
        f"{EFFECT_ID} produced no visible change (L1={l1:.2f}, need >= {MIN_L1})\n"
        f"  — effect may be silently disabled, in no-op mode, or CLI chain broken"
    )
