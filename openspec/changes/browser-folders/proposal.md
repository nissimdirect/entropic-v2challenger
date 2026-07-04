# Change — browser-folders

## Sources (binding, do not re-litigate)
- `~/.claude/plans/creatrix-browser-folders-spec.md` — the spec (tree shape, icons, rail v12, behavior, tests).
- `~/.claude/projects/-Users-nissimagent/memory/project_creatrix-routing-2026-07.md` — banked decisions
  ㉑ (superseded) ㉜ ㉝ ㉞ ㉟ ㊷ ㊺ ㊻ quoted verbatim below where they bind.
- `docs/plans/2026-07-field-mapping/UNIFICATION-2026-07-03.md` §D-2, §Packet 2, §3.9, §4 — code-reality
  corrections to the spec's assumed current-state.
- `openspec/project.md`, `PLAYBOOK.md` — house conventions.

## Open Decisions
*(Recommended defaults stated; each is a real tension between the source docs or between docs and
code that this proposal does NOT resolve unilaterally.)*

### OD-1 — What happens to the OUTER `sidebarTab` switcher (App.tsx)?
**Finding (not in any source doc):** the sidebar has **two nested tab systems today**, not one.
`App.tsx:433` owns a local `sidebarTab: 'effects' | 'presets' | 'instruments'` (plain `useState`,
unpersisted) rendered at `App.tsx:3725-3779` that swaps between three completely separate
components — `<EffectBrowser>`, `<InstrumentsBrowser>` (standalone), `<PresetBrowser>`. `EffectBrowser`
then has **its own inner** 5-tab bar (`useBrowserStore.activeTab`, `browser.ts:8-9`) — one of whose
5 tabs is *also* `'instruments'`, rendering `<InstrumentsBrowser/>` a second time
(`EffectBrowser.tsx:716-718`). The spec's tree (§1) assumes ONE flat tab system to fold into ONE tree;
it never names this outer/inner split.
**Recommended default:** the new tree/rail **replaces both layers in one motion** — `sidebarTab`
useState is deleted, `BrowserTab`/`useBrowserStore.activeTab` is deleted, and INSTRUMENTS becomes a
single top-level tree node (no duplicate entry point). This is a strictly larger deletion than the
spec implies ("4 tab components swap the whole panel" — actually 3 outer + 5 inner, overlapping).
**Recommended default if descoped:** if the packet executor wants a smaller first slice, the outer
`sidebarTab` can be retired first (folding presets+instruments+effects into the tree) while
leaving `EffectBrowser`'s inner tab bar as a transitional shim one packet longer — but the inner
INSTRUMENTS tab must be deleted in the SAME packet as the outer one to avoid a visible duplicate.

### OD-2 — Dead `UserFolder` CRUD in `browser.ts` (reuse or delete)
**Finding:** `browser.ts:11-14` (`UserFolder` type), `:25` (`userFolders` state), `:31-35`
(`addFolder`/`removeFolder`/`renameFolder`/`addToFolder`/`removeFromFolder`) persist to
`localStorage['entropic-browser']` but have **zero callers anywhere in the frontend** (verified:
`grep -rn "addFolder\|removeFolder\|renameFolder\|addToFolder\|removeFromFolder\|userFolders" frontend/src`
→ only hits inside `browser.ts` itself). No UI ever rendered this feature.
**Recommended default: DELETE.** The spec's actual "save a thing you name" concept is USER LIBRARY
(banked ㉞, syncs to `~/.creatrix/user-library/` — file-backed, not localStorage) — that supersedes
this half-built in-memory folder system rather than extending it. Deleting removes ~25 dead LOC and
one persisted-but-unread localStorage key; keeping it would mean two "user folder" concepts
(`UserFolder[]` in localStorage vs. the on-disk USER LIBRARY) answering the same need.

