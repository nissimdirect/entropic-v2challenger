# Plan — browser-folders

> Implementation plan only. Do not build from this document directly — packetize first
> (`/packetize`), per `~/.claude/plans/creatrix-routing-suite-INDEX.md` build-session protocol
> (item 8: "Browser folders — independent lane, any time").

## 0. Normative contracts carried over verbatim

**Rail v12 FINAL (banked ㊺ + ㊻, do not redesign):**
> rail FINAL (v11): search ABOVE ALL + expand-all-on-type; caret in HEADER ROW; NO wells (rejected)
> — differentiation = line + COLOR (containers colored/tools mono) + slab; icons 17px/38px; collapsed
> hugs rail; rail PERMANENT; per-icon exclusive-accordion drawer (header row glyph·name·count·✕);
> collapse via icon re-click OR name click OR ✕ OR edge caret «/»; open well lights; edge CARET «/»
> collapse handle; container/tool differentiation = 3 layers (divider line + container WELLS + tool-zone
> inset SLAB); tools radio-active, corner dot = has-drawer, zero-option tools drawerless; paint drawer
> = brush suite w/ 📌 pin
> rail v12 FINAL: « caret is the ONLY header close (✕ removed as redundant)

**Icon glyph set (spec §2, verbatim):** INSTRUMENTS ⌸ (keys) · EFFECTS ⌁ (bolt) · GENERATORS ◍
(radiating dot) · OPERATORS ∿ (wave — already the automation glyph) · UTILITIES ⚒ (tool) · PRESETS ▤
(stack) · USER LIBRARY ⌂ (home). 16px, 2px stroke, no fill, DS-consistent — matches the existing
`tool-icons.tsx` "BLOCK direction" convention (`tool-icons.tsx:1-8`: stroke-width 2.7, square caps,
miter joins, 24×24 grid, `currentColor` only) — new container glyphs extend that same file/convention,
they do not start a second icon system.

**Drawer contract (spec §2½, verbatim):** expanding ANY rail icon opens
`[ HEADER ROW: glyph · name · meta (count / hotkey) · pin 📌 · ✕ ]` above `[ DRAWER: the stuff ]`
— folder drawer = search-scoped item list; tool drawer = the tool's options, live. Drawers AUTO-SIZE;
a tool with ZERO options gets NO drawer (click activates, icon fills, rail stays collapsed);
affordance dot marks has-drawer icons. Pin (📌) keeps a tool drawer open; Esc collapses.

**Migration rule (spec §3, verbatim):** "first launch after the switch maps stored
category-visibility to collapsed/expanded folder state; no data loss, no project impact."

## 1. Code-grounded current-state surface (every file this change touches or reads)

