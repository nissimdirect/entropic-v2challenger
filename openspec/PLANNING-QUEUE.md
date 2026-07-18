# PLANNING QUEUE — /marathon plan, two swimlanes (2026-07-03)

**Mode:** planning marathon (docs only, NO build). **Orchestrator:** Fable session 33f18a30. **Sources of truth:** `docs/plans/2026-07-field-mapping/MARATHON-BRIEF-wave0-AMENDED.md` + `UNIFICATION-2026-07-03.md` (d90131d) + `~/.claude/plans/creatrix-*.md` (routing suite, 44+ banked decisions — do NOT re-design).
**Stages:** ⬜ → SPEC → PLAN → T1-LOCKED → PACKETS → READY.
**Worktree caveat:** local checkout is on the parallel UAT session's branch; all writes here are untracked docs-only. Packet branches (future builds) cut from origin/main.

## Lane 1 — field-mapping Wave 0 + U0 (decisions UD-1..UD-5 locked 2026-07-03)

| # | target | change-name | stage | decisions-pending | notes |
|---|--------|-------------|-------|-------------------|-------|
| 1 | MARATHON-BRIEF-wave0-AMENDED + 3 PRDs | wave0-prerouted-presets | READY (7 packets) | none (UD-1..5 locked) | packets 00→0a→1→4→5, 2/3 parallel |

## Lane 2 — routing design suite (INDEX build order; decisions ①–㊺ banked)

| # | target | change-name | stage | decisions-pending | notes |
|---|--------|-------------|-------|-------------------|-------|
| 2 | creatrix-layertap-routing-prd.md §9 v1 slice + BDD F6-F9 | layertap-matte-v1 | READY | verdicts in proposal.md | MatteNodeKind 'layer' + tap chip + hover-audition; blockers: masking/schema.py _VALID_KINDS, matte cache clip-keyed (UNIF reg. §3.6) |
| 3 | creatrix-transform-suite-spec.md (affine+skew only) | util-transform | READY | 4 (OD-1 edge-alias, OD-2 gizmo-extend, OD-3 DEPENDENT_PARAMS-defer, OD-4 rdp-correction) | drafter CORRECTED spec: lane-simplify ≠ rdp-simplify.ts (lasso-only) |
| 4 | creatrix-backspin-afterimage-spec.md (afterimage) | fx-afterimage | READY | verdicts in proposal.md | echo-line model + vaporwave preset; temporal-buffer budget (SG-8) |
| 5 | creatrix-backspin-afterimage-spec.md (backspin) | fx-backspin | READY | verdicts in proposal.md | stop-point modes ⑱; rings exist (copy_machine precedent) |
| 6 | creatrix-system-monitor-prd.md | system-monitor-v1 | READY | verdicts in proposal.md | MUST re-scope per UNIF finding #70: _effect_timing is TYPE-keyed global, not per-instance |
| 7 | creatrix-multiwindow-prd.md Stage A | multiwindow-stage-a | READY | verdicts in proposal.md | monitor = first true OS window; precedent = pop-out (only 2 BrowserWindows exist, read-only preload) |
| 8 | creatrix-browser-folders-spec.md | browser-folders | READY | 6 (OD-1 dual-tab-delete, OD-2 UserFolder-delete, OD-3 favorites-reuse, OD-4 ledger-exempt, OD-5 GENERATORS-real-leaves, OD-6 UTILITIES-no-stubs) | 9 packet candidates |
| 9 | creatrix-history-panel-spec.md (delta MINUS Ledger rule) | history-panel-delta | READY | verdicts in proposal.md | Ledger rule/lint = Wave-0 Packet 0a (dedupe); this = Cmd+Y + dock + breadcrumb + row icons + memory smoke |

**Ranking rationale:** Lane 1 first (user-locked). Lane 2 order = INDEX build order minus item 1 (Ledger → lane 1 Packet 0a); browser-folders after Wave-0 Packet 2 lands (embeds it); history-panel-delta cheapest, any time.
**Cross-lane constraint:** lane-2 changes touching `operators.ts`/`modulation/routing.py` rebase after Wave-0 merge (UNIFICATION single-flight rule).


**2026-07-04: ALL 9 READY — see READINESS-REPORT-2026-07-04.md. Planning marathon COMPLETE.**

## Addendum 2026-07-09 — Lane 3: ui-foundation (USER PRIORITY — "i legit cant use anything like this")

