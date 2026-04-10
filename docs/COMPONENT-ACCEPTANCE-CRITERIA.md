# Entropic v2 — Component Acceptance Criteria

> **Format:** BDD-style tickets for every interactive UI component.
> **Standard:** What a professional video effects DAW SHOULD do — not just what we currently implement.
> **Source:** Screenshot-verified component inventory + common NLE conventions (After Effects, DaVinci Resolve, Premiere Pro).

---

## Z1: Title Bar

### Z1-01: Window Title

**Description:** Title bar displays project name and dirty state.

**Acceptance Criteria:**
```gherkin
Given a new untitled project
Then the title bar shows "Untitled — Entropic"

Given a saved project named "my-project.glitch"
Then the title bar shows "my-project — Entropic"

Given any unsaved changes exist (effect added, param changed, clip moved)
Then the title bar shows an asterisk: "my-project * — Entropic"

Given the user saves (Cmd+S)
Then the asterisk disappears

Given the user is in dev mode (npm start)
Then the first macOS menu says "Electron" (known limitation)
But the dropdown items say "About Entropic", "Hide Entropic", "Quit Entropic"
```

### Z1-02: Traffic Lights (Close/Minimize/Maximize)

**Description:** Standard macOS window controls.

**Acceptance Criteria:**
```gherkin
Given the app is running
When the user clicks the red close button
Then the app prompts to save if there are unsaved changes
And closes the window if saved or discarded

When the user clicks the yellow minimize button
Then the window minimizes to the dock

When the user clicks the green maximize button
Then the window enters full screen mode
And all panels adapt to the new size
```

---

## Z2: Transport Bar

### Z2-01: Play Button (▶)

**Description:** Starts/pauses video playback.

**Acceptance Criteria:**
```gherkin
Given a video is loaded and playhead is at any position
When the user clicks the Play button
Then playback starts from the current playhead position
And the timecode advances in real-time
And the preview canvas updates with each new frame (with effects applied)
And the playhead moves along the timeline ruler
And the FPS overlay shows the actual playback framerate

Given playback is active
When the user clicks the Play button again
Then playback pauses
And the current frame stays visible in the preview
And the timecode stops advancing
And the playhead stops moving

Given no video is loaded
When the user clicks Play
Then nothing happens (no crash, no error)
```

**Edge Cases:**
- Rapid double-click should not cause desync
- Click during effect chain render should queue, not crash
- Playback at end of clip should stop at last frame (no error)

### Z2-02: Stop Button (■)

**Description:** Stops playback and returns playhead to start.

**Acceptance Criteria:**
```gherkin
Given playback is active
When the user clicks Stop
Then playback stops immediately
And the playhead returns to 0:00.0
And the timecode shows 0:00.0 / [total]
And the preview shows the first frame

Given playback is paused at 0:02.5
When the user clicks Stop
Then the playhead returns to 0:00.0
And the preview shows the first frame

Given no video is loaded
When the user clicks Stop
Then nothing happens (no crash)
```

### Z2-03: Timecode Display

**Description:** Shows current position and total duration.

**Acceptance Criteria:**
```gherkin
Given a 5-second video at 30fps is loaded
Then the timecode shows "0:00.0 / 0:05.0"

Given the playhead is at frame 75 (2.5 seconds)
Then the timecode shows "0:02.5 / 0:05.0"

Given playback is running
Then the timecode current position updates every frame

Given no video loaded
Then the timecode shows "0:00.0 / 0:00.0"

Given a trimmed clip (original 5s, trimmed to 3s)
Then the total duration reflects the trimmed length
```

### Z2-04: BPM Field

**Description:** Editable tempo field for quantize grid alignment.

**Acceptance Criteria:**
```gherkin
Given the default project
Then the BPM field shows "120"

When the user triple-clicks the BPM field
Then the entire value is selected (highlighted)

When the user types "140" and presses Enter
Then the BPM updates to 140
And the quantize grid recalculates based on new tempo

When the user types "0" and presses Enter
Then the value is rejected or clamped to minimum (e.g., 20 BPM)

When the user types "999" and presses Enter
Then the value is accepted or clamped to maximum (e.g., 300 BPM)

When the user types "abc" and presses Enter
Then the value is rejected and reverts to previous value

When the user presses Escape while editing
Then the edit is cancelled and the previous value is restored
```

**Edge Cases:**
- Typing while field is not focused should not change BPM
- BPM should persist in saved .glitch file
- BPM change should be undoable (Cmd+Z)

### Z2-05: Quantize Button (Q)

**Description:** Toggles quantize snap on/off.

**Acceptance Criteria:**
```gherkin
Given quantize is off
When the user clicks the Q button
Then the Q button highlights (yellow/green)
And clip snapping aligns to the quantize grid

Given quantize is on
When the user clicks Q again
Then the Q button returns to default (unhighlighted)
And clip snapping is free (no grid alignment)

When the user presses Cmd+U
Then the same toggle behavior occurs
```

### Z2-06: Quantize Grid Dropdown

**Description:** Selects quantize resolution.

