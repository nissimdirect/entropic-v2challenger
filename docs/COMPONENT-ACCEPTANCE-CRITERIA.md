# Entropic v2 — Component Acceptance Criteria (v2)

> **Format:** BDD tickets for every UI component. Each has: description, acceptance criteria (Given/When/Then), undo scenario, error states, red-team attack scenarios.
> **Standard:** What a professional video effects DAW SHOULD do. Each scenario marked `[IMPL]` (implemented) or `[TODO]` (not yet implemented).
> **Source:** Screenshot-verified inventory + code cross-reference (81 TSX files, 17 Zustand stores).
> **Review:** v1 covered ~40% of components. v2 adds 35 missing components, fixes incorrect claims, adds attack scenarios.
> **Component count:** 81 TSX files across 15 directories. This doc covers all of them.

---

## Status Legend

- `[IMPL]` — Code exists and behavior is implemented
- `[TODO]` — Code does not exist or behavior is not wired
- `[PARTIAL]` — Component exists but some scenarios don't work
- `[BUG-N]` — Known bug, see UAT-BUGS-2026-04-09.md

---

## Z1: Title Bar

### Z1-01: Window Title `[IMPL]`

```gherkin
Scenario: New project title
  Given a new untitled project
  Then the title bar shows "Untitled — Entropic"

Scenario: Saved project title
  Given a saved project named "my-project.glitch"
  Then the title bar shows "my-project — Entropic"

Scenario: Dirty state indicator
  Given any unsaved changes exist
  Then the title bar shows "my-project * — Entropic"

Scenario: Save clears dirty
  Given unsaved changes exist
  When the user presses Cmd+S
  Then the asterisk disappears

Scenario: Dev mode menu name
  Given the app runs via npm start
  Then the macOS menu bar first item says "Electron"
  But dropdown items say "About Entropic", "Hide Entropic", "Quit Entropic"
```

**Red-team:**
- Title with special chars in filename (emoji, unicode, path separators) — should not crash or execute
- Extremely long filename — should truncate, not overflow layout

### Z1-02: Traffic Lights `[IMPL]`

```gherkin
Scenario: Close with unsaved changes
  Given unsaved changes exist
  When the user clicks red close button
  Then a "Save changes?" prompt appears with Save/Discard/Cancel

Scenario: Close without changes
  Given no unsaved changes
  When the user clicks red close button
  Then the window closes immediately

Scenario: Minimize
  When the user clicks yellow minimize button
  Then the window minimizes to dock

Scenario: Full screen
  When the user clicks green maximize button
  Then the window enters full screen
  And all panels adapt to the new size
```

---

## Z2: Transport Bar

### Z2-01: Play Button `[IMPL]`

```gherkin
Scenario: Start playback
  Given a video is loaded and playhead is at 0:02.0
  When the user clicks Play
  Then playback starts from 0:02.0
  And the timecode advances in real-time
  And the preview updates with each frame (effects applied)
  And the playhead moves along the ruler

Scenario: Pause playback
  Given playback is active
  When the user clicks Play again
  Then playback pauses
  And the current frame stays visible
  And timecode stops advancing

Scenario: Play with no video
  Given no video is loaded
  When the user clicks Play
  Then nothing happens (no crash)
```

**Red-team:**
- Rapid double-click Play — should not desync audio/video
- Click Play during heavy render (10 effects at 100ms) — should queue or skip frames, not crash
- Play at last frame — should stop cleanly, no "frame render failed"

### Z2-02: Stop Button `[IMPL]`

```gherkin
Scenario: Stop during playback
  Given playback is active at 0:03.5
  When the user clicks Stop
  Then playback stops
  And playhead returns to 0:00.0
  And preview shows the first frame

Scenario: Stop when already stopped
  Given playback is paused at 0:02.0
  When the user clicks Stop
  Then playhead returns to 0:00.0
```

### Z2-03: Timecode Display `[IMPL]`

```gherkin
Scenario: Shows position and duration
  Given a 5s video at 30fps
  Then timecode shows "0:00.0 / 0:05.0"

Scenario: Updates during playback
  Given playback is running
  Then timecode current position updates every frame

Scenario: No video
  Given no video loaded
  Then timecode shows "0:00.0 / 0:00.0"
```

### Z2-04: BPM Field `[IMPL]`

```gherkin
Scenario: Edit BPM
  When the user triple-clicks the BPM field
  And types "140" and presses Enter
  Then BPM updates to 140
  And quantize grid recalculates

Scenario: Reject invalid BPM
  When the user types "abc" and presses Enter
  Then the value reverts to previous BPM

Scenario: Cancel edit
  When the user presses Escape while editing BPM
  Then the edit cancels and previous value restores

Scenario: Undo BPM change
  Given the user changed BPM from 120 to 140
  When the user presses Cmd+Z
  Then BPM reverts to 120
```

**Red-team:**
- Type "0" — should clamp to minimum (e.g. 20)
- Type "99999" — should clamp to maximum (e.g. 999)
- Paste from clipboard with script injection — should sanitize input

### Z2-05: Quantize Button (Q) `[IMPL]`

```gherkin
Scenario: Toggle on
  Given quantize is off
  When the user clicks Q (or Cmd+U)
  Then Q highlights yellow/green
  And clip snapping aligns to grid

Scenario: Toggle off
  Given quantize is on
  When the user clicks Q again
  Then Q unhighlights
  And snapping is free
```

