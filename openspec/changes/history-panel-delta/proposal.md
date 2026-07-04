# Change — history-panel-delta

> Source spec: `~/.claude/plans/creatrix-history-panel-spec.md` (routing-suite item 9 in
> `openspec/PLANNING-QUEUE.md` Lane 2). **DELTA only** — the Photoshop-style history buffer
> already ships (`frontend/src/renderer/components/layout/HistoryPanel.tsx`, ~63 lines, over
> `frontend/src/renderer/stores/undo.ts`). Do NOT rebuild §6 of the source spec (click-to-jump,
> named entries, linear truncate-on-edit, transactions coalesced to one entry, crash-safe push,
> 500-entry caps, toast-on-failure — all already-done, re-verified by this pass, see Code-Ground
> Register below).
>
> **SCOPED OUT of this change** (belongs to the field-mapping Wave-0 lane, Packet 0a, per
> `docs/plans/2026-07-field-mapping/UNIFICATION-2026-07-03.md` §2 and `PLANNING-QUEUE.md` Lane 1
> item 1): the History Ledger **description-quality rule + lint test** over `undoable()` call
> sites (source spec §2, Gap #2). This change assumes that rule lands separately and does not
> re-litigate or duplicate it.

## Why

The history buffer works but is buried: orphaned from the sidebar in Phase 13C, re-surfaced
(F-0514-18) as a floating-overlay-only panel reachable solely via **Edit → Undo History**. No
hotkey, no docked home, no ambient hint that it exists — "buried enough that its own product
owner believes it doesn't exist" (source spec, verified 2026-07-03). Separately, the panel itself
is still a flat list with no visual op-class differentiation, no transaction disclosure, and no
sense of how close the user is to the 500-entry cap. And the June 2026 validation's Gap-3 (memory
cost of 500 closure-based `UndoEntry` objects) was flagged and never measured.

## What

Four independent deltas on the shipped `HistoryPanel.tsx` / `undo.ts` pair:

1. **Discoverability** — `Cmd+Y` hotkey (via `shortcutRegistry`), a dockable home for the panel,
   and a statusbar breadcrumb showing the last action's description (click → open panel).
2. **Row op-class icons** — ✎ edit · ⧉ routing · ❄ freeze · ✦ paint · ⌗ transform, one per row.
3. **Transaction expandable rows** — transactions still render as ONE row (already coalesced in
   the store) but gain an expandable ▸ child list; jump targets remain whole transactions.
4. **Footer + memory smoke** — "N of 500 steps" footer, jump-progress cursor for long jumps,
   failing-inverse stops at last good step + toast, and a perf-tier smoke test asserting bounded
   heap growth for 500 closure-based entries.

## Non-goals