**Acceptance Criteria:**
```gherkin
Given the quantize dropdown shows "1/4"
When the user clicks the dropdown
Then a menu appears with options: 1/4, 1/8, 1/16, 1/32

When the user selects "1/8"
Then the dropdown updates to show "1/8"
And the timeline grid updates to 1/8 note intervals (at current BPM)

When the user selects "1/32"
Then the grid is very fine (32nd notes)
And clip snapping uses 1/32 resolution
```

### Z2-07: JKL Transport (Keyboard)

**Description:** Standard NLE shuttle controls.

**Acceptance Criteria:**
```gherkin
Given a video is loaded
When the user presses L
Then forward playback starts at 1x speed

When the user presses L twice
Then forward playback runs at 2x speed

When the user presses L three times
Then forward playback runs at 4x speed

When the user presses J
Then reverse playback starts at 1x speed

When the user presses J twice
Then reverse playback runs at 2x speed

When the user presses K
Then playback stops (pause at current position, NOT return to start)

When the user presses K+L simultaneously (hold K, tap L)
Then playback advances one frame forward (jog)

When the user presses K+J simultaneously
Then playback steps one frame backward (jog)
```

**Current Status:** FAIL (BUG-12) — mapped but non-functional.

---

## Z3: Left Sidebar

### Z3-01: Asset Info Display

**Description:** Shows metadata for the currently loaded/selected asset.

**Acceptance Criteria:**
```gherkin
Given a video "test-video.mp4" (1280x720, 30fps) is imported
Then the sidebar shows:
  - "test-video.mp4" (filename)
  - "1280x720 | 30fps" (resolution and framerate)

Given no video is loaded
Then the asset info area is empty or shows placeholder

Given a second video is imported
Then the asset info updates to show the most recently imported asset
```

### Z3-02: Transform Panel

**Description:** Position, scale, and rotation controls for the selected clip.

**Acceptance Criteria:**
```gherkin
Given a clip is selected on the timeline
Then the TRANSFORM panel appears in the sidebar with:
  - "TRANSFORM" label
  - X field (default: 0)
  - Y field (default: 0)
  - Scale field (default: 1)
  - Rot field (default: 0)
  - "Fit" button
  - "Reset" button

Given no clip is selected
Then the TRANSFORM panel is hidden

When the user types "100" in the X field and presses Enter
Then the clip moves 100 pixels to the right in the preview
And the change is reflected in real-time

When the user types "0.5" in the Scale field and presses Enter
Then the clip renders at 50% size in the preview
And black bars or background shows around the scaled clip

When the user types "45" in the Rot field and presses Enter
Then the clip rotates 45 degrees in the preview

When the user clicks "Fit"
Then Scale adjusts so the clip fills the preview canvas
And X/Y adjust to center the clip

When the user clicks "Reset"
Then X=0, Y=0, Scale=1, Rot=0
And the clip returns to its default position/size

Each transform change should be undoable (Cmd+Z)
Transform values should persist in saved .glitch file
```

### Z3-03: Effects Tab

**Description:** Tab to switch to the effect browser.

**Acceptance Criteria:**
```gherkin
Given the sidebar is visible
When the user clicks "EFFECTS" tab
Then the effects browser shows:
  - Search field
  - "+ Add Text Track" button
  - Category tags (22 tags)
  - Effect list (scrollable)
And the EFFECTS tab has an active indicator (underline or highlight)
And the PRESETS tab appears inactive
```

### Z3-04: Presets Tab

**Description:** Tab to switch to the presets browser.

**Acceptance Criteria:**
```gherkin
When the user clicks "PRESETS" tab
Then the presets browser shows:
  - Search field
  - Category tags (8: ALL, glitch, color, temporal, destruction, physics, subtle, chain)
  - Preset list or "No presets saved yet" if empty
And the PRESETS tab has an active indicator
And the EFFECTS tab appears inactive
```

### Z3-05: Effect Search Field

**Description:** Text input that filters the effect list.

**Acceptance Criteria:**
```gherkin
Given the search field is empty
Then all effects in the current category filter are shown

When the user types "pixel"
Then the effect list filters to show only effects containing "pixel":
  - Pixel Sort, Pixel Liquify, Pixel Annihilator, etc.
And filtering happens in real-time (on each keystroke)

When the user types "dtmsh" (misspelling)
Then fuzzy/subsequence matching finds "Datamosh" and variants
And results are ranked by match quality

When the user clears the search field (select all + delete)
Then the full effect list returns

When the user types a query with no matches (e.g., "zzzzz")
Then "No effects found" message appears
Note: currently this message may be hidden below category tags (BUG-6)

When the search field is focused
Then pressing Space types a space (does NOT trigger play/pause)
And other keyboard shortcuts are suppressed while typing
```

### Z3-06: Category Tags (22)

**Description:** Toggle buttons that filter the effect list by category.

**Acceptance Criteria:**
```gherkin
Given no category is selected (ALL is active, green highlight)
Then the full effect list is shown (all ~170 effects)

When the user clicks "glitch"
Then "glitch" tag highlights green
And "ALL" tag deselects
And only glitch-category effects are shown

When the user clicks "destruction" (while "glitch" is already selected)
Then both "glitch" and "destruction" highlight green
And effects from EITHER category are shown (union filter)

When the user clicks "ALL"
Then all category tags deselect
And "ALL" highlights green
And the full effect list is shown

The 22 categories are:
ALL, codec_archaeology, color, creative, destruction, distortion,
emergent, enhance, fx, glitch, info_theory, key, medical, misc,
modulation, optics, physics, sidechain, stylize, surveillance,
temporal, texture, util, warping, whimsy

Each category should contain at least 1 effect.
Category filtering should combine with search text filtering.
```

