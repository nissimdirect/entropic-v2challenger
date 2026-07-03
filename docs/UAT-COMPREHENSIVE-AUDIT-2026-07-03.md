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

---

# EXPERT PASS 1 — /don-norman (UX heuristics; the audit tested "does it work", this tests "can a human use it")

These rows feed Stage E of the live plan. Most are MANUAL-REVIEW judgments for the CU session, scored
per row: PASS / PAPERCUT (rank it) / FAIL (heuristic violation, file a bug).

## DN1 — Signifiers & discoverability (Norman #2; Nielsen #6 recognition-over-recall)
| # | Check | Why |
|---|---|---|
| DN1.1 | Every keyboard-only feature has a discoverable menu/UI equivalent: mask tools (`q`/`l`), Cmd+J/Shift+J region-copy, Alt+Backspace delete-outside, JKL shuttle, Cmd+Shift+I routing canvas | Cross-map all shortcuts ↔ the 61 menu items; shortcut-only = recall, not recognition |
| DN1.2 | Icon-only buttons all have tooltips: M/S/lock, R/L/T/D automation modes, Overdub, MAP, transport, AB, bank slots | "R" means nothing to a first-time user |
| DN1.3 | Drag affordances are signified: browser→chain drop zones highlight BEFORE drag starts (hover hint), operator→knob drop, transform-box handles visible on selection | Affordances exist (audit proved) but are they perceptible? |
| DN1.4 | The Master track's PURPOSE is communicated (label/tooltip "processes the summed output"), not just an amber row | New concept this session; zero in-app explanation found in code read |
| DN1.5 | Empty states teach: every one found (drag-media hint, "no routings yet", "No actions yet", "Hover an effect for details", welcome recents) reviewed for actionable next-step language | Nielsen #10 embedded in UI |