### Z2-06: Quantize Grid Dropdown `[IMPL]`

```gherkin
Scenario: Change grid
  When the user clicks the dropdown (showing "1/4")
  Then options appear: 1/4, 1/8, 1/16, 1/32
  When the user selects "1/8"
  Then dropdown shows "1/8"
  And grid recalculates at current BPM
```

### Z2-07: JKL Transport `[IMPL]` ~~`[BUG-12]`~~

**UPDATE 2026-04-11:** Implemented in Sprint 1-3. Handlers now wired. 267 new tests confirm all wiring.
~~**Wiring gap:** Defined in `default-shortcuts.ts` lines 10-12 but NO handler registered in `App.tsx` lines 243-335.~~

```gherkin
Scenario: Forward playback [TODO]
  When the user presses L
  Then forward playback starts at 1x
  When pressed again: 2x, again: 4x

Scenario: Reverse playback [TODO]
  When the user presses J
  Then reverse playback starts at 1x
  When pressed again: 2x, again: 4x

Scenario: Stop (pause in place) [TODO]
  When the user presses K
  Then playback pauses at current position (NOT return to 0)

Scenario: Jog forward [TODO]
  When the user holds K and taps L
  Then one frame advances

Scenario: Jog backward [TODO]
  When the user holds K and taps J
  Then one frame steps back
```

### Z2-08: Volume Control `[IMPL]`

**Component:** `transport/VolumeControl.tsx`

```gherkin
Scenario: Adjust volume
  Given the volume slider shows 100% with speaker icon
  When the user drags the slider left
  Then volume decreases
  And audio playback gets quieter

Scenario: Mute
  When the user clicks the speaker icon
  Then audio mutes (icon changes to muted)
  When clicked again, unmutes

Scenario: Silent video
  Given a video with no audio track
  Then the volume control is still visible but has no effect
```

### Z2-09: Waveform Display `[IMPL]`

**Component:** `transport/Waveform.tsx`

```gherkin
Scenario: Show audio waveform
  Given a video with audio is loaded
  Then a waveform visualization appears in the transport area

Scenario: No audio
  Given a video with no audio
  Then the waveform area is empty or hidden
```

---

## Z3: Left Sidebar

### Z3-01: Asset Info `[IMPL]`

```gherkin
Scenario: Show metadata
  Given "test-video.mp4" (1280x720, 30fps) is imported
  Then sidebar shows "test-video.mp4" and "1280x720 | 30fps"

Scenario: No video
  Given no video loaded
  Then asset info area is empty
```

### Z3-02: Transform Panel `[PARTIAL]`

**Component:** `timeline/TransformPanel.tsx`

```gherkin
Scenario: Show on clip select [IMPL]
  Given a clip is selected
  Then TRANSFORM panel shows: X(0), Y(0), Scale(1), Rot(0), Fit, Reset

Scenario: Hide on deselect [IMPL]
  Given no clip selected
  Then TRANSFORM panel is hidden

Scenario: Edit X position [TODO — no visual effect confirmed]
  When user types "100" in X and presses Enter
  Then clip moves 100px right in preview

Scenario: Edit Scale [TODO — no visual effect confirmed]
  When user types "0.5" in Scale
  Then clip renders at 50% size

Scenario: Edit Rotation [TODO — not tested]
  When user types "45" in Rot
  Then clip rotates 45 degrees

Scenario: Fit button [IMPL]
  When user clicks Fit
  Then Scale adjusts to fill preview, X/Y center

Scenario: Reset button [IMPL]
  When user clicks Reset
  Then X=0, Y=0, Scale=1, Rot=0

Scenario: Undo transform
  Given user changed Scale to 0.5
  When user presses Cmd+Z
  Then Scale reverts to 1
```

**Red-team:**
- Type "-99999" in X — should clamp or handle gracefully
- Type "NaN" or "Infinity" in Scale — should reject
- Type "0" in Scale — should prevent (zero-size clip)

### Z3-03: Effects Tab `[IMPL]`

```gherkin
Scenario: Switch to effects
  When user clicks EFFECTS tab
  Then effects browser shows: search field, + Add Text Track, category tags, effect list
  And EFFECTS tab has active indicator
```

### Z3-04: Presets Tab `[IMPL]`

**Component:** `library/PresetBrowser.tsx`

```gherkin
Scenario: Switch to presets
  When user clicks PRESETS tab
  Then presets browser shows: search, 8 category tags, preset list or empty state

Scenario: Empty state
  Given no presets saved
  Then "No presets saved yet" message shows
```

### Z3-05: Preset Save Dialog `[IMPL]`

**Component:** `library/PresetSaveDialog.tsx`

```gherkin
Scenario: Save current chain as preset [TODO — not tested]
  Given effects are in the chain
  When user triggers "Save Preset" (method TBD)
  Then a dialog appears with name field, category selector, and Save/Cancel

Scenario: Preset card display [TODO — not tested]
  Given presets exist
  Then each preset shows as a card (PresetCard.tsx) with name and category
```

### Z3-06: Macro Knob `[TODO]`

**Component:** `library/MacroKnob.tsx`

```gherkin
Scenario: Macro parameter control [TODO]
  Given a macro knob is configured
  When user drags the macro knob
  Then multiple linked parameters change simultaneously
```

### Z3-07: Effect Search `[IMPL]`

