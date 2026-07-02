# Phase 4: Timeline + Tracks — Test Plan & UAT Document

**Version:** 1.0
**Date:** 2026-02-28
**Phase:** 4 — Timeline + Tracks
**Status:** Active

---

## Scope

Phase 4 introduces:
- Timeline Zustand store (`frontend/src/renderer/stores/timeline.ts`)
- Undo Zustand store (`frontend/src/renderer/stores/undo.ts`)
- Timeline UI components (`frontend/src/renderer/components/timeline/`)
  - `Timeline.tsx`, `Track.tsx`, `Clip.tsx`, `Playhead.tsx`, `TimeRuler.tsx`, `ZoomScroll.tsx`
- Backend compositor (`backend/src/engine/compositor.py`) with 9 blend modes
- Multi-track render pipeline
- Project save/load (`.glitch` files)
- Loop region and markers
- History panel (undo/redo UI)
- Keyboard shortcuts (Cmd+Z, Shift+Cmd+Z, Cmd+=/-/0)

---

## 1. Automated Test Coverage Matrix

### 1.1 Frontend Test Files

| Test File | What It Covers | Gap Analysis |
|-----------|---------------|--------------|
| `src/__tests__/stores/timeline.test.ts` (31 tests) | **Tracks:** addTrack, removeTrack, removeTrack clears selection, reorderTrack (valid + invalid), toggleMute, toggleSolo, renameTrack, setTrackOpacity (clamping), setTrackBlendMode. **Clips:** addClip (correct track + sets trackId), removeClip, moveClip (cross-track), splitClip (mid-clip + edge no-ops), trimClipIn, trimClipOut. **Queries:** getActiveClipsAtTime (single track, multi-track, gap). **Duration:** auto-calc from clips, recalc on remove. **View:** setZoom clamping (10-200), setScrollX clamping (>=0). | **MISSING:** setClipSpeed, addMarker/removeMarker/moveMarker, setLoopRegion/clearLoopRegion, setPlayheadTime negative value, setDuration, selectTrack, selectClip (deselect null), getTimelineDuration, reset clears all state fields, addClip to nonexistent track, moveClip to nonexistent track, removeClip nonexistent ID, splitClip nonexistent ID, reorderTrack same index |
| `src/__tests__/stores/undo.test.ts` (12 tests) | **Execute:** calls forward, pushes to past, clears future, sets isDirty. **Undo:** calls inverse, moves to future, empty past no-op. **Redo:** calls forward, moves back to past, empty future no-op. **Cap:** 500 entry limit drops oldest. **Linear branching:** execute-after-undo clears future. **isDirty:** set on execute, cleared on clear(), cleared on clearDirty(). **Integration:** multi-step undo/redo restores state. | **MISSING:** Redo also respects 500 cap (tested only in execute), undo sets isDirty to true, redo sets isDirty to true, clear resets all three fields simultaneously, execute with throwing forward function, undo with throwing inverse function, concurrent execute calls (Zustand serialization) |
| `src/__tests__/components/timeline/timeline.test.ts` (10 tests) | Track rendering data (count, name, mute/solo state). Clip positioning (position*zoom, duration*zoom). Playhead sync (time*zoom, time=0). Zoom control (set + clamp). Selection (track + clip). Asset name resolution (project store cross-ref). | **MISSING:** No DOM rendering tests (all store-level). No TimeRuler tests. No ZoomScroll component tests. No drag-and-drop tests. No keyboard event tests. No Track component rendering (TSX). No Clip component rendering. No Playhead rendering. |
| `src/__tests__/components/timeline/clip-operations.test.ts` (10 tests) | splitClip (duration sum, position/timing, preserves assetId, start/end no-ops). moveClip (same track, cross-track). trimClipIn (adjusts inPoint + position, past-outPoint no-op). trimClipOut (adjusts outPoint + duration, before-inPoint no-op). Drag from asset (addClip with assetId). | **MISSING:** splitClip with non-1.0 speed factor, trimClipIn with negative inPoint, trimClipOut beyond source media duration, moveClip to negative position, moveClip nonexistent clip, drag-drop visual feedback tests |