| File | Current role | What changes |
|---|---|---|
| `frontend/src/renderer/stores/browser.ts` (161 lines) | `BrowserTab` enum + `activeTab` (line 8-9, 5 tabs incl. `'composite'`); `favorites`/`toggleFavorite`/`isFavorite` (line 24,29-30,93-104, **zero callers** — OD-3); `UserFolder` CRUD (line 11-14,25,31-35,106-145, **zero callers** — OD-2); `collapsedCategories` (line 26,147-158, misleadingly named — see line-158 `isCategoryCollapsed`); `hoveredEffectId` (line 27,38,160 — **live**, read by `HelpPanel.tsx:5`) | Delete `BrowserTab`/`BROWSER_TABS`/`activeTab`/`setActiveTab`. Delete `UserFolder` type + CRUD (OD-2). **Keep and wire** `favorites`/`toggleFavorite`/`isFavorite` (OD-3). Keep `hoveredEffectId` unchanged. `collapsedCategories` semantics fold into the new tree's per-node disclosure map (see §3). |
| `frontend/src/renderer/components/effects/EffectBrowser.tsx` (730 lines) | Renders the 5-tab bar (line 487-501) + per-tab bodies (line 538-719); owns `EFFECT_DRAG_TYPE`/`CREATRIX_NONCE_TYPE`/`SESSION_NONCE`/`DragPayload`/`parseDragPayload` (line 22-82, the drag-channel single source of truth — imported by `operator-drag.ts` and `InstrumentsBrowser.tsx`); owns `expanded` Set for fx-category disclosure, **separately persisted** at `localStorage['entropic-effect-browser-expanded']` (line 191-217, 304-344 — a SECOND category-disclosure store distinct from `browser.ts`'s `collapsedCategories`); owns `searchMatches` global-search scoring (line 358-384, reused verbatim per proposal §3); owns cursor-tool `[tool]` tab body (line 638-714, `CursorTool`/`TOOL_ENTRIES`/`MASK_TOOL_ENTRIES`/`TOOL_ICON`, line 98-163) | Becomes the new `BrowserTree` component (rename or replace in place — packet executor's call, but the drag-channel exports (`EFFECT_DRAG_TYPE` etc.) **must keep their exact export names and shapes** because `operator-drag.ts` and `InstrumentsBrowser.tsx` import them by name). `[tool]` tab body moves to the rail's MODE/TOOL zone (bottom, per §2½). `expanded` Set generalizes from category-string keys to folder-path keys (e.g. `"EFFECTS/codec_archaeology"` vs today's bare `"codec_archaeology"`) — this is a key-shape change, not just a rename, so the migration step (§3) must remap keys, not just copy the localStorage blob. |
| `frontend/src/renderer/components/effects/operator-drag.ts` (106 lines) | `OPERATOR_GROUPS` (line 36-60, 10 entries across MODULATION/INPUTS/GATING) + `startOperatorDrag`/`parseOperatorDrop`/`dragHasOperatorChannel` (line 74-106), imports `EFFECT_DRAG_TYPE` etc. from `EffectBrowser.tsx` (line 16-21) | Becomes the data source for the OPERATORS folder. No changes to the drag functions themselves — only the render call-site (currently `EffectBrowser.tsx:586-608`) moves into the new tree's OPERATORS folder body. |
| `frontend/src/renderer/components/instruments/InstrumentsBrowser.tsx` (192 lines) | `RACKS` list (line 35-54, 4 entries: sampler/drum-rack/wavetable/granulator) rendered as a flat list (line 149-191); imports `DragPayload`/drag-channel from `EffectBrowser.tsx` (line 19-24) | Reused **chrome-removed** as the INSTRUMENTS folder body (proposal §4 "InstrumentsBrowser renders inside tree nodes" — component reused, not rewritten, per spec §4). Component logic (`handleDoubleClick`, drag handlers, `hasVideoClips` gate) is untouched; only the outer `<div className="instruments-browser">` wrapper and its two render call-sites (`App.tsx:3753-3754` outer tab, `EffectBrowser.tsx:718` inner tab) collapse to ONE call-site inside the new tree. |
| `frontend/src/renderer/components/library/PresetBrowser.tsx` (85 lines) | Standalone component: own header (line 37), own search input (line 39-47), own category filter row (line 49-65, hardcoded `CATEGORIES` array line 10), own grid (line 67-82); reads `useLibraryStore` | **Consumed, not rebuilt** (proposal non-goals) — this change wires whatever embeddable/chrome-removed version Wave-0 Packet 2 produces into the PRESETS folder. If Packet 2 has not landed, Packet ordering in §5 below front-loads a minimal chrome-strip of this component (remove lines 37,39-47,49-65's outer wrapper only) so PRESETS isn't blocked — but the full embeddable primitive with folders/search-per-Packet-2-spec is NOT re-derived here. |
| `frontend/src/renderer/stores/library.ts` (193 lines) | `getPresetDir()` → `<Documents>/Creatrix/Presets/*.glitchpreset`, flat (line 23-27); `presets`/`filteredPresets`/`toggleFavorite` (**live**, wired to `PresetCard.tsx:29-36` — a DIFFERENT favorites feature from OD-3, do not conflate) | No changes. PRESETS folder reads `useLibraryStore.presets` / `filteredPresets()` as-is. |
| `frontend/src/renderer/App.tsx` | `sidebarTab` local `useState` (line 433) + render switch (line 3725-3779, three-button tab bar + conditional render of `EffectBrowser`/`InstrumentsBrowser`/`PresetBrowser`); `toggle_sidebar` shortcut → `useLayoutStore.toggleSidebar()` (line 669, 2268) | Delete `sidebarTab` state + the 3-button bar (OD-1 default). Replace the conditional render block with the new tree/rail root component, mounted once. |
| `frontend/src/renderer/stores/layout.ts` | `sidebarCollapsed` boolean (line 17,43,190-193) — a plain binary toggle, **not** a 3-way cycle | **No change.** Per rail v12 FINAL, the rail is PERMANENT and never collapses — the spec's own earlier §2 claim ("Cmd+B cycles: expanded → rail → hidden") is superseded by §2½'s FINAL model, confirmed by `default-shortcuts.ts:31` (`meta+b` → `toggle_sidebar`, unchanged binding) and `layout.ts`'s binary `toggleSidebar`. Cmd+B keeps doing exactly what it does today: hide/show the whole sidebar panel that now contains the rail. |
| `frontend/src/renderer/utils/default-shortcuts.ts:31` | `{ action: 'toggle_sidebar', keys: 'meta+b', ... }` | No change (confirms the row above). |
| `backend/src/effects/registry.py` | `list_all()` (line 73-105) returns `{id, name, category, params, fieldParams}[]`; category values come from 29 distinct `EFFECT_CATEGORY` module constants across `backend/src/effects/{fx,util,spectral}/*.py`, one of which (`"debug"`) is dev-only (line 472-476, gated on `APP_ENV=development` — OD-8) | **No backend change.** The category→subfolder mapping table (§2 below) is a pure frontend data transform over the existing `list_all()` response — this change does not touch Python. |
| `frontend/src/shared/types.ts:529-539` | `EffectInfo { id, name, category, params, fieldParams? }` | No change — the tree consumes this shape as-is. |

## 2. Category → subfolder mapping (pure table, no backend change — per spec §1 "registry `category`
maps to folder paths (pure mapping table, no backend change)")

29 distinct `EFFECT_CATEGORY` values exist in code today (grep-verified against
`backend/src/effects/{fx,util,spectral}/*.py`, `EFFECT_CATEGORY = "..."`):
`codec_archaeology, color, composite, creative, debug, destruction, distortion, emergent, enhance,
fx, generator, glitch, info_theory, key, medical, misc, modulation, optics, physics, sidechain,
spectral, stylize, surveillance, temporal, texture, transition, util, warping, whimsy`.

| Registry category | Top-level folder | Notes |
|---|---|---|
| `generator` | GENERATORS | 1 effect today (`grid_moire` / `fx.moire`) — OD-5 |
| `util` | UTILITIES | 5 effects today (`levels, curves, hsl_adjust, color_balance, auto_levels`) — OD-6 |
| `debug` | *(no folder — hidden in prod)* | Only present when `APP_ENV=development`; when present, surface as an EFFECTS ▸ debug subfolder gated the same way the registry already gates it (no new gate needed — an empty category array in prod means the subfolder simply never renders) |
| everything else (26 remaining strings, incl. `composite` — OD-7) | EFFECTS | one EFFECTS subfolder per remaining category string, alphabetical, mirroring today's `EffectBrowser.tsx:320-323` `categories` computation (`Array.from(new Set(...)).sort()`) verbatim — do not hand-curate a subfolder list, derive it |

INSTRUMENTS and OPERATORS are **not** registry categories at all — they are the `RACKS` list
(`InstrumentsBrowser.tsx:35-54`) and `OPERATOR_GROUPS` (`operator-drag.ts:36-60`) respectively,
unchanged data sources, new render location only.

## 3. Disclosure-state migration (the mechanical part of spec §3's migration rule)

Two existing localStorage keys hold category-disclosure state today, with **different semantics
and different key shapes** — both must be read and reconciled, not just one:

1. `entropic-browser` (`browser.ts:41`) → `collapsedCategories: string[]` (bare category names,
   e.g. `"codec_archaeology"`) — despite the name, `isCategoryCollapsed` (line 158) is read as
   "is this category collapsed", i.e. **absence = expanded** (opposite default of key 2).
2. `entropic-effect-browser-expanded` (`EffectBrowser.tsx:191`) → `Set<string>` of EXPANDED category
   names, defaulting to **all categories expanded** on first run with no stored value
   (`EffectBrowser.tsx:304-308`: `hasStored ? value : new Set(registry.map(e => e.category))`).

Migration step (runs once, first launch after this change ships):
- For each EFFECTS subfolder, expanded-by-default unless its bare category name appears in key 1's
  `collapsedCategories` OR is absent from key 2's expanded set (whichever key exists; prefer key 2
  if both present since it's the more recently-touched surface per the code's own P3.2 vs P3.5 dates).
