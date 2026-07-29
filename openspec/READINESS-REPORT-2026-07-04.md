# READINESS REPORT — Two-Swimlane Planning Marathon (2026-07-03 → 04)

**Mode:** /marathon plan (documentation only — no build was dispatched). **All 9 changes READY.**
**54 packets** across 2 swimlanes; every packet carries scope/files/deps/risk/hard-oracle/test-plan/STOP/executor-brief; all ledgers initialized ⬜; coverage checks: zero SILENT gaps (2 explicitly-flagged, STOP-gated open items in fx-afterimage: BDD Feature-12 provenance · PK.4 preset-persistence mechanism — decisions at dispatch, nothing dropped).
**Reviewed:** /review corpus gate 2026-07-04 — 4 findings (1 P1 hotkey-verdict violation in history-panel-delta + phantom undo.ts collision + 2 report-accuracy items), ALL FIXED same pass.
**T1 record:** 39+5 decisions locked (openspec/DECISIONS-PENDING.md + each proposal.md T1-Verdicts section). Notable: LayerTap v1 = FULL §9 scope (user override) · fx.afterimage = style combo (echo|ghost, both engines) · strict FULL-tier merge gate (UD-3) everywhere.

| Change | Packets | RISK:HIGH | External blockers | Dispatchable now | Build via |
|---|---|---|---|---|---|
| wave0-prerouted-presets | 7 | PK.1 | CI standing-red (its own PK.00 fixes) | PK.00 | `/marathon wave0-prerouted-presets` |
| history-panel-delta | 6 | 0 | none | P1-P4, P6 | `/marathon history-panel-delta` |
| util-transform | 5 | 0 | App.tsx packet rebases after wave0 | PK.1, PK.3 | `/marathon util-transform` |
| fx-afterimage | 4 | 0 | shared DEPENDENT_PARAMS dedupe w/ backspin | PK.1 | `/marathon fx-afterimage` |
| fx-backspin | 5 | 1 | shared DEPENDENT_PARAMS dedupe w/ afterimage | P1 | `/marathon fx-backspin` |
| system-monitor-v1 | 6 | 1 | none | PK.1, PK.3, PK.4 | `/marathon system-monitor-v1` |
| multiwindow-stage-a | 4 | 1 | stubs against system-monitor IPC contract | PK.1 | `/marathon multiwindow-stage-a` |
| layertap-matte-v1 | 8 | 5 | **Pre-flight clause (packets.md): PLANNING-ONLY status must be explicitly lifted by user + wave0 PK.00 merged green on main before PK.1 dispatch** (file-wise disjoint from wave0 — masking ≠ modulation routing.py) | PK.1 (subject to Pre-flight) | `/marathon layertap-matte-v1` |
| browser-folders | 9 | 1 | consumes wave0 PK.2 embeddable PresetBrowser | P1, P2 | `/marathon browser-folders` |