- History Ledger description-quality rule + lint test (Wave-0 Packet 0a — separate change).
- v2 snapshots (source spec §5) — separate future change, not this delta.
- Full panel-registry / multiwindow dock-or-pop-out (source spec's "Stage C" aspiration) —
  **no such registry exists in code today** (see OD-1). This change ships an interim docked-look
  panel, not a registry-integrated one.
- PRD.md:132's 50MB-RAM/overflow-to-disk aspiration — explicitly OUT until the memory-smoke
  measurement in this change says it matters (source spec §4, unchanged).
- Any change to `undoable()`'s call sites' description strings — that's the Ledger rule's job.

## Code-Ground Register (verified this session, file:line)

- `frontend/src/renderer/components/layout/HistoryPanel.tsx:1-62` — the shipped panel. Click-jump
  loop (`handleJump`) calls `undo()`/`redo()` in a tight `for` loop with no per-step
  success/failure signal.
- `frontend/src/renderer/stores/undo.ts:57-197` — `execute()` (:63-83) and `undoable()` (:206-239)
  wrap `forward()` in `try/catch` and toast on failure. **`undo()` (:85-102) and `redo()`
  (:104-121) do NOT** — `entry.inverse()` / `entry.forward()` are called unguarded. The source
  spec's Gap #4 line "failing inverse stops at last good step + toast (store already toasts)" is
  **only true for `execute`/`undoable`, not for `undo`/`redo`** — see OD-4, this is a real gap
  this change must close, not an assumption to inherit.
- `frontend/src/shared/types.ts:559-564` — `UndoEntry = { forward, inverse, description,
  timestamp }`. No `children`/`childDescriptions`/`opClass` field exists — anything rendering
  transaction sub-rows or op-class icons needs an **additive** field (see OD-3, OD-5).
- `frontend/src/renderer/stores/undo.ts:135-186` (`commitTransaction`) already coalesces a
  transaction's buffered entries into ONE composite `UndoEntry` pushed to `past` — confirms
  source spec §6's "transactions" already-done claim. The buffered `entries` array is captured
  only inside the `forward`/`inverse` closures (:169, :173) — not exposed on the entry object.
- `frontend/src/renderer/stores/undo.ts:12-13` — `MAX_UNDO_ENTRIES = 500`, `MAX_REDO_ENTRIES =
  500` — two separate 500 caps (past, future), not one combined 500. "N of 500" in the footer
  reads as `past.length` of `MAX_UNDO_ENTRIES`, i.e. position in the undo stack — not
  `past.length + future.length`.
- No persistence of the undo stack exists (`grep -rn "useUndoStore" frontend/src/renderer/project-
  persistence.ts` — zero hits). Session-only, matching source spec §5's snapshot precedent
  ("session-only like PS"). Confirms any additive `UndoEntry` field is safe — never serialized.
- `frontend/src/renderer/utils/default-shortcuts.ts:1-92` — `Cmd+Y` (`meta+y`) is **unclaimed** in
  the full 50-binding table (checked every entry; no `y` or `meta+y` binding exists).
- `frontend/src/renderer/utils/shortcuts.ts:57-198` — `shortcutRegistry` is the single dispatch
  point; `register(action, callback)` + `loadDefaults()` is the wiring pattern (precedent:
  `App.tsx:704` `shortcutRegistry.register('routing_canvas', () => setShowRoutingCanvas((v) =>
  !v))` — a toggle-style precedent this change follows for the new hotkey action).
- `frontend/src/main/menu.ts:46-48` — **Edit → Undo History** menu item already sends
  `'show-history'` over `menu:action` (`sendAction(mainWindow, 'show-history')`); `App.tsx:2360`
  handles it (`case 'show-history': setShowHistory(true); break`) — this is the existing
  open-only precedent. The new hotkey is a distinct action (`toggle_history`) that toggles rather
  than force-opens, matching the `routing_canvas` toggle precedent above — the two triggers are
  allowed to diverge in open-vs-toggle semantics (see plan.md Packet 1).
- `frontend/src/renderer/App.tsx:4099-4116` — the only mount site: a `floating-panel--left`
  overlay gated by `showHistory` boolean state (`App.tsx:381`). No panel registry, no dock slot,
  no multiwindow hook exists anywhere in `frontend/src` (`grep -rln
  "PanelRegistry|panelRegistry|dockable|multiwindow|MultiWindow" frontend/src` — zero hits). The
  source spec's "panel registry slot (multiwindow Stage B)" is **aspirational, not built** — see
  OD-1.
- `frontend/src/renderer/App.tsx:4235-4266` — statusbar structure (`status-bar__left` /
  `status-bar__right`); existing chip precedent = `CursorToolChip()` (`App.tsx:200-226`, a small
  function component reading external state and rendering a `<span className="status-bar__...">`
  — the breadcrumb follows this exact pattern).
- `frontend/src/__tests__/components/timeline/history-panel.test.ts:1-24` — existing test file's
  header comment claims "Component render tests would require React test infrastructure (jsdom +
  @testing-library/react), which isn't configured." **This is stale/wrong** —
  `frontend/package.json:27-28` lists `@testing-library/jest-dom` and `@testing-library/react` as
  devDependencies, `vitest.config.ts` sets `environment: 'happy-dom'`, and at least 10 other test
  files (e.g. `frontend/src/__tests__/components/device-mask-row.test.tsx`) already mount real
  components with `@testing-library/react`. This change's component-level tests use real mounts,
  not store-logic-only tests (see plan.md Test Plan).
- No frontend memory/heap-perf test tier exists (`grep -rl "memoryUsage|heapUsed"
  frontend/src/__tests__` — zero hits). Backend has a precedent shape (`backend/tests/perf/
  test_routing_budget.py` — opt-in via `RUN_PERF=1` env, skipped by default) but no frontend
  analog exists to copy verbatim — see OD-2.

## Open Decisions

Each below is a real tension between the source spec's intent and current code reality. Each has
a recommended default; none are silently resolved.