### 1.2 Backend Test File

| Test File | What It Covers | Gap Analysis |
|-----------|---------------|--------------|
| `backend/tests/test_engine/test_compositor.py` (14 tests) | **Single layer:** passthrough, 50% opacity. **Normal blend:** 100% + 50% opacity. **Add blend:** clipping to 255, known values. **Multiply blend:** known values. **Screen blend:** known values. **Overlay blend:** dark base. **Difference blend:** known values. **Exclusion blend:** known values. **Darken/Lighten:** min/max selection. **Edge cases:** empty layers returns black, output dtype uint8, many layers (5). | **MISSING:** Overlay bright base (>=128), blend mode with 0% opacity, blend mode with fractional opacity on all modes, unknown blend_mode string (fallback to normal), layer with alpha channel != 255, resolution mismatch (layer != output resolution), effect chain integration in compositor, single-pixel frames (1x1), large resolution frames (4K), layer with NaN/Inf values, project_seed parameter propagation |

### 1.3 Coverage Summary

| Area | Tests Written | Estimated Coverage | Priority Gaps |
|------|--------------|-------------------|---------------|
| Timeline Store | 31 | ~75% of API surface | Markers, Loop, setClipSpeed, error paths |
| Undo Store | 12 | ~85% of API surface | Error handling, redo cap enforcement |
| Timeline UI (store-level) | 10 | ~40% of component behavior | DOM rendering, keyboard, drag-drop |
| Clip Operations | 10 | ~70% of clip logic | Speed factor in split, negative positions |
| Backend Compositor | 14 | ~70% of blend logic | Overlay bright, alpha channel, resolution mismatch |
| **TOTAL** | **77** | | |

### 1.4 Tests That Should Be Added (Priority Order)

**P0 — Must add before shipping:**

1. **Timeline Store: Markers** — `addMarker`, `removeMarker`, `moveMarker`, `moveMarker` to negative time
2. **Timeline Store: Loop Region** — `setLoopRegion`, `clearLoopRegion`, loop with `in > out`
3. **Timeline Store: setClipSpeed** — speed 1.0, 2.0, 0.5, 0.1 (minimum), 0 (clamps to 0.1), negative
4. **Compositor: Overlay bright base** — base >= 128 uses screen formula
5. **Compositor: Unknown blend mode fallback** — verifies fallback to `_blend_normal`
6. **Compositor: Layer with effect chain** — ensure `apply_chain` is called
7. **Project Save/Load** — serialize timeline state to `.glitch`, deserialize back, roundtrip equality

**P1 — Should add:**

8. **Undo + Timeline Integration** — execute(addTrack), undo restores, redo re-adds
9. **Keyboard Shortcuts** — Cmd+Z fires undo, Shift+Cmd+Z fires redo, Cmd+=/-/0 fires zoom
10. **Timeline UI DOM** — Track component renders clip elements, Playhead at correct left offset
11. **Compositor: Resolution mismatch** — layer frame size != output resolution (resize or error)
12. **Timeline Store: Error paths** — addClip to nonexistent track, removeClip nonexistent ID

**P2 — Nice to have:**

13. **Compositor: Performance** — 10+ layers composite in < 100ms for 1080p
14. **Timeline Store: Stress** — 100 tracks, 1000 clips, getActiveClipsAtTime performance
15. **Undo Store: Memory** — 500 entries with closure references, verify GC eligibility

---

## 2. Manual UAT Scenarios

### 2.1 Timeline UI Interaction

#### UAT-4.01: Add and Remove Tracks

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Open app with empty project | Timeline area visible, no tracks |
| 2 | Click "Add Track" button | New track appears with default name ("Track 1"), default color, visible header |
| 3 | Click "Add Track" 2 more times | 3 tracks visible, numbered sequentially |
| 4 | Right-click track header > Delete | Track removed, remaining tracks re-render correctly |
| 5 | Verify clips on deleted track are gone | No orphaned clips in state |
| 6 | Verify selection cleared if deleted track was selected | `selectedTrackId` and `selectedClipId` are null |