- Write the reconciled state under a NEW single key (e.g. `creatrix-browser-tree-expanded`,
  packet executor's naming call) keyed by full folder path (`"EFFECTS/codec_archaeology"`, `"OPERATORS"`,
  `"INSTRUMENTS"`, etc.) — new key shape, not a rename, because folder paths are now hierarchical.
- Old keys (`entropic-browser`, `entropic-effect-browser-expanded`) are left in place (read-once,
  never deleted) — matches house convention of never actively deleting user localStorage (no example
  of active localStorage key deletion found anywhere in the codebase during this grounding pass).
- `favorites` (OD-3) and `hoveredEffectId` remain under `entropic-browser`'s existing shape —
  only the category-disclosure portion of that store moves.

## 4. Drag-channel extension (proposal §4 point 7)

Current enum (`DragPayload.kind`, `EffectBrowser.tsx:45`): `'fx' | 'op' | 'composite' | 'instruments' |
'operator'`. Validated against `['fx', 'op', 'composite', 'instruments', 'operator']` at
`EffectBrowser.tsx:74` and namespace-regexed at line 77 (`/^(builtin:|user:)/`).

- GENERATORS' one leaf (`fx.moire`) and UTILITIES' five leaves are ordinary registry `EffectInfo`
  entries — they drag with **`kind: 'fx'`**, unchanged, exactly like any other EFFECTS row (the tree
  location is a display grouping, not a drag-payload distinction; confirmed by reading
  `handleDragStart`, `EffectBrowser.tsx:406-422`, which only branches on `info.category === 'composite'`
  for tab-legacy reasons that no longer apply once composite is an ordinary subfolder — OD-7).
