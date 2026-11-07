# Pattern teardown: timeline zoom, scroll, and time model

Tiers: OpenTimelineIO = ADOPT (Apache-2.0). Kdenlive, Olive, Ardour = READ (GPL, patterns only, own words). REAPER observation is a separate phase and not covered here. Refs in `~/Development/_refs/`.

## Problem in Creatrix today

1. **Zoom does not keep any point fixed.** Cmd/Ctrl+wheel and pinch call only `setZoom` (`components/timeline/Timeline.tsx:287-289`, gesture `:303`); keyboard zoom does the same (`App.tsx:707-714`). `scrollX` is never recomputed, so the time under the cursor (or playhead) jumps away on every zoom step. Playhead position is `time*zoom - scrollX` (`Playhead.tsx:14`), so it drifts too.
2. **Zoom factor ignores wheel magnitude.** The comment says "Scale delta proportionally" but the code uses a fixed 0.9 / 1.1 per event based on sign of `deltaY` (`Timeline.tsx:285-289`); a high-frequency trackpad pinch (each event carries `ctrlKey`) therefore zooms by a fixed percent per event, and the gesture handler multiplies by `ge.scale` every event with no baseline (`:303`).
3. **Clamp rules are inconsistent and duplicated.** Zoom bounds 0.5-500 appear in the store (`stores/timeline.ts:2448`), wheel (`Timeline.tsx:289,303`), keyboard (`App.tsx:709,713`), `ZoomScroll` slider (`ZoomScroll.tsx:15-16`) and fit (`App.tsx:2190`). Scroll max is `(duration+1)*zoom` in the store (`stores/timeline.ts:2450-2452`) but `(duration+1)*zoom - clientWidth` in the wheel handler (`Timeline.tsx:292`).
4. **Fit is approximate.** `zoom_fit` uses `window.innerWidth * 0.6` as the "viewport" (`App.tsx:715-719`) and the import auto-fit does the same with an explicit "approximate" comment (`App.tsx:2188`); neither reads the real lane-area width nor resets `scrollX` in the shortcut path (import path does, `App.tsx:2192`). `contentWidth` has a minimum for empty timelines (`Timeline.tsx:313-320`).
5. **Two writers for `scrollX`.** The native scroll event writes the store from `scrollLeft` (`Timeline.tsx:216`), the wheel handler writes it from `deltaX` (`:293`), and the content is positioned by `marginLeft: -scrollX` (`:430`). Which of them is authoritative for horizontal movement was not resolved in this read; the spec should name one owner.
6. **Wheel semantics.** Plain wheel pans horizontally with `deltaX` only (`Timeline.tsx:293`); a vertical-only mouse wheel does not pan time, and there is no Shift+wheel mapping. Vertical scroll is native on the tracks container, kept in sync with the headers column (`Timeline.tsx:205-220`).
7. **Zoom control is a linear slider over a 1000x range.** `ZoomScroll.tsx` renders `Slider min=0.5 max=500 default=50 type=float` (`:12-19`) and a px/s readout (`:24`). No follow-playhead / auto-scroll-on-playback was found (grep of `Timeline.tsx` and `App.tsx` for follow/auto-scroll shows only unrelated hits).
8. **Time is float seconds**; the ruler picks tick interval from `targetPx/zoom` (`TimeRuler.tsx:41-43`) and starts at `scrollX/zoom` (`:54`).

## Patterns