#### UAT-4.02: Drag Clip onto Timeline

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Import a video asset | Asset appears in asset panel |
| 2 | Drag asset from panel onto Track 1 | Clip appears at drop position, correct width (duration * zoom), assetId set |
| 3 | Verify clip shows filename label | Clip element displays asset filename |
| 4 | Drag same asset to Track 2 at different position | Second clip appears, independent of first |

#### UAT-4.03: Move Clip

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Click and drag existing clip left/right | Clip repositions, position updates in state |
| 2 | Drag clip from Track 1 to Track 2 | Clip moves to new track, removed from old track, trackId updated |
| 3 | Drag clip to position 0 | Clip snaps to position 0 (no negative position) |
| 4 | Release clip | Final position persisted |

#### UAT-4.04: Split Clip

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Select a clip on the timeline | Clip highlighted |
| 2 | Position playhead at middle of clip | Playhead visible inside clip bounds |
| 3 | Press split shortcut or use menu | Clip splits into two at playhead position |
| 4 | Verify left clip: position unchanged, duration = playhead - original position | Correct in/out points |
| 5 | Verify right clip: position = playhead, duration = original end - playhead | Correct in/out points |
| 6 | Verify both clips share same assetId | Same source media |
| 7 | Verify durations sum to original | No frames lost |

#### UAT-4.05: Trim Clip

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Hover over left edge of clip | Trim cursor appears |
| 2 | Drag left edge to the right by 2 seconds | Clip inPoint advances, position shifts right, duration decreases |
| 3 | Hover over right edge of clip | Trim cursor appears |
| 4 | Drag right edge to the left by 3 seconds | Clip outPoint decreases, duration decreases, position unchanged |
| 5 | Try to trim left edge past right edge | No-op, clip unchanged |
| 6 | Try to trim right edge past left edge | No-op, clip unchanged |

#### UAT-4.06: Track Header Controls

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Click Mute button on Track 1 | Track grays out, `isMuted = true` |
| 2 | Click Mute again | Track restores, `isMuted = false` |
| 3 | Click Solo button on Track 1 | Only Track 1 contributes to preview |
| 4 | Double-click track name | Name becomes editable input field |
| 5 | Type new name + Enter | Track renamed |
| 6 | Drag opacity slider to 50% | Track opacity = 0.5 |
| 7 | Change blend mode dropdown to "multiply" | Track blendMode updated in state |

#### UAT-4.07: Track Reordering

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Have 3 tracks (A, B, C) | Order: A, B, C |
| 2 | Drag Track A header below Track C | Order: B, C, A |
| 3 | Verify compositing order changes | Preview reflects new layer order |

### 2.2 Multi-Track Compositing

#### UAT-4.08: Blend Modes in Preview

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Add 2 tracks, each with a clip at same time position | Both clips overlap in time |
| 2 | Set top track blend mode to "normal", opacity 100% | Preview shows only top clip |
| 3 | Set top track opacity to 50% | Preview shows 50/50 blend of both clips |
| 4 | Change blend mode to "add" | Preview shows additive blend (brighter) |
| 5 | Change blend mode to "multiply" | Preview shows multiply (darker in highlights) |
| 6 | Change blend mode to "screen" | Preview shows screen (lighter in shadows) |
| 7 | Change blend mode to "difference" | Preview shows difference (color inversion where overlapping) |
| 8 | Test all 9 modes: normal, add, multiply, screen, overlay, difference, exclusion, darken, lighten | Each produces visually distinct result |
| 9 | Mute top track | Preview shows bottom track only |
| 10 | Solo bottom track | Same result as muting all others |

#### UAT-4.09: 3+ Track Compositing

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Add 3 tracks with overlapping clips | All visible in timeline |
| 2 | Set each track to different blend mode | Preview composites bottom-to-top correctly |
| 3 | Mute middle track | Only tracks 1 and 3 contribute |
| 4 | Set all tracks to 0% opacity | Preview shows black |

### 2.3 Undo/Redo

#### UAT-4.10: Every Action Is Reversible

For EACH of the following actions, verify Cmd+Z undoes it and Shift+Cmd+Z redoes it:

