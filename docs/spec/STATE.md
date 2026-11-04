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
| 2 Reference teardown | IN PROGRESS — ADOPT/READ tier DONE: 13 topic files, 161 patterns, 51 candidate additions; DEFERRED: preview-compositing, performance-midi, OBSERVE tier (REAPER/CapCut config + computer use) — budget window at 86% on 2026-11-04 | `docs/spec/patterns/` |
| 3 Cross-cutting systems ★ | — | `docs/spec/systems/` |
| 4 Feature specs | — | `docs/spec/features/` |
| 5 Decision batches ★ | — | RATIFIED-FOUNDATIONS rows |
| 6 Walkthrough prototype ★ | — | 1280×800 clickable |
| 7 /packetize | after sign-off only | — |

Progress metric: **X of 17 object specs · S of 10 surfaces · J of 8 journeys · systems N of 9** (AREAS.md v2).

## External dependencies (re-check at every ★)

- `~/Development/creatrix-lessons/ledger.jsonl` — 2026-11-04: dir exists (raw/classified/batches), no ledger yet.
- `/plan-check` skill — 2026-11-04: dir exists at `~/.claude/skills/plan-check/` but SKILL.md is the unfilled skill-creator template (all TODO). Not runnable yet. Run on each spec before presenting once it is real.

## Phase-1 log

- Mechanical inventory: `docs/spec/tools/inventory.mjs` (TS-AST) → `docs/spec/inventory/{inventory.json,INVENTORY.md}`. Regenerate: `CX_TYPESCRIPT=<…>/frontend/node_modules/typescript node docs/spec/tools/inventory.mjs`.
- Adjudicated (orchestrator, grep): orphan detector initially false-flagged TrackHeader (used as map value, Timeline.tsx:24) → fixed by counting import specifiers. ParamPanel orphan CONFIRMED (App.tsx:4015 "ParamPanel removed").
- Semantic layer: 5 sonnet readers, brief `docs/spec/tools/semantic-brief.md`, outputs `docs/spec/inventory/semantic/*.json` (clusters: roadmap-packets-specs, roadmap-core, openspec-a, openspec-b-fieldmap, plans-legacy). Each claim needs one orchestrator spot-check before it enters 01-FEATURE-MAP.md.

## ★1 owner verdicts (2026-11-04)
- Areas: owner asked for alternatives, then "as extra as possible to make sure there's no contradictions or gaps" → AREAS.md v2 four-lens structure + coverage guard; **LOCKED. Y = 17 object specs** (+10 surfaces, 8 journeys, 9 systems).
- LFO/modulation addressing bug: **fold into A08 spec** (one identity key + e2e oracle).
- Doc supersede sweep: **yes, headers only, this branch** → done (DESIGN-SPEC §3, ONBOARDING-SPEC, MASKING-INTERACTIONS ×2, ux-audit PUX.1/PUX.7, roadmap INDEX authority, mockups INDEX scale, RATIFIED D13 cite note, RECONCILIATIONS R4 stale note).
- Lost plans: **use memory + openspec, and look for Claude app chat logs.** Searched: ~/.claude/projects/**/*.jsonl (183 transcripts, oldest Oct 17 — Jul–Sep sessions aged out), Claude desktop IndexedDB/Local Storage/Session Storage/claude-code-sessions, git log --all, stashes (3), reflog, unreachable blobs, ~ name search (maxdepth 6), ~/Development/cam-stitch (README only). **Not recoverable locally.** claude.ai chats are server-side → owner can export (claude.ai Settings → Privacy → Export data) for me to search.

## Open items for the owner (accumulate; flushed at each ★)

1. Brief names `~/.claude/plans/creatrix-*.md` sources. `~/.claude/plans/` holds 5 entries, none match. Name-search of repo + ~/Development + ~/.claude + ~/Documents found none of: `creatrix-layertap-routing-prd`, `creatrix-moire-generator-bdd`, `creatrix-clip-editor-device-monitors-prd`, `creatrix-multicam-performance-brief`. Downstream content exists (openspec/changes/layertap-matte-v1, sampler-clip-editor, device-monitors-v1, chain-tap-preview; memory notes). **Multicam has no in-repo artifact.** Synth paradigm vision IS in repo: `docs/roadmap/plans/entropic-synth-paradigm-vision.md`. Ask: where do the four live now?
2. RATIFIED D13 cites `ParamPanel.tsx handleKnobChange` as an auto-reveal site; ParamPanel is unmounted dead code (App.tsx:4015). Pending reader verification of the live site.
3. Draft area taxonomy `docs/spec/AREAS.md` (23 areas) — owner confirms → fixes Y.

## Reader adjudication log
- roadmap-packets-specs (84 feat / 8 half / 3 contra / 4 OD; reader self-reports THIN coverage — headings + ground-truth tables, ~30 spot-greps):
  - ✔ CONFIRMED blocking: `docs/roadmap/packets/ux-audit.md:341` PUX.7 IBM Plex bundling vs RATIFIED D5 (verified text).
  - ✘ REFUTED half-built "Lasso: enum only, no overlay": lasso-freehand/polygon implemented in `components/preview/MaskSelectOverlay.tsx:19-25,391-436`, mounted `App.tsx:16`. Item dropped.
  - Caution: reader used `file:1` as existence cites; those are not line-level evidence and get re-cited in phase 4.