### Z3-07: Effect List Items

**Description:** Clickable list of effects that can be added to the device chain.

**Acceptance Criteria:**
```gherkin
Given the effect list shows available effects
When the user clicks an effect name (e.g., "Invert")
Then the effect is added to the end of the device chain
And the preview updates immediately to show the effect applied
And the chain count increments (e.g., "1 / 10")

When the user hovers over an effect name
Then "Add [effect name]" tooltip appears

Given the device chain has 10 effects (max)
When the user tries to click another effect
Then nothing happens (click is ignored or effect names appear dimmed)
And no error/crash occurs

Given the sidebar is scrolled so effect list is visible
Then clicking an effect should work regardless of scroll position
```

### Z3-08: + Add Text Track Button

**Description:** Creates a text overlay track in the timeline.

**Acceptance Criteria:**
```gherkin
When the user clicks "+ Add Text Track"
Then a new track appears in the timeline named "Text 1"
And the track has a purple "T" icon
And the track has M/S/A buttons
And the track is empty (no clips)

When the user adds a second text track
Then it appears as "Text 2"

Text tracks should be deletable via right-click > Delete Track
Text tracks should be undoable (Cmd+Z removes the track)
```

### Z3-09: Browse Button

**Description:** Opens file import dialog.

**Acceptance Criteria:**
```gherkin
Given no video is loaded (sidebar shows Browse button)
When the user clicks "Browse..."
Then the macOS file picker dialog opens
And the file picker filters for video files (MP4, MOV, etc.)

This is equivalent to Cmd+I or File > Import Media
```

### Z3-10: Sidebar Collapse (Cmd+B)

**Description:** Toggles the left sidebar visibility.

**Acceptance Criteria:**
```gherkin
Given the sidebar is visible
When the user presses Cmd+B
Then the sidebar collapses (hidden)
And the preview canvas expands to fill the freed space
And no content is lost (state preserved)

Given the sidebar is collapsed
When the user presses Cmd+B again
Then the sidebar re-expands
And all previous state is restored (search text, selected tab, scroll position)
```

---

## Z4: Preview Canvas

### Z4-01: Video Frame

**Description:** Renders the current video frame with all active effects applied.

**Acceptance Criteria:**
```gherkin
Given a video is loaded and effects are in the chain
Then the preview shows the current frame with all non-bypassed effects applied
And the frame updates whenever:
  - The playhead position changes (scrub/play)
  - An effect parameter changes
  - An effect is added/removed/reordered/bypassed
  - The mix slider changes

Given no video is loaded
Then the preview shows "No video loaded" text

Given a video is loaded but all effects are bypassed
Then the preview shows the original unprocessed frame

The preview should maintain the video's aspect ratio
Black bars should appear if the canvas aspect ratio differs from the video
```

### Z4-02: FPS Overlay

**Description:** Real-time framerate indicator.

**Acceptance Criteria:**
```gherkin
Given the preview is visible
Then the FPS overlay appears in the top-left corner of the preview

During playback
Then the FPS shows the actual achieved framerate (e.g., "30 fps", "15 fps")

When paused
Then the FPS shows "1 fps" (only rendering on demand)

The FPS overlay should not interfere with the video content
The FPS overlay should be readable against any video content (has background/outline)
```

### Z4-03: Pop-out/Maximize Icon

**Description:** Small icon in the top-right corner of the preview.

**Acceptance Criteria:**
```gherkin
Given the preview canvas is visible
Then a small icon appears in the top-right corner

When the user clicks this icon
Then either:
  a) The preview pops out into a separate window, OR
  b) The preview maximizes within the main window, OR
  c) The preview enters a full-canvas mode

The exact behavior needs to be determined from the implementation.
```

**Current Status:** NOT TESTED — seen in zoom screenshot but never clicked.

### Z4-04: Before/After Comparison

**Description:** Hold backslash to see original frame without effects.

**Acceptance Criteria:**
```gherkin
Given effects are applied to the video
When the user presses and holds the backslash key (\)
Then the preview immediately shows the ORIGINAL frame (no effects)

When the user releases the backslash key
Then the preview returns to showing the PROCESSED frame (with effects)

The transition should be instant (no fade, no delay)
This should work during playback and while paused
```

---

## Z5: Timeline

### Z5-01: Timeline Ruler

**Description:** Time ruler above the track area with time markers.

**Acceptance Criteria:**
```gherkin
Given a project with content
Then the ruler shows time markers at regular intervals
And the interval adapts to zoom level:
  - Zoomed out: markers every 1s or 0.5s
  - Zoomed in: markers every 0.1s or finer
  - Zoomed to fit: shows full duration

When the user clicks on the ruler
Then the playhead moves to that time position
And the timecode display updates
And the preview updates to show that frame

Markers (green triangles from Cmd+M) appear ON the ruler
```

### Z5-02: Playhead

