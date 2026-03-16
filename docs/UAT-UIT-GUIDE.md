# Entropic v2 Challenger — UAT & UIT Testing Guide

> **Version:** 4.0
> **Date:** 2026-03-16
> **Covers:** Phases 0A–10, 11.5, Ship Gate Audit (all built phases)
> **Tester:** You (manual walkthrough)
> **Time estimate:** 6-8 hours for full pass (476 test cases)

---

## Prerequisites

### 1. Start the App

```bash
cd ~/Development/entropic-v2challenger/frontend
npm run start
```

This launches:
- Electron window (the app)
- Python sidecar (auto-spawned, runs the video engine)
- Vite HMR dev server

### 2. Get a Test Video

You need at least one short video file (5-30 seconds, MP4/MOV, 720p-1080p). If you don't have one handy:
- Any screen recording works
- Any phone video works
- Shorter = faster iteration

### 3. Verify Audio Output

Before testing Section 6 (Audio), make sure your Mac audio output is working — play a YouTube video or any audio file first. If audio doesn't work system-wide, audio tests will all fail for infrastructure reasons, not app bugs.

### 4. Troubleshooting: App Won't Start

If `npm run start` fails:

1. **Missing node_modules:** Run `npm install` in the `frontend/` directory
2. **Native module error:** Run `npm run build:native` to rebuild the C++ shared memory module
3. **Python not found:** Verify Python 3.12+ is installed: `python3 --version`
4. **Port conflict:** The sidecar picks a dynamic port — if something else is using it, restart and try again
5. **Blank window:** Check the terminal for error output — Vite dev server logs appear there

### 5. Notation Used in This Guide

- **[PASS]** / **[FAIL]** / **[N/A]** — mark each test as you go
- Use **[N/A]** if a button or interaction described below doesn't exist in the UI yet — some Phase 4 features may be store-level only without full UI wiring
- **AC-N** — references acceptance criteria from phase specs
- **Cmd** = Command key (macOS)
- "Effect rack" = the right panel showing your effect chain
- "Browser" = the left panel with Assets/Effects tabs

---

## SECTION 1: App Launch & Infrastructure (Phase 0A)

> Tests the skeleton: does the app boot, does the engine connect, does the watchdog work?

