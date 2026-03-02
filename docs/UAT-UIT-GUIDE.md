# Entropic v2 Challenger — UAT & UIT Testing Guide

> **Version:** 2.0
> **Date:** 2026-03-01
> **Covers:** Phases 0A, 0B, 1, 2A, 2B, 3, 4 (everything built so far)
> **Tester:** You (manual walkthrough)
> **Time estimate:** 3-5 hours for full pass

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

---

## SECTION 13: Stress Testing & Edge Cases

> The chaos section — try to break things.

### 13.1 Rapid Input

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 217 | Rapid play/pause | Press Space rapidly (10+ times fast) | App doesn't crash or lock up | [ ] |
| 218 | Rapid effect add/remove | Add and remove effects quickly | No crashes, rack stays consistent | [ ] |
| 219 | Rapid scrubbing | Click rapidly across timeline | Preview updates, no hang | [ ] |
| 220 | Rapid undo/redo | Mash Cmd+Z and Cmd+Shift+Z rapidly | History navigates without crash | [ ] |

### 13.2 State Integrity

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 221 | Play then add effect | While playing, add an effect | Effect applies without stopping playback (or gracefully pauses) | [ ] |
| 222 | Scrub with effects | Have 5+ effects, scrub through timeline | Each frame renders all effects (may be slow but shouldn't crash) | [ ] |
| 223 | Full chain + export | 10 effects applied, export the video | Export succeeds with all 10 effects | [ ] |
| 224 | Import during playback | While playing, try to import another video | Handles gracefully (pauses or queues) | [ ] |

### 13.3 Boundary Tests

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 225 | Zero-length video | If possible, try a very short (< 1 second) video | App handles it or shows helpful error | [ ] |
| 226 | Large video | Try a large video (1080p, 1+ minute) | Import works (may be slow), preview works | [ ] |
| 227 | Param at min | Set a parameter to its minimum value | Preview renders without crash | [ ] |
| 228 | Param at max | Set a parameter to its maximum value | Preview renders without crash | [ ] |
| 229 | Empty project export | Try to export with no video loaded | Error message (not crash) | [ ] |

### 13.4 Recovery

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 230 | Engine crash recovery | Kill the Python process from Activity Monitor | Watchdog restarts it, app recovers | [ ] |
| 231 | Unsaved work lost | Make changes, close the app WITHOUT saving, reopen | **KNOWN GAP:** No dirty-state prompt exists. Unsaved work IS lost. Verify the app at least shows a dirty indicator (e.g., `*` in title bar) so you know you have unsaved changes | [ ] |

---

## SECTION 14: Integration Tests (Cross-Feature Flows)

> These test that features work TOGETHER, not just individually.

### 14.1 Full Journey: Import → Effects → Export

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 232 | End-to-end flow | 1. Import video 2. Add 3 effects 3. Adjust params 4. Scrub preview 5. Export | Exported video has all 3 effects baked in correctly | [ ] |

### 14.2 Save/Load Round-Trip

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 233 | Full round-trip | 1. Import video 2. Add effects + adjust params 3. Add markers 4. Adjust track opacity 5. Save 6. Close app 7. Reopen 8. Load project | Everything is exactly as you left it | [ ] |

### 14.3 Multi-Track Composition

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 234 | Two-track composite | 1. Import video to Track 1 2. Add Track 2, drag same video 3. Add hue_shift to Track 1 4. Add vhs to Track 2 5. Set Track 2 opacity to 50% 6. Set Track 2 blend to "screen" 7. Play | Preview shows blended composite of both tracks with different effects | [ ] |

### 14.4 Color Suite + Effects Combo

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 235 | Color + glitch | 1. Add "curves" (util tool) 2. Make an S-curve 3. Add "datamosh" (destructive effect) 4. Add "vhs" 5. Preview | All three stack correctly — color graded + glitched + VHS | [ ] |

### 14.5 Undo Across Features

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 236 | Cross-feature undo | 1. Add effect 2. Move a clip 3. Add a marker 4. Change track opacity 5. Undo all 4 steps | Each undo reverses the correct action in reverse order | [ ] |

### 14.6 Audio + Video + Effects

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 237 | Full A/V chain | 1. Import video WITH audio 2. Add 3 visual effects 3. Play | Audio plays in sync with effected video | [ ] |
| 238 | Audio unaffected | After adding visual effects | Audio sounds the same (visual effects don't corrupt audio) | [ ] |

---

## SECTION 15: Missing Interactions (Power User Pass)

> Tests for interactions found in the actual code but missing from the original guide.

### 15.1 Knob & Slider Advanced Interactions

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

### 15.2 Missing Keyboard Shortcuts

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 247 | Cmd+O open project | Press Cmd+O | File dialog opens filtered to .glitch files | [ ] |
| 248 | Cmd+N new project | Press Cmd+N | Project clears (same as test #180) | [ ] |
| 249 | Cmd+Shift+K split clip | Select a clip, position playhead over it, press Cmd+Shift+K | Clip splits at playhead position | [ ] |
| 250 | I key loop-in | Press I with playhead at 2 seconds | Loop region in-point set to 2 seconds | [ ] |
| 251 | O key loop-out | Press O with playhead at 5 seconds | Loop region out-point set to 5 seconds | [ ] |
| 252 | Cmd+M add marker | Press Cmd+M at current playhead position | Marker appears on ruler at that position | [ ] |
| 253 | Shortcuts in text input | Click into a number input field, then press Space | Space types into the field (does NOT trigger play/pause) | [ ] |

### 15.3 Waveform & Timeline Interactions

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 254 | Waveform click to seek | Click on the waveform display at a specific position | Audio seeks to that position (playhead moves too) | [ ] |
| 255 | Playhead drag | Drag the playhead head left/right on timeline | Playhead moves, preview updates in real-time as you drag | [ ] |
| 256 | Timeline resize handle | Drag the top edge of the timeline panel up/down | Timeline gets taller/shorter (min 120px, max ~50% window) | [ ] |
| 257 | Marker right-click delete | Right-click a marker flag on the time ruler | Context menu appears or marker is deleted directly | [ ] |

### 15.4 File Path & Format Edge Cases

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 258 | Unicode file path | Copy test video to a folder with spaces (e.g., `~/Desktop/My Videos/test file.mp4`), import it | Imports successfully — path handling doesn't break | [ ] |
| 259 | Special chars in path | Copy video with parentheses in name (e.g., `test (1).mp4`) and import | Imports successfully | [ ] |
| 260 | AVI format | Import an .avi file | Accepted and ingested (backend supports .avi) | [ ] |
| 261 | WebM format | Import a .webm file | Accepted and ingested (backend supports .webm) | [ ] |
| 262 | MKV format | Import an .mkv file | Accepted and ingested (backend supports .mkv) | [ ] |

### 15.5 Import & Ingest Guards

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 263 | Drop during ingest | Start importing a video, then immediately drag-drop another | Second drop is rejected or queued — drop zone should be disabled during ingest | [ ] |
| 264 | 500MB file limit | Try to import a video file larger than 500MB | Backend rejects with a file-too-large error (SEC-5) | [ ] |

### 15.6 Effect Browser States

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 265 | Search no results | Type "zzzzzznotaneffect" in effect search | Shows "No effects found" message (not blank) | [ ] |
| 266 | Category filter + search | Select a category, then type in search | Results filter by BOTH category AND search text | [ ] |
| 267 | Effect disabled state | With 10 effects in chain, look at browser | Effect list items are disabled/unclickable (max chain reached) | [ ] |

### 15.7 Preview Error States

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 268 | Preview retry button | If preview shows error state, click the Retry button | Preview re-renders the current frame | [ ] |
| 269 | Preview empty state | Open app with no video loaded | Preview shows "No video loaded" message (not blank/broken) | [ ] |

### 15.8 Export Edge Cases

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 270 | Export dialog dismiss | Click the dark overlay area behind the export dialog | Dialog closes (click-outside-to-dismiss) | [ ] |
| 271 | Export with all effects bypassed | Add 3 effects, bypass all of them, export | Export produces video with no effects (original video) | [ ] |
| 272 | Custom resolution bounds | In export dialog, try typing 0 or 99999 in width/height | Values are clamped (min 1, max 7680) — no crash | [ ] |
| 273 | Cancel save path | Click Export, then cancel the save dialog | Returns to export dialog or main app without error | [ ] |

### 15.9 Save/Load Persistence

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 274 | Re-save after edits | Save → add another effect → Cmd+S again (same file) → close → reopen → load | The NEW changes are present (not the old state) | [ ] |
| 275 | Load missing asset | Save a project. COPY your video elsewhere. Delete the copy. Load the .glitch file | Graceful error about missing asset — app doesn't crash | [ ] |

### 15.10 Engine Resilience

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 276 | Engine crash mid-render | Add 5 effects, start scrubbing rapidly, kill Python process from Activity Monitor | Watchdog restarts engine, preview recovers after reconnect | [ ] |
| 277 | Engine crash mid-export | Start export, kill Python process | Export fails with error message (not hang), app stays responsive | [ ] |

---

## SECTION 16: Red Team / Security (QA-RedTeam Pass)

> Try to break the app intentionally. These test security gates and abuse paths.

### 16.1 Backend Security Gates

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 278 | Symlink rejection | Create a symlink to a video file (`ln -s real.mp4 link.mp4`), try to import the symlink | Rejected: "Symlinks are not allowed" | [ ] |
| 279 | Max frame count | Try to import a very long video (>2.7 hours at 30fps = 300K+ frames) | Rejected with SEC-6 error about exceeding max frame count | [ ] |
| 280 | Effect timeout | Add an effect that's computationally expensive (e.g., multiple physics effects stacked), scrub | If an effect takes >500ms, it should be skipped (returns input unchanged) — no hang | [ ] |
| 281 | Effect auto-disable | If you can trigger 3 consecutive failures on the same effect (e.g., edge case params) | Effect auto-disables after 3 failures. Check via observing it no longer applies | [ ] |

### 16.2 Context Isolation

| # | Test | Steps | Expected | Result |
|---|------|-------|----------|--------|
| 282 | No Node in renderer | Open DevTools (if accessible), type `require('fs')` in console | Should fail — Node.js is not available in renderer (context isolation) | [ ] |
| 283 | No navigation | Open DevTools, try `window.location = 'https://example.com'` | Navigation blocked — window stays on app | [ ] |

---

## SECTION 17: Known Gaps & Expected Failures

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

## SECTION 18: Bug Report Template

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
| 4. Effect System | 27 | | | | |
| 5. Parameter UX | 12 | | | | |
| 6. Audio System | 13 | | | | |
| 7. Timeline & Tracks | 42 | | | | |
| 8. Undo/Redo | 18 | | | | |
| 9. Project Save/Load | 13 | | | | |
| 10. Export | 13 | | | | |
| 11. Panel Layout | 9 | | | | |
| 12. Keyboard Shortcuts | 10 | | | | |
| 13. Stress Testing | 15 | | | | |
| 14. Integration Tests | 7 | | | | |
| 15. Missing Interactions | 39 | | | | Knobs, sliders, waveform, timeline, edge cases |
| 16. Red Team / Security | 6 | | | | Security gates, context isolation |
| 17. Known Gaps | — | | | | Informational only (no pass/fail) |
| **TOTAL** | **253** | | | | |

### Verdict Criteria

- **GO:** 0 P0 bugs, fewer than 3 P1 bugs, all integration tests pass
- **CONDITIONAL GO:** 0 P0 bugs, P1 bugs have workarounds, most integration tests pass
- **NO GO:** Any P0 bug, or 5+ P1 bugs, or integration tests failing

---

## What's NOT Tested Here (Future Phases)

These features are **not yet built** — do NOT test them:

- MIDI input / hardware controllers (Phase 9)
- Perform mode pad grid / keyboard triggers (Phase 5)
- Full automation recording (Phase 7)
- Signal/modulation routing matrix (Phase 6)
- Preset library / preset save & load (Phase 10)
- Audio sidechain modulation (Phase 6)
- Freeze/flatten effects (Phase 10)
- Step sequencer operator (Phase 6+)
- ProRes / H.265 export codecs (Phase 11)
- Auto-save (Phase 4 — designed but may not be wired yet)