**Description:** Vertical line indicating current playback position.

**Acceptance Criteria:**
```gherkin
Given a video is loaded
Then a green vertical line (playhead) appears on the timeline

During playback
Then the playhead moves from left to right at playback speed

When the user clicks the ruler
Then the playhead jumps to that position

When the user drags the playhead
Then the preview updates in real-time (scrubbing)
And the timecode updates in real-time

When playback reaches the end of the last clip
Then the playhead stops at the final frame
And playback stops automatically
```

### Z5-03: Track Header

**Description:** Left section of each track showing name and controls.

**Acceptance Criteria:**
```gherkin
Given a track exists
Then the track header shows:
  - Color indicator (vertical bar, red/yellow/etc.)
  - Track name (e.g., "Track 1", "Text 1")
  - M button (Mute)
  - S button (Solo)
  - A button (Automation)

When the user right-clicks the track header
Then a context menu appears with:
  - Duplicate Track
  - Rename Track
  - Move Up (grayed if already at top)
  - Move Down (grayed if already at bottom)
  - Delete Track
```

### Z5-04: Mute Button (M)

**Description:** Mutes a track so its content is not rendered.

**Acceptance Criteria:**
```gherkin
Given a track with video content
When the user clicks M
Then the M button highlights
And the track's content is excluded from the preview render
And the track appears dimmed in the timeline

When the user clicks M again
Then the button unhighlights
And the track content renders normally

Mute state should persist in saved projects
Mute should be undoable (Cmd+Z)
```

### Z5-05: Solo Button (S)

**Description:** Solos a track so only its content renders.

**Acceptance Criteria:**
```gherkin
Given multiple tracks with content
When the user clicks S on Track 1
Then the S button highlights
And ONLY Track 1's content renders in the preview
And all other tracks are effectively muted

When the user clicks S on Track 2 (while Track 1 is soloed)
Then both Track 1 and Track 2 are soloed
And only those two tracks render

When the user clicks S on Track 1 again (unsolo)
Then Track 1's solo is removed
And if no other tracks are soloed, all tracks render normally
```

### Z5-06: Automation Button (A)

**Description:** Arms a track for automation recording/display.

**Acceptance Criteria:**
```gherkin
When the user clicks A on a track
Then the A button highlights
And automation lanes may appear below the track (if implemented)

When the user presses the "A" key (keyboard shortcut)
Then the same toggle occurs for the selected/focused track
```

### Z5-07: Clip Component

**Description:** Video clip on a track, showing thumbnails.

**Acceptance Criteria:**
```gherkin
Given a video has been imported
Then a clip appears on Track 1 spanning the video duration
And the clip shows thumbnail frames at regular intervals
And the clip shows the filename text (e.g., "test-video.mp4")
And the clip has a colored background matching the track color

When the user clicks a clip
Then the clip is selected (green border appears)
And the Transform panel appears in the sidebar
And the clip is ready for keyboard commands (delete, split, etc.)

When the user clicks empty space on the timeline
Then the clip is deselected
And the Transform panel hides

When the user drags a clip horizontally
Then the clip moves to a new time position
And the move is undoable (Cmd+Z)
```

### Z5-08: Clip Trimming

**Description:** Drag clip edges to adjust in/out points.

**Acceptance Criteria:**
```gherkin
Given a clip is on the timeline
When the user hovers near the RIGHT edge of the clip
Then the cursor should change to a trim cursor (e.g., bracket or resize icon)

When the user drags the right edge to the left
Then the clip's out point moves earlier
And the clip appears shorter
And the total duration in the timecode updates
And the trim is undoable

When the user hovers near the LEFT edge of the clip
Then the cursor should change to a trim cursor

When the user drags the left edge to the right
Then the clip's in point moves later
And the clip appears shorter (starts later in the source video)
And the clip's position on the timeline may shift
And the trim is undoable

When the user trims a clip to zero length
Then the clip should be removed or the trim should be prevented (minimum 1 frame)
```

**Current Status:** Right trim PASS, left trim INCONCLUSIVE.

### Z5-09: Clip Split (Cmd+K)

**Description:** Splits a clip at the playhead position.

**Acceptance Criteria:**
```gherkin
Given a clip is selected and the playhead is within the clip
When the user presses Cmd+K
Then the clip splits into two clips at the playhead position
And both clips are independently selectable
And both clips play their respective portions
And the split is undoable (Cmd+Z merges them back)

Given the playhead is outside any clip
When the user presses Cmd+K
Then nothing happens (no crash)

Given the playhead is at the very start or end of a clip
When the user presses Cmd+K
Then either nothing happens or a zero-length fragment is avoided
```

### Z5-10: Clip Context Menu

**Description:** Right-click menu on a clip.

**Acceptance Criteria:**
```gherkin
When the user right-clicks on a clip
Then a context menu appears with:
  - "Split at Playhead" — splits clip at current playhead
  - "Duplicate" — creates a copy appended after the clip
  - "Delete" — removes the clip from the timeline
  - "Speed/Duration..." — opens speed control dialog
  - "Reverse" — toggles reverse playback flag on the clip
  - "Enable" / "Disable" — toggles whether the clip renders

Each action should be undoable (Cmd+Z)
```

### Z5-11: Track Context Menu

