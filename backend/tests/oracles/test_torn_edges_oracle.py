"""Oracle validator for fx.torn_edges.

Signature: output Laplacian variance changes detectably vs input — torn_edges
applies a thresholded sigmoid mask, so high-frequency content shifts noticeably.

Catches:
  - Effect silently disabled (output L1 == 0)
  - Bypass bug (output sharpness unchanged from input)
  - Threshold/displacement-noise both no-op
"""

from __future__ import annotations

from pathlib import Path

import pytest

from .conftest import laplacian_variance, per_pixel_l1_distance, run_cli_apply

EFFECT_ID = "fx.torn_edges"
MIN_L1 = 2.0
MIN_LAPLACIAN_RATIO_CHANGE = 0.05  # 5% change in sharpness


@pytest.mark.oracle
def test_torn_edges_alters_sharpness(mandelbrot_clip: Path, tmp_path: Path) -> None:
    """torn_edges should alter high-frequency content."""
    out = tmp_path / "out.mp4"
    run_cli_apply(mandelbrot_clip, out, EFFECT_ID)

    l1 = per_pixel_l1_distance(mandelbrot_clip, out)
    in_sharp = laplacian_variance(mandelbrot_clip)
    out_sharp = laplacian_variance(out)
    ratio_change = abs(out_sharp - in_sharp) / max(in_sharp, 1.0)

    assert l1 >= MIN_L1, (
        f"{EFFECT_ID} produced no visible change (L1={l1:.2f}, need >= {MIN_L1})"
    )
    assert ratio_change >= MIN_LAPLACIAN_RATIO_CHANGE, (
        f"{EFFECT_ID} did not alter sharpness\n"
        f"  input  lap-var: {in_sharp:.1f}\n"
        f"  output lap-var: {out_sharp:.1f}\n"
        f"  ratio change:   {ratio_change:.3f} (need >= {MIN_LAPLACIAN_RATIO_CHANGE})"
    )
