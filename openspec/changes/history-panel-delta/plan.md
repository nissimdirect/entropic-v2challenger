# Plan — history-panel-delta

See `proposal.md` for Why/What/Non-goals/Open Decisions (OD-1..OD-5). This file is the
implementation surface. All file:line citations verified this session.

## Normative contracts (verbatim, do not re-derive)

**Icon set** (source spec §3, Gap #3): "Op-class icons per row (✎ edit · ⧉ routing · ❄ freeze ·
✦ paint · ⌗ transform)."

**Ledger table** (source spec §2 — the rule/lint itself is OUT OF SCOPE, Wave-0 Packet 0a; the
*keyword vocabulary* below is reused verbatim by this change's icon-classification heuristic,
OD-5):

| new op | history entry |
|---|---|
| routing create/delete/edit | "Route A2 → B1 (mask)" / "Edit tap gain" |
| freeze (any of the 3 surfaces) | "Freeze C1" |
| promote to matte track | ONE transaction "Promote matte → track M1" |
| paint stroke / gesture record | "Paint stroke (G2)" / ONE transaction "Record gesture (skew, rot)" |
| lane simplify/smooth | "Simplify lane (−212 pts)" |
| pose/morph, matte/MIDI track, transform drags | named + gesture-coalesced |

**Existing shortcut binding shape** (`frontend/src/renderer/utils/shortcuts.ts:7-13`):
```ts
export interface ShortcutBinding {
  action: string
  keys: string
  category: string
  label: string
  context: ShortcutContext
}
```

**Existing `UndoEntry` shape** (`frontend/src/shared/types.ts:559-564`):
```ts
export interface UndoEntry {
  forward: () => void;
  inverse: () => void;
  description: string;
  timestamp: number;
}
```

## Code-cited file surface