- openspec-a (43 feat / 4 half / 7 contra / 31 OD; read proposals+packets fully, skimmed plan/design-spec/uat):
  - ✔ CONFIRMED material: browser-folders `plan.md:12` "NO wells (rejected)" vs `plan.md:16` "container WELLS" — same banked "do not redesign" verdict block contradicts itself → owner question.
  - ✔ CONFIRMED OD-2: system-monitor avoids Cmd+Shift+A because `mask_deselect_all` holds it (actual line `default-shortcuts.ts:102`; proposal cites stale :86).
  - Consistent with orchestrator M4: browser folder ops store-only.
- roadmap-core (38 feat / 4 half / 24 contra (7 blocking) / 9 OD; full read of law docs, DESIGN-SPEC, ROADMAP, INDEX; skim of MASKING/SELECTION/ONBOARDING/PERF/vision):
  - ✔ CONFIRMED D13 live path: contract holds via store choke point `stores/automation.ts:1012-1018` (auto-reveal), reached from `DeviceCard.tsx:155`. D13's ParamPanel cite is stale (material doc fix, not a behavior bug).
  - ✔ CONFIRMED blocking: `MASKING-INTERACTIONS.md:236-239` hotkeys (w=wand, g=lasso, c=key) vs code+D4a (`default-shortcuts.ts:100` lasso=w; wand via KEY group `e`, `ToolRail.tsx:61`, `default-shortcuts.ts:82`).
- openspec-b-fieldmap (58 feat / 7 half / 8 contra (0 blocking) / 13 OD; proposals/plans/packets full, PRDs header-only):
  - ✔ CONFIRMED LIVE BUG (not a spec item — bug fixes continue under the freeze): modulation is TYPE-addressed on the wire (`frontend/src/shared/ipc-serialize.ts:45` sends `effect_id: effect.effectId`), backend drops unknown keys silently (`backend/src/modulation/routing.py:310-311` bare `continue`), and `LFOEditor.tsx:33` writes the instance UUID (`firstEffect.id`) → LFOEditor mappings are silent no-ops. Reader also cites ModulationMatrix.tsx:123,131 + OperatorKentaroCluster.tsx:188,201 (not independently checked). → owner: fix as bug now, or fold into A08 spec?
  - ✔ CONFIRMED: freeze/unfreeze create no undo entry (App.tsx:2420-2452, stores/freeze.ts) → open decision for undo-granularity system spec, not a bug.

## Phase-2 adjudication log
- edit-data-model reader (undo, timeline-edit, drag-drop, zoom-scroll; 44 patterns, 16 candidate additions):
  - ✔ CONFIRMED: clip move/trim push one undoable entry per pointermove — `moveClip` called inside `moveHandler` (Clip.tsx:486-539, call :524), `trimClipIn` inside `onMove` (:621-627); store actions wrap `undoable` (stores/timeline.ts:1379 comment "Guard before the undoable").
  - ✔ CONFIRMED: `application/entropic-preset` drag payload set (PresetCard.tsx:22), never read anywhere → dead drag.
  - Owner decisions surfaced: freeze-undo option A/B; ripple-trim wire vs retire; preset drag target vs remove; global edit-mode toggle vs D4a.
- interaction-core reader (selection, keyboard-focus incl. conflict-check design, context-menus, command-palette; 54 patterns, 15 additions):
  - ✔ CONFIRMED: `shortcutRegistry.setContext()` has zero callers outside utils/shortcuts.ts → all registry `context` values are inert (perform/text contexts dead).
  - ✔ CONFIRMED: App keydown returns early for INPUT/TEXTAREA/SELECT (App.tsx:1058-1059) → Cmd+S etc. dead while a field has focus.
  - ✔ CONFIRMED: no `isComposing` IME guard anywhere in src/renderer.
  - Open: OQ1 cross-track range-select (flat order vs rectangle); conflict-check 3 open questions; pointerdown-selection-collapse claim (Clip.tsx:476-485) flagged by reader as UNVERIFIED — verify in O03 spec.
  - Reader deviation: OBSERVE tier (reaper-kb.ini, Ableton) not read — deferred to OBSERVE pass.
- surfaces-devices reader (docking-workspaces, states, tokens-density, devices-params, automation-modulation; 63 patterns, 20 additions):
  - ✔ CONFIRMED: backend `effect_map` keyed by effect TYPE (`backend/src/modulation/routing.py:214-218`) → two same-type effects: second overwrites first. Reference evidence (Ardour/Surge) favors ONE instance-scoped ParamAddress {ownerKind, ownerId, paramKey[, subKey]}; counter-case (preset portability) recorded. Feeds O07 spec + phase-5 decision.
  - dockview evidence recorded neutrally (verdict c); open spikes: popout vs Electron BrowserWindow relay, `file:` URL popout restriction, bundle size.
  - Unverified reader claims to check in specs: Knob right-click reset + param context menu double-fire (Knob.tsx:149, DeviceCard.tsx:418); first-vs-last-dot param path split (routing-graph-ipc.ts:117 vs routing.py:696-711).

## NEXT SESSION — resume here
1. Re-read this file, `git log --oneline -8` on docs/spec-pass, PR #500.
2. Phase 2 remainder: patterns/preview-compositing.md, patterns/performance-midi.md (ADOPT/READ), then OBSERVE tier — REAPER on-disk config (`reaper-kb.ini`, `reaper.ini`) + CapCut, computer use only after checking ~/.claude/.locks/ for other holders.
3. Merge all 'Candidate additions' sections → docs/spec/ADDITIONS.md (owner approval list).
4. Phase 3: systems specs (9) incl. tools/coverage.mjs guard + hotkey conflict checker design from patterns/keyboard-focus.md. Run /plan-check (scratchpad config: copy configs/creatrix.json with repo_root → ~/Development/entropic-spec-pass) on each before ★2.
