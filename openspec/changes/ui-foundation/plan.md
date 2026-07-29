# Plan — ui-foundation

Consolidated for a cold packetizer: every packet below is one-shottable from this file + the cited
file:line facts. All citations were captured by this session's ground-truth mapper and spot-checked
3/3 against the live tree while drafting this plan (`ToolRail.tsx:114` size=18 confirmed;
`tool-rail.css:52-95` button/badge/label rules confirmed verbatim; `MasterTrack.tsx:200`
`TRACK_HEIGHT = 60` vs. `timeline.css:1355` `height: 76px` drift confirmed). No pre-existing
tool-rail test file was found (`find frontend/src -iname "*ToolRail*"` returns only the component
itself) — Packet B authors the regression suite from scratch.

## Sequencing (single-flight, binding)

**Packet A (tokens) first**, since B/C/D/E/F/G's typography changes consume its tiers.
**{E, F, G} (pure bug fixes) may run fully parallel to A and to each other** — none touches
`tokens.css` or reads the new tiers; they are positional/structural fixes, not size fixes.
**{B, C, D} run parallel to each other after A merges** — each owns disjoint files (tool rail vs.
automation strip vs. empty states) but all three apply A's tokens to their surface.

```
A ──┬─→ B
    ├─→ C
    └─→ D
E (parallel to everything)
F (parallel to everything)
G (parallel to everything)
```

Rebase rule: if any packet in this change lands before a Lane-2 feature packet that also touches
`tool-rail.css`, `automation.css`, `global.css`, `device-chain.css`, or `timeline.css`, the Lane-2
packet rebases onto this change's merged diff (this change is the priority frame fix; Lane-2
features are downstream consumers, per `PLANNING-QUEUE.md`'s cross-lane rebase convention already
in force for Wave-0/LayerTap).

**Build-order gate:** this entire change merges after `wave0-prerouted-presets` Packet 00 (CI green)
and before every Lane-2 feature packet (`browser-folders`, `fx-afterimage`, `fx-backspin`,
`system-monitor-v1`, `multiwindow-stage-a`, `layertap-matte-v1`, `history-panel-delta`,
`util-transform`) — per `PLANNING-QUEUE.md` Lane 3 item 10.

---

## Packet A — Type-scale + Schoger hierarchy tokens

| Field | Value |
|---|---|
| Risk | MED |
| Files | `frontend/src/renderer/styles/tokens.css` (extend `--cx-text-*`, add `--cx-text-heading`, add `--cx-control-h`); typography-only line changes (font-size/weight/color, no layout restructuring) in the 8 diagnosed surfaces: `tool-rail.css` (group-label, hotkey badge), `automation.css` (button labels, hint/armed text), `timeline.css` (`.master-track-lane__label`, `.master-track-header__badge`), `global.css` (`.effect-browser__tabs`, `.preview-canvas__placeholder`, `.app__transport-*`), `device-chain.css` (`.device-chain__header`, `.device-chain__empty`) |
| Hard oracle | `grep -ohE "font-size:\s*[0-9.]+px" frontend/src/renderer/styles/*.css \| sort -n \| uniq -c` shows zero values <11px in the touched files · `hex-ratchet.sh` count ≤ current `.hex-ceiling` (no new raw hex — every color goes through an existing or newly-added semantic token) · vitest snapshot per touched component's typography classlist |

### Code-ground verification (this session)

Confirmed via the ground-truth mapper's histogram: 395 `font-size` declarations across
`frontend/src/renderer/styles/*.css`, clustering at 11/12/12.5/13/9/14/8/9.5/7px — 36+ below the
DESIGN-SPEC's own declared 11px floor (`docs/UAT-RESULTS-2026-07-03.md:71-73` independently caught
`b3-layout.css` at 9–9.5px and `device-chain.css` at 7–8px "live today"). `tokens.css:97-103`
defines exactly 3 semantic size tokens today; only 15/395 sites reference them (rest hardcode raw
px) — confirmed via grep, hits confined to `demos.css`/`midi-map.css`, i.e. effectively unused in
the shell. `tokens.css:101-102`'s own comments admit the weight system is aspirational
("approximated as 400/500 until Plex variable") — there is no `--cx-weight-*` token at all; 108 raw
`font-weight` declarations exist with no tier mapping. Both `--cx-font-ui` and `--cx-font-mono`
alias the identical `'JetBrains Mono'` stack (`tokens.css:98-100`, `TODO(plex-swap)`) — confirms the
LOCKED DESIGN PRINCIPLE (mono-only hierarchy) is not fighting a half-shipped Plex migration, it is
formalizing what's already true on disk.