| Action | Undo Restores | Redo Re-applies |
|--------|--------------|-----------------|
| Add track | Track removed | Track re-added |
| Remove track | Track and clips restored | Track removed again |
| Rename track | Previous name restored | New name applied |
| Change blend mode | Previous mode restored | New mode applied |
| Change opacity | Previous opacity restored | New opacity applied |
| Toggle mute | Previous mute state | New mute state |
| Toggle solo | Previous solo state | New solo state |
| Add clip | Clip removed | Clip re-added |
| Remove clip | Clip restored | Clip removed again |
| Move clip | Clip at old position/track | Clip at new position/track |
| Split clip | Two clips merged back to one | Re-split |
| Trim clip in | Original in/out restored | Trimmed again |
| Trim clip out | Original in/out restored | Trimmed again |
| Reorder tracks | Original order restored | New order applied |
| Add marker | Marker removed | Marker re-added |
| Remove marker | Marker restored | Marker removed again |
| Set loop region | Previous loop region (or null) | Loop region re-set |
| Change clip speed | Previous speed restored | New speed applied |

#### UAT-4.11: Undo Stack Behavior

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Perform 5 actions (A, B, C, D, E) | Past stack has 5 entries |
| 2 | Cmd+Z x3 | Undoes E, D, C. Past=[A,B], Future=[C,D,E] |
| 3 | Perform new action F | Past=[A,B,F], Future=[] (linear branching) |
| 4 | Shift+Cmd+Z | No-op (future is empty) |
| 5 | Cmd+Z x3 | Undoes F, B, A. Past=[], Future=[A,B,F] |
| 6 | Cmd+Z again | No-op (past is empty) |
| 7 | Shift+Cmd+Z x3 | Redoes A, B, F |

#### UAT-4.12: 500 Entry Cap

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Perform 505 undoable actions | Past stack length = 500 |
| 2 | Verify oldest 5 entries dropped | Cannot undo past action 6 (action 5 is oldest) |
| 3 | Cmd+Z x500 | All 500 undo without crash |

#### UAT-4.13: History Panel

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Open history panel | Panel visible with list of past actions |
| 2 | Each entry shows description and timestamp | Text like "Add Track 'Track 1'" with time |
| 3 | Perform actions | Entries appear at bottom of list |
| 4 | Cmd+Z | Most recent entry moves to "future" section or grays out |
| 5 | Click on a past entry | Jumps to that state (multi-step undo) |

### 2.4 Project Save/Load

#### UAT-4.14: Save Project (.glitch)

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Create project with 3 tracks, clips, effects, markers | Complex state |
| 2 | Cmd+S (or File > Save) | Save dialog appears |
| 3 | Choose location + filename.glitch | File written |
| 4 | Verify file is valid JSON (or chosen format) | Parseable, contains all data |
| 5 | Verify `isDirty` cleared after save | Title bar no longer shows unsaved indicator |

#### UAT-4.15: Load Project (.glitch)

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | File > Open, select saved .glitch file | Load dialog opens |
| 2 | File loads | Timeline reconstructed: tracks, clips, markers, loop region, zoom |
| 3 | Verify all clips reference valid assets | No broken asset references |
| 4 | Verify undo history is cleared on load | Fresh undo stack, isDirty = false |
| 5 | Verify playhead resets to 0 | Playhead at start |

#### UAT-4.16: Save/Load Roundtrip

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Build complex project | Multiple tracks, blend modes, clips, markers, loop |
| 2 | Save as `test-roundtrip.glitch` | File written |
| 3 | File > New (clear state) | Empty project |
| 4 | Load `test-roundtrip.glitch` | State identical to pre-save |
| 5 | Verify: track count, names, colors, blend modes, opacities | All match |
| 6 | Verify: clip positions, durations, in/out points, speeds | All match |
| 7 | Verify: markers (time, label, color) | All match |
| 8 | Verify: loop region | Matches or null |
| 9 | Verify: project settings (resolution, framerate, seed) | All match |

### 2.5 Keyboard Shortcuts

#### UAT-4.17: Timeline Keyboard Shortcuts

