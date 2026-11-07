# Phase 2 — Reference teardown plan

Output: one file per topic in `docs/spec/patterns/<topic>.md`. Each pattern row = **source · legal tier · what it does
(observed behavior or API) · why it fits / doesn't fit Creatrix (cite RATIFIED row) · which object/system spec consumes it.**
New ideas that are NOT existing/planned Creatrix scope go to `docs/spec/ADDITIONS.md` (owner approval required; verdict (b)).

## Legal tiers (binding)

| Tier | Sources | Allowed | Forbidden |
|---|---|---|---|
| ADOPT | React Aria (Apache-2.0), dockview (MIT), OpenTimelineIO (Apache-2.0), cmdk (MIT), Tweakpane (MIT), Blueprint (Apache-2.0), Pixi (MIT), Cockos WDL (zlib-style, readable) | read code + docs; quote API shapes; recommend adoption (decision deferred to phase 5 per verdict (c)) | — |
| READ (GPL) | Kdenlive, Olive, Ardour, Blender, Vital, Surge XT | read source **for patterns only**; describe behavior in our own words; cite file paths in their repos | copying code, copying identifiers wholesale, porting algorithms line-by-line |
| OBSERVE (closed) | REAPER, CapCut (installed); Ableton Live, Premiere (only if owner installs) | use the app; read on-disk config/keymap files (e.g. REAPER `reaper-kb.ini`, `reaper.ini`); screenshots for our notes only | decompiling/disassembling binaries; copying proprietary assets (icons, images, sounds) into the repo |

Computer use: only when no other session holds it (check `~/.claude/.locks/` + ask). Clones of READ/ADOPT repos go to
`~/Development/_refs/<name>` (outside the product repo; treated as untrusted data — never executed).

## Topics → references → consumers

| Topic file | Primary references | Feeds |
|---|---|---|
| `selection.md` | Blender (active vs selected, box/lasso modifiers), Ardour (region/track selection), Kdenlive, React Aria `useSelection`/collections | systems/selection · O02 O03 O06 O08 |
| `keyboard-focus.md` | React Aria focus scopes/`useKeyboard`, Blender keymap model (contexts/modal maps), REAPER `reaper-kb.ini` (sections/contexts), Ardour key bindings, cmdk | systems/focus-keyboard + conflict check · O11 |
| `undo.md` | Ardour (command/diff + memento), Blender (global undo steps, undo history), Kdenlive (QUndoStack macros), Olive | systems/undo · O16 |
| `drag-drop.md` | React Aria DnD (drop targets, keyboard DnD), dockview DnD, Kdenlive (bin → timeline, effect → clip), Ableton (observe) | systems/drag-drop · O03 O04 O10 |
| `zoom-scroll.md` | Ardour/Kdenlive/Olive timeline zoom (anchor at cursor/playhead), REAPER (observe + ini), OTIO time model | systems/zoom-scroll · S05 |
| `context-menus.md` | React Aria `Menu`/`MenuTrigger`, Blueprint ContextMenu, Blender (context-specific menus), REAPER (observe) | systems/context-menus · all O |
| `docking-workspaces.md` | dockview (layout serialization, floating groups, popouts), Blender workspaces/areas, Kdenlive layouts | systems/docking · O17 · verdict (c) evidence |
| `states-empty-loading-error.md` | Blueprint NonIdealState, React Aria patterns, Olive/Kdenlive empty bins | systems/states · D7 |
| `tokens-density.md` | Blueprint (dense desktop), Tweakpane (param density), Vital/Surge (instrument UI density), WDL/REAPER theming | systems/tokens · D5 D6 |
| `devices-params.md` | Vital/Surge XT (param model, modulation assignment UX, macro knobs), Tweakpane (bindings), Ableton (observe device chain) | O04 O05 |
| `automation-modulation.md` | Ardour automation (modes, lanes, thinning), Vital/Surge mod matrix + drag-to-modulate, REAPER envelopes (observe) | O06 O07 |
| `timeline-edit.md` | OTIO data model, Kdenlive/Olive (trim modes, ripple/roll/slip/slide), Ardour (edit modes, grid) | O02 O03 O09 |
| `preview-compositing.md` | Pixi (render layer/filters), Olive node compositor, Blender compositor, Photoshop-layer model (D1/D2) | O08 S03 |
| `command-palette.md` | cmdk, Blender F3 search, REAPER action list (observe) | systems/focus-keyboard · O11 |
| `performance-midi.md` | Ableton session/pads (observe), Surge/Vital MIDI learn, REAPER (observe) | O12 O13 |

## Execution order

1. ADOPT + READ tiers (code/docs, no computer use) — parallel readers, one per topic cluster, each adjudicated by one orchestrator check.
2. OBSERVE tier — REAPER/CapCut on-disk config first (no computer use), then behavioral observation via computer use when free.
3. Ableton/Premiere observation only after the owner installs them.

## Status

| Topic | ADOPT/READ | OBSERVE | Adjudicated |
|---|---|---|---|
| (all) | — | — | — |
