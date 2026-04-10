---
title: "Phase Next: Eng Pickup — BDD/Red-Team Findings"
status: active
created: 2026-04-10
source: BDD review + red-team audit + UAT passes 1-12
---

# Phase Next: Everything Not Coded Properly

> **Purpose:** Consolidate all gaps found during BDD acceptance criteria review, red-team audit, and 12 UAT passes into an actionable eng sprint plan.
> **Scope:** Bugs, missing wiring, unwired store features, unimplemented shortcuts, missing components, and security findings.
> **Priority:** Ordered by user impact, then by fix effort.

---

## Sprint 1: Fix Broken Wiring (5 items, ~2 hours)

These are defined but not connected — literally adding handler registrations.

- [ ] **Wire J/K/L transport shortcuts** (BUG-12)
  - File: `App.tsx` lines 243-335
  - Add `register('transport_forward', ...)`, `register('transport_reverse', ...)`, `register('transport_stop', ...)`
  - Handlers: call `engineStore.play()` with speed multiplier, `engineStore.pause()` for K
  - Reference: `default-shortcuts.ts` lines 10-12 define the bindings
  - AC: Press L → forward playback, J → reverse, K → pause in place

- [ ] **Wire Cmd+D duplicate effect** (BUG-14)
  - File: `App.tsx` lines 243-335
  - Add `register('duplicate_effect', ...)` handler
  - Handler: get selected effect ID, call `effectStore.duplicateEffect(id)`
  - Reference: `default-shortcuts.ts` line 17
  - AC: Select effect in chain, Cmd+D → identical copy appears after it

- [ ] **Add Delete key for clips** (BUG-15)
  - File: `default-shortcuts.ts` — add `delete_clip` action mapped to Delete/Backspace
  - File: `App.tsx` — add handler that calls `timelineStore.removeClip(selectedClipId)`
  - AC: Select clip, press Delete → clip removed, undoable

- [ ] **Wire Speed/Duration dialog** (BUG-13)
  - Create: `components/dialogs/SpeedDurationDialog.tsx`
  - Store: add `setClipSpeed(clipId, speed)` to timeline store
  - Wire: Clip context menu "Speed/Duration..." → open dialog
  - AC: Right-click clip → Speed/Duration → dialog with speed %, duration, reverse checkbox

- [ ] **Wire NumberInput to Knob double-click** (BUG-9)
  - File: `common/Knob.tsx` — add onDoubleClick handler on value display
  - Shows: `NumberInput` component (already exists) positioned over the value
  - AC: Double-click knob value → editable field appears, Enter confirms, Escape cancels

---

## Sprint 2: Knob Interaction Polish (4 items, ~3 hours)

- [ ] **Add scroll wheel to Knob** (BUG-5)
  - File: `common/Knob.tsx` — add onWheel handler
  - Each scroll tick = 1 step change
  - AC: Scroll up on knob → value increases, scroll down → decreases

- [ ] **Add Shift/Cmd drag modifiers** (BUG-16)
  - File: `common/Knob.tsx` — check `e.shiftKey` and `e.metaKey` in drag handler
  - Shift: 1/10th sensitivity, Cmd: 10x sensitivity
  - AC: Shift+drag → fine, Cmd+drag → coarse

- [ ] **Add arrow key control to Knob** (BUG-10)
  - File: `common/Knob.tsx` — add onKeyDown for ArrowUp/ArrowDown
  - Requires: knob must accept focus (tabIndex)
  - AC: Click knob → press Up → value increments by step

- [ ] **Add scroll wheel to Knob** (BUG-5) — see above, same item

---

## Sprint 3: Layout/UX Fixes (4 items, ~2 hours)

- [ ] **Fix effect list hidden below category tags** (BUG-6)
  - File: `effects/EffectBrowser.tsx`
  - Fix: make effect list independently scrollable, or make tags collapsible
  - AC: At any window size, effect list is always scrollable and visible

- [ ] **Fix preview persistence after New Project** (BUG-7)
  - File: `App.tsx` handleNewProject
  - Fix: clear `frameDataUrl` state + canvas content on Cmd+N
  - AC: Cmd+N → preview shows "No video loaded", no stale thumbnail

- [ ] **Fix track rename double-click** (BUG-11)
  - File: `timeline/Track.tsx` — investigate double-click handler
  - Fix: ensure input field reliably appears on double-click
  - AC: Double-click track name → inline text input appears

- [ ] **Fix export dialog positioning** (BUG-8)
  - File: `export/ExportDialog.tsx`
  - Fix: position dialog higher, or make it draggable/resizable
  - AC: Export dialog buttons always reachable regardless of dock position

---

## Sprint 4: Unwired Store Features (11 items, ~4 hours)

These store actions are implemented but have NO UI calling them.

- [ ] **Track opacity slider** — `timeline.setTrackOpacity(id, opacity)`
  - Add: opacity slider to Track header (0-100%)
  - Effect: track content renders at reduced opacity in preview

- [ ] **Track blend mode dropdown** — `timeline.setTrackBlendMode(id, mode)`
  - Add: blend mode dropdown to Track header (normal, add, multiply, screen, etc.)
  - Effect: multi-track compositing uses selected blend mode