| File | Current state (cited) | Change |
|---|---|---|
| `frontend/src/renderer/utils/default-shortcuts.ts:1-92` | 50 bindings, `meta+y` unclaimed (checked every row) | NO CHANGE this change — T1 Verdicts global override (menu-entry-only now, accelerator picked at build/UAT): do not add a keybinding in this packet |
| `frontend/src/renderer/App.tsx:704` | precedent: `shortcutRegistry.register('routing_canvas', () => setShowRoutingCanvas((v) => !v))` | NO CHANGE this change — no `toggle_history` registration is added; deferred to a later build/UAT decision per the T1 Verdicts override |
| `frontend/src/renderer/App.tsx:381` | `const [showHistory, setShowHistory] = useState(false)` | Rehydrate initial value from `localStorage` (OD-1); persist on every change via a `useEffect` |
| `frontend/src/renderer/App.tsx:2360` | `case 'show-history': setShowHistory(true); break` | UNCHANGED — menu stays open-only (documented divergence from hotkey's toggle, proposal.md Code-Ground Register) |
| `frontend/src/main/menu.ts:46-48` | `{ label: 'Undo History', click: () => sendAction(mainWindow, 'show-history') }` | UNCHANGED — no new menu entry needed, hotkey is additive |
| `frontend/src/renderer/App.tsx:4099-4116` | floating-panel--left overlay, `showHistory` boolean gate, no dock/position state | ADD: read/write `localStorage` key (e.g. `creatrix.historyPanel.open`) for the interim "docked-look" persistence (OD-1); no drag-repositioning added |
| `frontend/src/renderer/App.tsx:200-226` (`CursorToolChip` pattern) | small function component reading external state, rendering into `status-bar__right` | ADD new `HistoryBreadcrumbChip()` component: reads `useUndoStore(s => s.past[s.past.length - 1]?.description)`, renders nothing if empty, `onClick` calls `setShowHistory(true)` (same open-only semantics as the menu — clicking a breadcrumb is a deliberate act, not a toggle) |
| `frontend/src/renderer/App.tsx:4235-4266` | `status-bar__left` / `status-bar__right` structure | Mount `<HistoryBreadcrumbChip />` inside `status-bar__right`, alongside `<CursorToolChip />` |
| `frontend/src/shared/types.ts:559-564` | `UndoEntry` has no `children`/`opClass` field | ADD optional field: `childDescriptions?: string[]` (OD-3). No `opClass` field added (OD-5 — heuristic instead) |
| `frontend/src/renderer/stores/undo.ts:135-186` (`commitTransaction`) | composite entry has no reference to buffered entries outside its closures | When building `compositeEntry` (:165-177), also set `childDescriptions: entries.map(e => e.description)` |
| `frontend/src/renderer/stores/undo.ts:85-102` (`undo`) | `entry.inverse()` called unguarded (no try/catch) | Wrap in `try/catch` matching `execute()`'s shape (:63-83); on catch: toast `level: 'error'`, `source: 'undo'`, and return `false` without mutating `past`/`future` (stops the entry at the last good step). Return `true` on success. Change return type `void` → `boolean`. |
| `frontend/src/renderer/stores/undo.ts:104-121` (`redo`) | `entry.forward()` called unguarded | Same treatment as `undo()`, mirrored for `redo()`/`future` |
| `frontend/src/renderer/components/layout/HistoryPanel.tsx:8-28` (`handleJump`) | tight `for` loop calling `undo()`/`redo()` with no per-step check | Loop now checks the boolean return of each `undo()`/`redo()` call; break the loop on `false` (failing inverse stops at last good step — OD-4). Add a lightweight in-progress indicator (jump-progress cursor) shown only when `steps > 1` (source spec §3 "jump-progress cursor for long jumps") |
| `frontend/src/renderer/components/layout/HistoryPanel.tsx:42-61` (render) | flat `<button>` list, no icon, no expand, no footer | ADD: (a) op-class icon span per row via the heuristic classifier (OD-5); (b) expand/collapse chevron `▸`/`▾` on rows where `childDescriptions` is non-empty, rendering a nested read-only list (jump target stays the parent row's `onClick`, per source spec §3); (c) footer `<div className="history-panel__footer">{past.length} of {MAX_UNDO_ENTRIES} steps</div>` (import `MAX_UNDO_ENTRIES` — currently module-private in `undo.ts:12`, export it); (d) `title={new Date(entry.timestamp).toLocaleString()}` on each row for hover timestamps |
| NEW `frontend/src/renderer/utils/history-op-class.ts` | does not exist | New pure function `classifyOpForIcon(description: string): 'edit' \| 'routing' \| 'freeze' \| 'paint' \| 'transform'` keyed on the Ledger keyword vocabulary above (OD-5); exported icon map `{ edit: '✎', routing: '⧉', freeze: '❄', paint: '✦', transform: '⌗' }` |
| `frontend/src/renderer/styles/floating-panel.css:1-62` | only `--left`/`--right` overlay variants, no docked/footer/icon styling | ADD `.history-panel__footer`, `.history-panel__entry-icon`, `.history-panel__entry-toggle`, `.history-panel__entry-children` classes; no new dock-registry CSS (OD-1 scope) |
| NEW `frontend/src/__tests__/perf/history-memory-smoke.test.ts` | does not exist | Opt-in perf tier per OD-2 |
| `frontend/package.json` | no `test:perf` script | ADD `"test:perf": "RUN_PERF=1 node --expose-gc ./node_modules/.bin/vitest run src/__tests__/perf"` (mirrors backend's `RUN_PERF=1` convention, does not touch the default `npx --no vitest run` smoke command) |

## Packet candidates

| Packet | Files | Risk | Oracle |
|---|---|---|---|
| P1 — Hotkey wiring | none (no code — T1 Verdicts override: menu-entry-only, accelerator picked at build/UAT) | LOW | `grep` confirming no `meta+y`/`toggle_history` binding exists in `default-shortcuts.ts`/`App.tsx`, and the existing Edit → Undo History menu item is unchanged |
| P2 — Statusbar breadcrumb | `App.tsx` (`HistoryBreadcrumbChip`, status-bar mount) | LOW | Component test (real mount, `@testing-library/react` — confirmed available, proposal.md Code-Ground Register) asserting: empty history → chip renders nothing; one `undoable()` call → chip text equals the entry's description; click → `showHistory` becomes true |
| P3 — Dockable-look persistence (interim) | `App.tsx` (localStorage read/write for `showHistory`) | MED (touches app-boot state restore path) | Component/integration test: set `localStorage['creatrix.historyPanel.open']='true'`, remount, assert panel renders open; toggle closed, assert localStorage updated |
| P4 — undo.ts core extensions | `stores/undo.ts` (`undo`, `redo`, `commitTransaction`), `shared/types.ts` (`childDescriptions?`) | MED — behavior-changing return-type edit on a widely-called function; caller sweep required (OD-4). Wave-0 Packet 0a does NOT touch `undo.ts` (its files are `ledger-lint.test.ts` + `project.ts` only) — no cross-change sequence-check needed | Vitest unit on `undo.ts` (extends existing `frontend/src/__tests__/stores/undo.test.ts`): (a) `undo()`/`redo()` return `true` on success, `false` + toast on a throwing `inverse`/`forward`, and leave `past`/`future` untouched on failure; (b) `commitTransaction()`'s composite entry has `childDescriptions` equal to the buffered entries' descriptions in order |
| P5 — HistoryPanel row upgrades | `HistoryPanel.tsx`, NEW `history-op-class.ts`, `floating-panel.css` | MED — depends on P4's boolean-returning `undo()`/`redo()` and `childDescriptions` | Component test (real mount): each Ledger-keyword description renders the correct icon; a transaction entry with `childDescriptions` renders a collapsed chevron that expands to the child list on click without changing `past`/`future`; footer text matches `${past.length} of 500 steps`; multi-step jump with a failing inverse stops the panel's active-index highlight at the last successful step and a toast fires (assert via mocked `useToastStore`) |
| P6 — Memory smoke perf tier | NEW `history-memory-smoke.test.ts`, `package.json` (`test:perf` script) | LOW (test-only, opt-in, never gates CI) | Run manually: `RUN_PERF=1 node --expose-gc ./node_modules/.bin/vitest run src/__tests__/perf` — asserts `global.gc()`-measured heap delta after populating 500 closure-based `UndoEntry` objects stays under a fixed budget (document the chosen MB threshold in the test file; recommend starting at a generous bound, e.g. 50MB, and tightening once a real baseline is observed — no prior baseline exists, per OD-2) |

**Suggested order:** P1 → P2 (both trivial, parallel-safe) → P4 (core, must land before P5) → P5
→ P3 (independent of P4/P5, parallel-safe anytime after P1) → P6 (test-only, anytime, no
dependencies).

## Test Plan

### Unit (Vitest, mock IPC where the file imports `window.entropic`)
- `frontend/src/__tests__/stores/undo.test.ts` (extend): `undo()`/`redo()` boolean return +
  toast-on-failure + stack-unchanged-on-failure (P4); `commitTransaction()` populates
  `childDescriptions` (P4).
- `frontend/src/__tests__/utils/shortcuts.test.ts` (extend, or new
  `frontend/src/__tests__/utils/history-op-class.test.ts`): `classifyOpForIcon()` against each
  Ledger-keyword example verbatim from the table above, plus an unmatched-description default
  case (P5/OD-5).
- P1 ships no test — no code is added (T1 Verdicts override: menu-entry-only, accelerator picked
  at build/UAT). Verification is the grep-based hard oracle in `packets.md`'s P1 section, not a
  vitest addition.

### Component (Vitest + `@testing-library/react`, `environment: 'happy-dom'` — confirmed
configured, proposal.md Code-Ground Register; do NOT repeat the old store-logic-only pattern from
`frontend/src/__tests__/components/timeline/history-panel.test.ts` for *new* assertions — that
file's "not configured" comment is stale)
- `HistoryPanel` row rendering: icon-per-class, expand/collapse for transaction rows, footer
  count, hover-timestamp `title` attribute (P5).
- `HistoryBreadcrumbChip`: empty/non-empty/click-opens-panel (P2).
- Docked-look persistence round-trip via `localStorage` mock (P3).

### Backend
- None. This change is frontend-only (Electron renderer + main-process menu, both already
  wired); no sidecar/Python surface is touched.

### BDD scenarios (source spec §7, scoped to what's IN this change — Ledger lint and
jump==N×undo parity are already covered by existing tests / Wave-0 Packet 0a respectively, not
re-tested here)

```
Scenario: Cmd+Y opens and closes the history panel
  Given the history panel is closed
  When the user presses Cmd+Y
  Then the history panel is visible
  When the user presses Cmd+Y again
  Then the history panel is hidden

Scenario: Edit -> Undo History always opens, never closes
  Given the history panel is open
  When the user selects Edit -> Undo History from the menu
  Then the history panel remains open (documented open-only divergence from the hotkey)

Scenario: Statusbar breadcrumb reflects the last action
  Given the user performs an undoable action described "Freeze C1"
  Then the statusbar shows "Freeze C1"
  When the user clicks the statusbar breadcrumb
  Then the history panel opens

Scenario: Transaction row expands without changing the undo stack
  Given a transaction "Record gesture (skew, rot)" was committed with 3 buffered mutations
  And the history panel is open
  When the user clicks the row's expand chevron
  Then the 3 child descriptions are shown
  And the panel's current-index highlight is unchanged
  And clicking the (still collapsed-equivalent) row itself jumps to the whole transaction, not a child step

Scenario: Failing inverse during a multi-step jump stops cleanly
  Given the undo stack has entries A, B, C (C most recent) and B's inverse throws
  And the history panel is open showing a jump-progress cursor is expected for jumps > 1 step
  When the user clicks entry A to jump backward 2 steps
  Then C's inverse runs successfully first
  And B's inverse throws
  And the jump stops with the stack landing after C's undo but before B's
  And an error toast is shown
  And no exception propagates out of the click handler

Scenario: Footer reflects position, not combined count
  Given 12 actions have been executed and 4 have been undone
  Then the footer reads "8 of 500 steps"
```
