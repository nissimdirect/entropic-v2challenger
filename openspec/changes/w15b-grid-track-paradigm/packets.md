# W1.5b packets — executor contracts

> Executors: verbatim contracts. Anchors verified at main @ 455fd76 — re-verify
> the symbol if a line moved; do NOT re-derive designs. Every packet: full
> `npx --no vitest run` green · all three ratchets at unchanged ceilings ·
> `npm run build` BEFORE any e2e/baseline verification (e2e launches the
> prebuilt `out/` bundle — stale-bundle trap) · baseline regen uses
> `--update-snapshots=all` (bare flag silently no-ops in Playwright 1.58.2) ·
> declared-change or REDESIGN rows in the PR body · TRACEABILITY section ·
> DO NOT MERGE (orchestrator adjudicates + CU pass per A5).

## PK.A1 — grid overlay layer

- Extract the gradient from `Timeline.tsx:302-310` into an absolutely
  positioned overlay div inside the tracks content wrapper: full
  `contentWidth` × full track-bed height, `pointer-events: none`, z-order
  above lane backgrounds and below clips/playhead/LoopRegion/markers
  (read the existing stacking at `Timeline.tsx:298-340` first; playhead and
  LoopRegion are siblings in the same wrapper).
- Renders whenever `quantizeEnabled && bpm` — no selection dependency.
- New semantic tokens in tokens.css: `--cx-grid-beat` (subtle), `--cx-grid-bar`
  (stronger) — replaces the hardcoded `#333`; hex lives ONLY in tokens.css.
- Oracle: vitest component test — quantize on ⇒ overlay present with
  nonzero computed height even when zero clips exist and regardless of
  which track is selected; quantize off ⇒ absent. Inline-style ratchet must
  not rise: build the gradient from CSS custom properties, not new inline
  hex.

## PK.A2 — LOD coarsening (depends: A1)

- Replace the `gridPx < 10 → no grid` branch: compute the finest level from
  `{division, beat, bar, 4-bar}` whose spacing ≥ 10px; render that level.
  Bar lines always use `--cx-grid-bar`; sub-bar lines `--cx-grid-beat`. Two
  gradients stacked (bar layer + beat layer) is acceptable.
- Oracle: unit tests over the level-selection function (pure, exported):
  division visible at high zoom; extreme zoom-out yields bar or 4-bar lines,
  NEVER none while Q on; boundary exactness at 10px.

## PK.A3 — granularity readout chip

- Status bar (`StatusBar` component — grep `creatrix v` for the right
  cluster W15a QF8 touched) gains `data-testid="quantize-readout"`:
  `1/16 · bar 2.0s @ 120` from layout store division + project BPM. Hidden
  when Q off. infoText per COMPONENT-SPEC §2½.
- Oracle: vitest — readout text for {division 1/4, bpm 120} and {1/16, 90};
  hidden when Q off; updates on BPM change.

## PK.A4 — time-range selection (depends: A1; OD-2 default unless owner vetoes)

- Store: `timeline.ts` gains `selectionRegion: {in: number, out: number} | null`
  + `setSelectionRegion/clearSelectionRegion`. Undo-transparent (not an
  undoable edit — match how transient UI state is handled elsewhere in the
  store; verify with undo.ts before wiring).
- Interaction: pointer-drag on lane bed (empty area of any lane incl. master,
  NOT on a clip — clips keep their drag semantics) creates the region; live
  preview while dragging; snap in/out to active grid level when Q on; free
  drag when off. Esc clears. `Cmd+L` copies selectionRegion → loopRegion
  (registered via shortcutRegistry; check collision — grep existing meta+l).
- Render: highlight band in the same overlay stack as A1 (above grid, below
  clips).
- CRITICAL Gate-13 note: lane-bed pointer handlers already exist for marquee/
  clip interactions — grep `onPointerDown` across `Timeline.tsx`, `Track.tsx`,
  lane components and integrate; do not stack a second competing handler.
