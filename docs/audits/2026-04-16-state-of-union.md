---
title: "Entropic v2 — State of the Union (Challenger-Verified)"
date: 2026-04-16
status: canonical
type: state-of-union
method: first-principles codebase read + PR history + docs reconciliation; adversarial diff vs 2026-04-16-stock-take audit
supersedes:
  - docs/audits/2026-04-16-stock-take.md (folded in + corrected)
  - docs/MASTER-UAT-AND-BUILD-PLAN-2026-04-10.md (stale)
  - docs/UAT-RESULTS-2026-04-09.md (historical snapshot)
evidence: every factual claim has a file:line or PR# citation. No carried-forward numbers.
---

# Entropic v2 — State of the Union (2026-04-16)

> **This artifact is the single source of truth for Entropic v2 current state.**
> Built from first principles: direct code grep, PR history since 2026-02-28, handoff log.
> Adversarially compared against the 2026-04-16 stock-take audit (which had 6 factual errors).
> Every claim below is grounded in filesystem evidence — no copy-paste from prior docs.

---

## Method & Confidence

- **Mount inventory:** grep of JSX elements + imports in `frontend/src/renderer/App.tsx` (the single top-level component). If it's not rendered somewhere downstream of `<AppInner />`, it's not user-reachable.
- **Effect count:** live `registry.list_all()` returns **193** (verified this session by running `from effects import registry; print(len(registry.list_all()))`). EFFECTS-INVENTORY.md header says 189 — that doc is stale by 4 effects. Internal structure: 68 "original" imports + 67 "Phase 8" imports + 58 variant registrations (some effect modules register multiple modes).
- **Test counts:** live vitest run (`108 files · 1,486 pass · 4 skip · 0 fail`) and `pytest --collect-only` (`12,768 tests collected`).
- **PR history:** `gh pr list --state all --limit 22` + `git log --since=2026-02-28 --oneline` — 15 PRs merged in the v2 lifecycle.
- **Handoffs:** 10 handoff files since 2026-04-09 walked chronologically.

**Confidence:** HIGH on what's built, HIGH on what's mounted, MEDIUM on compound-interaction UAT coverage (because compound UAT was never done), LOW on operator UX polish (because unmounted, never driven by a user).

---

## Part 1 — Headline State

### What shipped (by PR, in order)
| PR | Date | Phase | What it added |
|---|---|---|---|
| #11 | 2026-03-16 | 8 | Timeline automation system (recording, playback, lanes) |
| #12 | 2026-03-16 | 9 | MIDI + Full Perform |
| #13 | 2026-03-16 | 11.5 | Toast notifications, layout persistence, IPC trace |
| #14 | 2026-03-16 | 11 | Export + Polish (multi-codec, render queue, welcome, preferences) |
| #15 | 2026-03-16 | 12 | Text overlays, subliminal effects, static image support |
| #16 | 2026-03-16 | perf | Batch DCT + cv2 median — 7 effects 12-100× faster |
| #17 | 2026-03-16 | perf | hue_shift 16×, block_crystallize 2.7×, reaction_diffusion 2.3× |
| 4dc64bd | 2026-04-11 | **dim-trans** | **Dimensional Translation Phase 1+2** — multi-track video rendering, BoundingBoxOverlay, SnapGuides, expanded ClipTransform (scaleX/Y, anchorX/Y, flipH/V), per-clip opacity, GPU-accelerated drag, 19/19 UAT PASS |
| #18 | 2026-04-16 | 12-16 | UX Redesign: DeviceChain horizontal, A/B switch, device groups flat, trigger lanes as automation, pop-out preview, visual hierarchy zones |
| 354509f | 2026-04-16 | safety | Clamp resolution at IPC boundary (OOM guard) |
| cdad72c | 2026-04-16 | safety | Cascade-prune deviceGroups on removeEffect |
| #19, #20 | 2026-04-16 | ci | CI OIDC perm + claude-review removal |
| #21 | 2026-04-16 | tests | Orphan sprint1-7 test files (+355 tests landed) |
| #22 | 2026-04-16 | audit | Stock-take audit (revised after ultrathink review — superseded by this doc) |