**Description:** Right-click menu on a track header.

**Acceptance Criteria:**
```gherkin
When the user right-clicks on a track header
Then a context menu appears with:
  - "Duplicate Track" — creates a copy with all clips
  - "Rename Track" — opens inline rename input
  - "Move Up" — swaps track with the one above (grayed if top)
  - "Move Down" — swaps track with the one below (grayed if bottom)
  - "Delete Track" — removes the track and all its clips

"Duplicate Track" should copy the track name + " (Copy)"
"Delete Track" should be undoable
"Rename Track" should show a text input field in the track header
```

### Z5-12: Markers (Cmd+M)

**Description:** Timeline markers for navigation.

**Acceptance Criteria:**
```gherkin
Given the playhead is at 1.5s
When the user presses Cmd+M
Then a green triangle marker appears on the ruler at 1.5s

Multiple markers can be added at different positions

When the user clicks near a marker on the ruler
Then the playhead snaps to the marker position

Markers should persist in saved projects
Markers should be deletable (method TBD — no UI currently exists)
Adding a marker should be undoable (Cmd+Z)
```

### Z5-13: Timeline Zoom

**Description:** Zoom in/out on the timeline.

**Acceptance Criteria:**
```gherkin
When the user presses Cmd+=
Then the timeline zooms in (time spans fewer pixels)
And ruler tick marks become more frequent
And clip thumbnails show more detail

When the user presses Cmd+-
Then the timeline zooms out (more time visible)
And ruler tick marks become less frequent

When the user presses Cmd+0
Then the timeline zooms to fit all content in the visible area

When the user holds Cmd and scrolls the trackpad/mouse wheel
Then the timeline zooms in/out centered on the cursor position

Zoom level should NOT affect playback speed
Zoom should be smooth (not jarring jumps)
Minimum zoom: entire project fits in view
Maximum zoom: individual frames visible
```

### Z5-14: Empty Timeline Hint

**Description:** Guidance text shown when no content exists.

**Acceptance Criteria:**
```gherkin
Given no video is imported and the timeline is empty
Then the timeline area shows:
  "Drag media here, press ⌘I, or use File → Import"
And a "+ Add Track" text link

When the user imports a video
Then the hint text disappears
And is replaced by the track with clip
```

---

## Z6: Device Chain

### Z6-01: Effect Card

**Description:** Container for a single effect in the chain.

**Acceptance Criteria:**
```gherkin
Given an effect has been added to the chain
Then an effect card appears in the device chain area showing:
  - Green "ON" toggle (left side)
  - Effect name (e.g., "Invert", "Hue Shift")
  - "AB" button (A/B comparison)
  - "x" button (remove)
  - Parameter controls (knobs, dropdowns) specific to the effect
  - "MIX" label with slider and percentage

Cards are arranged horizontally, left to right = processing order
The chain count shows "X / 10" on the right side
The render time shows in milliseconds (colored: green < 33ms, yellow < 66ms, red > 66ms)
```

### Z6-02: Effect Bypass Toggle (Green ON)

**Description:** Bypasses a single effect without removing it.

**Acceptance Criteria:**
```gherkin
Given an effect is active (green "ON" indicator)
When the user clicks the green toggle
Then the toggle dims/changes to indicate bypassed state
And the effect is skipped in the render pipeline
And the preview updates immediately (without this effect)
And the render time may decrease

When the user clicks the toggle again
Then the effect re-enables
And the preview includes the effect again
And the render time may increase

Bypass state should persist in saved projects
Bypass toggle should be undoable (Cmd+Z)
```

### Z6-03: AB Button

**Description:** A/B comparison between two parameter states.

**Acceptance Criteria:**
```gherkin
When the user adjusts parameters and clicks "AB"
Then the effect toggles between the current params (B) and the previous params (A)
And the preview updates to show the difference

This allows quick comparison of "before my tweak" vs "after my tweak"
without fully bypassing the effect.
```

**Current Status:** NOT TESTED.

### Z6-04: Remove Button (x)

**Description:** Removes an effect from the chain.

**Acceptance Criteria:**
```gherkin
When the user clicks the "x" button on an effect card
Then the effect is removed from the chain
And the chain count decreases (e.g., 8/10 → 7/10)
And the preview updates immediately
And the remaining effects shift to fill the gap
And the removal is undoable (Cmd+Z restores the effect with all its params)
```

### Z6-05: Rotary Knob

**Description:** Circular drag control for continuous parameters.

**Acceptance Criteria:**
```gherkin
Given a parameter has a rotary knob control
Then the knob shows:
  - A circular track with green arc indicating current value
  - The parameter label above (e.g., "Hue Rota...")
  - The current value below (e.g., "180.00°")

When the user drags UP on the knob
Then the value increases
And the green arc extends clockwise
And the preview updates in real-time

When the user drags DOWN on the knob
Then the value decreases
And the green arc recedes

When the user holds Shift while dragging
Then the value changes at 1/10th normal speed (fine adjustment)

When the user holds Cmd/Ctrl while dragging
Then the value changes at 10x normal speed (coarse adjustment)

When the user scrolls the mouse wheel over the knob
Then the value increases (scroll up) or decreases (scroll down)
And each tick changes by one step

When the user double-clicks the value display
Then an editable text field appears
And the user can type an exact value
And pressing Enter confirms, Escape cancels

When the user right-clicks the knob
Then the value resets to its default

When the user focuses the knob (click or tab) and presses Up/Down arrows
Then the value increments/decrements by one step per press
And holding Shift + arrow = fine step (1/10th)

The knob should clamp values to the parameter's min/max range
Knob changes should be undoable (Cmd+Z)
The knob arc should visually indicate the valid range
```

