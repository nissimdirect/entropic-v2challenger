---
date: 2026-03-16
topic: ux-redesign-arrangement-view
---

# Entropic Challenger UX Redesign

## What We're Building

A comprehensive UX redesign of Entropic Challenger to align with Ableton Live's arrangement view paradigm. Single view (no session/arrangement split) with an Ableton-style horizontal device chain at the bottom, performance triggers recording as square-wave automation pulses in timeline lanes, and preview pop-out to a second monitor.

## Layout (Revised)

```
┌──────────────────────────────────────────────────────────────┐
│ [File] [Edit] [View]    ◄◄  ▶  ■  ►►   ⏺ OVR   00:05:12   │  Menu + Transport + Overdub
├───────────┬──────────────────────────────────────────────────┤
│           │                                                  │
│  EFFECT   │              PREVIEW CANVAS              [POP]   │  Row 1
│  BROWSER  │              (video output)                      │  [POP] = pop-out to
│           │                                                  │  separate window
│  ─────── │──────────────────────────────────────────────────│
│           │                                                  │
│  ★ Favs   │   TIMELINE + AUTOMATION LANES                    │  Row 2 (resizable split)
│  ▶ Destru │   ┌─Track 1──[ARM]───────────────────────┐      │
│  ▶ Glitch │   │ ▂▃▅▇▅▃▂  auto: pixelsort.threshold   │      │
│  ▶ Color  │   ├─Track 2──[ARM]───────────────────────┤      │
│  ▶ Physics│   │ ▃▅▂▃▅▇  auto: datamosh.entropy        │      │
│  ▶ User/  │   ├─Perform Triggers─────────────────────┤      │
│    Presets │   │ ┌──┐  ┌────────┐   ┌─┐  ┌──────┐    │      │  Square wave pulses
│           │   │ └──┘  └────────┘   └─┘  └──────┘    │      │  (cardiogram trace)
│  ─────── │   └───────────────────────────────────────┘      │
│  ℹ HELP   │                                                  │
│  panel    │                                                  │
├───────────┴──────────────────────────────────────────────────┤
│ DEVICE CHAIN (Ableton-style horizontal strip)                │  Row 3
│ ┌─────────┐ ┌─────────┐ ┌══════════════════════┐ ┌────────┐│
│ │pixelsort│→│datamosh │→║ GROUP: "My Glitch"   ║→│reverb  ││
│ │ ON  [AB]│ │ ON  [AB]│ ║ [M1:Chaos] [M2:Depth]║ │ ON [AB]││
│ │ thresh  │ │ entropy │ ║ ┌───────┐ ┌────────┐  ║ │ decay  ││
│ │ ◉ 0.45  │ │ ◉ 0.72  │ ║ │xor    │→│channel │  ║ │ ◉ 0.6  ││
│ │ mix 72% │ │ mix 100%│ ║ │ ON    │ │shift   │  ║ │mix 100%││
│ └─────────┘ └─────────┘ ╚══════════════════════╝ └────────┘│
├──────────────────────────────────────────────────────────────┤
│ ● Engine OK  │ 1920x1080 │ 30fps │ 12ms        [EXPORT ▶]  │  Status bar
└──────────────────────────────────────────────────────────────┘
```

## Key Decisions

### 1. Single Arrangement View (not dual session/arrangement)
Performance happens IN the arrangement via overdub recording and performance triggers in timeline lanes. No view switching. Video needs the timeline visible at all times.

### 2. Ableton-Style Device Chain at Bottom
- Horizontal strip replacing the current separate ParamPanel
- Each device shows its params inline (knobs, sliders, dropdowns)
- Click a device to select it, params visible in its card
- Signal flow left→right with → arrows between devices
- Sidebar becomes browser-only (no more EffectRack in sidebar)

### 3. Effect Groups with User-Mapped Macros
- Users group effects into a rack (double-bordered container)
- Macros are NOT default empty — they only appear when user maps them
- Right-click param in grouped device → "Map to Macro" → name it
- A/B switch per device AND per group (swap between two param states)
- Save/load group presets (preserves macro mappings)

### 4. Performance Triggers (formerly "drum rack pads")
- Renamed from "drum rack" to "performance triggers"
- Primary use: clip visibility (opacity 0→1 on trigger)
- Advanced: mappable to any effect param
- **Default = square wave** (instant on/off, toggle mode)
- ADSR is opt-in for shaped fades (default ADSR = 0/0/1/0 = square)
- Three modes: toggle (default), gate (hold), one-shot (fixed pulse)
- **Exclusive param ownership:** multiple params can map to one trigger, but once a param is claimed, no other trigger can take it
- **Choke groups:** triggering one releases others in same group (already built)