**Component:** `effects/EffectSearch.tsx`

```gherkin
Scenario: Substring search [IMPL]
  When user types "pixel"
  Then list filters to Pixel Sort, Pixel Liquify, etc.

Scenario: Fuzzy search [IMPL]
  When user types "dtmsh"
  Then Datamosh variants appear

Scenario: Clear search [IMPL]
  When user clears the field
  Then full list returns

Scenario: No results [IMPL] [BUG-6]
  When user types "zzzzz"
  Then "No effects found" shows
  Note: message hidden below category tags at small window sizes

Scenario: Space doesn't trigger play [IMPL]
  When search field is focused and user presses Space
  Then a space character is typed (not play/pause)
```

**Red-team:**
- Paste 10,000 character string — should not hang
- Type `<script>alert(1)</script>` — should not execute (XSS)
- Type regex special chars `.*+?` — should not crash search

### Z3-08: Category Tags (22) `[IMPL]`

```gherkin
Scenario: Single tag filter [IMPL]
  When user clicks "glitch"
  Then only glitch effects show, tag highlights green

Scenario: Multi-tag union [IMPL]
  When user clicks "glitch" then "destruction"
  Then effects from EITHER category show

Scenario: ALL resets [IMPL]
  When user clicks ALL
  Then all tags deselect, full list shows

Scenario: Combined with search [IMPL]
  Given "glitch" tag active and search "pixel"
  Then only glitch effects containing "pixel" show
```

Categories: ALL, codec_archaeology, color, creative, destruction, distortion, emergent, enhance, fx, glitch, info_theory, key, medical, misc, modulation, optics, physics, sidechain, stylize, surveillance, temporal, texture, util, warping, whimsy

### Z3-09: Effect List Items `[IMPL]`

```gherkin
Scenario: Add effect [IMPL]
  When user clicks "Invert"
  Then effect added to chain end, preview updates, count increments

Scenario: Max chain [IMPL]
  Given 10 effects in chain
  When user clicks another
  Then nothing happens, names dimmed

Scenario: Hover tooltip [IMPL]
  When user hovers effect name
  Then "Add [name]" tooltip appears
```

### Z3-10: + Add Text Track `[IMPL]`

```gherkin
Scenario: Add text track [IMPL]
  When user clicks "+ Add Text Track"
  Then "Text 1" track appears with purple T icon, M/S/R buttons

Scenario: Undo
  When user presses Cmd+Z
  Then text track removed
```

### Z3-11: Browse Button `[IMPL]`

```gherkin
Scenario: Open file picker [IMPL]
  When user clicks "Browse..."
  Then macOS file dialog opens, filtered for video files
```

### Z3-12: Sidebar Collapse `[IMPL]`

```gherkin
Scenario: Collapse [IMPL]
  When user presses Cmd+B
  Then sidebar hides, preview expands

Scenario: Expand [IMPL]
  When user presses Cmd+B again
  Then sidebar restores with previous state
```

### Z3-13: Help Panel `[TODO]`

**Component:** `effects/HelpPanel.tsx`

```gherkin
Scenario: Show effect help [TODO — not tested]
  Given an effect is selected
  When the help panel is visible
  Then it shows effect description, parameter explanations, and usage tips
```

---

## Z4: Preview Canvas

### Z4-01: Video Frame `[IMPL]`

**Component:** `preview/PreviewCanvas.tsx`

```gherkin
Scenario: Show processed frame [IMPL]
  Given video loaded with effects
  Then preview shows current frame with all non-bypassed effects

Scenario: Update triggers [IMPL]
  Preview updates when: playhead moves, param changes, effect added/removed/bypassed, mix changes

Scenario: No video [IMPL]
  Then preview shows "No video loaded"

Scenario: All bypassed [IMPL]
  Then preview shows original unprocessed frame

Scenario: Aspect ratio
  Then preview maintains video aspect ratio with black bars if needed
```

**Red-team:**
- Load corrupt video file — should show error, not crash
- Load 8K video — should handle or show resolution warning
- Load 0-frame video — should handle gracefully

### Z4-02: FPS Overlay `[IMPL]`

```gherkin
Scenario: During playback [IMPL]
  Then FPS shows actual framerate (e.g. "30 fps")

Scenario: When paused [IMPL]
  Then FPS shows "1 fps"
```

### Z4-03: Pop-Out Preview `[IMPL]`

**Component:** `preview/PopOutPreview.tsx`

```gherkin
Scenario: Pop out [TODO — not tested]
  When user clicks the pop-out icon (top-right of preview)
  Then preview opens in a separate floating window
  And the main window preview area may show "Preview in separate window"

Scenario: Close pop-out
  When user closes the pop-out window
  Then preview returns to the main window
```

### Z4-04: Preview Controls `[IMPL]`

**Component:** `preview/PreviewControls.tsx`

```gherkin
Scenario: Preview control buttons [TODO — not tested]
  Then preview controls show play/pause, zoom, and possibly other controls
  Note: needs investigation — may duplicate transport controls
```

### Z4-05: Before/After `[IMPL]`

```gherkin
Scenario: Hold backslash [IMPL — not tested via computer use]
  Given effects applied
  When user holds \
  Then preview shows original (no effects)
  When released
  Then preview shows processed
```

---

## Z5: Timeline

### Z5-01: Ruler `[IMPL]`

**Component:** `timeline/TimeRuler.tsx`