**Current Bugs:**
- BUG-5: Scroll wheel doesn't work
- BUG-9: Double-click doesn't open number input
- BUG-10: Arrow keys don't work
- BUG-16: Shift/Cmd modifiers don't affect sensitivity

### Z6-06: Mix Slider

**Description:** Dry/wet blend control for each effect.

**Acceptance Criteria:**
```gherkin
Given an effect card has a mix slider
Then the slider shows:
  - "MIX" label
  - Horizontal slider track
  - Slider thumb at current position
  - Percentage value (e.g., "100%")

When the slider is at 100%
Then the effect is fully applied

When the slider is at 0%
Then the effect is fully bypassed (original frame shown)

When the slider is at 50%
Then the output is a 50/50 blend of original and processed frames

When the user drags the slider
Then the blend changes in real-time
And the preview updates continuously

Mix value should persist in saved projects
Mix changes should be undoable
```

### Z6-07: Dropdown Parameters

**Description:** Select menus for enum/choice parameters.

**Acceptance Criteria:**
```gherkin
Given an effect has a dropdown parameter (e.g., Curves "Channel")
When the user clicks the dropdown
Then a menu appears with the available options (e.g., master, r, g, b)

When the user selects an option
Then the dropdown updates to show the new selection
And the effect re-renders with the new parameter value
And the preview updates

For Curves:
  - Channel: master, r, g, b
  - Interpolation: cubic, linear

For Pixel Sort:
  - Direction: horizontal, vertical

For Datamosh:
  - Mode: melt, bloom, etc.

Dropdown selections should persist in saved projects
Dropdown changes should be undoable
```

### Z6-08: Chain Count and Render Time

**Description:** Displays current chain size and render performance.

**Acceptance Criteria:**
```gherkin
Given effects are in the chain
Then the right side of the device chain header shows:
  - "X / 10" where X is the current number of effects
  - "[N]ms" render time for the current frame

The render time should update whenever:
  - Effects are added/removed
  - Parameters change
  - A new frame is rendered

Color coding for render time:
  - Green: < 33ms (can maintain 30fps)
  - Yellow: 33-66ms (15-30fps achievable)
  - Red: > 66ms (below 15fps)
```

### Z6-09: Max Chain Enforcement

**Description:** Prevents adding more than the maximum number of effects.

**Acceptance Criteria:**
```gherkin
Given the chain has 10 effects (the maximum)
When the user tries to add another effect (from sidebar or Adjustments menu)
Then the effect is NOT added
And the chain stays at 10/10
And effect names in the sidebar appear dimmed/disabled
And no error dialog or crash occurs

The max chain length is configurable in Preferences > Performance
(default: 20, but UI enforces 10 — this discrepancy should be resolved)
```

---

## Z7: Automation Bar

### Z7-01: R/L/T/D Mode Buttons

**Description:** Radio buttons for automation recording mode.

**Acceptance Criteria:**
```gherkin
Given the automation bar shows R, L, T, D buttons
Then exactly one button is active (green) at any time
And R (Read) is the default

When the user clicks L
Then L highlights green
And R deselects
And automation recording uses Latch mode:
  - Starts writing when a parameter is touched
  - Continues writing until playback stops

When the user clicks T
Then T highlights green
And automation uses Touch mode:
  - Writes while parameter is being adjusted
  - Returns to previous automation when released

When the user clicks D
Then D highlights green
And automation uses Draw mode:
  - Clicking in the automation lane draws values directly

When the user clicks R
Then R highlights green
And automation plays back existing curves (read-only)
```

### Z7-02: Simplify Button

**Description:** Reduces the number of automation points.

**Acceptance Criteria:**
```gherkin
Given automation data exists with many control points
When the user clicks "Simplify"
Then the automation curve is simplified (fewer points, same shape)
And the simplification is undoable

Given no automation data exists
When the user clicks "Simplify"
Then nothing happens (no crash)
```

**Current Status:** NOT TESTED.

### Z7-03: Clear Button

**Description:** Removes all automation data.

**Acceptance Criteria:**
```gherkin
When the user clicks "Clear"
Then all automation data is removed from the current track/parameter
And the automation lane (if visible) shows an empty curve
And the clear is undoable (Cmd+Z restores the data)

This should probably prompt for confirmation if there is significant automation data.
```

**Current Status:** NOT TESTED.

---

## Z8: Status Bar

### Z8-01: Engine Status Indicator

**Description:** Shows Python sidecar connection state.

**Acceptance Criteria:**
```gherkin
Given the Python sidecar is running and connected
Then a green dot + "Engine: Connected" shows in the status bar

Given the sidecar is disconnected (crashed or killed)
Then the indicator changes to red/yellow + "Engine: Disconnected"
And the watchdog begins automatic restart (within 5-10 seconds)

When the sidecar reconnects after a crash
Then the indicator returns to green + "Engine: Connected"
And the uptime resets
And the app continues functioning normally (no manual intervention needed)
```

