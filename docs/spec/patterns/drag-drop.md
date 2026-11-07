# Pattern teardown: drag and drop

Tiers: React Aria DnD = ADOPT (Apache-2.0; implementation lives in `react-spectrum/packages/react-aria/src/dnd/`, re-exported by `@react-aria/dnd` `packages/@react-aria/dnd/src/index.ts`, state in `@react-stately/dnd` 3.8.1, `@react-aria/dnd` 3.12.1 per their package.json). Kdenlive, Olive, Ardour = READ (GPL, behavior in own words). Refs in `~/Development/_refs/`.

## Problem in Creatrix today

Source: `docs/spec/inventory/INVENTORY.md` section "Drag & drop" (lines 474-536), verified against `frontend/src`.

**Payload types in use** (HTML5 `dataTransfer`):
- `EFFECT_DRAG_TYPE = 'application/x-entropic-effect-id'` (`components/effects/EffectBrowser.tsx:25`): JSON `{kind: fx|op|operator|composite|instruments, id: "builtin:<id>"}`, set by EffectBrowser (`:447`), operator entries (`effects/operator-drag.ts:79`), InstrumentsBrowser (`instruments/InstrumentsBrowser.tsx:177`).
- `CREATRIX_NONCE_TYPE` (session nonce) set next to every EFFECT payload (`EffectBrowser.tsx:448`, `operator-drag.ts:83`, `InstrumentsBrowser.tsx:178`) and validated on drop (`DeviceChain.tsx:206-213`, `operator-drag.ts:105` parse). This is Creatrix's own anti-spoof control (qa-redteam H1/H2 comments in `DeviceChain.tsx:~207`).
- `INSTRUMENT_DRAG_TYPE` (`InstrumentsBrowser.tsx:180`), `PARAM_PROBE_DRAG_TYPE` (`effects/ParamPanel.tsx:122`), `ROUTING_SOURCE_DRAG_TYPE` (`routing-canvas/NodeColumn.tsx:188`), `application/entropic-preset` (`library/PresetCard.tsx:22`), `text/plain` fallback.
- OS file drops (`dataTransfer.files`) at the app root `AppInner` (`App.tsx:3566-3572`, handler `handleGlobalDrop` `:3427`): max 8 files, extension allow-list, lane geometry read from the DOM to decide "new track" vs existing (`App.tsx:~3440-3450`).

**Drop targets**: AppInner root (files), `DeviceChain` effect strip (`DeviceChain.tsx:181-213`, `:467`), `DeviceCard` param rows (`DeviceCard.tsx:416-417`) and card-level operator drop (`:224-234`), `InspectorTrackLane` (probe, `timeline/InspectorTrack.tsx:173,194,219`), `TrackHeader` x2 and `UnifiedTrackHeader` (`timeline/Track.tsx:306-341,457-502`, `UnifiedTrackHeader.tsx:180`), routing `NodeColumn` (`NodeColumn.tsx:143-149`).

**Gaps found**
1. **`application/entropic-preset` has a drag source but no drop consumer.** Only `setData` appears (`PresetCard.tsx:22`); grep over `frontend/src` finds no `getData` of that type. Dragging a preset therefore does nothing on drop (click-to-apply is the only path, `PresetCard.tsx:~25`).
2. **No keyboard or pointer-less path** to any drag: every drag source is a mouse `draggable` element; every drop target is `onDrop/onDragOver`. Effects are added by click (`EffectBrowser handleAdd`), but track-reorder, routing-source connect, probe-to-lane and instrument-onto-track have no equivalent non-drag action documented here.
3. **Drop targets append, they do not choose an index.** `DeviceChain` handler adds the effect to the end of the chain (`DeviceChain.tsx:193-215` via `dispatchChain().add`, `:129-131`); reorder uses a separate path (`reorderEffect`, `:153`). There is no insertion indicator in the effect strip for new drops (`isDragOver` is a whole-strip highlight, `:177-193`).
4. **Two parallel drag systems.** Clip move/trim and track reorder use pointer events (`Clip.tsx:305,378-420,591`; transient reorder state in `stores/trackDrag.ts`), while browsers use HTML5 DnD. Clips set `draggable={false}` on the thumbnail (`Clip.tsx:701`) to avoid collision.
5. **No Esc-cancel** for pointer drags (see `undo.md` Problem 5); HTML5 DnD cancels natively.
6. **dragleave highlight clearing** relies on `currentTarget === target` (`DeviceChain.tsx:189-190`); fragile when child elements exist (`DeviceChain.tsx:494` EmptyState child).
7. **Autoscroll while dragging a clip** is hand-rolled (`Clip.tsx:437-474` rAF `tickAutoScroll`); no equivalent in the device chain or browser lists.
8. Toast copy handles wrong-target drops ("Instruments can only be dropped on a MIDI track", `Track.tsx:~345`); invalid targets are otherwise given no pre-drop feedback except `preventDefault` omission.

