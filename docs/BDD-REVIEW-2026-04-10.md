# BDD Acceptance Criteria Review — 2026-04-10

> **Target:** `docs/COMPONENT-ACCEPTANCE-CRITERIA.md` (1553 lines)
> **Method:** Plain-text quality review + 3 parallel code cross-reference agents + CTO architecture pass
> **Verdict:** REVISE — doc covers ~40% of actual component surface, has structural issues, and several specs describe nonexistent behavior

---

## Part 1: Plain-Text Quality Issues (reading the doc itself)

### Structural Problems

1. **Inconsistent Gherkin.** Some specs have proper Given/When/Then, others are prose bullets inside gherkin blocks. Z4-01 mixes "The preview should maintain..." prose with gherkin. Z5-08 has "When the user trims to zero" with no Given setup. Each spec should follow strict Given/When/Then with one scenario per block.

2. **No separation of CURRENT vs TARGET behavior.** The knob spec (Z6-05) lists 8 interaction modes but only 2 work. A tester can't tell which scenarios should pass today vs which are aspirational. Fix: add `[IMPLEMENTED]` / `[NOT IMPLEMENTED]` markers.

3. **Undo assertions are afterthoughts.** "Should be undoable (Cmd+Z)" appears as a footnote on 15+ specs. Each destructive action needs its own explicit undo scenario:
   ```
   Given the user removed effect "Invert"
   When the user presses Cmd+Z
   Then "Invert" reappears in the chain at its original position
   And all its parameters are restored to their pre-removal values
   ```

4. **AB Button spec is a guess.** Z6-03 describes generic A/B comparison. The actual code (`ABSwitch.tsx`) has `toggleAB` and `copyToInactiveAB` — the real behavior is: two stored param snapshots, click toggles between them. BDD should match the actual API.

5. **Speed/Duration dialog is a PRD, not acceptance criteria.** D-07 describes a Premiere-style dialog with Reverse checkbox and Ripple edit. No such component exists. This is a feature request, not testable criteria.

6. **Missing error/empty states.** Most specs only describe the happy path. Missing: what happens when you mute the only track? Solo with 0 content? Add effect with no video? Export with 0 frames?

---

## Part 2: Components in Code NOT in BDD (35 missing)

These React components exist in `frontend/src/renderer/components/` but have ZERO acceptance criteria:

### Operators (9 components — high priority)
| Component | File | Notes |
|-----------|------|-------|
| OperatorRack | `operators/OperatorRack.tsx` | Main container for all operator types |
| LFOEditor | `operators/LFOEditor.tsx` | Low-frequency oscillator UI |
| EnvelopeEditor | `operators/EnvelopeEditor.tsx` | ADSR envelope UI |
| StepSequencerEditor | `operators/StepSequencerEditor.tsx` | Step sequencer UI |
| FusionEditor | `operators/FusionEditor.tsx` | Multi-source blend UI |
| AudioFollowerEditor | `operators/AudioFollowerEditor.tsx` | Audio-reactive modulation |
| VideoAnalyzerEditor | `operators/VideoAnalyzerEditor.tsx` | Video-reactive modulation |
| ModulationMatrix | `operators/ModulationMatrix.tsx` | Routing grid |
| RoutingLines | `operators/RoutingLines.tsx` | Visual routing connections |

### Automation (5 components)
| Component | File | Notes |
|-----------|------|-------|
| AutomationLane | `automation/AutomationLane.tsx` | Lane with nodes — BDD covers toolbar but NOT lanes |
| AutomationNode | `automation/AutomationNode.tsx` | Draggable control points |
| AutomationDraw | `automation/AutomationDraw.tsx` | Pencil draw mode |
| CurveSegment | `automation/CurveSegment.tsx` | Curve segment rendering |
| LoopRegion | `timeline/LoopRegion.tsx` | **BDD says "no visual" but component EXISTS** |