```gherkin
Scenario: Time markers [IMPL]
  Then ruler shows markers that adapt to zoom level

Scenario: Click to seek [IMPL]
  When user clicks ruler at 2.0s
  Then playhead moves to 2.0s, preview updates
```

### Z5-02: Playhead `[IMPL]`

**Component:** `timeline/Playhead.tsx`

```gherkin
Scenario: Visual indicator [IMPL]
  Then green vertical line on timeline

Scenario: Click seek [IMPL]
  When user clicks ruler
  Then playhead jumps to that position

Scenario: Drag scrub [PARTIAL — click-to-seek only, no drag confirmed]
  When user drags playhead
  Then preview updates in real-time
```

### Z5-03: Track `[IMPL]`

**Component:** `timeline/Track.tsx`

```gherkin
Scenario: Track header [IMPL]
  Then shows: color indicator, name, M/S/R buttons

Scenario: Mute [IMPL]
  When user clicks M
  Then track muted (highlighted), excluded from render

Scenario: Solo [IMPL]
  When user clicks S
  Then only soloed tracks render

Scenario: Automation arm [IMPL]
  When user clicks A
  Then automation display toggles
```

### Z5-04: Clip `[IMPL]`

**Component:** `timeline/Clip.tsx`

```gherkin
Scenario: Display [IMPL]
  Then clip shows thumbnails, filename, track-colored background

Scenario: Select [IMPL]
  When user clicks clip
  Then green border, Transform panel appears

Scenario: Deselect [IMPL]
  When user clicks empty space
  Then clip deselected, Transform hides

Scenario: Move [IMPL]
  When user drags clip horizontally
  Then clip moves to new position, undoable

Scenario: Enable/Disable [IMPL]
  When user right-clicks > Enable/Disable
  Then clip dims when disabled, undoable
```

**Red-team:**
- Drag clip past timeline bounds — should clamp to 0
- Drag clip onto another clip — should handle overlap (stack, replace, or prevent)
- Select all + delete — should handle batch deletion

### Z5-05: Clip Trimming `[PARTIAL]`

```gherkin
Scenario: Trim right edge [IMPL]
  When user drags right edge left
  Then clip shortens, duration updates, undoable

Scenario: Trim left edge [TODO — moves clip instead of trimming]
  When user drags left edge right
  Then clip in-point moves later

Scenario: Trim to zero [TODO]
  Then prevented (minimum 1 frame)
```

### Z5-06: Clip Split `[IMPL]`

```gherkin
Scenario: Split at playhead [IMPL]
  Given clip selected, playhead within clip
  When Cmd+K pressed
  Then clip splits into two, both selectable, undoable

Scenario: Split outside clip
  Given playhead outside any clip
  When Cmd+K pressed
  Then nothing happens
```

### Z5-07: Context Menu (Clip) `[PARTIAL]`

**Component:** `timeline/ContextMenu.tsx`

```gherkin
Scenario: Menu items [IMPL]
  When user right-clicks clip
  Then shows: Split at Playhead, Duplicate, Delete, Speed/Duration..., Reverse, Enable

Scenario: Delete [IMPL]
  Then clip removed, undoable

Scenario: Duplicate [IMPL]
  Then copy appended after clip

Scenario: Speed/Duration [IMPL] ~~[BUG-13]~~
  UPDATE 2026-04-11: Dialog implemented and wired. See Sprint 1-3.

Scenario: Reverse [IMPL — no visual indicator]
  Then toggles reverse flag
```

### Z5-08: Context Menu (Track) `[IMPL]`

```gherkin
Scenario: Menu items [IMPL]
  When user right-clicks track header
  Then shows: Duplicate Track, Rename Track, Move Up/Down, Delete Track

Scenario: Duplicate [IMPL]
  Then creates "Track 1 (Copy)" with clips

Scenario: Move Up/Down [IMPL]
  Then swaps positions, grayed at bounds

Scenario: Delete [IMPL]
  Then removes track and clips, undoable

Scenario: Rename [PARTIAL] [BUG-11]
  Then should open inline input — unreliable via double-click, works via context menu
```

### Z5-09: Markers `[IMPL]`

**Component:** `timeline/MarkerFlag.tsx`

```gherkin
Scenario: Add marker [IMPL]
  When M pressed at 1.5s
  Then green triangle appears on ruler

Scenario: Navigate [IMPL]
  When user clicks near marker
  Then playhead snaps to marker position

Scenario: Delete marker [TODO]
  No UI for deletion exists

Scenario: Persist
  Markers should persist in saved projects
```

### Z5-10: Loop Region `[IMPL]`

**Component:** `timeline/LoopRegion.tsx` — **EXISTS (v1 doc incorrectly said "no visual")**

```gherkin
Scenario: Set loop in/out [IMPL]
  When user presses I at 1.0s
  Then loop in point set at 1.0s
  When user presses O at 3.0s
  Then loop out point set at 3.0s

Scenario: Visual region [TODO — component exists but display not confirmed]
  Then a highlighted region appears on the ruler between in and out points

Scenario: Loop playback [TODO — not tested]
  Given loop region set
  When playback reaches out point
  Then playback jumps to in point and continues
```

### Z5-11: Timeline Zoom `[IMPL]`

**Component:** `timeline/ZoomScroll.tsx`

