---
title: B2(-lite) — Performance Track + draggable Sampler instantiation (the corrected B1 UX)
created: 2026-06-05
status: plan — awaiting go-ahead
origin: user correction 2026-06-05 — "sampler should be an option in instruments, drag it to a midi track, then drag the video on it." B1's single button is the wrong model.
ground_truth: this week's Creatrix specs (cited inline). Flow is ~90% spec'd; the drag-video-to-load gesture is the user's addition.
supersedes_ux: PR #155 InstrumentsPanel button ("Add Sampler from current clip")
---

# B2-lite — Performance Track + Sampler instantiation

> Builds the real Ableton-style instrument flow on the **existing `performance` track type** (schema exists, zero UI today) + the **existing HTML5 drag pattern** (EffectBrowser → DeviceChain via `dataTransfer`). Track-bound (user decision). No polyphony / voice FSM / pads yet — that's full B2.

## Spec basis (cited)
- Instruments tab = "RACKS" folder, draggable: Drum Rack · Sampler · Wavetable — `PLAN.md:191`.
- Performance Track via `Cmd+Shift+T`, electric blue, holds triggers not footage — `INSTRUMENTS.md:74`.
- Drag primary + double-click-to-selected-track; payload `{kind:"instruments", id}` — `PLAN.md:203,210`, `DECISIONS.md:43`.
- Sampler editor renders in the device-chain row when the Performance Track is selected — `INSTRUMENTS.md:77`.
- Load-video-into-sampler: NOT spec'd → **user's addition**: drop a video onto the track's Sampler sets `clipId`.

## Work items
- [ ] **Instruments browser** — replace `InstrumentsPanel` button with a "RACKS" list: **Sampler** draggable (`draggable`, `dataTransfer` `INSTRUMENT_DRAG_TYPE` = `{kind:'instruments', id:'sampler'}`), Drum Rack + Wavetable shown disabled ("coming soon"). Reuse `EffectBrowser` drag idiom.
- [ ] **Performance track creation** — extend `timeline.addTrack` to accept `'performance'`; add `Cmd+Shift+T` shortcut; "+ Add Track" becomes Video/MIDI menu (decision Q1=opt-1). Electric-blue styling.
- [ ] **Render the performance track** in the timeline (it has no footage clips — show its instrument/trigger lane; today nothing renders performance tracks).
- [ ] **Track-bound instruments store** — change `useInstrumentsStore` from one global `instrument` to `instruments: Record<trackId, SamplerInstrumentV1>` (per-track). `addSampler(trackId, …)` / `updateSampler(trackId, …)` / `removeSampler(trackId)` / source-set.
- [ ] **Drag Sampler → performance track** — drop handler on the performance track creates its track-bound sampler (clipId initially empty). (Double-click adds to selected track too.)
- [ ] **Device-chain row editor** — when a performance track is selected, the bottom panel renders the `SamplerDevice` (start/speed/opacity/blend) for that track's sampler (mirrors how selecting a video track shows its effect chain).
- [ ] **Drag video → the track's Sampler** — drop a project asset/clip onto the Sampler (device row or the track) → sets that sampler's `clipId`. Empty sampler renders nothing until sourced.
- [ ] **Render path** — generalize `buildSamplerLayer` to iterate performance tracks' samplers (each → a composite layer) instead of the single global instrument.
- [ ] **Persistence** — serialize/restore per-track samplers (extend the #156 pattern from global to track-keyed).

## Test Plan
### What to test
- [ ] Instruments tab shows a RACKS list; Sampler is draggable; Drum Rack/Wavetable disabled.
- [ ] `Cmd+Shift+T` (and the menu) creates a performance track, visibly distinct (electric blue), no footage clips.
- [ ] Dragging Sampler onto a performance track instantiates a track-bound sampler; selecting the track shows its SamplerDevice in the device-chain row.
- [ ] Dropping a video onto the track's Sampler sets its source; preview then shows the sampler layer; speed/start/opacity/blend work per-track.
- [ ] Two performance tracks each own independent samplers/sources.
- [ ] Save → reload → performance tracks + their samplers + sources persist.
### Edge cases
- [ ] Drag Sampler onto a non-performance (video/audio/text) track → rejected or no-op (decision: reject).
- [ ] Empty sampler (no source dropped) → renders nothing, no crash/NaN.
- [ ] Drop a non-video asset onto the sampler → rejected.
- [ ] Remove the performance track → its sampler is cleaned up (no orphan in store/render).
- [ ] Drag-end vs click (drag-end shouldn't trigger select-deselect — see feedback_drag-end-suppresses-click).
### How to verify
- `cd frontend && npx --no vitest run` — store (track-bound CRUD), buildSamplerLayer (multi-track), drag-payload, persistence round-trip.
- Manual (CU/you): the full drag flow end-to-end.
### Patterns to follow
- Drag: `EffectBrowser.tsx` `handleDragStart` + `DeviceChain` drop target.
- Track type plumbing: `addAudioTrack` (the audio track type was added similarly).
- RULE 1.5: drag idiom is the proven EffectBrowser one (cited), not invented.

## Risks / notes
- Track-bound store is a breaking change to the #156 global-sampler persistence — coordinate (or land after #156 merges).
- Performance-track timeline rendering is net-new (nothing renders that type today).
- This is ~B1-sized × 2. Deserves its own focused build + a wiring/UAT pass.
