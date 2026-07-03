# Roadmap — Automation Editing Suite (Ableton-parity + spatial axis) & Master-Out Bus

Added 2026-07-03. Strategy: **consume Ableton's automation editing craft, build every operator
DOMAIN-AGNOSTIC** so each gesture gets a spatial (Y/X-axis) twin Ableton structurally can't do
("automation has a shape in the frame"). Specs: `docs/plans/2026-07-03-automation-*.md`,
`docs/plans/2026-07-03-master-out-bus-prd.md`.

## SERIALIZATION CONSTRAINT (read before parallelizing)
- All **automation** packets touch `frontend/src/renderer/stores/automation.ts` → build ONE AT A TIME
  (pipeline back-to-back, merge between). They are NOT safe to run in parallel worktrees.
- All **master** packets touch the render pipeline (`pipeline.py`) + `shared/types.ts` → serial.
- The two TRACKS (automation vs master) are file-disjoint → the two pipelines run in PARALLEL.

## Automation editing suite (serial track)
| # | Packet | Scope | Status |
|---|---|---|---|
| AA.1 | Curved segments | bend/ease per segment, tension drag, Simplify re-fit | ✅ merged #386 |
| AA.5 | Clip-linked select/move | moving a clip carries its lane keyframes | ✅ built #385 (merging) |
| AA.4 | Select + move | marquee-select breakpoints, move (t+v), copy/paste, quantize | ⏳ wave-1 |
| AA.4b | Transform box | scale/**skew (drag-side-down)**/flatten/ramp, nudge, line, scale-all | 📋 needs AA.4 |
| AA.3a | Insert shape | one-click bake sine/tri/saw/square/ramp/random → breakpoints (STANDALONE) | 📋 |
| AA.2 | Modulation lanes | drawn RELATIVE layer over absolute; wire operator blend (routing.py) to a lane | 📋 differentiator |
| AA.3 | Live generators | LFO/audio-follower on a lane (over-T=LFO, over-Y=spatial ripple); needs AA.2 | 📋 |
| AA.6 | Is-automated indicator | per-control LED that a param is under an active lane | 📋 optional |

## Master-Out Bus (serial track, parallel to automation)
| # | Packet | Scope | Status |
|---|---|---|---|
| M.1 | Schema + render | Track type 'master', bootstrap+migration, post-composite apply_chain, no-op parity | ⏳ wave-1 |
| M.2 | UI | Master track row (no clips), device chain, instruments-reject guard | 📋 needs M.1 |
| M.3 | Automation on master | master-chain params automate in preview+export | 📋 needs M.1+M.2 |

## Also on the board (file-disjoint — parallelizable)
- #19 clip-thumbnail zoom-responsive (⏳ wave-1) · #20 B3 layout enable (⏳ wave-1) · #14 add-track classes (✅ #390)
- #7 Q7 harness gate-under-load fix (backend runner.py) · #15 e2e-full rehab (test files) · #9 DropZone product Q (needs user)

## Wave plan
- **wave-1 (running):** AA.4, M.1, B3-enable, thumbnails, add-track — max safe parallel on hot files.
- **wave-1b (disjoint accel):** #7 Q7 harness fix — shares no files with wave-1.
- **wave-2 (after wave-1 merges):** [AA.4b → AA.3a] on the automation track ∥ [M.2 → M.3] on the master
  track (two serial pipelines, parallel to each other).
- **wave-3:** AA.2 → AA.3 (the modulation differentiators), on merged automation base.