## Patterns

| # | Pattern | Source + tier | Behavior (own words) | Fit / conflict vs RATIFIED | Feeds |
|---|---|---|---|---|---|
| G1 | Drag source contract: `getItems()` supplies typed items; start/move/end callbacks; allowed operations declared by the source | React Aria `react-aria/src/dnd/useDrag.ts:51-67` (`onDragStart`, `onDragMove`, `onDragEnd`, `getItems`, `getAllowedDropOperations`), `:73` (`hasDragButton`) - ADOPT | The source declares what it carries and what operations it allows; the drop target decides among them. | Fits: Creatrix sources already build payloads in one place each; a single `getItems` shape would replace six `setData` sites. | systems/drag-drop |
| G2 | Drop target contract: `getDropOperation(types, allowedOps)` returns `copy`/`link`/`move`/`cancel`; enter/move/activate/exit/drop events | React Aria `useDrop.ts:56-76`; op type `@react-types/shared/src/dnd.d.ts:22` - ADOPT | A target answers "would I accept this, and as what" before drop; `cancel` = not a target. Maps cleanly onto Creatrix's `dropEffect = 'copy'|'link'` use (`DeviceChain.tsx:183`, `NodeColumn.tsx:145`). | Fits. Formalizes the existing per-target `types.includes` + `preventDefault` check. | systems/drag-drop |
| G3 | Typed items (`text` with a set of type strings; `file`; `directory`) | React Aria `@react-types/shared/src/dnd.d.ts:66-92` - ADOPT | Payloads carry a set of types, readable before drop without exposing contents. | Partial: Creatrix's session nonce (own anti-spoof control) has no React Aria equivalent; keep the nonce, treat it as an app-level validation layered on top. | systems/drag-drop · trust boundary |
| G4 | Keyboard drag session: Tab / Shift+Tab move between valid drop targets, Enter drops, Alt+Enter activates, Esc cancels | React Aria `react-aria/src/dnd/DragManager.ts:231-258` (key handling), live-region announcements `:209`, `:644`, `:688`; strings `react-aria/intl/dnd/en-US.json:12` - ADOPT | A virtual drag mode where focus walks the drop targets and screen-reader messages announce state. | Fits an a11y goal; no ratified row contradicts. Interacts with keyboard-conflict check: Tab/Enter/Esc become modal during a session. | systems/focus-keyboard · systems/drag-drop |
| G5 | Drop position `on` / `before` / `after` + drop indicators with labels | `@react-types/shared/src/dnd.d.ts:110,122`; `react-aria/src/dnd/useDropIndicator.ts:110-118` (`aria-roledescription`, `aria-label`) - ADOPT | Collections report where in the list the drop lands; an indicator element exposes it to AT. | Fits Problem 3 (append-only): effect strip, track list, and pad lists could report an index. | O04 O10 |
| G6 | Edge auto-scroll | React Aria `react-aria/src/dnd/useAutoScroll.ts:20-27` (20 px edge zone, rAF loop, `move`/`stop`) - ADOPT | A small hook scrolls the nearest scrollable ancestor when the pointer nears an edge. | Fits Problem 7; Creatrix's timeline autoscroll (`Clip.tsx:437-474`) is the same idea hand-rolled. | O03 O10 |
| G7 | Drop to insert with undo, position and track resolved from drop point | Kdenlive `src/timeline2/model/timelinemodel.hpp:515` (`requestClipInsertion(binClipId, trackId, position, ..., logUndo, ..., useTargets, undo, redo)`); `timelinefunctions.hpp:146-148` (`insertZone`, overwrite flag) - READ (GPL) | Dropping a bin item onto the timeline is a model request with position+track, a "use target tracks" option, and its own undo. | Fits file-drop and browser-to-lane drops: one drop = one undo entry (`undo.md` rec 1/7). | systems/drag-drop · O02 O03 |
| G8 | Preview without touching the model | Kdenlive `timelinemodel.hpp:475-478` (`requestFakeClipMove`, `requestFakeGroupMove`); Olive `tool/import.cpp:52-131` (`DragEnter` builds ghosts, `DragMove` offsets and snaps them, ghosts cleared on cancel) - READ (GPL) | While dragging, a ghost shows the would-be placement and snaps; nothing is committed until release. | Fits D11 (translucency = transient/preview). Today Creatrix shows only a whole-target highlight (`isDragOver`). | O03 · D11 |
| G9 | Drag lifecycle with explicit abort | Ardour `gtk2_ardour/editor_drag.h:197-213` (`motion`, `finished`, `aborted`) - READ (GPL) | Esc and focus loss map to `aborted`, not `finished`. | Fits Problem 5 for pointer drags. | systems/drag-drop · undo |
| G10 | Native drag image / non-conflicting thumbnail drags | React Aria `useDrag.ts` + `DragPreview.tsx` (`preview` ref, `useDrag.ts:62`) - ADOPT | A custom preview node replaces the browser's default image. | Evidence only; Creatrix sets `text/plain` fallback and default image. Visual change not ratified. | D5 D6 |

