# UAT Test Plans — Derived from BDD Acceptance Criteria

> **Source:** `COMPONENT-ACCEPTANCE-CRITERIA.md` (v2)
> **Method:** Each BDD scenario → concrete click-by-click steps + pass/fail criteria
> **Scope:** All `[IMPL]` and `[PARTIAL]` scenarios. `[TODO]` items skipped (not testable).
> **Tester:** Computer use (automated) or human (manual)
> **Prerequisite:** Launch app via `cd frontend && npm start`, wait ~10s for Electron + sidecar

---

## Z1: Title Bar

### TP-Z1-01: New project title
**Steps:**
1. Launch app (or Cmd+N for new project)
2. Read title bar text

**Pass:** Title bar shows "Untitled — Entropic"
**Fail:** Shows "Electron", blank, or missing project name

### TP-Z1-02: Saved project title
**Steps:**
1. Cmd+S → type "my-project" → Save
2. Read title bar text

**Pass:** Title bar shows "my-project — Entropic"

### TP-Z1-03: Dirty state asterisk
**Steps:**
1. Import a video (Cmd+I)
2. Read title bar text

**Pass:** Asterisk appears: "Untitled * — Entropic"

### TP-Z1-04: Save clears dirty
**Steps:**
1. With unsaved changes (asterisk visible)
2. Cmd+S → Save
3. Read title bar text

**Pass:** Asterisk disappears

### TP-Z1-05: Close with unsaved changes
**Steps:**
1. Make a change (add effect)
2. Click red close button