- PRESETS uses a **separate, pre-existing** MIME channel (`application/entropic-preset` — cited by
  UNIFICATION finding #90; grep-confirm the exact constant name and drop-handler file before wiring,
  it was not in this change's direct-read set) — the unified tree's drop targets must accept BOTH
  `EFFECT_DRAG_TYPE` and the preset MIME type; do not attempt to fold presets into `DragPayload.kind`.
- USER LIBRARY drag-out reuses whatever MIME/kind the saved entity's ORIGINAL type used (a saved
  device drags out as `kind: 'fx'`/`'operator'`/`'instruments'` per what it was saved from) — drag-in
  (saving) is new payload-accepting code on the USER LIBRARY drop target itself, not a new outbound
  kind.

## 5. Packet candidates

| Packet | Files | Risk | Oracle |
|---|---|---|---|
| **P1 — Delete dead code + reconcile disclosure state** | `browser.ts` (delete `UserFolder` CRUD per OD-2), new migration util (§3) | LOW | `grep -rn "addFolder\|removeFolder\|renameFolder\|addToFolder\|removeFromFolder\|userFolders" frontend/src` returns zero hits outside test fixtures for the deleted API; existing `entropic-browser`/`entropic-effect-browser-expanded` fixtures load into the new key with a unit test asserting the reconciliation table in §3 for 3 hand-picked cases (both-collapsed, both-expanded, conflicting) |
| **P2 — Tree data model (no UI)** | new `stores/browser-tree.ts` (or extend `browser.ts`) implementing §2's mapping table as a pure function over `EffectInfo[]` + `OPERATOR_GROUPS` + `RACKS` | LOW | unit test: given a fixture `EffectInfo[]` with all 29 category strings, the mapping function returns exactly 26 EFFECTS subfolders (composite included, debug excluded when not present) + GENERATORS(1) + UTILITIES(5) top-level buckets, matching §2's table exactly |
| **P3 — Rail + drawer shell (container icons only, no tool zone yet)** | new `components/browser/BrowserRail.tsx`, `BrowserDrawer.tsx` | MED | keyboard/ARIA tree contract test (spec §5: "Tree keyboard nav (ARIA tree contract)") — ↑↓ traverse, ←→ collapse/expand, Enter on a leaf triggers its existing add/drag action; exclusive-accordion test (opening folder B closes folder A) |
| **P4 — Wire EFFECTS/GENERATORS/OPERATORS/UTILITIES/INSTRUMENTS bodies into drawers** | `EffectBrowser.tsx` body render logic relocated; `operator-drag.ts`/`InstrumentsBrowser.tsx` unchanged, new call sites only | MED | drag-payload parity regression (spec §5: "drag payload parity with the four old tabs — every draggable that worked still drops") — re-run/rewrite `frontend/src/__tests__/components/browser-op-tab.test.tsx`, `frontend/src/__tests__/components/effects/effect-browser-tabs.test.tsx`, `frontend/src/__tests__/components/wand-tolerance-control.test.tsx` against the new tree structure, all green |
| **P5 — One search field spanning everything** | new top-of-browser search component; reuses `EffectBrowser.tsx:358-384` scoring function, extended to also score OPERATORS/INSTRUMENTS/PRESETS entries into one ranked, folder-grouped result list | MED | spec §5 test: "search-across-folders returns each kind" — a query matching one item in ≥3 different folder kinds returns all of them, grouped under their folder headers |
| **P6 — PRESETS folder (consumes Packet-2-of-Wave-0's embeddable PresetBrowser, or a minimal chrome-strip if that hasn't landed)** | `PresetBrowser.tsx` wrapper removal, new call-site inside the tree | MED (depends on Wave-0 sequencing — see proposal Non-goals) | preset drag/apply regression: existing preset-apply flow (`App.tsx:3756-3778`'s `onApplyPreset` callback) still fires correctly when triggered from inside the tree |
| **P7 — Favorites wiring (OD-3) + right-click "Add to Favorites" (spec §3)** | `browser.ts` (no store changes, first UI wiring), new row-hover star + context-menu entry in the EFFECTS/OPERATORS/etc. row component | LOW | unit test: star click toggles `useBrowserStore.favorites`, persisted, and a "Favorites" pseudo-folder (flat, v1 per spec §3) lists exactly the favorited effect IDs |
| **P8 — USER LIBRARY folder shell + save schema design** | new `~/.creatrix/user-library/` read/write layer (schema TBD — proposal non-goals flags this explicitly), new top-level folder | HIGH (greenfield persistence format, touches Electron main IPC for file I/O — PLAY-007 atomic-write rule applies) | round-trip test: drag a device into USER LIBRARY, restart app (or reload store), drag it back out, resulting effect instance is byte-identical modulo new instance UUID |
| **P9 — Outer `sidebarTab` + inner `activeTab` deletion (OD-1)** | `App.tsx:433,3725-3779`, `browser.ts:8-9,18-20,82-86` | MED (touches the mount point every other packet's UI now lives inside) | full click-through UAT: every entry reachable today via `sidebarTab='effects'/'presets'/'instruments'` AND via `EffectBrowser.activeTab='fx'/'op'/'composite'/'tool'/'instruments'` is reachable from exactly one place in the new tree — a checklist derived from this plan's §1 table, zero duplicate entry points remaining (closes the duplicate-INSTRUMENTS finding in proposal OD-1) |

Sequencing: P1 → P2 → P3 → P4 (P5 can run parallel to P4 once P2 lands) → P6/P7 parallel → P8 →
P9 last (P9 is the "flip the switch" packet — every other packet's surface must already be reachable
from inside the tree before the old switchers are deleted, or the app has a dead period with no
sidebar UI at all).

## 6. Test Plan

### Unit (Vitest, mock IPC where the component touches `window.entropic`)
- `stores/browser-tree.ts` mapping function (§2): all 29 category strings classify correctly;
  debug-category-absent case; composite lands in EFFECTS not a special tab.
- Disclosure-state migration (§3): the 4 combinations (both-keys-present-agreeing,
  both-present-conflicting, only-key-1, only-key-2, neither-present) each resolve to the documented
  default.
- Drag-channel: `parseDragPayload` / `parseOperatorDrop` continue to reject malformed/external
  payloads exactly as today (existing qa-redteam H1/H2 tests in `EffectBrowser.tsx`'s own test file
  must still pass unmodified — this change adds folders, it does not touch nonce/namespace validation).
- Favorites (P7): toggle idempotency, persistence round-trip.

### Component (Vitest + React Testing Library, mock IPC)
- ARIA tree contract (spec §5): role="tree"/"treeitem", ↑↓/←→/Enter keyboard nav.
- Exclusive-accordion: opening a second rail icon closes the first drawer.
- Search-across-folders (spec §5): one query, ≥3 folder kinds, all grouped correctly; Enter drops
  top hit on the selected track (existing keyboard-drop flow, spec §3).
- Rewrite of the 3 existing test files named in Packet P4's oracle — these are the regression
  surface proving no draggable silently stopped working.
- USER LIBRARY drag-in/drag-out round trip (component-level, IPC mocked to a fake filesystem).

### Backend
None — this change makes zero backend edits (registry, `apply_chain`, IPC schema all untouched).
If P8's `~/.creatrix/user-library/` read/write goes through the Electron main process (not the
Python sidecar), its tests are Vitest/component-level with mocked `window.entropic`, not pytest.

### E2E (Playwright `_electron`) — justify per Gate 5's test-layer-selection rule
- One smoke spec: launch app, open the rail, expand EFFECTS, drag an effect onto a track, confirm
  it lands in the chain — proves the OS-level drag-and-drop path (HTML5 DnD across real Electron
  windows is not reliably exercised by jsdom) still works end-to-end after the tab→tree swap.
- One smoke spec for Cmd+B (sidebar hide/show unchanged, per §1 table's `layout.ts` row) — regression
  guard against accidentally reintroducing the spec's superseded "3-way cycle" reading.

### BDD scenarios (source has none for this spec — `creatrix-browser-folders-spec.md` §5 is a prose
test list, not Gherkin; the Test Plan above operationalizes each of its 6 bullets 1:1: tree keyboard
nav → Component ARIA test; search-across-folders → Component search test; drag payload parity →
Unit + rewritten regression files; disclosure persistence → Unit migration tests; rail flyout →
Component exclusive-accordion test; migration of the visibility Set → Unit migration tests (§3)).