## Recommendation for the spec

1. **One drag-payload registry (G1, G2, G3).** Spec table: type -> payload schema -> allowed targets -> resulting action -> undo label. Seed with the inventory list above; keep nonce validation as part of every in-app type (Creatrix-specific, not from any reference). `PARAM_PROBE`, `ROUTING_SOURCE`, `INSTRUMENT`, `PRESET` each get a row.
2. **Resolve the preset drag (Problem 1).** Either specify the missing drop targets (device chain strip, track header) or remove the drag source; do not leave an inert draggable. Mark as a spec decision for the owner.
3. **Drop-target feedback (G2, G8):** each target states accept / reject styling in COMPONENT-SPEC tokens, and a reject path with copy. Rejection copy follows D7 (minimal hint text).
4. **Insertion index for list targets (G5):** the effect strip reports `before/after` index; spec adds a one-line insertion indicator (accent colour) rather than a whole-strip highlight. Append remains the default when dropped on empty area.
5. **Cancel semantics (G9, G4 Esc):** Esc cancels any in-flight pointer drag with no state change and no undo entry; HTML5 drags rely on native cancel.
6. **Keyboard alternatives (G4):** every drag action has a command path (menu or palette) that performs the same action on the selected target; a virtual keyboard drag session is optional and, if adopted, defers to the focus-keyboard spec for Tab/Enter/Esc ownership.
7. **File drop (G7):** one drop of N files = one undo entry; target track resolved from drop point as today (`App.tsx:3440-3450`), batch cap and allow-list stay as stated.
8. **Autoscroll (G6)** is a shared behavior for every scrollable drop surface, not a clip-only feature.

## Library evidence (React Aria DnD, ADOPT tier)

- **API fit:** `useDrag`/`useDrop` are element-level hooks over native HTML5 DnD with a keyboard/virtual layer (`DragManager.ts`). They cover G1-G6. Collections hooks (`useDroppableCollection`, `useDraggableCollection`) assume React Aria collection semantics, which Creatrix's Zustand lists do not use (cost to adopt).
- **Pointer-event drags are out of scope:** clip move/trim/reorder are pointer-driven and would stay hand-written (Problem 4).
- **A11y:** the main differentiator - keyboard drag, live announcements, labelled drop indicators (`useDropIndicator.ts:110-118`), all built in; Creatrix has none of this today.
- **License:** Apache-2.0. **Maintenance:** actively structured monorepo; `react-aria` package consolidates the older `@react-aria/*` names (the `@react-aria/dnd` entry file is a thin re-export of `react-aria/useDrag`, `react-aria/useDrop`).
- **Bundle size:** not measured in this pass; neutral.
- **Risk:** the Electron renderer sets its own nonce/payload formats; React Aria's `getItems` uses its own item objects, so payload registry (Rec 1) would sit on top. Decision deferred (owner verdict c).

## Candidate additions (owner approval required)

- **Virtual keyboard drag session with screen-reader announcements** (G4) - new accessibility feature.
- **Drop-position insertion indicators in lists** where none exist (G5).
- **Ghost previews for browser -> lane drops** (G8).
- **Preset drag-and-drop onto tracks/devices** if the owner wants the existing drag source to work (Problem 1).