### Normative contract

1. Add `--cx-text-heading: 14px` to `tokens.css` Tier 1 typography block (`tokens.css:97-103`
   region), paired with a new `--cx-weight-heading: 650` and reuse of `--cx-text-1` for color — see
   proposal.md OD-1 table for the full 4-tier spec. Add `--cx-control-h: 22px` alongside the
   existing `--cx-row-h`/`--cx-panel-header`/`--cx-device-param-h` density tokens.
2. Bump `--cx-text-label`'s weight comment from "approximated as 500" to a real `--cx-weight-label:
   600` token (first real weight token in the file — do not leave it approximated any longer).
3. Apply tiers to the 8 surfaces' EXISTING typography rules only (swap raw `font-size`/`font-weight`/
   `color` declarations for the matching token; do not add new DOM nodes or restructure layout —
   that's B/C/D/E/F/G's job). Concretely: `.tool-rail__group-label` 8px→`--cx-text-data` (11px);
   `.tool-rail__hotkey` 7px→`--cx-text-data`; `.master-track-lane__label` 10px→`--cx-text-body`;
   `.master-track-header__badge` stays 11px (already at floor) but adopt `--cx-text-data` token
   instead of the raw `11px` literal; `.effect-browser__tabs` labels → `--cx-text-label`;
   `.preview-canvas__placeholder` → `--cx-text-heading` for the primary line (OD-4 adds the DOM
   split; this packet only tokenizes what exists pre-split, or lands after D if sequencing makes
   that cleaner — see landmine below); `.device-chain__header`/`.device-chain__empty` →
   `--cx-text-heading`/`--cx-text-body` respectively; `.app__transport-btn`/`-bpm input`/`-select` →
   `--cx-control-h` for height, existing label sizes → `--cx-text-label`.
4. Do not touch `--cx-font-ui`/`--cx-font-mono` or their `TODO(plex-swap)` comments — out of scope
   per the LOCKED DESIGN PRINCIPLE.

### Landmine

Packet A's typography-only edits to `.preview-canvas__placeholder` and `.device-chain__empty`
overlap the SAME lines Packet D restructures (D adds DOM nodes — heading + body + CTA button — to
what today is a single text node). **Resolve by sequencing, not file-splitting:** either (a) Packet
A lands its raw-hex/size token swap first and D rebases the restructure on top, or (b) if A and D
are packetized to land same-day, D absorbs A's token application for those two files only and A's
own contract note (3, above) is scoped down to the other 6 surfaces for those two files. State
explicitly in the packet contract which resolution was chosen at execution time — do not let both
packets independently touch the same lines.

---

## Packet B — Tool rail refinement

| Field | Value |
|---|---|
| Risk | LOW |
| Files | `frontend/src/renderer/components/layout/ToolRail.tsx` (icon size prop, badge JSX position); `frontend/src/renderer/styles/tool-rail.css` (`.tool-rail__tool`, `.tool-rail__hotkey`, `.tool-rail__group-label`, `.tool-rail__group` gap/padding); **new** `frontend/src/__tests__/tool-rail.test.tsx` (regression suite, no prior file exists) |
| Hard oracle | new vitest suite asserts: icon `size` prop == 16 (down from 18, OD-3); hotkey badge `font-size` resolves to `--cx-text-data` (11px) and its computed position does not overlap the icon's bounding box (JSDOM getBoundingClientRect check, or a documented visual-regression screenshot diff if JSDOM geometry is unavailable); group-label resolves to `--cx-text-data`; `F_CREATRIX_LAYOUT` off → `.cx-preview-row` still resolves to `display: contents` (flag-off path unaffected, regression-guarded) |

### Code-ground verification (this session)

`ToolRail.tsx:114` — `<ToolIcon name={icon} size={18} />` — confirmed live, larger than
DESIGN-SPEC's own reference point ("legible at 16px", `docs/roadmap/DESIGN-SPEC.md:259-269`).
`tool-rail.css:52-65` — `.tool-rail__tool` is `width:32px height:30px`; `:89-95` —
`.tool-rail__hotkey` is `position:absolute right:2px bottom:1px font-size:7px`; `:45-50` —
`.tool-rail__group-label` is `font-size:8px`. `tool-rail.css:19-30` — rail is `44px` wide, `gap:3px`
between tools; `:39-43` — `4px` margin/padding between groups. `ToolRail.tsx:27` / `tool-rail.css:9-17`
— mounted only under `F_CREATRIX_LAYOUT`; flag-off uses `display:contents` on `.cx-preview-row` to
collapse the rail out of layout — this packet must not touch that mount condition, only the rail's
internal sizing.

**Surprise from the mapper, load-bearing for this packet's framing:** the icon glyph itself (18px)
is NOT undersized relative to spec — it's already larger than the 16px reference. The user's
"~12px icons" impression is the 32×30px button + 7px badge sharing one small footprint, not the
icon. This packet's fix is corner-collision relief (badge repositioning + floor), not icon growth —
resist the instinct to grow the icon further; OD-3 explicitly shrinks it 18→16 to free clearance.

### Normative contract

Per OD-3: icon `size={16}` (was 18); hotkey badge → `--cx-text-data` (11px), reposition to
`top: 2px; right: 2px` (was `right: 2px; bottom: 1px` — top-right clears more of the glyph's visual
mass for the 14 Block icons than bottom-right does, per the mockup's own icon set); group-label →
`--cx-text-data`; `.tool-rail__group` gap `3px→4px` (tools within a group), inter-group
margin/padding `4px→8px`. If the badge still visually collides with any of the 14 icons at these
values (spot-check all 14 via the new test's snapshot), escalate per OD-3's fallback: widen
`.tool-rail__tool` and the rail itself by 4px (`32×30`→`36×32`, rail `44px`→`48px`) rather than
shrinking the badge back below the 11px floor.

---

## Packet C — Automation control-strip grouping

| Field | Value |
|---|---|
| Risk | LOW |
| Files | `frontend/src/renderer/components/automation/AutomationToolbar.tsx` (wrap the 9 ungrouped buttons into 2 new grouping `<div>`s); `frontend/src/renderer/styles/automation.css` (`.auto-toolbar` flex-wrap, new group-divider rules, `.auto-toolbar__armed`/`.auto-toolbar__hint` reflow) |
| Hard oracle | vitest: all 13 buttons still present + clickable (no functional regression) · buttons render inside exactly 3 grouping containers (Mode / Record / Curve ops) · `.auto-toolbar` computed style has `flex-wrap: wrap` · at a narrow viewport width (component test with a constrained container), hint/armed text does not overflow the container's `scrollWidth` |

### Code-ground verification (this session)

`AutomationToolbar.tsx:36-41` — `MODES` array (R/L/T/D) already wrapped in `.auto-toolbar__modes`.
`:410-538` — the other 9 buttons (Overdub `:428`, +Lane `:443`, +Trigger `:454`, +Mod `:469`,
Flatten `:485`, Ramp `:494`, Shape `:507`, Simplify `:518`, Clear `:528`) are flat siblings, zero
wrapper. `automation.css:33-40` — `.auto-toolbar` is `display:flex; gap:8px;` with no `flex-wrap`.
`:108-121` — `.auto-toolbar__armed`/`.auto-toolbar__hint` both use `margin-left:auto`, guaranteeing
off-viewport overflow once the unwrapped button row already fills the width.

### Normative contract

Per OD-6: wrap the 9 buttons into `.auto-toolbar__record` (Overdub, +Lane, +Trigger, +Mod) and
`.auto-toolbar__curve-ops` (Flatten, Ramp, Shape, Simplify, Clear), each with a `border-left: 1px
solid var(--cx-line-1)` divider (matches `.tool-rail__group`'s existing divider convention — reuse
the pattern, don't invent a new one). Add `flex-wrap: wrap` to `.auto-toolbar`. Move
`.auto-toolbar__hint`/`__armed` off `margin-left: auto`; when the row wraps, they render on their
own line (`flex-basis: 100%` on wrap) instead of extending past the viewport edge. Apply
`--cx-text-label` to button labels and `--cx-text-body` to hint/armed text (ties to Packet A's
tokens — sequence after A per the DAG above).

---

## Packet D — Empty-state designs (preview / device-chain / timeline)

| Field | Value |
|---|---|
| Risk | LOW |
| Files | `frontend/src/renderer/components/preview/PreviewCanvas.tsx` + `global.css` (`.preview-canvas__placeholder` → heading+body+CTA structure); `frontend/src/renderer/components/device-chain/DeviceChain.tsx` + `device-chain.css` (`.device-chain__empty` → body-tier hint + CTA button; also removes/scopes the permanent `border-top: 1px solid var(--cx-selection)` stray rule, see below); `frontend/src/renderer/components/timeline/Timeline.tsx` (typography-only, its empty-state DOM already exists — do not restructure) |
| Hard oracle | vitest: preview empty-state renders heading text node + body text node + a button with an `onClick` that opens/focuses media import (reuses the existing `Cmd+I` import action, not a new import path) · device-chain empty-state's CTA button focuses the EFFECTS tab (reuses existing `sidebarTab` state, `App.tsx:433`) · the stray `border-top` rule is confirmed intentional-and-scoped (renders only when the chain has ≥1 device) or removed — pick one, do not leave it firing over empty state either way · pixel/screenshot diff: preview + device-chain empty states visually distinct from a populated state (no regression to the populated-state render) |

### Code-ground verification (this session)

`PreviewCanvas.tsx:189-192` — empty state is a single absolutely-positioned text node, "No video
loaded", no icon/CTA. `global.css:1141-1145` — `.preview-canvas__placeholder` is
`position:absolute; font-size:14px; color` only, no layout/CTA styling. Contrast: `Timeline.tsx:178-201`
already renders a real empty branch (hint + `Cmd+I` badge + two `+ Add Track`/`+ MIDI Track`
buttons) when `tracks.length === 0` — richer than preview's, confirming the complaint is really
"preview has the thinnest treatment in the app," not "timeline has none" (a partial contradiction
in the original diagnosis, noted by the mapper — this packet leaves Timeline's DOM alone and only
applies Packet A's typography tokens to it).

`DeviceChain.tsx:531-548` — empty branch renders a header (title + optional pad-context chip) above
a centered hint span, no CTA. `device-chain.css:3-12` — `.device-chain` (the OUTER container, both
empty and populated states) carries a **permanent** `border-top: 1px solid var(--cx-selection)`;
`--cx-selection` resolves to `--cx-mod` (`tokens.css:64`, `#8F7DFF`, violet) — this is the reported
"stray full-width purple rule," confirmed to render unconditionally regardless of chain contents,
not a rendering bug in the empty branch specifically but a container-level rule that reads as
misplaced when the chain is empty.

