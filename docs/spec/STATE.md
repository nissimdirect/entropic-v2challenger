# SPEC PASS — STATE (source of truth across sessions/compactions)

Branch `docs/spec-pass` (worktree `~/Development/entropic-spec-pass`, cut from origin/main 4dc01de).
PLANNING ONLY — no product code. PR opens against main; **owner merges, never the agent.**
Brief: `~/.claude/dispatch/2026-11-04/p5-creatrix-planning.md`.

## Pre-phase verdicts (owner, 2026-11-04)

| Q | Verdict |
|---|---------|
| (a) Freeze new UI work during the pass | **YES** — bug fixes, backend, test/ratchet debt continue |
| (b) Scope | **Existing + already-planned only** (REAL-INVENTORY-ONLY). Teardown ideas → `docs/spec/ADDITIONS.md`, owner approval before any are specced |
| (c) Foundation (React Aria + dockview vs hand-rolled) | **DECIDE AFTER TEARDOWN** — phases 1–2 stay library-neutral; returns as a phase-5 decision with evidence |

These become RATIFIED-FOUNDATIONS rows in phase 5 (process verdicts, recorded with the batch).

## Phase status

| Phase | Status | Output |
|---|---|---|
| 1 Inventory ★ | IN PROGRESS | `docs/spec/tools/inventory.mjs` → `docs/spec/inventory/` ; `docs/spec/01-FEATURE-MAP.md` |
| 2 Reference teardown | — | `docs/spec/patterns/` |
| 3 Cross-cutting systems ★ | — | `docs/spec/systems/` |
| 4 Feature specs | — | `docs/spec/features/` |
| 5 Decision batches ★ | — | RATIFIED-FOUNDATIONS rows |
| 6 Walkthrough prototype ★ | — | 1280×800 clickable |
| 7 /packetize | after sign-off only | — |

Progress metric: **X of Y areas specced** (Y fixed at end of phase 1).

## External dependencies (re-check at every ★)

- `~/Development/creatrix-lessons/ledger.jsonl` — 2026-11-04: dir exists (raw/classified/batches), no ledger yet.
- `/plan-check` skill — 2026-11-04: dir exists at `~/.claude/skills/plan-check/` but SKILL.md is the unfilled skill-creator template (all TODO). Not runnable yet. Run on each spec before presenting once it is real.

## Phase-1 log

- Mechanical inventory: `docs/spec/tools/inventory.mjs` (TS-AST) → `docs/spec/inventory/{inventory.json,INVENTORY.md}`. Regenerate: `CX_TYPESCRIPT=<…>/frontend/node_modules/typescript node docs/spec/tools/inventory.mjs`.
- Adjudicated (orchestrator, grep): orphan detector initially false-flagged TrackHeader (used as map value, Timeline.tsx:24) → fixed by counting import specifiers. ParamPanel orphan CONFIRMED (App.tsx:4015 "ParamPanel removed").
- Semantic layer: 5 sonnet readers, brief `docs/spec/tools/semantic-brief.md`, outputs `docs/spec/inventory/semantic/*.json` (clusters: roadmap-packets-specs, roadmap-core, openspec-a, openspec-b-fieldmap, plans-legacy). Each claim needs one orchestrator spot-check before it enters 01-FEATURE-MAP.md.

## Open items for the owner (accumulate; flushed at each ★)

1. Brief names `~/.claude/plans/creatrix-*.md` sources. `~/.claude/plans/` holds 5 entries, none match. Name-search of repo + ~/Development + ~/.claude + ~/Documents found none of: `creatrix-layertap-routing-prd`, `creatrix-moire-generator-bdd`, `creatrix-clip-editor-device-monitors-prd`, `creatrix-multicam-performance-brief`. Downstream content exists (openspec/changes/layertap-matte-v1, sampler-clip-editor, device-monitors-v1, chain-tap-preview; memory notes). **Multicam has no in-repo artifact.** Synth paradigm vision IS in repo: `docs/roadmap/plans/entropic-synth-paradigm-vision.md`. Ask: where do the four live now?
2. RATIFIED D13 cites `ParamPanel.tsx handleKnobChange` as an auto-reveal site; ParamPanel is unmounted dead code (App.tsx:4015). Pending reader verification of the live site.
3. Draft area taxonomy `docs/spec/AREAS.md` (23 areas) — owner confirms → fixes Y.
