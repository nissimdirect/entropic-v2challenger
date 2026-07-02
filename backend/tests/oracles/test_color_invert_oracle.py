"""Oracle validator for fx.color_invert.

Signature: each channel mean of the output ≈ 255 - input mean (within
codec roundtrip tolerance, ~5 BGR units after H.264 yuv420p).

Catches:
  - Effect silently disabled (output == input)
  - Channel-order regression (R↔B swap)
  - Partial inversion (alpha not handled)
  - Bypass bug (effect chain not applied)
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest

from .conftest import first_frame_bgr_mean, run_cli_apply

EFFECT_ID = "fx.color_invert"
TOLERANCE = 5.0  # BGR units, accounts for H.264 yuv420p roundtrip loss


@pytest.mark.oracle
def test_color_invert_signature(testsrc_clip: Path, tmp_path: Path) -> None:
    """Color-Invert output should be ~(255 - input) per channel."""
    out = tmp_path / "inverted.mp4"
    run_cli_apply(testsrc_clip, out, EFFECT_ID)

    in_means = first_frame_bgr_mean(testsrc_clip)
    out_means = first_frame_bgr_mean(out)
    expected = 255.0 - in_means
    delta = np.abs(out_means - expected)

    assert (delta < TOLERANCE).all(), (
        f"{EFFECT_ID} signature mismatch (tolerance {TOLERANCE})\n"
        f"  input  BGR mean: {in_means}\n"
        f"  output BGR mean: {out_means}\n"
        f"  expected:        {expected}\n"
        f"  delta:           {delta}"
    )


@pytest.mark.oracle
def test_color_invert_idempotent(testsrc_clip: Path, tmp_path: Path) -> None:
    """Applying Color-Invert twice should approximately recover the input."""
    once = tmp_path / "once.mp4"
    twice = tmp_path / "twice.mp4"
    run_cli_apply(testsrc_clip, once, EFFECT_ID)
    run_cli_apply(once, twice, EFFECT_ID)

    in_means = first_frame_bgr_mean(testsrc_clip)
    twice_means = first_frame_bgr_mean(twice)
    delta = np.abs(twice_means - in_means)

    # Two H.264 roundtrips → larger tolerance
    assert (delta < TOLERANCE * 2).all(), (
        f"{EFFECT_ID} not idempotent (tolerance {TOLERANCE * 2})\n"
        f"  input  BGR mean: {in_means}\n"
        f"  twice  BGR mean: {twice_means}\n"
        f"  delta:           {delta}"
    )