```gherkin
Scenario: Zoom in [IMPL] — Cmd+=
Scenario: Zoom out [IMPL] — Cmd+-
Scenario: Zoom to fit [IMPL] — Cmd+0
Scenario: Scroll zoom [IMPL] — Cmd+scroll

Zoom should not affect playback speed.
Min zoom: project fits in view. Max zoom: individual frames visible.
```

### Z5-12: Empty Timeline Hint `[IMPL]`

```gherkin
Scenario: Show hint [IMPL]
  Given empty timeline
  Then shows "Drag media here, press ⌘I, or use File → Import" and "+ Add Track"
```

---

## Z6: Device Chain

### Z6-01: Device Chain Container `[IMPL]`

**Component:** `device-chain/DeviceChain.tsx`

```gherkin
Scenario: Layout [IMPL]
  Cards arranged horizontally, left-to-right = processing order
  Chain count "X / 10" on right
  Render time in ms (green <33ms, yellow <66ms, red >66ms)
```

### Z6-02: Device Card `[IMPL]`

**Component:** `device-chain/DeviceCard.tsx`

```gherkin
Scenario: Card contents [IMPL]
  Then shows: green ON toggle, effect name, AB button, x button, params, MIX slider
```

### Z6-03: Effect Bypass `[IMPL]`

```gherkin
Scenario: Bypass [IMPL]
  When user clicks green toggle
  Then effect dimmed, skipped in render, preview updates, render time may decrease

Scenario: Un-bypass [IMPL]
  When clicked again
  Then effect re-enables, preview includes it

Scenario: Undo bypass
  When Cmd+Z pressed
  Then bypass state reverts
```

### Z6-04: AB Switch `[IMPL]`

**Component:** `device-chain/ABSwitch.tsx`
**Store actions:** `toggleAB`, `copyToInactiveAB`
**Note:** v1 doc had wrong spec. Corrected based on code.

```gherkin
Scenario: Toggle AB [IMPL]
  Given effect has two param snapshots (A and B)
  When user clicks AB button
  Then effect switches between A and B param sets
  And preview updates to show the active set

Scenario: Copy to inactive [IMPL]
  When user adjusts params in A mode
  And clicks "copy to B" (or equivalent)
  Then current params are copied to the B snapshot

Scenario: Deactivate AB [TODO — store action exists, no UI]
  Store has deactivateAB(effectId) but no component calls it
```

### Z6-05: Remove Button (x) `[IMPL]`

```gherkin
Scenario: Remove effect [IMPL]
  When user clicks x
  Then effect removed, count decreases, preview updates

Scenario: Undo removal [IMPL]
  When Cmd+Z pressed
  Then effect restored with all params at original position
```

### Z6-06: Rotary Knob `[IMPL]`

**Component:** `common/Knob.tsx`

```gherkin
Scenario: Drag to change value [IMPL]
  When user drags up/down on knob
  Then value increases/decreases, green arc moves, preview updates real-time

Scenario: Right-click reset [IMPL]
  When user right-clicks knob
  Then value resets to default

Scenario: Shift+drag fine adjust [IMPL] ~~[BUG-16]~~
  UPDATE 2026-04-11: Implemented. Modifier key detection added to drag handler.

Scenario: Cmd+drag coarse adjust [IMPL] ~~[BUG-16]~~
  UPDATE 2026-04-11: Implemented. Modifier key detection added to drag handler.

Scenario: Scroll wheel [IMPL] ~~[BUG-5]~~
  UPDATE 2026-04-11: Implemented. onWheel handler added to Knob.

Scenario: Double-click value for input [IMPL] ~~[BUG-9]~~
  UPDATE 2026-04-11: Implemented. NumberInput now wired to knob value display.

Scenario: Arrow keys [IMPL] ~~[BUG-10]~~
  UPDATE 2026-04-11: Implemented. onKeyDown handler added to Knob.

Scenario: Value clamping [IMPL]
  Values clamp to parameter min/max range

Scenario: Undo knob change [IMPL]
  When Cmd+Z pressed
  Then value reverts to previous
```

**Red-team:**
- Drag knob while rapidly switching effects — should not apply to wrong effect
- Drag knob during playback — should update render pipeline without frame drops
- Set extreme values (min-1, max+1) via rapid drag — should clamp, not overflow

### Z6-07: Number Input `[IMPL]`

**Component:** `common/NumberInput.tsx`

```gherkin
Scenario: Direct value entry [IMPL]
  When NumberInput appears
  Then user can type exact value, Enter confirms, Escape cancels

UPDATE 2026-04-11: Now wired to knobs via double-click. See Sprint 1-3.
```

### Z6-08: Param Slider `[IMPL]`

**Component:** `effects/ParamSlider.tsx`

```gherkin
Scenario: Linear slider param [IMPL — not tested via computer use]
  Given a parameter uses a linear slider (not rotary knob)
  When user drags slider
  Then value changes linearly, preview updates
```

### Z6-09: Param Toggle `[IMPL]`

**Component:** `effects/ParamToggle.tsx`

```gherkin
Scenario: Boolean toggle [IMPL]
  When user clicks toggle
  Then value flips true/false, preview updates
  Example: Datamosh "Accumulate" toggle
```

### Z6-10: Param Choice (Dropdown) `[IMPL]`

**Component:** `effects/ParamChoice.tsx`