| Shortcut | Action | Expected Result |
|----------|--------|----------------|
| Cmd+Z | Undo | Last action undone |
| Shift+Cmd+Z | Redo | Last undo re-applied |
| Cmd+= | Zoom in | Zoom increases (e.g., 50 -> 60 px/s), clamped at 200 |
| Cmd+- | Zoom out | Zoom decreases (e.g., 50 -> 40 px/s), clamped at 10 |
| Cmd+0 | Reset zoom | Zoom returns to default (50 px/s) |
| Space | Play/Pause | Playback toggles |
| Delete/Backspace | Delete selected clip | Selected clip removed (with undo entry) |
| Cmd+A | Select all clips | All clips selected (if multi-select implemented) |

#### UAT-4.18: Shortcuts Do Not Fire During Text Input

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Double-click track name to edit | Input field focused |
| 2 | Press Cmd+Z while typing | Undo happens in text field, NOT timeline undo |
| 3 | Press Delete while typing | Character deleted, NOT clip deleted |
| 4 | Press Escape | Text input exits, shortcuts re-enabled |

### 2.6 Loop Region and Markers

#### UAT-4.19: Loop Region

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Set loop region from t=5 to t=15 | Loop indicators visible in ruler |
| 2 | Play from t=3 | Playback reaches t=15, jumps back to t=5 |
| 3 | Clear loop region | Loop indicators removed, playback is linear |
| 4 | Set loop with in > out | Either swaps or rejects (define expected behavior) |

#### UAT-4.20: Markers

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Add marker at t=10 with label "Drop" | Marker flag visible on ruler at t=10 |
| 2 | Add marker at t=20 with different color | Second marker visible |
| 3 | Move marker from t=10 to t=12 | Marker repositions |
| 4 | Remove marker | Marker disappears |
| 5 | Navigate to marker (click or shortcut) | Playhead jumps to marker time |

---

## 3. Edge Cases & Chaos Testing

### 3.1 Input Errors

| Test ID | Scenario | Expected Behavior |
|---------|----------|-------------------|
| CHAOS-IN-01 | Add track with empty string name `""` | Track created with empty name OR default name assigned. No crash. |
| CHAOS-IN-02 | Add track with Unicode name `"Tr\u00e4ck \U0001f525\U0001f3b6\u2728"` | Name stored and displayed correctly. No encoding errors. |
| CHAOS-IN-03 | Add track with name of 10,000 characters | Name truncated or stored. UI does not break layout. |
| CHAOS-IN-04 | Add track with HTML/script injection `"<script>alert(1)</script>"` | Name stored as literal text, not executed. No XSS. |
| CHAOS-IN-05 | Rename track to `null` / `undefined` | No crash. Name stays as previous value or becomes empty string. |
| CHAOS-IN-06 | Set track color to invalid hex `"not-a-color"` | Store accepts string (no validation) or rejects. No render crash. |
| CHAOS-IN-07 | Set track opacity to `NaN` | Clamped to 0 or 1, or rejected. Not stored as NaN. |
| CHAOS-IN-08 | Set track opacity to `Infinity` | Clamped to 1. |
| CHAOS-IN-09 | Add 500 clips to a single track | All clips stored. Timeline renders (may be slow but no crash). |
| CHAOS-IN-10 | Set clip speed to 0 | Clamped to 0.1 (minimum). |
| CHAOS-IN-11 | Set clip speed to -1 | Clamped to 0.1 (minimum). |
| CHAOS-IN-12 | Set zoom to `NaN` | Clamped to 10 (minimum). |
| CHAOS-IN-13 | Set playheadTime to negative | Stored as-is (no clamping in current impl) or clamped to 0. Document behavior. |
| CHAOS-IN-14 | Marker with empty label | Marker created. Displays empty or no label. No crash. |
| CHAOS-IN-15 | Marker at negative time | Marker created at negative time or rejected. Document behavior. |

### 3.2 Timing Errors

