# UAT Stage: New Effects — Copy Machine, 3D Extrude+Spin, Transitions v2, Grid Moire

**Issue:** #427 (closes). **Effects covered:** fx.copy_machine (#368), fx.extrude_spin (#369),
fx.transition_column_cascade / fx.transition_column_cascade_reverse / fx.transition_row_waterfall (#370),
fx.grid_moire (#123).

**Context:** these effects shipped merged with zero UAT. This stage adds render + preview==export
parity coverage for all four families, following the proven parity pattern in
`backend/tests/test_export_parity.py` (`test_export_vs_preview_per_pixel_delta_within_tolerance`).

**PLAY-CU-UAT rule applied:** a feature is covered in UAT only if a user can REACH and USE it by
driving the running app — a grep-based "COVERED" is wrong. Every effect below therefore has both an
AUTOMATED row (backend oracle test, runs in CI) and a CU-MANUAL row (browser-reachability + perceptual
check, requires a human/computer-use session against the running Electron app — not run in this PR).

## fx.copy_machine (#368)

| # | Checkpoint | Mode | Status | Evidence |
|---|---|---|---|---|
| 1 | GIVEN a frame, WHEN copy_machine applied at DEFAULTS (machine=toner, generation=12, feedback=off), THEN output visibly differs from input | AUTOMATED | PASS | `backend/tests/oracles/test_copy_machine_oracle.py::test_copy_machine_visible_at_defaults` |
| 2 | GIVEN non-default params (ascii machine / feedback mode / riso+color), THEN each visibly alters the frame | AUTOMATED | PASS | `test_copy_machine_visible_at_non_default_points` (3 param points) |
| 3 | GIVEN identical (frame, params, seed), WHEN run twice, THEN byte-identical output | AUTOMATED | PASS | `test_copy_machine_deterministic_across_two_runs` |
| 4 | GIVEN feedback=True across multiple frames, WHEN exported vs previewed, THEN pixel-identical (<=2/255) | AUTOMATED | PASS | `backend/tests/test_new_effects_export_parity.py::test_copy_machine_export_preview_parity_feedback_mode` |
| 5 | GIVEN stateless defaults, WHEN exported vs previewed, THEN pixel-identical | AUTOMATED | PASS | `test_copy_machine_export_preview_parity_stateless_defaults` |
| 6 | GIVEN the Effects Browser in the running app, WHEN user searches "Copy Machine", THEN it appears in the `codec_archaeology` category and can be added to a clip with all params editable (machine dropdown, generation slider, feedback toggle) | CU-MANUAL | NOT RUN | Requires computer-use session — see "How to run CU-MANUAL rows" below |
| 7 | GIVEN generation automated 0->120 across a clip, WHEN played in preview, THEN degradation visibly compounds; export matches preview at 2-3 sampled frames | CU-MANUAL | NOT RUN | Same |

## fx.extrude_spin (#369)

| # | Checkpoint | Mode | Status | Evidence |
|---|---|---|---|---|
| 1 | GIVEN a frame, WHEN extrude_spin applied at DEFAULTS (extrude, toner), THEN output visibly differs from input | AUTOMATED | PASS | `backend/tests/oracles/test_extrude_spin_oracle.py::test_extrude_spin_visible_at_defaults` |
| 2 | GIVEN non-default params (voxels+sobel / points+fast-spin), THEN each visibly alters the frame | AUTOMATED | PASS | `test_extrude_spin_visible_at_non_default_points` (2 param points) |
| 3 | GIVEN frames 15 and 30 ticks apart, THEN they are non-identical (spin/print schedule advances, not frozen) | AUTOMATED | PASS | `test_extrude_spin_frames_apart_are_non_identical` |
| 4 | GIVEN identical (frame, params, seed) sequence, WHEN run twice, THEN byte-identical at every step | AUTOMATED | PASS | `test_extrude_spin_deterministic_across_two_runs` |
| 5 | GIVEN geometry + print-cache state threaded across frames, WHEN exported vs previewed, THEN pixel-identical (<=2/255) at 3 sampled frames | AUTOMATED | PASS | `backend/tests/test_new_effects_export_parity.py::test_extrude_spin_export_preview_parity` |
| 6 | GIVEN the Effects Browser, WHEN user adds "3D Extrude + Spin" (physics category), THEN construction/machine/spin_rate/camera_distance params are editable and preview animates the spin | CU-MANUAL | NOT RUN | Requires computer-use session |

## Transitions v2 — fx.transition_column_cascade / _reverse / fx.transition_row_waterfall (#370)

Contract note (see module docstrings): real two-layer compositing does not exist yet, so these run
inside the existing single-frame effect contract — `frame_a` (outgoing) is solid black, `frame_b`
(incoming) is the frame argument, `progress = frame_index / duration_frames` clamped to [0,1].

| # | Checkpoint | Mode | Status | Evidence |
|---|---|---|---|---|
| 1 | GIVEN DEFAULTS (duration_frames=30), WHEN applied at frame 0, THEN output visibly differs from input (frame is solid black, per contract) | AUTOMATED | PASS | `backend/tests/oracles/test_transitions_oracle.py::test_transition_visible_at_defaults` (all 3 transitions) |
| 2 | GIVEN t=0, THEN output == frame_a (solid black), alpha passed through unchanged | AUTOMATED | PASS | `test_transition_boundary_frames` |
| 3 | GIVEN t=1 (frame_index == duration_frames), THEN output == frame_b, byte-identical to the source frame | AUTOMATED | PASS | `test_transition_boundary_frames` |
| 4 | GIVEN the midpoint, THEN output differs from both t=0 and t=1 (genuine partial reveal) | AUTOMATED | PASS | `test_transition_boundary_frames` |
| 5 | GIVEN identical inputs, WHEN run twice, THEN byte-identical | AUTOMATED | PASS | `test_transition_deterministic_across_two_runs` |
| 6 | GIVEN export vs preview at t=0/mid/t=1, THEN pixel-identical (<=2/255) | AUTOMATED | PASS | `backend/tests/test_new_effects_export_parity.py::test_transition_export_preview_parity` (parametrized over all 3) |
| 7 | GIVEN two clips in the running app with a transition applied between them, WHEN played, THEN the preview animates the reveal at the cut; export matches preview mid-transition and differs from a hard cut | CU-MANUAL | NOT RUN | Requires computer-use session — this is the ONE checkpoint the automated suite cannot prove, since real two-layer compositing (the actual "between two clips" case) is not yet implemented; today's contract substitutes solid black for the outgoing clip |

## fx.grid_moire (issue #123)

| # | Checkpoint | Mode | Status | Evidence |
|---|---|---|---|---|
| 1 | GIVEN DEFAULTS, WHEN applied, THEN moire pattern visibly added to the frame | AUTOMATED | PASS (pre-existing) | `backend/tests/oracles/test_grid_moire_oracle.py::test_grid_moire_produces_output` |
| 2 | GIVEN each of freq_ratio / angle_offset / rotation_speed / scroll / warp / sharpness swept independently, THEN each visibly changes the output vs the default render (not just vs input) | AUTOMATED | PASS | `test_grid_moire_param_sweep_changes_output` (6 param points) |
| 3 | GIVEN identical inputs, WHEN run twice, THEN byte-identical | AUTOMATED | PASS | `test_grid_moire_deterministic_across_two_runs` |
| 4 | GIVEN export vs preview, THEN pixel-identical (<=2/255) | AUTOMATED | PASS | `backend/tests/test_new_effects_export_parity.py::test_grid_moire_export_preview_parity` |
| 5 | GIVEN the Effects Browser (generator category), WHEN user adds "Grid Moire" and sweeps mesh A/B size, angle, rotate, scroll, liquify sliders, THEN preview updates live and export matches | CU-MANUAL | NOT RUN | Requires computer-use session |

## Invisible-at-defaults findings

None. All four effect families produced a visible change (L1 >= 2.0 per-pixel, or a non-degenerate
byte diff for direct-call tests) at their DEFAULT parameter values. No bugs filed for this class.

## How to run the CU-MANUAL rows

1. `cd frontend && npm start` (launches the Electron app).
2. Request computer-use access for "Electron".
3. For each effect above: open the Effects Browser, search by name, drag/add to a clip, confirm the
   listed params render and are editable, confirm the preview visibly changes, then export a short
   range and spot-check 2-3 frames against the preview (screenshot vs decoded export frame).
4. Record PASS/FAIL + screenshot references back into this table.

## Coverage-matrix note

`docs/UAT-COVERAGE-MATRIX-2026-07-03.md` (rows #368/#369/#370, and #123's row) is the file issue #427
asks this PR to update from GAP to covered-by-reference. That file does not exist on `origin/main` at
the time of this PR — it was created in a local, unpushed commit on a separate session's working
branch (`docs/uat-live-cu-stage-a-results`, local HEAD `fcb76be`, remote still at `d90131d`), with no
open PR. Recreating it here would risk diverging from that session's in-flight content. Once that
branch is pushed/merged, update its #368/#369/#370/#123 rows from GAP to reference this doc and the
AUTOMATED test IDs above (the CU-MANUAL rows should stay GAP/pending until a computer-use pass runs).
