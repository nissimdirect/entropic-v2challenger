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

## Recommended build order (dependency- + value-ranked)
1. **wave0-prerouted-presets** — user-locked first; its PK.00 (CI full-green) unblocks the strict merge gate for EVERYTHING.
2. **history-panel-delta** — cheapest, most-dispatchable, independent lane; good first parallel stream.
3. **util-transform** — small; builds the gizmo/edge-kernel grammar layertap reuses.
4. **fx-afterimage ∥ fx-backspin** — first to land builds the shared DEPENDENT_PARAMS registry (dedupe STOP in both).
5. **system-monitor-v1** → 6. **multiwindow-stage-a** (contract order).
7. **layertap-matte-v1** — biggest (full §9, 5 HIGH packets); benefits from all prior infra.
8. **browser-folders** — last; absorbs wave0's embedded PresetBrowser as the PRESETS node.

**Standing notes for any build session:** branch from origin/main only (parallel-session hygiene; local checkout may be on a UAT branch) · Skill(review) before push (ship-gate hook) · strict FULL-tier gate per UD-3 · UAT via docs/UAT-CU-ADDENDUM-2026-07-03.md rows (PR-traced, code-grounded) · K1 marathon brief is written AFTER wave0 ships (carry the UNIFICATION later-wave register + the K1 shared curve-editor requirement).
