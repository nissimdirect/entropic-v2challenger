# Feature areas — DRAFT taxonomy (owner confirms at the phase-1 ★; then Y is fixed)

Derived from `frontend/src/renderer/components/*` dirs + `openspec/changes/*` + `docs/roadmap/` subjects.
Each area gets exactly one spec in `docs/spec/features/<id>.md` (phase 4).

| id | Area | Code anchors (dirs/stores) | Planned changes feeding it |
|---|---|---|---|
| A01 | App shell, layout, panels, focus mode, statusbar | components/layout, statusbar · stores/layout | ui-foundation, layout-session |
| A02 | Tool rail + tool modes | layout rail, tool-icons · default-shortcuts tool_* | ui-foundation, D4/D4a/D10, w15b |
| A03 | Browser / library / presets | components/library, effects browser · stores/browser, library | browser-folders, wave0-prerouted-presets |
| A04 | Timeline: tracks (Track=Layer), clips, edit ops, markers, loop, zoom/scroll | components/timeline · stores/timeline, trackDrag | 01/02/03 per-track, w15b-grid-track-paradigm |
| A05 | LAYER panel / inspector (right dock, selection-driven, D3) | components/inspector | ui-foundation, util-transform |
| A06 | Device chain + effects (cards, params, groups/racks, mix) | components/device-chain, effects · stores/effects | fx-afterimage, fx-backspin |
| A07 | Automation (lanes, modes, record, curve ops, triggers) | components/automation · stores/automation | D8, D13, D13.1, automation-* plans |
| A08 | Modulation, operators, routing (LFO, matrix, sidechain, routing canvas, LayerTap, field mapping) | components/operators, routing-canvas · stores/operators | layertap-matte-v1, chain-tap-preview, 2026-07-field-mapping |
| A09 | Masking, mattes, selection tools, keying, AI matte | components/masking · stores/aiMatte | MASKING-INTERACTIONS, SELECTION-MASKING-SPEC, MK12 |
| A10 | Instruments + sampler (drum rack, frame bank, granulator, clip editor) | components/instruments · stores/instruments | sampler-clip-editor, synth-paradigm vision |
| A11 | Performance mode (pads, perform track, multicam switcher) | components/performance · stores/performance, performanceFreeze | B2 performance-track-sampler, multicam brief |
| A12 | Preview, monitors, pop-out, multiwindow | components/preview · pop-out-entry | device-monitors-v1, multiwindow-stage-a, chain-tap-preview |
| A13 | Transport + playback | components/transport · stores/engine | D13 transport cluster |
| A14 | Audio (tracks, waveform, bake, master bus) | components/audio · stores/audio | master-out-bus PRD, audio bake checklist |
| A15 | Text tracks | components/text | — |
| A16 | Export (dialog, per-track, current frame) | components/export, dialogs/ExportDialog · stores/export | 05-export-pertrack |
| A17 | Project lifecycle + persistence (new/open/save, autosave, unsaved gate, onboarding) | project-persistence.ts · stores/project, onboarding | 06-persistence-cleanup, ONBOARDING-SPEC |
| A18 | History / undo panel | stores/undo | history-panel-delta |
| A19 | MIDI (mapping, learn, CC record) | stores/midi, midiMapMode | — |
| A20 | Preferences, about, feedback, support bundle, system monitor | components/dialogs | system-monitor-v1 |
| A21 | Freeze / render cache / memory pressure | stores/freeze, memoryPressure | 04-freeze-pertrack |
| A22 | Generators (live generators, moire) | backend generators surfaced in browser | aa3-live-generators, moire BDD |
| A23 | Transform gizmo (on-canvas) | — | util-transform |

Cross-cutting systems (phase 3, not counted in Y): selection · focus/keyboard · undo granularity · drag-drop · zoom/scroll · context menus · docking/workspaces · empty/loading/error · tokens/density.