> Rescued into the tracked file 2026-07-18 (was an uncommitted local edit — #443 lesson).
> If the authoring session commits its own copy, keep THEIRS on conflict.

| # | target | change-name | stage | decisions-pending | notes |
|---|--------|-------------|-------|-------------------|-------|
| 10 | Fable CDO live-app audit (8-symptom diagnosis) + B3 PRD + shipped ToolRail #433 | ui-foundation | **READY (2026-07-10)** — 7 packets PK.A-G w/ mandatory UAT units, 26 UAT rows + DoD journey, design-spec.md (9§, all-token), frame mock verified at v12 bar (Fable eyes) + /review APPROVE. VISUAL-PENDING at mock review: OD-1 type A/B pick · OD-3 icon keep/rework ×14 (+ Hand/Zoom glyph gap, LO/LO collision) | Verdicts: OD-3 dims locked + ICON SEMANTIC AUDIT added (user challenged glyph choices) · OD-4 OVERRIDE minimal-hint-only · OD-1 RESOLVED: SCALE B (15/13/12/11, locked 2026-07-10) · OD-2/5/6/7 provisional w/ MID-ROADMAP DESIGN REVIEW checkpoint | THE FRAME: rail refinement (rail EXISTS since #433 — craft doesn't), 3-tier type hierarchy, empty states, control-strip grouping, clipped-panel/browser-chip/zoom-pill/transport bugs. **Build order: FIRST feature build after wave0 PK.00 (CI green) — supersedes prior build-order item 2.** DELIVERABLES beyond proposal/plan/packets/uat: `design-spec.md` (quantified: type-scale table, rail dims, spacing, empty-state anatomy — every value a --cx token) + `docs/mockups/ui-foundation-frame.html` (full-frame before/after mock at v12 bar). LOCKED DESIGN PRINCIPLE (user-aligned, learning #245): hierarchy INSIDE the mono/terminal identity — weight/size/color tiers of JetBrains Mono, no soft UI font. LOCKED MOCK RULE (user 2026-07-09): REAL-INVENTORY-ONLY — every component in the mock exists in code or a locked plan; every icon is the actual asset EXTRACTED from source (tool-icons.tsx 14 Block glyphs verbatim, decision-㊺ rail glyphs, history op-class set) — no invented widgets, no redrawn approximations. |

## Addendum 2026-07-18 — Lane 4: clip editor + device monitors (verdicts locked same day)

Source PRD: `~/.claude/plans/creatrix-clip-editor-device-monitors-prd.md` (8 user verdicts
LOCKED 2026-07-18 — §8). Change docs: `openspec/changes/{sampler-clip-editor,
device-monitors-v1,chain-tap-preview}/`.

| # | target | change-name | stage | decisions-pending | notes |
|---|--------|-------------|-------|-------------------|-------|
| 11 | PRD F1 + T1 tier | sampler-clip-editor | READY (6 packets) | OD-1 grid-anchor reading (confirm at mock) · OD-2/3/4 recommended defaults | FrameStrip shared widget (also fx-backspin's stop_frame selector); closes B3.1's dropped loop-UI checklist (`phase-5a.md:417`); drag-from-timeline; right-click Crop bake (P5 RISK:HIGH) |
| 12 | PRD F2/T2 + tap primitive | device-monitors-v1 | READY (5 packets + 2 pre-dispatch gates) | OD-1 registry ownership (supersede-check vs system-monitor-v1) · OD-2/3/4 defaults | **BLOCKING: joint tap-schema review w/ layertap-matte-v1 §9 before P2**; zmq_server.py single-flight; sub-part-addressing monitor policy via new `monitor_default` registry field |
| 13 | PRD T3 | chain-tap-preview | READY (2 packets) | OD-1 id-anchored taps (recommended) | Thin cap; deps device-monitors-v1 P2+P3; closes field-mapping ARCHITECTURE.md:99 tap-point 🌱 for the preview consumer |

**Lane-4 build slot (user-locked):** after wave0 PK.00 → ui-foundation; then 11 → 12 → 13.
**Cross-lane:** rows 12/13 share MonitorPanel/tap infra with layertap (joint schema) and the
panel registry with system-monitor-v1 (OD-1 supersede-check); Lane-4 rows touch NEITHER
`operators.ts` NOR `modulation/routing.py` (wave0 rebase rule N/A).