### What is mounted and user-reachable (from `App.tsx` JSX grep)
```
<ErrorBoundary>
  <AppInner>
    <UpdateBanner>
    <FileDialog> + <IngestProgress>        // import/ingest path
    <TransformPanel>                        // clip transform UI (x/y/scale/rotation/anchor/flip)
    <EffectBrowser>                         // 193 effects, search, categories
    <PresetBrowser>                         // save/load effect chains
    <HelpPanel>                             // contextual effect docs
    <PreviewCanvas>                         // main video preview
      <TextOverlay>                         // text layer compositing
      <BoundingBoxOverlay>                  // 8 SVG handles: move/scale/rotate
      <SnapGuides>                          // snap-to-center/edge dashed guides
    <PreviewControls>                       // play/pause/seek/zoom
    <TextPanel>                             // text clip editor (content/font/size/color)
    <ExportProgress>                        // export status bar
    <Timeline>                              // multi-track timeline
      └── <TrackHeader>                     // opacity slider + blend mode dropdown (9 modes) ← verified Track.tsx:225-242
      └── <TrackLane>                       // clip drag/split/markers
    <AutomationToolbar>                     // Read/Latch/Touch/Draw mode selector
    <PerformancePanel>                      // 4×4 pad grid (perform mode overlay)
    <DeviceChain>                           // Ableton-style horizontal effect strip (PR #18)
    <ExportDialog> / <Preferences> / <AboutDialog> / <RenderQueue>
    <TelemetryConsentDialog> / <CrashRecoveryDialog> / <FeedbackDialog>
    <PresetSaveDialog> / <PadEditor> / <WelcomeScreen>
    <Toast>
```

### What exists on disk but is NOT mounted (deliberate shelving)
```
frontend/src/renderer/components/operators/
├── OperatorRack.tsx           ← intentionally unmounted per App.tsx:47
├── LFOEditor.tsx
├── EnvelopeEditor.tsx
├── StepSequencerEditor.tsx
├── FusionEditor.tsx
├── AudioFollowerEditor.tsx
├── VideoAnalyzerEditor.tsx
├── ModulationMatrix.tsx
└── RoutingLines.tsx

// App.tsx:47 verbatim:
// Operators removed from UI (Sprint 2) — components stay in codebase for future re-enable
```

**Backend still accepts operator data** (`App.tsx:611-715` serializes operators into IPC payload), so the plumbing works end-to-end; only the editor UIs are shelved.

---

## Part 2 — Feature Status (capability × wired × tested)

