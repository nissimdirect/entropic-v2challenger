# W1.5b — Quantize Grid System · Unified Track Paradigm · Automation Cluster Relocation

> **Origin:** owner's second and third live walks of merged W1 (2026-07-31). Every
> requirement below traces to a verbatim owner quote. Sibling of W1.5a (PR #486,
> merged 455fd76) which took the mechanical items; this change takes the three
> feature-scale directives. Anchors verified against main @ 455fd76.

## Workstream A — Quantize grid system

Owner: *"the quantization grid should show up across every track always [when
enabled] … when I click and select a region it should be locked to the
quantization grid … I should be able to select it even if there are no clips …
there should be an actual [readout] like is this 16th notes? … on the bottom
right like in Ableton … at a certain level of zooming out it doesn't really
[show] it."*

Root causes (verified in code):
1. **Grid paints under the lanes.** The grid is a CSS `repeating-linear-gradient`
   on the tracks-scroll content container (`Timeline.tsx:302-310`); every track
   lane and the master lane draw opaque backgrounds over it, so it is visible
   only in exposed strips. W1-6/W15a making master *more* opaque made this
   *worse* — correctly, per D11; the grid must move, not the lanes.
2. **LOD vanish.** `if (gridPx < 10) return {}` (`Timeline.tsx:306`) deletes the
   grid entirely once lines would be <10px apart — division changes appear to
   do nothing when zoomed out.
3. **No region selection exists** on empty lane area; `LoopRegion` is the only
   range concept and is set elsewhere.
4. Grid color is a hardcoded `#333` inline style (grandfathered ratchet debt).

Requirements:
- **A1 Grid overlay:** grid renders as a dedicated overlay layer above lane
  backgrounds, below clips/playhead/loop-region, spanning the full
  `contentWidth`, whenever `quantizeEnabled` — independent of selection.
  Tokenized colors (`--cx-grid-beat`, `--cx-grid-bar`) in tokens.css.
- **A2 LOD coarsening:** when division lines fall under the density floor,
  coarsen to the next musical level (division → beat → bar → 4-bar) instead of
  vanishing; bar lines render stronger than beat lines at every zoom.
- **A3 Granularity readout:** status-bar right cluster gains a readout chip —
  division, bar length in seconds at current BPM (e.g. `1/16 · bar 2.0s @ 120`).
  Updates live with BPM/division/quantize state; hidden when Q off.
- **A4 Region selection:** click-drag on any lane bed (empty or not, any track,
  master included) creates a visible time-range selection; snapped to the grid
  when Q on, free when off. Esc clears. See OD-2 for loop interplay.

## Workstream B — Unified track paradigm

Owner: *"there needs to be like a common paradigm between all the different
track types … Why do the tracks that I've added from the plus track button look
different than the ones that I get from the [+ MIDI, + Inspector]? And why is
that different from master? should be the same pattern."*

Ground truth: four header components render four different patterns —
`TrackHeader`, `AudioTrackHeader`, `InspectorTrackHeader` (`InspectorTrack.tsx:36`),
`MasterTrackHeader`, forked at `Timeline.tsx:312-339`.

Requirements:
- **B1 One header component**, capability-driven: slot order
  `[arm ○][swatch][name][type badge][blend chip][M][S][eye]` for every type,
  master included (master keeps amber identity + top-border and its no-clips
  lane; absent capabilities leave an empty slot, never a reflowed layout).
  Type badge = small icon-kit glyph per type.
- **B2 Scroll-selected-into-view:** selecting a track from any surface scrolls
  its header row into the track-column viewport. (Origin: the "stale Track 3"
  investigation — panels can truthfully show a selection whose row is outside
  the viewport; W15a's QF4 tests proved no leak exists.)
- **B3 Inspector track rename** to its honest function (OD-1) and it joins the
  unified pattern. Creation stays unexposed (W15a QF6) pending the W3 Info
  View decision.

## Workstream C — Automation cluster relocation

Owner: *"the RLTD overdub lane trigger mod thing … should probably go up top. I
kind of disagree with the looseness of how you've created this left side
windowing thing."* (Also first-walk: *"if they are recorded overdub controls
they should be up top."*)

Ground truth: R/L/T/D are **global** automation modes
(`useAutomationStore.mode`, `AutomationToolbar.tsx:34-39`; Read/Latch/Touch/
Draw) and Overdub is `recordMode` — global state, correctly belongs in global
chrome. `+ Lane / + Trigger / + Mod` act on the **armed track's** lanes —
contextual, stays with the lane area.

Requirements:
- **C1:** R/L/T/D segmented control + Overdub toggle move into the transport
  bar as a right-aligned group (after the playback cluster). Testids per
  control. AutomationToolbar keeps arm-hint + `+ Lane / + Trigger / + Mod`.
- **C2:** REAL-DIMENSIONS mock of the resulting transport bar BEFORE build
  (1280×800; the bar already hosts BPM · snap · Q · division · playback ·
  timecode — crowding is the risk; the mock rules the final grouping).

## Open decisions

| # | Question | Recommendation | Status |
|---|---|---|---|
| OD-1 | Rename inspector track: Scope / Monitor / Meter | **Scope** (it renders live signal scopes) | awaiting owner |
| OD-2 | Region-selection ↔ loop interplay | drag = time-range selection; `Cmd+L` sets loop from selection (Ableton grammar); loop brace stays independently draggable | recommended default, owner may veto at UAT |
| OD-3 | Sidebar "+ Add Text Track" button folds into unified creation | yes, but rides W2's sidebar rework, not this change | deferred to W2 |

## Non-goals

Inspector/Scope feature fate (W3 Info View decides) · sidebar/browser rework
(W2) · Browse-button removal (W2/P9) · left-panel "windowing looseness"
restructure (W2 reconciliation surfaces it as its own item) · MIDI/audio
lane *content* rendering changes.
