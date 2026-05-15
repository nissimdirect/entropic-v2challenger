---
title: Mount Operators + Sweep UAT Findings (2026-05-15)
status: active
owner: claude-opus-4-7
branch: feat/mount-operators-and-p1-fixes
worktree: ~/Development/entropic-mount-wt
base: origin/main @ 0e9ae35
ships_into: v1
---

# Goal

Re-mount the architectural N/A sections from the 2026-05-15 UAT synthesis (Operators + Modulation Matrix) and squash every filed UAT finding (F-0514-1 → F-0514-15) until origin/main is feature-complete and bug-free for v1 ship.

Source of truth for bugs: `~/.claude/plans/entropic-uat-FINAL-SYNTHESIS-2026-05-15.md`

## Inventory

### A. Unmounted features (mount in current loop)
- [x] **A1** Mount `OperatorRack` panel in App.tsx — mounted as floating overlay (not flag-gated; backend already serializes)
- [x] **A2** Wire `OperatorRack` props from current state (effectChain, registry, operatorValues, hasAudio)
- [x] **A3** Add `Cmd+Shift+O` shortcut + floating panel slot
- [x] **A4** Mount `ModulationMatrix` (renders inside operators overlay, below OperatorRack)
- [x] **A5** Mount `RoutingLines` (SVG overlay wrapping OperatorRack inside relative-positioned wrapper)
- [x] **A6** Verify `PerformancePanel` toggle: import App.tsx:42, mount App.tsx:2227, toggle App.tsx:348 via `p` key — code intact
- [x] **A7** Add 1 Vitest smoke: OperatorRack renders with empty operators array, addOperator triggers operator card (4 tests pass)
- [ ] **A8** Add 1 Playwright E2E: open app → press feature-flag → toggle operators panel → add LFO → see card

### B. P1 ship-blockers (must fix this loop)
- [x] **B1 — F-0514-10**: clamp `frameRate` at validation layer
  - Backend `backend/src/project/schema.py:56-86`: add `if not (1 <= settings["frameRate"] <= 240): errors.append(...)`
  - Frontend `frontend/src/renderer/project-persistence.ts:171`: range-check after type check
  - 2 tests: out-of-range fps rejected, edge cases (0, 241, NaN, -1)
- [x] **B2 — F-0514-6**: pop-out "Disconnected" false-positive
  - Real root cause: the 2s disconnect timer used frame arrival as liveness proxy → pause = "Disconnected"
  - Fix: main process sends `pop-out:ping` every 1s; preload exposes `onPing` + `getLastPingAt`; component shows Disconnected only when pings stop for >3.5s
  - 5 new heartbeat tests + extended contract test (14 pop-out tests pass)

### C. P2 (before v1.1 — addressing in same PR since scope says "all bugs squashed")
- [x] **C1 — F-0514-11**: range-check `seed` / `masterVolume` / `audioSampleRate` at project load
  - Same files as B1; clamp seed (0 ≤ x ≤ 2^31-1), masterVolume (0..2), audioSampleRate ∈ {8000,11025,16000,22050,32000,44100,48000,88200,96000}
- [x] **C2 — F-0514-4/5/7 cluster**:
  - F-0514-5: Escape now calls `clearSelection()` before stop (App.tsx keydown handler)
  - F-0514-4: TransformPanel max-height tightened to `min(28vh, 320px)` + `flex-shrink: 1`; `.app__sidebar > .effect-browser` floored at `min-height: 200px`
  - F-0514-7: P4 downgrade per synthesis (single-click workaround exists). Drag-add deferred to v1.1 — not blocking ship
- [x] **C3 — F-0514-1**: hide "Frame render failed" toast on first failure (auto-retry handles import-race). Toast only fires when empty-chain retry also fails — i.e. real failure