### Performance / MIDI (6 components)
| Component | File | Notes |
|-----------|------|-------|
| PerformancePanel | `performance/PerformancePanel.tsx` | Full perform mode UI |
| PadGrid | `performance/PadGrid.tsx` | 4x4 pad grid |
| PadCell | `performance/PadCell.tsx` | Individual pad |
| PadEditor | `performance/PadEditor.tsx` | Pad configuration |
| MIDISettings | `performance/MIDISettings.tsx` | MIDI device config |
| MIDILearnOverlay | `performance/MIDILearnOverlay.tsx` | MIDI learn mode overlay |

### Text (2 components)
| Component | File | Notes |
|-----------|------|-------|
| TextPanel | `text/TextPanel.tsx` | Text editing controls |
| TextOverlay | `text/TextOverlay.tsx` | Text rendering on preview |

### Export (2 components)
| Component | File | Notes |
|-----------|------|-------|
| ExportProgress | `export/ExportProgress.tsx` | Progress bar during export |
| RenderQueue | `export/RenderQueue.tsx` | Multi-item export queue |

### Preview (2 components)
| Component | File | Notes |
|-----------|------|-------|
| PopOutPreview | `preview/PopOutPreview.tsx` | Separate window preview |
| PreviewControls | `preview/PreviewControls.tsx` | Play/zoom controls on preview |

### Library/Presets (3 components)
| Component | File | Notes |
|-----------|------|-------|
| PresetSaveDialog | `library/PresetSaveDialog.tsx` | Save preset workflow |
| PresetCard | `library/PresetCard.tsx` | Preset display card |
| MacroKnob | `library/MacroKnob.tsx` | Macro parameter knob |

### Layout/Dialogs (6 components)
| Component | File | Notes |
|-----------|------|-------|
| WelcomeScreen | `layout/WelcomeScreen.tsx` | Welcome + recent projects |
| HistoryPanel | `layout/HistoryPanel.tsx` | **BDD says "not implemented" but component EXISTS** |
| ShortcutEditor | `layout/ShortcutEditor.tsx` | Rebind shortcuts UI |
| UpdateBanner | `layout/UpdateBanner.tsx` | Update notification |
| CrashRecoveryDialog | `dialogs/CrashRecoveryDialog.tsx` | Crash recovery prompt |
| FeedbackDialog | `dialogs/FeedbackDialog.tsx` | Feedback form |
| TelemetryConsentDialog | `dialogs/TelemetryConsentDialog.tsx` | Telemetry opt-in |
| ErrorBoundary | `layout/ErrorBoundary.tsx` | Error catching UI |

### Effects (5 components)
| Component | File | Notes |
|-----------|------|-------|
| ParamSlider | `effects/ParamSlider.tsx` | Linear slider (not rotary knob) |
| ParamToggle | `effects/ParamToggle.tsx` | Boolean toggle param |
| ParamChoice | `effects/ParamChoice.tsx` | Dropdown choice param |
| HelpPanel | `effects/HelpPanel.tsx` | Effect help/description |
| FreezeOverlay | `effects/FreezeOverlay.tsx` | Freeze indicator |

### Upload (2 components)
| Component | File | Notes |
|-----------|------|-------|
| DropZone | `upload/DropZone.tsx` | Drag-and-drop import |
| IngestProgress | `upload/IngestProgress.tsx` | Import progress |

### Device Chain (1 component)
| Component | File | Notes |
|-----------|------|-------|
| ABSwitch | `device-chain/ABSwitch.tsx` | A/B comparison switch — BDD spec is wrong |

### Transport (2 components)
| Component | File | Notes |
|-----------|------|-------|
| VolumeControl | `transport/VolumeControl.tsx` | Audio volume slider |
| Waveform | `transport/Waveform.tsx` | Audio waveform display |

---

## Part 3: Store Features with No UI (11 actions)

| Store | Action | Description |
|-------|--------|-------------|
| timeline | `setTrackOpacity(id, opacity)` | Opacity field exists, no UI component calls it |
| timeline | `setTrackBlendMode(id, mode)` | Blend mode field exists, no UI component calls it |
| timeline | `setClipTransform(clipId, transform)` | Only used in tests |
| operators | `reorderOperators(fromIndex, toIndex)` | Drag-reorder logic complete, no UI |
| automation | `addTriggerLane(...)` | Full trigger framework, no UI |
| automation | `recordTriggerEvent(...)` | Overdub recording logic, no UI |
| automation | `mergeCapturedTriggers(...)` | Capture-merge system, no UI |
| automation | `copyRegion(...)` | Automation clipboard copy, no UI |
| automation | `pasteAtPlayhead(...)` | Automation clipboard paste, no UI |
| project | `groupEffects(effectIds, groupName)` | Device group creation, no UI |
| project | `ungroupEffects(groupId)` | Device group ungrouping, no UI |

