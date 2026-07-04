"""Auto-generated oracle for fx.grid_moire.

Template: generative (overlays new content — particles, patterns, CA).
Oracle: visible pixel change, even on flat input (overlay is added).

Extended for UAT #427 (issue #123's coverage-matrix row): sweeps over
freq_ratio-equivalent (a_size vs b_size), angle_offset (a_angle/b_angle),
rotation_speed (a_rotate/b_rotate), scroll (a_scroll_x/a_scroll_y), warp
(a_liquify), and sharpness each show a *distinct* frame from defaults (not
just "some" change — each param must independently prove visible), plus a
determinism check.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest

from .conftest import per_pixel_l1_distance, run_cli_apply

EFFECT_ID = "fx.grid_moire"
MIN_L1 = 2.0


@pytest.mark.oracle
def test_grid_moire_produces_output(testsrc_clip: Path, tmp_path: Path) -> None:
    """grid_moire should add visible content to the frame."""
    out = tmp_path / "out.mp4"
    run_cli_apply(testsrc_clip, out, EFFECT_ID)

    l1 = per_pixel_l1_distance(testsrc_clip, out)

    assert l1 >= MIN_L1, (
        f"{EFFECT_ID} added no visible content (L1={l1:.2f}, need >= {MIN_L1})"
    )


@pytest.mark.oracle
@pytest.mark.parametrize(
    "param_name,params",
    [
        ("freq_ratio", {"a_size": 6, "b_size": 40}),
        ("angle_offset", {"a_angle": 0.0, "b_angle": 45.0}),
        ("rotation_speed", {"a_rotate": 8.0, "b_rotate": -8.0}),
        ("scroll", {"a_scroll_x": 15.0, "a_scroll_y": -10.0}),
        ("warp", {"a_liquify": 30.0, "a_liquify_speed": 2.0}),
        ("sharpness", {"sharpness": 1.0}),
    ],
)
def test_grid_moire_param_sweep_changes_output(
    testsrc_clip: Path, tmp_path: Path, param_name: str, params: dict
) -> None:
    """Each swept param must independently produce a visibly different frame
    from the plain default render (not just 'differs from input')."""
    out_default = tmp_path / "default.mp4"
    out_swept = tmp_path / f"{param_name}.mp4"
    run_cli_apply(testsrc_clip, out_default, EFFECT_ID)
    run_cli_apply(testsrc_clip, out_swept, EFFECT_ID, params=params)

    l1_vs_input = per_pixel_l1_distance(testsrc_clip, out_swept)
    l1_vs_default = per_pixel_l1_distance(out_default, out_swept)

    assert l1_vs_input >= MIN_L1, (
        f"{EFFECT_ID} with {param_name}={params} produced no visible content "
        f"vs input (L1={l1_vs_input:.2f})"
    )
    assert l1_vs_default >= MIN_L1, (
        f"{EFFECT_ID} sweeping {param_name}={params} had no visible effect vs "
        f"the default render (L1={l1_vs_default:.2f}) — param appears inert"
    )


def test_grid_moire_deterministic_across_two_runs():
    """Same (frame, params, frame_index, seed) run twice -> byte-identical."""
    from effects import registry

    fn = registry.get(EFFECT_ID)["fn"]
    frame = np.zeros((80, 100, 4), dtype=np.uint8)
    frame[:, :, 0] = 150
    frame[:, :, 3] = 255
    params = {"interference": 1.0, "sharpness": 0.5, "a_liquify": 10.0}

    out1, _ = fn(frame, params, None, frame_index=5, seed=7, resolution=(100, 80))
    out2, _ = fn(frame, params, None, frame_index=5, seed=7, resolution=(100, 80))
    assert np.array_equal(out1, out2), (
        f"{EFFECT_ID} is non-deterministic for identical inputs"
    )