### Normative contract

Per OD-4: Preview — split `.preview-canvas__placeholder` into a heading line ("No footage loaded,"
`--cx-text-heading`) + body line ("Drag a clip here, or ⌘I to import," `--cx-text-body`) + an
"Import Media" button that invokes the same handler the existing `Cmd+I` shortcut calls (grep the
shortcut's handler in `App.tsx` at execution time — do not build a second import path). Device
chain — keep the header, upgrade `.device-chain__empty`'s hint to `--cx-text-body`, add a "Browse
Effects" button that sets `sidebarTab` to `'effects'`. For the stray border-top: scope it to fire
only when `chain.length > 0` (simplest fix, matches the "why is this here when empty" complaint
directly) — do not remove the rule outright, it's presumably intentional separation from the panel
above when the chain HAS content. Timeline: typography-token pass only (Packet A), zero DOM change.

---

## Packet E — Fix clipped master-bus/automation panel label (symptom 1)

| Field | Value |
|---|---|
| Risk | LOW |
| Files | `frontend/src/renderer/components/timeline/MasterTrack.tsx` (`TRACK_HEIGHT` const); `frontend/src/renderer/styles/timeline.css` (`.master-track-lane`, `.master-track-lane__label`) |
| Hard oracle | vitest: `.master-track-lane__label` computed style has `white-space: nowrap` + `overflow: hidden` + `text-overflow: ellipsis` (or, if width allows, wraps cleanly via `white-space: normal` — pick one strategy, see contract) — the string "Master bus — effects & automation only, no clips" never has a mid-word character silently dropped at any tested lane width · `MasterTrackLane`'s local `TRACK_HEIGHT` constant equals `timeline.css`'s `.master-track-lane` `height` value (drift regression guard) |

### Code-ground verification (this session)

`MasterTrack.tsx:221-223` — the exact clipped string lives in a `<span className="master-track-lane__label">`, rendered for every project (Master track is permanent/undeletable). `timeline.css:1354-1375` —
`.master-track-lane` is `height:76px; display:flex; align-items:center; justify-content:center;` with
no `min-width`/`overflow-x` handling; `.master-track-lane__label` sets only
`font-family`/`font-size:10px`/`letter-spacing`/`color` — no `white-space`, no `text-overflow`, no
`max-width` — the browser's default wrap behavior is what's silently dropping/clipping glyphs at
narrow lane widths / low timeline zoom. Separately: `MasterTrack.tsx:200` — local
`const TRACK_HEIGHT = 60` (sizes the `AutomationLaneComponent`/`AutomationDraw` overlays) vs.
`timeline.css:1355` — `.master-track-lane { height: 76px; }` — the two numbers have drifted apart;
the automation overlay and the visible lane background disagree on row height. Not the direct cause
of the clipping (different layers) but a concrete, previously-undetected inconsistency uncovered
investigating this symptom — fix in the same packet since it's the same component/file surface.

### Normative contract

Add `white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%;` to
`.master-track-lane__label` (simplest, matches how truncated labels are handled elsewhere in the
codebase — grep one sibling pattern at execution time and match it, don't invent a new truncation
convention) OR, if the lane is tall enough to wrap two lines cleanly at minimum practical width
(verify at execution time with the actual 76px height and typical narrow-window lane width), use
`white-space: normal; overflow-wrap: break-word;` instead — pick whichever avoids both mid-word
clipping AND a jarring ellipsis on a short, meaningful sentence; default to the ellipsis strategy if
undecided (matches existing app conventions more closely). Change `TRACK_HEIGHT = 60` → `TRACK_HEIGHT
= 76` in `MasterTrack.tsx` to match the CSS (or, if 60 was actually intentional for the automation
overlay's internal geometry independent of the visible row, rename it to something that doesn't
imply "the track's height" and add a comment explaining the intentional divergence — resolve which
at execution time, do not silently pick one without checking whether other code reads
`TRACK_HEIGHT` expecting 60).

---

## Packet F — Fix browser column chips (symptom 4)

| Field | Value |
|---|---|
| Risk | LOW |
| Files | `frontend/src/renderer/components/effects/EffectBrowser.tsx` (no JSX restructuring needed — see contract); `frontend/src/renderer/styles/global.css` (new `.effect-search__clear` rule block; `.effect-browser__tabs`/`.effect-browser__actions` spacing) |
| Hard oracle | vitest: `.effect-search__clear` resolves a non-empty computed `background`/`border`/`padding` (currently zero CSS rules match it at all — raw browser-default chrome) and is positioned inside `.effect-search`'s flex flow (not floating); `.effect-browser__tabs` and `.effect-browser__actions` have ≥8px of computed vertical separation (currently 2px margin, no top padding on actions) |

### Code-ground verification (this session)

`EffectBrowser.tsx:465-479` — the search-clear `×` button (`className="effect-search__clear"`,
`aria-label="Clear search"`). Grepped `frontend/src/renderer/styles/*.css` for
`effect-search__clear`: **zero matches** — it has no styling at all, rendering with raw OS button
chrome. `global.css:522-524` — `.effect-search { padding: 8px 12px; }`, no `position`/`flex` pairing
declared for input+button. Separately: `EffectBrowser.tsx:503-527` — the 5-tab category strip and
the `'+ Add Text Track'` action block are two sibling `<div>`s inside `.effect-browser`;
`global.css:579-589` — `.effect-browser__tabs` ends with `padding:0 6px 6px; margin-bottom:2px;
border-bottom:1px`; `:774-778` — `.effect-browser__actions` starts immediately after with
`padding:0 12px 8px`, no top padding — the 2px gap plus zero top-padding is what reads as a
collision.

### Normative contract

Add a `.effect-search__clear` rule block: `background: var(--cx-surface-3); border:
1px solid var(--cx-line-1); border-radius: var(--cx-radius-control); color: var(--cx-text-2);
width/height: 20px` (small square icon-button, matches `.preview-canvas__popout-btn`'s existing
icon-chip convention — reuse that pattern's dimensions rather than inventing new ones), plus
`:hover { background: var(--cx-surface-4); color: var(--cx-text-1); }`. Give `.effect-search` (the
parent) `display: flex; align-items: center; gap: 6px;` so input+clear-button sit in a defined flex
row instead of relying on default inline flow. Add `padding-top: 8px` to `.effect-browser__actions`
(the `+ Add Text Track` block) so it reads as a separated action row below the tab strip, not fused
to it.

---

## Packet G — Fix preview overlay-chip anchoring + transport row alignment (symptoms 6, 8)

| Field | Value |
|---|---|
| Risk | LOW |
| Files | `frontend/src/renderer/components/preview/PreviewCanvas.tsx` (wrap `.preview-canvas__fps` + `.preview-canvas__popout-btn` in a new `.preview-canvas__overlay-bar`); `frontend/src/renderer/styles/global.css` (`.preview-canvas__overlay-bar` new rule; `.app__transport-btn`/`-bpm input`/`-select` height); `frontend/src/renderer/App.tsx` (no structural change — see contract, height is CSS-only) |
| Hard oracle | vitest: FPS chip + pop-out button both render as children of `.preview-canvas__overlay-bar`, no independent `position: absolute` on either (regression guard against reverting to unanchored chips) · `.app__transport-btn`, `.app__transport-bpm input`, `.app__transport-select` all resolve the SAME computed `height` (currently 3 different heights via inconsistent padding/font-size, no explicit height on any of the three) |

### Code-ground verification (this session)

No component/class literally named "zoom pill" exists — grepped clean. Closest candidates, both
confirmed live: `global.css:1124-1133` — `.preview-canvas` is `position: relative`; `:1201-1214` —
`.preview-canvas__popout-btn` is `position: absolute; top: 4px; right: 4px`; `:1216-1230` —
`.preview-canvas__fps` is `position: absolute; top: 4px; left: 4px` (DEV-only numeric readout).
`PreviewCanvas.tsx:174-198` renders popout-btn, canvas, fps chip, and the placeholder together as
independent absolutely-positioned siblings — this is the "unanchored floating chips" root cause; a
third candidate (`PreviewControls.tsx:52-85`'s two lasso-mode icon buttons) is already in-flow in
the bottom control bar, not floating, and is NOT part of this fix.

Transport row: `global.css:54-65` — `.app__transport-btn` (Play/Stop/Loop/S/Q) is `padding: 2px 8px;
font-size: 12px`; `:92-101` — `.app__transport-bpm input` is `padding: 1px 4px; font-size: 11px`;
`:109-117` — `.app__transport-select` (the 1/1–1/32 quantize-division dropdown) is `padding: 1px
4px; font-size: 11px` — none of the three declares an explicit `height`, and native OS chrome
differs between `<button>`, `<input type=number>` (spinner arrows), and `<select>`, producing the
reported misalignment. `App.tsx:3674-3712` confirms all three live in the fixed top
`.app__transport-bar` (`global.css:34-47`, `height: 32px`, `position: fixed`) — single source, no
duplicate transport-row surface elsewhere (`Timeline.tsx:372`'s comment confirms the transport bar
was moved to the top, old timeline-local transport surface is gone).

### Normative contract

Per OD-5: wrap `.preview-canvas__fps` and `.preview-canvas__popout-btn` in a new
`.preview-canvas__overlay-bar` — `position: absolute; top: 0; left: 0; right: 0; display: flex;
justify-content: space-between; align-items: center; padding: 4px; pointer-events: none;` (children
re-enable `pointer-events: auto` individually so the bar itself doesn't block canvas interaction
underneath). FPS chip renders in the bar's start slot, pop-out button in the end slot — same visual
position as today, but now both are DOM children of one anchored container instead of two
independent absolutely-positioned elements, closing the "unanchored" gap structurally not just
visually.

Per OD-7: add `--cx-control-h: 22px` (Packet A) to `.app__transport-btn`, `.app__transport-bpm
input`, and `.app__transport-select` via `height: var(--cx-control-h); box-sizing: border-box;` —
apply to all three uniformly so native-chrome height differences are overridden rather than
papered over per-element. Sequence after Packet A (consumes its token) — if G must land before A
for scheduling reasons, hardcode `22px` in G and leave a `// TODO: route through --cx-control-h once
Packet A lands` comment, then a 1-line follow-up swaps it (do not block G on A if A slips).

---

## Test Plan

### Frontend unit/component (Vitest — `cd frontend && npx --no vitest run`; MUST use `--no` per
`CLAUDE.md` — global `npx vitest` picks up E2E specs)

- **Packet A:** typography-token snapshot per touched component (8 surfaces) — asserts no raw
  `font-size`/`font-weight` px literal remains in the touched selectors, only `var(--cx-text-*)`.
  Histogram regression test: a small script/test that greps `styles/*.css` for `font-size:\s*\d`
  patterns below 11px in the 8 touched files, fails if any exist (mirrors the diagnostic method
  itself, turned into a permanent CI guard — new, does not exist today).
- **Packet B (tool-rail regression suite, new file):** icon size, badge size/position, group-label
  size, all 14 tools' badge non-collision (snapshot per tool), `F_CREATRIX_LAYOUT` off → rail
  collapses via `display: contents`, unaffected by this packet's internal sizing changes.
- **Packet C:** all 13 buttons present + clickable inside exactly 3 grouping containers; `flex-wrap`
  computed; hint/armed text does not overflow a constrained-width test container.
- **Packet D:** preview empty-state renders heading+body+button, button invokes the real import
  handler (not a stub); device-chain empty-state CTA sets `sidebarTab` to `'effects'`; Timeline
  empty-state DOM unchanged (regression guard — this packet must NOT touch its structure).
- **Packet E:** `.master-track-lane__label` never clips mid-word at 3 tested lane widths (narrow /
  medium / full); `TRACK_HEIGHT` constant equals the CSS `height` value (drift regression test).
- **Packet F:** `.effect-search__clear` has non-empty computed style; `.effect-browser__tabs` /
  `.effect-browser__actions` vertical gap ≥ 8px.
- **Packet G:** FPS chip + pop-out button both children of `.preview-canvas__overlay-bar`, no
  independent `position: absolute`; the 3 transport controls resolve identical computed `height`.

### Visual / pixel / screenshot checks

- Before/after screenshot diff of: the tool rail (all 14 tools, both states — default and
  `--active`), the automation strip (13 buttons, wrapped and unwrapped viewport widths), the preview
  panel empty state, the device-chain empty state, the browser column (search + tabs + actions), the
  transport bar. Use the project's existing computer-use UAT flow (`docs/UAT-UIT-GUIDE.md` pattern)
  for the human-driven half of this; the vitest suites above are the falsifiable machine oracle —
  screenshots are corroborating evidence, never the sole pass/fail signal (mirrors wave0's own
  "screenshot is human spot-check ONLY" convention for Packet 3).
- `hex-ratchet.sh` run before/after each packet touching `styles/*.css` — count must not exceed
  `.hex-ceiling`; if a packet's fix happens to remove a hardcoded hex (e.g., Packet E's label rule
  currently has none to remove, but double-check at execution time), lower the ceiling in the same
  PR per the ratchet's own governance rule.

### Tool-rail regression suite (Packet B, new — explicit per the task brief)

`frontend/src/__tests__/tool-rail.test.tsx` — asserts, for all 14 Block tools: icon renders at
`size=16`; hotkey badge (where a hotkey exists) renders at `--cx-text-data` and does not visually
overlap the icon's rendered bounding box; group-label renders at `--cx-text-data`; the component
still responds to `data-testid="tool-rail-item-<id>"` selectors (no test-id churn, protects any
existing E2E specs that may reference the rail even though none were found in this session's grep —
re-grep at execution time in case a Lane-2 packet added one since).

### UAT journeys (one per user-facing packet, per the task brief)

- **Packet A (type hierarchy):** open each of the 8 touched panels (rail, automation strip,
  master-track lane, browser tabs, preview empty-state, device-chain header/empty, timeline,
  transport bar) at default zoom; confirm text is legible without squinting and visually
  distinguishable by tier (heading vs. label vs. body vs. data) without reading the DOM.
- **Packet B (tool rail):** hover/click through all 14 tools; confirm hotkey letters are readable
  and don't visually fuse into the icon glyph; confirm group labels (TRNS/EDIT/MASK/MISC) are
  legible at a glance.
- **Packet C (automation strip):** open the automation toolbar on a normal-width window; confirm the
  13 controls read as 3 visually distinct clusters; resize the window narrower; confirm the row
  wraps instead of clipping/overflowing, and the "Armed: <name>" text is never cut off.
- **Packet D (empty states):** open a brand-new project (no clips, no devices); confirm the preview,
  device chain, and timeline each show clear guidance with an actionable next step (not just text);
  click each CTA and confirm it does the stated thing (import media / open effects browser).
- **Packet E (clipped label):** resize the timeline/master-track lane to its narrowest practical
  width; confirm the master-bus label never drops a character mid-word.
- **Packet F (browser chips):** type a search query in the effect browser, confirm the `×` clear
  button looks like a designed control (not raw OS chrome) and clears the search on click; confirm
  the category tabs and "+ Add Text Track" read as visually separate blocks.
- **Packet G (preview chips + transport):** confirm the FPS readout (dev builds) and pop-out button
  read as anchored to the preview panel's top edge, not floating independently; confirm the BPM
  input, S/Q buttons, and quantize-division dropdown in the top transport bar all sit at the same
  height with no visual stagger.

### Gates (per packet + final)

Per packet: `cd frontend && npx --no vitest run` (targeted + full suite) → `hex-ratchet.sh` →
`Skill(review)` → verify-for-real (launch the app, screenshot the touched surface) → the packet's
own UAT journey above. Merge gate: full CI green (smoke + e2e where any packet touches a path with
existing e2e coverage — spot-check via `grep -rl` for the touched class names in
`frontend/tests/e2e/` before assuming none exists, since Packet F/G touch surfaces (`effect-search`,
`app__transport-*`) that plausibly have existing e2e selectors). Final: `/uat` across all 7 packets'
journeys above, run as one session against the assembled change (not per-packet in isolation) since
the whole point is the FRAME reading coherently end-to-end.

## Packet candidates (summary table)

| # | Packet | Files (verified) | Risk | Hard oracle |
|---|--------|-------------------|------|--------------|
| A | Type-scale + Schoger hierarchy tokens | `tokens.css` (+heading/control-h tokens); typography-only lines in 8 surfaces (`tool-rail.css`, `automation.css`, `timeline.css`, `global.css`, `device-chain.css`) | MED | zero <11px font-size in touched files · hex-ratchet ≤ ceiling · per-component snapshot |
| B | Tool rail refinement | `ToolRail.tsx`; `tool-rail.css`; new `tool-rail.test.tsx` | LOW | icon size=16 · badge=11px non-colliding (14 tools) · group-label=11px · flag-off path unaffected |
| C | Automation control-strip grouping | `AutomationToolbar.tsx`; `automation.css` | LOW | 13 buttons in 3 groups · `flex-wrap` set · hint/armed never overflows |
| D | Empty-state designs | `PreviewCanvas.tsx`, `DeviceChain.tsx` (+css); `Timeline.tsx` (typography-only) | LOW | heading+body+CTA present · CTAs wired to real actions · Timeline DOM unchanged |
| E | Fix clipped master-bus label (symptom 1) | `MasterTrack.tsx`; `timeline.css` | LOW | no mid-word clip at 3 widths · `TRACK_HEIGHT` matches CSS height |
| F | Fix browser column chips (symptom 4) | `EffectBrowser.tsx`; `global.css` | LOW | `.effect-search__clear` styled · tabs/actions gap ≥8px |
| G | Fix preview chips + transport alignment (symptoms 6, 8) | `PreviewCanvas.tsx`; `global.css` | LOW | chips anchored in one bar · 3 transport controls same height |

**Single-flight:** A → {B, C, D} parallel; {E, F, G} parallel to everything (disjoint files, no
token dependency). Rebase rule: any Lane-2 packet touching the same CSS files rebases onto this
change's merged diff.

## Two human touchpoints

1. Resolve OD-1..OD-7 (accept defaults or override) — before `/packetize`.
2. Ship sign-off — after build + the 7 UAT journeys + gates, before merge (this change's priority
   build-order slot means sign-off unblocks every Lane-2 feature packet queued behind it).