### OD-1 · "Dockable home" has no registry to dock into
**Tension:** source spec wants "panel registry slot (multiwindow Stage B) so it can dock beside
the inspector OR float OR (Stage C) pop out" — but zero panel-registry/multiwindow-dock code
exists anywhere in `frontend/src` (confirmed above), and multiwindow Stage A/B is a **separate,
not-yet-built** change (`PLANNING-QUEUE.md` Lane 2 item 7, stage ⬜).
**Recommended default:** ship an interim "docked-look" mode on the *existing* floating-panel
mechanism — same `floating-panel--left` overlay, but (a) persist open/closed state and last
screen position to `localStorage` (survives relaunch, the closest thing to a "home" without a
registry), (b) visually anchor it flush to the left edge with no drag-repositioning in this
change (true multi-slot docking is Stage B's job). Do not build a registry here. Revisit when
`multiwindow-stage-b` change exists.

### OD-2 · Memory-smoke methodology has no frontend precedent
**Tension:** source spec §4 wants "one perf-tier test: 500 entries of closure-based UndoEntries —
assert bounded heap growth" but no frontend heap-measurement test exists to copy, and naive
`process.memoryUsage().heapUsed` deltas are flaky without `--expose-gc` (V8 GC is
non-deterministic without it).
**Recommended default:** opt-in tier mirroring the backend's `RUN_PERF=1` pattern
(`backend/tests/perf/test_routing_budget.py:9,32-33`): a new `frontend/src/__tests__/perf/`
directory, skipped by default (`if (!process.env.RUN_PERF) return` guard at module scope,
mirroring the backend's `pytest.skip(..., allow_module_level=True)` shape), run via `node
--expose-gc` (added as a documented npm script, e.g. `test:perf`), calling `global.gc()` before
and after populating 500 entries and asserting the delta stays under a fixed MB budget. NOT part
of the default `npx --no vitest run` smoke tier — never gates PRs, mirrors backend's nightly-only
convention.

### OD-3 · Transaction expandable-row schema shape
**Tension:** rendering a transaction's child list requires data the current `UndoEntry` shape
doesn't expose (`commitTransaction`'s buffered `entries` are closed over, not stored — see
Code-Ground Register). Two additive options: (a) store full child `UndoEntry[]` (heavier —
duplicates forward/inverse closures already captured in the composite closure), or (b) store
`childDescriptions: string[]` (lightweight — descriptions only).
**Recommended default:** (b) `childDescriptions: string[]`, because the source spec is explicit
that "jump targets remain whole transactions" (§3) — children are informational only, never
independently jumpable, so there is no need to retain their `forward`/`inverse` closures a second
time. Add as an **optional** field on `UndoEntry` (additive schema, no `PROJECT_VERSION` bump —
confirmed session-only/never-persisted above).

### OD-4 · `undo()`/`redo()` failure handling must be built, not assumed
**Tension:** source spec's Gap #4 line "failing inverse stops at last good step + toast (store
already toasts)" is false for the `undo`/`redo` path (Code-Ground Register above) — this is a
small but real fix inside `undo.ts`. **Correction:** `undo.ts` is NOT touched by the Wave-0 lane's
Packet 0a — Packet 0a's file list is a new `ledger-lint.test.ts` plus `project.ts` (descriptions
only); `undo.ts` only DEFINES `undoable()` and has no `undoable()` call sites of its own for
Packet 0a's lint to touch. There is no cross-change collision here.
**Recommended default:** fix it in this change (footer/jump-progress feature depends on it
directly — HistoryPanel's multi-step jump loop needs a per-step success signal to know when to
stop and toast). Scope the diff narrowly (wrap `entry.inverse()`/`entry.forward()` in `try/catch`
inside `undo()`/`redo()`, return a boolean, toast on catch — same shape as the existing
`execute()`/`undoable()` catch blocks). No file-level conflict with Packet 0a exists (see
Correction above) — no rebase/sequence-check against Packet 0a is needed before merging.

### OD-5 · Row op-class icon derivation has no schema field to key off
**Tension:** the icon set (✎ edit · ⧉ routing · ❄ freeze · ✦ paint · ⌗ transform) needs a
per-entry classification, but `UndoEntry` has no `opClass` field, and adding one would require
touching every `undoable()` call site across the codebase to populate it — which is the Ledger
rule's job (Wave-0 Packet 0a, explicitly out of scope here).
**Recommended default:** classify by a pure heuristic function over `entry.description`, keyed on
the keyword patterns the source spec's own Ledger table already names verbatim ("Route", "Edit
tap" → routing; "Freeze" → freeze; "Paint stroke", "Record gesture" → paint; "transform"/drag
verbs → transform; default → edit). This is a display-only heuristic, not a schema change — no
`undoable()` call sites are touched. Revisit with an explicit `opClass` field once Packet 0a lands
and every call site can be threaded through in one pass.


## T1 Verdicts (LOCKED 2026-07-03, /marathon chunked T1 — do not re-open)
All Open Decisions above: **defaults ACCEPTED as written** (user: "Accept all 33 defaults"). Hotkey ODs additionally governed by the global verdict: menu-entry-only now, accelerator picked at build/UAT.
