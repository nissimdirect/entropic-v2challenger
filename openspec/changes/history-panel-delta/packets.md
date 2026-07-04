# Packets — history-panel-delta

**Emitted:** 2026-07-04 by /packetize. **Plan:** `plan.md` (same dir — packets POINT to its
line-anchored normative sections; do not re-derive). **Proposal:** `proposal.md` — T1 Verdicts
LOCKED 2026-07-03 ("Accept all 33 defaults"; hotkey ODs governed by the global verdict:
menu-entry-only now, accelerator picked at build/UAT — do not re-open OD-1..OD-5).
**Route:** /eng Phase 3M.

**Branching rule (every packet):** cut from `origin/main` only (parallel UAT session owns the
local checkout — do not touch its branch/stash). PR-only; squash; no `.github/workflows/**`
edits.
**Merge gate (every packet, STRICT FULL-TIER):** full backend pytest + full vitest green (vitest
run on main-checkout or CI — worktree executors cannot run vitest locally) → `Skill(review)` via
Skill tool → full CI green.

### P1 — Hotkey wiring (`toggle_history`) — DEFERRED, menu-entry-only this packet
- **Scope:** T1 Verdicts global override (LOCKED): "menu-entry-only now, accelerator picked at
  build/UAT — do not add a keybinding in this packet." This packet does NOT add a shortcut binding
  to `default-shortcuts.ts` and does NOT call `shortcutRegistry.register('toggle_history', ...)` in
  `App.tsx` — the `meta+y` binding and its registration named in earlier drafts of this packet are
  dropped entirely. Discoverability for this packet is the existing **Edit → Undo History** menu
  item only (`menu.ts:46-48`, sends `'show-history'`; `App.tsx:2360`'s `case 'show-history':
  setShowHistory(true); break`) — it stays exactly as shipped today, open-only, UNCHANGED. Mirrors
  `system-monitor-v1`'s pattern of shipping a `menu.ts` item with no `accelerator` field: no
  keybinding this packet; the accelerator is a separate, later build/UAT decision. **Non-scope:**
  any edit to `default-shortcuts.ts` or `shortcuts.ts`; any `App.tsx` registration-block change; any
  new menu entry (the existing item already covers this packet's scope).
- **Files:** none — no code change this packet. (Confirmation-only: prove no live keybinding
  exists and the existing menu item is untouched.)
- **Depends:** none. **Blocks:** none (P2/P3 no longer share any `App.tsx` region with P1 — see
  single-flight map).
- **Risk:** LOW.
- **Hard oracle:** `grep -n "meta+y\|toggle_history"
  frontend/src/renderer/utils/default-shortcuts.ts frontend/src/renderer/App.tsx` returns zero
  hits (no live binding exists); `grep -n "Undo History" frontend/src/main/menu.ts` still shows the
  existing menu item, unchanged from Code-Ground Register's citation.
- **Test plan:** none — no code is shipped in this packet. The grep above is the packet's own
  verification, not a test-suite addition.
- **STOP:** if a `meta+y`/`toggle_history` binding is found anywhere by the grep above → STOP and
  remove it before closing this packet; a live keybinding here is a T1 Verdicts locked-decision
  violation, not a valid variant.
- **Executor brief:** Sonnet. Inline verbatim: the T1 Verdicts global override text above
  ("menu-entry-only now, accelerator picked at build/UAT — do not add a keybinding in this
  packet"), Rule 3 (do what was asked, nothing more — do not add a binding "to be helpful"). Last
  line: return the two grep outputs proving no binding exists and the menu item is unchanged.

### P2 — Statusbar breadcrumb (`HistoryBreadcrumbChip`)
- **Scope:** new `HistoryBreadcrumbChip()` function component following the `CursorToolChip`
  pattern verbatim (`App.tsx:200-226` — small function component reading external state,
  rendering a `<span className="status-bar__...">`): reads
  `useUndoStore(s => s.past[s.past.length - 1]?.description)`; renders nothing when `past` is
  empty; `onClick` calls `setShowHistory(true)` (open-only semantics — same as the menu item, NOT
  a toggle, because "clicking a breadcrumb is a deliberate act" per plan.md). Mount inside
  `status-bar__right` alongside `<CursorToolChip />`. **Non-scope:** any change to
  `CursorToolChip` itself; any change to the breadcrumb's text formatting beyond the raw
  `description` string (no truncation/ellipsis logic unless the existing chip pattern already has
  one to copy).
- **Files:** `frontend/src/renderer/App.tsx` (ADD `HistoryBreadcrumbChip` component + mount at
  `status-bar__right`, `App.tsx:4235-4266` region).
- **Depends:** none functionally (reads `useUndoStore` which already exists); shares `App.tsx`
  with P3 — see single-flight map for serialization order (P1 ships no code and touches no region
  of `App.tsx` — T1 Verdicts override, menu-entry-only). **Blocks:** none.
- **Risk:** LOW.
- **Hard oracle:** `cd frontend && npx vitest run src/__tests__/components/history-breadcrumb-chip.test.tsx`
  exits 0 with 3 assertions green: (a) empty history → chip renders nothing (queryByTestId
  returns null); (b) after one `undoable()` call → chip text equals the entry's description
  byte-identical; (c) click → `showHistory` store/prop value becomes `true`. Test (a) must FAIL
  against a stub that always renders (anti-dead-flag: write the "renders nothing when empty"
  assertion first, confirm it fails against a naive always-render implementation, then implement
  the guard).
- **Test plan:** component (real mount, `@testing-library/react`, `environment: 'happy-dom'` —
  confirmed configured per proposal.md Code-Ground Register) — new
  `frontend/src/__tests__/components/history-breadcrumb-chip.test.tsx`: empty/non-empty/click
  cases above, mock `useUndoStore` and `setShowHistory` prop/callback.
- **STOP:** if `useUndoStore`'s `past` array shape has changed since proposal.md's verification
  (e.g. if P4 has already landed and changed the entry shape in a way that breaks the
  `.description` read) → STOP and re-verify current `undo.ts` state before wiring the selector.
- **Executor brief:** Sonnet. Inline verbatim: Rule 1 (read before edit), Gate 14 Wiring Check
  (verify the callback triggers `setShowHistory` and the component actually mounts where claimed
  — mentally click the chip, which element is topmost), Test Layer Selection (component
  interaction → Vitest component test with mock IPC/store). Last line: PR # + the 3-assertion test
  output.

### P3 — Dockable-look persistence (interim, OD-1)
- **Scope:** persist `showHistory` open/closed boolean to `localStorage` key
  `creatrix.historyPanel.open` (OD-1 recommended default, T1-locked): rehydrate
  `App.tsx:381`'s `useState(false)` initial value from `localStorage` on mount; persist on every
  change via a `useEffect`. Visually anchor the existing `floating-panel--left` overlay flush to
  the left edge — no drag-repositioning added (explicitly out per OD-1: "true multi-slot docking
  is Stage B's job"). **Non-scope:** any panel-registry code (no such registry exists in
  `frontend/src`, confirmed by proposal.md's Code-Ground Register grep — do not build one);
  position/size persistence beyond the boolean open state; multiwindow pop-out.
- **Files:** `frontend/src/renderer/App.tsx` (`showHistory` state init at :381, localStorage
  read/write; panel mount region :4099-4116 for flush-left anchoring CSS class only).
- **Depends:** none functionally; shares `App.tsx` `showHistory` state with P2 — see
  single-flight map (P1 ships no code — T1 Verdicts override, menu-entry-only — and does not touch
  `showHistory`). **Blocks:** none. Parallel-safe with P4/P5 anytime.
- **Risk:** MED (touches app-boot state restore path — a stale/malformed `localStorage` value
  must not crash boot).
- **Hard oracle:** new component/integration test:
  `cd frontend && npx vitest run src/__tests__/components/history-panel-dock-persistence.test.tsx`
  — (a) set `localStorage['creatrix.historyPanel.open']='true'`, remount `App`, assert panel
  renders open; (b) toggle closed via the panel's close control, assert `localStorage` value
  updates to `'false'`; (c) set `localStorage['creatrix.historyPanel.open']` to a malformed value
  (e.g. `'{corrupt'`) and assert mount does NOT throw and falls back to closed (trust-boundary
  case — `localStorage` is user/browser-writable, treat as untrusted input at the rehydration
  boundary). Case (a) must FAIL against pre-packet `main` (no read-from-localStorage code exists
  yet) — anti-dead-flag.
- **Test plan:** component (real mount) — new
  `frontend/src/__tests__/components/history-panel-dock-persistence.test.tsx`: round-trip open/close
  via `localStorage` mock, malformed-value fallback (trust-boundary case above).
- **Trust-boundary rule:** the REAL boundary here is the `localStorage` READ at app-boot
  rehydration (`App.tsx:381`'s init), not any IPC parser — verify with a caller grep
  (`grep -rn "creatrix.historyPanel.open" frontend/src`) showing exactly one read site and one
  write site before declaring the guard complete.
- **STOP:** if `App.tsx:381`'s `showHistory` state has been restructured (e.g. lifted into a
  store) by a parallel packet before this lands → STOP and re-verify current shape.
- **Executor brief:** Sonnet. Inline verbatim: the trust-boundary rule above (validate malformed
  localStorage input, don't assume it's always well-formed JSON/boolean), OD-1 verbatim
  (proposal.md — interim docked-look only, no registry), Rule 4 (don't over-engineer — no
  position/size persistence, no drag). Last line: PR # + the malformed-value fallback test output.

### P4 — undo.ts core extensions (boolean returns + childDescriptions) — shared file, sequence-check required
- **Scope:** everything in `plan.md`'s `undo.ts`/`types.ts` rows: (a) wrap `entry.inverse()` in
  `undo()` (`undo.ts:85-102`) in `try/catch` matching `execute()`'s existing shape (`undo.ts:63-83`)
  — on catch: toast `level: 'error'`, `source: 'undo'`, return `false` WITHOUT mutating
  `past`/`future` (stops at last good step, OD-4); return `true` on success; change return type
  `void → boolean`. (b) Same treatment mirrored for `redo()` (`undo.ts:104-121`) against
  `entry.forward()`/`future`. (c) Add optional `childDescriptions?: string[]` field to `UndoEntry`
  in `frontend/src/shared/types.ts:559-564` (additive, session-only — never persisted, confirmed
  by proposal.md's Code-Ground Register grep of `project-persistence.ts` — zero hits for
  `useUndoStore`). (d) In `commitTransaction()` (`undo.ts:135-186`), when building `compositeEntry`
  (:165-177), set `childDescriptions: entries.map(e => e.description)`. (e) Export
  `MAX_UNDO_ENTRIES` from `undo.ts:12` (currently module-private) for P5's footer to consume.
  **Non-scope:** any change to `execute()`'s existing try/catch (already correct); the History
  Ledger description-quality rule/lint over `undoable()` call sites (Wave-0 Packet 0a, separate
  change — do NOT touch call sites, only the `undo`/`redo`/`commitTransaction` function bodies
  and the `UndoEntry` type).
- **Files:** `frontend/src/renderer/stores/undo.ts` (`undo`, `redo`, `commitTransaction`, export
  `MAX_UNDO_ENTRIES`), `frontend/src/shared/types.ts` (`UndoEntry.childDescriptions?`).
- **Depends:** none functionally (dispatchable now). **No cross-change dependency:** the Wave-0
  lane's Packet 0a (History Ledger lint over `undoable()` call sites, a SEPARATE change per
  `PLANNING-QUEUE.md` Lane 1 item 1) does NOT touch `undo.ts` — its file list is a new
  `frontend/src/__tests__/stores/ledger-lint.test.ts` plus `frontend/src/renderer/stores/project.ts`
  (descriptions only); `undo.ts` only DEFINES `undoable()`, it has no `undoable()` call sites for
  Packet 0a's lint to touch. No rebase/sequence-check against Packet 0a is needed before this
  packet's PR merges. **Blocks:** P5 (needs boolean-returning `undo()`/`redo()` and
  `childDescriptions` to render jump-progress and transaction children).
- **Risk:** MED — behavior-changing return-type edit on a widely-called function (`undo`/`redo`
  callers must be checked for return-value ignorance vs. new usage — verify with `grep -rn
  "\.undo()\|\.redo()" frontend/src/renderer` that no existing caller breaks from the
  `void→boolean` signature change, which is additive/safe in TS but must be confirmed, not
  assumed). No cross-change file-collision risk — Packet 0a does not touch `undo.ts` (see Depends
  above).
- **Hard oracle:** `cd frontend && npx vitest run src/__tests__/stores/undo.test.ts` exits 0 with
  NEW assertions: (a) `undo()` returns `true` on a normal successful undo; (b) given an entry
  whose `inverse` throws, `undo()` returns `false`, a toast fires (assert via mocked
  `useToastStore`), and `past`/`future` are BYTE-IDENTICAL to their pre-call state (stack
  untouched on failure — this must FAIL on pre-packet `main` since today's `undo()` mutates state
  unconditionally before/regardless of the throw, proving the test is live); (c) same (a)/(b)
  mirrored for `redo()`/`forward()`; (d) `commitTransaction()`'s composite entry has
  `childDescriptions` array equal to the buffered entries' descriptions IN ORDER.
- **Test plan:** unit — extend `frontend/src/__tests__/stores/undo.test.ts` with cases (a)-(d)
  above. No component layer (pure store logic).
- **STOP:** if the `grep -rn "\.undo()\|\.redo()"` caller sweep finds a caller that actively
  relies on the OLD `void` return in a way that breaks (e.g. destructures/awaits it as something
  else) → STOP and report before landing the signature change. If `undo.ts`'s current line ranges
  have shifted materially from proposal.md's Code-Ground Register (parallel session activity —
  NOT Packet 0a, which does not touch this file) → STOP and re-verify current state before
  editing.
- **Executor brief:** Sonnet. Inline verbatim: OD-4 full text (proposal.md — "fix it in this
  change... same shape as the existing execute()/undoable() catch blocks... Packet 0a does not
  touch undo.ts, no rebase/sequence-check needed"), Gate 13 Trace Path (chain: `undo()` call
  site → store action → this fix — grep every caller before declaring done), Gate 1 (read the
  full file before editing). Last line: PR # + the caller-grep output showing no broken callers.

### P5 — HistoryPanel row upgrades (icons, expand, footer, jump-progress)
- **Scope:** everything in `plan.md`'s `HistoryPanel.tsx`/`floating-panel.css`/new
  `history-op-class.ts` rows: (a) new pure function `classifyOpForIcon(description: string):
  'edit' | 'routing' | 'freeze' | 'paint' | 'transform'` in NEW
  `frontend/src/renderer/utils/history-op-class.ts`, keyed on the Ledger keyword vocabulary
  verbatim from `plan.md`'s normative table ("Route"/"Edit tap"→routing, "Freeze"→freeze, "Paint
  stroke"/"Record gesture"→paint, "transform"/drag verbs→transform, default→edit); exported icon
  map `{ edit: '✎', routing: '⧉', freeze: '❄', paint: '✦', transform: '⌗' }` (icon set is
  NORMATIVE, copy verbatim from proposal.md/plan.md — do not invent substitutes). (b) render an
  op-class icon span per row in `HistoryPanel.tsx` (:42-61) using the classifier. (c) expand/collapse
  chevron `▸`/`▾` on rows where `childDescriptions` is non-empty (from P4), rendering a nested
  read-only list — clicking the row itself STILL jumps to the whole transaction (jump target
  unchanged by expansion, per source spec §3 — expansion is informational only, never
  independently jumpable). (d) footer `{past.length} of {MAX_UNDO_ENTRIES} steps` (import the
  now-exported `MAX_UNDO_ENTRIES` from P4). (e) `title={new Date(entry.timestamp).toLocaleString()}`
  hover timestamp per row. (f) `handleJump` (:8-28) now checks the boolean return of each
  `undo()`/`redo()` call (from P4); breaks the loop on `false` (failing inverse stops at last good
  step, OD-4); add a lightweight jump-progress indicator shown only when `steps > 1`. (g) CSS:
  `.history-panel__footer`, `.history-panel__entry-icon`, `.history-panel__entry-toggle`,
  `.history-panel__entry-children` classes in `floating-panel.css`. **Non-scope:** any `opClass`
  schema field on `UndoEntry` (OD-5 — heuristic only, no schema change, no `undoable()` call sites
  touched); dock-registry CSS (OD-1, that's P3's scope); v2 snapshots.
- **Files:** `frontend/src/renderer/components/layout/HistoryPanel.tsx`, NEW
  `frontend/src/renderer/utils/history-op-class.ts`, `frontend/src/renderer/styles/floating-panel.css`.
- **Depends:** P4 (HARD — needs boolean-returning `undo()`/`redo()` and `childDescriptions`;
  cannot dispatch until P4 merges). **Blocks:** none.
- **Risk:** MED — depends on P4's contract; failing-inverse UX path is easy to get subtly wrong
  (must not desync the panel's active-index highlight from the actual stack state).
- **Hard oracle:**
  `cd frontend && npx vitest run src/__tests__/utils/history-op-class.test.ts src/__tests__/components/timeline/history-panel.test.ts`
  exits 0 with: (a) each Ledger-keyword example from `plan.md`'s table verbatim (e.g. "Route A2 →
  B1 (mask)", "Freeze C1", "Paint stroke (G2)", "Simplify lane (−212 pts)") classifies to the
  correct icon, plus one unmatched-description default case → 'edit'; (b) a transaction entry
  with 3 `childDescriptions` renders a collapsed chevron that expands to show all 3 children on
  click WITHOUT changing `past`/`future` (assert store state identity before/after the click); (c)
  footer text equals `${past.length} of 500 steps` for a fixture with a known `past.length`; (d) a
  multi-step jump (3 steps) where the middle step's inverse throws stops the panel's active-index
  highlight at the last successful step, fires exactly one toast (mocked `useToastStore`), and NO
  exception propagates out of the click handler (test asserts no unhandled rejection/throw). Case
  (d) must FAIL against pre-packet `main`'s tight `for` loop (no per-step check exists today) —
  anti-dead-flag proof, capture the pre-fix failure output in the PR.
- **Test plan:** unit — new `frontend/src/__tests__/utils/history-op-class.test.ts` (classifier
  against every Ledger keyword + default case). Component (real mount) — extend/replace
  `frontend/src/__tests__/components/timeline/history-panel.test.ts` (its "not configured" header
  comment is STALE per proposal.md's Code-Ground Register — `@testing-library/react` +
  `happy-dom` are confirmed available; do not repeat the store-logic-only pattern for these NEW
  assertions): icon-per-row, expand/collapse, footer count, hover-timestamp `title` attribute,
  failing-inverse multi-step jump (case d above).
- **UAT journey (user-facing panel):** open History panel (Cmd+Y or breadcrumb click) → perform 3
  actions of different op-classes (an edit, a routing change, a freeze) → verify 3 distinct icons
  render in the row list, pixel-verified via `--cx-*` design tokens (no raw hex — hex-ratchet
  rule) → commit a transaction (e.g. a multi-mutation gesture) → verify it renders as ONE row with
  a chevron → click chevron → verify child descriptions appear, row's own jump target unchanged →
  verify footer reads "N of 500 steps" matching the actual undo-stack depth → trigger a
  failing-inverse jump (test fixture) → verify a toast appears and the panel highlight stops at
  the last good step, no crash.
- **STOP:** if implementing the failing-inverse stop requires changing `handleJump`'s loop
  direction/semantics beyond "check return value, break on false" (e.g. if partial-jump UX needs
  a rollback-to-start design instead of stop-in-place) → STOP and report — this packet ships
  stop-in-place only, per OD-4's plan.md description; any different UX is a re-open of a locked
  decision.
- **Executor brief:** Sonnet. Inline verbatim: the Ledger keyword vocabulary table (plan.md,
  copy exact strings — do not paraphrase the classifier's keyed phrases), hex-ratchet rule (no
  raw hex in CSS, use `--cx-*` tokens), Gate 14 Wiring Check (verify chevron click actually
  expands without touching `past`/`future` — mentally click, check what's topmost). Last line: PR
  # + the anti-dead-flag failing-then-passing output for the multi-step-jump test + screenshot
  paths for the UAT journey.

### P6 — Memory smoke perf tier (OD-2)
- **Scope:** opt-in perf tier mirroring the backend's `RUN_PERF=1` pattern
  (`backend/tests/perf/test_routing_budget.py:9,32-33`): new
  `frontend/src/__tests__/perf/history-memory-smoke.test.ts`, skipped by default (`if
  (!process.env.RUN_PERF) return` guard at module scope); populate 500 closure-based `UndoEntry`
  objects via `execute()`, call `global.gc()` before and after (requires `node --expose-gc`),
  assert heap delta stays under a fixed, documented MB budget (recommend starting generous — e.g.
  50MB — and tightening once a real baseline is observed, per OD-2; no prior baseline exists).
  Add `"test:perf": "RUN_PERF=1 node --expose-gc ./node_modules/.bin/vitest run
  src/__tests__/perf"` to `frontend/package.json`. **Non-scope:** making this part of the default
  `npx vitest run` smoke tier or any CI gate — it NEVER gates PRs, mirrors the backend's
  nightly-only convention exactly; any actual memory optimization of `UndoEntry` (this packet only
  measures, per proposal.md's Non-goals — "OUT until the memory-smoke measurement in this change
  says it matters").
- **Files:** NEW `frontend/src/__tests__/perf/history-memory-smoke.test.ts`,
  `frontend/package.json` (`test:perf` script addition only).
- **Depends:** none (test-only, can dispatch anytime, no code dependency on P1-P5). **Blocks:**
  none.
- **Risk:** LOW (test-only, opt-in, never gates CI — explicitly cannot break a build).
- **Hard oracle:** manual run `cd frontend && RUN_PERF=1 node --expose-gc
  ./node_modules/.bin/vitest run src/__tests__/perf/history-memory-smoke.test.ts` exits 0 and
  prints the measured heap delta in MB (documented in the test file's console output); default
  `cd frontend && npx vitest run` (no `RUN_PERF`) shows the perf test SKIPPED, not failed, not
  silently absent (confirms the guard fires — run `npx vitest run --reporter=verbose` and grep for
  the test name showing `skipped`).
- **Test plan:** perf tier only (opt-in, this test file IS the deliverable) — no unit/component
  equivalent needed; this is intentionally outside the standard pyramid per OD-2's methodology.
- **STOP:** if `global.gc()` is undefined even with `--expose-gc` passed (Node/Vitest worker
  isolation issue) → STOP and report the exact Vitest pool config needed (may require
  `poolOptions.forks.execArgv` in `vitest.config.ts` — do not silently fall back to a
  non-deterministic heap check).
- **Executor brief:** Sonnet. Inline verbatim: OD-2 full recommended-default text (proposal.md —
  opt-in tier, `RUN_PERF=1` guard, `--expose-gc`, generous starting budget), Rule 5 (batch/test
  work is code not tokens — write the script, don't hand-measure). Last line: PR # + the measured
  MB delta from the manual run + confirmation the default `npx vitest run` shows it skipped.

## Single-flight map
| File | Packets | Order |
|---|---|---|
| `frontend/src/renderer/App.tsx` | P2 (status-bar mount ~4235-4266), P3 (`showHistory` state init :381 + panel mount region :4099-4116) | P2 → P3 (disjoint regions but same file — land sequentially to avoid merge noise; may be developed in parallel branches but must rebase onto whichever of P2/P3 merges first). P1 ships no code and touches no region of this file (T1 Verdicts override — menu-entry-only). |
| `frontend/src/renderer/stores/undo.ts` | P4 only (this change, function bodies `undo`/`redo`/`commitTransaction`) | P4 only — no other packet in this change or in Wave-0 Packet 0a touches this file. Corrected: Packet 0a's file list is `ledger-lint.test.ts` + `project.ts` only; it does not touch `undo.ts`, so no rebase/sequence-check is needed. |
| `frontend/src/shared/types.ts` | P4 (`UndoEntry.childDescriptions?` addition) | P4 only — no other packet in this change touches it |
| `frontend/src/renderer/components/layout/HistoryPanel.tsx` | P5 only | P5 only (no conflict) |

## Coverage check (plan.md → packets)
Discoverability (hotkey) → DEFERRED to build/UAT (T1 Verdicts override: menu-entry-only this
change; P1 confirms no keybinding is added, existing Edit → Undo History menu item covers this
scope) · Discoverability (statusbar breadcrumb) → P2 · Discoverability
(dockable-home / OD-1 interim persistence) → P3 · Row op-class icons (OD-5 heuristic) → P5 ·
Transaction expandable rows (OD-3 `childDescriptions` schema + render) → P4 (schema) + P5 (render)
· Footer "N of 500 steps" → P5 (consumes P4's exported `MAX_UNDO_ENTRIES`) · Jump-progress cursor
for long jumps → P5 · Failing-inverse stops at last good step + toast (OD-4, `undo`/`redo` fix) →
P4 (store fix) + P5 (panel loop consumes it) · Memory smoke perf tier (OD-2) → P6 · History Ledger
description-quality rule/lint → EXPLICITLY DESCOPED (Wave-0 Packet 0a, separate change per
proposal.md's SCOPED OUT note — not a packet in this change, named as a cross-change dependency in
P4 instead) · v2 snapshots → EXPLICITLY DESCOPED (proposal.md Non-goals, separate future change) ·
Full panel-registry / multiwindow dock-or-pop-out → EXPLICITLY DESCOPED (proposal.md Non-goals —
no registry exists in code, OD-1 ships interim-only) · PRD.md:132 50MB-RAM/overflow-to-disk →
EXPLICITLY DESCOPED (proposal.md Non-goals, gated on P6's measurement result) · `undoable()` call
site description-string changes → EXPLICITLY DESCOPED (Ledger rule's job, not this change's).
Nothing silently narrowed.

## Ledger
| Packet | Status | PR | Oracle evidence |
|--------|--------|----|-----------------|
| P1 | ⬜ | — | — |
| P2 | ⬜ | — | — |
| P3 | ⬜ | — | — |
| P4 | ⬜ | — | — |
| P5 | ⬜ | — | — |
| P6 | ⬜ | — | — |
