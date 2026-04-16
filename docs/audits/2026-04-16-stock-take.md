---
title: "Entropic v2 — Comprehensive Stock-Take Audit"
date: 2026-04-16
status: superseded
superseded_by: docs/audits/2026-04-16-state-of-union.md
type: audit
revised: 2026-04-16 (ultrathink review pass — corrected 6 factual errors, see Appendix C)
supersedes: ["docs/MASTER-UAT-AND-BUILD-PLAN-2026-04-10.md (partial)"]
sources:
  - docs/plans/ (12 files, 568 checkboxes)
  - docs/UAT-UIT-GUIDE.md v4.3 (doc-stated total: 517 header / 476 grand-total — inconsistent in source)
  - docs/UAT-RESULTS-2026-04-09.md
  - docs/MASTER-UAT-AND-BUILD-PLAN-2026-04-10.md
  - docs/BDD-REVIEW-2026-04-10.md
  - docs/RED-TEAM-ALL-COMPONENTS.md (579 lines)
  - Direct code inspection of mounted vs unmounted components (this pass)
  - Live test run: vitest 1,486 passed + 4 skipped across 108 files; pytest 12,768 tests collected
  - Git log since 2026-04-10 (PR #18, #19, #20, #21)
---

# Entropic v2 — Comprehensive Stock-Take Audit (Revised)

> **⚠️ SUPERSEDED (2026-04-16 later-same-day):** See `docs/audits/2026-04-16-state-of-union.md` for the canonical state.
> A challenger first-principles pass found 5 additional gaps this audit missed even after its ultrathink correction: (1) effect count is **189** (not 170), (2) Dimensional Translation PR 4dc64bd shipped multi-track rendering + BoundingBoxOverlay + SnapGuides, (3) `AutomationToolbar` IS mounted (App.tsx:1851), (4) `RenderQueue` IS mounted (App.tsx:1924), (5) Perf Tier 1-4 (PRs #16, #17) optimized 11 effects 9.1× — unmentioned here.
> This doc is retained for its correction log (Appendix C) and the audit-method lesson.

## TL;DR

Entropic v2 Challenger is **more feature-complete than the 2026-04-10 master plan implied**, but two capability areas are **built and then deliberately unmounted**, and compound-interaction UAT is a blank slate.

**What is genuinely shipped-and-wired** (corrected from draft audit):
- ~170 effects work end-to-end
- Timeline, preview, undo/redo, save/load, multi-codec export
- **Per-track opacity slider** (`Track.tsx:225-236`) — wired to `setTrackOpacity`
- **Per-track blend-mode dropdown** (`Track.tsx:153, 241-242`) — 9 blend modes selectable: normal, add, multiply, screen, overlay, difference, exclusion, darken, lighten
- **Clip transforms** (position, scale, rotation, anchor, flip) — frontend sends via `clip.transform` in IPC payload (`App.tsx:913`), backend applies in `zmq_server._apply_clip_transform` (line 1121) both as a pre-chain pass AND per-layer in the compositor
- Pop-out preview, A/B switch, Device Groups, Trigger Lanes (all PR #18)

**What is built but deliberately unmounted** (the real dark features):
- **Operator editors** — all 6 editors exist on disk (LFO, Envelope, StepSeq, Fusion, AudioFollower, VideoAnalyzer) plus ModulationMatrix and RoutingLines, but `App.tsx:47` explicitly disables them: *"Operators removed from UI (Sprint 2) — components stay in codebase for future re-enable"*. Backend still accepts operator data (`App.tsx:611-715`). **Fix scope = remount, not rebuild.**
- **Automation recording/playback** — infrastructure complete; UAT is blocked because you need operators in the UI to drive it meaningfully.

**What is a real gap:**
- **Compound-interaction UAT** — 3+ effects stacked, layered tracks with each blend mode applied visually, text over blended video, rapid record+undo sequences. Zero tests exercise these.
- **Visual verification of blend modes** — 9 modes in code; no test renders all 9 on a real 2-track project and verifies output.
- **Phase 10 freeze/library** (0/57 plan) and **Phase 11 export polish** (34/64 plan) still have work.

**Headline numbers (re-measured this pass):**
- **Frontend tests:** 108 files · 1,486 passed · 4 skipped · 0 failed (vitest, just ran)
- **Backend tests:** 12,768 collected (pytest)
- **UAT-UIT-GUIDE:** header claims 517 test cases, later section summary says "Updated Grand Total: 476" — source is internally inconsistent; earlier "574" figure was wrong
- **Plans:** 568 checkbox-items across 12 files · 235 checked (41%) · 333 pending, but 184 of the pending belong to `2026-03-16-feat-ux-redesign-arrangement-view-plan.md` which PR #18 shipped past — real active backlog is ~149

**Release status claim ("feature-complete, ready for release prep"):** closer to true than the draft audit suggested. Blockers shrink to: (1) remount operators OR formally scope them out of v1, (2) visual UAT of blend modes + compound interactions, (3) close Phase 10 & Phase 11 plans or drop them from v1 scope, (4) fix 5 known bugs (BUG-6/8/11/12/13).

---

## Part 1 — Status At A Glance (Revised)

| Capability | Built | UI Mounted | Tested | Status |
|---|---|---|---|---|
| 170+ effects | ✅ | ✅ | ✅ auto + UAT | 🟢 SHIP |
| Timeline scrub/zoom/split | ✅ | ✅ | ✅ PASS | 🟢 SHIP |
| Preview + play/pause/seek | ✅ | ✅ | ✅ PASS | 🟢 SHIP |
| Undo/redo (incl. redo cap) | ✅ | ✅ | ✅ 100% | 🟢 SHIP |
| Save/load .glitch round-trip | ✅ | ✅ | ✅ PASS | 🟢 SHIP |
| Export H.264/265/GIF/ProRes | ✅ | ✅ | ⚠️ partial (dock overlap blocks UAT) | 🟡 UAT gap |
| Import (video/image/symlink safety) | ✅ | ✅ | ✅ PASS | 🟢 SHIP |
| Knobs (drag + right-click reset) | ✅ | ✅ | ✅ PASS | 🟢 SHIP |
| Knobs (scroll/Shift-drag/arrow/dbl-click) | ✅ | ✅ | ⚠️ tests pass, UAT couldn't verify via CU | 🟡 UAT gap |
| Performance pads (4×4) | ✅ | ✅ | ✅ PASS | 🟢 SHIP |
| Text overlays | ✅ | ✅ | ⚠️ wiring tested, no visual UAT | 🟡 UAT gap |
| Subliminal effects | ✅ | ✅ | ⚠️ backend test only | 🟡 UAT gap |
| J/K/L transport (Phase 12) | ✅ | ✅ | ✅ tests pass | 🟢 SHIP |
| Cmd+D duplicate effect | ✅ | ✅ | ✅ tests pass | 🟢 SHIP |
| Device Chain horizontal (PR #18) | ✅ | ✅ | ✅ tests pass | 🟢 SHIP |
| A/B switch (PR #18) | ✅ | ✅ | ✅ tests pass | 🟢 SHIP |
| Device Groups (flat, PR #18) | ✅ | ✅ | ✅ tests pass | 🟢 SHIP |
| Trigger Lanes (PR #18) | ✅ | ✅ | ✅ tests pass | 🟢 SHIP |
| Pop-out preview (PR #18) | ✅ | ✅ | ✅ tests pass | 🟢 SHIP |
| **Per-track opacity slider** | ✅ | ✅ (Track.tsx:225) | ⚠️ no visual UAT of compositing | 🟡 UAT gap |
| **Per-track blend-mode dropdown (9 modes)** | ✅ | ✅ (Track.tsx:241) | ⚠️ no visual UAT of any mode | 🟡 UAT gap |
| **Clip transform → render** | ✅ | ✅ TransformPanel + IPC + `_apply_clip_transform` | ⚠️ unit tests pass, no visual UAT of compound transforms | 🟡 UAT gap |
| **Operator editors (LFO/Env/StepSeq/Fusion/AudioFollower/VideoAnalyzer)** | ✅ 6 editors on disk | 🟡 **UNMOUNTED** (App.tsx:47) | ❌ 33 UAT tests N/A | 🟠 SHELVED |
| **Modulation Matrix** | ✅ ModulationMatrix.tsx + RoutingLines.tsx | 🟡 UNMOUNTED | ❌ 26 UAT tests N/A | 🟠 SHELVED |
| **Automation recording** | ✅ util + lane UI | ⚠️ UI exists but most params need operators to drive | ❌ 60 UAT tests N/A | 🟠 SHELVED-coupled |
| Groups-of-groups (nested) | ❌ by design | ❌ | N/A | ⚪ OUT OF SCOPE |
| Track-level transforms | ❌ | ❌ | ❌ | ⚪ NOT IN PRD |
| MIDI Learn / Pad Editor | ✅ | ⚠️ UI exists, no hardware UAT | ⚠️ store tests | 🟡 UAT gap |

**Legend:** 🟢 ship-ready · 🟡 built/wired but UAT gap · 🟠 shelved (built, intentionally not mounted) · 🔴 missing · ⚪ out of scope

---

## Part 2 — Plans Inventory

### Complete (6 phase plans + 5 sprint plans + 1 consolidation)
| Plan | ✓ | Notes |
|---|---|---|
| Phase 0B pipeline validation | 137/137 | Complete |
| Sprint 2B-1..5 (audio pipeline) | 33/33 | 5 plans complete |
| Phase-next-eng-pickup consolidation | 37/37 | Shipped via PR #18/#21 |

### Active — post-reality-check

| Plan | ✓/Total | Reality |
|---|---|---|
| `2026-02-28-phase3-uat-plan.md` | 0/0 | Planning doc, no checkboxes. Phase 3 shipped; plan stale. |
| `2026-03-15-phase10-freeze-library-plan.md` | **0/57** | UNTOUCHED. FreezeManager + preset library. Real work. |
| `2026-03-15-phase11-export-polish-plan.md` | **34/64** | Multi-codec export shipped; ~30 items remain (render queue UI, welcome screen, preferences polish). |
| `2026-03-15-ship-gate-audit-plan.md` | **10/61** | Per-phase ship-gate sweep. ~51 items remain. |
| `2026-03-16-feat-ux-redesign-arrangement-view-plan.md` | 20/204 | status=completed in frontmatter; 184 checkboxes stale — PR #18 shipped past. **Ignore checkbox count.** |

**Real remaining plan work:** ~149 items across phase10 (57), phase11 (~30), ship-gate (~51), phase3-UAT (~11 sub-items).

---

## Part 3 — What's Actually Been Tested

### 3a. Automated footprint (measured this pass)

- **Frontend (vitest):** **108 test files · 1,486 passed · 4 skipped · 0 failed** (up from 93 / 1,147 on 2026-04-10 — the orphan sprint tests + PR #18 added ~343 tests)
- **Backend (pytest):** **12,768 tests collected.** Full-pass count depends on timeout; with `--timeout=2 -n auto`, 4,590 pass + 929 skip in the fast tier. Full suite ran green in CI (PR #21).
- **Playwright E2E:** 22 specs across Phase 0A, 1, 4, 11, 11.5, 12, UAT, regression
- **Total effective: ≥14K automated tests**

### 3b. UAT footprint (UAT-UIT-GUIDE.md v4.3)

- **Doc claims:** "517 test cases" in header, "Updated Grand Total: 476 test cases" later in the doc. Source is inconsistent.
- **UAT-RESULTS-2026-04-09.md:** 274 unique results verified; of those, 235 PASS, 11 FAIL, 11 INCONCLUSIVE (mostly timing/audio), 11 N/A, 1 PARTIAL.
- **Coverage:** 274 / ~500 = ~55% of guide verified.
- **Biggest coverage holes (from Agent B's read):**
  - Section 14 "Operators & Modulation" — 33 tests, 0 verified (all N/A — UI unmounted)
  - Section 15 "Modulation Matrix" — 26 tests, 0 verified (N/A — UI unmounted)
  - Section 16 "Automation" — 41 tests, 1 verified (blocked on operators)
  - Section 6 "Audio" — 3 tests, 0 verified (needs human ears)
  - Section 7 "Timeline & Multi-Track" opacity/blend tests — now **buildable** since UI exists; just never exercised by CU.

### 3c. Bug status (from 2026-04-10 master plan, still accurate)

| | Count |
|---|---|
| Originally reported | 16 |
| Verified fixed via code review | 11 |
| Still open P1 | 2 (BUG-12 J/K/L semantic, BUG-13 Speed/Duration menu path) |
| Still open P2 | 1 (BUG-6 effect list hidden below tags) |
| Still open P3 | 2 (BUG-8 export dock overlap, BUG-11 track rename) |
| Test-bug (not code) | 1 (hue_shift 0→360 = identity) |

---

## Part 4 — The Five Gaps The User Called Out (Revised)

### Gap 1: Alpha layer / per-track opacity — ✅ BUILT, wired, untested visually
- **Code:** `setTrackOpacity()` in `timeline.ts:652`, slider in `Track.tsx:225-236` wired via `handleOpacityChange`. Compositor reads `opacity` per layer.
- **What's missing:** no UAT visually verifies that 50% opacity on Track 2 looks correct atop Track 1.
- **Fix scope:** **2-3 UAT cases.** No code work needed.

### Gap 2: Blending options — ✅ BUILT, wired, untested visually per mode
- **Code:** 9 modes registered in `compositor.py:69` (`normal, add, multiply, screen, overlay, difference, exclusion, darken, lighten`). `Track.tsx:153` dropdown exposes all 9; `handleBlendModeChange` wired to `setTrackBlendMode`.
- **What's missing:** zero tests render each mode on a real 2-track project and diff against a reference image.
- **Fix scope:** **9 UAT cases** (one per mode). Optional: a backend snapshot test to lock mode math.

### Gap 3: Compound effects (layers overlaid, multiple effects stacked)
- **Today:** individual effects have fuzz + param sweep; chains of 10 tested at perf level only (frame-rate, not pixel correctness).
- **Missing:** param-interaction tests across a chain. Example: `Pixel Sort → Datamosh → Chromatic Aberration` — does output match the same chain reordered? Does bypass of the middle one produce expected before/after?
- **Fix scope:** 1 new integration spec (`test_chain_interactions.py`) with 20 scenarios. 3 UAT cases.

### Gap 4: Groups of groups (nested device groups)
- **Today:** device groups exist as flat metadata (`{groupId: {name, effectIds, color?}}`). No nesting; `effectIds` points at leaf effects only.
- **By design:** PR #18 CTO amendment C2 flattens groups before sending to Python. Nested groups would require a recursive flattener.
- **User impact:** low — nested groups are an Ableton power-user feature, not MVP.
- **Fix scope:** ~1 week if wanted (types + store + UI + recursive flattener). **Recommend punt to v1.1.**

### Gap 5: Transforms (rotate + scale + translate combinations) — ✅ BUILT, wired end-to-end
- **Clip-level:** fully built and applied. `TransformPanel.tsx` exposes x/y/scale/rotation/anchor. `App.tsx:913` includes `transform: clipTransform` in clip payload. `zmq_server._apply_clip_transform` (line 1121) applies them (rotation clamped ±36000°, x/y ±10000px, anchor support). Per-layer transform also applied in compositor (`zmq_server.py:603-607`).
- **Master plan's "fields accept input but don't affect render" claim is obsolete** (was true at some earlier point; backend path now exists).
- **What's missing:** UAT cases for compound transforms (45° rotate + 2× scale + 100px translate simultaneously), and for track-level transforms (not built — out of PRD).
- **Fix scope:** **3 UAT cases.** No code work needed for clip-level.

### Bonus — compound interactions (user's catch-all) — still a gap

| Scenario | UAT? | Risk |
|---|---|---|
| 10 effects + 3 tracks + blending + transforms | None | Medium — perf + correctness unknown |
| Text overlay on blended layer (Track 2 in screen-blend) | None | Medium |
| Rapid automation record + undo midway + resume | None | Medium — state consistency unknown |
| Operator → effect param → record automation on same knob | None | Blocked on operators being remounted |
| Clip trim + marker move + undo sequence | Partial | Low-Medium |
| Drag clip between tracks | None | Medium |

---

## Part 5 — Ranked TODO (Revised)

### Tier 1 — Ship blockers (1 session each)
1. **Decide operator scope for v1:** either (a) remount the 6 editors + ModulationMatrix (code exists, App.tsx:47 comment invites re-enable) or (b) formally scope operators + automation out of v1 and delete the 100 UAT items from the release-blocker list. This single decision controls ~100 UAT items.
2. **Fix BUG-6** — effect list hidden below category tags at small windows.
3. **Fix BUG-13** — Speed/Duration dialog from menu bar path.
4. **Visual UAT of blend modes + opacity** — 11 UAT cases (9 blend modes + 2 opacity compound cases). Features already work; just need verification.

### Tier 2 — UAT catch-up (no new features required)
5. **Compound-interaction integration spec** (`test_chain_interactions.py`) — 20 scenarios across multiple effects, reorders, bypass, transform + effect stacks.
6. **Text-over-blended-video UAT** — 3 cases.
7. **Audio UAT with human ears** — 3 items from Section 6.
8. **Parameter tooltip audit** — 500+ param tooltips untested; consider a snapshot script instead of manual.

### Tier 3 — Real engineering (if doing more than bug-fix)
9. **Phase 11 export polish** — ~30 items (render queue UI, welcome screen, preferences). Partially shipped, finish or trim.
10. **Ship-gate audit** — 51 items. Per-phase P0–P3 sweep.
11. **Phase 10 freeze/library** — 0/57. FreezeManager + preset library. Not started.

### Tier 4 — Polish / cleanup
12. **Discrepancies** — Max chain: UI says 10, Preferences says 20. Pick one.
13. **Stale plan cleanup** — mark arrangement-view-plan formally completed (frontmatter already says so); optionally tick its 184 boxes.
14. **Prune local branches** — 20 local feature branches exist; many are merged or stale.

### Out of scope / deferred
- Groups-of-groups (punt to v1.1)
- Track-level transforms (no PRD requirement)

---

## Part 6 — What Still Needs a Human

- Audio playback / volume / sync — needs ears
- MIDI CC modulation — needs hardware controller
- Export dialog reachability under dock overlap — environment-dependent
- Pop-out preview on 2nd monitor — needs dual display
- Knob fine/coarse precision — needs human-perceived feel test
- Real-content compound interaction judgment — quality call on output

---

## Part 7 — Subjective Release Readiness Call

**If v1 means "glitch-video DAW with a device chain, blending, transforms, effects":** you are ~95% there. Bugs #6, #13 remain; UAT coverage of blending/compound interactions is the gap to close. 2–3 sessions.

**If v1 includes operators + modulation + automation as promised in the UAT guide (Sections 14–16, 100 items):** you are ~70% there. Remounting the operator UI is a 1–2 session task, but then actual UAT of the modulation pipeline and compound interactions is another 3–5 sessions.

**Recommended cut:** ship v1 without operators mounted. Flag Sections 14–16 of the UAT guide as "v1.1 scope". This is defensible — the master plan already hinted at it ("Operators/automation untested because no UI").

---

## Appendix A — Documents Cross-Referenced

- `docs/MASTER-UAT-AND-BUILD-PLAN-2026-04-10.md` — prior audit (this doc revises + updates it)
- `docs/COMPONENT-ACCEPTANCE-CRITERIA.md` — 81 components BDD specs
- `docs/RED-TEAM-ALL-COMPONENTS.md` — attack surface per component
- `docs/UAT-TEST-PLANS-FROM-BDD.md` — 106 click-by-click test plans
- `docs/BDD-REVIEW-2026-04-10.md` — quality review of BDD docs
- `docs/UAT-RESULTS-2026-04-09.md` — 274 verification results
- `docs/plans/2026-04-10-phase-next-eng-pickup.md` — 37/37 sprint consolidation (shipped via PR #18/#21)

## Appendix B — Active PRs / Branches

- main at `0622e5e` (PR #21 merged, PR #22 open with this doc)
- 20 local feature branches exist — prune candidates (phase3-color, phase11.5-observability, phase12-text-subliminal-image, e2e-migration-batch2..5, etc.)

## Appendix C — Corrections Applied (Ultrathink Review 2026-04-16)

Errors found in the first draft of this audit, now fixed:

| # | First-draft claim | Reality on disk | Source of truth |
|---|---|---|---|
| 1 | "Per-track opacity slider missing" | Slider exists at `Track.tsx:225-236`, wired to `setTrackOpacity` | Direct read of `Track.tsx` |
| 2 | "Per-track blend-mode dropdown missing" | Dropdown exists at `Track.tsx:241-242`, all 9 modes listed at `Track.tsx:153` | Direct read of `Track.tsx` |
| 3 | "0 operator editors built / 6 missing" | All 6 editors + ModulationMatrix + RoutingLines + OperatorRack exist on disk; unmounted via `App.tsx:47` comment | `ls frontend/src/renderer/components/operators/` + `grep Operator App.tsx` |
| 4 | "`setClipTransform` may not reach renderer" | Frontend sends `transform` field in IPC clip payload (`App.tsx:913`); backend applies it in `zmq_server._apply_clip_transform` (line 1121) plus per-layer in compositor | `grep _apply_clip_transform backend/src/zmq_server.py` |
| 5 | "10,300 auto tests; 89 frontend files; 9,153 backend" | 1,486 passing vitest across **108 files**; **12,768 pytest collected** | Live test run + `pytest --collect-only` |
| 6 | "274/574 UAT items verified (48%)" | UAT doc is internally inconsistent — 517 in header vs 476 grand-total. Coverage is ~55%, not 48%. | `head -7 docs/UAT-UIT-GUIDE.md` + grep section totals |

**Method:** direct filesystem verification of every factual claim. No claim retained without a file-path citation. Master plan figures (2026-04-10) were carried forward uncritically in the draft; several are now stale.
