# Pattern teardown: command palette and searchable action lists

Scope note (rule 4): **Creatrix has no command palette** (grep `command.palette|CommandPalette` over `frontend/src/renderer`: no hits; not in `docs/spec/01-FEATURE-MAP.md`, `docs/roadmap/*.md` or `docs/frontend/*.md`). A global palette is therefore a *new feature* and appears only under "Candidate additions". The main body below specs what exists: the three searchable action/list surfaces, the command id table behind the native menu, and the Help > Keyboard Shortcuts surface, using cmdk and Blender's search as evidence. Feeds systems/focus-keyboard, O10 (Library item search), O11 (Tool), O05 (param inline actions).
Tiers: cmdk = ADOPT (MIT). Blender F3 menu search = GPL, patterns only. REAPER action list = OBSERVE tier, not observed in this pass.
Refs: `~/Development/_refs/cmdk` (v1.1.1, `cmdk/src/index.tsx`, `command-score.ts`, `ARCHITECTURE.md`), `~/Development/_refs/blender`.

## Problem in Creatrix today

1. **Three independent searchable lists, three behaviors.**
   - `InlineActionMenu` (param row right-click): sectioned list with a search input, **case-insensitive substring** on label only (`components/inline-actions/InlineActionMenu.tsx:52-60`), own roving index with only ArrowUp/Down/Enter/Escape (`:85-115`), no Home/End, no IME guard, inline styles with raw hex `#1a1a1a/#333/#0d0d0d` (`:140-160`) instead of tokens, its own width/clamp constants (`menuW = 260`, `:75-77`).
   - `EffectBrowser` search: substring on `name` and `id`, result tiers scored 2 for name/id match (`components/effects/EffectBrowser.tsx:389-413`), local state, Esc clears and blurs (`:275-280`), keywords/categories separate.
   - Preferences > Shortcuts editor: flat list, no search (`components/layout/ShortcutEditor.tsx`).
2. **No single command table.** Native menu items dispatch string ids through `app/menuActions.ts` (e.g. `'split-at-playhead'`, `'select-all-clips'`, `'toggle-sidebar'`, `:60-170`); keyboard actions use registry action names (`'split_at_playhead'`) registered in `App.tsx` (`shortcutRegistry.register(...)`, 47 handlers); context-menu items call store actions inline (`Clip.tsx:224`). The same user-visible command ("Split at Playhead") exists under three ids with three enable rules and, for multi-select, two scopes (context-menus.md Problem 3). The menu id and the registry action are tied only by naming convention (kebab vs snake).
3. **Help > Keyboard Shortcuts is a redirect.** `show-shortcuts` opens Preferences on the Shortcuts tab (`app/menuActions.ts:164-168`); the list shows only registry rows, not raw handlers (30, `inventory.json` `hotkeys.rawKeyHandlers`) or menu-only actions.
4. **Ranking is nonexistent** (substring, insertion order) and **no keyword aliasing** (searching "cut" does not find "Split at Playhead"; "blur" finds only if the id/name contains it).
5. **IME and key hygiene** missing in search inputs (keyboard-focus.md K11).

## Patterns

