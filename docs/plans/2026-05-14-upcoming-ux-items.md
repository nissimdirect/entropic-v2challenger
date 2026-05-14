---
title: Upcoming UX items — captured 2026-05-14
status: pending
session: parked-for-eng-pickup
---

# Upcoming UX items

Captured 2026-05-14 from a live UAT session. NOT planned for the same
session that wrote this file — these are pickup targets for `/eng` (or
the next iteration loop) so they don't fall on the floor.

## 1. Hotkey-discoverability epic — show shortcuts next to every action

**Bug class:** when the user invokes an action via menu / palette /
dropdown / context-menu, the keyboard shortcut for that action is NOT
shown next to the label. Discovery friction: users have to dig into
Help → Keyboard Shortcuts to learn what they could've pressed instead.

**Started in PR #62** (this session): the timeline `ContextMenu`
component grew a `shortcut?: string` prop and the clip context menu
displays `⌘K` next to "Split at Playhead". That's ONE site.

**Remaining surfaces** to audit + wire (estimates per site, ~5–15 min):
- [ ] Track header context menu (Rename Track, Duplicate Track, Move Up/Down, Delete Track, automation lane adds)
- [ ] Right-click on automation lanes (if any)
- [ ] Effects browser — double-click adds effect; could surface `add_effect_selected` if there's a bound key
- [ ] Device Chain right-click (when implemented) — Save as Preset, Reset Parameters, Duplicate, Move Up/Down, Bypass
- [ ] Preferences → Shortcuts tab already exists; cross-reference for completeness
- [ ] Adjustments / File / Edit / View / Select / Clip / Timeline / Window / Help top-bar menus already format `\tShortcut` in their labels (Electron native); audit they're consistent

**Approach for each site:** use `prettyShortcut(shortcutRegistry.getEffectiveKey('<action>'))` from `frontend/src/renderer/utils/pretty-shortcut.ts` to format the key, pass it as the `shortcut` prop on the MenuItem.

**Exit criterion:** any action the user can invoke with a keyboard
shortcut shows that shortcut at the point of invocation. No friction
in switching from mouse-driven discovery to keyboard-driven speed.

## 2. Left side of arrangement view — needs design pass

**Problem (recurring user feedback):** the left column of the arrangement
view is too narrow / cramped, and the alignment between tracks ↔ preview
↔ ruler is off. The 2026-05-12 UAT F-0512-11 (deferred) captured one
incarnation: "Layout: timeline tracks and preview canvas are not
left-aligned; left column is too narrow."

**Scope:** redesign the track-header column width + the relationship
between the sidebar, the preview canvas, and the timeline-track left edge.

**Needed before starting:**
- Snapshot the current arrangement-view layout in a screenshot annotated
  with the actual computed widths (sidebar, preview-canvas, timeline lanes).
- One-paragraph PRD on what "fixed" should look like — track header width,
  alignment rules, behavior when sidebar collapses.

**Owner / next step:** parked. Pick up when ready to spend a focused
session on layout — needs design judgment, not just a code patch.

## 3. Extend effects panel lower

**Problem:** the Effects browser panel in the left sidebar is cut off
vertically when a clip is selected (the Transform panel pushes it down
and `max-height: 35vh` capped it — that's F-0512-36 which shipped). But
even with the cap, the effects list still feels short — users have to
scroll a lot to browse the ~200 registered effects.

**Scope:** extend the Effects panel's vertical extent so more effects are
visible at once. Options:
- Drop / minimize the `max-height: 35vh` cap when the panel is the only
  thing in the sidebar (no Transform panel above it)
- Add a "pop out / detach" affordance so the user can have a tall
  Effects browser in a separate window
- Re-think the panel layout: virtualized list + category collapsing so
  the same vertical extent shows MORE effects

**Coupled with:** item #2 above — the left sidebar redesign is the
natural place to fix this.

## Pickup signal

When `/eng` (or a fresh planning skill) scans `docs/plans/` for active
work, this file should surface as an unblocked pickup target. None of
these items has a hard dependency on the others; they can be split
across sessions.