### 5. Performance Triggers Record as Automation
- Option A selected: automation-only (no piano roll)
- Square wave pulses drawn in automation lanes (cardiogram visual)
- Each mapped param gets its own lane colored by trigger color
- Overdub: ⏺ + OVR button arms recording, new pulses merge with existing
- Retro-capture (60s buffer) renders trigger events into automation lanes via CAPTURE button

### 6. Preview Pop-Out
- [POP] button on preview canvas opens a separate Electron BrowserWindow
- Resizable, draggable to second monitor (like Resolume's output window)
- Main window preview can optionally hide when popped out

### 7. Effect Browser (Sidebar)
- Categories + favorites + user folders (text-only, no thumbnails)
- Ability to save single-effect presets and group presets
- Drag device from chain back to User Presets to save
- Double-click or drag from browser to append to device chain
- Help panel at bottom shows effect description on hover

### 8. XY Interpolation Pad (Additive)
- Optional floating/dockable panel (View → XY Pad)
- Pin 4 presets to corners, drag point to interpolate
- Additive to preset system, does not replace it

### 9. A/B Switching
- Per-device: [AB] button toggles between two param snapshots
- Per-group: [AB] swaps entire group state
- First click: B = current, A = snapshot at that moment
- Shift+click: copy current to inactive slot (reset comparison)
- Visual: `[A|b]` or `[a|B]` (active letter bold)

### 10. Visual Hierarchy (Needs Mocks)
- Three chromatic zones: browser, preview, timeline/device chain
- Signal Bruise direction approved in concept but needs HTML mockups before committing
- Distinct backgrounds per zone to create hierarchy

## Quick Wins (Approved)

1. J/K/L transport keys (J=reverse, K=stop, L=forward)
2. Effect description in help panel on hover
3. Preview canvas as always-active drop target
4. Visible resize grip dots on timeline handle
5. Sidebar collapse arrow icon (visible toggle)
6. Per-device render time bar in chain strip
7. Rename "Ghost Handle" → "Precision Slider"
8. Cmd+D duplicate selected device
9. Humanize error messages ("Engine took too long" not "ZMQ timeout")

## Nielsen Heuristic Mitigations (All Approved)

| Heuristic | Grade | Mitigation |
|-----------|-------|-----------|
| H1 Visibility | C+→A | Transport bar connection dot, per-device render time, export progress in scrub bar, red pulsing armed tracks |
| H2 Real World | B→A- | Rename Ghost Handle→Precision Slider, Prefix-Chain Freeze→Render In Place |
| H3 Control | B-→A- | Verify Cmd+Z reverses reorder, A/B switching, View→Save Layout |
| H4 Consistency | C→A | Add J/K/L, Cmd+D, I/O loop points, Tab cycles devices, ⏺ overdub toggle |
| H5 Error Prevention | B+→A | Confirm before Flatten, chain depth indicator "7/10" |
| H6 Recognition | D+→B+ | Categories+favorites+folders, help panel, selected device highlight |
| H7 Flexibility | C→A- | Macros per group (user-mapped), right-click→Save Preset, double-click to add, right-click param→Add Automation Lane |
| H8 Aesthetic | C+→B+ | Three-zone backgrounds, device chain top highlight (needs mocks) |
| H9 Error Recovery | B→A- | Humanize all error toasts, crash dialog guidance text |
| H10 Help | D→B | Persistent help panel, 3-step welcome quickstart, "What's new" toast on update |

## Open Questions

None — all resolved through brainstorm dialogue.

## What Changes from Current Codebase

| Component | Current | After Redesign |
|-----------|---------|----------------|
| `App.tsx` grid | 4-row, 2-col (sidebar, main, timeline, perf, status) | 4-row, 2-col (sidebar, main+preview, timeline, device chain, status) |
| `EffectRack` | Vertical list in sidebar | **Removed** — replaced by horizontal device chain |
| `ParamPanel` | Below preview, max-height 240px | **Removed** — params inline in device chain cards |
| `PerformancePanel` | Separate collapsible grid panel (row 3) | **Removed** — triggers become automation lanes in timeline |
| `EffectBrowser` | Sidebar with search + categories | Stays, gains favorites/user folders/help panel |
| `PreviewCanvas` | Embedded in main area | Gains [POP] button for separate window |
| `MacroKnob` | Exists but usage unclear | Per-group only, user-mapped (not default) |
| New: `DeviceChain` | N/A | Horizontal strip at bottom (new component) |
| New: `DeviceCard` | N/A | Single device in chain with inline params |
| New: `DeviceGroup` | N/A | Grouped devices with macro strip |
| New: `ABSwitch` | N/A | Per-device and per-group A/B state toggle |
| New: `PopOutPreview` | N/A | Separate Electron BrowserWindow |

## Next Steps

→ `/workflows:plan` for implementation phasing
→ HTML mockup of device chain + Signal Bruise visual hierarchy before coding visual direction