```gherkin
Scenario: Select option [IMPL]
  When user clicks dropdown
  Then options appear (e.g. master/r/g/b for Curves Channel)
  When user selects an option
  Then dropdown updates, effect re-renders

Scenario: Undo selection
  When Cmd+Z pressed
  Then previous selection restores
```

### Z6-11: Param Tooltip `[IMPL]`

**Component:** `common/ParamTooltip.tsx`

```gherkin
Scenario: Hover shows tooltip [IMPL]
  When user hovers over parameter label
  Then tooltip shows: description, range, default value
```

### Z6-12: Mix Slider `[IMPL]`

**Component:** `effects/ParamMix.tsx`

```gherkin
Scenario: Dry/wet blend [IMPL — drag not confirmed via computer use]
  100% = full effect, 0% = original, 50% = 50/50 blend
  When user drags slider
  Then blend changes in real-time
```

### Z6-13: Freeze Overlay `[IMPL]`

**Component:** `effects/FreezeOverlay.tsx`

```gherkin
Scenario: Freeze indicator [TODO — not tested]
  Given an effect is frozen (render cached)
  Then a freeze overlay/indicator appears on the effect card
```

### Z6-14: Max Chain Enforcement `[IMPL]`

```gherkin
Scenario: 10 effects max [IMPL]
  Given 10 effects in chain
  When user tries to add 11th
  Then rejected, sidebar names dimmed

Note: Preferences > Performance shows "Max chain length: 20" but UI enforces 10.
This discrepancy should be resolved.
```

### Z6-15: Effect Reordering `[IMPL]`

```gherkin
Scenario: Drag to reorder [IMPL]
  When user drags an effect card to a new position
  Then effects reorder, preview updates
  UPDATE 2026-04-11: Operator reorder UI now implemented. See Sprint 1-3 in docs/plans/2026-04-10-phase-next-eng-pickup.md.
```

---

## Z7: Automation

### Z7-01: Automation Toolbar `[IMPL]`

**Component:** `automation/AutomationToolbar.tsx`

```gherkin
Scenario: R/L/T/D radio buttons [IMPL]
  Exactly one active (green) at a time. R is default.
  R = Read (playback only)
  L = Latch (write on touch, continue until stop)
  T = Touch (write while adjusting, return on release)
  D = Draw (pencil draw in lane)

Scenario: Simplify [TODO — not tested]
  Reduces automation point count while preserving shape

Scenario: Clear [TODO — not tested]
  Removes all automation data (should prompt for confirmation)
```

### Z7-02: Automation Lane `[IMPL]`

**Component:** `automation/AutomationLane.tsx`

```gherkin
Scenario: Display lane [TODO — not tested via computer use]
  Given automation data exists for a parameter
  Then a lane appears below the track showing the automation curve

Scenario: Lane visibility
  When user clicks A on track header
  Then automation lanes toggle visible/hidden
```

### Z7-03: Automation Node `[IMPL]`

**Component:** `automation/AutomationNode.tsx`

```gherkin
Scenario: Drag node [TODO — not tested]
  When user drags a node point
  Then the automation value changes at that time position
  And the curve updates

Scenario: Delete node [IMPL — Delete key works for automation nodes]
  When user selects node and presses Delete
  Then node removed (this IS wired, unlike clip deletion)
```

### Z7-04: Automation Draw `[IMPL]`

**Component:** `automation/AutomationDraw.tsx`

```gherkin
Scenario: Pencil draw [TODO — not tested]
  Given D (Draw) mode is active
  When user clicks and drags in automation lane
  Then automation values are drawn directly
```

### Z7-05: Curve Segment `[IMPL]`

**Component:** `automation/CurveSegment.tsx`

```gherkin
Scenario: Curve rendering [TODO — not tested]
  Then segments between nodes render as smooth curves
```

---

## Z8: Status Bar

### Z8-01: Engine Status `[IMPL]`

```gherkin
Scenario: Connected [IMPL]
  Then green dot + "Engine: Connected"

Scenario: Disconnected [IMPL]
  Then indicator changes, watchdog restarts within 5-10s

Scenario: Reconnect [IMPL]
  Then indicator returns to green, uptime resets
```

### Z8-02: Uptime `[IMPL]`

```gherkin
Scenario: Counter [IMPL]
  Then "Uptime: X.Xs" increments continuously
  Resets on reconnect
```

### Z8-03: Render Info `[IMPL]`

```gherkin
Scenario: Display [IMPL]
  Then shows "720p 30fps [N]ms"
```

---

## Z9: Operators (9 components) `[IMPL — UI exists, NOT tested]`

**Component directory:** `operators/`
**Store:** `stores/operators.ts`

### Z9-01: Operator Rack

**Component:** `operators/OperatorRack.tsx`

```gherkin
Scenario: Show operator list [TODO — not tested]
  Then available operator types: LFO, Envelope, Step Sequencer, Fusion, Audio Follower, Video Analyzer

Scenario: Add operator [TODO]
  When user adds an LFO
  Then LFO editor appears

Scenario: Reorder operators [TODO — store exists, UI not wired]
```

**Red-team:**
- Add maximum operators — should limit or degrade gracefully
- Circular routing — should prevent

### Z9-02: LFO Editor

**Component:** `operators/LFOEditor.tsx`

```gherkin
Scenario: LFO controls [TODO]
  Rate (Hz), Depth (%), Shape (sine/square/triangle/saw), free/sync toggle
```

### Z9-03: Envelope Editor