| Test ID | Scenario | Expected Behavior |
|---------|----------|-------------------|
| CHAOS-TM-01 | Rapid Cmd+Z x50 in quick succession | All 50 undos process sequentially. No state corruption. Final state consistent. |
| CHAOS-TM-02 | Rapid Cmd+Z/Shift+Cmd+Z alternating 20 times | State toggles correctly. No lost entries. |
| CHAOS-TM-03 | Split clip during active playback | Split occurs at current playhead. Playback continues on left or right clip. |
| CHAOS-TM-04 | Move clip while playback is running | Clip repositions. Preview updates. No frame drop beyond tolerance. |
| CHAOS-TM-05 | Double-click Add Track button rapidly | Two tracks added (not one, not zero). No duplicate IDs. |
| CHAOS-TM-06 | Save project while render is in progress | Save captures current state snapshot. Render continues. |
| CHAOS-TM-07 | Load project while undo stack has entries | Undo stack cleared. New project state loaded cleanly. |
| CHAOS-TM-08 | Cmd+Z immediately after project load | No-op (stack is empty). No crash. |
| CHAOS-TM-09 | Drag clip and release outside timeline bounds | Clip returns to original position or snaps to nearest valid position. |
| CHAOS-TM-10 | Click playhead while zoom is animating | Playhead position calculated correctly for current zoom level. |

### 3.3 State Errors

| Test ID | Scenario | Expected Behavior |
|---------|----------|-------------------|
| CHAOS-ST-01 | Undo after loading a different project | Undo stack was cleared on load. No-op. |
| CHAOS-ST-02 | Save empty project (0 tracks, 0 clips) | Valid .glitch file written with empty timeline. Loadable. |
| CHAOS-ST-03 | Load project, modify, undo past the load point | Undo stack exhausted. State = post-load state (no pre-load state leaks). |
| CHAOS-ST-04 | Delete track that is referenced by selectedTrackId | selectedTrackId set to null. No dangling reference. |
| CHAOS-ST-05 | Delete clip that is referenced by selectedClipId | selectedClipId set to null. No dangling reference. |
| CHAOS-ST-06 | Move clip to track that was just deleted | moveClip finds no target track. No crash. Clip stays in original track or is returned. |
| CHAOS-ST-07 | Split clip that was already removed | splitClip finds no clip. No-op. No crash. |
| CHAOS-ST-08 | Load .glitch file with missing `timeline` key | Error message shown to user. App does not crash. Previous project preserved. |
| CHAOS-ST-09 | Load .glitch file with extra unknown keys | Unknown keys ignored. Valid data loaded. |
| CHAOS-ST-10 | Project with asset paths pointing to deleted files | Asset loads with error indicator. Timeline structure preserved. Preview shows placeholder. |
| CHAOS-ST-11 | Two browser tabs/windows open same project | Each instance is independent. No shared state corruption. |
| CHAOS-ST-12 | Mute all tracks + Solo none | Preview shows black frame (no contributing tracks). |
| CHAOS-ST-13 | Solo one track while all others muted | Solo'd track contributes. Mute state on other tracks irrelevant (solo overrides). |

### 3.4 Boundary Errors

| Test ID | Scenario | Expected Behavior |
|---------|----------|-------------------|
| CHAOS-BD-01 | Zoom to minimum (10 px/s) then Cmd+- again | Zoom stays at 10. No-op. |
| CHAOS-BD-02 | Zoom to maximum (200 px/s) then Cmd+= again | Zoom stays at 200. No-op. |
| CHAOS-BD-03 | Exactly 500 undo entries, then one more | Oldest entry dropped. Count stays at 500. |
| CHAOS-BD-04 | Clip at position 0 with duration 0 | Clip exists but has zero visual width. getActiveClipsAtTime(0) may or may not return it. Document behavior. |
| CHAOS-BD-05 | Clip at position 0 with duration 0.001 | Clip exists. Very narrow but valid. |
| CHAOS-BD-06 | Clip at position 999999 | Timeline duration auto-calculates to 999999 + duration. Scrolling works. |
| CHAOS-BD-07 | Clip with inPoint = outPoint | Zero-duration clip. Trim/split should be no-ops. |
| CHAOS-BD-08 | setLoopRegion(5, 5) — zero-length loop | Either rejected or treated as no loop. Document behavior. |
| CHAOS-BD-09 | setLoopRegion(10, 5) — inverted range | Either swapped to (5,10) or rejected. Document behavior. |
| CHAOS-BD-10 | scrollX set to 999999 | Accepted (no upper bound in current impl). Timeline scrolls far right. |
| CHAOS-BD-11 | 0 tracks, call getActiveClipsAtTime(5) | Returns empty array. No crash. |
| CHAOS-BD-12 | reorderTrack(0, 0) — same index | No-op. Track order unchanged. |
| CHAOS-BD-13 | addClip with position = Number.MAX_SAFE_INTEGER | Duration auto-calc handles large number. No overflow. |
| CHAOS-BD-14 | Compositor: 50 layers composited | Result is uint8, no memory error, completes in reasonable time. |
| CHAOS-BD-15 | Compositor: layer with all-zero frame (black transparent) | Composites correctly with other layers. |