### 1.1 Window & Chrome

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 1 | App opens | Run `npm run start` | Electron window appears, dark theme (#1a1a1a background) | [ ] |
| 2 | Window title | Look at title bar | Contains "Entropic" and "Untitled" | [ ] |
| 3 | Window is not blank | Look at main area | React app renders (not white/blank screen) | [ ] |
| 4 | All panels visible | Look at layout | You see: toolbar (top), browser (left), preview (center), effects panel (right), timeline (bottom) | [ ] |

### 1.2 Engine Connection

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 5 | Status bar shows engine | Look at bottom status bar | Shows "Engine: Connected" or similar engine status text | [ ] |
| 6 | Engine uptime | Wait 5+ seconds, check status | Uptime counter increments (not stuck at 0) | [ ] |
| 7 | Effect browser populates | Click "Effects" tab in browser | Effects list loads with categories (not empty) | [ ] |

### 1.3 Watchdog Recovery

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 8 | Engine auto-restart | Open Activity Monitor, find `entropic` Python process, Force Quit it | Status briefly shows disconnected, then reconnects within ~5-10 seconds | [ ] |
| 9 | App survives engine death | After step 8 | App doesn't crash — window stays open | [ ] |

---

## SECTION 2: Video Import (Phase 1)

> Tests: can you get a video into the app?

### 2.1 File Dialog Import

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 10 | Open file dialog | Look for an import/upload button (there is NO menu bar — use the button or drag-drop) | File picker dialog opens | [ ] |
| 11 | Select a video | Pick your test video (MP4/MOV) | Progress indicator appears during ingest | [ ] |
| 12 | Ingest completes | Wait for progress to finish | Video appears in the preview canvas (first frame visible) | [ ] |
| 13 | Metadata shown | Check asset panel or status area | Video resolution, FPS, duration, and codec are displayed | [ ] |
| 14 | Asset appears | Check Assets tab in browser | Your video file is listed | [ ] |

### 2.2 Drag-and-Drop Import

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 15 | Drop zone visible | Drag a video file from Finder toward the app | Drop zone / overlay appears indicating where to drop | [ ] |
| 16 | Drop imports video | Release the file over the drop zone | Same result as file dialog: progress → preview shows frame | [ ] |

### 2.3 Import Edge Cases

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 17 | Reject non-video | Try to import a .pdf or .zip file | Error message or rejection (doesn't crash) | [ ] |
| 18 | Cancel import | Start importing, then try to cancel/close dialog | App doesn't hang or crash | [ ] |
| 19 | Import second video | After first video loaded, import another | Second video replaces or adds as new asset | [ ] |

---

## SECTION 3: Preview Canvas (Phase 1)

> Tests: can you see your video and scrub through it?

### 3.1 Frame Display

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 20 | First frame visible | After import | Preview canvas shows the first frame of your video | [ ] |
| 21 | Canvas not blank | Look at preview area | Video frame is rendered (not black, not white, not "No video") | [ ] |

### 3.2 Playback Controls

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 22 | Play | Press Space | Video starts playing in preview | [ ] |
| 23 | Pause | Press Space again during playback | Video pauses, frame stays visible | [ ] |
| 24 | Stop | Press Escape | Playback stops, playhead returns to start | [ ] |
| 25 | Scrub by clicking | Click different positions on the timeline ruler | Preview updates to show the frame at that position | [ ] |

### 3.3 Canvas Controls

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 26 | Zoom in | Press Cmd+= (or use zoom controls) | Canvas zooms in on the video | [ ] |
| 27 | Zoom out | Press Cmd+- | Canvas zooms out | [ ] |
| 28 | Fit to window | Press Cmd+0 | Video fits within the preview area | [ ] |
| 29 | Before/after | Hold backslash key `\` | Preview shows original frame (no effects), release to see processed | [ ] |

---

## SECTION 4: Effect System (Phase 1 + Phase 3 Color Suite)

> Tests: can you add, configure, reorder, and remove effects?

### 4.1 Browsing Effects

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 30 | Effect categories | Click Effects tab in browser | Categories are listed (color, destruction, temporal, texture, etc.) | [ ] |
| 31 | Expand category | Click a category name | Effects within that category are shown | [ ] |
| 32 | Search effects | Type "pixel" in the search bar | Results filter to show matching effects (pixelsort, pixel_liquify, etc.) | [ ] |
| 33 | Clear search | Clear the search box | Full category list returns | [ ] |
| 34 | Fuzzy search | Type "dtmsh" (misspelling of datamosh) | datamosh appears in results (fuzzy match) | [ ] |

### 4.2 Adding Effects

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 35 | Add first effect | Click "hue_shift" in the effect browser | Effect appears in the effect rack (right panel) | [ ] |
| 36 | Preview updates | After adding hue_shift | Preview canvas shows the video with hue shift applied | [ ] |
| 37 | Add second effect | Add "vhs" to the chain | Two effects in rack, preview shows both applied | [ ] |
| 38 | Add up to 10 | Keep adding effects until you have 10 | All 10 appear in rack, all render in preview | [ ] |
| 39 | Max chain (10) | Try to add an 11th effect | Add button is disabled — cannot exceed 10 effects | [ ] |

### 4.3 Effect Parameters

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 40 | Slider params | Click on hue_shift in rack to expand params | Sliders appear for hue amount, etc. | [ ] |
| 41 | Drag slider | Drag a parameter slider | Value changes, preview updates in real-time | [ ] |
| 42 | Rotary knob | Find a knob-style parameter control | Drag up/down to change value, preview updates | [ ] |
| 43 | Fine adjustment | Hold Shift while dragging knob | Value changes in smaller increments (fine mode) | [ ] |
| 44 | Coarse adjustment | Hold Ctrl/Cmd while dragging knob | Value changes in larger increments (coarse mode) | [ ] |
| 45 | Number input | Click the number display on a param | Can type a specific value, press Enter to confirm | [ ] |
| 46 | Arrow keys on knob | Focus a knob, press Up/Down arrows | Value increments/decrements by step size | [ ] |
| 47 | Param tooltip | Hover over a parameter label | Tooltip appears with description | [ ] |
| 48 | Enum/choice param | Add an effect with a dropdown param (e.g., pixelsort "direction") | Dropdown works, selecting option updates preview | [ ] |
| 49 | Toggle param | Find a boolean parameter toggle | Clicking toggles on/off, preview updates | [ ] |
| 50 | Mix/dry-wet | Look for the mix slider on any effect | Sliding to 0% = original, 100% = full effect | [ ] |

### 4.4 Effect Chain Operations

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 51 | Reorder effects | Drag an effect up/down in the rack (or use arrows) | Order changes, preview updates (order matters!) | [ ] |
| 52 | Bypass effect | Click the eye/bypass icon on an effect | Effect is skipped, preview shows chain without it | [ ] |
| 53 | Un-bypass | Click bypass icon again | Effect re-enables, preview shows it applied | [ ] |
| 54 | Remove effect | Click the X/remove button on an effect | Effect removed from rack, preview updates | [ ] |
| 55 | Remove all | Remove all effects one by one | Preview shows original video, rack is empty | [ ] |

### 4.5 Color Suite Tools (Phase 3)

> These are `util.*` effects (non-destructive tools). Test each one.

#### Levels

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 56 | Add Levels | Search "levels", add to chain | Levels control panel appears | [ ] |
| 57 | Black point | Drag black point slider right | Dark areas get darker/crushed | [ ] |
| 58 | White point | Drag white point slider left | Bright areas get brighter/blown out | [ ] |
| 59 | Midtone | Adjust midtone/gamma slider | Overall brightness changes | [ ] |
| 60 | Per-channel | If per-channel controls exist, adjust R/G/B independently | Individual color channels shift | [ ] |

#### Curves

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 61 | Add Curves | Search "curves", add to chain | Curve editor appears | [ ] |
| 62 | Add control point | Click on the curve line | New point appears | [ ] |
| 63 | Drag point | Drag a control point | Curve shape changes, preview updates in real-time | [ ] |
| 64 | S-curve | Make an S-shaped curve (darks down, lights up) | Image gets more contrast | [ ] |
| 65 | Channel switch | Switch between Master/R/G/B channels | Each channel has its own curve | [ ] |

#### HSL Adjust

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 66 | Add HSL | Search "hsl_adjust", add to chain | HSL controls appear with hue range sliders | [ ] |
| 67 | Saturation per hue | Adjust saturation for "Red" range | Only red colors in video change saturation | [ ] |
| 68 | Lightness per hue | Adjust lightness for "Blue" range | Only blue areas get lighter/darker | [ ] |
| 69 | Multiple ranges | Adjust several hue ranges at once | Each range independently affects its colors | [ ] |

#### Color Balance

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 70 | Add Color Balance | Search "color_balance", add to chain | Three-way color wheel controls appear | [ ] |
| 71 | Shadow color | Shift shadow color toward blue | Dark areas of image get a blue tint | [ ] |
| 72 | Highlight color | Shift highlight color toward warm/yellow | Bright areas get warmer | [ ] |
| 73 | Midtone color | Shift midtone color | Middle tones change color | [ ] |

#### Histogram & Auto-Levels

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 74 | Histogram display | Add "histogram" tool or look for histogram overlay | Real-time histogram showing luminance distribution | [ ] |
| 75 | Histogram updates | Change frame (scrub to different point) | Histogram redraws for new frame | [ ] |
| 76 | Auto-levels | Add "auto_levels" tool | Image auto-corrects — blacks get darker, whites get brighter | [ ] |

### 4.6 Destructive Effects (Spot-Check)

> You don't need to test all 63 registered effects. Test one from each major category:

| # | Category | Effect to Test | What to Look For | Result |
|---|----------|---------------|------------------|--------|
| 77 | color | hue_shift | Colors rotate around the wheel | [ ] |
| 78 | destruction | datamosh | Frame corruption/smearing artifacts | [ ] |
| 79 | temporal | stutter | Frames repeat/stutter during playback | [ ] |
| 80 | texture | vhs | VHS-style scan lines, color bleeding, noise | [ ] |
| 81 | distortion | wave_distort | Image warps/undulates | [ ] |
| 82 | glitch | pixelsort | Pixel rows/columns get sorted by brightness | [ ] |
| 83 | physics | pixel_liquify | Pixels appear to melt or flow | [ ] |
| 84 | enhance | solarize | Colors invert at certain brightness thresholds | [ ] |
| 85 | modulation | ring_mod | Visual ring modulation effect | [ ] |
| 86 | whimsy | kaleidoscope | Mirror/kaleidoscope pattern | [ ] |

---

## SECTION 5: Parameter UX (Phase 2A)

> Tests the knob/slider interaction quality.

### 5.1 Rotary Knobs

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 87 | Drag interaction | Click and drag up on a knob | Value increases smoothly | [ ] |
| 88 | Drag down | Drag down | Value decreases | [ ] |
| 89 | Scroll wheel | Hover over knob, scroll mouse wheel | Value changes in steps | [ ] |
| 90 | Keyboard arrows | Focus knob (click it), press Up/Down | Value changes by one step | [ ] |
| 91 | Shift+Arrow (fine) | Shift + Up/Down | Smaller step size | [ ] |
| 92 | Ctrl+Arrow (coarse) | Ctrl/Cmd + Up/Down | Larger step size | [ ] |
| 93 | Arc indicator | Look at the knob visual | Arc/ring around knob shows current value position | [ ] |

### 5.2 Parameter Scaling

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 94 | Linear param | Find a linear parameter (like hue_shift amount) | Dragging feels even across the range | [ ] |
| 95 | Log param | Find a log-scaled param (if any, like frequency) | More resolution at low end, less at high | [ ] |
| 96 | Value display | Look at the formatted value next to params | Shows correct units (%, Hz, ms, etc.) | [ ] |

### 5.3 Ghost Handle

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 97 | Ghost handle visible | Look for horizontal slider-style params | Ghost Handle thumb is visible and animated | [ ] |
| 98 | Drag ghost handle | Drag the handle left/right | Value changes, preview updates | [ ] |

---

## SECTION 6: Audio System (Phase 2B)

> Tests: audio playback synchronized with video.

### 6.1 Audio Playback

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 99 | Audio plays | Import a video that HAS audio. Press Space to play | You hear the audio through your speakers/headphones | [ ] |
| 100 | A/V sync | Watch and listen during playback | Audio and video are in sync (lips match, beats match) | [ ] |
| 101 | Audio pauses | Press Space to pause | Audio stops immediately (no tail/echo) | [ ] |
| 102 | Audio on seek | Scrub to a different position, play | Audio plays from the new position | [ ] |

### 6.2 Volume Control

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 103 | Volume slider | Find the volume control | Slider exists and is draggable | [ ] |
| 104 | Volume up/down | Drag volume slider | Audio gets louder/quieter | [ ] |
| 105 | Mute | Click the mute button (speaker icon) | Audio goes silent, icon changes to muted | [ ] |
| 106 | Unmute | Click mute button again | Audio returns at previous volume level | [ ] |
| 107 | Volume at 0 | Drag volume to 0 | Silent (same as mute) | [ ] |
| 108 | Volume at max | Drag volume to 100% | Maximum volume (no clipping/distortion in the slider itself) | [ ] |

### 6.3 Waveform Display

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 109 | Waveform visible | After importing video with audio, look at timeline | Waveform visualization is drawn on/near the track | [ ] |
| 110 | Waveform matches audio | Play and watch waveform | Peaks correspond to loud parts of audio | [ ] |

### 6.4 No-Audio Video

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 111 | Silent video | Import a video with NO audio track | App handles gracefully — no errors, no ghost waveform | [ ] |

---

## SECTION 7: Timeline & Multi-Track (Phase 4)

> Tests the DAW spine: tracks, clips, and timeline navigation.

### 7.1 Timeline UI

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 112 | Timeline visible | Look at bottom panel | Timeline with time ruler and track area is visible | [ ] |
| 113 | Time ruler | Look at the ruler above tracks | Shows time markings (seconds/frames) | [ ] |
| 114 | Playhead | Look for vertical line on timeline | Playhead is visible and shows current position | [ ] |
| 115 | Playhead moves | Press Play (Space) | Playhead moves across timeline during playback | [ ] |
| 116 | Click to seek | Click on the time ruler | Playhead jumps to that position, preview updates | [ ] |

### 7.2 Zoom & Scroll

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 117 | Zoom in | Use zoom controls or scroll gesture on timeline | Timeline zooms in (more detail, wider clips) | [ ] |
| 118 | Zoom out | Zoom out | Timeline compresses (less detail, narrower clips) | [ ] |
| 119 | Scroll | Scroll horizontally on timeline | Pans through the project length | [ ] |
| 120 | Zoom + scroll | Zoom in, then scroll | Can navigate to any part of the timeline | [ ] |

### 7.3 Tracks

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 121 | Default track | After import | At least one track exists with your video clip | [ ] |
| 122 | Add track | Find "add track" button | New empty track appears below existing tracks | [ ] |
| 123 | Track header | Look at track header | Shows track name and color | [ ] |
| 124 | Rename track | Double-click track name (or right-click rename) | Can type a new name | [ ] |
| 125 | Track color | Look for color indicator on track | Track has a color label | [ ] |
| 126 | Mute track | Click the mute button on a track | Track is grayed out, its contents don't render in preview | [ ] |
| 127 | Solo track | Click solo button on a track | Only this track renders, others are muted | [ ] |
| 128 | Delete track | Find delete option for a track | Track is removed (with confirmation if it has clips) | [ ] |

### 7.4 Track Opacity & Blend Modes

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 129 | Opacity slider | Find opacity control on track header | Slider exists (0-100%) | [ ] |
| 130 | Opacity at 50% | Set opacity to 50% on a track | Track content is semi-transparent in preview | [ ] |
| 131 | Blend mode dropdown | Find blend mode selector | Dropdown shows: normal, add, multiply, screen, overlay, difference, exclusion, darken, lighten | [ ] |
| 132 | Change blend mode | Select "multiply" | Preview shows multiply blend with content below | [ ] |
| 133 | Multiple tracks + blend | Have 2+ tracks with content, change blend modes | Blending is visible between tracks | [ ] |

### 7.5 Clips

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 134 | Clip visible | After importing video | A clip rectangle appears on the track | [ ] |
| 135 | Clip shows info | Look at the clip | Shows video name or thumbnail | [ ] |
| 136 | Move clip | Drag clip left/right on the track | Clip moves to new position in time | [ ] |
| 137 | Move clip between tracks | Drag clip from one track to another | Clip transfers to the other track | [ ] |
| 138 | Trim clip start | Drag the left edge of a clip | In-point changes (clip starts later) | [ ] |
| 139 | Trim clip end | Drag the right edge of a clip | Out-point changes (clip ends earlier) | [ ] |
| 140 | Split clip | Position playhead over a clip, use split command | Clip splits into two parts at the playhead | [ ] |
| 141 | Select clip | Click on a clip | Clip highlights (selected state) | [ ] |

### 7.6 Loop Region

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 142 | Set loop region | Find loop controls, set in/out points | Loop region is highlighted on the timeline | [ ] |
| 143 | Loop playback | Enable loop toggle, press Play | Playback loops between in and out points | [ ] |
| 144 | Disable loop | Toggle loop off | Playback continues past the loop region | [ ] |

### 7.7 Markers

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 145 | Add marker | Place playhead, add marker (Cmd+M or marker button) | Marker flag appears on the time ruler | [ ] |
| 146 | Multiple markers | Add markers at different positions | All markers visible on ruler | [ ] |
| 147 | Click marker | Click a marker flag | Playhead jumps to marker position | [ ] |
| 148 | Delete marker | Right-click or delete a marker | Marker is removed | [ ] |

### 7.8 Per-Track Effect Chains

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 149 | Select track | Click on Track 1 header | Effect rack shows Track 1's effects | [ ] |
| 150 | Add effect to Track 1 | Add "hue_shift" | Effect appears in rack, applies to Track 1 only | [ ] |
| 151 | Switch to Track 2 | Click on Track 2 header | Effect rack switches to Track 2's chain (empty or different) | [ ] |
| 152 | Add different effect to Track 2 | Add "vhs" to Track 2 | Track 2 has its own independent chain | [ ] |
| 153 | Preview shows both | With both tracks having clips + effects | Preview composites both tracks with their respective effects | [ ] |

---

## SECTION 8: Undo/Redo System (Phase 4)

> Tests: can you undo everything?

### 8.1 Basic Undo/Redo

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 154 | Undo after adding effect | Add an effect, then Cmd+Z | Effect is removed | [ ] |
| 155 | Redo | After undo, press Cmd+Shift+Z | Effect returns | [ ] |
| 156 | Multiple undos | Make 5 changes, then Cmd+Z five times | All 5 changes reversed in order | [ ] |
| 157 | Undo parameter change | Change a param slider, then Cmd+Z | Parameter returns to previous value | [ ] |

### 8.2 What Should Be Undoable

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 158 | Undo add effect | Add effect → Cmd+Z | Effect removed | [ ] |
| 159 | Undo remove effect | Remove effect → Cmd+Z | Effect comes back | [ ] |
| 160 | Undo effect reorder | Reorder effects → Cmd+Z | Order reverts | [ ] |
| 161 | Undo track add | Add track → Cmd+Z | Track removed | [ ] |
| 162 | Undo track delete | Delete track → Cmd+Z | Track restored with its clips/effects | [ ] |
| 163 | Undo clip move | Move clip → Cmd+Z | Clip returns to original position | [ ] |
| 164 | Undo clip trim | Trim clip → Cmd+Z | Trim reverts | [ ] |
| 165 | Undo clip split | Split clip → Cmd+Z | Clip merges back together | [ ] |
| 166 | Undo marker add | Add marker → Cmd+Z | Marker removed | [ ] |

### 8.3 History Panel

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 167 | History panel visible | Find the history panel (Photoshop-style list) | Panel shows list of past actions | [ ] |
| 168 | Actions listed | Make several changes | Each action appears as a labeled entry | [ ] |
| 169 | Click to jump | Click an older entry in history | State jumps back to that point | [ ] |
| 170 | Future actions grayed | After jumping back, look at entries below | Later entries appear grayed/faded | [ ] |
| 171 | New action clears future | After jumping back, make a new change | Forward history is discarded, new action is the latest | [ ] |

---

## SECTION 9: Project Save/Load (Phase 4)

> Tests: can you save and restore your work?

### 9.1 Save Project

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 172 | Save | Press Cmd+S | Save dialog appears, asking for .glitch file location | [ ] |
| 173 | File created | Save to Desktop or known location | `.glitch` file appears in Finder | [ ] |
| 174 | File is JSON | Open the .glitch file in a text editor | Valid JSON structure (readable, has "version", "assets", "timeline") | [ ] |

### 9.2 Load Project

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 175 | Load project | Press Cmd+O (there is no File menu — use keyboard shortcut), select your .glitch file | Project loads | [ ] |
| 176 | Assets restored | After load | All video assets are present in asset panel | [ ] |
| 177 | Timeline restored | After load | All tracks, clips, and positions match what you saved | [ ] |
| 178 | Effects restored | After load | Effect chains are intact with correct parameter values | [ ] |
| 179 | Preview works | After load, scrub or play | Preview renders correctly with all effects | [ ] |

### 9.3 New Project

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 180 | New project | Press Cmd+N (there is no File menu — use keyboard shortcut) | Everything clears — no assets, no tracks, no effects | [ ] |
| 181 | Title changes | After new project | Window title shows "Untitled" | [ ] |

### 9.4 Save/Load Edge Cases

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 182 | Save without video | Create empty project, Cmd+S | Can save an empty project without error | [ ] |
| 183 | Load missing video | COPY (not move) your video to a temp location, delete the copy, then load the .glitch project | Graceful error message (not a crash) — tells you the asset is missing | [ ] |
| 184 | Overwrite save | Save to same filename twice | File is updated, no error | [ ] |

---

## SECTION 10: Export (Phase 1)

> Tests: can you render your work to a video file?

### 10.1 Export Dialog

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 185 | Open export | Click the Export button in the status bar (there is NO Cmd+E shortcut) | Export dialog appears | [ ] |
| 186 | Codec selector | Look at dialog | Can choose codec (H.264 at minimum) | [ ] |
| 187 | Resolution options | Look at dialog | Can choose resolution (original or custom) | [ ] |
| 188 | Output path | Look at dialog | Can choose where to save the exported file | [ ] |

### 10.2 Export Process

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 189 | Start export | Click Export/Render button | Progress indicator appears | [ ] |
| 190 | Progress updates | Watch during export | Progress percentage increases (not stuck) | [ ] |
| 191 | Export completes | Wait for 100% | Success message appears | [ ] |
| 192 | Output file exists | Check the output location | Exported video file is there | [ ] |
| 193 | Play exported video | Open exported file in QuickTime/VLC | Video plays with effects baked in. NOTE: export is VIDEO-ONLY (no audio re-encoding) — silence is expected | [ ] |

### 10.3 Export with Effects

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 194 | Effects in export | Add 2-3 effects, then export | Exported video shows all effects applied | [ ] |
| 195 | Matches preview | Compare exported video to what you saw in preview | Should look the same (seeded determinism) | [ ] |

### 10.4 Cancel Export

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 196 | Cancel mid-export | Start export, click Cancel before completion | Export stops, partial file may or may not be cleaned up | [ ] |
| 197 | App ok after cancel | After canceling | App is still responsive, can start new export | [ ] |

---

## SECTION 11: Panel Layout & UX (Cross-Phase)

> Tests: do panels resize, collapse, and persist?

### 11.1 Panel Resizing

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 198 | Drag divider | Drag the divider between browser and preview | Panels resize | [ ] |
| 199 | Drag timeline divider | Drag the top edge of the timeline area | Timeline gets taller/shorter | [ ] |
| 200 | Double-click divider | Double-click a panel divider | Resets to default proportions | [ ] |
| 201 | Collapse panel | Click a panel header to collapse | Panel collapses to just its header | [ ] |
| 202 | Expand panel | Click collapsed header again | Panel expands back | [ ] |

### 11.2 System Meters

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 203 | CPU meter | Look at toolbar | CPU usage bar/percentage shown | [ ] |
| 204 | RAM meter | Look at toolbar | RAM usage shown | [ ] |
| 205 | Frame time | Look at toolbar | Frame render time shown (green = fast) | [ ] |
| 206 | Meters update | Play video with effects | Meters change as load increases | [ ] |

---

## SECTION 12: Keyboard Shortcuts (Cross-Phase)

> Verify all documented shortcuts work.

| # | Shortcut | Action | Expected | Result |
|---|----------|--------|----------|--------|
| 207 | Space | Play/Pause | Toggles playback | [ ] |
| 208 | Escape | Stop | Stops and resets playhead | [ ] |
| 209 | Cmd+Z | Undo | Reverses last action | [ ] |
| 210 | Cmd+Shift+Z | Redo | Reapplies undone action | [ ] |
| 211 | Cmd+S | Save | Opens save dialog / saves | [ ] |
| 212 | Cmd+O | Open project | Opens file dialog for .glitch files | [ ] |
| 213 | Cmd+= | Zoom canvas in | Canvas zooms in | [ ] |
| 214 | Cmd+- | Zoom canvas out | Canvas zooms out | [ ] |
| 215 | Cmd+0 | Fit canvas | Canvas fits to window | [ ] |
| 216 | `\` (hold) | Before/after | Shows original while held | [ ] |
| 284 | A | Toggle automation | Toggles automation lane visibility on selected track | [ ] |

---

## SECTION 13: Performance Mode & Pads (Phase 5)

> Verify the performance mode drum rack, pad triggers, and ADSR modulation.

### 13.1 Performance Mode Toggle

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 285 | Enter perform mode | Click the Performance Mode button (or shortcut) | UI switches to pad grid layout, effect rack stays visible | [ ] |
| 286 | Exit perform mode | Click the Performance Mode button again | UI returns to standard timeline layout | [ ] |
| 287 | Mode persists across playback | Enter perform mode, press Space to play | Playback works normally in perform mode | [ ] |

### 13.2 Pad Grid & Triggers

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 288 | Pad grid visible | Enter perform mode | 4x4 pad grid appears with color-coded pads | [ ] |
| 289 | Click pad triggers | Click a pad | Pad lights up, associated effect/clip triggers | [ ] |
| 290 | Keyboard trigger | Press mapped key (e.g., Q/W/E/R row) | Corresponding pad triggers | [ ] |
| 291 | Velocity sensitivity | Click pad near edge vs center (if implemented) | Velocity varies with click position | [ ] |
| 292 | Pad release | Press and release a pad | Pad deactivates on release (momentary behavior) | [ ] |

### 13.3 ADSR Envelope on Pads

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 293 | ADSR controls visible | Select a pad | Attack, Decay, Sustain, Release knobs appear | [ ] |
| 294 | Attack ramp | Set Attack to max, trigger pad | Effect fades in slowly over attack time | [ ] |
| 295 | Release tail | Set Release to max, release pad | Effect fades out slowly after release | [ ] |
| 296 | Zero attack | Set Attack to 0, trigger pad | Effect applies instantly (no ramp) | [ ] |
| 297 | ADSR persists | Adjust ADSR values, save project, reload | ADSR values restored correctly | [ ] |

### 13.4 Pad Modulation

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 298 | Pad modulates param | Map a pad to an effect parameter | Triggering pad modulates the mapped parameter via ADSR | [ ] |
| 299 | Multiple pad mappings | Map 2 pads to different params on same effect | Both modulate independently when triggered | [ ] |
| 300 | Pad mod + knob | Trigger a pad while manually moving its mapped knob | Both inputs combine — pad modulation offsets the knob value | [ ] |

---

## SECTION 14: Operators & Modulation Sources (Phase 6A)

> Verify all operator types generate signals and can be mapped to effect parameters.

### 14.1 LFO Operator

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 301 | Add LFO | Click "Add Operator" → LFO | LFO card appears with pink left border | [ ] |
| 302 | LFO waveforms | Cycle through waveforms: sine, triangle, square, saw, random | Signal bar changes shape for each waveform | [ ] |
| 303 | LFO rate control | Adjust rate knob | Signal speed changes (faster/slower oscillation) | [ ] |
| 304 | LFO phase offset | Adjust phase knob | Signal shifts start position | [ ] |
| 305 | LFO signal bar | Observe signal bar during playback | Bar animates showing real-time signal value | [ ] |

### 14.2 Envelope Follower

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 306 | Add Envelope | Click "Add Operator" → Envelope | Envelope card appears | [ ] |
| 307 | Attack/Release | Adjust attack/release knobs | Envelope shape changes (fast attack = snappy, slow = smooth) | [ ] |
| 308 | Trigger behavior | Trigger envelope (via playback or pad) | Signal ramps up then decays per ADSR settings | [ ] |

### 14.3 Step Sequencer

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 309 | Add Step Seq | Click "Add Operator" → Step Sequencer | Step sequencer card appears with step grid | [ ] |
| 310 | Edit steps | Click individual steps to set values | Steps visually update, signal bar reflects pattern | [ ] |
| 311 | Step count | Adjust step count (e.g., 8, 16, 32) | Grid resizes, pattern plays with new length | [ ] |
| 312 | Step rate sync | Adjust rate/speed | Steps advance faster or slower | [ ] |

### 14.4 Audio Follower

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 313 | Add Audio Follower | Click "Add Operator" → Audio Follower | Audio follower card appears | [ ] |
| 314 | Follows audio | Play a clip with audio, observe signal bar | Signal tracks audio amplitude in real-time | [ ] |
| 315 | Sensitivity control | Adjust sensitivity/smoothing knobs | Signal response changes (more/less reactive) | [ ] |

### 14.5 Video Analyzer

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 316 | Add Video Analyzer | Click "Add Operator" → Video Analyzer | Card appears with pink left border | [ ] |
| 317 | Method dropdown | Click method dropdown | 5 options: luminance, motion, color, edges, histogram_peak | [ ] |
| 318 | Luminance analysis | Select Luminance, play video | Signal bar tracks frame brightness | [ ] |
| 319 | Motion analysis | Select Motion, play video with movement | Signal spikes on motion frames | [ ] |
| 320 | Hint text | Check card UI | "Analyzes 64×64 proxy of current frame" hint visible | [ ] |

### 14.6 Fusion Operator

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 321 | Add Fusion | Click "Add Operator" → Fusion | Card appears with cyan left border | [ ] |
| 322 | Add sources | Use "Add source..." dropdown | Dropdown shows other operators (NOT self) | [ ] |
| 323 | Two LFO sources | Add 2 LFOs as sources to Fusion | Weight sliders appear for each (default 1.0) | [ ] |
| 324 | Blend modes | Change blend mode | Output signal changes character | [ ] |
| 325 | Weight adjustment | Adjust a weight slider | Weight value updates in real-time | [ ] |
| 326 | Remove source | Click remove on a source | Row disappears from source list | [ ] |
| 327 | No self-reference | Check "Add source..." dropdown | Fusion itself is NOT listed as a source option | [ ] |
| 328 | No duplicate sources | Add LFO-1, check dropdown again | LFO-1 is no longer available as an option | [ ] |
| 329 | Empty state | Remove all sources | Empty-state hint appears | [ ] |

### 14.7 Operator Lifecycle

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 330 | Disable operator | Click disable/bypass on an operator | Operator card dims, signal stops, mappings inactive | [ ] |
| 331 | Re-enable operator | Click enable | Operator resumes, mappings active again | [ ] |
| 332 | Delete operator | Click delete on an operator | Card removed, all mappings for that operator removed | [ ] |
| 333 | Undo delete | Cmd+Z after deleting operator | Operator and its mappings restored | [ ] |

---

## SECTION 15: Modulation Matrix & Ghost Handles (Phase 6B)

> Verify the modulation routing system, ghost handles, and visual feedback.

### 15.1 Modulation Matrix

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 334 | Matrix empty state | Open matrix with no operators or effects | Shows "Add operators and effects..." hint message | [ ] |
| 335 | Matrix grid appears | Add 1 operator + 1 effect | Grid appears with operator rows × param columns | [ ] |
| 336 | Create routing | Click a cell in the matrix grid | Depth slider appears (default 0%) | [ ] |
| 337 | Adjust depth | Drag depth slider to 75% | Depth value updates, modulation strength changes | [ ] |
| 338 | Remove routing | Click × button on an active routing | Routing removed, cell returns to empty | [ ] |
| 339 | Signal bars animate | Play with active operators | Per-operator signal bars animate in matrix rows | [ ] |
| 340 | Sticky headers | Scroll a large matrix (many operators + params) | Row/column headers remain visible | [ ] |

### 15.2 Ghost Handles

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 341 | Ghost arc visible | Map LFO to hue_shift.amount, play | Ghost arc appears on the knob at 30% opacity | [ ] |
| 342 | Ghost color | Inspect ghost arc | Green color (#4ade80 or similar) | [ ] |
| 343 | Ghost tracks modulation | Observe ghost during playback | Ghost arc moves with LFO signal | [ ] |
| 344 | Increase depth | Increase depth to 100% | Ghost arc extends further from base position | [ ] |
| 345 | Zero depth | Set depth to 0% | Ghost arc disappears | [ ] |
| 346 | Drag knob with ghost | Manually drag the modulated knob | Base moves, ghost position reflects base + modulation | [ ] |
| 347 | Switch effects | Click a different effect in the rack | Ghost handles update to show new effect's modulations | [ ] |
| 348 | Multiple operators | Map 2 operators to same param | Ghost reflects combined (additive) modulation | [ ] |

### 15.3 Routing Lines

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 349 | Lines visible | Create a routing (operator → param) | SVG line visible between operator card and param area | [ ] |
| 350 | Line color | Inspect routing line | Color matches operator type color | [ ] |
| 351 | Line opacity pulses | Play with active modulation | Line opacity pulses with signal strength | [ ] |
| 352 | Line thickness | Compare low-depth vs high-depth routing | Higher depth = thicker line | [ ] |
| 353 | Disable operator | Disable a routed operator | Lines disappear | [ ] |
| 354 | Re-enable operator | Enable it again | Lines reappear | [ ] |

### 15.4 Modulation Persistence

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 355 | Save complex setup | Create 3 operators, 5 routings, Cmd+S | Project saves without error | [ ] |
| 356 | Load complex setup | Close app, reopen, load the project | All operators, routings, depths restored | [ ] |
| 357 | Undo routing | Create a routing, Cmd+Z | Routing removed | [ ] |
| 358 | Undo operator delete | Delete operator (removes routings), Cmd+Z | Operator AND routings restored | [ ] |
| 359 | New project clears | Cmd+N | All operators and routings cleared | [ ] |

---

## SECTION 16: Automation (Phase 7)

> Verify automation lanes, nodes, recording modes, signal stack, and persistence.

### 16.1 Automation Lane Basics

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 360 | Add automation lane | Select a track with effects → add automation lane for a param | Lane overlay appears on the track in timeline | [ ] |
| 361 | Lane color | Inspect the automation lane | Lane has a visible color (user-assigned or default) | [ ] |
| 362 | Lane visibility toggle | Toggle lane visibility off | Lane overlay disappears from track | [ ] |
| 363 | Lane visibility on | Toggle lane visibility back on | Lane overlay reappears | [ ] |
| 364 | Multiple lanes | Add 2 automation lanes on same track (different params) | Both lanes visible as overlays, distinguishable by color | [ ] |
| 365 | Remove lane | Delete an automation lane | Lane removed from track, no orphan data | [ ] |

### 16.2 Automation Nodes (Points)

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 366 | Click to add node | Click on the automation lane line | Node (circle) appears at click position | [ ] |
| 367 | Add 3 nodes | Click at 3 different positions | 3 nodes appear, connected by line segments | [ ] |
| 368 | Drag node | Click and drag a node | Node moves — X = time, Y = value | [ ] |
| 369 | Shift+drag precision | Hold Shift while dragging a node | Node moves 10x slower (fine-tuning) | [ ] |
| 370 | Alt+click cycle curve | Alt+click a node | Curve type cycles: linear → ease-in → ease-out → S-curve | [ ] |
| 371 | Delete node | Select node, press Delete (or right-click → delete) | Node removed, adjacent segments reconnect | [ ] |
| 372 | Node tooltip | Hover over a node | Tooltip shows value@time (e.g., "0.75 @ 2.5s") | [ ] |
| 373 | Node at boundaries | Drag node to time=0 and to end of track | Node clamps to valid time range | [ ] |

### 16.3 Curve Segments

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 374 | Linear segment | Two nodes with linear curve | Straight line between them | [ ] |
| 375 | Ease-in segment | Alt+click to set ease-in | Curve bows inward (slow start, fast end) | [ ] |
| 376 | Ease-out segment | Alt+click to set ease-out | Curve bows outward (fast start, slow end) | [ ] |
| 377 | Zoom affects curves | Zoom in on timeline | Curves rescale correctly with zoom | [ ] |
| 378 | Scroll affects curves | Scroll timeline horizontally | Curves reposition correctly | [ ] |

### 16.4 Automation Toolbar

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 379 | Toolbar visible | Look in the timeline area | Automation toolbar with mode buttons (R/L/T/D) visible | [ ] |
| 380 | Read mode (default) | Check initial state | Read mode (R) is active by default | [ ] |
| 381 | Switch to Latch | Click L button | Latch mode activates, R deactivates | [ ] |
| 382 | Switch to Touch | Click T button | Touch mode activates | [ ] |
| 383 | Switch to Draw | Click D button | Draw mode activates, cursor changes to crosshair | [ ] |
| 384 | Simplify button | Add many nodes, click Simplify | Point count reduces, shape approximately preserved | [ ] |
| 385 | Clear button | Click Clear on a lane with nodes | All nodes removed, lane still exists (empty) | [ ] |
| 386 | Armed track display | Arm a track, check toolbar | Armed track name shown in toolbar | [ ] |

### 16.5 Arm / Disarm Track

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 387 | Arm button on track | Click "A" button on track header | Button highlights, track is armed for automation recording | [ ] |
| 388 | Disarm track | Click "A" again | Button de-highlights, track disarmed | [ ] |
| 389 | Only one armed | Arm Track 1, then arm Track 2 | Track 1 disarms, only Track 2 armed | [ ] |

### 16.6 Latch Mode Recording

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 390 | Latch records knob | Set Latch mode, arm track, play, move a mapped knob | Automation points written at playhead positions | [ ] |
| 391 | Points appear on lane | After recording, stop playback | Recorded nodes visible on the automation lane | [ ] |
| 392 | Auto-simplify on stop | Record many points, stop | RDP simplification runs — point count reduced from raw recording | [ ] |
| 393 | Latch overwrites | Play again in latch, move knob in same region | New values overwrite old automation in that region | [ ] |

### 16.7 Touch Mode Recording

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 394 | Touch records while held | Set Touch mode, arm track, play, hold knob and move | Points recorded only while knob is being held | [ ] |
| 395 | Release snaps back | Release the knob | Value returns to existing automation curve | [ ] |
| 396 | Touch auto-simplify | Record, release | Recorded segment simplified via RDP | [ ] |

### 16.8 Draw Mode

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 397 | Draw cursor | Switch to Draw mode | Cursor changes to crosshair/pencil over automation lanes | [ ] |
| 398 | Freehand draw | Click and drag across a lane | Points painted along mouse path | [ ] |
| 399 | Draw auto-simplify | Release after drawing | Stroke auto-simplified (fewer points, shape preserved) | [ ] |
| 400 | Draw overwrites | Draw over existing automation | New points replace old in the drawn region | [ ] |

### 16.9 Playback — Automation Applies

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 401 | Param changes during playback | Add 3 nodes at different values, play | Parameter visibly changes at node positions during playback | [ ] |
| 402 | Knob reflects automation | Watch the knob during playback | Knob position updates to match automated value | [ ] |
| 403 | Before first node | Position playhead before first automation node | Param uses first node's value (clamp to first) | [ ] |
| 404 | After last node | Position playhead after last automation node | Param uses last node's value (clamp to last) | [ ] |
| 405 | No automation data | Lane exists but empty | Original param value passes through (no override) | [ ] |

### 16.10 Signal Stack (Automation + Modulation)

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 406 | Automation replaces | Add LFO mod + automation on same param, play | Automation VALUE replaces (not adds to) the modulated value | [ ] |
| 407 | Ghost shows final value | Inspect ghost handle during playback | Ghost reflects automation override (not just modulation) | [ ] |
| 408 | Signal order correct | Base=50, LFO mod=+20, automation=80 at time T | At time T: param = 80 (automation replaces base+mod) | [ ] |
| 409 | No auto data = mod passes | At a time with no automation nodes | Param = base + modulation (mod passes through) | [ ] |
| 410 | Clamp after automation | Automation value exceeds param max | Value clamped to param max (not exceeding bounds) | [ ] |

### 16.11 Automation Persistence

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 411 | Save with automation | Create lanes + nodes, Cmd+S | Project saves without error | [ ] |
| 412 | Load with automation | Close, reopen, load project | All automation lanes, nodes, curves restored exactly | [ ] |
| 413 | Backward compat | Load a project saved BEFORE Phase 7 (no automation data) | Project loads, automation is empty (no crash) | [ ] |
| 414 | Undo automation edit | Add a node, Cmd+Z | Node removed | [ ] |
| 415 | Redo automation edit | Cmd+Shift+Z after undo | Node reappears | [ ] |
| 416 | New project clears | Cmd+N | All automation lanes and nodes cleared | [ ] |

### 16.12 Copy/Paste Automation

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 417 | Copy region | Select time region on automation lane, Cmd+C | Points in region copied to automation clipboard | [ ] |
| 418 | Paste at playhead | Position playhead at new time, Cmd+V | Copied points pasted at playhead position (time-shifted) | [ ] |
| 419 | Paste preserves shape | Paste, compare to original | Shape/values match, only time offset differs | [ ] |

---

## SECTION 17: Stress Testing & Edge Cases (Cross-Phase)

> The chaos section — try to break things.

### 17.1 Rapid Input

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 217 | Rapid play/pause | Press Space rapidly (10+ times fast) | App doesn't crash or lock up | [ ] |
| 218 | Rapid effect add/remove | Add and remove effects quickly | No crashes, rack stays consistent | [ ] |
| 219 | Rapid scrubbing | Click rapidly across timeline | Preview updates, no hang | [ ] |
| 220 | Rapid undo/redo | Mash Cmd+Z and Cmd+Shift+Z rapidly | History navigates without crash | [ ] |

### 17.2 State Integrity

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 221 | Play then add effect | While playing, add an effect | Effect applies without stopping playback (or gracefully pauses) | [ ] |
| 222 | Scrub with effects | Have 5+ effects, scrub through timeline | Each frame renders all effects (may be slow but shouldn't crash) | [ ] |
| 223 | Full chain + export | 10 effects applied, export the video | Export succeeds with all 10 effects | [ ] |
| 224 | Import during playback | While playing, try to import another video | Handles gracefully (pauses or queues) | [ ] |

### 17.3 Boundary Tests

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 225 | Zero-length video | If possible, try a very short (< 1 second) video | App handles it or shows helpful error | [ ] |
| 226 | Large video | Try a large video (1080p, 1+ minute) | Import works (may be slow), preview works | [ ] |
| 227 | Param at min | Set a parameter to its minimum value | Preview renders without crash | [ ] |
| 228 | Param at max | Set a parameter to its maximum value | Preview renders without crash | [ ] |
| 229 | Empty project export | Try to export with no video loaded | Error message (not crash) | [ ] |

### 17.4 Recovery

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 230 | Engine crash recovery | Kill the Python process from Activity Monitor | Watchdog restarts it, app recovers | [ ] |
| 231 | Unsaved work lost | Make changes, close the app WITHOUT saving, reopen | **KNOWN GAP:** No dirty-state prompt exists. Unsaved work IS lost. Verify the app at least shows a dirty indicator (e.g., `*` in title bar) so you know you have unsaved changes | [ ] |

---

## SECTION 18: Integration Tests (Cross-Feature Flows)

> These test that features work TOGETHER, not just individually.

### 18.1 Full Journey: Import → Effects → Export

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 232 | End-to-end flow | 1. Import video 2. Add 3 effects 3. Adjust params 4. Scrub preview 5. Export | Exported video has all 3 effects baked in correctly | [ ] |

### 18.2 Save/Load Round-Trip

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 233 | Full round-trip | 1. Import video 2. Add effects + adjust params 3. Add markers 4. Adjust track opacity 5. Save 6. Close app 7. Reopen 8. Load project | Everything is exactly as you left it | [ ] |

### 18.3 Multi-Track Composition

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 234 | Two-track composite | 1. Import video to Track 1 2. Add Track 2, drag same video 3. Add hue_shift to Track 1 4. Add vhs to Track 2 5. Set Track 2 opacity to 50% 6. Set Track 2 blend to "screen" 7. Play | Preview shows blended composite of both tracks with different effects | [ ] |

### 18.4 Color Suite + Effects Combo

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 235 | Color + glitch | 1. Add "curves" (util tool) 2. Make an S-curve 3. Add "datamosh" (destructive effect) 4. Add "vhs" 5. Preview | All three stack correctly — color graded + glitched + VHS | [ ] |

### 18.5 Undo Across Features

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 236 | Cross-feature undo | 1. Add effect 2. Move a clip 3. Add a marker 4. Change track opacity 5. Undo all 4 steps | Each undo reverses the correct action in reverse order | [ ] |

### 18.6 Audio + Video + Effects

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 237 | Full A/V chain | 1. Import video WITH audio 2. Add 3 visual effects 3. Play | Audio plays in sync with effected video | [ ] |
| 238 | Audio unaffected | After adding visual effects | Audio sounds the same (visual effects don't corrupt audio) | [ ] |

---

## SECTION 19: Missing Interactions (Power User Pass)

> Tests for interactions found in the actual code but missing from the original guide.

### 19.1 Knob & Slider Advanced Interactions

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 239 | Knob double-click | Double-click a rotary knob | Inline number input opens (same as clicking the number display) | [ ] |
| 240 | Knob right-click reset | Right-click a rotary knob | Value resets to its default | [ ] |
| 241 | Slider right-click reset | Right-click a horizontal slider | Value resets to its default | [ ] |
| 242 | Slider double-click | Double-click the slider value display | Inline number input opens | [ ] |
| 243 | Number input Escape | Open number input on a knob, type a value, press Escape | Edit is CANCELLED — value stays at original (not confirmed) | [ ] |
| 244 | Number input invalid text | Open number input, type "abc", press Enter | Value stays at previous (doesn't become NaN or crash) | [ ] |
| 245 | Knob at min boundary | Hold Down arrow until param hits its minimum | Value clamps at minimum, doesn't go below or wrap | [ ] |
| 246 | Knob at max boundary | Hold Up arrow until param hits its maximum | Value clamps at maximum, doesn't go above or wrap | [ ] |

### 19.2 Missing Keyboard Shortcuts

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 247 | Cmd+O open project | Press Cmd+O | File dialog opens filtered to .glitch files | [ ] |
| 248 | Cmd+N new project | Press Cmd+N | Project clears (same as test #180) | [ ] |
| 249 | Cmd+Shift+K split clip | Select a clip, position playhead over it, press Cmd+Shift+K | Clip splits at playhead position | [ ] |
| 250 | I key loop-in | Press I with playhead at 2 seconds | Loop region in-point set to 2 seconds | [ ] |
| 251 | O key loop-out | Press O with playhead at 5 seconds | Loop region out-point set to 5 seconds | [ ] |
| 252 | Cmd+M add marker | Press Cmd+M at current playhead position | Marker appears on ruler at that position | [ ] |
| 253 | Shortcuts in text input | Click into a number input field, then press Space | Space types into the field (does NOT trigger play/pause) | [ ] |

### 19.3 Waveform & Timeline Interactions

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 254 | Waveform click to seek | Click on the waveform display at a specific position | Audio seeks to that position (playhead moves too) | [ ] |
| 255 | Playhead drag | Drag the playhead head left/right on timeline | Playhead moves, preview updates in real-time as you drag | [ ] |
| 256 | Timeline resize handle | Drag the top edge of the timeline panel up/down | Timeline gets taller/shorter (min 120px, max ~50% window) | [ ] |
| 257 | Marker right-click delete | Right-click a marker flag on the time ruler | Context menu appears or marker is deleted directly | [ ] |

### 19.4 File Path & Format Edge Cases

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 258 | Unicode file path | Copy test video to a folder with spaces (e.g., `~/Desktop/My Videos/test file.mp4`), import it | Imports successfully — path handling doesn't break | [ ] |
| 259 | Special chars in path | Copy video with parentheses in name (e.g., `test (1).mp4`) and import | Imports successfully | [ ] |
| 260 | AVI format | Import an .avi file | Accepted and ingested (backend supports .avi) | [ ] |
| 261 | WebM format | Import a .webm file | Accepted and ingested (backend supports .webm) | [ ] |
| 262 | MKV format | Import an .mkv file | Accepted and ingested (backend supports .mkv) | [ ] |

### 19.5 Import & Ingest Guards

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 263 | Drop during ingest | Start importing a video, then immediately drag-drop another | Second drop is rejected or queued — drop zone should be disabled during ingest | [ ] |
| 264 | 500MB file limit | Try to import a video file larger than 500MB | Backend rejects with a file-too-large error (SEC-5) | [ ] |

### 19.6 Effect Browser States

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 265 | Search no results | Type "zzzzzznotaneffect" in effect search | Shows "No effects found" message (not blank) | [ ] |
| 266 | Category filter + search | Select a category, then type in search | Results filter by BOTH category AND search text | [ ] |
| 267 | Effect disabled state | With 10 effects in chain, look at browser | Effect list items are disabled/unclickable (max chain reached) | [ ] |

### 19.7 Preview Error States

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 268 | Preview retry button | If preview shows error state, click the Retry button | Preview re-renders the current frame | [ ] |
| 269 | Preview empty state | Open app with no video loaded | Preview shows "No video loaded" message (not blank/broken) | [ ] |

### 19.8 Export Edge Cases

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 270 | Export dialog dismiss | Click the dark overlay area behind the export dialog | Dialog closes (click-outside-to-dismiss) | [ ] |
| 271 | Export with all effects bypassed | Add 3 effects, bypass all of them, export | Export produces video with no effects (original video) | [ ] |
| 272 | Custom resolution bounds | In export dialog, try typing 0 or 99999 in width/height | Values are clamped (min 1, max 7680) — no crash | [ ] |
| 273 | Cancel save path | Click Export, then cancel the save dialog | Returns to export dialog or main app without error | [ ] |

### 19.9 Save/Load Persistence

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 274 | Re-save after edits | Save → add another effect → Cmd+S again (same file) → close → reopen → load | The NEW changes are present (not the old state) | [ ] |
| 275 | Load missing asset | Save a project. COPY your video elsewhere. Delete the copy. Load the .glitch file | Graceful error about missing asset — app doesn't crash | [ ] |

### 19.10 Engine Resilience

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 276 | Engine crash mid-render | Add 5 effects, start scrubbing rapidly, kill Python process from Activity Monitor | Watchdog restarts engine, preview recovers after reconnect | [ ] |
| 277 | Engine crash mid-export | Start export, kill Python process | Export fails with error message (not hang), app stays responsive | [ ] |

---

## SECTION 20: Red Team / Security (QA-RedTeam Pass)

> Try to break the app intentionally. These test security gates and abuse paths.

### 20.1 Backend Security Gates

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 278 | Symlink rejection | Create a symlink to a video file (`ln -s real.mp4 link.mp4`), try to import the symlink | Rejected: "Symlinks are not allowed" | [ ] |
| 279 | Max frame count | Try to import a very long video (>2.7 hours at 30fps = 300K+ frames) | Rejected with SEC-6 error about exceeding max frame count | [ ] |
| 280 | Effect timeout | Add an effect that's computationally expensive (e.g., multiple physics effects stacked), scrub | If an effect takes >500ms, it should be skipped (returns input unchanged) — no hang | [ ] |
| 281 | Effect auto-disable | If you can trigger 3 consecutive failures on the same effect (e.g., edge case params) | Effect auto-disables after 3 failures. Check via observing it no longer applies | [ ] |

### 20.2 Context Isolation

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 282 | No Node in renderer | Open DevTools (if accessible), type `require('fs')` in console | Should fail — Node.js is not available in renderer (context isolation) | [ ] |
| 283 | No navigation | Open DevTools, try `window.location = 'https://example.com'` | Navigation blocked — window stays on app | [ ] |

---

## SECTION 21: Known Gaps & Expected Failures

> These are features that are designed but NOT fully wired. If you hit these, mark [N/A] and note them — they're not bugs, they're TODOs.

| Feature | Status | What You'll See |
|---------|--------|-----------------|
| Menu bar (File/Edit/View) | NOT BUILT | No menu bar — all interactions via buttons + keyboard shortcuts |
| Dirty state prompt on close | NOT BUILT | Closing app loses unsaved work without warning |
| Auto-save | PARTIALLY WIRED | May not work — depends on `file:write` IPC handler which may be missing |
| Audio in export | NOT BUILT | Exports are video-only (H.264), no audio re-encoding |
| Cmd+E (export shortcut) | NOT BUILT | No keyboard shortcut for export — use the button |
| Track rename | MAY NOT BE WIRED | TrackHeader may not have inline rename UI |
| Track delete | MAY NOT BE WIRED | May require a specific interaction (not just a button) |
| Track reorder | MAY NOT BE WIRED | Drag-to-reorder tracks may not have UI yet |

---

## SECTION 22: Bug Report Template

When you find something broken, record it with this format:

```
### BUG: [Short title]
- **Section:** [Which section above]
- **Test #:** [Test number]
- **Steps to reproduce:**
  1. ...
  2. ...
  3. ...
- **Expected:** What should happen
- **Actual:** What actually happened
- **Severity:** P0 (crash/data loss) / P1 (broken feature) / P2 (cosmetic/minor)
- **Screenshot:** [if applicable]
```

---

## Scoring

| Section | Tests | Passed | Failed | N/A | Notes |
|---------|-------|--------|--------|-----|-------|
| 1. App Launch | 9 | | | | |
| 2. Video Import | 10 | | | | |
| 3. Preview Canvas | 10 | | | | |
| 4. Effect System | 57 | | | | Phase 1 + Phase 3 Color Suite |
| 5. Parameter UX | 12 | | | | |
| 6. Audio System | 13 | | | | |
| 7. Timeline & Tracks | 42 | | | | |
| 8. Undo/Redo | 18 | | | | |
| 9. Project Save/Load | 13 | | | | |
| 10. Export | 13 | | | | |
| 11. Panel Layout | 9 | | | | |
| 12. Keyboard Shortcuts | 11 | | | | +A key (automation) |
| 13. Performance Mode & Pads | 16 | | | | Phase 5 |
| 14. Operators & Modulation | 33 | | | | Phase 6A — LFO, Envelope, StepSeq, AudioFollower, VideoAnalyzer, Fusion |
| 15. Mod Matrix & Ghost Handles | 26 | | | | Phase 6B — matrix, ghosts, routing lines, persistence |
| 16. Automation | 60 | | | | Phase 7 — lanes, nodes, modes, recording, signal stack, persistence |
| 17. Stress Testing | 15 | | | | |
| 18. Integration Tests | 7 | | | | |
| 19. Missing Interactions | 39 | | | | Knobs, sliders, waveform, timeline, edge cases |
| 20. Red Team / Security | 6 | | | | Security gates, context isolation |
| 21. Known Gaps | — | | | | Informational only (no pass/fail) |
| **TOTAL** | **419** | | | | |

### Verdict Criteria

- **GO:** 0 P0 bugs, fewer than 3 P1 bugs, all integration tests pass
- **CONDITIONAL GO:** 0 P0 bugs, P1 bugs have workarounds, most integration tests pass
- **NO GO:** Any P0 bug, or 5+ P1 bugs, or integration tests failing

---

## What's NOT Tested Here (Future Phases)

These features are **not yet built** — do NOT test them:

- ProRes / H.265 export codecs (Phase 11)
- Automation grouping across params (Phase 11)
- Per-node velocity/tension (post-launch)
- Automation on operator params (post-launch)

---

## Section 23: Phase 10 — Freeze/Flatten + Preset Library (2026-03-15)

### 23.1 Effect Freeze

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 1 | Freeze single effect | Add effect, click freeze icon | Freeze indicator shows, effect renders from cache | [ ] |
| 2 | Unfreeze effect | Freeze then unfreeze | Effect renders live again | [ ] |
| 3 | Freeze chain prefix | Add 3 effects, freeze first 2 | First 2 frozen, 3rd renders live on top | [ ] |
| 4 | Edit frozen effect param | Change param on frozen effect | Warning or auto-unfreeze | [ ] |
| 5 | Freeze with no video | Freeze with no video loaded | Error toast, no crash | [ ] |

### 23.2 Flatten

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 6 | Flatten chain | Freeze prefix, click flatten | New video file created, chain replaced with single asset | [ ] |
| 7 | Flatten cancel | Start flatten, cancel mid-way | No orphan output file | [ ] |

### 23.3 Preset Save

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 8 | Save single effect preset | Add effect, set params, save as preset | .glitchpreset file in ~/Documents/Entropic/Presets | [ ] |
| 9 | Save effect chain preset | Add 3 effects, save chain preset | Preset includes all 3 effects + params | [ ] |
| 10 | Preset name/tags | Save with name and tags | Name and tags shown in browser | [ ] |
| 11 | Preset with macros | Add macros to chain preset | Macro knobs appear when preset loaded | [ ] |

### 23.4 Preset Load

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 12 | Load single effect | Click preset in browser | Effect added to chain with saved params | [ ] |
| 13 | Load chain preset | Click chain preset | Full chain loaded with all effects | [ ] |
| 14 | Search presets | Type in search box | Filtered by name and tags | [ ] |
| 15 | Favorite toggle | Click star on preset | Favorited, persists across reload | [ ] |
| 16 | Delete preset | Delete a preset | File removed, disappears from browser | [ ] |

### 23.5 Preset Validation

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 17 | Malformed preset file | Create .glitchpreset with bad JSON | Skipped in browser, no crash | [ ] |
| 18 | Preset missing effectId | Edit preset, remove effectId | Skipped during load | [ ] |

**Section 23 Total: 18 test cases**

---

## Section 24: Phase 11.5 — Toast, Layout, Observability

### 24.1 Toast Notifications

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 1 | Info toast auto-dismiss | Trigger info toast | Disappears after 4s | [ ] |
| 2 | Error toast longer | Trigger error | Stays 8s | [ ] |
| 3 | Rate limiting | Rapid-fire same error source | Shows count badge, not 5 separate toasts | [ ] |
| 4 | Max 5 visible | Trigger 6 toasts | Oldest evicted, max 5 on screen | [ ] |
| 5 | Clear all | Click clear all | All toasts gone, no stale timers fire later | [ ] |

### 24.2 Layout Persistence

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 6 | Sidebar toggle persists | Toggle sidebar (Cmd+B), reload app | Sidebar state preserved | [ ] |
| 7 | Timeline height persists | Resize timeline, reload app | Height preserved | [ ] |
| 8 | Focus mode (F) | Press F — both collapse; press F — both expand | Works both directions | [ ] |
| 9 | Timeline height bounds | Drag resize to extreme values | Clamped to 100-800px | [ ] |

### 24.3 MIDI (Phase 9)

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 10 | MIDI device detection | Connect MIDI controller | Device appears in MIDI settings | [ ] |
| 11 | MIDI learn (pad) | Right-click pad → Learn, press MIDI note | Note assigned to pad | [ ] |
| 12 | MIDI learn (CC) | Right-click knob → Learn, turn CC knob | CC mapped to param | [ ] |
| 13 | Channel filter | Set channel to 1, send on ch 2 | Messages ignored | [ ] |
| 14 | CC mapping persists | Save project with CC mappings, reload | Mappings restored | [ ] |

### 24.4 Auto-save

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 15 | Auto-save fires | Make changes, wait 60s | .autosave.glitch appears | [ ] |
| 16 | Auto-save cleaned on save | Manual save | .autosave.glitch deleted | [ ] |
| 17 | No auto-save if clean | Don't make changes | No .autosave.glitch | [ ] |

**Section 24 Total: 17 test cases**

**Updated Grand Total: 476 test cases**

---

## Section 22: Ship Gate Audit Remediation (2026-03-16)

> **33 fixes, 127 automated tests. This section validates the fixes work in the live app.**

### 22.1 Undo System (18 timeline + 6 project actions)

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 1 | Undo add track | Add a track, Cmd+Z | Track removed | [ ] |
| 2 | Undo remove track | Add track + clip, remove track, Cmd+Z | Track restored with clip | [ ] |
| 3 | Undo split clip | Import video, add to timeline, split, Cmd+Z | Single clip restored | [ ] |
| 4 | Undo trim | Trim clip in or out, Cmd+Z | Original duration restored | [ ] |
| 5 | Undo move clip | Move clip to new track, Cmd+Z | Clip back on original track at original position | [ ] |
| 6 | Full history | Do 5 actions, Cmd+Z x5, Cmd+Shift+Z x5 | Clean roundtrip, all actions redo correctly | [ ] |
| 7 | Linear branching | Undo 2 actions, do new action | Future cleared, can't redo old actions | [ ] |
| 8 | Undo add effect | Add effect in rack, Cmd+Z | Effect removed | [ ] |
| 9 | Undo remove effect | Remove effect, Cmd+Z | Effect restored in original position | [ ] |
| 10 | Undo param change | Change knob, Cmd+Z | Value reverts | [ ] |

### 22.2 Cross-Store Cleanup

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 11 | Effect delete cleans automation | Add effect, add automation lane for it, delete effect | Automation lane gone | [ ] |
| 12 | Effect delete cleans operator mappings | Add LFO targeting effect, delete effect | LFO mapping removed | [ ] |
| 13 | Undo restores cleanup | Delete effect (with automation), Cmd+Z | Effect + automation lane both restored | [ ] |

### 22.3 Pad Grid & Performance

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 14 | Mouse leave releases pad | Enter perform mode, mousedown on pad, drag mouse off pad | Pad releases (not stuck active) | [ ] |
| 15 | Pad triggers at correct frame | Start playback at frame 100, click pad | ADSR envelope starts from frame 100, not 0 | [ ] |

### 22.4 Project Save Safety

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 16 | Save doesn't corrupt | Save project, close app, reopen, load project | All data preserved | [ ] |
| 17 | Load malformed project | Create .glitch file with `{"bad": true}`, try to load | Error toast, app stays functional | [ ] |
| 18 | Load with NaN clip duration | Edit .glitch file, set clip duration to `NaN`, load | Validation rejects file | [ ] |

### 22.5 Resource Limits

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 19 | Track limit | Add tracks until limit (64) | Toast warning, no more tracks added | [ ] |
| 20 | Effect chain limit | Add 10 effects, try to add 11th | Toast warning, chain stays at 10 | [ ] |

### 22.6 IPC Safety

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 21 | NaN param | Send NaN value to an effect param via knob | Effect uses default (no crash) | [ ] |
| 22 | fps=0 rejected | (Dev console) Send clock_set_fps with fps=0 | Error response, no division crash | [ ] |

**Section 22 Total: 22 test cases**
**Updated Grand Total: 441 test cases**