| # | Pattern | Source + tier | Behavior | Fit / conflict vs RATIFIED | Feeds |
|---|---|---|---|---|---|
| P1 | **Fuzzy score with word-start bias, continuity bonus, small penalties**; items sorted by score, groups by their best item | cmdk `cmdk/src/command-score.ts` (constants: continue-match 1, space word-jump 0.9, non-space word-jump 0.8, character-jump 0.17, transposition 0.1, skipped 0.999, case-mismatch 0.9999, distance-from-start 0.9) and `index.tsx` `sort()` ~367-430 - ADOPT | Typing "sp pl" finds "Split at Playhead"; ranking is stable, empty query keeps authored order. | Fits D7 (nothing visible beyond a hint). Replaces substring in all three lists (Problem 1, 4). The scoring file is self-contained (no deps). | O10 O05 |
| P2 | **Keywords field separate from label** | cmdk `Command.Item` prop `keywords?: string[]` (index.tsx ~55; `score(value, keywords)` ~362) - ADOPT | Aliases ("cut", "razor", "blade" for Split) are data, not label text. | Fits; supports plan to unify names. | O10 O11 |
| P3 | **Selected item tracked by value, not index; DOM order is authoritative** | cmdk `ARCHITECTURE.md` ("Item selection order is based on the DOM order"; value stable across mount/unmount) and `index.tsx` `getSelectedItem/updateSelectedByItem` ~489-530 - ADOPT | Highlight survives filtering and re-sorting; Home/End = first/last valid item; disabled items skipped via `aria-disabled`. | Fits: InlineActionMenu uses `focusIdx` over a recomputed flat list (`:85-115`), so the highlighted row can jump when the filter changes. | O05 |
| P4 | **Combobox ARIA with virtual focus** (input keeps DOM focus; list uses `aria-activedescendant`) | cmdk `index.tsx` ~810-870 (`role="combobox"`, `aria-controls`, `aria-activedescendant`, list `role="listbox"`, items `role="option"` `aria-selected`) - ADOPT; React Aria `autocomplete/useAutocomplete.ts` (virtual-focus delegate) - ADOPT | Typing and navigating happen in one place; screen reader announces the active option. | Fits (a11y ratchet). InlineActionMenu uses a text input plus manual roving; semantic roles not set. | O05, systems/focus-keyboard |
| P5 | **Key set**: Up/Down (plus Ctrl+N/J, Ctrl+P/K vim option), Home/End, Enter select, `loop` option, IME guard (`isComposing`/keyCode 229), respects `defaultPrevented` | cmdk `index.tsx` ~575-640 (`vimBindings`, `loop`, `isComposing`) - ADOPT | Predictable list keyboard contract. | Fits keyboard-focus K10/K11. Vim bindings: reject for Creatrix by default (Ctrl+J/K/N/P could collide with registry: `meta+j`, `meta+k` are bound; cmdk uses Ctrl not Cmd, but the checker would warn) - rejected unless owner wants them. | systems/focus-keyboard |
| P6 | **Empty and loading states are built-ins** (`Command.Empty` renders when filtered count is 0; `Command.Loading` with progressbar role) | cmdk `index.tsx` ~897-925 - ADOPT | Zero-result hint appears without caller logic. | Fits D7: minimal hint text, no CTA button; InlineActionMenu already has `inline-action-menu-empty` (`:166`) with raw `#888` text - must meet the AA contrast guarantee in D7 (token pair). | systems/states |
| P7 | **`shouldFilter={false}` / custom `filter`**: the host owns filtering (server-side or domain-specific) while keeping keyboard + ARIA | cmdk `index.tsx` props `shouldFilter`, `filter` (~87-96) - ADOPT | Lets the Library search use the existing indexed/tagged data and still get the list behavior. | Fits O10 (library/preset search with categories, favorites). | O10 |
| P8 | **Groups with headings; groups hide when all items filtered; `forceMount`** | cmdk `Command.Group` (`heading`, `forceMount`) `index.tsx` ~730; `Separator alwaysRender` ~25 - ADOPT | Section titles (`recent`/`browse`/`tools` in InlineActionMenu `SECTION_ORDER`) appear only when they have results. | Fits `InlineActionMenu` sections (`:20-60`) already; formalises. | O05 |
| P9 | **Search over the whole menu tree by label, results show the path** | Blender menu search (operator `wm.search_menu`, exposed in `scripts/startup/bl_ui/space_topbar.py:629` as "Menu Search..." and bound in `scripts/presets/keyconfig/keymap_data/blender_default.py`; menus are Python classes whose items are operator ids, e.g. `layout.operator("sequencer.split")` in `scripts/startup/bl_ui/space_sequencer.py`) - GPL, pattern only (the search implementation itself was not read; behavior inferred from the menu definitions) | A search can be derived from the same menu definitions because every menu item is an operator id with a label. | Fits Problem 2: Creatrix' menu structure (`menu.ts`, 63 menu items in the inventory) is already a command list; derived search = free once ids are unified. | systems/focus-keyboard |
| P10 | **Shortcut hint shown next to each result from the live registry** | cmdk README/demo pattern (item children include a shortcut element; no built-in) - ADOPT (convention); React Aria `useMenuItem` `keyboardShortcutProps` | Same hint source as menus (context-menus.md C8). | Fits. | systems/focus-keyboard |
| P11 | **Help dialog generated from live registrations, opened by `?`** | Blueprint `hooks/hotkeys/useHotkeys.ts` ~40,126 (`showDialogKeyCombo`), `context/hotkeys/hotkeysProvider.tsx` dialog + dedupe - ADOPT | Cannot drift from reality. | Fits Problem 3; `?` is a bare printable key: must be text-input safe (keyboard-focus K3). | systems/focus-keyboard |
| P12 | **Dialog wrapper = modal scope** (portal, overlay, contained focus, restore) | cmdk `Command.Dialog` over Radix Dialog (`index.tsx` ~880-895) - ADOPT | Palette-as-modal inherits a11y from the dialog layer. | Fits only if the candidate palette is approved; Creatrix already has modal machinery (`useModalBehavior`). | candidate |

