"""Oracle validator for fx.blur.

Signature: output Laplacian variance (sharpness signal) drops sharply.
Blur is a low-pass filter; high-freq content is what it removes.

Catches:
  - Effect silently disabled (output sharpness == input sharpness)
  - Radius parameter ignored (no change)
  - Wrong-axis blur (only horizontal or only vertical)
"""

from __future__ import annotations

from pathlib import Path

import pytest

from .conftest import laplacian_variance, run_cli_apply

EFFECT_ID = "fx.blur"
SHARPNESS_RATIO_MAX = 0.5  # output should retain <50% of input sharpness


@pytest.mark.oracle
def test_blur_reduces_sharpness(testsrc_clip: Path, tmp_path: Path) -> None:
    out = tmp_path / "blurred.mp4"
    run_cli_apply(testsrc_clip, out, EFFECT_ID, params={"radius": 8.0})

    in_var = laplacian_variance(testsrc_clip)
    out_var = laplacian_variance(out)
    ratio = out_var / max(in_var, 1.0)

    assert ratio < SHARPNESS_RATIO_MAX, (
        f"{EFFECT_ID} did not reduce sharpness enough\n"
        f"  input  Laplacian var: {in_var:.1f}\n"
        f"  output Laplacian var: {out_var:.1f}\n"
        f"  ratio:                {ratio:.3f} (must be < {SHARPNESS_RATIO_MAX})"
    )
