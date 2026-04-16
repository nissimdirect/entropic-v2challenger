"""Auto-generated oracle for fx.displacement.

Template: spatial_permutation (pixels rearranged).
Oracle: per-pixel L1 distance on mandelbrot (rich texture) proves movement.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from .conftest import per_pixel_l1_distance, run_cli_apply

EFFECT_ID = "fx.displacement"
MIN_L1 = 5.0


@pytest.mark.oracle
def test_displacement_permutes_pixels(mandelbrot_clip: Path, tmp_path: Path) -> None:
    """displacement should rearrange pixels on rich input."""
    out = tmp_path / "out.mp4"
    run_cli_apply(mandelbrot_clip, out, EFFECT_ID)

    l1 = per_pixel_l1_distance(mandelbrot_clip, out)

    assert l1 >= MIN_L1, (
        f"{EFFECT_ID} produced no visible permutation (L1={l1:.2f}, need >= {MIN_L1})"
    )