### Z8-02: Uptime Counter

**Description:** Shows how long the engine has been connected.

**Acceptance Criteria:**
```gherkin
Given the engine is connected
Then the uptime shows "Uptime: X.Xs" and increments continuously

When the engine disconnects and reconnects
Then the uptime resets to 0

The uptime should be formatted as seconds with one decimal (e.g., "16640.2s")
```

### Z8-03: Resolution, FPS, Render Time

**Description:** Technical info about the current render.

**Acceptance Criteria:**
```gherkin
Given a 1280x720 30fps video is loaded
Then the status bar shows "720p 30fps [N]ms"

The resolution should reflect the source video (720p, 1080p, etc.)
The FPS should reflect the source framerate
The render time should match the device chain render time
```

---

## Dialogs

### D-01: Import Dialog (Cmd+I)

**Acceptance Criteria:**
```gherkin
When the user presses Cmd+I (or File > Import Media, or Browse button)
Then the macOS native file picker opens
And it filters for video file types (MP4, MOV, AVI, WebM, etc.)

When the user selects a valid video file and clicks Open
Then the file is imported:
  - A track is auto-created if none exists
  - A clip appears on the track spanning the video duration
  - The preview shows the first frame
  - Asset info updates in the sidebar
  - The timecode total updates

When the user selects a non-video file (e.g., PDF)
Then the import is rejected with a clear error message

When the user clicks Cancel
Then nothing happens (no crash, no state change)

Importing should create a single undo point (Cmd+Z removes track + clip + asset)
```

### D-02: Save Dialog (Cmd+S)

**Acceptance Criteria:**
```gherkin
Given an unsaved project (never been saved)
When the user presses Cmd+S
Then a Save dialog appears with:
  - "Save As:" field with default name "Untitled.glitch"
  - "Tags:" field (optional)
  - "Where:" location picker
  - Cancel / Save buttons

When the user types a name and clicks Save
Then a .glitch file is created at the chosen location
And the file contains valid JSON with version, timeline, effects, assets, etc.
And the title bar updates to show the new filename
And the asterisk (dirty indicator) disappears

Given a previously saved project
When the user presses Cmd+S
Then the file is overwritten at the same location (no dialog)
And the asterisk disappears
```

### D-03: Save As Dialog (Cmd+Shift+S)

**Acceptance Criteria:**
```gherkin
When the user presses Cmd+Shift+S
Then a Save As dialog always appears (even if previously saved)
And the user can choose a new name and location

The saved .glitch file should be loadable via Cmd+O
```

### D-04: Export Dialog (Cmd+E)

**Acceptance Criteria:**
```gherkin
When the user presses Cmd+E
Then the Export dialog opens with three tabs:
  - Video
  - GIF
  - Image Sequence

VIDEO TAB:
  - Codec dropdown: H.264 (MP4) (and possibly others)
  - Resolution dropdown: Source (WxH), 720p, 1080p, etc.
  - Frame Rate dropdown: Source (Xfps)
  - Quality Preset dropdown: Low, Medium, High
  - Bitrate Mode: CRF / CBR toggle
  - CRF slider (if CRF mode): 0-51, default 23
  - Region dropdown: Full Timeline (N frames), In-Out Range
  - "Include Audio" checkbox
  - Cancel / Export buttons

GIF TAB:
  - Max Resolution dropdown (480p, etc.)
  - Dithering checkbox
  - Region dropdown
  - Cancel / Export buttons

IMAGE SEQUENCE TAB:
  - Format dropdown: PNG, JPEG, TIFF
  - Region dropdown
  - Cancel / Export buttons

When the user clicks Export
Then a Save dialog appears for the output file location
Then export begins with a progress indicator
Then the exported file is created with all effects baked in

The export should render every frame through the full effect chain
Export should work with 0 effects (renders original video)
Export with 10 effects should complete (may be slow)
```

### D-05: Preferences Dialog

**Acceptance Criteria:**
```gherkin
When the user opens Help > Keyboard Shortcuts (or equivalent)
Then the Preferences dialog opens with 4 tabs:

GENERAL TAB:
  - Theme: Dark (Light — Coming soon)
  - Language: English

SHORTCUTS TAB:
  - Full keyboard shortcut reference organized by category:
    Transport, Edit, Timeline, View
  - Each shortcut shows: Action, Default key, Current key
  - Shortcuts should be rebindable (click → press new key)

PERFORMANCE TAB:
  - Auto-freeze threshold (effects): number input
  - Max chain length: number input (default 20)
  - Render quality: dropdown (Low, Medium, High)

PATHS TAB:
  - User preset folder: text + Browse button
  - Autosave folder: text + Browse button
  - Cache folder: text + Browse button

Close button dismisses the dialog
Changes should take effect immediately (no Apply button needed)
```

### D-06: About Dialog

**Acceptance Criteria:**
```gherkin
When the user clicks Electron > About Entropic
Then a small dialog appears showing:
  - App icon
  - "Electron" (or "Entropic" when packaged)
  - Version number (e.g., "Version 40.6.0")
  - Close button (red traffic light)
```