| # | Pattern | Source + tier | Behavior (own words) | Fit / conflict vs RATIFIED | Feeds |
|---|---|---|---|---|---|
| Z1 | Zoom keeps the time under the mouse fixed | Kdenlive `src/timeline2/view/qml/Timeline.qml:558` (`zoomOnMouse`), `:613-619` (`onTimeScaleChanged`: new scroll = time-at-mouse x new scale - mouse x), `src/timeline2/view/timelinecontroller.h:191` (`setScaleFactorOnMouse`) - READ (GPL) | Before changing scale, remember the time under the cursor; after, set the scroll offset so that time stays under the same pixel. | Fits; no ratified row touches zoom. Direct fix for Problem 1. | S05 · systems/zoom-scroll |
| Z2 | Selectable zoom focus: Left / Right / Center / Playhead / Mouse / Edit | Ardour `gtk2_ardour/editing_syms.inc.h:73-78` (`ZoomFocus*`), `editing_context.cc:522-526` (radio actions), `:3247-3263` (cycle), `:3371-3406` (per-focus anchoring), `editor_ops.cc:9426-9433` (`effective_zoom_focus`: "edit" focus degrades to mouse when edit point is mouse) - READ (GPL) | A user setting picks the anchor for zoom (keyboard zoom needs one since there is no mouse point). | Fits partially: keyboard zoom needs an anchor (playhead is the natural default); a user-selectable focus is extra UI -> Candidate addition. | S05 |
| Z3 | Mouse anchor for wheel/pinch, centered-playhead override | Kdenlive `Timeline.qml:613-619` (a "centered playhead" setting wins over mouse anchor; if everything fits, scroll resets to 0) - READ (GPL) | Precedence list: content fits -> scroll 0; follow-mode -> center playhead; wheel zoom -> mouse anchor; otherwise playhead-centered. | Fits; gives the spec a deterministic precedence order. | systems/zoom-scroll |
| Z4 | Modifier-keyed wheel: Ctrl+wheel zooms with accumulated delta steps; Alt and Shift change axis/behavior | Kdenlive `Timeline.qml:227-258` (`zoomByWheel`, `wheelAccumulatedDelta`, `defaultDeltasPerStep`), `:261-290` (`horizontalScroll`, `verticalScroll` clamped to content) - READ (GPL) | Wheel events are accumulated until a threshold equals one "step", so high-resolution trackpads and notched wheels both give predictable zoom. Shift swaps scroll axis. | Fits Problem 2 and 6. Cmd+scroll/pinch conventions are in `CLAUDE.md` shortcut table (Cmd+scroll = zoom, Scroll = horizontal pan). Shift+wheel is a keyboard-conflict check item. | systems/zoom-scroll · focus-keyboard |
| Z5 | Zoom-to-selection and step zoom with scroll adjusted | Olive `app/widget/timelinewidget/tool/zoom.cpp:68-75` (fit: scale = viewport width / selected width, capped at max scale; scroll to the left edge), `:80-92` (step x0.5 / x2.0, then re-adjust scroll) - READ (GPL) | Zoom tool zooms to a dragged region; clicking steps, then recomputes scroll so the clicked area stays visible. | Fits as "fit to selection range" (D12 selectionRegion). Zoom-as-a-tool is an Olive rail choice; Creatrix rail (D4a/D10) has no zoom tool -> do not add; take only fit-to-range. | S05 · D12 |
| Z6 | Zoom steps in the editor derive from the viewport, not constants | Ardour `gtk2_ardour/editor_ops.cc` `temporal_zoom_selection`/`temporal_zoom_step` (~9440-9460: zoom to selection, falls back to step) - READ (GPL) | Fit uses the real canvas width and the extents of what is selected; falls back to a step when nothing is selected. | Fits Problem 4. | S05 |
| Z7 | Visual-change batching: zoom + leftmost position applied together | Ardour `gtk2_ardour/editor.cc:3802-3829,3895` (`pending_visual_change`, `reposition_and_zoom(leftmost, samples_per_pixel)`) - READ (GPL) | Scale and scroll position are one atomic change, applied once per redraw. | Fits Problem 1 and 5: Creatrix should have one `setView({zoom, scrollX})` store action rather than two. | systems/zoom-scroll |
| Z8 | Rational time + time ranges | OTIO `src/opentime/rationalTime.h`, `timeRange.h`; `clip.h` ranges - ADOPT | Time is `value @ rate`; ranges are `(start, duration)`; end is exclusive. | Evidence only: matches the ruler needing frame-aligned ticks at high zoom; Creatrix uses float seconds. Adoption deferred. | S05 · timeline-edit E3 |
| Z9 | Scale clamped to a data-derived maximum | Olive `zoom.cpp:71` (`GetMaximumScale()` caps fit) - READ (GPL) | Max zoom comes from the timeline's finest unit; min from content length. | Suggests deriving the bounds from frame rate and duration instead of the constant 0.5/500. | S05 |

## Recommendation for the spec

1. **Single view action (Z7).** One store action sets `{zoom, scrollX}` together with one clamp function; all callers (wheel, pinch, keyboard, slider, fit, import auto-fit) go through it (Problems 3, 5).
2. **Anchor rule with precedence (Z1, Z3).** (a) content narrower than viewport -> scroll 0; (b) follow-playhead on -> playhead stays centered; (c) pointer inside the timeline -> time under pointer fixed; (d) otherwise playhead fixed (keyboard zoom and slider).
3. **Wheel semantics (Z4).** Cmd/Ctrl+wheel and pinch zoom; plain wheel pans time using the dominant of `deltaX`/`deltaY` when the pointer is over the lane area (pending the keyboard/focus spec), native vertical scroll over the track list; Shift swaps axes. Zoom steps scale with accumulated delta (not a fixed 0.9/1.1), and pinch uses a gesture-start baseline.
4. **Real viewport fit (Z6, Problem 4).** `zoom_fit` and import auto-fit read the lane viewport width from the DOM (via the timeline's own ref) and reset scroll in both paths; bounds come from one constants module (Problem 3).
5. **Fit to selection range (Z5).** With a `selectionRegion` present, fit zooms to it; otherwise fit zooms to content (Ardour falls back the same way, Z6).
6. **Name one owner of `scrollX` (Problem 5).** Either the native scroll container drives it (wheel handler sets `scrollLeft`) or the store drives it (`overflow` hidden); the spec records the choice.
7. **Ruler tick policy stays a function of px/s** (`TimeRuler.tsx:41-43`); spec lists minimum label spacing in tokens (D6 12 px floor applies to ruler labels).
8. **Time unit open decision (Z8):** float seconds today; frame-exact is the owner's call (shared with `timeline-edit.md` E3).

## Library evidence

OpenTimelineIO (ADOPT): provides time vocabulary (`RationalTime`, `TimeRange`) but no UI or zoom model; C++/Python only, so nothing consumable by the Electron renderer at runtime. Use as vocabulary for the spec only. No other ADOPT library covers zoom/scroll. Decision deferred.

## Candidate additions (owner approval required)

- **User-selectable zoom focus** (Left/Center/Playhead/Mouse) (Z2).
- **Follow-playhead / centered-playhead mode** (Z3) - no existing Creatrix behavior was found for it.
- **Zoom to selection range** (Z5) - small new action; tied to D12's `selectionRegion`.
- **Frame-exact rational time** (Z8).
