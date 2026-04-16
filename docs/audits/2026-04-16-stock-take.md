---
title: "Entropic v2 — Comprehensive Stock-Take Audit"
date: 2026-04-16
status: active
type: audit
supersedes: ["docs/MASTER-UAT-AND-BUILD-PLAN-2026-04-10.md (partial)"]
sources:
  - docs/plans/ (12 files, 568 checkboxes)
  - docs/UAT-UIT-GUIDE.md (574 tests v4.3)
  - docs/UAT-RESULTS-2026-04-09.md (274/574 verified)
  - docs/MASTER-UAT-AND-BUILD-PLAN-2026-04-10.md
  - docs/BDD-REVIEW-2026-04-10.md
  - docs/RED-TEAM-ALL-COMPONENTS.md (579 lines)
  - Code inspection: backend/src/effects/, frontend/src/renderer/
  - Git log since 2026-04-10 (PR #18 + PR #21)
---

# Entropic v2 — Comprehensive Stock-Take Audit

## TL;DR

Entropic v2 Challenger is **feature-packed, under-surfaced, and under-tested in the risky places**. ~170 effects work. Core timeline, preview, undo, export, and crash recovery are solid and passing (PASS rate 86% on tested items). But three critical capability areas are **built in code yet invisible to the user** — and therefore impossible to UAT: (1) **multi-track blending** (9 modes live in the compositor but no track-header UI), (2) **Phase 6 operator modulation** (store complete, 0 UI, 33 guide tests N/A), (3) **automation recording/playback** (infrastructure complete, 60 guide tests blocked on operators). Plus compound-interaction UAT (3+ effects stacked, layered tracks with blending, text over blended video, rapid record+undo) is a blank slate.

**Numbers:** 10,300+ automated tests passing. 274/574 UAT items verified (48%). 5 active plans, 333/568 checkboxes pending — but ~184 of those are in the arrangement-view plan, which PR #18 shipped past.

**Release status claim ("feature-complete, ready for release prep"):** optimistic. Four dark-feature areas break that claim.

---

## Part 1 — Status At A Glance

| Capability | Built | UI Wired | Tested | Status |
|---|---|---|---|---|
| 170+ effects | ✅ | ✅ | ✅ auto + UAT | 🟢 SHIP |
| Timeline scrub/zoom/split | ✅ | ✅ | ✅ PASS | 🟢 SHIP |
| Preview + play/pause/seek | ✅ | ✅ | ✅ PASS | 🟢 SHIP |
| Undo/redo (incl. redo cap) | ✅ | ✅ | ✅ 100% | 🟢 SHIP |
| Save/load .glitch round-trip | ✅ | ✅ | ✅ PASS | 🟢 SHIP |
| Export H.264/265/GIF/ProRes | ✅ | ✅ | ⚠️ partial (dock overlap blocks UAT) | 🟡 UAT gap |
| Import (video/image/symlink safety) | ✅ | ✅ | ✅ PASS | 🟢 SHIP |
| Knobs (drag + right-click reset) | ✅ | ✅ | ✅ PASS | 🟢 SHIP |
| Knobs (scroll/Shift-drag/arrow/dbl-click) | ✅ | ✅ | ⚠️ tests pass, UAT couldn't verify | 🟡 UAT gap |
| Performance pads (4×4) | ✅ | ✅ | ✅ PASS | 🟢 SHIP |
| Text overlays | ✅ | ✅ | ⚠️ wiring tested, no visual UAT | 🟡 UAT gap |
| Subliminal effects | ✅ | ✅ | ⚠️ backend test only | 🟡 UAT gap |
| J/K/L transport (Phase 12) | ✅ | ✅ | ✅ tests pass | 🟢 SHIP |
| Cmd+D duplicate effect | ✅ | ✅ | ✅ tests pass | 🟢 SHIP |
| Device Chain horizontal (PR #18) | ✅ | ✅ | ✅ tests pass | 🟢 SHIP |
| A/B switch (PR #18) | ✅ | ✅ | ✅ tests pass | 🟢 SHIP |
| Device Groups (PR #18) | ✅ | ✅ | ✅ tests pass | 🟢 SHIP |
| Trigger Lanes (PR #18) | ✅ | ✅ | ✅ tests pass | 🟢 SHIP |
| Pop-out preview (PR #18) | ✅ | ✅ | ✅ tests pass | 🟢 SHIP |
| **Per-track opacity** | ✅ store | ❌ **no slider** | ❌ | 🔴 DARK FEATURE |
| **Per-track blend mode (9 modes)** | ✅ compositor | ❌ **no dropdown** | ❌ | 🔴 DARK FEATURE |
| **Clip transform → render** | ✅ panel + IPC | ⚠️ panel fields don't reach renderer (known discrepancy) | ❌ | 🔴 DARK FEATURE |
| **Operators (LFO/Env/StepSeq/Fusion/AudioFollower/VideoAnalyzer)** | ✅ 7 stores | ❌ **6 editors missing** | ❌ 33 UAT tests N/A | 🔴 DARK FEATURE |
| **Modulation Matrix** | ✅ store | ❌ **no UI** | ❌ 26 UAT tests N/A | 🔴 DARK FEATURE |
| **Automation recording** | ✅ util | ⚠️ UI exists, blocked on operators | ❌ 60 UAT tests N/A | 🔴 DARK FEATURE |
| Groups-of-groups | ❌ by design | ❌ | N/A | ⚪ OUT OF SCOPE |
| Track-level transforms | ❌ | ❌ | ❌ | ⚪ NOT IN PRD |
| MIDI Learn / Pad Editor | ✅ | ⚠️ UI exists, no hardware UAT | ⚠️ store tests | 🟡 UAT gap |

**Legend:** 🟢 ship-ready · 🟡 built but UAT gap · 🔴 built in backend/store, not surfaced to user · ⚪ out of scope

---

## Part 2 — Plans Inventory (what's still open)

### Complete (6)
| Plan | ✓ | Branch |
|---|---|---|
| Phase 0B pipeline validation | 137/137 | (merged) |
| Sprint 2B-1 audio-decode | 7/7 | sprint/2B-1-audio-decode |
| Sprint 2B-2 waveform | 7/7 | sprint/2B-2-waveform |
| Sprint 2B-3 playback | 7/7 | sprint/2B-3-playback |
| Sprint 2B-4 av-sync | 7/7 | sprint/2B-4-av-sync |
| Sprint 2B-5 audio-store | 5/5 | sprint/2B-5-audio-store |
| Phase-next-eng-pickup consolidation | 37/37 | (merged via PR #18) |

### Active — but status is misleading

| Plan | ✓/Total | Reality Check |
|---|---|---|
| `2026-02-28-phase3-uat-plan.md` | 0/0 | Planning doc, no checkboxes. Phase 3 color suite shipped; plan is stale. |
| `2026-03-15-phase10-freeze-library-plan.md` | **0/57** | UNTOUCHED. Freeze/flatten engine + preset library. **Real gap.** |
| `2026-03-15-phase11-export-polish-plan.md` | **34/64** | Active. Multi-codec export shipped; ~30 items on render queue UI, welcome screen, preferences. |
| `2026-03-15-ship-gate-audit-plan.md` | **10/61** | Active. Per-phase ship-gate audit. **Substantial work remaining.** |
| `2026-03-16-feat-ux-redesign-arrangement-view-plan.md` | 20/204 | Status `completed` but 184 boxes unchecked. PR #18 shipped Phases 12-16 without ticking them. **Stale — ignore.** |

**Real remaining plan work:** ~158 checkboxes across phase10 (57) + phase11 (30) + ship-gate (51) + phase3 UAT (20 verifications) — not 333.

---

## Part 3 — What's Been Built, Tested, and What's Not

### 3a. Automated Test Footprint

- **Frontend (vitest):** 89 test files, 1,147+ tests passing, 0 failing (as of PR #21)
- **Backend (pytest):** 94 test files, 9,153 tests passing, 1 test-bug (hue_shift 0→360 sweep = 0 diff because 360° = identity)
- **Playwright E2E:** 22 specs across Phase 0A, 1, 4, 11, 11.5, 12, UAT, regression
- **Total automated: ~10,300 tests passing**

### 3b. UAT Footprint (UAT-UIT-GUIDE.md v4.3, 574 items)

| Section | Tests | Verified | Status |
|---|---|---|---|
| 1. App Launch | 9 | ~9 | ✅ |
| 2. Video Import | 12 | ~11 | ✅ |
| 3. Preview Canvas | 8 | ~7 | ✅ |
| 4. Effect System | 25 | ~24 | ✅ |
| 5. Parameter UX | 7 | 5 | 🟡 |
| 6. Audio | 3 | 0 | ⚠️ requires ears |
| 7. Timeline & Multi-Track | 21 | 18 | 🟡 (opacity/blend N/A) |
| 8. Undo/Redo | 4 | 4 | ✅ |
| 9. Save/Load | 7 | 7 | ✅ |
| 10. Export | 4 | 2 | 🟡 (dock overlap) |
| 11. Panel Layout | 3 | 3 | ✅ |
| 12. Keyboard Shortcuts | 12 | 7 | 🟡 |
| 13. Performance Mode | 4 | 4 | ✅ |
| **14. Operators & Modulation** | **33** | **0** | 🔴 UI not wired |
| **15. Modulation Matrix** | **26** | **0** | 🔴 UI not wired |
| **16. Automation** | **41** | 1 | 🔴 blocked on operators |
| 17. Stress Testing | 12 | 9 | ✅ |
| 18. Integration | 7 | ~5 | 🟡 |
| 19. Missing Interactions | 10 | ~5 | 🟡 |
| 20. Red Team / Security | 6 | ~5 | ✅ |
| 21. Known Gaps (reference) | 7 | — | — |
| **TOTAL** | **574** | **274 (48%)** | |

**The 100 un-verified tests cluster in just three places: operators, modulation matrix, automation** — all dark features.

### 3c. Bugs (from master plan, updated after 2026-04-11 code verification)

| Severity | Count | Status |
|---|---|---|
| Originally reported | 16 | |
| **Fixed (code-verified)** | 11 | BUG-1, 2, 3, 4, 5, 7, 9, 10, 14, 15, 16 |
| **Still open — P1** | 2 | BUG-12 (J/K/L semantic — mostly shipped in Phase 12), BUG-13 (Speed/Duration menu path) |
| **Still open — P2** | 1 | BUG-6 (effect list hidden below category tags at small windows) |
| **Still open — P3** | 2 | BUG-8 (export dialog dock overlap), BUG-11 (track rename double-click) |
| Test-bug (not code) | 1 | hue_shift 0→360 sweep = identity |

---

## Part 4 — The Five Gaps The User Called Out

### Gap 1: Alpha layer / per-track opacity
- **Code:** `timeline.ts::setTrackOpacity()`, `setClipOpacity()` — store methods exist
- **Compositor:** reads `opacity` per layer, multiplies alpha correctly
- **UI:** **no slider anywhere.** Track header has no opacity control. Only way to exercise is via project-file edit.
- **Tests:** `sprint5-missing-ui.test.ts`, `sprint4-track-controls.test.ts` cover store behavior; no UI test because no UI.
- **Fix scope:** Add `<Slider>` to `timeline/Track.tsx` header wired to `setTrackOpacity`. ~30 LOC + 1 Vitest + 1 E2E.

### Gap 2: Blending options
- **Code:** `backend/src/engine/compositor.py::BLEND_MODES` — 9 modes: `normal, add, multiply, screen, overlay, difference, exclusion, darken, lighten`
- **IPC:** `App.tsx` already passes `blend_mode: track.blendMode ?? 'normal'` to the compositor
- **UI:** **no dropdown.** Zero tracks can have their blend mode changed from the UI.
- **Tests:** backend `test_compositor.py` covers per-mode math; zero visual/UAT tests.
- **Fix scope:** Add `<Select>` to track header with 9 options, wired to `setTrackBlendMode`. Add 9 UAT items (one per mode, visual diff on a 2-track project). ~50 LOC + 9 UAT cases.

### Gap 3: Layers overlaid / multiple effects grouped together
- **Today:** Each individual effect has a fuzz test + param sweep. Chains of 10 effects are tested at **performance** level only (does it render at 30 fps, not does it produce the right pixels).
- **Untested:** param interactions in a long chain. Example: Pixel Sort → Datamosh → Chromatic Aberration → does the output match a chain that reorders them? Does bypass of the middle one produce the expected before/after?
- **Fix scope:** 1 new integration spec: `test_chain_interactions.py` with 20 scenarios (2–5 effect compounds, bypass, reorder, duplicate). Plus 3 UAT cases.

### Gap 4: Groups of groups (nested device groups)
- **Today:** Device groups exist as metadata (`{groupId: {name, effectIds, color?}}`). **No nesting** — `effectIds` can only point at leaf effects.
- **By design:** PR #18's CTO amendment C2 intentionally flattens groups before sending to Python. Nested groups would require a recursive flattener.
- **User impact:** low — nested groups are an Ableton power-user feature, not an MVP need.
- **Fix scope:** if wanted, ~1 week (types + store + UI + flattener). **Recommend punt to v1.1.**

### Gap 5: Transforms (rotate + scale + translate combinations)
- **Clip-level:** fully built (`TransformPanel.tsx`, `ClipTransform` type, cv2 affine in `pipeline.py`). Aspect lock works.
- **Track-level:** not built. No track transform. **Unclear if user wants this.**
- **Keyboard shortcuts:** zero transform shortcuts (no arrow-nudge, no rotate-by-Shift+R, nothing).
- **Compound UAT:** clip transforms tested via unit; no UAT case for "rotate 45° + scale 2× + translate 100px all at once — does it render correctly?"
- **Known discrepancy:** master plan flags "Transform panel fields accept input but don't affect render" — `setClipTransform` store action may not be reaching renderer via IPC. **Needs verification.**
- **Fix scope:** verify IPC path + 3 UAT compound cases. Shortcuts optional.

### Bonus Gap — compound interactions (user's catch-all)

| Scenario | UAT Test? | Risk |
|---|---|---|
| 10 effects + 3 tracks + blending + transforms | None | Medium — performance/correctness unknown |
| Text overlay on blended layer (Track 2 in screen-blend) | None | Medium — text-over-video compositing untested |
| Rapid automation record + undo midway + resume | None | Medium — state consistency unknown |
| Operator → effect param → record automation on same knob | None | HIGH — but blocked on operators being wired |
| Clip trim + marker move + undo sequence | Partial | Low-Medium — marker move inconclusive in UAT |
| Drag clip between tracks | None | Medium — inter-track drag coordination untested |

---

## Part 5 — Ranked TODO (What To Build/Test Next)

### Tier 1 — Ship-blockers (roughly 1 session each, high confidence)
1. **Track opacity + blend-mode UI controls** — unlocks blending UAT (9 visual cases). Gap 1+2.
2. **Verify `setClipTransform` → IPC → renderer chain** — flagged as "fields accept input but don't affect render." Gap 5 sub.
3. **Fix BUG-6** — effect list hidden below category tags (P2, user-visible).
4. **Fix BUG-13** — Speed/Duration dialog from menu bar path.

### Tier 2 — Dark-feature surfacing (each ~2-4 sessions)
5. **Operator editors** — 6 editors (LFO, Envelope, StepSeq, Fusion, AudioFollower, VideoAnalyzer). Store is complete; each editor is a 200-400 LOC React panel. **Unlocks 33 UAT items + automation feature.**
6. **Modulation Matrix UI** — ghost handles, drag-to-assign. Unlocks 26 UAT items.
7. **Phase 10 freeze/library** — 0/57 checkboxes, not started. FreezeManager class + preset library.

### Tier 3 — UAT-only (tests, not features)
8. **Compound interaction suite** — 10 integration cases covering 3+ effects, layered tracks with blending, text over blended video.
9. **Visual blend-mode UAT** — 9 cases, one per mode.
10. **Ship Gate Audit plan** — 51 items. Per-phase P0–P3 sweep.
11. **Audio UAT with ears** — 3 items. Requires human tester.
12. **Parameter tooltip audit** — 500+ param tooltips untested.

### Tier 4 — Polish / cleanup
13. **Phase 11 export polish** — render queue UI, welcome screen, preferences polish. ~30 items.
14. **Discrepancies** — Max chain: UI says 10, Preferences says 20. Pick one.
15. **Stale plan cleanup** — mark arrangement-view-plan completed (status field is already `completed`; checkbox drift is cosmetic).

### Out of scope / deferred
- **Groups-of-groups** (nested device groups) — punt to v1.1. Gap 4.
- **Track-level transforms** — no PRD requirement.

---

## Part 6 — What Needs a Human (Can't Auto-UAT)

- Audio playback / volume / sync (Tests 99-110) — requires ears
- MIDI CC modulation with physical MIDI hardware (Tests 260-290) — requires a MIDI controller
- Export dialog button reachability when dock overlaps — environment-specific
- Preview pop-out on second monitor — requires 2 displays
- Knob fine/coarse Shift-drag precision — requires human-perceived feel test
- Compound interaction dry-run on real 1080p/4K content — requires judgment on output quality

---

## Appendix A — Documents Cross-Referenced

- `docs/MASTER-UAT-AND-BUILD-PLAN-2026-04-10.md` — previous audit (this doc updates it)
- `docs/COMPONENT-ACCEPTANCE-CRITERIA.md` — 81 components with BDD specs
- `docs/RED-TEAM-ALL-COMPONENTS.md` — attack surface per component
- `docs/UAT-TEST-PLANS-FROM-BDD.md` — 106 click-by-click test plans derived from BDD
- `docs/BDD-REVIEW-2026-04-10.md` — quality review of BDD docs
- `docs/UAT-RESULTS-2026-04-09.md` — 274/574 verification session
- `docs/plans/2026-04-10-phase-next-eng-pickup.md` — 37/37 sprint consolidation (shipped via PR #18)
- Git log since 2026-04-10: PR #18 (UX redesign Phases 12-16), PR #19 (CI OIDC), PR #20 (CI workflow removal), PR #21 (orphan sprint tests).

## Appendix B — Active PRs / Branches

- All PRs merged as of 2026-04-16 02:30. main at `0622e5e`.
- 20 local feature branches exist (phase3 color, phase10 freeze, phase11 export, phase11.5 observability, phase12 text/image, phase15-16 triggers, etc.) — several may be garbage to prune.