### D-07: Speed/Duration Dialog

**Acceptance Criteria:**
```gherkin
When the user right-clicks a clip and selects "Speed/Duration..."
Then a dialog should open showing:
  - Speed percentage input (100% = normal, 200% = double speed, 50% = half speed)
  - Duration display (updates inversely to speed)
  - "Reverse" checkbox
  - "Ripple edit" checkbox (shift subsequent clips)
  - OK / Cancel buttons

When the user sets speed to 200% and clicks OK
Then the clip plays at double speed
And the clip duration halves on the timeline
And the change is undoable
```

**Current Status:** FAIL (BUG-13) — dialog doesn't open.

---

## Keyboard Shortcuts — Full BDD

### Playback Shortcuts

```gherkin
Space     → Toggle play/pause
Escape    → Stop (playhead to 0:00.0)
J         → Reverse playback (multiple presses = faster)
K         → Pause at current position
L         → Forward playback (multiple presses = faster)
K+J       → Step one frame backward
K+L       → Step one frame forward
```

### Edit Shortcuts

```gherkin
Cmd+Z     → Undo last action
Cmd+Shift+Z → Redo last undone action
Cmd+A     → Select all clips on all tracks
Cmd+D     → Duplicate selected effect in device chain
Delete    → Delete selected clip(s) from timeline
```

### File Shortcuts

```gherkin
Cmd+N     → New project (prompts to save if unsaved)
Cmd+O     → Open .glitch project file
Cmd+S     → Save project
Cmd+Shift+S → Save As (always shows dialog)
Cmd+I     → Import video media
Cmd+E     → Open export dialog
Cmd+T     → Add text track
```

### Timeline Shortcuts

```gherkin
Cmd+K     → Split clip at playhead
Cmd+M     → Add marker at playhead
Cmd+=     → Zoom in timeline
Cmd+-     → Zoom out timeline
Cmd+0     → Zoom to fit all content
I         → Set loop in point at playhead
O         → Set loop out point at playhead
```

### View Shortcuts

```gherkin
Cmd+B     → Toggle sidebar visibility
F         → Toggle focus mode (collapse sidebar + timeline)
A         → Toggle automation display
P         → Toggle perform mode
Cmd+U     → Toggle quantize snap
\         → Hold for before/after effect comparison
```

---

## Per-Effect Acceptance Criteria (Sample)

> There are ~170 effects. Below are criteria for the most commonly tested ones.
> Each effect should follow the same pattern.

### Effect: Invert

```gherkin
Given "Invert" is added to the chain
Then the preview shows color-inverted video (white→black, red→cyan, etc.)
And the effect card shows "Invert" with ON toggle, AB, x
And the effect has NO parameters (only mix slider)
```

### Effect: Hue Shift

```gherkin
Given "Hue Shift" is added to the chain
Then the preview shows hue-rotated colors
And the effect card shows:
  - "Hue Rotation" rotary knob (range: 0°–360°, default: 180°)
  - MIX slider (default: 100%)

When Hue Rotation = 0°, the image appears unchanged
When Hue Rotation = 180°, colors are shifted by half the spectrum
When Hue Rotation = 360°, the image appears unchanged (full cycle)
```

### Effect: VHS

```gherkin
Given "VHS" is added to the chain
Then the preview shows VHS-style degradation:
  - Scan lines
  - Tracking errors (horizontal displacement)
  - Noise
  - Chromatic aberration

Parameters:
  - Tracking (knob, default ~0.50%)
  - Noise (knob, default ~0.20%)
  - Chromatic Aberration (knob, partially visible as "Chromati...")
  - MIX slider
```

### Effect: Posterize

```gherkin
Given "Posterize" is added to the chain
Then the preview shows reduced color palette (banding)

Parameters:
  - Color Levels (knob, default: 4, range: 2–256)
    - At 2: extreme posterization (2 colors per channel)
    - At 256: no visible effect (full color range)
  - MIX slider
```

### Effect: Datamosh Real

```gherkin
Given "Datamosh Real" is added to the chain
Then the preview shows frame-blending/smearing artifacts

Parameters:
  - Intensity (knob, default: 1.00x)
  - Corruption (knob, default: 0.30%)
  - MIX slider
```

### Effect: Curves

```gherkin
Given "Curves" is added to the chain
Then the effect card shows:
  - Control point knob (0.00)
  - Channel dropdown: master (default), r, g, b
  - Interpolation dropdown: cubic (default), linear
  - MIX slider

When Channel = "master"
Then adjustments affect all RGB channels equally

When Channel = "r"
Then only the red channel curve is modified

Curves should support adding control points to shape the tonal curve
An S-curve (darks down, lights up) should increase contrast
```

### Effect: Levels

```gherkin
Given "Levels" is added to the chain
Then the effect card shows:
  - Input Black (knob, default: 0, range: 0–255)
  - Input White (knob, default: 255, range: 0–255)
  - Gamma (knob, partially visible)
  - Output Black (knob, partially visible)
  - MIX slider

When Input Black increases
Then dark areas get crushed (pulled to black)

When Input White decreases
Then bright areas get blown out (pulled to white)
```
