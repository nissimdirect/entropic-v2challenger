# Creatrix — Comprehensive UAT Audit (2026-07-03)

**Method:** read-only source mapping of the ENTIRE app surface by 6 parallel agents (no app/test/build
executed). ~780 interaction rows across 6 subsystem clusters, each covering happy · negative/error ·
edge/boundary · state-sequence chaos · **composability** (the #1 real-world failure class) · acceptance
criteria. This is the discovery artifact for the live CU-UAT session (separate session). It pairs with
`docs/UAT-PLAN-2026-07-02-live-cu.md` (Stages A–K + N/E/X/C).

## Scope mapped
| Cluster | Surface | Full matrix source |
|---|---|---|
| Import/Library/Onboarding/Project-start | ingest, drag-drop, new/open/save, autosave/crash-recovery, relink | uat-map-import |
| Timeline/Tracks/Clips | add/move/trim/split/ripple/lock/marquee/zoom/quantize/undo | uat-map-timeline |
| Effects/Device-chain | 172 effects, browse/add/reorder/params/freeze/flatten/mask/composite/AB/groups | uat-map-effects |
| Audio/Instruments/Text/Performance | playback/meters/sync, sampler/racks/freeze-FSM, text overlays, baking | uat-map-audio |
| Masking/Operators/Routing/MIDI | mask tools+AI matte, operators/modulation, routing canvas, CC-learn/banks | uat-map-masking |
| Export/Persistence/Memory/Shell | codecs/queue/cancel, .glitch round-trip, pressure, layout/transport/statusbar | uat-map-export |

(Full row-level matrices are preserved in the audit run; this doc is the synthesis + bug register + gates.)

## CONFIRMED BUGS (orchestrator-adjudicated with file:line evidence) — fix before "complete"
| ID | Sev | Bug | Evidence |
|---|---|---|---|
| #29 | P0 | ripple-delete / ripple-trim / split don't rebase clip-transform automation (my #17 fix covered only moveClip) | `shiftClipTransformLaneTimes` called only at timeline.ts:1325/1342; 0 calls in ripple/split |
| #30 | P0 | `loadProject()` unsaved-changes check is a DEFERRED NO-OP → silent data-loss on WelcomeScreen / open-recent / any non-menu load | project-persistence.ts:1826-1829 (`// requires a custom dialog (deferred)`); only App.tsx setPendingNav guards |
| B7 (#31) | P1 | corrupt/rejected project load is `console.error` only — no user toast (silent failure) | project-persistence.ts:1847 |
| C15 (#31) | P1 | same `OperatorMapping.depth` clamped `[0,1]` in Modulation Matrix vs `[-1,1]` in Routing Canvas → negative depth misrepresented | ModulationMatrix.tsx:187-188 vs EdgeInspector.tsx:33-34 |
| E18 (#31) | P0-gap | MIDImix factory CC map (`MIDIMIX_FACTORY_PROFILE`/`applyControllerProfile`) is ORPHANED — zero UI call sites; can't be loaded (explains the "verify MIDImix vs hardware" blocker) | grep components/ = empty |

## FLAGGED (strong code evidence, verify-then-fix — full list in task #31)
- **Export NOT memory-pressure-gated** (P0 product-call): export may use degraded caches → export≠preview parity risk.
- **F7** (P0-candidate): Routing-Canvas drag-to-connect skips the cycle pre-flight that OperatorRack enforces → user can create a routing cycle one path blocks.
- **F2** (P0-verify): a MIDI-bank hardware knob move is a "transient overlay, never a store write" → may NOT be captured into an armed automation lane (hardware-CC vs automation-record gap).
- Freeze cutIndex has no chain-mutation invalidation (effects rows 85-87,113); device-group dangling ids on delete; no server-side double-bake lock (instrument+performance); orphaned freeze/bake state on track-delete; text no wrap/length guard; silent font fallback; no PortAudio-missing message; MIDI-learn no arm-timeout + silent CC-binding-steal; eyedropper silent black fallback; operator/mapping caps fail silently (no toast); export permission/disk-full generic errors.

## CROSS-CUTTING GATES (the audit's highest-value themes — a green happy-path with any of these failing is NO-GO)
1. **Preview == Export parity** across ALL payload categories (operators, automation, transform, masks, master_chain, audio mux) on ONE project exercising all of them (export E2). Known open: #28 (non-[0,1] clamp), #26 (sg3 lane preview/export), export-not-pressure-gated.
2. **Automation/footage coherence** under EVERY clip op (move ✓, ripple ✗ #29, split ✗ #29).
3. **No silent data-loss**: load-over-unsaved (#30), corrupt-load (B7), CC-binding-steal (E4), font-fallback (row 86) all currently silent.
4. **Composability / order-sensitivity**: effect A→B ≠ B→A verified for ≥10 pairs; stateful effects keep per-position state across reorders; automation×modulation×operator×hardware precedence on one param is DEFINED not render-order-accidental (F2/F3/C17).
5. **Resource caps degrade gracefully** with a toast (64 tracks, 10 effects, 50 layers, 64 operators, 4096 freeze-queue) — several cap-hits are currently silent no-ops (C2/C3, audio clip cap).
6. **Master-Out Bus** processes only the composited RGBA; empty master chain byte-identical; master automation must NOT contaminate same-type clip effects (verified fixed, re-check live).

## GO / NO-GO
GO requires: the 5 CONFIRMED bugs above fixed or explicitly accepted; every gate-1..6 spot-checked live;
the #31 flagged register triaged (each verified fixed or ticketed). NO-GO if any preview≠export parity
break, any silent data-loss path, or any composability/order-sensitivity failure survives.

## Notes
- The full N/E/X/C completeness rows + Stages I/J/K for this-session features live in the live-CU plan.
- Schema correction: the ".glitch" project is 8 required + 10 optional fields (NOT "13-field" — plan corrected).