### D. P3 (nice-to-have — sweeping in this loop since user said all bugs)
- [x] **D1 — F-0514-2**: Color Temperature unit `"K"` → `""`. The -100..100 range was never Kelvin degrees; the K suffix was misleading
- [x] **D2 — F-0514-3**: ExportDialog onClose now triggers `requestRenderFrame(currentFrame)` so preview re-renders with chain immediately
- [ ] **D3 — F-0514-8**: av/cv2 dylib conflict warning at runtime (suppress or root-cause OpenCV/PyAV linking)
- [ ] **D4 — F-0514-12**: Port frontend `walk()` defense to backend schema (deep-walk validation)
- [ ] **D5 — F-0514-15**: `dsp_phaser.py:187` divide-by-zero on all-black frame (guard zero variance)
- [ ] **D6 — F-0514-13**: `test_parameter_sweep` companion-param manifest (test infra)
- [ ] **D7 — F-0514-14**: `_reset_pipeline_health()` fixture + rerun interaction (test infra)

### E. Validation
- [ ] **E1** Run `cd backend && python -m pytest -x -n auto --tb=short` — must stay ≥ 1652 pass with no regressions, fix new failures
- [ ] **E2** Run `cd frontend && npx --no vitest run` — must stay green
- [ ] **E3** Run oracle suite `pytest backend/tests/oracles/ -q` — must stay 127/127
- [ ] **E4** Smoke launch Electron, click through OperatorRack + PerformancePanel toggle (computer use)
- [ ] **E5** Open PR with full bug-fix changelog referencing all F-0514-* IDs
- [ ] **E6** Update `~/Documents/Obsidian/handoffs/` with session handoff

## Batch order

| Batch | Items | Rough effort |
|-------|-------|--------------|
| 1 | B1 (F-0514-10 frameRate) + C1 (F-0514-11 numeric clamps) — same files | 20 min |
| 2 | A1–A3 OperatorRack mount + A7 vitest | 40 min |
| 3 | A4–A6 ModulationMatrix + RoutingLines + Performance verify | 30 min |
| 4 | B2 (F-0514-6 pop-out IPC) | 30 min |
| 5 | C2 (F-0514-4/5/7 cluster) | 40 min |
| 6 | C3 + D1 + D2 (UI race + Kelvin + frame flash) | 20 min |
| 7 | D3 + D5 (dylib + div-by-zero — backend) | 15 min |
| 8 | D4 + D6 + D7 (defense + test infra) | 30 min |
| 9 | E1-E6 validation + PR | 30 min |

Total estimate: ~4 hours

## Test Plan

### What to test
- [ ] OperatorRack renders without crash when flag enabled
- [ ] Adding LFO/Envelope/StepSeq operator creates a card; removing destroys it
- [ ] frameRate=0, frameRate=300, frameRate=NaN, frameRate=-5 all rejected with errors
- [ ] Pop-out preview window shows "Connected" within 2s of opening
- [ ] All P3 fixes don't regress existing oracle suite

### Edge cases
- [ ] Empty operators array (initial state)
- [ ] Project load with malformed `frameRate` triggers user toast
- [ ] Pop-out window opened twice in rapid succession
- [ ] All-black input frame doesn't div-by-zero phaser

### How to verify
- Backend: `cd backend && python -m pytest tests/test_schema_validation.py tests/test_phaser.py -x`
- Frontend: `cd frontend && npx --no vitest run src/__tests__/components/operators/`
- Manual: launch app via `cd frontend && npm start`, toggle OperatorRack, open pop-out preview

### Existing test patterns to follow
- Test framework: pytest (backend), Vitest + happy-dom (frontend component), Playwright `_electron` (E2E)
- Example: `backend/tests/test_project_schema.py` for B1/C1 patterns
- Example: `frontend/src/__tests__/components/timeline/Timeline.test.tsx` for A7

## Out of scope this loop
- Full operator-to-effect modulation runtime (already wired backend-side; UI is for editing config only)
- New effects, new themes, new export codecs
- Refactoring beyond what's needed for the fixes