**Component:** `operators/EnvelopeEditor.tsx`

```gherkin
Scenario: ADSR controls [TODO]
  Attack, Decay, Sustain, Release sliders/knobs
```

### Z9-04: Step Sequencer Editor

**Component:** `operators/StepSequencerEditor.tsx`

```gherkin
Scenario: Step grid [TODO]
  Grid of steps (e.g. 16), click to toggle/adjust
```

### Z9-05: Fusion Editor

**Component:** `operators/FusionEditor.tsx`

```gherkin
Scenario: Multi-source blend [TODO]
  Source list with weight sliders
```

### Z9-06: Audio Follower Editor

**Component:** `operators/AudioFollowerEditor.tsx`

```gherkin
Scenario: Audio-reactive [TODO]
  Frequency band, sensitivity, smoothing
```

### Z9-07: Video Analyzer Editor

**Component:** `operators/VideoAnalyzerEditor.tsx`

```gherkin
Scenario: Video-reactive [TODO]
  Analysis mode (brightness, motion, color)
```

### Z9-08: Modulation Matrix

**Component:** `operators/ModulationMatrix.tsx`

```gherkin
Scenario: Routing grid [TODO]
  Operators as rows, effect params as columns, click to route
```

### Z9-09: Routing Lines

**Component:** `operators/RoutingLines.tsx`

```gherkin
Scenario: Visual connections [TODO]
  Lines between connected operators and targets
```

---

## Z10: Performance Mode (6 components) `[PARTIAL]`

### Z10-01: Performance Panel `[IMPL]`

**Component:** `performance/PerformancePanel.tsx`

```gherkin
Scenario: Enter/exit [IMPL] — P key toggles PERFORM/CAPTURE indicators
```

### Z10-02: Pad Grid `[IMPL]`

**Component:** `performance/PadGrid.tsx`

```gherkin
Scenario: 4x4 pad display [IMPL]
  16 numbered pads with keyboard bindings

Scenario: Pad hint [IMPL]
  "No pad mappings configured — double-click a pad to add"
```

### Z10-03: Pad Cell `[IMPL]`

**Component:** `performance/PadCell.tsx`

```gherkin
Scenario: Trigger pad [TODO]
  Click or mapped key triggers assigned action
```

### Z10-04: Pad Editor `[IMPL]`

**Component:** `performance/PadEditor.tsx`

```gherkin
Scenario: Configure pad [TODO]
  Double-click pad opens editor for action mapping
```

### Z10-05: MIDI Settings `[IMPL]`

**Component:** `performance/MIDISettings.tsx`

```gherkin
Scenario: MIDI device config [TODO]
  Available devices, channel selection, controller mapping
```

### Z10-06: MIDI Learn Overlay `[IMPL]`

**Component:** `performance/MIDILearnOverlay.tsx`

```gherkin
Scenario: MIDI learn [TODO]
  Overlay appears, move controller to map
```

---

## Z11: Text Overlays (2 components) `[IMPL]`

### Z11-01: Text Panel

**Component:** `text/TextPanel.tsx`

```gherkin
Scenario: Edit text [TODO]
  Text content, font, size, color, position, animation controls
```

### Z11-02: Text Overlay

**Component:** `text/TextOverlay.tsx`

```gherkin
Scenario: Render text [TODO]
  Text renders on preview canvas above video
```

---

## Dialogs

### D-01: Import `[IMPL]`

**Components:** `upload/FileDialog.tsx`, `upload/DropZone.tsx`, `upload/IngestProgress.tsx`

```gherkin
Scenario: File dialog import [IMPL]
  Cmd+I → file picker → select video → track + clip + preview

Scenario: Drag-and-drop import [IMPL — not tested via CU]
  Drag from Finder → green highlight on timeline → drop → import

Scenario: Progress indicator [IMPL — not explicitly tested]
  During import, progress shows

Scenario: Non-video rejected [IMPL]
Scenario: Cancel [IMPL]
Scenario: Undo import [IMPL]
```

**Red-team:**
- Import symlink to /etc/passwd — should reject
- Import 100GB video — should handle memory
- Import during playback — should queue

### D-02: Save `[IMPL]`

```gherkin
Scenario: First save [IMPL] — dialog with "Untitled.glitch"
Scenario: Subsequent saves [IMPL] — overwrites, no dialog
```

### D-03: Save As `[IMPL]`

```gherkin
Scenario: Always shows dialog [IMPL]
```

### D-04: Export `[IMPL]`

**Components:** `export/ExportDialog.tsx`, `export/ExportProgress.tsx`, `export/RenderQueue.tsx`

```gherkin
Scenario: Three tabs [IMPL]
  Video (codec, res, fps, quality, CRF, region, audio)
  GIF (max res, dithering, region)
  Image Sequence (format, region)

Scenario: Export progress [TODO]
  Progress bar with frame count, elapsed, ETA

Scenario: Render queue [TODO]
  Multiple exports with status tracking
```

### D-05: Preferences `[IMPL]`

**Components:** `layout/Preferences.tsx`, `layout/ShortcutEditor.tsx`

```gherkin
Scenario: 4 tabs [IMPL] — General, Shortcuts, Performance, Paths
Scenario: Shortcut rebinding [IMPL — via ShortcutEditor.tsx]
```

### D-06: About `[IMPL]`

**Component:** `layout/AboutDialog.tsx`

