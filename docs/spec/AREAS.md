# Spec structure — LOCKED 2026-11-04 — FOUR LENSES + a coverage guard (v2, owner ★1: "be as extra as possible — no contradictions or gaps")

v1 (23 code areas) is kept as lens A below. Every inventory item must be accounted for in EVERY lens;
`docs/spec/tools/coverage.mjs` (phase 3 deliverable) fails on any gap or double-ownership.

## The rule that makes it gap-proof

| Lens | Unit | Owns | Guard (script, fails CI-style) |
|---|---|---|---|
| **D · Objects** (PRIMARY — one spec each, owner template) | `features/O<nn>-<object>.md` | states + every action on the object | every Zustand action, menu command, hotkey, context-menu item, drag source/target, dialog, empty state in `inventory.json` is claimed by **exactly one** object spec (0 = gap, 2 = contradiction risk) |
| **B · Surfaces** (index) | `surfaces/S<nn>-<surface>.md` | what is visible/where, density, empty/loading/error per region | every component in `inventory.json` mounts in **≥1** surface; every object action has **≥1** surface entry point (FRONTEND-SDLC §5 "UI unreachable" cure) |
| **C · Jobs** (acceptance journeys) | `journeys/J<nn>-<job>.md` | end-to-end task as an ordered list of object actions with oracles | every object action appears in **≥1** journey, or is listed as `journey-exempt` with a reason |
| **A · Code areas** (cross-check) | the 23 rows below | — | every source file in `frontend/src/renderer` maps to ≥1 object spec |
| **Systems** (phase 3) | `systems/<system>.md` | one rule per interaction class | every hotkey/gesture/drag/context-menu row in object specs is checked against the global maps: one key+context+surface = one meaning |

Progress is reported per lens: **X of Y object specs · S of 10 surfaces · J of 8 journeys · systems 0 of 9**.

## D · Objects — **LOCKED by owner 2026-11-04 (★1). Y = 17.**

| id | Object | Sub-types / parts | Main code anchors |
|---|---|---|---|
| O01 | Project | settings, autosave, unsaved gate, onboarding state | project-persistence.ts · stores/project, onboarding, settings |
| O02 | Track = Layer (D2) | video, text, audio, performance, inspector, master; z-order, lock, mute/solo, color, blend/opacity (D3 panel) | stores/timeline · components/timeline (headers) |
| O03 | Clip | video/image, text, audio; trim/slip/slide/split/ripple, speed, reverse, gain, color, transform | stores/timeline · Clip.tsx, AudioClipView.tsx |
| O04 | Device | effect, instrument (sampler, frame bank, granulator, drum/sample rack), generator, group/rack, mix | stores/effects, instruments · components/device-chain, instruments |
| O05 | Parameter | knob/slider/number/select; MIDI-learn target; probe | components/common, DeviceCard |
| O06 | Automation lane | points, curves, modes (D13.1), record/write modes, triggers, curve ops (D8) | stores/automation · components/automation |
| O07 | Modulation route | operators (LFO, sidechain, Kentaro…), matrix edges, routing canvas, LayerTap, field mapping | stores/operators · components/operators, routing-canvas |
| O08 | Selection & mask | preview selection tools, mask stack nodes, mattes, AI matte, keys | stores/timeline (mask fields), aiMatte · components/masking, preview overlays |
| O09 | Marker & loop region | markers, loop in/out, selection region | stores/timeline |
| O10 | Library item | effect/preset/generator/media entries, folders, favorites, search | stores/browser, library · components/library, effects browser |
| O11 | Tool | the 14 rail tools in 6 groups (D4a), modes, cycle keys | ToolRail.tsx · default-shortcuts tool_* |
| O12 | Pad & performance | pads, perform mode, switcher group (multicam) | stores/performance, performanceFreeze · components/performance |
| O13 | MIDI mapping | CC map, banks/slots, learn mode, controller profiles | stores/midi, midiMapMode |
| O14 | Freeze / render cache | freeze prefix, flatten, memory pressure | stores/freeze, memoryPressure |
| O15 | Export job | dialog, per-track, current frame, queue | stores/export · dialogs/ExportDialog |
| O16 | History entry | undo stack, history panel, branches | stores/undo |
| O17 | Panel / window / workspace | dock regions, pop-out, monitors, system monitor, layout persistence | stores/layout · pop-out-entry, components/layout |

## B · Surfaces (index, 1280×800 REAL-DIMENSIONS)

S01 Unified rail (D10) · S02 Browser/drawer · S03 Preview + overlays · S04 Transport bar (D13) · S05 Arrangement (tracks=layers, lanes) · S06 LAYER panel right dock (D3) · S07 Device chain · S08 Floating windows/monitors/pop-out · S09 Menus, context menus, dialogs · S10 Statusbar + toasts

## C · Jobs (acceptance journeys)

J01 Start/open/save/recover a project · J02 Import & organize media · J03 Arrange layers in time · J04 Add & tweak effects/instruments · J05 Animate (automation + modulation) · J06 Select, mask & composite · J07 Perform live · J08 Render & export

## A · Code areas (v1, retained as cross-check)

A01 shell/layout · A02 tool rail · A03 browser/library/presets · A04 timeline · A05 LAYER panel · A06 device chain/effects · A07 automation · A08 modulation/routing · A09 masking · A10 instruments/sampler · A11 performance/multicam · A12 preview/monitors/multiwindow · A13 transport · A14 audio · A15 text tracks · A16 export · A17 project/persistence · A18 history · A19 MIDI · A20 prefs/about/feedback/system monitor · A21 freeze/cache · A22 generators · A23 transform gizmo.
(Reader outputs in `inventory/semantic/*.json` are keyed by these ids; `coverage.mjs` maps A → O.)