### OD-3 — Dead `favorites`/`isFavorite`/`toggleFavorite` Set in `browser.ts` (reuse or delete)
**Finding:** distinct from OD-2 — `browser.ts:24,29-30,93-104` (`favorites: Set<string>`,
`toggleFavorite`, `isFavorite`) also persists to `localStorage['entropic-browser']` but likewise has
**zero callers** — `EffectBrowser.tsx` never renders a star/favorite affordance for effects (contrast
with `library.ts`'s `toggleFavorite`, which IS live and wired to `PresetCard.tsx:29-36`'s ★/☆ button
for presets — a separate, working favorites feature for a different entity type).
**Recommended default: REUSE, don't delete.** The spec's own §3 ("Right-click a device → Add to
Favorites … v1 favorites = one flat folder") and §2 ("Favorites star on hover") describe exactly
this shape — this is the FIRST wiring of an already-shaped-but-unbuilt store slice, not new state.
Rename `browser.ts`'s Set semantics stay; only the UI affordance is new.

### OD-4 — Does "Add to Favorites" get a History Ledger row?
Hard Rule 5 / the History Ledger convention (`creatrix-history-panel-spec.md` §2: "every user-visible
op registers a SPECIFIC description … every NEW feature lands with its ledger rows") would bind a new
favorite-toggle action. But the existing analogous feature — `library.ts.toggleFavorite` for
presets — is **not** undoable today (direct `set()`, no `undoable()` wrapper, confirmed by reading
`library.ts:156-166`) and nobody has treated that as a bug.
**Recommended default:** treat browser favorites as a UI preference (same class as
`sidebarCollapsed`/`isCategoryCollapsed`) — **no** History Ledger row, for consistency with the
existing preset-favorites precedent. Flag this explicitly to whoever runs the next `/reflect` /
`/quality` pass on presets so the two favorites features get the same verdict, not two different ones.

### OD-5 — GENERATORS folder: 2 of 3 listed contents don't exist as draggable registry items
**Finding:** the spec's tree diagram (§1) lists `GENERATORS: moire · routing graph · text`. Code
reality: only `moire` (`fx.moire` / `grid_moire.py`, `EFFECT_CATEGORY="generator"`) is a real,
draggable registry effect — it is the **only** registered effect with category `"generator"`
(verified: `grep -rl 'EFFECT_CATEGORY = "generator"'` across `backend/src/effects/{fx,util,spectral}`
→ one hit). "routing graph" is banked decision ⑳ (`routing_graph` as a matte-source GENERATOR) but is
**design-only, zero code** (confirmed by the routing suite's own "STRAY THREADS INVENTORY": "routing_graph
generator (decision only)"). "text" is `App.tsx`'s `handleAddTextTrack` — a **track-creation button
action**, not an effect-registry entry and not draggable via the existing `DragPayload` channel at all.
**Recommended default:** GENERATORS ships in this change with ONE real leaf (moire). "Add Text Track"
stays a plain action button rendered inside the GENERATORS drawer (not a drag row) exactly as it is
today (`onAddTextTrack` prop, `EffectBrowser.tsx:503-509`) — do not force it into the drag/tree item
shape. "routing graph" is a placeholder/disabled row or omitted entirely until it ships as a real
effect; do not invent a fake registry entry to fill the folder.

### OD-6 — UTILITIES folder: `transform`/`corner_pin`/`mesh_warp` are unbuilt (spec, not code)
**Finding:** the spec's UTILITIES leaves (`transform · corner pin · mesh warp · levels · curves`) mix
shipped registry effects (`util.levels`, `util.curves`, both `EFFECT_CATEGORY="util"`, plus
`hsl_adjust`/`color_balance`/`auto_levels` — 5 total registered under `"util"`) with the **unbuilt**
Transform Suite (`creatrix-transform-suite-spec.md`, banked but "specced-not-built" per the routing
INDEX). **Recommended default:** UTILITIES ships in this change with the 5 real `"util"`-category
effects; `transform`/`corner_pin`/`mesh_warp` rows are added when that suite lands (separate change),
not stubbed here.

### OD-7 — `[composite]` tab → EFFECTS subfolder (target-constraint mapping, confirmed)
Not contested, but must be pinned since the spec never saw this tab: `EFFECTS.category === 'composite'`
(`EffectBrowser.tsx:8-9,316-318,609-637`, currently its own 5th top-level tab, holding whatever
effects register with `EFFECT_CATEGORY="composite"` — today exactly one, `composite_mod`, the
track-compositing terminal per `registry.py:516-525`) becomes an ordinary EFFECTS ▸ composite
subfolder under the pure category→subfolder mapping table (§1 of the source spec), same treatment as
`codec_archaeology`, `keying`, etc. No special-casing.

### OD-8 — `debug` category: 29th category, dev-only
Direct grep across `backend/src/effects/{fx,util,spectral}/*.py` for `EFFECT_CATEGORY = "..."` finds
**29** distinct strings, not the 28 the target constraints named — the extra one is `"debug"`
(`debug_crash.py`), registered only `if os.environ.get("APP_ENV") == "development"`
(`registry.py:472-476`). **Recommended default:** the category→subfolder mapping table is data-driven
off whatever `list_all()` actually returns at runtime (28 in a production build, 29 in dev) — no
hardcoded count anywhere in the implementation; DEBUG folder simply doesn't exist in prod builds.

## Why
Today the effect/instrument/preset browser is THREE separate UI surfaces stitched together by an
outer 3-way tab switcher (`App.tsx` `sidebarTab`) and an inner 5-way tab switcher
(`EffectBrowser`'s `activeTab`), with a dead in-memory "user folder" feature and a dead "favorites"
feature sitting unused in the same store. The user (banked ㉜/㉞, confirmed FINAL at ㊺/㊻) wants ONE
Ableton-style folder tree — INSTRUMENTS · EFFECTS · GENERATORS · OPERATORS · UTILITIES · PRESETS ·
USER LIBRARY — behind a permanent icon rail, with one search spanning everything, so cross-category
discovery (e.g. finding an operator while browsing effects) doesn't require closing one tab to open
another, and so PRESETS/USER LIBRARY stop being architecturally separate from the thing they're
presets/library FOR.

## What changes
1. **New tree data model** — one flat index built by merging: (a) the effect registry (`EffectInfo[]`,
   already fetched — `registry` prop into `EffectBrowser` today) grouped by `category` into EFFECTS
   subfolders per the mapping table (OD-7, OD-8); (b) `OPERATOR_GROUPS` (`operator-drag.ts:36-60`, 10
   entries) as OPERATORS; (c) the `RACKS` list (`InstrumentsBrowser.tsx:35-54`, 4 entries) as
   INSTRUMENTS; (d) the single `"generator"`-category effect as GENERATORS (OD-5); (e) the 5
   `"util"`-category effects as UTILITIES (OD-6); (f) `PresetBrowser`'s live preset list
   (`useLibraryStore.presets`) re-hosted chrome-removed as PRESETS (consumed, not rebuilt — Wave-0
   Packet 2 owns building the embeddable PresetBrowser primitive this change consumes); (g) USER
   LIBRARY — new, greenfield, backed by `~/.creatrix/user-library/` (confirmed absent on disk today).
2. **Permanent icon rail** (banked ㊺/㊻, FINAL): rail never collapses; each top-level folder is a
   rail icon in an exclusive-accordion drawer (one open at a time); header row =
   `glyph · name · count · «` where **«** is the only close control (✕ removed, ㊻). Container icons
   (top zone) carry category color; MODE/TOOL icons (bottom zone, the retired `[tool]` tab's cursor +
   mask tools) are monochrome, radio-select, corner-dot = has-drawer.
3. **One search field**, full browser width, above the rail+drawer — typing expands every folder's
   matching rows grouped under folder headers (replaces `EffectBrowser`'s existing per-mount local
   `searchQuery` state, which already does global cross-registry search at `EffectBrowser.tsx:357-384`
   — this is the closest existing analog and its scoring function is reused, not reinvented).
4. **Deletion of both existing tab systems** — outer `sidebarTab` (`App.tsx:433`) and inner
   `BrowserTab`/`useBrowserStore.activeTab` (`browser.ts:8-9,18-20,82-86`) per OD-1's default.
5. **Deletion of dead `UserFolder` CRUD** (OD-2) and **first wiring of the dead favorites Set** (OD-3),
   with no History Ledger row (OD-4).
6. **Migration**: existing `collapsedCategories` (`browser.ts`, misleadingly named — it's actually
   `expanded`-category state per the effect-browser's OWN separate `expanded` Set,
   `EffectBrowser.tsx:191-217,304-308` — two different persisted category-disclosure stores exist
   today, `entropic-browser` key and `entropic-effect-browser-expanded` key) maps 1:1 onto the new
   tree's per-folder disclosure state on first launch after the switch; no data loss.
7. **Drag payload channel extended, not replaced** — `DragPayload.kind` enum
   (`EFFECT_DRAG_TYPE`/`CREATRIX_NONCE_TYPE`/`SESSION_NONCE`, `EffectBrowser.tsx:22-82`) gains new
   members for GENERATORS/UTILITIES/USER LIBRARY drag sources (they reuse `'fx'` today since they're
   registry effects) and a new preset-drop case (per UNIFICATION Packet 2 finding #90 — presets use
   a **separate** `application/entropic-preset` MIME channel today, which the unified tree's one
   drag-handler model must special-case, not unify away).

## Non-goals (explicitly out of scope for this change)
- Building the embeddable folders/search primitive *inside* `PresetBrowser` — that is Wave-0
  Packet 2 (`docs/plans/2026-07-field-mapping/UNIFICATION-2026-07-03.md` §2). This change **consumes**
  that primitive once it exists; if Packet 2 has not landed when this change is implemented, the
  packet order in plan.md sequences PresetBrowser-embedding work first.
- The Transform Suite effects (`transform`/`corner_pin`/`mesh_warp`) — OD-6.
- The `routing_graph` GENERATOR effect — OD-5.
- Multi-select / Ableton-style color-tagged favorite collections (spec §3: "v2").
- Any change to the effect registry itself, `apply_chain`, or any backend Python — this is a
  frontend-only, additive-localStorage-schema change.
- USER LIBRARY's actual save/load persistence logic beyond the folder shell existing in the tree —
  full drag-in/drag-out save semantics are speced (`creatrix-browser-folders-spec.md` §1) but the
  file-format for a saved device/rack/matte/pose/gesture is **not** specified anywhere in the source
  docs; plan.md scopes this as its own packet with an explicit schema-design sub-task, not an
  assumption.


## T1 Verdicts (LOCKED 2026-07-03, /marathon chunked T1 — do not re-open)
All Open Decisions above: **defaults ACCEPTED as written** (user: "Accept all 33 defaults"). Hotkey ODs additionally governed by the global verdict: menu-entry-only now, accelerator picked at build/UAT.
