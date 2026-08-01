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

## PK.C1 — R/L/T/D + Overdub → transport (BUILT — C2 mock ruling locked)

> **SUPERSEDES the original packet text above this note.** The C2 mock
> ruling (owner, 2026-07-31 evening, artifact cf8ac3c1
> "draw-omitted-overdub-truth") is now LOCKED — see
> RATIFIED-FOUNDATIONS.md D13 for the full ratified contract and owner
> quotes. Every point below is what actually shipped:
>
> 1. **Timecode moves OUT of the transport bar** to under the preview
>    window — centered beneath the preview canvas, `--cx-text-label` (13px,
>    was `--cx-text-data` 12px), same current/total `m:ss.s` format
>    (`App.tsx` `formatTimecode`, `.app__preview-timecode`).
> 2. **Automation cluster joins the transport bar** attached to the
>    playback cluster (Option B), NOT right-aligned as the original text
>    said: play ■ loop, then a fused segmented control with full words —
>    **Read · Touch · Latch** (that order, not the store's internal
>    read/latch/touch/draw order) — plus an Overdub toggle chip beside it.
>    **Draw is omitted** from the selector (owner: "omit draw") — the
>    `'draw'` `AutomationMode` stays in the store and lane-level painting
>    keeps working; the transport just doesn't offer it. When `mode ===
>    'draw'`, none of the three chips match it, so the segmented control
>    shows none lit — falls out of the plain equality check, no
>    special-casing, never crashes, never coerces the store value.
>    Testids: `automation-mode-{read|touch|latch}` (no `draw` chip),
>    `overdub-toggle` (new — the old `overdub-toggle-btn` in
>    AutomationToolbar.tsx is gone, migrated by testid per the note below).
> 3. **Loop glyph replaced**: owner called the old orbit-arrows glyph
>    "wonky af" (read as refresh). New glyph is a bracketed-cycle — two
>    rounded brackets with chasing arrows — geometry ported verbatim from
>    the mock's `svg.loopb` (`transport-icons.tsx`).
> 4. **Far right of the bar stays empty/reserved** for `system-monitor-v1`'s
>    future CPU/MEM meters — a code comment marks the reservation; no meter
>    markup ships here. The centered playback+automation cluster's existing
>    `margin: 0 auto` already leaves this space empty structurally.
> 5. **Curve-visibility contract** (owner condition: "as long as the
>    resultant curves and stuff will be visible"): a recording pass (Touch,
>    Latch, or lane-level draw) must never write to an invisible lane — it
>    auto-reveals the armed track's lane the moment it starts writing
>    (`ParamPanel.tsx` `handleKnobChange`; `AutomationDraw.tsx`
>    `handleMouseDown`; `Track.tsx`'s draw-overlay mount no longer requires
>    `automationLanes[0].isVisible`, since that gate blocked ever drawing on
>    a hidden lane in the first place).
> 6. AutomationToolbar.tsx keeps: arm hint + `+ Lane / + Trigger / + Mod`
>    (armed-track-scoped). The Mode selector and Overdub button are REMOVED
>    from it — migrated by testid, not position (W1-11 lesson); its tests
>    updated honestly (automation-toolbar.test.tsx).
> 7. Hover text on every mode chip + Overdub is COMPONENT-SPEC §2½'s legend,
>    verbatim (see D13 for the exact strings).
>
> Oracle tally: vitest component tests for the transport cluster
> (app-transport-automation.test.tsx), the curve-visibility contract
> (param-panel-recording-visibility.test.tsx,
> automation-draw-visibility.test.tsx), the loop glyph
> (transport-icons.test.tsx), and AutomationToolbar's negative assertions
> (automation-toolbar.test.tsx). Baseline REDESIGN regen (transport bar
> shows in every shell-baselines.spec.ts surface). A5 CU pass before merge.

## Sequencing

A1 → A2/A3/A4 parallelizable after A1 · B1 → B2 · C2 mock → owner ruling →
C1. B and A are independent lanes. File-claim map (full paths, for the cross-change guard):
`frontend/src/renderer/components/timeline/Timeline.tsx` ·
`frontend/src/renderer/components/timeline/Track.tsx` ·
`frontend/src/renderer/components/timeline/InspectorTrack.tsx` ·
`frontend/src/renderer/components/automation/AutomationToolbar.tsx` ·
`frontend/src/renderer/stores/timeline.ts` ·
`frontend/src/renderer/styles/tokens.css` ·
`frontend/src/renderer/App.tsx` (PK.C1: transport-bar region PLUS the
preview-window timecode addition the C2 ruling required — the timecode
moved OUT of the transport-bar region into the `app__preview` region,
immediately after the `<PreviewControls>` mount; disjoint from
browser-folders' claimed `<ToolRail />` mount line in that same region) ·
`frontend/src/renderer/components/effects/ParamPanel.tsx` (PK.C1: curve-
visibility reveal-on-record, `handleKnobChange` only) ·
`frontend/src/renderer/components/automation/AutomationDraw.tsx` (PK.C1:
curve-visibility reveal-on-stroke, `handleMouseDown` only) — App.tsx is
ALSO claimed by the unmerged browser-folders change (sidebar render switch
+ ToolRail mount): non-overlapping regions, reconciled in
RECONCILIATIONS.md row R2.