## DN2 — Feedback & the Gulf of Evaluation (Norman #4/#7; Nielsen #1)
| # | Check | Why |
|---|---|---|
| DN2.1 | THE SILENT NO-OP REGISTER = feedback failures, not polish: operator/mapping cap hits (C2/C3), CC-binding steal (E4), font fallback (row 86), corrupt-load (B7), eyedropper black fallback (A16), audio clip-cap advisory | The audit found these as bugs; Norman frames them: user acts → world doesn't respond → gulf of evaluation. ALL need visible feedback |
| DN2.2 | Every action >100ms shows progress (ingest, AI matte, bake, export, freeze, thumbnail fetch) AND completion is announced, not just progress vanishing | Feedback must close the loop |
| DN2.3 | Effect >500ms abort + 3-fail auto-disable: what does the user SEE? (audit row 61/62 + G18) — silent frame-passthrough is a textbook evaluation gulf | The frame just... doesn't change. Why? |
| DN2.4 | Mode visibility: armed automation mode (R/L/T/D + Overdub), mask tool mode, MAP mode, razor tool — each has a persistent visible indicator while active (mode errors are Norman's #1 slip class) | DAWs are mode-heavy; caps-lock-style slips guaranteed without indicators |

## DN3 — Conceptual models & mapping (Norman #3/#6; Nielsen #2)
| # | Check | Why |
|---|---|---|
| DN3.1 | THREE different "freeze" concepts exist (effect-chain freeze, performance-track freeze/bake, matte freeze-frame class) — naming/iconography must distinguish them or users will form ONE wrong model | Knowledge-based mistake generator |
| DN3.2 | Absolute vs modulation lanes: is the green-vs-blue distinction LEGENDED anywhere, or must users infer it? blendOp add/multiply/max exposed in plain terms? | AA.2 shipped the mechanics; the model needs communicating |
| DN3.3 | Clip-anchored vs timeline-anchored automation (the #17/#29 class) — after the bug fixes, the MODEL must be visible: what moves with a clip vs what stays. A one-line inspector hint beats a wiki | #29's bug class is ALSO a mental-model gap |
| DN3.4 | Master = post-composite ordering: does the UI communicate that master effects apply AFTER track compositing (e.g., chain header "OUTPUT")? | Users will expect per-track semantics |
| DN3.5 | Modifier consistency sweep: Alt = curve-tension (nodes) but Alt = subtract (masks) but Alt+Backspace = delete-outside; Cmd = snap-bypass (clips) but Cmd+drag ≠ on nodes; double-click = rename (tracks) vs edit (text) vs enter-branch (pads) vs straighten (segments) | Nielsen #4: same gesture should mean the same thing — audit C15 was one instance; this is the systematic sweep |

## DN4 — Error prevention > error messages (Norman error taxonomy; Nielsen #5/#9)
| # | Check | Why |
|---|---|---|
| DN4.1 | Constraints shown BEFORE action where possible: disabled-with-reason (tooltip) beats toast-after-rejection for: instruments-on-master, 11th effect, 65th track, composite placement | Prevention over correction |
| DN4.2 | Destructive actions inventory: delete track-with-content, remove effect-with-automation, unfreeze, Start Fresh (crash dialog), Clear (automation toolbar) — each is either confirmable OR cleanly undoable, and SAYS which | Norman: undo is the great forgiveness mechanism |
| DN4.3 | Error message language sweep: "Internal processing error" (audit A10/A11/row 14) fails Nielsen #9 — every user-facing error names the problem + a next step | Errors are evil; vague errors are worse |
| DN4.4 | Slips audit: capture errors (Cmd+K split vs Cmd+K browser-focus conventions from other apps), description errors (two Add-Track buttons — fixed #390; M/S adjacency), mode errors (drawing a marquee while razor armed) | Design against the taxonomy, not just crashes |

## DN5 — Control & freedom (Nielsen #3) + ethics
| # | Check | Why |
|---|---|---|
| DN5.1 | Undo coverage gaps the audit found are FREEDOM failures: freeze/bake not undoable (row 120), AB switching non-undoable (documented — but is it SIGNALED?), marker ops undoable? | "Can I get out of this?" must always be yes-or-told-why |
| DN5.2 | Long operations are cancellable: export ✓, AI matte ✓, ingest ✗ (N20), bake ✗ — every >5s op needs an exit | Roach-motel prevention, in-app edition |
| DN5.3 | Defaults ethics check: autosave-on, quantize default, overdub default OFF (replace locked-in per D2 decision) — defaults serve the user's data safety first | Norman's ethics checklist #4 |

# EXPERT PASS 2 — /cdo (design-implementation craft gates; feeds Stage E + the papercut ranking)

## CD1 — Component-state completeness (Gate 7.1: 8 states)
Sweep the core interactive set — buttons (transport/toolbar/menu), knobs, sliders, clips, lane
breakpoints, transform handles, bank slots, browser tiles — for default · hover · **:focus-visible** ·
active · disabled · loading · error · success. Prediction from code read: **focus-visible is the
systemic gap** (mouse-first DAW); keyboard-tab through each panel and score it.

## CD2 — Contrast & color discipline (Gate 6; dark theme #1a1a1a)
4.5:1 body / 3:1 large across: muted grays on panel backgrounds, disabled states, the MOD-violet mask
outline on dark footage, amber Master row text, green automation dots at 6px (size × contrast), toast
text, timecode. Verify ≤2 high-chroma colors per screen region (green accent + amber master + violet
mask + blue modulation = already 4 semantic hues — check they never collide in one panel).

## CD3 — Hit targets (desktop ≥24px, Fitts-critical surfaces)
M/S/lock buttons, lane breakpoints (grab tolerance vs 6px dot), transform-box corner handles, the 4
panel resize handles, marker grab zones, clip trim edges (edge vs body precedence), bank-slot cells,
mask-node reorder arrows. Rank misses as papercuts with px measurements.

## CD4 — Motion & performance craft
prefers-reduced-motion respected by: marching ants, slot flash (450ms), toast slide, drawer, progress
pulses. All animations compositor-only (transform/opacity — no layout-thrash animations on the
timeline). Playback at 30fps+ while UI animates (ties G20).

## CD5 — Token discipline (Gate 7.4 — hex-ratchet already enforces; verify the seams)
New-feature colors are tokens (--cx-automation-active precedent held for AA.6; check Master amber,
modulation blue, MOD-violet all named tokens, not hex); spacing/typography from the token scale in new
panels (AutomationToolbar additions, MasterTrack row, shape picker).

## CD6 — Layout integrity at extremes (Gate 7.6/7.7)
Every dialog/overlay (export, preferences, routing canvas, MAP overlay, relink, crash-recovery,
unsaved-changes) opened at MINIMUM panel sizes + focus-mode: nothing clipped/unreachable; no two-line
buttons; overflow-x is clip-not-hidden (sticky elements survive); 4-handle resize can't wedge a panel
into an unusable state (min-clamps verified in code — verify visually).

## CD7 — Loading/empty/skeleton language consistency
ONE loading vocabulary across ingest spinner, thumbnail fetch, AI-matte progress toast, export progress,
freeze overlay — same shape/rhythm, not five ad-hoc spinners. Empty states (DN1.5) share typographic
treatment.

## CD8 — Stage E integration
These CD rows + the DN rows ARE Stage E's checklist. Output: ranked papercut list (severity × frequency
× effort), token-conformance diff vs docs/roadmap/DESIGN-SPEC.md, and the focus-visible score. Anything
scoring FAIL on DN2 (silent no-ops) graduates from papercut to bug.

---

# COHESION PASS (2026-07-03) — canonical conventions + document map

## Canonical conventions (apply to EVERY layer of this audit; earlier sections conform to these)
- **Priorities (one scheme):** P0 = blocks release / data-loss / parity break · P1 = must-fix before ship ·
  P2 = verify/polish · P3 = nice-to-have. (Effects matrix rows using P1 as top ⇒ read P1=P0-equivalent
  where marked "highest-value"; the register entries above carry the calibrated severity.)
- **Row namespaces (for cross-referencing):** TL-(timeline) IM-(import) FX-(effects) AU-(audio/instr/text/perf)
  MK-(masking/operators/MIDI) EX-(export/persist/shell) G-(gap enrichment) DN-(Norman pass) CD-(CDO pass).
  Numeric-only rows in the FX/AU matrices are read as FX-n / AU-n.
- **Category set (every subsystem, every layer):** HAPPY · NEGATIVE · EDGE · CHAOS(state/sequence) ·
  COMPOSABILITY · ACCEPTANCE. The G-rows inherit priorities from their cluster header; where absent, treat
  interaction-bearing G-rows as P1 and informational ones as P2.
- **Verdict vocabulary:** ✅ PASS · 🐛 FAIL(bug, file/ref task) · 📄 PAPERCUT(ranked, Stage E) · ⏸ BLOCKED
  (named blocker) · N/A(out of scope, declared). Expert-pass rows score PASS/PAPERCUT/FAIL per DN/CD text.

## UAT DOCUMENT MAP (all scattered UAT/UIT docs, tiered — nothing orphaned)
**TIER 1 — CANONICAL, CURRENT (drive from these):**
- `UAT-COMPREHENSIVE-AUDIT-2026-07-03.md` (this doc) — discovery: matrices + gaps + DN/CD passes + bug register + gates.
- `UAT-PLAN-2026-07-02-live-cu.md` — EXECUTION plan: Stages A–K, N/E/X/C, live UI map, #387-salvaged key-map/riders, watchlist.
- `UAT-FEATURE-FLAG-AUDIT-2026-07-03.md` — per-flag round-trip protocol (a first-class stage input; re-grep flags at CU start).
- `UAT-RESULTS-2026-07-03.md` — CURRENT results ledger (Stage A partial + #392 pre-CU findings). CU session APPENDS here.

**TIER 2 — BASELINE, PARTIALLY STALE (mine for retry-lists; do not drive blindly):**
- `UAT-UIT-GUIDE.md` (v4.3, 2026-03-24, 517 cases) — canonical MANUAL guide for phases 0A–11.5 + sprints 1-3.
  STALE for: automation suite (AA.*), master bus (M.*), B3 layout, MK-series masking, H-UI hardware, T-series
  editing. Those are covered by Stages I/J/K + this audit. A FULL pass = UIT-guide (retry/never-tested rows per
  /uat continuation protocol vs the 04-09 results) + this audit's rows.
- `UAT-RESULTS-2026-04-09.md` (230/574 verified, 11 bugs) — last full-guide execution baseline; source of
  skip-lists (PASS/FIXED) per /uat Phase 0.
- `V2-AUTOMATED-UAT-PLAN.md` — automated equivalents of the guide; superseded in part by the e2e pyramid (#15).

**TIER 3 — HISTORICAL (context only, do not execute):** UAT-RESULTS-2026-03-16 / -2026-06-17 /
-DIM-TRANSLATION-2026-04-10, UAT-PLAN-2026-06-17-full-coverage, MASTER-UAT-AND-BUILD-PLAN-2026-04-10,
UAT-TEST-PLANS-FROM-BDD, UAT-BUGS-2026-04-09, UAT-VALIDATION-*/BUG-REPORT-*/PHASE4-UAT-REPORT (02-23 era),
docs/plans/*uat*. Evidence store: `docs/uat-evidence-2026-07-03/`.

## UPDATED GO/NO-GO (supersedes the earlier gate; now spans all four layers + legacy delta)
GO requires ALL of:
1. The 5 CONFIRMED register bugs (+#29/#30) fixed or explicitly accepted; #31 flagged register triaged.
2. Cross-cutting gates 1–6 (parity, automation coherence, no-silent-data-loss, composability, caps, master)
   spot-checked live.
3. G-cluster spot-checks: at minimum G1 (direct manipulation), G7 (engine crash recovery), G5 (menu sweep),
   G10 (disk hygiene) — the four highest-risk unmapped surfaces.
4. DN pass: zero FAILs on DN2 (feedback) and DN4.2 (destructive-op inventory); papercuts ranked.
5. CD pass: focus-visible score recorded; contrast + hit-target FAILs filed.
6. Legacy delta: UIT-guide retry-list (from 04-09 results) triaged — executed or explicitly deferred with count.
A green happy-path with a failing C3-contamination, E2/#28 clamp, any silent-data-loss path, or an
unexplained preview≠export divergence is a NO-GO regardless of pass-rate.
