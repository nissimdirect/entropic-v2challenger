"""Oracle for fx.copy_machine (#368, UAT #427).

Copy Machine has 9 machines (toner/photocopy/spread/halftone/atkinson/riso/
fax/ascii/random) and two temporal modes (stateless `generation`, stateful
`feedback`). Covers:

  * render smoke at DEFAULTS (machine=toner, generation=12, feedback=False) —
    the "invisible at defaults" incident means defaults must be checked
    explicitly, not assumed visible because *some* param point is visible;
  * render smoke at 2 non-default param points (ascii machine, feedback=True);
  * determinism: same (frame, seed) twice -> identical output.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest

from .conftest import per_pixel_l1_distance, run_cli_apply

EFFECT_ID = "fx.copy_machine"
MIN_L1 = 2.0


@pytest.mark.oracle
def test_copy_machine_visible_at_defaults(testsrc_clip: Path, tmp_path: Path) -> None:
    """Defaults (toner, generation=12, feedback=off) must visibly alter the frame.

    Regression guard for the "invisible at defaults" class of bug (see
    docs/plans/2026-07-02-month-audit-fix-plan.md — 3 prior effects shipped
    with a no-op default).
    """
    out = tmp_path / "defaults.mp4"
    run_cli_apply(testsrc_clip, out, EFFECT_ID)

    l1 = per_pixel_l1_distance(testsrc_clip, out)

    assert l1 >= MIN_L1, (
        f"{EFFECT_ID} at DEFAULTS produced no visible change (L1={l1:.2f}, "
        f"need >= {MIN_L1}) — invisible-at-defaults finding"
    )


@pytest.mark.oracle
@pytest.mark.parametrize(
    "params",
    [
        pytest.param(
            {"machine": "ascii", "cell_size": 10, "glyph_set": "blocks"},
            id="ascii-machine",
        ),
        pytest.param(
            {"feedback": True, "feedback_amount": 0.5, "generation": 40},
            id="feedback-mode",
        ),
        pytest.param({"machine": "riso", "color_mode": "color"}, id="riso-color"),
    ],
)
def test_copy_machine_visible_at_non_default_points(
    testsrc_clip: Path, tmp_path: Path, params: dict
) -> None:
    out = tmp_path / "non_default.mp4"
    run_cli_apply(testsrc_clip, out, EFFECT_ID, params=params)

    l1 = per_pixel_l1_distance(testsrc_clip, out)

    assert l1 >= MIN_L1, (
        f"{EFFECT_ID} with params={params} produced no visible change "
        f"(L1={l1:.2f}, need >= {MIN_L1})"
    )


def _apply_direct(params: dict, frame_index: int = 0, seed: int = 7):
    from effects import registry

    fn = registry.get(EFFECT_ID)["fn"]
    frame = np.zeros((64, 96, 4), dtype=np.uint8)
    frame[:, :, 0] = 200
    frame[:, :, 1] = 90
    frame[:, :, 2] = 40
    frame[:, :, 3] = 255
    # a checkerboard so machines with edge/luminance response (photocopy,
    # halftone, ascii) have real structure to react to, not a flat fill
    frame[::4, ::4, :3] = 20
    return fn(
        frame, params, None, frame_index=frame_index, seed=seed, resolution=(96, 64)
    )


def test_copy_machine_deterministic_across_two_runs():
    """Same (frame, params, frame_index, seed) run twice -> byte-identical output."""
    params = {"machine": "toner", "generation": 12.0}
    out1, _ = _apply_direct(params)
    out2, _ = _apply_direct(params)
    assert np.array_equal(out1, out2), (
        "fx.copy_machine is non-deterministic for identical inputs — "
        "a per-pass RNG seed is likely not keyed on (seed, frame_index, pass)"
    )