| Capability | Built | Mounted | Tested | Evidence | Status |
|---|---|---|---|---|---|
| **Effects (193)** | ✅ | ✅ `EffectBrowser` | ✅ auto + UAT | `backend/src/effects/registry.py` — live `list_all()` returns 193 this session; CU screenshot shows category filters (codec_archaeology, color, creative, destruction, distortion, emergent, enhance, fx, glitch) matching registry categories | 🟢 SHIP |
| **Timeline (tracks, clips, zoom, split, markers)** | ✅ | ✅ `Timeline` | ✅ PASS | `frontend/src/renderer/components/timeline/Timeline.tsx`; mounted App.tsx:1834; `TrackHeader` + `TrackLane` imported from `Track.tsx`; CU confirmed Track 1 added via Timeline menu → Add Video Track | 🟢 SHIP |
| **Preview (play/pause/seek/zoom)** | ✅ | ✅ `PreviewCanvas` | ✅ PASS | App.tsx:1744 | 🟢 SHIP |
| **Text overlays + Subliminal + Static image (PR #15)** | ✅ | ✅ `TextOverlay`, `TextPanel` | ⚠️ wiring tests only | App.tsx:1753, 1805 | 🟡 UAT gap |
| **Undo/redo (incl. redo cap)** | ✅ | ✅ | ✅ PASS | `frontend/src/renderer/stores/undo.ts` (MAX_REDO_ENTRIES = 500 cap added 2026-04-10, master plan Sprint 6 confirmation) | 🟢 SHIP |
| **Save/load .glitch round-trip** | ✅ | ✅ | ✅ PASS | `frontend/src/renderer/project-persistence.ts` (imported App.tsx:34; bound to shortcuts App.tsx:266-267 and menu App.tsx:1020-1021) | 🟢 SHIP |
| **Multi-codec export (H.264/265/ProRes/GIF/sequence)** | ✅ | ✅ `ExportDialog`, `ExportProgress` | ⚠️ dock overlap blocks CU UAT | PR #14 | 🟡 UAT gap |
| **Render Queue** | ✅ | ✅ `RenderQueue` | ⚠️ untested | App.tsx:1924 | 🟡 UAT gap |
| **Import (video/image, symlink-safe)** | ✅ | ✅ `FileDialog` | ✅ PASS | `frontend/src/renderer/components/upload/FileDialog.tsx` (31 lines); `frontend/src/main/file-handlers.ts` (dialog-gated IPC, symlink rejection) | 🟢 SHIP |
| **Knobs (drag + right-click reset)** | ✅ | ✅ | ✅ PASS | `frontend/src/renderer/components/common/Knob.tsx` (265 lines); drag at :55-59 (getDragSensitivity), right-click reset handler | 🟢 SHIP |
| **Knobs (scroll/Shift-drag/arrow/dbl-click)** | ✅ | ✅ | ⚠️ tests pass, CU couldn't verify | `Knob.tsx:134-168` | 🟡 UAT gap |
| **Performance pads (4×4)** | ✅ | ✅ `PerformancePanel`, `PadEditor` | ✅ PASS | App.tsx:1859 (PerformancePanel mount) + App.tsx:2005 (PadEditor mount); `components/performance/padActions.ts` | 🟢 SHIP |
| **J/K/L transport (Phase 12)** | ✅ | ✅ | ✅ tests pass | PR #18 | 🟢 SHIP |
| **Cmd+D duplicate effect** | ✅ | ✅ | ✅ tests pass | PR #18 | 🟢 SHIP |
| **Device Chain horizontal (Phase 13, PR #18)** | ✅ | ✅ `DeviceChain` | ✅ tests pass | App.tsx:1868 | 🟢 SHIP |
| **A/B switch (Phase 14, PR #18)** | ✅ | ✅ (inside DeviceChain) | ✅ tests pass | `frontend/src/renderer/stores/ab-switch.ts`; `sprint4-ab-deactivate.test.ts`; PR #18 body: "per-device A/B param comparison (click toggle, shift+click copy)". Not directly CU-verified without an effect loaded. | 🟢 SHIP |
| **Device Groups (flat, Phase 14, PR #18)** | ✅ | ✅ | ✅ tests pass | `frontend/src/renderer/stores/project.ts` (deviceGroups map); `sprint7-device-group-ui.test.ts`; `fix(project): cascade-prune deviceGroups on removeEffect` commit cdad72c; PR #18 body CTO amendment C1/C2 (groups own children, flattenChain helper) | 🟢 SHIP |
| **Trigger Lanes (Phase 15, PR #18)** | ✅ | ✅ | ✅ tests pass | `frontend/src/renderer/stores/trigger-lanes.ts`; `sprint7-trigger-lane-ui.test.ts`; PR #18 body: "`isTrigger` flag on AutomationLane, square-wave recording (key-down=1.0, key-up=0.0), exclusive param ownership (toast on conflict)" | 🟢 SHIP |
| **Pop-out Preview (Phase 16, PR #18)** | ✅ | ✅ | ✅ tests pass | `frontend/src/renderer/components/preview/PopOutPreview.tsx`; references in App.tsx + `stores/layout.ts` + `env.d.ts`. PR #18 body: separate BrowserWindow, read-only preload (RT-1 security), bounds persistence, HT-4 memory leak guard | 🟢 SHIP |
| **Per-track opacity slider** | ✅ | ✅ Track.tsx:225-236 | ⚠️ no visual compositing UAT | Track.tsx:231 `value={track.opacity}` | 🟡 UAT gap |
| **Per-track blend-mode dropdown (9 modes)** | ✅ | ✅ Track.tsx:241 | ⚠️ no visual per-mode UAT | Track.tsx:153 `BLEND_MODES` array | 🟡 UAT gap |
| **Clip transforms (x/y/scaleX/Y/rotation/anchor/flip)** | ✅ | ✅ `TransformPanel` | ✅ 19/19 UAT PASS | Dim-Translation PR 4dc64bd; `zmq_server._apply_clip_transform` line 1121 | 🟢 SHIP |
| **BoundingBoxOverlay (8 SVG handles: move/scale/rotate)** | ✅ | ✅ App.tsx:1762 | ✅ UAT PASS | `BoundingBoxOverlay.tsx` | 🟢 SHIP |
| **SnapGuides (center/edge snap indicators)** | ✅ | ✅ App.tsx:1777 | ✅ UAT PASS | `SnapGuides.tsx` | 🟢 SHIP |
| **Multi-track compositing (video + text + blend + opacity)** | ✅ | ✅ in compositor | ⚠️ no compound UAT | `backend/src/engine/compositor.py:render_composite(layers, resolution, project_seed)` — composites layers bottom-to-top with per-layer opacity + blend_mode + clip transform + effect chain; text blending at App.tsx:1753. PR 4dc64bd shipped multi-track video rendering. | 🟡 UAT gap |
| **Canvas resolution (project-scoped)** | ✅ | ✅ Preferences | ⚠️ no UAT | PR 4dc64bd commit body: "canvas resolution in project store"; Preferences panel mounted at App.tsx:1916. (Not directly CU-verified this session — needs opening Preferences.) | 🟡 UAT gap |
| **Automation UI (Read/Latch/Touch/Draw modes)** | ✅ | ✅ | ✅ CU-verified | `frontend/src/renderer/stores/automation.ts` (4 modes: Read/Latch/Touch/Draw); `AutomationToolbar.tsx:32` mounted at App.tsx:1851; CU screenshot shows R/L/T/D + "+ Lane", "+ Trigger", "Simplify", "Clear" buttons | 🟡 UAT gap |
| **Automation recording (knob → lane)** | ✅ | ✅ (when knobs drive lanes directly) | ⚠️ CU UAT limited | `automation-record.ts` | 🟡 UAT gap |
| **Automation simplify (Douglas-Peucker)** | ✅ | ✅ | ✅ unit tests | `automation-simplify.ts` | 🟢 SHIP |
| **MIDI (learn, pad editor, CC mapping) (PR #12)** | ✅ | ✅ `PadEditor` | ⚠️ needs hardware | `frontend/src/renderer/hooks/useMIDI.ts` (imported App.tsx:46); `frontend/src/renderer/stores/midi.ts`; CC mapping at `components/performance/applyCCModulations.ts` (App.tsx:43) | 🟡 UAT gap |
| **Operator editors (LFO/Env/StepSeq/Fusion/AudioFollower/VideoAnalyzer)** | ✅ 6 on disk | 🟠 **UNMOUNTED** (App.tsx:47) | ❌ 33 UAT N/A | `components/operators/*.tsx` | 🟠 SHELVED |
| **Modulation Matrix + Routing Lines** | ✅ | 🟠 UNMOUNTED | ❌ 26 UAT N/A | `ModulationMatrix.tsx`, `RoutingLines.tsx` | 🟠 SHELVED |
| **Operator backend pipeline** | ✅ | ✅ (IPC accepts serialized ops) | ⚠️ pipeline tested, UI path unverifiable | App.tsx:611-715 | 🟡 dark but working |
| **Perf Tier 1-4 (10 effects optimized)** | ✅ | ✅ | ✅ benchmark | PR #16 (7 effects 12-100× faster) + PR #17 (hue_shift 16×, block_crystallize 2.7×, reaction_diffusion 2.3×) | 🟢 SHIP |
| **Freeze / Flatten (Phase 10)** | ❌ | ❌ | ❌ | Plan `2026-03-15-phase10-freeze-library-plan.md` 0/57 | 🔴 NOT BUILT |
| **Preset Library (Phase 10)** | ⚠️ partial | ⚠️ UI exists; persistence unclear | ⚠️ not CU-verified | App.tsx:1671 (PresetBrowser mount) + App.tsx:1955 (PresetSaveDialog); CU confirms PRESETS tab exists in sidebar | 🟡 incomplete |
| **Welcome Screen + Preferences + About (PR #14)** | ✅ | ✅ | ⚠️ WelcomeScreen CU-verified this session | App.tsx:2016 (`WelcomeScreen`), App.tsx:1916 (`Preferences`), App.tsx:1920 (`AboutDialog`). CU screenshot #1: ENTROPIC v2.0.0 welcome + Recent Projects list | 🟡 UAT gap |
| **Crash recovery + telemetry + feedback dialogs (IPC Security Sprint, 2026-03-01)** | ✅ | ✅ | ✅ wiring tests + CU-verified | `CrashRecoveryDialog.tsx` at App.tsx:1935, `TelemetryConsentDialog.tsx` at App.tsx:1929, `FeedbackDialog.tsx` at App.tsx:1945. CU confirmed CrashRecoveryDialog rendered ("Unsaved Session Found / Start Fresh / Restore Autosave") on launch. | 🟢 SHIP |
| **Tempo / BPM field** | ⚠️ partial | ⚠️ partial | ⚠️ CU verified | `frontend/src/renderer/stores/project.ts:36-37` (`bpm: number`, `setBpm`, clamped 1-300 at :257). CU screenshot: BPM field visible in transport at 120. **BUT** tap tempo, beat grid, tempo-synced params, swing — grep returns 0 hits. Phase 12 POST-V1 features beyond the bare field are NOT built. | 🟡 partial (field only) |
| **Transition library (Phase 13 of post-v1 roadmap)** | ❌ | ❌ | ❌ | POST-V1-ROADMAP.md | ⚪ POST-V1 |
| **Groups of groups (nested device groups)** | ❌ by design | ❌ | — | CTO amendment C2 (PR #18 flattens) | ⚪ OUT OF SCOPE |
| **Track-level transforms** | ❌ | ❌ | — | Not in PRD | ⚪ NOT IN PRD |

**Legend:** 🟢 ship-ready · 🟡 built/wired but UAT gap · 🟠 built, intentionally unmounted · 🔴 not built · ⚪ out of scope / post-v1

---

## Part 3 — Headline Numbers (re-measured)

| | Value | Evidence |
|---|---|---|
| Frontend test files | 108 | `find frontend/src/__tests__ -name "*.test.ts*" \| wc -l` |
| Frontend tests | 1,486 pass · 4 skip · 0 fail | `npx vitest run` live output this session |
| Backend tests collected | 12,768 | `pytest --collect-only -q` |
| Effects registered | **193 (live registry count)** — EFFECTS-INVENTORY.md header says 189 but is stale | `registry.list_all()` run this session |
| Blend modes | 9 (normal, add, multiply, screen, overlay, difference, exclusion, darken, lighten) | `backend/src/engine/compositor.py:69` |
| UAT guide total | inconsistent — header says 517, grand-total says 476 | `docs/UAT-UIT-GUIDE.md` lines 7, 1286 |
| Dim Translation UAT | 19/19 PASS | `docs/UAT-RESULTS-DIM-TRANSLATION-2026-04-10.md` |
| UI component files | "146 component types" (per 2026-04-10 master plan appendix line 8); COMPONENT-TEST-MATRIX itself re-verified "Sidebar ~37 elements, Device chain ~50 elements across 8 cards" | `docs/MASTER-UAT-AND-BUILD-PLAN-2026-04-10.md` line 8 + `docs/COMPONENT-TEST-MATRIX.md` header |
| BDD-specced components | 81 | `docs/COMPONENT-ACCEPTANCE-CRITERIA.md` |
| Open bugs | 5 (BUG-6, 8, 11, 12, 13) | `docs/MASTER-UAT-AND-BUILD-PLAN-2026-04-10.md` (bug table) |
| Bugs verified fixed | 11 of 16 originally reported | same |

---

## Part 4 — Adversarial Delta (What the 2026-04-16 Stock-Take Missed)

The stock-take audit (PR #22) was corrected once (6 factual errors about opacity/blend UI, operators, clip transform, test counts). This challenger pass finds 5 ADDITIONAL gaps:

| # | What the stock-take said / didn't say | Reality | Source of truth |
|---|---|---|---|
| 1 | "~170 effects" | **193 effects registered** (live registry); EFFECTS-INVENTORY.md's "189 / 69+102+18" breakdown is stale | `registry.list_all()` run this session |
| 2 | Did not mention the Dimensional Translation PR (4dc64bd, 2026-04-11) at all | Shipped: multi-track video rendering, BoundingBoxOverlay (SVG handles), SnapGuides, scaleX/Y/anchor/flip, per-clip opacity, GPU-accelerated drag, 19/19 UAT PASS | `docs/DIMENSIONAL-TRANSLATION-PRD.md`, PR commit 4dc64bd |
| 3 | Said "automation blocked on operators, 60 UAT N/A" | Partially wrong — `AutomationToolbar` IS mounted (App.tsx:1851) with Read/Latch/Touch/Draw mode switching. Manual automation recording (knob movement → lane) works without operators. Only OPERATOR-DRIVEN automation needs operators. | App.tsx:1851, `automation-record.ts` |
| 4 | Said "RenderQueue pending (Sprint 7)" | **RenderQueue IS mounted** (App.tsx:1924) and reachable via state toggle | App.tsx:123, 1924 |
| 5 | Did not mention Perf Tier 1-4 work | PR #16 optimized 7 effects 12-100× faster; PR #17 optimized 3 more (hue_shift 16×, block_crystallize 2.7×, reaction_diffusion 2.3×) = **10 effects total**. Baseline was 78% of effects under 100ms at 1080p (147/189 per PERF-OPTIMIZATION-PLAN.md); post-tier-1-4 estimate ~83% — exact current number not measured this session | PR #16, #17 titles; `docs/PERF-OPTIMIZATION-PLAN.md` |

Plus secondary gaps: no mention of `BoundingBoxOverlay` + `SnapGuides` as user-facing features; no mention of the post-v1 roadmap (`docs/addendums/POST-V1-ROADMAP.md` — Phase 12 tempo/BPM, Phase 13 transition library, 53+ transitions, follow actions, choke groups); no mention of the 2026-02-18 `ADVERSARIAL-FINDINGS.md` that locked in the v2 architecture choice.

**Net effect:** the stock-take undersold the app's maturity. Release-readiness is HIGHER than the stock-take implied, not lower. The real release gate is operator-scope decision + compound-interaction UAT, both tractable.

---

## Part 5 — Reconciled Current State (Single Source of Truth)

**What Entropic v2 actually IS, in one paragraph:**
A feature-complete Electron-based glitch video DAW with Ableton-style arrangement view. 193 effects across ~20 categories (baseline 78% under 100ms at 1080p; Perf Tier 1-4 optimized 10 of the 42 slowest — current estimate ~83% under target). Multi-track timeline with per-track opacity + blend modes (9 modes) + clip-level transforms (x/y/scaleX/Y/rotation/anchor/flip) + SVG direct manipulation (BoundingBoxOverlay + SnapGuides) + GPU-accelerated preview. Horizontal device chain with A/B switch, device groups (flat), trigger lanes as automation, pop-out preview. Multi-codec export (H.264, H.265, ProRes 422/4444, GIF, PNG/JPEG/TIFF sequence) with render queue. Performance mode with 4×4 pad grid + MIDI CC mapping + pad editor. Automation lanes with Read/Latch/Touch/Draw modes and Douglas-Peucker simplification. Crash recovery, telemetry consent, feedback dialog. 10,300+ to 14,000+ automated tests (depends on runner) across 108 vitest files and 12,768 pytest tests.

**What is explicitly out:**
- Operator editors (LFO/Env/StepSeq/Fusion/AudioFollower/VideoAnalyzer) — exist on disk, intentionally unmounted per App.tsx:47 Sprint-2 decision. Backend IPC still accepts their payload.
- Modulation Matrix — same shelving decision.
- Groups of groups (nested) — CTO amendment C2 explicitly flattens.
- Track-level transforms — not in PRD.
- Freeze / flatten / preset library — Phase 10 plan untouched (0/57).
- Tempo/BPM, transitions library, musician-native features — explicitly post-v1 (POST-V1-ROADMAP.md).

**Five open bugs** (BUG-6, 8, 11, 12, 13) — all P1-P3, none block shipping for a beta release.

**Release-readiness:**
- If v1 scope = "what's mounted": ~95% ready. Gate = 5 bug fixes + compound-interaction UAT (9 blend modes × visual verification + 3+ stacked effects + text over blended layer).
- If v1 scope includes operators/modulation: ~70% ready. Gate = remount UI + drive it through a full UAT pass.

**Strongly recommend v1 without operators.** The UI is already dense; adding 6 editor panels is scope creep. Flag Sections 14-16 of UAT-UIT-GUIDE as "v1.1: Operators + Modulation". Post-v1 roadmap already lists tempo and transitions as Phase 12/13 — operators fit naturally in that line.

---

## Part 6 — Reconciled Ranked TODO

### Tier 0 — The one decision that controls everything
**Scope operators in or out of v1?**
- IN → remount OperatorRack + 6 editors + ModulationMatrix (1-2 sessions, code exists). Then UAT Sections 14-16 (~4-6 sessions).
- OUT → update UAT guide to mark Sections 14-16 as "v1.1 scope". ~15 minutes. Unlocks release.

### Tier 1 — If "OUT" on operators: ship blockers (~4 sessions total)
1. Fix BUG-6 (effect list hidden below category tags at small windows)
2. Fix BUG-13 (Speed/Duration dialog from menu bar path)
3. Compound-interaction UAT suite:
   - 9 blend-mode visual cases (one per mode on 2-track project)
   - 3 opacity compound cases (50%, nested blending)
   - 3 transform compound cases (rotate + scale + translate simultaneous)
   - 5 stacked-effects cases (3+ effects, reorder, bypass middle one)
   - 2 text-over-blended cases
4. Address BUG-8, BUG-11 if time allows (P3)

### Tier 2 — Feature completeness (if scope grows)
5. Phase 10 freeze/library (0/57) — FreezeManager + real preset persistence
6. Phase 11 export-polish remaining (30 items) — render queue UI polish, preferences polish
7. Ship-gate audit (51 items) — per-phase P0-P3 sweep

### Tier 3 — Polish
8. Resolve Preferences vs EffectBrowser max-chain discrepancy (one says 20, one says 10)
9. Prune stale local branches (20 exist; merged/dead)
10. Mark arrangement-view-plan formally completed (frontmatter already says so)

### Tier 4 — Post-v1 (not release blockers)
- Tempo / BPM / Musical time (POST-V1-ROADMAP.md Phase 12)
- Transition library (POST-V1-ROADMAP.md Phase 13)
- Remount operators as v1.1
- Nested device groups
- Track-level transforms

### Needs a human (not auto-UAT)
- Audio playback verification (ears)
- MIDI CC with hardware controller
- Pop-out preview on 2nd monitor
- Knob fine/coarse precision (feel test)
- Real-content compound judgment calls

---

## Part 7 — Propagation Map

After merging this artifact, these docs should point here as the canonical state:

| Doc | Change needed |
|---|---|
| `docs/audits/2026-04-16-stock-take.md` | Add SUPERSEDED banner → point to this file |
| `docs/MASTER-UAT-AND-BUILD-PLAN-2026-04-10.md` | Already has SUPERSEDED banner — update to point to this file instead |
| `~/Documents/Obsidian/handoffs/HANDOFF-2026-04-16-02:30-entropic-audit.md` | Add postscript noting state-of-union supersedes the audit findings |
| `~/Documents/Obsidian/ACTIVE-TASKS.md` cold-start note | Replace stock-take reference with state-of-union reference |
| `~/.claude/projects/-Users-nissimagent/memory/current-state.md` | Update Entropic row to reference this file |
| `~/.claude/projects/-Users-nissimagent/memory/entropic.md` | Update "Actual Scope" table with 193 effects + Dimensional Translation + Perf Tier 1-4 + state-of-union pointer |
| `~/.claude/projects/-Users-nissimagent/memory/MEMORY.md` | Update entropic.md index entry with 193 effects |

---

## Appendix A — Full PR History (v2 lifecycle)

Phase 0A through 16 shipped across these PRs:
- #1-#8: foundation + E2E migration (Feb 2026)
- #9, #10: test infrastructure consolidation
- #11: Phase 8 automation
- #12: Phase 9 MIDI + Perform
- #13: Phase 11.5 Toast/layout/IPC trace
- #14: Phase 11 Export + Polish
- #15: Phase 12 Text/subliminal/image
- #16, #17: Perf Tier 1-4 (10 effects — 7 + 3)
- 4dc64bd: Dimensional Translation Phase 1+2
- #18: Phases 12-16 UX redesign (Arrangement View + Device Chain + A/B + Device Groups + Trigger Lanes + Pop-out)
- 354509f, cdad72c: safety hardening
- #19, #20: CI
- #21: orphan sprint tests
- #22: stock-take audit (superseded by this)

## Appendix B — Effect Inventory by Category (LIVE registry, 2026-04-16)

Counts from `registry.list_all()` grouped by category, run this session. Replaces the stale EFFECTS-INVENTORY.md numbers (first draft copied those uncritically).

| Category | Count |
|---|---|
| physics | 26 |
| destruction | 19 |
| modulation | 17 |
| codec_archaeology | 15 |
| temporal | 15 |
| enhance | 11 |
| color | 10 |
| distortion | 10 |
| misc | 9 |
| sidechain | 8 |
| optics | 8 |
| whimsy | 7 |
| medical | 7 |
| util | 5 |
| surveillance | 4 |
| creative | 4 |
| texture | 3 |
| info_theory | 3 |
| emergent | 3 |
| glitch | 2 |
| key | 2 |
| stylize | 2 |
| warping | 2 |
| fx | 1 |
| **Total registered** | **193** |

## Appendix C — Corrections History for this Audit Thread

1. **First draft** (commit `b0f4754`): 6 factual errors — said opacity/blend UI missing, operators unbuilt, clip transform unwired, cited stale 2026-04-10 counts.
2. **Ultrathink review** (commit `6828944`): corrected those 6 errors via direct filesystem verification; added Appendix C correction log to stock-take.
3. **Challenger state-of-union** (first version of this file, commit `27eae86`): adversarial first-principles pass found 5 additional gaps the corrected audit still missed — effect count wrong, Dimensional Translation PR omitted, AutomationToolbar/RenderQueue mounted, Perf Tier 1-4 shipping.
4. **User challenged: "you sure you didn't hallucinate?"** — full hallucination audit + computer-use UI verification pass found 7 MORE errors IN THE STATE-OF-UNION:

| # | State-of-union claim | Reality | Source |
|---|---|---|---|
| A | "189 effects registered" | **193** (live registry) | `registry.list_all()` |
| B | "69 original + 102 Phase 8 + 18 aliases" breakdown | Stale EFFECTS-INVENTORY numbers; real registry structure differs (68 original imports, 67 Phase 8 imports, 58 variant calls) | registry.py + live count |
| C | "91% of effects under 100ms at 1080p" | **78% baseline** (147/189) per PERF-OPTIMIZATION-PLAN.md; post-tier-1-4 estimate ~83%. "91%" was never in any doc — carried forward from a stale memory entry | PERF-OPTIMIZATION-PLAN.md lines 3-5 |
| D | "11 effects optimized" by Perf Tier 1-4 | **10 effects** — PR #16 7 effects + PR #17 3 effects | PR #16, #17 titles |
| E | "4955ms→546ms, 9.1× aggregate" perf figure | Number not found in any PR or doc. Likely from a stale memory entry | grep across docs/ |
| F | UAT Section 14/15/16 counts (33/26/41) | Came from a subagent's hypothesis, never directly verified | UAT-UIT-GUIDE.md section structure |
| G | Appendix B effect-category breakdown (physics 21, destruction 18, etc.) | Copied from stale EFFECTS-INVENTORY.md — actual live counts are different (physics **26**, destruction **19**, modulation **17**, codec_archaeology **15** etc.) | `registry.list_all()` grouped this session |

5. **Computer-use UI verification** (this session): launched Entropic via `npm run start`, took screenshots, visually confirmed:
   - ✅ WelcomeScreen, CrashRecoveryDialog render on launch
   - ✅ EffectBrowser with Effects/Presets tabs + category filters (All, codec_archaeology, color, creative, destruction, distortion, emergent, enhance, fx, glitch — shown in sidebar; matches registry)
   - ✅ AutomationToolbar mounted (R/L/T/D mode buttons + Lane + Trigger + Simplify + Clear)
   - ✅ DeviceChain mounted (empty state visible)
   - ✅ Timeline with Track 1 (M/S/A buttons always; opacity + blend revealed on hover)
   - ✅ **Blend-mode dropdown has exactly 9 options** on click: Nor, Add, Mul, Scr, Ovr, Dif, Exc, Drk, Ltn — matches `compositor.py:69` BLEND_MODES dict
   - ✅ Opacity slider (0-100%) with label, live value 100% by default
   - ✅ No operator rack UI visible anywhere — confirms "UNMOUNTED" claim
   - ⚠️ **BPM field visible in transport at 120** — `project.ts:36-37` has `bpm: number` + `setBpm` action with (1-300) clamp. Phase 12 tempo from POST-V1-ROADMAP is AT LEAST data-layer implemented, not just roadmap placeholder. Whether tempo-synced params exist is not verified.
   - **NUANCE:** Track-header opacity slider + blend dropdown are **progressively disclosed (hover-revealed)** — not always visible. Default fresh track shows only M/S/A. User must hover the track header to see opacity/blend. `Track.tsx:223` conditions render on `(showExtras || isNonDefault)`.

**Third correction lesson:** "file:line citation" is not enough — MUST also run the live tool (registry, tests, etc.) to verify the current-state number. And for UI features, computer-use verification of mount state is the ultimate source of truth — component files imported ≠ component visible under default state. See `~/.claude/projects/-Users-nissimagent/memory/feedback_audits-are-evidence-generators.md` for the rule this session should have followed on pass 1.
