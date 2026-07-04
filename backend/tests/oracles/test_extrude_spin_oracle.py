"""Oracle for fx.extrude_spin (#369, UAT #427) — "The Object" 3D photocopy.

Covers: render smoke at DEFAULTS (construction=extrude, machine=toner), at
non-default param points (construction=voxels, machine=sobel), and that
consecutive frames a few apart are non-identical (the object spins + the
tempo curve advances prints) — the CU+ORACLE row in the coverage matrix
calls for "sweep depth/rotation 2+ frames -> non-identical to each other".
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest

from .conftest import per_pixel_l1_distance, run_cli_apply

EFFECT_ID = "fx.extrude_spin"
MIN_L1 = 2.0


@pytest.mark.oracle
def test_extrude_spin_visible_at_defaults(testsrc_clip: Path, tmp_path: Path) -> None:
    """Defaults (extrude, toner, generations=120) must visibly alter the frame."""
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
        pytest.param({"construction": "voxels", "machine": "sobel"}, id="voxels-sobel"),
        pytest.param(
            {"construction": "points", "camera_distance": 3.0, "spin_rate": 3.0},
            id="points-fast-spin-close-camera",
        ),
    ],
)
def test_extrude_spin_visible_at_non_default_points(
    testsrc_clip: Path, tmp_path: Path, params: dict
) -> None:
    out = tmp_path / "non_default.mp4"
    run_cli_apply(testsrc_clip, out, EFFECT_ID, params=params)

    l1 = per_pixel_l1_distance(testsrc_clip, out)

    assert l1 >= MIN_L1, (
        f"{EFFECT_ID} with params={params} produced no visible change "
        f"(L1={l1:.2f}, need >= {MIN_L1})"
    )


def _make_frame() -> np.ndarray:
    frame = np.zeros((120, 160, 4), dtype=np.uint8)
    frame[:, :, 3] = 255
    # Ink mask thresholds luminance > 110 — paint a bright ring so geometry
    # construction has real (non-degenerate) structure to extrude/spin.
    yy, xx = np.mgrid[0:120, 0:160]
    ring = ((xx - 80) ** 2 / 60.0**2) + ((yy - 60) ** 2 / 40.0**2) - 1.0
    frame[np.abs(ring) < 0.15, :3] = 220
    return frame


def test_extrude_spin_frames_apart_are_non_identical():
    """Frames several ticks apart (spin advances, tempo curve prints new copies)
    must differ from each other — a frozen/no-op render would be a real bug."""
    from effects import registry

    fn = registry.get(EFFECT_ID)["fn"]
    frame = _make_frame()
    params = {"construction": "extrude", "machine": "toner", "ms_per_frame": 33.333}

    state = None
    outputs = []
    # ms_per_frame=33.33 => frame 0, 15, 30 span ~0, 500ms, 1000ms of spin/print time
    for idx in (0, 15, 30):
        out, state = fn(
            frame, params, state, frame_index=idx, seed=7, resolution=(160, 120)
        )
        outputs.append(out.copy())

    assert not np.array_equal(outputs[0], outputs[1]), (
        "fx.extrude_spin frame 0 and frame 15 are byte-identical — spin/print "
        "schedule appears frozen"
    )
    assert not np.array_equal(outputs[1], outputs[2]), (
        "fx.extrude_spin frame 15 and frame 30 are byte-identical — spin/print "
        "schedule appears frozen"
    )


def test_extrude_spin_deterministic_across_two_runs():
    """Same (frame, params, frame_index, seed) sequence run twice, from a fresh
    state each time -> byte-identical output at every step."""
    from effects import registry

    fn = registry.get(EFFECT_ID)["fn"]
    frame = _make_frame()
    params = {"construction": "extrude", "machine": "toner"}

    def _run():
        state = None
        outs = []
        for idx in (0, 10, 20):
            out, state = fn(
                frame, params, state, frame_index=idx, seed=7, resolution=(160, 120)
            )
            outs.append(out.copy())
        return outs

    run1 = _run()
    run2 = _run()
    for i, (a, b) in enumerate(zip(run1, run2)):
        assert np.array_equal(a, b), (
            f"fx.extrude_spin non-deterministic at step {i} for identical inputs"
        )
