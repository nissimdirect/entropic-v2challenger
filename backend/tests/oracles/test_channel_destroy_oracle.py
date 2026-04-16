"""Oracle validator for fx.channel_destroy.

Signature: at least one channel mean shifts substantially (>= 25 BGR units)
between input and output. Channel destroy mutates one or more colour channels
based on its mode/intensity params.

Catches:
  - Effect disabled (no channels change)
  - All channels mutated equally (would imply not channel-specific)
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest

from .conftest import first_frame_bgr_mean, run_cli_apply

EFFECT_ID = "fx.channel_destroy"
MIN_CHANNEL_DELTA = 25.0  # BGR units — clearly visible change


@pytest.mark.oracle
def test_channel_destroy_mutates_channels(testsrc_clip: Path, tmp_path: Path) -> None:
    out = tmp_path / "destroyed.mp4"
    # mode="eliminate" + intensity=1.0 → fully zero out one channel
    run_cli_apply(
        testsrc_clip,
        out,
        EFFECT_ID,
        params={"mode": "eliminate", "intensity": 1.0},
    )

    in_means = first_frame_bgr_mean(testsrc_clip)
    out_means = first_frame_bgr_mean(out)
    delta = np.abs(out_means - in_means)

    assert delta.max() >= MIN_CHANNEL_DELTA, (
        f"{EFFECT_ID} did not mutate any channel meaningfully\n"
        f"  input  BGR mean: {in_means}\n"
        f"  output BGR mean: {out_means}\n"
        f"  per-channel delta: {delta}\n"
        f"  max delta:       {delta.max():.1f} (must be >= {MIN_CHANNEL_DELTA})"
    )
