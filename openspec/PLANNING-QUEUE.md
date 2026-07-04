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