---

## Part 4: Keyboard Shortcut Wiring (exact root cause)

**Source files:**
- Definitions: `frontend/src/renderer/utils/default-shortcuts.ts`
- Dispatch: `frontend/src/renderer/utils/shortcuts.ts` (line 181: `if (!handler) return false`)
- Handler registration: `frontend/src/renderer/App.tsx` (lines 243-335)

| Shortcut | Action | Defined? | Handler Registered? | Status |
|----------|--------|----------|--------------------|----|
| J | transport_reverse | YES (line 12) | NO | BUG-12 |
| K | transport_stop | YES (line 11) | NO | BUG-12 |
| L | transport_forward | YES (line 10) | NO | BUG-12 |
| Cmd+D | duplicate_effect | YES (line 17) | NO | BUG-14 |
| Delete | delete_clip | **NOT DEFINED** | NO | BUG-15 |

Fix: Add 4 `register()` calls in App.tsx lines 243-335 for the defined actions, and add `delete_clip` to default-shortcuts.ts.

---

## Part 5: BDD Specs That Describe Nonexistent Behavior

| BDD Spec | What it claims | Code reality |
|----------|---------------|--------------|
| D-07 Speed/Duration | Dialog with Speed%, Duration, Reverse, Ripple | No dialog component exists |
| Z6-05 Shift+drag | Fine adjustment (1/10th speed) | `Knob.tsx` has no modifier key detection |
| Z6-05 Cmd+drag | Coarse adjustment (10x speed) | `Knob.tsx` has no modifier key detection |
| Z6-05 Scroll wheel | Change value via scroll | `Knob.tsx` has no onWheel handler |
| Z6-05 Arrow keys | Step value via keyboard | `Knob.tsx` has no onKeyDown handler |
| Z6-05 Double-click | Open NumberInput | `NumberInput.tsx` exists but not wired to knob |
| Z5-02 Playhead drag | Drag scrubbing | Implementation uses click-to-seek only |
| Z2-07 JKL multi-press | Speed multiplier | No handler exists at all |

---

## Part 6: TypeScript Compilation Errors (branch health)

Current branch has 11 TS errors in App.tsx:
- `toggleQuantize` not on LayoutState
- `isEnabled` not on Clip type
- `transform` not on Clip type
- `sendFrameToPopOut` not on IPC API
- `beginTransaction` not on UndoState
- 3 missing module imports (DeviceChain, TransformPanel, HelpPanel)

These indicate code was written ahead of type definitions — needs type updates or interface extensions.

---

## Verdict: REVISE

### Critical (must fix before using as test rubric):
1. Add `[IMPLEMENTED]` / `[NOT IMPLEMENTED]` markers to every scenario
2. Add BDD specs for the 35 missing components (especially LoopRegion and HistoryPanel which exist but doc says they don't)
3. Fix AB Button spec to match actual `ABSwitch.tsx` implementation
4. Remove or clearly mark D-07 Speed/Duration as "FUTURE — no component exists"

### Important (should fix):
5. Add explicit undo scenarios (Given/When/Then) for every destructive action
6. Add error/empty state scenarios for each component
7. Add the 11 unwired store features as tracked items
8. Note exact shortcut wiring gaps with file paths and line numbers
9. Add BDD for VolumeControl and Waveform (transport components)

### Nice to have:
10. Normalize all specs to strict Given/When/Then (no prose in gherkin blocks)
11. Add BDD for all 3 missing dialogs (CrashRecovery, Feedback, TelemetryConsent)
12. Add BDD for the 5 missing effect param types (ParamSlider, ParamToggle, ParamChoice, etc.)
