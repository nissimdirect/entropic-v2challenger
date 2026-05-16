# Entropic v2 — UX Specification

> How every panel, interaction, and workflow feels.
> Grounded in: ARCHITECTURE.md (system truth), DATA-SCHEMAS.md (data shapes), SIGNAL-ARCHITECTURE.md (signal model).
> Informed by: v2 Challenger spec UI_UX.md, SPECS_AUTOMATION_LOGIC.md, SPECS_PERFORMANCE_TRACK.md, SPECS_LIBRARY_BROWSER.md, SPECS_EFFECTS_MODULATION.md.
> Adapted from v1/v2 patterns where proven, rebuilt where Challenger architecture differs.

---

## 1. Global Layout

### 1.1 Theme
- **Dark mode only** (v1 launch). Background: `#1a1a1a`.
- **Typography:**
  - Data/code: JetBrains Mono (monospace)
  - UI labels: Inter (sans-serif)
- **Accent color:** Configurable per-user. Default: electric purple `#a855f7`.
- **Border radius:** 4px (consistent). No rounded corners > 8px.

### 1.2 Panel Architecture

```
┌─────────────────────────────────────────────────────┐
│ TOOLBAR — Transport · Meters · Global Actions        │
├──────────┬──────────────────────────────┬───────────┤
│          │                              │           │
│ BROWSER  │      PREVIEW CANVAS          │  EFFECTS  │
│          │                              │  PANEL    │
│ - Assets │   (Video preview, full-      │           │
│ - Effects│    width center stage)       │ - Rack    │
│ - Library│                              │ - Params  │
│          │                              │ - Routing │
│          │                              │           │
├──────────┴──────────────────────────────┴───────────┤
│ TIMELINE — Tracks · Clips · Automation · Markers     │
│ ┌─── Track Headers ───┬─── Clip Area ───────────┐   │
│ │ V1: Main Video      │ ████████▒▒▒▒████████    │   │
│ │ V2: Overlay         │     ███████             │   │
│ │ P1: Performance     │ ♦♦  ♦♦♦  ♦  ♦♦♦♦      │   │
│ └─────────────────────┴─────────────────────────┘   │
├─────────────────────────────────────────────────────┤
│ BOTTOM BAR — Operator Rack · Pad Grid · History      │
└─────────────────────────────────────────────────────┘
```

### 1.3 Panel Resizing
- All panel dividers are draggable.
- Double-click divider → reset to default proportions.
- Panels can be collapsed (click header to toggle).
- Panel state persists in user settings.

---

## 2. Toolbar ("The Cockpit")

### 2.1 Transport Controls
- **Play/Pause** (Space) — single toggle
- **Stop** (Escape) — returns playhead to start or last stop position
- **Record** — arms automation/performance recording
- **MIDI Capture** — retro-capture button (Phase 9)
- **Loop toggle** — enables loop region playback

### 2.2 System Meters
Real-time display (updates every 500ms):
- **CPU** — bar graph + percentage
- **RAM** — bar graph + MB used / total
- **Frame Time** — current ms per frame (green < 33ms, yellow 33-66ms, red > 66ms)
- **Disk** — cache size indicator

### 2.3 Global Actions
- **Undo/Redo** — buttons + Cmd+Z / Cmd+Shift+Z
- **Export** — Cmd+E → opens Export Dialog
- **Save** — Cmd+S → save project (.glitch file)
- **Settings** — gear icon → Preferences panel

---

## 3. Browser Panel (Left Sidebar)

### 3.1 Three Tabs
1. **Assets** — files in current project (imported videos/images)
2. **Effects** — full effect browser (searchable, categorized)
3. **Library** — presets and user content from `~/Documents/Entropic/`

### 3.2 Effect Browser
- **Search bar** at top (fuzzy match on name + description)
- **Category tree:** collapsible groups matching taxonomy
  - Tools (`util.*`) — Levels, Curves, HSL, Color Balance, Blur, Chroma Key...
  - Effects (`fx.*`) — Pixel Sort, Datamosh, VHS, Feedback, Wave Distort...
  - Operators (`mod.*` / `op.*`) — LFO, Envelope, Audio Follower, Step Seq...
- **Favorites:** star icon per effect, favorites float to top
- **Drag to add:** drag effect from browser → drop on effect rack or timeline track
- **Double-click to add:** appends to selected track's effect chain