### 3.5 Sequence Errors

| Test ID | Scenario | Expected Behavior |
|---------|----------|-------------------|
| CHAOS-SQ-01 | Split, then undo, then split at different point | Original clip restored, re-split at new point works. |
| CHAOS-SQ-02 | Add clip, split, move right half, undo x3 | All three actions reversed in correct order. |
| CHAOS-SQ-03 | Save, modify, save again (overwrite) | Second save overwrites first. File is valid. |
| CHAOS-SQ-04 | Load file A, then load file B without saving A | File B loaded. A's changes lost (should warn if dirty). |
| CHAOS-SQ-05 | Delete all tracks, then undo all | All tracks restored with clips intact. |
| CHAOS-SQ-06 | Set blend mode, then remove track, then undo | Track restored with blend mode intact. |
| CHAOS-SQ-07 | Add marker, save, load, verify marker persists | Marker present in loaded project. |
| CHAOS-SQ-08 | Change zoom, save, load | Zoom resets to default or persists (document which). |

---

## 4. Regression Checklist

Phase 4 must NOT break any existing functionality. Verify all of the following still work:

### 4.1 Phase 1 — Core Pipeline

- [ ] Video file import (ingest) still works
- [ ] Preview window displays video frames
- [ ] Frame seeking works correctly
- [ ] Asset metadata is extracted (resolution, fps, codec, duration)
- [ ] Project store: addAsset, removeAsset, addEffect, removeEffect
- [ ] Effect chain: reorder, toggle, setMix, updateParam
- [ ] MAX_CHAIN_LENGTH (10 effects) still enforced

### 4.2 Phase 2 — Effects

- [ ] All effects render correctly in preview
- [ ] Effect parameter changes update preview in real-time
- [ ] Effect chain order is respected (bottom-to-top)
- [ ] Effect enable/disable (bypass) works
- [ ] Param scaling (linear, log, exp, s-curve) unchanged

### 4.3 Phase 3 — Color Suite

- [ ] All color effects (auto-levels, color-balance, curves, histogram, HSL adjust, levels) still produce correct output
- [ ] Deterministic rendering (same seed = same output) preserved
- [ ] Security hardening still active (no path traversal, no injection)

### 4.4 IPC Layer

- [ ] Frontend-backend communication via ZMQ intact
- [ ] IPC schema contracts pass (`ipc-schema.test.ts`, `test_ipc_contracts.py`)
- [ ] Watchdog still monitors backend health
- [ ] Export pipeline still works

### 4.5 Tests That Must Still Pass

All tests in these files must pass after Phase 4 changes:

```
frontend/src/__tests__/utils.test.ts
frontend/src/__tests__/watchdog.test.ts
frontend/src/__tests__/stores/project.test.ts
frontend/src/__tests__/components/upload.test.ts
frontend/src/__tests__/components/effects.test.ts
frontend/src/__tests__/components/preview.test.ts
frontend/src/__tests__/components/common/knob.test.ts
frontend/src/__tests__/utils/paramScaling.test.ts
frontend/src/__tests__/components/effects/paramPanel.test.ts
frontend/src/__tests__/stores/audio.test.ts
frontend/src/__tests__/components/transport/volume.test.ts
frontend/src/__tests__/components/transport/waveform.test.ts
frontend/src/__tests__/ipc-serialize.test.ts
frontend/src/__tests__/contracts/ipc-schema.test.ts
frontend/src/__tests__/components/ux-contracts.test.tsx
```