- [ ] **Clip transform via store** — `timeline.setClipTransform(clipId, transform)`
  - Wire: Transform panel X/Y/Scale/Rot fields → call this action
  - Currently: fields accept input but don't affect render

- [ ] **Operator reordering** — `operators.reorderOperators(fromIndex, toIndex)`
  - Add: drag handles to OperatorRack component
  - Effect: operators process in new order

- [ ] **Trigger automation lanes** — `automation.addTriggerLane(...)`
  - Add: UI to create trigger-type automation lanes
  - Complex feature — may need its own sprint

- [ ] **Automation copy/paste** — `automation.copyRegion(...)` + `pasteAtPlayhead(...)`
  - Add: keyboard shortcuts or context menu for copy/paste automation regions
  - AC: Select region → Cmd+C → move playhead → Cmd+V

- [ ] **Device groups** — `project.groupEffects(...)` + `ungroupEffects(...)`
  - Add: UI to group multiple effects into a collapsed unit
  - AC: Select 3 effects → right-click → "Group" → collapsed device group card

- [ ] **AB deactivation** — `project.deactivateAB(effectId)`
  - Add: way to exit AB mode (currently can toggle but not fully deactivate)

---

## Sprint 5: Missing Component UI (high-value items)

These components exist as TSX files but need integration or testing:

- [ ] **LoopRegion visual** — `timeline/LoopRegion.tsx` exists
  - Wire: I/O key handlers already set loop points
  - Fix: make the highlighted region visible on the ruler
  - AC: Press I at 1s, O at 3s → green/blue highlighted region appears between them

- [ ] **HistoryPanel** — `layout/HistoryPanel.tsx` exists
  - Wire: needs to be toggled from a menu or shortcut
  - AC: Open history panel → see list of past actions → click entry to revert

- [ ] **PopOutPreview** — `preview/PopOutPreview.tsx` exists
  - Wire: pop-out icon in preview top-right should open this
  - AC: Click icon → preview opens in floating window

- [ ] **TextPanel editing** — `text/TextPanel.tsx` exists
  - Wire: selecting a text track/clip should show this panel
  - AC: Select text clip → panel shows with text content, font, size, color controls

- [ ] **PresetSaveDialog** — `library/PresetSaveDialog.tsx` exists
  - Wire: needs a "Save Preset" button in the effect browser or device chain
  - AC: Save current chain as named preset → appears in Presets tab

---

## Sprint 6: Security Hardening (3 items)

- [ ] **Validate effect params per-field** (code-level finding)
  - File: `backend/src/zmq_server.py` lines 193-206
  - Fix: apply `clamp_finite()` to all numeric effect params before passing to `apply_chain()`
  - AC: Sending NaN/Infinity in param values → clamped to valid range, no NumPy crash

- [ ] **Cap undo future stack** (code-level finding)
  - File: `stores/undo.ts`
  - Fix: add MAX_REDO_ENTRIES = 500 (matches MAX_UNDO_ENTRIES)
  - AC: Undo 500 times → future stack capped, oldest redo entries dropped

- [ ] **Cascade-delete automation on effect removal** (code-level finding)
  - File: `stores/automation.ts` + `stores/project.ts`
  - Fix: when effect is removed, find and remove all automation lanes targeting that effect
  - AC: Delete effect with automation → automation lanes removed, no orphans

---

## Sprint 7: Remaining BDD [TODO] Items

Components with `[TODO]` status that need first-time implementation or testing:

| Component | Priority | Notes |
|-----------|----------|-------|
| Operator editors (9 components) | High | Core modulation feature — LFO, Envelope, StepSeq, Fusion, AudioFollower, VideoAnalyzer, ModMatrix |
| Automation lanes/nodes/draw | High | Store complete, UI needs integration testing |
| Performance MIDI (3 components) | Medium | MIDISettings, MIDILearn, PadEditor |
| Export progress + render queue | Medium | ExportProgress.tsx, RenderQueue.tsx |
| Crash recovery dialog | Medium | CrashRecoveryDialog.tsx |
| Freeze overlay | Low | FreezeOverlay.tsx |
| Macro knob | Low | MacroKnob.tsx |
| Help panel | Low | HelpPanel.tsx |

---

## Summary

| Sprint | Items | Est. Hours | Impact |
|--------|-------|------------|--------|
| 1: Broken Wiring | 5 | 2 | High — fixes 5 bugs, unblocks keyboard workflow |
| 2: Knob Polish | 3 | 3 | Medium — standard NLE interactions |
| 3: Layout/UX | 4 | 2 | Medium — visible UX bugs |
| 4: Unwired Stores | 8 | 4 | High — enables opacity, blend, transform, groups |
| 5: Missing UI | 5 | 4 | High — loop region, history, pop-out, text, presets |
| 6: Security | 3 | 2 | High — prevents crashes from malformed data |
| 7: TODO Items | 20+ | 10+ | Mixed — operators are the big one |

**Total: ~48 items, ~27+ hours estimated**