## Fold-in 2026-07-09 — fix-wave + CU-verify outcomes (two parallel sessions)
- **Fix-wave MERGED to main (11 PRs @ 201b8ea, 2026-07-04):** #431 ZMQ render serialization · #432 B3 layout overlap · #433 tool rail · #434 sampler transparency · #437 transport icons/fonts · #438 right-click Automate · #439 mask hotkeys+draw · #441/#442 UAT test coverage · #421/#443 docs. My 8-symptom frame diagnosis was taken POST-fix-wave — symptoms stand; ui-foundation's ground mapper reads current main.
- **CU-verify session (2026-07-09): roadmap verdict GO, stages A–K, no NO-GO.** Logic layer 100% green (~19,750 tests) contingent on landing `fix/zmq-export-start-test`.
- **PK.00 RE-SCOPED (mostly done by others):** the 2 red backend tests are FIXED on local branch `fix/zmq-export-start-test` (2a6d2cd fixture stub + 9170480 AA.4 OS-pointer e2e). PK.00 collapses to: land that branch (review-run or manual merge — ship-gate) + confirm e2e shards + the `App.tsx:4373` tsc error (verify still present post-fix-wave).
- **UAT METHOD RULE (systemic finding):** drag/draw/paint journeys are verified via the Playwright OS-pointer harness, NOT synthetic computer-use (CU cannot observe OS-pointer interactions — features were passing falsely as broken). Applies to every drag-class row in the uat.md files + CU addendum. Audit gap #393 likely REFUTED — re-verify via 9170480's harness pattern.
- **UAT FOLD-IN:** the final live CU pass is UNBLOCKED (playback + mask-draw lanes fixed); drag-class rows across all uat.md files + the CU addendum now carry the OS-pointer-harness method rule; #428 (44-PR UAT campaign) = packetize UAT-PR-TRACEABILITY's remaining rows into a runnable campaign — queue after ui-foundation T1; flag-flip regression protocol (UAT-FEATURE-FLAG-AUDIT-2026-07-03.md: verify default → flip → verify → flip back, kill+relaunch for shell/store flags) becomes a STANDING UAT stage in every build change's uat.md.
- **FEATURE-FLAG ROADMAP (source: frontend/src/shared/feature-flags.ts + backend routing.py):**
  · `F_CREATRIX_LAYOUT` — B3 grid shell, default ON since #398; the legacy-layout OFF path is dead weight ui-foundation must NOT invest in — **retire the OFF path** (flag + legacy CSS) as a ui-foundation packet or immediate follow-up, after one final both-states regression pass.
  · `F_0512_*` bugfix flags (default ON) — each is a candidate for retirement once its regression row passes twice; add a flag-retirement sweep item post-ui-foundation.
  · `EXPERIMENTAL_FIELD_DST` (backend env) — stays gated until K1 ungates it by design (do not retire).
  · Rule going forward: every new flag lands with its retirement condition stated (no permanent flags).
- **USER-HAND ITEMS (cannot be automated):** merge PR #331 in the GitHub UI (wires security/code review into CI — everything future benefits) · land `fix/zmq-export-start-test` · land `docs/fixwave-verify-2026-07-04` (11 doc commits) · verdicts on #440 (bank-slot) and #428 (44-PR UAT campaign → /packetize — consumes UAT-PR-TRACEABILITY).

## Recommended build order (REVISED 2026-07-09 — user priority directive)
1. **wave0 PK.00 (RE-SCOPED above)** — land `fix/zmq-export-start-test` + residual green-up; dispatch immediately.
2. **ui-foundation** (Lane 3, queue row 10) — **USER PRIORITY #1: "i legit cant use anything like this."** The frame fix (rail craft, type hierarchy, empty states, control grouping, 4 bugs). Builds first; may run concurrently with PK.00 and merges right after it. ALL wave0 feature packets (0a, 1-5) and everything below drop behind it.
3. **wave0-prerouted-presets** (remaining packets 0a→1→4→5, 2/3 parallel).
4. **history-panel-delta** — cheapest, most-dispatchable, independent lane; good parallel stream.
3. **util-transform** — small; builds the gizmo/edge-kernel grammar layertap reuses.
4. **fx-afterimage ∥ fx-backspin** — first to land builds the shared DEPENDENT_PARAMS registry (dedupe STOP in both).
5. **system-monitor-v1** → 6. **multiwindow-stage-a** (contract order).
7. **layertap-matte-v1** — biggest (full §9, 5 HIGH packets); benefits from all prior infra.
8. **browser-folders** — last; absorbs wave0's embedded PresetBrowser as the PRESETS node.

**Standing notes for any build session:** branch from origin/main only (parallel-session hygiene; local checkout may be on a UAT branch) · Skill(review) before push (ship-gate hook) · strict FULL-tier gate per UD-3 · UAT via docs/UAT-CU-ADDENDUM-2026-07-03.md rows (PR-traced, code-grounded) · K1 marathon brief is written AFTER wave0 ships (carry the UNIFICATION later-wave register + the K1 shared curve-editor requirement).
