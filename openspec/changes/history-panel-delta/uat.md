# PRE-BUILD UAT — history-panel-delta

**Companion to** `docs/UAT-PLAN-2026-07-02-live-cu.md` (runtime protocol applies verbatim: launch
from the canonical checkout `cd frontend && npm start`, verify live-runtime path before any
verdict, kill+relaunch on any Zustand store-shape change — P4/P5 change `UndoEntry`'s shape and
`undo`/`redo`'s return type, so relaunch is mandatory before driving P3/P5 rows, never trust HMR)
and `docs/UAT-CU-ADDENDUM-2026-07-03.md` (row style: every row traces to a packet, the Oracle
column names falsifiable on-screen/pixel/log evidence, the Trap column states the exact
rubber-stamp the row is designed to catch).

**Why this doc exists / when to run it:** this is the PRE-BUILD UAT for `history-panel-delta`
(`openspec/changes/history-panel-delta/packets.md` + `plan.md`, post-reinforcement). Every row
below is written against **pre-packet `main`** and is designed to be re-run, unmodified,
immediately after each packet (P1–P6) merges — the row's stated pre-ship baseline IS the
build-completion detector. Do not skip the pre-ship half of a row because "obviously nothing is
there yet" — the pre-ship screenshot is what proves the post-ship screenshot is caused by the
packet, not by something else already in the app.

**Hard rules inherited + applied:**
- Temporal/stateful effects → verdict only across a multi-step/multi-frame sequence, never a
  single screenshot (learning #44). This change has no video-frame playback surface, but the
  same principle applies to History's own stateful sequences: multi-step jumps (P5-6) and
  open/close/persist round-trips (P3) must be judged across the FULL sequence, not one frame.
- Alpha/matte claims → N/A, this change touches no alpha/compositing surface.
- Destructive steps (full app quit, localStorage corruption, forcing a throwing inverse) → always
  on a throwaway project, never the user's real project file.
- Effect-amount-nonzero precheck, adapted for this change: before judging any "icon missing" /
  "row missing" / "chip missing" verdict, first confirm the triggering ACTION actually produced a
  NEW history entry (open History panel, confirm entry count increased) — do not judge a UI gap
  on an action that silently produced zero history entries.
- Every new-UI row is marked **EXPECTED-ABSENT** pre-ship and states the exact pre-packet baseline
  to screenshot first — these rows double as build-completion detectors once each packet ships.
- Verdicts: ✅ ❌ 🐛 ⏸ only, no partials. Screenshot (or shell output) per verdict.

---

## P1 — Hotkey wiring (`toggle_history`) — DEFERRED, menu-entry-only this packet

| # | Check (Setup + Drive) | Oracle (falsifiable evidence) | Trap |
|---|---|---|---|
| P1-1 | **ABSENCE assertion — identical pre- and post-P1 (T1 Verdicts override: P1 ships no code, no keybinding).** Setup: launch the app (throwaway project or Welcome screen). Drive: press **Cmd+Y** at the top level, both before AND after P1 closes. | BOTH pre- and post-P1: no visible effect, no console error (screenshot + DevTools console clean — `meta+y` is unbound and must STAY unbound; any Cmd+Y effect at either point = FAIL, a locked-decision violation). Then open the panel via **Edit → Undo History** and confirm it opens (screenshot) — the menu is the only mechanism this change ships. | An earlier draft of this row treated a working post-ship Cmd+Y toggle as the PASS condition — under the locked menu-entry-only verdict that exact behavior is now the FAIL condition; re-running the old row unmodified would rubber-stamp a violation as success. |
| P1-2 | Setup: perform one undoable action (e.g. move a clip) so History is non-empty — precheck: open **Edit → Undo History** once and confirm the row count is ≥1 before proceeding. Drive: with the panel already open, select **Edit → Undo History** from the menu bar again. | Panel remains open — the second menu selection does NOT close it (screenshot before/after the menu click). Confirms the menu item is force-open-only, never a close/toggle. | A pass that opens the panel once and never re-drives the menu path while it's ALREADY open would miss the exact place a `showHistory`-state bug would surface: the menu accidentally toggling the panel closed instead of being idempotent-open. |
| P1-3 | **Menu-entry-only assertion (T1 Verdicts override — no keybinding this packet).** Setup: launch the app (throwaway project). Drive: (a) focus a text-input field (e.g. the project/track rename field) and press **Cmd+Y** while it's focused; (b) open the **Edit** menu and visually confirm the **Undo History** item shows NO accelerator/keycap text next to it; (c) with no field focused, press **Cmd+Y** at the top level. | (a) The keystroke types a literal "y" into the focused field with no side effect on History (screenshot before/after) — proves no global accelerator is bound. (b) The Edit → Undo History menu item shows no trailing keycap text (screenshot, zoomed). (c) Cmd+Y at the top level produces NO visible effect and no console error — the History panel does NOT open or toggle. A live Cmd+Y binding of ANY kind = FAIL (T1 Verdicts locked-decision violation). Edit → Undo History remains the only path to open the panel (confirm it still opens the panel, menu-only). | Testing only the "does the hotkey work" happy path (as an earlier draft of this row did) would rubber-stamp a locked-decision violation — this packet explicitly ships NO keybinding, so the only correct verdict is a confirmed ABSENCE of any Cmd+Y effect, not a confirmation that it works. |

## P2 — Statusbar breadcrumb (`HistoryBreadcrumbChip`)

| # | Check (Setup + Drive) | Oracle (falsifiable evidence) | Trap |
|---|---|---|---|
| P2-1 | **EXPECTED-ABSENT pre-P2.** Setup: throwaway project with ZERO undoable actions performed — precheck: open **Edit → Undo History** and confirm it reads "No actions yet" before judging the chip. Drive: look at `status-bar__right`, next to the existing `tool: select` chip. | Pre-ship baseline: no breadcrumb chip present (screenshot). Post-ship (after P2 merges): STILL no chip renders while history is empty — it must render nothing, not an empty placeholder (screenshot confirming absence is unchanged even after the packet ships, because history is still empty). | A shallow pass could see "no chip" both before and after shipping and conflate the two — this row must explicitly confirm history is empty (the nonzero-entries precheck, inverted) before treating post-ship chip-absence as correct behavior rather than a build failure. |
| P2-2 | Post-ship. Same project: perform exactly one undoable action with an easily-read description (e.g. rename a track to a unique string). Drive: read the breadcrumb chip text in `status-bar__right`. | Chip text is BYTE-IDENTICAL to that action's description as shown in the History panel's own row (open History via **Edit → Undo History**, compare the two strings character-for-character side by side — screenshot both). | Eyeballing "some plausible label text appeared" without a literal side-by-side string comparison would miss a truncation/formatting bug — the packet's scope explicitly forbids new truncation/ellipsis logic; any truncation found here is itself a finding. |
| P2-3 | Post-ship. Drive: click the breadcrumb chip once (panel should open), then click the SAME chip again while the panel is already open. | First click: History panel opens (screenshot). Second click while already open: panel remains OPEN — does NOT close. Confirms open-only semantics, matching the Edit → Undo History menu item (no hotkey exists this change — T1 Verdicts override, menu-entry-only). | Assuming the breadcrumb toggles the panel open/closed (since it's a repeat-click on the same control) is the exact rubber-stamp this row catches — the packet scope explicitly calls the breadcrumb's semantics open-only ("clicking a breadcrumb is a deliberate act"), never a toggle. |

## P3 — Dockable-look persistence (interim, OD-1)

| # | Check (Setup + Drive) | Oracle (falsifiable evidence) | Trap |
|---|---|---|---|
| P3-1 | **EXPECTED-ABSENT pre-P3.** Throwaway project (destructive: requires a full app quit). Setup: confirm `localStorage.getItem('creatrix.historyPanel.open')` returns `null` in DevTools console pre-ship. Drive: open History (**Edit → Undo History**), fully quit the app (Cmd+Q — not just closing the window), relaunch, reopen the same project. | Pre-ship baseline: History panel is CLOSED on relaunch (screenshot immediately on load, before any menu action) — confirms the current gap. Post-ship (after P3 merges): panel renders OPEN on relaunch WITHOUT the user reopening it via Edit → Undo History (screenshot immediately on load); `localStorage.getItem('creatrix.historyPanel.open')` reads `'true'`. | Testing only within a single app session (never fully quitting) would rubber-stamp React state that "stayed open" merely because nothing ever remounted — never proving the localStorage-rehydration-at-boot path actually fires. |
| P3-2 | Post-ship, continuing from P3-1's open+relaunched state. Drive: click the panel's × close control. Quit fully, relaunch, reopen the same project. | Panel renders CLOSED on this second relaunch (screenshot immediately on load); `localStorage.getItem('creatrix.historyPanel.open')` reads `'false'` — proves the CLOSE path also persists, not only the open path. | Verifying only the open→persist direction (P3-1) and declaring the feature done misses the common asymmetric bug: persisting on open but never writing back on close, leaving the panel stuck open forever after the first open via Edit → Undo History. |
| P3-3 | Post-ship, throwaway project (destructive: injects malformed browser storage). Setup: with the app open, run in DevTools console `localStorage.setItem('creatrix.historyPanel.open', '{corrupt')` (malformed, non-boolean value simulating corrupted/untrusted storage). Drive: fully quit (Cmd+Q) and relaunch WITHOUT clearing that key. | App boots successfully to the Welcome screen or last project, no crash / no blank screen (screenshot successful boot). History panel falls back to CLOSED (the documented safe default) — zero uncaught exceptions referencing `historyPanel` or `JSON.parse` in the DevTools console (check the full console log, not just the first line). | Only testing well-formed `'true'`/`'false'` values (P3-1/P3-2) and never injecting a malformed value would miss the exact trust-boundary bug the packet calls out: localStorage is user/browser-writable and must be treated as untrusted input at the rehydration boundary, not assumed well-formed. |
| P3-4 | Post-ship. Drive: open the History panel (**Edit → Undo History**). Attempt to click-drag the panel by its "Undo History" title bar to a different screen position. | Panel does NOT move — stays flush to the left edge in its fixed `floating-panel--left` position regardless of the drag attempt (screenshot before/after the drag gesture, position identical). | A pass that only confirms the panel LOOKS anchored left, without actually attempting to drag it, could miss an accidental drag-handler regression introduced by whatever CSS/DOM changes the flush-left anchoring required — OD-1 explicitly excludes drag-repositioning from this change. |

## P4 — undo.ts core extensions (backend/logic-only — shell-command oracle rows)

*No UI surface of its own; P4's contract is consumed by P5. Rows are shell-command oracles per
the packet's own hard-oracle spec, run against the frontend test suite (not a live CU drive).*

| # | Check (shell command) | Oracle (expected output) | Trap |
|---|---|---|---|
| P4-1 | **PRE-P4 baseline.** Run `cd frontend && npx vitest run src/__tests__/stores/undo.test.ts` on pre-packet `main`, then read `undo.ts:85-102` (`undo()`) directly. | Today's `undo()` calls `entry.inverse()` UNGUARDED — no try/catch exists, and it mutates `past`/`future` unconditionally regardless of whether `inverse()` throws. Record this baseline (paste the read file excerpt) as what post-ship must fix. | Skipping the pre-packet baseline read and only checking post-ship green would let a vacuous test (one that passes identically before and after the fix) slip through — anti-dead-flag protocol requires confirming the pre-fix behavior first. |
| P4-2 | **POST-P4.** Run `cd frontend && npx vitest run src/__tests__/stores/undo.test.ts`. | Exits 0 with new assertions passing: (a) `undo()` returns `true` on a successful undo; (b) given a throwing `inverse`, `undo()` returns `false`, fires exactly ONE toast (`level:'error'`, `source:'undo'`), and `past`/`future` are BYTE-IDENTICAL to their pre-call values (a snapshot/deep-equal taken before the call, not just a truthiness check); (c) `redo()`/`forward()` mirrors (a)/(b). Paste the full vitest pass/fail summary. | A green run alone proves nothing if the new assertions are loose (e.g. only checking `false` is falsy) — grep the test file for a snapshot/deep-equal call on `past`/`future` around the throwing-inverse case before accepting the green run as sufficient. |
| P4-3 | **POST-P4 caller sweep.** Run `grep -rn "\.undo()\|\.redo()" frontend/src/renderer`. | Every hit either ignores the return value entirely (safe, no change needed) or is `HistoryPanel.tsx`'s `handleJump` (P5's job to consume the new boolean) — zero call sites break from the `void → boolean` widening. Paste the full grep output (this is the packet's own required PR evidence). | Assuming a `void→boolean` return-type widening is "always safe in TS" without running the actual grep would miss a caller written defensively in a way an unexpected boolean silently changes behavior for. |
| P4-4 | **POST-P4 transaction contract.** Run `cd frontend && npx vitest run src/__tests__/stores/undo.test.ts -t commitTransaction`. | The composite entry's `childDescriptions` array equals the buffered entries' `description` strings IN ORDER — exact array equality, not just length or set equality. Paste the assertion output. | Checking only `childDescriptions.length === N` without checking order/content would pass a bug where descriptions are shuffled or duplicated by an off-by-one in `commitTransaction`'s push order. |
| P4-5 | **No cross-change collision (correction, OD-4).** Read `../wave0-prerouted-presets/packets.md`'s PK.0a section (or run `grep -n "Files:" -A1 ../wave0-prerouted-presets/packets.md` near PK.0a) to confirm its file list. | Confirms Wave-0 Packet 0a's files are `frontend/src/__tests__/stores/ledger-lint.test.ts` (new) and `frontend/src/renderer/stores/project.ts` (descriptions only) — `undo.ts` is NOT in that list, and `undo.ts` itself has no `undoable()` call sites (it only defines `undoable()`) for Packet 0a's lint to touch. No rebase/sequence-check is needed before P4 merges. Paste the confirming file-list excerpt. | Assuming a merge-collision risk from a phantom cross-change dependency (as an earlier draft of this doc claimed) would waste a rebase/sequence-check cycle on a collision that cannot occur — this row exists to catch that stale assumption resurfacing. |

## P5 — HistoryPanel row upgrades (icons, expand, footer, jump-progress)

*Depends on P4 (hard dependency) — do not run these rows until P4 has merged; kill+relaunch the
dev app first (P4/P5 change the `UndoEntry` shape and `undo`/`redo`'s return type — HMR will not
rehydrate this correctly).*

| # | Check (Setup + Drive) | Oracle (falsifiable evidence) | Trap |
|---|---|---|---|
| P5-1 | **EXPECTED-ABSENT pre-P5.** Throwaway project, one undoable action performed. Drive: open History panel. | Pre-ship baseline: rows are bare `<button>` elements showing only the description text — no leading icon glyph, no chevron, no footer line, no hover-timestamp tooltip (screenshot). | Skipping this baseline means a later "icons render" claim can't be distinguished from something that was already there for an unrelated reason — always establish pre-ship absence first. |
| P5-2 | Post-ship. Throwaway project. Perform 5 distinct actions whose History descriptions match the Ledger vocabulary verbatim: (1) a routing edit → "Route A2 → B1 (mask)"-style description, (2) a freeze action → "Freeze `<id>`", (3) a paint/gesture action → "Paint stroke (...)", (4) a transform drag (move/scale a clip), (5) a generic edit not matching any keyword (e.g. rename). Precheck: confirm each action actually added a NEW row to History (nonzero-entries check) before judging its icon. | Each of the 5 rows shows the icon matching `classifyOpForIcon`'s table verbatim: routing → ⧉, freeze → ❄, paint → ✦, transform → ⌗, default/edit → ✎. Screenshot all 5 rows in one panel view, zoomed enough to distinguish the glyphs, labeled against expected class. | Testing only ONE action type (e.g. a generic edit, which hits the default ✎ regardless of classifier correctness) would rubber-stamp a classifier that always falls through to default — must exercise one example per Ledger keyword bucket to prove the keyword matching itself works. |
| P5-3 | Post-ship. Throwaway project. Trigger a transaction (a gesture that internally calls `commitTransaction` with 3+ buffered mutations, e.g. a multi-mutation drag/gesture-recording). Open History; locate the resulting ONE row and its expand chevron (▸). | Clicking ▸ expands to show all 3+ child descriptions in a nested read-only list (chevron flips to ▾) WITHOUT changing `past`/`future` (confirm entry count identical before/after — screenshot both). Then click the ROW ITSELF (not the chevron): the jump target is the WHOLE transaction (undoing from there reverts all buffered mutations atomically in one jump, not partway in). | Skipping the store-state-unchanged check could miss the chevron's click handler accidentally also firing the row's jump handler (event bubbling); skipping the "click the row after expanding" step could miss expansion accidentally making children independently jumpable — explicitly forbidden by the packet. |
| P5-4 | Post-ship. Perform a known, manually-tallied number of actions (e.g. exactly 8). Open History and read the footer line. | Footer reads EXACTLY `8 of 500 steps` (or `N of 500 steps` matching your manual tally) — not `8 of 1000` (the combined-cap mistake) and not missing the word "steps". Screenshot the footer. | Not independently tallying your own actions and eyeballing "a number is there" would miss an off-by-one (e.g. counting `future.length` too, or double-counting the current index). |
| P5-5 | Post-ship. Hover the mouse over any History row without clicking; hold for the native tooltip delay. | A native title-attribute tooltip appears showing a human-readable date/time (`toLocaleString()` format, e.g. "7/4/2026, 3:42:10 PM") roughly matching when that action actually ran (screenshot the tooltip). | Confirming a tooltip appears at all, without checking its CONTENT is a real per-row timestamp (not "undefined", not raw epoch-ms, not the SAME frozen value shared across every row), would rubber-stamp a bug where `entry.timestamp` isn't read correctly per row. |
| P5-6 | Post-ship. Throwaway project. **Stateful/temporal — judge across the FULL multi-step sequence, never a single screenshot** (learning #44's principle applied to non-video state). First run the fixture test: `cd frontend && npx vitest run "src/__tests__/components/timeline/history-panel.test.ts" -t "failing inverse"` to confirm the store-level failing-inverse contract exists. Then, live: perform 3 actions (A, B, C in order), open History, click entry A's row to jump backward 2 steps. | Vitest: the fixture test passes, asserting the panel's active-index highlight stops at the last SUCCESSFUL step when a middle inverse throws, exactly ONE toast fires, and no exception propagates from the click handler. Live: the jump completes without a crash or frozen UI — screenshot mid-jump and post-jump; if a real failure was forced via the fixture, the highlight lands mid-sequence (not at target A, not silently at C) and toast COUNT (not just presence) is exactly 1 across the WHOLE jump, not one-per-step. | Judging this from a single post-click screenshot would miss whether the highlight landed correctly mid-sequence vs. at the wrong end, and would miss a per-step-spam toast bug (count, not presence, is the actual claim). |
| P5-7 | Post-ship. Inspect the 4 new CSS classes (`.history-panel__footer`, `.history-panel__entry-icon`, `.history-panel__entry-toggle`, `.history-panel__entry-children`). Run `grep -n "#[0-9a-fA-F]\{3,6\}" frontend/src/renderer/styles/floating-panel.css`. | Zero raw hex values introduced by these 4 classes — only `var(--cx-*)` token references (paste the grep output; it should show no matches inside these class blocks, or list only pre-existing unrelated hex if any). | Visually confirming the new UI "looks styled" without grepping for raw hex would miss a hex-ratchet-rule violation invisible to the eye (a raw hex that happens to render close to a design token's color). |

## P6 — Memory smoke perf tier (OD-2, shell-command oracle rows)

*Opt-in, never gates CI — rows are shell commands, not a live CU drive.*

| # | Check (shell command) | Oracle (expected output) | Trap |
|---|---|---|---|
| P6-1 | Post-ship. Run `cd frontend && npx vitest run --reporter=verbose` (no `RUN_PERF` set). | The output includes `history-memory-smoke.test.ts`'s test explicitly reported as **SKIPPED** (grep the verbose output for the test name + "skipped"), not merely absent from the collected file list. Paste the matching line(s). | Checking only that the DEFAULT run exits 0 (green) without confirming the perf test is explicitly skipped (vs. silently absent because the file failed to load) would miss a broken guard where vitest quietly drops the whole file — "never gates CI" must mean explicitly skipped, not accidentally invisible. |
| P6-2 | Post-ship. Run `cd frontend && RUN_PERF=1 node --expose-gc ./node_modules/.bin/vitest run src/__tests__/perf/history-memory-smoke.test.ts`. | Exits 0 and prints a measured heap delta in MB to console — paste the exact printed number, and quote the hardcoded MB budget from the test file's source alongside it. | Checking only exit code 0 without reading and quoting the printed MB number would miss a test that trivially passes because its threshold was set absurdly high (e.g. 5000MB) — the number itself is the real signal per OD-2 ("no baseline exists yet"). |
| P6-3 | Post-ship. Run `cat frontend/package.json \| grep -A1 '"test:perf"'`, then run `cd frontend && npm run test:perf`. | The script line matches `RUN_PERF=1 node --expose-gc ./node_modules/.bin/vitest run src/__tests__/perf` verbatim (paste it), AND `npm run test:perf` produces the same delta + exit-0 result as P6-2's manual command. | Confirming only the manual long-form command works (P6-2) but never running the documented `npm run test:perf` shortcut would miss a typo/wiring bug in the package.json script entry that only affects the user-facing command. |

---

## Definition of done

**Journey — "check my work, then trust it survives a relaunch."** A user has been iterating on a
scene for a while and wants to review and recover from their edit history.

1. Throwaway project. Perform a mixed sequence: a routing edit, a freeze, a multi-mutation gesture
   (creates a transaction), and a plain clip move — at least 4 distinct history entries, one of
   them a transaction with 2+ buffered children.
2. Select **Edit → Undo History**. History panel opens flush-left, titled "Undo History" (the menu
   is the only open mechanism this change ships — T1 Verdicts override, menu-entry-only; a working
   Cmd+Y here is a FAIL, see P1-1). Each row shows the
   correct op-class icon (⧉ / ❄ / ⌗ / ✎) per the Ledger vocabulary; the transaction row shows a ▸
   chevron.
3. Hover a row → a timestamp tooltip appears. Click the transaction row's ▸ → its buffered child
   descriptions expand, `past`/`future` unchanged. Read the footer → `N of 500 steps` matches a
   manual tally.
4. Click the transaction row itself → the jump reverts the WHOLE transaction atomically, not one
   child at a time.
5. Close the panel via its × button. Look at the statusbar — the breadcrumb chip now shows the
   description of whatever the current top-of-stack entry is post-jump. Click the breadcrumb →
   panel reopens (open-only, does not toggle closed on a second click).
6. Fully quit the app (Cmd+Q) and relaunch, reopening the same project. **Without reopening it via
   Edit → Undo History**, the panel is already open (persisted from step 5's reopen) — screenshot
   immediately on load.
7. Force a failing-inverse multi-step jump (via the fixture or a contrived scenario) — the panel
   stops the highlight at the last good step, fires exactly one toast, and the app does not crash.

**Oracle:** every step above produces the exact screenshot/log evidence named in its corresponding
P1–P5 row above; no step requires undocumented knowledge or a workaround. **Trap this journey
catches:** a build where each packet passes its OWN isolated row but the packets don't compose —
e.g. P3's persistence surviving a relaunch, then P5's transaction-jump-target-unchanged rule, then
P2's breadcrumb reflecting the POST-jump state (not the pre-jump state) — chained through one
continuous session, the way a real user would actually hit them back-to-back, not one packet at a
time in isolation.