## Recommendation for the spec

1. **One command table** (P9, context-menus C14): every user-invokable action has `{id, label, keywords[], category, enableRule(context), scope, shortcut: derived}`. Native menu items, registry actions, context-menu items and any search surface reference that id. Reconcile the two spellings (`split-at-playhead` menu id vs `split_at_playhead` registry action) into one id; list the mapping as a spec table so the coverage guard can check it.
2. **Searchable lists share one component contract** (P3, P4, P5, P7, P8): input keeps focus; `aria-activedescendant`; selection by value; Up/Down/Home/End/Enter/Escape; optional loop (default off); IME guard; sections hide when empty; empty state = minimal hint (D7) with token colors. Applied to `InlineActionMenu`, `EffectBrowser` search, library/preset search, and the Shortcuts tab.
3. **Ranking** (P1, P2): use a fuzzy word-start scorer with `keywords`; empty query = authored order; ties by authored order. Decision on adopting `command-score.ts` as a dependency vs re-implementing the documented constants is open (see Library evidence); the behavior spec is the constants' relative ordering (continuous match > word-start > scattered).
4. **Shortcuts tab**: add search over command label, keywords and key combo; show scope/context column; show non-registry (raw) bindings read-only; link conflicts (keyboard-focus checker output) (P11, P10).
5. **Help > Keyboard Shortcuts** stays a Preferences redirect (existing behavior, Problem 3) but the list is generated from the registry plus the per-surface bindings (keyboard-focus Recommendation 8), and `?` may open it when no text input is focused (P11; owner to confirm the key).
6. **Tokenise the search UIs** (D5 mono, D6 12px floor, D7 contrast): replace inline hex in `InlineActionMenu.tsx:140-160,166` with the tokens used elsewhere; ratchet scripts (`frontend/scripts/hex-ratchet.sh`) already measure this.
7. Vim-style Ctrl+N/P/J/K navigation: **rejected** by default (P5), documented so it is not re-proposed without a conflict-check run.

## Library evidence

| Criterion | cmdk | React Aria `useAutocomplete` |
|---|---|---|
| License | MIT (`~/Development/_refs/cmdk/LICENSE.md`) | Apache-2.0 |
| API fit | Compound components render every item in the React tree and hide non-matches via DOM (ARCHITECTURE.md). Great for small/medium lists with free-form item JSX; mismatched with thousands of items (all items stay mounted). Creatrix effect registry is hundreds of items, inline action list tens. | Headless; pairs with `useSelectableCollection`; virtual focus delegate; no ranking. |
| Dependencies | `@radix-ui/react-dialog`, `react-id`, `react-primitive`, `react-compose-refs` (`cmdk/package.json`) - Radix Dialog only needed for `Command.Dialog`; core list works without opening it but still imports it. | Within the react-aria packages. |
| Size | `index.tsx` 1091 lines + `command-score.ts`; bundle not measured. | Not measured. |
| A11y | combobox/listbox roles, `aria-activedescendant`, sr-only label; IME guard. | Strong. |
| Styling | Unstyled (`cmdk-*` data attributes); BEM-compatible. | Headless. |
| Maintenance | v1.1.1; steady/low activity. React 18/19 peer range. | Active. |
| Neutral summary | The scorer (`command-score.ts`) is the most portable piece and has no dependencies; the component is optional. Item-per-DOM model is a poor fit for the large effect registry (virtualised lists in `EffectBrowser` would conflict). Decision deferred (verdict c). |

## Gaps
- REAPER action list (OBSERVE tier) and Blender F3 search behavior (only inferred from menu definitions, not from `wm.search_menu` code) not read.
- `EffectBrowser` search scoring read only at `:389-413`; library `PresetBrowser` search not read.

## Candidate additions (owner approval required)

1. **Global command palette (Cmd+Shift+P or similar)** over the unified command table (Recommendation 1): fuzzy search, shortcut hints, recents, scoped to the current selection. Not in current scope or roadmap. Key choice must pass the conflict checker (`meta+shift+p` is already `toggle_popout`, `default-shortcuts.ts:92`; `meta+k` is `split_at_playhead`, so the cmdk-default Cmd+K is unavailable).
2. **Palette modes** (prefix `>` commands, `@` jump to track/clip, `#` effects, `:` timecode) - new feature, depends on item 1.
3. **Recently used commands with persistence** - new state in preferences.
4. **Parameter search ("go to param")** across the open device chain - new navigation feature.
