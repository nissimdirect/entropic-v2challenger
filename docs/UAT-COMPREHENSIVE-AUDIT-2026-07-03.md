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

---

# GAP ENRICHMENT (ultrathink pass, 2026-07-03) — surfaces the 6 matrices MISSED, all grep-verified to exist

The six clusters were organized around the store map; these user-facing surfaces fell between them.
Every item below was verified present in the codebase before being added (no phantom rows).

## G1 — Preview direct manipulation (BoundingBoxOverlay + SnapGuides) — P0 cluster, entirely missed
Select clip → box handles on the preview canvas: drag to move, corner-scale, rotate; SnapGuides render;
keyframe capture into clip-transform lanes (A1/A2) while dragging; aspect alignment (F_0512_12 contain-fit
must match visible canvas); z-order/pointer precedence vs MaskSelectOverlay (both live on the preview —
which wins when a mask tool is armed?); drag clamp off-canvas; undo granularity per gesture; transforms
render identically in export (parity).

## G2 — Markers (full CRUD exists: addMarker/removeMarker/renameMarker, timeline.ts:237-240)
Add/remove/RENAME a marker; markers persist in .glitch; clip-drag snaps to markers (Clip.tsx snapPosition);
marker at t=0/end; many markers perf; marker + loop-region interplay; rename to empty/unicode.

## G3 — Undo History overlay (Edit → Undo History, F-0514-18)
Opens as floating overlay; entries render for a long session (500-cap display); close; open during an
active gesture; empty state ("No actions yet").

## G4 — Preferences/Settings + Help → Keyboard Shortcuts (F_0512_37)
Help→Keyboard Shortcuts opens Preferences ON the Shortcuts tab; every preference toggles + persists;
dialog under cramped layout.

## G5 — Native menu sweep (61 items, main/menu.ts)
EVERY menu item fires or is contextually disabled; guards honored via menu path (Delete Selected Track on
Master → store guard + toast; locked-track items; export items with empty timeline); Adjustments/Select/
Clip/Timeline/View/Window menus each exercised once; menu state vs WelcomeScreen (items that assume a
project); duplicateClip via menu/shortcut.

## G6 — Toast system itself (stores/toast.ts contracts)
2s dedup by source; max 5 visible, oldest non-persistent evicted; error toasts carry source; state-level
toasts manual-dismiss-only; messages rendered as text nodes (XSS regression row); toast flood under chaos.

## G7 — Engine lifecycle & crash recovery (watchdog.ts, diagnostics-handlers.ts, support-bundle.ts)
Kill sidecar mid-session → 1s-heartbeat 3-miss auto-restart → statusbar connected→disconnected→restarting→
connected AND working state recovers (chain re-applies, next render works); kill mid-EXPORT → job fails
gracefully, partial file cleaned; kill mid-AI-matte poll → poll stops, toast; repeated crash loop → no
restart storm; Help→support bundle produces a bundle (size sane); crash dumps land in ~/.creatrix.

## G8 — Inspector tracks & probes (P6.8; addProbeBinding, ≤16/track)
Singleton inspector track; add/remove probes; probe rows show live values during playback; probe bound to a
deleted effect prunes cleanly; persistence round-trip; 16-probe perf.

## G9 — Inline actions (InlineActionMenu + inline_actions_list/invoke IPC)
Menu renders per context; each listed action invokes + applies; error path (backend rejects) toasts;
list on an entity with no actions.

## G10 — Disk hygiene & runtime dir (~/.creatrix)
mask_gc_sidecars actually GCs orphaned matte sidecars; frozen/baked clip files cleaned on unfreeze +
track-delete (pairs with orphaned-state rows 67/121); autosave sidecar lifecycle (created dirty-only,
deleted on restore/save); session disk growth bounded; migrate-runtime-dir (PD.10 ~/.entropic copy-if-
absent) leaves originals + breadcrumb.

## G11 — IPC trust boundary (zmq relay _token)
Missing/wrong _token rejected by Python; malformed cmd / oversized payload rejected structured; token
continuity across watchdog restart; hostile direct-IPC probes for the handlers the UI clamps client-side
(complements A29/B11/C12).

## G12 — Assets/library panel + clip duplicate
duplicateClip (store 1870) via UI; asset badges incl. missing-media badge state; thumbnails; one asset
shared by many clips (badge/relink coherence with import-C1).

## G13 — Demos drawer + BootLine (onboarding content)
First-launch auto-open (launchCount gate) + does NOT reopen after; load a demo end-to-end; BootLine shows
exactly once.

## G14 — LayerPanel (B3) semantics — Stage G covers the GRID, not the panel
Per-layer blend/opacity/fill/matte/transform edits apply to render; restack drag ↔ track z-order stays
in sync (b3-restack-order class); selection sync timeline↔panel; Master track representation in the panel
(excluded or pinned?); panel under 64 tracks.

## G15 — Pop-out preview (PopOutPreview + pop-out-window.ts)
Opens; mirrors frames live (incl. during mask/transform overlays on main); close cleans up (no orphan
window/IPC); reopen at default bounds (documented non-persisted); behavior on engine restart.

## G16 — Window title & dirty star
`Name * — Creatrix` on dirty, star clears on save; title follows rename/Save-As; welcome-state plain title.

## G17 — Auto-updater (main/updater.ts) — completely unmapped
Update check path (startup/menu?); offline → no crash/no blocking dialog; "up to date" UX; downloaded-
update prompt behavior. (Scope: verify whatever exists; may be stubbed.)

## G18 — Safety sentinels, user-visible behavior
SG-3 NaN/Inf output gate fires → WHAT does the user see (toast naming the lane? frame held?); SG-5 runtime
cycle detection at render → feedback; effect auto-disable (3 fails) — is disabled state VISIBLE in the
chain UI or silent (effects row 61 says verify no toast-storm; also verify not zero-feedback).

## G19 — New-feature micro-gaps (from this session's own PR notes)
Two same-type effects on the MASTER collapse onto one automation lane (M.3 documented limitation) — verify
behavior + at least a doc/toast; AA.2 modulation lane with NO absolute base silently acts absolute (redteam
product-note) — verify UI hint decision; LFO operator lane × #28 bounds fix interplay once #28 lands.

## G20 — Performance smoke (PERF-MODEL.md exists; no perf rows anywhere)
Playback fps with 4 video tracks × ~10-effect chains; UI responsiveness while an export renders; 30-min
session memory slope vs pressure thresholds; timeline interaction at 64 tracks / 500 clips.

## Explicit OUT-OF-SCOPE declarations (so absence is a decision, not an oversight)
Accessibility sweep (keyboard-only nav, screen-reader labels), multi-monitor/DPI-scaling behaviors,
i18n/locale, OS-version matrix. Declared not covered by this audit; revisit post-v1.