- Oracle: vitest store tests (snap math at 3 divisions × 2 bpm; Esc; Cmd+L
  copies exactly) + component test (drag on empty lane produces band;
  drag on a clip does NOT).
- STOP if: lane-bed drag is already claimed by an existing interaction that
  cannot coexist (report the conflicting handler file:line, propose modifier
  key split, wait).

## PK.B1 — unified track header

- One `UnifiedTrackHeader` (components/timeline/) with capability props
  `{arm, blend, mute, solo, visibility, typeBadge}`; slot order
  `[arm][swatch][name][badge][blend][M][S][eye]`. All four current headers
  (`TrackHeader`, `AudioTrackHeader`, `InspectorTrack.tsx:36`,
  `MasterTrackHeader`) become thin wrappers or die; the render fork at
  `Timeline.tsx:312-339` collapses to capability lookup by `track.type`.
  Master: same component + amber identity modifier (`--cx-master-bg` D11) +
  its existing no-clips lane.
- Preserve EVERY existing testid and interaction (rename flow, drag-reorder
  via useTrackDragReorder, context menu, arm/mute/solo handlers) — this is a
  refactor with a visual-unification goal, not a behavior change. Type badges:
  icon-kit glyphs (video/midi/text/scope/master) — extend tool-icons.tsx
  pattern; no emoji (PK.H2 sweep stands).
- Oracle: existing timeline-ui + track tests all green UNMODIFIED except
  where they asserted per-type visual forks (update those honestly, cite
  this packet); new test: every track.type renders identical slot sequence
  (assert DOM order of testid slots per type).
- REDESIGN row: every baseline containing track headers changes; regen
  (=all) + ×2 green.

## PK.B2 — scroll-selected-into-view (depends: B1)

- `selectTrack` effects (or a subscriber in Timeline) scroll the selected
  header row into view within the track column (scrollIntoView block:
  'nearest'; respect prefers-reduced-motion — instant, no smooth scroll).
  Works from every selection surface (header click no-ops — already visible;
  LayerPanel/status/other panels trigger the scroll).
- Oracle: vitest with a scrolled container — selecting an out-of-view track
  updates scrollTop; in-view selection leaves scrollTop unchanged.

## PK.C1 — R/L/T/D + Overdub → transport (GATED on the C2 mock ruling)

- Move the MODES segmented control + Overdub toggle from
  `AutomationToolbar.tsx` into the transport bar as a right-aligned group;
  wiring unchanged (`useAutomationStore` setMode/setRecordMode). Testids:
  `automation-mode-{read|latch|touch|draw}`, `overdub-toggle`.
- AutomationToolbar keeps: arm hint, `+ Lane / + Trigger / + Mod`, lane list.
- e2e: grep tests targeting the toolbar's mode buttons before moving; migrate
  by testid, never position (W1-11 lesson).
- Oracle: vitest — mode change from transport reflects in store + lane UI;
  baseline REDESIGN regen; A5 CU pass mandatory before merge.

## Sequencing

A1 → A2/A3/A4 parallelizable after A1 · B1 → B2 · C2 mock → owner ruling →
C1. B and A are independent lanes. File-claim map (full paths, for the cross-change guard):
`frontend/src/renderer/components/timeline/Timeline.tsx` ·
`frontend/src/renderer/components/timeline/Track.tsx` ·
`frontend/src/renderer/components/timeline/InspectorTrack.tsx` ·
`frontend/src/renderer/components/automation/AutomationToolbar.tsx` ·
`frontend/src/renderer/stores/timeline.ts` ·
`frontend/src/renderer/styles/tokens.css` ·
`frontend/src/renderer/App.tsx` (PK.C1: transport-bar region ONLY —
App.tsx:3498-3577) — App.tsx is ALSO claimed by the unmerged
browser-folders change (sidebar render switch + preview-row regions):
non-overlapping regions, reconciled in RECONCILIATIONS.md row R2.