### D-07: Speed/Duration `[IMPL]` ~~`[BUG-13]`~~

**UPDATE 2026-04-11:** Implemented in Sprint 1-3. Dialog component now exists and is wired. 267 new tests confirm all wiring.
~~**NO COMPONENT EXISTS.** Menu item dispatches nothing.~~

### D-08: Welcome Screen `[IMPL]`

**Component:** `layout/WelcomeScreen.tsx`

```gherkin
Scenario: Launch screen [IMPL]
  "ENTROPIC" title, version, New Project, Open Project, Recent Projects
```

### D-09: Crash Recovery `[IMPL]`

**Component:** `dialogs/CrashRecoveryDialog.tsx`

```gherkin
Scenario: Autosave recovery [TODO — not tested]
  Given .autosave.glitch exists
  Then dialog offers restore or discard
```

### D-10: Feedback Dialog `[IMPL]`

**Component:** `dialogs/FeedbackDialog.tsx`

```gherkin
Scenario: Send feedback [TODO — not tested]
  Cmd+Shift+F → text field + submit
```

### D-11: Telemetry Consent `[IMPL]`

**Component:** `dialogs/TelemetryConsentDialog.tsx`

```gherkin
Scenario: First launch opt-in [TODO — not tested]
```

### D-12: Update Banner `[IMPL]`

**Component:** `layout/UpdateBanner.tsx`

```gherkin
Scenario: Update available [TODO — not tested]
  Banner with install button
```

### D-13: Error Boundary `[IMPL]`

**Component:** `layout/ErrorBoundary.tsx`

```gherkin
Scenario: Catch render error [IMPL — not tested]
  React error caught, fallback UI shown, no full crash
```

### D-14: History Panel `[IMPL]`

**Component:** `layout/HistoryPanel.tsx` — **EXISTS (v1 incorrectly said "not implemented")**

```gherkin
Scenario: Undo history list [TODO — not tested]
  List of past actions, click entry to revert to that point
```

---

## Keyboard Shortcuts — Wiring Status

**Files:** `default-shortcuts.ts` → `shortcuts.ts` → `App.tsx:243-335`

| Shortcut | Action | Status |
|----------|--------|--------|
| Space | play_pause | `[IMPL]` App.tsx:313 |
| Escape | stop | `[IMPL]` FIXED (BUG-3) |
| J | transport_reverse | `[IMPL]` Handler wired (BUG-12 fixed 2026-04-11) |
| K | transport_stop | `[IMPL]` Handler wired (BUG-12 fixed 2026-04-11) |
| L | transport_forward | `[IMPL]` Handler wired (BUG-12 fixed 2026-04-11) |
| Cmd+Z | undo | `[IMPL]` |
| Cmd+Shift+Z | redo | `[IMPL]` |
| Cmd+A | select_all | `[IMPL]` |
| Cmd+D | duplicate_effect | `[IMPL]` Handler wired (BUG-14 fixed 2026-04-11) |
| Delete | delete_clip | `[IMPL]` Defined and wired (BUG-15 fixed 2026-04-11) |
| Cmd+N/O/S/Shift+S | file ops | `[IMPL]` |
| Cmd+I | import | `[IMPL]` |
| Cmd+E | export | `[IMPL]` |
| Cmd+T | add_text_track | `[IMPL]` |
| Cmd+K | split_at_playhead | `[IMPL]` |
| M | add_marker | `[IMPL]` |
| Cmd+=/- /0 | zoom in/out/fit | `[IMPL]` |
| I/O | loop in/out | `[IMPL]` |
| Cmd+B | toggle_sidebar | `[IMPL]` |
| F | toggle_focus | `[IMPL]` |
| A | toggle_automation | `[IMPL]` |
| P | toggle_perform | `[IMPL]` |
| Cmd+U | toggle_quantize | `[IMPL]` |
| Cmd+Shift+F | feedback | `[IMPL]` |
| Cmd+Shift+D | support_bundle | `[IMPL]` |
| \ | before_after | `[IMPL]` |

---

## Unwired Store Features (11 actions)

| Store | Action | Description |
|-------|--------|-------------|
| timeline | `setTrackOpacity` | No UI |
| timeline | `setTrackBlendMode` | No UI |
| timeline | `setClipTransform` | Only tests |
| operators | `reorderOperators` | No UI drag |
| automation | `addTriggerLane` | No UI |
| automation | `recordTriggerEvent` | No UI |
| automation | `mergeCapturedTriggers` | No UI |
| automation | `copyRegion` | No UI |
| automation | `pasteAtPlayhead` | No UI |
| project | `groupEffects` | No UI |
| project | `ungroupEffects` | No UI |

---

## Per-Effect Samples

> ~170 effects. Each follows this pattern.

### Invert `[IMPL]` — No params. Preview inverts colors.
### Hue Shift `[IMPL]` — Hue Rotation: 0°-360°, default 180°.
### VHS `[IMPL]` — Tracking (~0.50%), Noise (~0.20%), Chromatic Aberration.
### Posterize `[IMPL]` — Color Levels: 2-256, default 4.
### Datamosh Real `[IMPL]` — Intensity (1.00x), Corruption (0.30%).
### Curves `[IMPL]` — Control point, Channel (master/r/g/b), Interpolation (cubic/linear).
### Levels `[IMPL]` — Input Black (0-255), Input White (0-255), Gamma, Output Black.