### 3.3 Library Browser (Phase 10)
- **Presets:** `.glitchpreset` files, organized by category/tag
- **Search + filter:** by name, tag, type (single effect / chain)
- **Drag-and-drop:**
  - Preset → empty timeline area = new track with effects
  - Preset → existing track = append effects to chain
  - Preset → specific effect slot = replace that effect

### 3.4 Indexing Strategy
- **Lazy scanning:** Only scan user library folder deep; other folders on open
- **Metadata sidecars:** `.filename.mp4.meta` JSON caches duration, resolution, codec, hash, thumbnail
- **Orphan cleanup:** "Clean Library" utility removes stale sidecar files

---

## 4. Preview Canvas (Center)

### 4.1 Video Display
- Full preview of processed output at current playhead position
- **Dynamic resolution scaling** during playback (ARCHITECTURE.md §6.2):
  - Green indicator: rendering at full resolution
  - Yellow: 75% downscale
  - Red: 50% or lower
  - When stopped: always renders full resolution (up to 10s allowed)
- **Zoom:** Cmd+= / Cmd+- to zoom canvas, Cmd+0 to fit
- **Before/After:** Hold Backslash (`\`) to see original, release to see processed

### 4.2 Overlays
- **Safe area guides** (toggle via View menu)
- **Grid overlay** (toggle)
- **Histogram** (Phase 3) — overlay in corner, toggleable
- **Frame counter** — current frame number + timecode

---

## 5. Effect Rack (Right Panel)

### 5.1 Layout
- Horizontal chain of "Devices" (like Ableton's effect rack)
- Each device: header (name, bypass, remove) + parameter area
- **Drag-and-drop reordering** within the chain
- **Effect container visualization:**
  ```
  ┌─ [Mask] ─ [Effect] ─ [Mix] ─┐
  │  optional   core     0-100%  │
  └──────────────────────────────┘
  ```

### 5.2 Device UI
- **Header:** Effect name · Bypass toggle (eye icon) · Remove (×)
- **Params area:** Knobs + sliders (generic, from PARAMS dict)
- **Freeze overlay:** Frosted glass on frozen devices (Phase 10)
- **Modulation indicators:** Pulsing ring on modulated params

### 5.3 Knob Component (Phase 2A)
- **Rotary knob** with solid arc (base value) + ghost arc (actual value after mod/auto, 30% opacity)
- **Drag up/down** to change value
- **Shift+drag** — fine-tune mode (10x precision)
- **Double-click** — type exact value
- **Right-click** — reset to default
- **Arrow keys** — adjust selected param by 1%, Shift+arrows by 10%
- **Tooltip on hover:** name, current value, unit, description
- **Curve scaling:** `linear | logarithmic | exponential | s-curve` (from `curve` field in PARAMS)

### 5.4 Scroll Affordance
- Gradient fade at bottom of param panel when content overflows
- CSS: `mask-image: linear-gradient(black 80%, transparent)`
- Prevents the "hidden params" anti-pattern from v1 (bug U1)

### 5.5 Effect Grouping
- Cmd+G with multiple effects selected → wrap in "Rack" container
- Rack adds macro panel (up to 8 macro knobs mapping to underlying params)
- Cmd+Shift+G → ungroup

---

## 6. Timeline (Bottom Panel)

### 6.1 Structure
- **Time Ruler** — top bar with time markings, click to seek
- **Playhead** — vertical line, draggable
- **Tracks** — stacked vertically
- **Track header:** name, color, mute (M), solo (S), opacity slider, blend mode dropdown
- **Track types:**
  - Video track (grey/purple): holds video clips with thumbnails
  - Performance track (electric blue): holds trigger events as blocks

### 6.2 Clip Interaction
- **Click** — select single clip
- **Shift+click** — range select (all clips between current and clicked)
- **Cmd+click** — toggle select (add/remove from selection)
- **Drag on background** — marquee select (rectangle selection)
- **Drag on selection** — move all selected clips
- **Alt+drag** — duplicate selection
- **Trim handles** — drag clip edges to adjust in/out points
- **Split** — Cmd+Shift+K at playhead position

### 6.3 Ruler Interaction
- **Click** — jump playhead to position
- **Shift+click** — set loop out point
- **Alt+click** — set loop in point

### 6.4 Automation Lanes
- Toggle visibility with `A` key
- Per-track, per-effect, per-parameter lanes
- **Click on line** → add automation node
- **Drag node** → edit time (X) and value (Y)
- **Shift+drag** → fine-tune node (10x precision)
- **Alt+click node** → cycle curve type (linear, ease-in, ease-out, S-curve)
- **Delete key** → remove node
- **Modes** (Phase 7): Read · Touch · Latch · Draw
  - Read: plays back automation, doesn't record
  - Touch: records while knob held, snaps back on release
  - Latch: records from touch, holds value after release
  - Draw: freehand paint automation points

### 6.5 Markers
- M → add marker at playhead
- Click marker to jump
- Right-click → rename, change color, delete

### 6.6 Loop Region
- Highlighted bar on ruler between in/out points
- Playback loops within region when loop is enabled

### 6.7 Zoom + Scroll
- Cmd+= / Cmd+- → horizontal zoom
- Scroll wheel → horizontal scroll
- Cmd+scroll → vertical zoom (track heights)
- Minimap at bottom → click to navigate

---

## 7. Bottom Bar (Context-Sensitive)

Shows different content based on selection:

| Selection | Bottom Bar Shows |
|-----------|-----------------|
| Video track selected | Effect Rack (horizontal chain) |
| Performance track selected | Pad Grid (4x4 or 8x8) + Drum Rack editor |
| Effect selected | Expanded parameter view |
| No selection | History Panel (undo/redo list) |

### 7.1 Pad Grid (Phase 5/9)
- **Grid:** 4x4 (Phase 5) expanding to 8x8 (Phase 9)
- **Each pad:** Label, key binding, color, active state glow
- **Click pad** → edit mode (key, mode, choke group, ADSR, mappings)
- **QWERTY default mapping:** Q-W-E-R / A-S-D-F / Z-X-C-V / 1-2-3-4
- **Visual feedback:** pad lights up when active, dims during ADSR release phase
- **Modes per pad:** Gate (hold=on), Toggle (press=flip), One-Shot (press=trigger ADSR)
- **Choke groups:** color-coded, activating one silences others in same group

### 7.2 History Panel
- Photoshop-style vertical list of all operations
- Click any entry to jump to that state
- Current state highlighted
- Linear branching: jump back + new action = forward history cut

### 7.3 Modulation Matrix (Phase 6)
- Grid view: operators (rows) × parameters (columns) → depth at intersection
- Click cell to add/remove routing
- Drag cell value to adjust depth
- Color-coded by operator type

---

## 8. Operator Rack (Phase 6)

Separate from Effect Rack — displayed below or alongside it.

### 8.1 Layout
- Horizontal chain of operator devices (LFO, Envelope, Analyzer, etc.)
- Each operator: waveform display + params + output indicator
- **Routing lines:** SVG paths from operator output → connected param knobs

### 8.2 LFO Device
- Waveform selector (sine/saw/square/tri/random/noise/S&H)
- Rate knob (0.01-50 Hz), Depth knob, Phase offset
- Waveform animation showing current cycle position
- Sync-to-BPM toggle

### 8.3 Envelope Device
- ADSR curve visualization (interactive — drag A/D/S/R handles)
- Trigger mode: manual button, threshold, MIDI note

### 8.4 Video Analyzer Device
- Source selector dropdown (current frame / specific track)
- Extraction method: luminance, motion, color channel, edge density
- Real-time signal display (oscilloscope-style)

### 8.5 Audio Follower Device
- Band selector: full range, sub (20-80Hz), low-mid, high-mid, high
- Gain + threshold knobs
- Real-time amplitude display

---

## 9. Keyboard Shortcuts

### 9.1 Transport
| Action | Shortcut |
|--------|----------|
| Play/Pause | Space |
| Stop | Escape |
| Scrub forward | L |
| Scrub backward | J |
| Frame forward | Right Arrow |
| Frame backward | Left Arrow |

### 9.2 Timeline
| Action | Shortcut |
|--------|----------|
| Split clip | Cmd+Shift+K |
| Delete clip | Delete |
| New video track | Cmd+T |
| New performance track | Cmd+Shift+T |
| Add marker | M |
| Toggle automation | A |

### 9.3 Edit
| Action | Shortcut |
|--------|----------|
| Undo | Cmd+Z |
| Redo | Cmd+Shift+Z |
| Select all | Cmd+A |
| Copy | Cmd+C |
| Paste | Cmd+V |
| Duplicate | Cmd+D |
| Group | Cmd+G |
| Ungroup | Cmd+Shift+G |

### 9.4 View
| Action | Shortcut |
|--------|----------|
| Zoom in | Cmd+= |
| Zoom out | Cmd+- |
| Zoom to fit | Cmd+0 |
| Before/After | Hold Backslash |

### 9.5 Project
| Action | Shortcut |
|--------|----------|
| Save | Cmd+S |
| Save As | Cmd+Shift+S |
| Open | Cmd+O |
| New Project | Cmd+N |
| Export | Cmd+E |

### 9.6 Customization
- All shortcuts user-configurable via Preferences → Shortcuts panel
- Conflict detection: warns if shortcut already assigned
- Reset to defaults button

---

## 10. Interaction Principles

### 10.1 Feedback
- Every action produces visible feedback within 100ms
- Destructive actions require confirmation (delete track, clear all)
- Non-destructive actions are instant (all effects, all param changes)
- Error messages are human-readable with recovery suggestions

### 10.2 Ghost Handle (Signal Order Visualization)
Per SIGNAL-ARCHITECTURE.md §6:
```
Base Value → + Modulation → + Automation → Clamped → Sent to Effect
```
The knob visualizes this:
- **Solid arc:** Base value (user-set)
- **Ghost ring (30% opacity):** Final clamped value after all modulation + automation
- If only automation active: solid handle moves to automation value smoothly
- If only modulation active: ghost ring oscillates around solid handle
- If both: solid follows automation, ghost oscillates around that

### 10.3 Drag Conventions
- Drag sensitivity: 1% per pixel (vertical drag on knobs)
- Shift+drag: 0.1% per pixel (fine-tune)
- Alt+drag on clips: duplicate
- Drag from browser: add to rack/timeline

### 10.4 Tooltips
- Hover any control for 500ms → tooltip appears
- Content: Name · Current Value · Unit · Description · Shortcut (if applicable)
- Tooltips never block other controls

### 10.5 Loading States
- Async operations show spinner/skeleton
- Video import: progress bar in browser panel
- Export: modal with progress bar + ETA + cancel
- Effect processing: frame time indicator in toolbar

### 10.6 Error Handling (User-Facing)
- Never show stack traces
- Pattern: "What went wrong" → "Why" → "What to do"
- Example: "Export failed — Not enough disk space (need 2.3GB, have 1.1GB). Free up space and try again."

---

## 11. Welcome Screen

Shown on app launch (no project open):

```
┌─────────────────────────────────────────────┐
│              E N T R O P I C                │
│          Glitch Video DAW v2.0              │
│                                             │
│  ┌─ Recent Projects ────────────────────┐   │
│  │  📁 My Glitch Project     2 min ago  │   │
│  │  📁 Live Set Feb 2026     3 days ago │   │
│  │  📁 Music Video Draft     1 week ago │   │
│  └──────────────────────────────────────┘   │
│                                             │
│  [ New Project ]  [ Open Project ]          │
│                                             │
└─────────────────────────────────────────────┘
```

---

## 12. Accessibility

- All interactive elements keyboard-navigable (Tab order)
- Focus indicators visible on all focused elements
- Color is never the only indicator — always paired with icon or label
- Minimum contrast ratio: 4.5:1 (WCAG AA)
- Screen reader labels on all interactive elements

---

## Source Attribution

This spec synthesizes and rebuilds from:
- v2 Challenger ARCHITECTURE.md (system of record)
- v2 Challenger SIGNAL-ARCHITECTURE.md (signal model)
- v2 Challenger DATA-SCHEMAS.md (data shapes)
- v2 Gemini spec UI_UX.md v1.8 (layout, shortcuts, interactions)
- v2 Gemini spec SPECS_AUTOMATION_LOGIC.md (recording modes, Ghost Handle)
- v2 Gemini spec SPECS_PERFORMANCE_TRACK.md (pad grid, retro-capture, choke groups)
- v2 Gemini spec SPECS_LIBRARY_BROWSER.md (browser tabs, indexing, presets)
- v2 Gemini spec SPECS_EFFECTS_MODULATION.md (effect container, freeze, operator tiers)
- v1 Entropic UAT lessons (scroll affordance fix, hidden params bug U1)

All decisions grounded in Challenger architecture. Where v2 Gemini spec assumed PyWebView or different IPC, this spec reflects Electron + React + ZMQ + mmap reality.