**Pass:** Save/Discard/Cancel prompt appears
**Method:** Manual only (computer use can't access close button easily)

---

## Z2: Transport Bar

### TP-Z2-01: Play starts from current position
**Steps:**
1. Import video
2. Click timeline ruler at ~2.0s
3. Verify timecode shows ~0:02.0
4. Press Space

**Pass:** Timecode advances from 2.0, preview animates, playhead moves
**Fail:** Playback starts from 0:00.0 or doesn't start

### TP-Z2-02: Pause freezes frame
**Steps:**
1. During playback, press Space
2. Wait 2s
3. Check timecode

**Pass:** Timecode stopped, frame visible, playhead stationary

### TP-Z2-03: Play with no video
**Steps:**
1. Cmd+N (new project, no video)
2. Press Space

**Pass:** Nothing happens, no crash, no error

### TP-Z2-04: Stop returns to start
**Steps:**
1. Import video, seek to 2.0s
2. Click Stop button (■)

**Pass:** Playhead at 0:00.0, preview shows first frame

### TP-Z2-05: BPM edit
**Steps:**
1. Triple-click BPM field (showing "120")
2. Type "140"
3. Press Enter
4. Read BPM field

**Pass:** Field shows "140"

### TP-Z2-06: BPM reject invalid
**Steps:**
1. Triple-click BPM field
2. Type "abc"
3. Press Enter

**Pass:** Field reverts to previous value (e.g. "120")

### TP-Z2-07: Quantize toggle
**Steps:**
1. Click Q button (or Cmd+U)
2. Observe Q button color

**Pass:** Q highlights yellow/green when on, unhighlights when off

### TP-Z2-08: Quantize grid change
**Steps:**
1. Click quantize dropdown (showing "1/4")
2. Select "1/8"

**Pass:** Dropdown shows "1/8"

### TP-Z2-09: Volume slider
**Steps:**
1. Import video with audio
2. Drag volume slider left
3. Play video

**Pass:** Audio is quieter
**Method:** Manual (needs ears)

---

## Z3: Left Sidebar

### TP-Z3-01: Asset info after import
**Steps:**
1. Import test-video.mp4 (1280x720, 30fps)
2. Read sidebar top area

**Pass:** Shows "test-video.mp4" and "1280x720 | 30fps"

### TP-Z3-02: Transform panel on clip select
**Steps:**
1. Import video
2. Click clip on timeline

**Pass:** TRANSFORM panel appears with X:0, Y:0, Scale:1, Rot:0, Fit, Reset buttons

### TP-Z3-03: Transform Reset
**Steps:**
1. Select clip
2. Type "0.5" in Scale field, press Enter
3. Click Reset

**Pass:** Scale returns to 1, X/Y/Rot return to 0

### TP-Z3-04: Effects tab switch
**Steps:**
1. Click PRESETS tab
2. Click EFFECTS tab

**Pass:** Effects browser shows: search, + Add Text Track, category tags, effect list

### TP-Z3-05: Effect search substring
**Steps:**
1. Click search field
2. Type "pixel"

**Pass:** List filters to effects containing "pixel" (Pixel Sort, Pixel Liquify, etc.)

### TP-Z3-06: Effect fuzzy search
**Steps:**
1. Clear search, type "dtmsh"

**Pass:** "Datamosh" variants appear in filtered list

### TP-Z3-07: Category single filter
**Steps:**
1. Click "glitch" tag

**Pass:** Tag highlights green, only glitch effects shown

### TP-Z3-08: Category multi-tag
**Steps:**
1. Click "glitch"
2. Click "destruction"

**Pass:** Both tags green, effects from either category shown

### TP-Z3-09: Category ALL reset
**Steps:**
1. With tags selected, click ALL

**Pass:** All tags deselect, full list restored

### TP-Z3-10: Add effect to chain
**Steps:**
1. Import video
2. Click "Invert" in effect list

**Pass:** Invert appears in device chain, preview shows inverted colors, chain shows "1 / 10"

### TP-Z3-11: Max chain enforcement
**Steps:**
1. Add 10 effects (click 10 different effect names)
2. Try to click 11th effect

**Pass:** 11th not added, chain stays at 10/10, effect names dimmed

### TP-Z3-12: Add text track
**Steps:**
1. Click "+ Add Text Track"

**Pass:** "Text 1" track appears with purple T icon, M/S/A buttons

### TP-Z3-13: Sidebar collapse/expand
**Steps:**
1. Press Cmd+B
2. Verify sidebar hidden, preview expanded
3. Press Cmd+B again

**Pass:** Sidebar hides then restores

### TP-Z3-14: Presets empty state
**Steps:**
1. Click PRESETS tab

**Pass:** Shows "No presets saved yet" and category tags

---

## Z4: Preview Canvas

### TP-Z4-01: No video loaded state
**Steps:**
1. Cmd+N (new project)

**Pass:** Preview shows "No video loaded"

### TP-Z4-02: Frame with effects
**Steps:**
1. Import video
2. Add Invert effect
3. Observe preview

**Pass:** Preview shows inverted color bars (not original)

### TP-Z4-03: FPS overlay during playback
**Steps:**
1. Import video, press Space
2. Read FPS overlay (top-left of preview)

**Pass:** Shows actual framerate (e.g. "30 fps")

### TP-Z4-04: FPS overlay when paused
**Steps:**
1. Import video (paused)
2. Read FPS overlay

**Pass:** Shows "1 fps"

---

## Z5: Timeline

### TP-Z5-01: Click ruler to seek
**Steps:**
1. Import video
2. Click ruler at ~3.0s
3. Read timecode

**Pass:** Timecode shows ~0:03.0, preview shows frame at 3s

### TP-Z5-02: Track header elements
**Steps:**
1. Import video
2. Read track header

**Pass:** Shows: red color bar, "Track 1", M, S, A buttons

### TP-Z5-03: Mute track
**Steps:**
1. Click M button on Track 1

**Pass:** M button highlights

### TP-Z5-04: Solo track
**Steps:**
1. Click S button on Track 1

**Pass:** S button highlights

### TP-Z5-05: Clip select
**Steps:**
1. Click clip on timeline

**Pass:** Green border appears, Transform panel shows in sidebar

### TP-Z5-06: Clip deselect
**Steps:**
1. Click empty space on timeline (below clips)

**Pass:** Green border disappears, Transform hides

### TP-Z5-07: Clip move
**Steps:**
1. Click and drag clip from 0s to ~1s
2. Release

**Pass:** Clip position changes, undoable (Cmd+Z moves it back)

### TP-Z5-08: Clip trim right edge
**Steps:**
1. Drag right edge of clip to the left (shorten)
2. Read timecode total

**Pass:** Duration decreases (e.g. 5.0→4.0)

### TP-Z5-09: Split clip
**Steps:**
1. Click ruler at ~2.0s (set playhead)
2. Press Cmd+K

**Pass:** Clip splits into two at 2.0s, both selectable

### TP-Z5-10: Split undo
**Steps:**
1. After split, press Cmd+Z

**Pass:** Clip merges back into one

### TP-Z5-11: Clip context menu
**Steps:**
1. Right-click on clip

**Pass:** Shows: Split at Playhead, Duplicate, Delete, Speed/Duration..., Reverse, Enable

### TP-Z5-12: Delete clip via context menu
**Steps:**
1. Right-click clip → Delete

**Pass:** Clip removed from timeline

### TP-Z5-13: Undo delete clip
**Steps:**
1. After deleting clip, Cmd+Z

**Pass:** Clip restored

### TP-Z5-14: Duplicate clip via context menu
**Steps:**
1. Right-click clip → Duplicate

**Pass:** Copy appended after original, duration increases

### TP-Z5-15: Clip Enable/Disable
**Steps:**
1. Right-click clip → Enable/Disable

**Pass:** Clip dims when disabled, undims when re-enabled

### TP-Z5-16: Track context menu
**Steps:**
1. Right-click track header

**Pass:** Shows: Duplicate Track, Rename Track, Move Up/Down, Delete Track

### TP-Z5-17: Duplicate track
**Steps:**
1. Right-click Track 1 → Duplicate Track

**Pass:** "Track 1 (Copy)" appears with same clips

### TP-Z5-18: Move track down/up
**Steps:**
1. Add a second track (Timeline > Add Video Track)
2. Right-click Track 1 → Move Down
3. Verify Track 1 is now below Track 2
4. Right-click Track 1 → Move Up

**Pass:** Tracks swap positions correctly

### TP-Z5-19: Delete track
**Steps:**
1. Right-click track → Delete Track

**Pass:** Track and clips removed

### TP-Z5-20: Add marker
**Steps:**
1. Click ruler at 1.5s
2. Press Cmd+M
3. Observe ruler at 1.5s

**Pass:** Green triangle marker appears

### TP-Z5-21: Zoom in/out/fit
**Steps:**
1. Press Cmd+= (zoom in) 3 times
2. Press Cmd+- (zoom out) 3 times
3. Press Cmd+0 (zoom to fit)

**Pass:** Ruler scale changes each time, Cmd+0 shows full timeline

### TP-Z5-22: Empty timeline hint
**Steps:**
1. Cmd+N (new project, no video)
2. Read timeline area

**Pass:** Shows "Drag media here, press ⌘I, or use File → Import"

---

## Z6: Device Chain

### TP-Z6-01: Effect card contents
**Steps:**
1. Add "Hue Shift" effect
2. Read device chain

**Pass:** Card shows: green ON toggle, "Hue Shift" name, AB button, x button, "Hue Rotation" knob at 180.00°, MIX slider at 100%

### TP-Z6-02: Effect bypass toggle
**Steps:**
1. Add Invert effect
2. Click green ON toggle
3. Observe preview

**Pass:** Preview changes (bypass removes inversion), toggle dims

### TP-Z6-03: Effect un-bypass
**Steps:**
1. Click dimmed toggle again

**Pass:** Effect re-enables, preview shows inversion

### TP-Z6-04: Remove effect (x)
**Steps:**
1. Click x button on effect card
2. Read chain count

**Pass:** Effect removed, count decrements

### TP-Z6-05: Undo remove effect
**Steps:**
1. After removing, Cmd+Z

**Pass:** Effect restored with all params

### TP-Z6-06: Knob drag up
**Steps:**
1. Add Hue Shift, find Hue Rotation knob (showing 180.00°)
2. Click and drag UP on knob

**Pass:** Value increases (e.g. 180→250), green arc extends

### TP-Z6-07: Knob drag down
**Steps:**
1. Click and drag DOWN on knob

**Pass:** Value decreases

### TP-Z6-08: Knob right-click reset
**Steps:**
1. With knob at non-default value (e.g. 250°)
2. Right-click the knob

**Pass:** Value resets to 180.00° (default)

### TP-Z6-09: Param tooltip
**Steps:**
1. Hover over a parameter label (e.g. "Hue Rotation")
2. Wait 1-2 seconds

**Pass:** Tooltip appears with description, range, default

### TP-Z6-10: Chain count and render time
**Steps:**
1. Add 5 effects
2. Read right side of device chain header

**Pass:** Shows "5 / 10" and render time in ms (e.g. "45ms")

---

## Z7: Automation Bar

### TP-Z7-01: R mode (default)
**Steps:**
1. Look at automation bar

**Pass:** R button is green (active)

### TP-Z7-02: Switch to L/T/D modes
**Steps:**
1. Click L → verify L green, R not
2. Click T → verify T green, L not
3. Click D → verify D green, T not
4. Click R → verify R green, D not

**Pass:** Only one button active at a time, clean transitions

---

## Z8: Status Bar

### TP-Z8-01: Engine connected
**Steps:**
1. Launch app, wait 10s
2. Read status bar

**Pass:** Green dot + "Engine: Connected" + uptime incrementing

### TP-Z8-02: Engine crash recovery
**Steps:**
1. Open Activity Monitor
2. Force Quit the Python "entropic" process
3. Wait 10-15 seconds
4. Read status bar

**Pass:** Briefly shows disconnected, then reconnects, uptime resets
**Method:** Manual (requires Activity Monitor)

### TP-Z8-03: Render info
**Steps:**
1. Import 1280x720 30fps video
2. Read status bar

**Pass:** Shows "720p 30fps [N]ms"

---

## Z9: Performance Mode

### TP-Z9-01: Enter/exit perform mode
**Steps:**
1. Press P
2. Look at bottom-right corner

**Pass:** "PERFORM" and "CAPTURE" indicators appear

3. Press P again

**Pass:** Indicators disappear

### TP-Z9-02: Pad grid visible
**Steps:**
1. Enter perform mode (P)
2. Observe pad area

**Pass:** 4x4 numbered pads with keyboard bindings shown

---

## Dialogs

### TP-D01: Import via Cmd+I
**Steps:**
1. Press Cmd+I
2. Navigate to test-assets/
3. Select test-video.mp4
4. Click Open
5. Wait 3s

**Pass:** Track created, clip visible, preview shows first frame, asset info updated

### TP-D02: Save dialog (first save)
**Steps:**
1. With unsaved project, Cmd+S

**Pass:** Save dialog appears with "Untitled.glitch", location picker, Save button

### TP-D03: Export dialog tabs
**Steps:**
1. Cmd+E
2. Click "Video" tab → verify codec, resolution, fps, CRF fields
3. Click "GIF" tab → verify max resolution, dithering
4. Click "Image Sequence" tab → verify format dropdown

**Pass:** All 3 tabs show correct fields

### TP-D04: Preferences dialog
**Steps:**
1. Help > Keyboard Shortcuts (or equivalent)
2. Click General tab → verify Theme, Language
3. Click Shortcuts tab → verify shortcut list
4. Click Performance tab → verify auto-freeze, max chain, render quality
5. Click Paths tab → verify preset/autosave/cache folder fields

**Pass:** All 4 tabs present with expected fields

### TP-D05: About dialog
**Steps:**
1. Electron menu > About Entropic

**Pass:** Dialog shows icon, "Electron", version number

### TP-D06: Welcome screen
**Steps:**
1. Launch app fresh

**Pass:** "ENTROPIC" title, version, New Project, Open Project, Recent Projects

---

## Keyboard Shortcuts (ALL)

### TP-K01: Full shortcut sweep
**Steps:** For each shortcut, press it and verify the expected action.

| # | Key | Action | Verify |
|---|-----|--------|--------|
| 1 | Space | Play/Pause | Timecode advances/stops |
| 2 | Cmd+Z | Undo | Last action reverts |
| 3 | Cmd+Shift+Z | Redo | Last undo re-applies |
| 4 | Cmd+N | New Project | Welcome screen or empty workspace |
| 5 | Cmd+O | Open | File picker opens |
| 6 | Cmd+S | Save | Save dialog (first save) or file updated |
| 7 | Cmd+I | Import | File picker opens |
| 8 | Cmd+E | Export | Export dialog opens |
| 9 | Cmd+T | Add Text Track | "Text 1" track appears |
| 10 | Cmd+K | Split at Playhead | Clip splits |
| 11 | Cmd+M | Add Marker | Green triangle on ruler |
| 12 | Cmd+= | Zoom In | Ruler scale increases |
| 13 | Cmd+- | Zoom Out | Ruler scale decreases |
| 14 | Cmd+0 | Zoom Fit | Full timeline visible |
| 15 | Cmd+B | Toggle Sidebar | Sidebar hides/shows |
| 16 | F | Focus Mode | Both panels collapse/expand |
| 17 | A | Toggle Automation | A button highlights on track |
| 18 | P | Perform Mode | PERFORM indicator appears/disappears |
| 19 | Cmd+U | Toggle Quantize | Q button highlights |
| 20 | Cmd+A | Select All | All clips selected (green borders) |
| 21 | I | Loop In | (set loop point — no visual confirmed) |
| 22 | O | Loop Out | (set loop point — no visual confirmed) |

### TP-K02: Known broken shortcuts (verify they DON'T work)
| Key | Expected Bug | Ticket |
|-----|-------------|--------|
| J | No reverse playback | BUG-12 |
| K | No stop-in-place | BUG-12 |
| L | No forward playback | BUG-12 |
| Cmd+D | No effect duplicate | BUG-14 |
| Delete | No clip deletion | BUG-15 |

---

## Stress Tests

### TP-STRESS-01: 10-effect chain playback
**Steps:**
1. Import video
2. Add 10 effects
3. Press Space, play for 3s

**Pass:** Playback continues (may drop frames), no crash

### TP-STRESS-02: Rapid undo/redo (20x each)
**Steps:**
1. Make 20 changes (add/remove effects)
2. Press Cmd+Z 20 times
3. Press Cmd+Shift+Z 20 times

**Pass:** No crash, state consistent

### TP-STRESS-03: Rapid play/pause (10x)
**Steps:**
1. Press Space 10 times rapidly

**Pass:** Toggles cleanly, no desync

### TP-STRESS-04: Rapid effect add/remove
**Steps:**
1. Add effect, Cmd+Z, Cmd+Shift+Z — repeat 10 times

**Pass:** Chain count alternates correctly, no crash

---

## Cross-Component Integration

### TP-INT-01: Full round-trip save/load
**Steps:**
1. Import video
2. Add 5 effects, change params
3. Add markers, set BPM to 140
4. Cmd+S (save as "test-roundtrip.glitch")
5. Cmd+N (new project)
6. Cmd+O → open "test-roundtrip.glitch"

**Pass:** All effects restored with params, markers visible, BPM = 140, clip on timeline

### TP-INT-02: Full screen mode
**Steps:**
1. View > Enter Full Screen
2. Verify all panels visible, preview expanded
3. Press Escape (or View > Exit Full Screen)

**Pass:** Full screen enters/exits cleanly

### TP-INT-03: Engine crash recovery
**Steps:**
1. Import video, add effects
2. Kill Python sidecar (Activity Monitor)
3. Wait 15s

**Pass:** Engine reconnects, "Connected" restored, preview renders

---

## Summary

| Zone | Test Plans | [IMPL] | [TODO] (skipped) |
|------|-----------|--------|------------------|
| Z1 Title Bar | 5 | 5 | 0 |
| Z2 Transport | 9 | 9 | 0 |
| Z3 Sidebar | 14 | 14 | 0 |
| Z4 Preview | 4 | 4 | 0 |
| Z5 Timeline | 22 | 22 | 0 |
| Z6 Device Chain | 10 | 10 | 0 |
| Z7 Automation | 2 | 2 | 0 |
| Z8 Status Bar | 3 | 3 | 0 |
| Z9 Performance | 2 | 2 | 0 |
| Dialogs | 6 | 6 | 0 |
| Shortcuts | 22+5 | 22 | 5 (broken) |
| Stress | 4 | 4 | 0 |
| Integration | 3 | 3 | 0 |
| **TOTAL** | **106** | **106** | **5 known broken** |