Backend tests that must still pass:
```
backend/tests/test_engine/test_pipeline.py
backend/tests/test_engine/test_export.py
backend/tests/test_engine/test_cache.py
backend/tests/test_engine/test_determinism.py
backend/tests/test_effects/ (all)
backend/tests/test_ipc_schema.py
backend/tests/test_ipc_contracts.py
backend/tests/test_security.py
backend/tests/test_edge_cases.py
backend/tests/test_zmq_server.py
```

---

## 5. How to Run

### 5.1 Frontend Tests (Vitest)

```bash
# Run ALL frontend tests
cd ~/Development/entropic-v2challenger/frontend && npx vitest run

# Run only Phase 4 tests
cd ~/Development/entropic-v2challenger/frontend && npx vitest run src/__tests__/stores/timeline.test.ts
cd ~/Development/entropic-v2challenger/frontend && npx vitest run src/__tests__/stores/undo.test.ts
cd ~/Development/entropic-v2challenger/frontend && npx vitest run src/__tests__/components/timeline/

# Run with coverage report
cd ~/Development/entropic-v2challenger/frontend && npx vitest run --coverage

# Run in watch mode during development
cd ~/Development/entropic-v2challenger/frontend && npx vitest src/__tests__/stores/timeline.test.ts
```

### 5.2 Backend Tests (Pytest)

```bash
# Run compositor tests
cd ~/Development/entropic-v2challenger && python3 -m pytest backend/tests/test_engine/test_compositor.py -v

# Run ALL backend tests
cd ~/Development/entropic-v2challenger && python3 -m pytest backend/tests/ -v

# Run with coverage
cd ~/Development/entropic-v2challenger && python3 -m pytest backend/tests/ --cov=backend/src --cov-report=term-missing

# Run only Phase 4 related backend tests
cd ~/Development/entropic-v2challenger && python3 -m pytest backend/tests/test_engine/test_compositor.py backend/tests/test_project/test_schema.py -v
```

### 5.3 Full Regression Suite

```bash
# Frontend full suite
cd ~/Development/entropic-v2challenger/frontend && npx vitest run 2>&1

# Backend full suite
cd ~/Development/entropic-v2challenger && python3 -m pytest backend/tests/ -v --tb=short 2>&1

# Both in sequence
cd ~/Development/entropic-v2challenger/frontend && npx vitest run && cd ~/Development/entropic-v2challenger && python3 -m pytest backend/tests/ -v --tb=short
```

### 5.4 Manual UAT Execution

1. Start the app: `cd ~/Development/entropic-v2challenger/frontend && npm run dev`
2. In a separate terminal, start backend: `cd ~/Development/entropic-v2challenger/backend && python3 -m engine.server`
3. Walk through each UAT scenario in Section 2 above
4. Record PASS/FAIL for each step
5. File bugs for any FAIL with:
   - Scenario ID (e.g., UAT-4.03)
   - Step number
   - Expected vs actual behavior
   - Screenshot or screen recording

---

## Appendix A: Test Data Requirements

| Data | Specification |
|------|---------------|
| Sample video file | At least 10 seconds, 1080p, h264, with audio track |
| Sample image file | 1920x1080 PNG |
| Sample .glitch file (valid) | Contains 3 tracks, 5 clips, 2 markers, loop region, mixed blend modes |
| Sample .glitch file (corrupt) | Invalid JSON or missing required keys |
| Sample .glitch file (old version) | Version field set to "0.1.0" (migration test) |

## Appendix B: Acceptance Criteria Summary

Phase 4 is DONE when:

1. All 77 existing automated tests pass (0 failures, 0 skips)
2. All P0 gap tests from Section 1.4 are written and passing
3. All UAT scenarios in Section 2 pass manual verification
4. No regressions in Phase 1/2/3 functionality (Section 4 checklist all checked)
5. Chaos tests from Section 3 either pass or have documented expected behavior for each edge case
6. Save/load roundtrip preserves 100% of project state
7. Undo/redo works for every undoable action listed in UAT-4.10
8. All 9 blend modes produce visually correct results in the compositor
