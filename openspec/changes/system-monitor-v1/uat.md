# UAT — system-monitor-v1 (PRE-BUILD)

**Companion to** `docs/UAT-PLAN-2026-07-02-live-cu.md` (runtime protocol applies verbatim: canonical
checkout launch — `cd ~/Development/entropic-v2challenger/frontend && npm start`, confirm the
live-runtime path before any verdict, kill+relaunch after any store-shape change, HMR never
trusted) **and** `docs/UAT-CU-ADDENDUM-2026-07-03.md` (row style + Trap-column discipline this doc
follows).

**Status of the underlying change:** PLANNING → packetized (`packets.md`, PK.1–PK.6). Nothing in
this change is merged yet. Run this doc incrementally as each packet ships — do NOT wait for all
six; every NEW-UI/NEW-command row below is explicitly marked **EXPECTED-ABSENT** until its owning
packet lands, and a flip from fail→pass on that exact row is this doc's build-completion signal
for that packet. Re-run PK.1's rows any time PK.5 is about to start (PK.5 depends on PK.1 + PK.4).

**Hard rules inherited (verbatim):**
- Temporal/stateful effects (slow-frame logging, live meter movement, LFO/leak behavior) → verdict
  only during multi-frame Play; a single paused frame proves nothing (learning #44).
- Alpha/matte claims → N/A to this change (no alpha surface touched); not invoked below.
- Destructive/mutating steps (freeze/unfreeze, project-corrupting hand-edits) → throwaway project
  only, never a real user project.
- Effect-amount-nonzero precheck: before judging any "Monitor row broken" / "meter reads 0%"
  verdict, confirm in the Inspector that the effect chain under test actually has nonzero cost
  (e.g. the effect's own param panel shows a non-default, non-trivial value) — a genuinely idle
  chain producing near-0% is not a bug.
- Every new-UI or new-IPC-command row is marked **EXPECTED-ABSENT until PK.n ships** and doubles as
  that packet's build-completion detector — a rubber-stamped PASS on an absent feature is itself a
  finding.

**Packet→section map:** PK.1 backend (shell oracle), PK.2 backend (shell oracle), PK.3 frontend
statusbar meters, PK.4 frontend History Ledger for freeze/unfreeze, PK.5 frontend System Monitor
panel (docked), PK.6 Electron System Monitor OS window. Row IDs are `SM-<PK#>-<n>`.

---

## PK.1 — Backend: per-instance timing scope + `get_perf_stats` IPC command (backend-only, shell oracle)

**EXPECTED-ABSENT until PK.1 ships** — before merge, `get_perf_stats` does not exist as an IPC
command; every row in this section must FAIL on the pre-change tree (that failure is the
anti-dead-flag proof named in `packets.md` PK.1's Hard oracle).

| # | Check (Setup + Drive) | Oracle (falsifiable) | Trap (rubber-stamp this row catches) |
|---|---|---|---|
| SM-1-1 | Setup: throwaway project, two video tracks, each with one clip, each clip running the SAME effect TYPE (`fx.datamosh`) in its device chain with a visibly nonzero param (mosh intensity > 50%). Drive (shell): with the app running, send a raw `get_perf_stats` command over the zmq relay (e.g. `python -c` against the dev sidecar socket, or via DevTools console `window.entropic.sendCommand({cmd:'get_perf_stats'})` if PK.3/PK.5 haven't wired a UI yet) and print the `effects[]` array. | `effects[]` contains 2 distinct entries for the two `fx.datamosh` instances (a `track`/`scope`-bearing key distinguishes them), not 1 merged entry. Paste the raw JSON array length and both entries' scope fields into the run log. | Sending the command once, seeing SOME array back, and calling it done without counting entries — the exact bug this packet exists to fix is a silent collapse to 1 row; the row must assert `len(effects) == 2`, not just "response is non-empty." |
| SM-1-2 | Setup: same throwaway project, but revert to a single-clip preview (no composite render, no second track). Drive (shell): call `get_perf_stats` and separately capture the pre-change tree's raw `_effect_timing` dict keys (or the closest today-equivalent, `effect_stats`) for the same single-clip case. | The single-clip-preview key shape is byte-identical to what `effect_stats`/`get_effect_stats()` returned before this packet (regression guard) — diff the two key sets and confirm zero drift. Also confirm `backend/tests/test_effect_harness.py` still passes: `cd backend && python -m pytest backend/tests/test_effect_harness.py -q`. | Verifying only the NEW two-instance case (SM-1-1) and skipping the old single-clip path — a scope kwarg with the wrong default silently breaks every existing single-track project's timing keys, which would only show up here. |
| SM-1-3 | Drive (shell): with the project at 24fps, call `get_perf_stats` and read `frame.budget_ms`; then change project fps via the transport's BPM/fps control (or `clock_set_fps` directly) to 30fps and call `get_perf_stats` again. | `budget_ms` differs between the two calls and equals `1000.0/fps` for each (e.g. ~41.7ms at 24fps vs ~33.3ms at 30fps) — not a hardcoded 33/33.3 literal in both cases. | Accepting `budget_ms≈33` at any fps as "looks about right" — the whole point of this oracle is that a hardcoded constant would pass a 30fps project and silently lie at every other fps; must test two different fps values and see two different numbers. |
| SM-1-4 | Drive (shell): `cd frontend && npx --no vitest run -- relay-allowlist`. | Test green; `get_perf_stats` appears in both directions of the contract test (renderer `ALLOWED_COMMANDS` AND backend-handler command table). | Trusting that adding the command to only one side "probably also updates the other" — this is the exact bidirectional gap the contract test exists to catch; must see the actual test name pass, not infer from the command working once in a manual call. |

---

## PK.2 — Backend: performance logging (backend-only, shell oracle)

**EXPECTED-ABSENT until PK.2 ships** (depends on PK.1 landing first — both edit `pipeline.py`).

| # | Check (Setup + Drive) | Oracle (falsifiable) | Trap |
|---|---|---|---|
| SM-2-1 | Setup: throwaway project with an effect chain heavy enough to blow the frame budget (stack several expensive effects, e.g. multiple `reaction_mosh`/`spectral_*` instances) at a low fps so budget is easy to exceed. Drive: press Play and let it run over-budget for several consecutive seconds; tail the backend log during playback. | `tail -f ~/.creatrix/logs/sidecar.log` (or wherever the sidecar logs) shows exactly 1 `slow_frame` JSON log line per rolling 1-second window, not one per over-budget frame (e.g. 3s of continuous over-budget playback → ≤3 lines, never dozens). Count the lines across the full Play window and report the count against elapsed seconds. | Glancing at the log and seeing "some slow_frame lines exist" without counting — an unrate-limited implementation also produces slow_frame lines, just N-per-second instead of 1; only a literal line-count-vs-elapsed-seconds check catches the missing rate limit. |
| SM-2-2 | Setup: same heavy-load throwaway project, playing for several seconds (so the frame-timing ring buffer has data). Drive: force a crash (e.g. a known crash-inducing malformed project edit, or `kill -SEGV` the sidecar PID if a safer trigger isn't available) and inspect the resulting crash report. | Crash report JSON (`~/.creatrix/logs/` or wherever `diagnostics.py` writes it) contains a `last_frames` array with ≤30 entries populated from the ring buffer. Repeat with a crash forced immediately after launch (empty ring buffer) — `last_frames` is present but empty/omitted, no secondary crash from handling the empty case. | Testing only the "ring buffer has data" case and never the empty-buffer case — a naive implementation that indexes into an empty ring buffer without a guard would itself crash inside the crash handler, which only the empty-buffer repro exposes. |
| SM-2-3 | Drive: play a project for 10+ seconds, then use File > Close Project (or open a different project, triggering `flush_timing()`'s call site) rather than quitting the whole app. Separately, quit the app entirely via Cmd+Q without closing the project first. | A session-perf-summary log line appears in the sidecar log immediately around the project-unload event (Close/switch project); the same log line does NOT reliably appear around a raw Cmd+Q app-quit (per this packet's explicit non-scope: process-exit has no confirmed clean-exit hook, so it is out of scope — do not fail this row if Cmd+Q produces no summary, only if project-unload doesn't). | Failing this row because Cmd+Q didn't log a summary — that path is explicitly non-scope per `packets.md` PK.2 ("scope this packet to the project-unload event only"); the row must test the RIGHT event (project unload/flush_timing) and only judge that one. |
| SM-2-4 | Drive (shell): `cd backend && python -m pytest -x -n auto --tb=short`. | Full backend suite green, including new `test_slow_frame_log.py` and `test_crash_last_frames.py`. | Running only the two new test files in isolation and skipping the full-tier run — PK.2 single-flights with PK.1 on `pipeline.py`; a full-tier run is the only way to catch an interaction regression between the two packets' edits to the same file. |

---

## PK.3 — Frontend: statusbar Ableton-clone meters (decision 26)

**EXPECTED-ABSENT until PK.3 ships** — today `MemoryStatus.tsx` renders `null` whenever
`level === 'ok'` and there is no CPU meter at all in the statusbar; every row below must show that
absence pre-build and the always-visible cluster post-build.

| # | Check (Setup + Drive, literal UI labels) | Oracle (falsifiable) | Trap |
|---|---|---|---|
| SM-3-1 | Setup: launch app fresh, New Project, do nothing else (idle, no load, memory pressure at `'ok'`). Drive: look at the statusbar (bottom bar, right of the existing `Engine: Connected · Uptime Ns` chip). | **EXPECTED-ABSENT pre-PK.3:** no CPU meter exists anywhere in the statusbar. **Post-PK.3:** a CPU meter is visible immediately at idle with the percentage number rendered ON the bar itself (screenshot, zoom to confirm the digits sit inside/over the bar fill, not beside it as a separate label) — matches the Ableton Live CPU-box pattern named in the plan. | Screenshotting the statusbar once, seeing a percentage SOMEWHERE nearby, and calling it "on the bar" without zooming in — the spec is specifically that the number is rendered on top of the bar element, not adjacent to it; a sibling `<span>` next to the bar would look similar at a glance but fails the literal claim. |
| SM-3-2 | Same idle project as SM-3-1 (memory pressure at `'ok'`, no memory warning state). Drive: look for the RAM meter next to the CPU meter. | **EXPECTED-ABSENT pre-PK.3:** at `level === 'ok'` today's `MemoryStatus.tsx` returns `null` — no RAM indicator renders at all. **Post-PK.3:** the RAM meter is visible even at `level === 'ok'` (screenshot) — this is the specific regression-guard the packet's hard oracle names. | Testing only under memory pressure (where the OLD conditional badge would already show something) and never testing the idle/`'ok'` case — the entire point of this packet is the always-visible upgrade; skipping the idle check would rubber-stamp the pre-change conditional behavior as if it were the new one. |
| SM-3-3 | Drive: click the CPU meter, then (separately) click the RAM meter. | Each click calls the Monitor-open handler with the correct tab argument (`'cpu'` for the CPU meter, `'memory'` for the RAM meter) — **if PK.5 has not shipped yet**, verify this at the mock-IPC/DevTools level (the handler fires, even if no panel exists to receive it) and mark the full open-panel behavior EXPECTED-ABSENT until PK.5 ships; **if PK.5 has shipped**, verify the System Monitor actually opens on the matching tab (screenshot). | Clicking a meter, seeing nothing happen (because PK.5 isn't built yet), and reporting "click handler broken" — that is expected sequencing, not a bug, until PK.5 lands; conversely, once PK.5 IS live, accepting "the Monitor opened" without checking it opened on the CORRECT tab (cpu vs memory) would miss a wrong-argument wiring bug. |

---

## PK.4 — Frontend: History Ledger for freeze/unfreeze (OD-4)

No new UI surface — this packet wraps an EXISTING command (`freezePrefix`/`unfreezePrefix`,
reached via the device-chain effect's right-click context menu, literal labels **"Freeze up to
here (N effects)"** and **"Unfreeze"** per `default-shortcuts.ts`/menu convention) in `undoable()`.
**EXPECTED-ABSENT until PK.4 ships:** today, freezing/unfreezing produces ZERO History Ledger
entries — every row below must show that absence pre-build. All steps run on a **throwaway
project** (freeze mutates the effect chain).

| # | Check (Setup + Drive, literal UI labels) | Oracle (falsifiable) | Trap |
|---|---|---|---|
| SM-4-1 | Setup: throwaway project, add a clip to a track, add 2+ effects to its device chain (any effect type). Drive: right-click the first effect card, click **"Freeze up to here (N effects)"**. Then open the Undo History panel. | **EXPECTED-ABSENT pre-PK.4:** the Undo History panel shows NO new entry after freeze (today's reality — `freezePrefix` is called directly with zero `undoable()` wrapping). **Post-PK.4:** exactly ONE new entry appears, reading a non-generic description matching the pattern `"Freeze <trackLabel> up to <cutIndex>"` — screenshot the Ledger row's literal text, not just "an entry appeared." | Accepting a bare `"Freeze"` label (or any entry at all) as passing — the packet's own Ledger-lint convention requires a NON-GENERIC description naming the track and cut point; a generic label technically satisfies "an entry exists" but fails the actual claim. |
| SM-4-2 | Continuing from SM-4-1 (post-freeze state, entry present). Drive: press Cmd+Z once. | The freeze reverts in exactly ONE undo step (device chain returns to unfrozen, the frozen effect card's ❄ indicator disappears) — screenshot before/after the single Cmd+Z. | Needing two or more Cmd+Z presses to fully revert (indicating the wrap didn't capture the whole operation atomically) and not noticing because "eventually it went back to normal" — must count exactly one keypress to full revert. |
| SM-4-3 | Continuing from SM-4-1/2 (re-freeze if needed), right-click the frozen effect card, click **"Unfreeze"**. | A SEPARATE Ledger entry appears for the unfreeze action, non-generic (e.g. `"Unfreeze <trackLabel>"`), distinct from the freeze entry's text — screenshot the Ledger showing both entries with different text. | Treating "Unfreeze" as merely undoing the freeze entry (i.e. expecting the Ledger to just remove the prior "Freeze…" row) — the spec requires unfreeze to be its OWN forward operation with its own entry, not a passthrough of freeze's undo; conflating the two would miss a missing forward-entry bug for the unfreeze path specifically. |
| SM-4-4 | Drive (shell): `cd frontend && npx --no vitest run` (full tier), specifically confirming the four existing freeze regression files stay green: `epic03-freeze-pertrack.test.ts`, `b10-performance-freeze-fsm.test.ts`, `stores/freeze.test.ts`, `components/freeze-ui.test.ts`. | All four pass unmodified in their BEHAVIOR assertions (only `stores/freeze.test.ts` gains a new Ledger-entry assertion, per PK.4's scope). | Running only the new Ledger assertion and skipping the four sibling regression files — this packet touches a live, tested async FSM (`freeze.ts`'s `idle/freezing/unfreezing/flattening` states); a wrapping bug that breaks the FSM guard would only show up in the existing suite, not in a narrowly-scoped new test. |

---

## PK.5 — Frontend: System Monitor panel, docked (RISK: HIGH — depends on PK.1 + PK.4)

**EXPECTED-ABSENT until PK.5 ships:** today there is no "System Monitor" entry in the View menu
and no docked panel of any kind. Do not attempt these rows before PK.1 and PK.4 are both merged
(PK.5 consumes both contracts) — a partial build against a stale contract will false-fail rows that
are actually PK.1/PK.4 problems, not PK.5's.

| # | Check (Setup + Drive, literal UI labels) | Oracle (falsifiable) | Trap |
|---|---|---|---|
| SM-5-1 | Drive: open the **View** menu. | **EXPECTED-ABSENT pre-PK.5:** no "System Monitor" item exists in View. **Post-PK.5:** a **"System Monitor"** item is present with NO accelerator/shortcut text shown next to it (per the T1-verdict override — menu-entry-only, no keybinding this packet) — screenshot the View menu open, zoom on the item to confirm no trailing keycap text. | Seeing "System Monitor" in the menu and moving on without checking for an accelerator — if a keybinding WAS silently added (contradicting the locked T1 override), it risks colliding with an existing binding the same way the original Cmd+Shift+A proposal did (OD-2); this row exists specifically to catch that regression. |
| SM-5-2 | Setup: throwaway project, two video tracks, each running the SAME effect TYPE (`fx.datamosh`, nonzero param) — same fixture as SM-1-1. Drive: click **"System Monitor"** from the View menu; wait for one 2 Hz poll cycle (~0.5s) and observe the docked panel (should appear right of the inspector per OD-3). | Panel renders a table with columns name · track · ms/frame (p50) · % of budget · latency (frames) · state, and shows **2 distinct rows** for the two `fx.datamosh` instances (not 1 merged row) — screenshot the table, count rows, confirm each names a different track. Precheck effect-amount-nonzero (Inspector shows the mosh param at a real, non-default value) before judging any row's numbers. | Opening the panel, seeing "a table with data," and not counting rows — this is PK.1's anti-collapse bug now surfaced at the UI layer; a passing panel with only 1 merged row for 2 distinct instances is the exact regression this row must catch, and it's easy to miss without counting. |
| SM-5-3 | Continuing from SM-5-2. Drive: click the "% of budget" column header (if not already the default sort). | Table sorts with the highest "% of budget" row on top by default — confirm this IS the default (reload/reopen the panel fresh and confirm it still opens sorted this way without re-clicking). | Clicking the column header once, seeing it sort, and assuming that proves "default sort" — must verify the sort order holds on a FRESH open of the panel (close and reopen, or reload) without any manual click, since the claim is specifically about the default, not merely that sorting works when triggered. |
| SM-5-4 | Continuing from SM-5-2/3, on the top (offending) row. Drive: click that row's freeze button. Then open the Undo History panel. | Row shows a ❄ frozen-state icon; Undo History gains exactly one new entry with a non-generic "Freeze <track> up to <cut>" description (reusing PK.4's wrapper — this proves PK.5 dispatches THROUGH PK.4, not around it). Press Cmd+Z: the row un-freezes and the Ledger entry state reverts, in one step. | Clicking the freeze button, seeing the ❄ icon appear, and stopping there — a button that flips the icon via local UI state WITHOUT dispatching the real undoable command would look identical in a single screenshot; only checking the Ledger for a genuinely new, correctly-worded entry (not a bare "Freeze") distinguishes a real dispatch from a cosmetic-only toggle. |
| SM-5-5 | Drive: drag the docked panel's resize handle to a new width; reload the app (kill + relaunch, per HMR-untrusted rule since this is a new persisted layout slot). | The panel reopens at the SAME width chosen before reload (localStorage round-trip via the new `monitorPanelW` slot, same persistence pattern as `inspectorH`) — screenshot width before/after in pixels or via the persisted value. | Resizing and reloading without actually MEASURING the width (eyeballing "looks about the same") — a subtly-wrong persistence key (e.g. writing to a key the reader doesn't read) can produce a visually-similar-but-actually-default width that a casual glance would miss. |
| SM-5-6 | Drive: with the Monitor panel open and polling, kill the sidecar's Python process (find its PID via the process tree, per the runtime protocol's D3 guidance — never `pkill` by name). Wait a few seconds, observe the panel. Then restart the sidecar (or relaunch the app) and observe again. | While disconnected: panel shows a "reconnecting…" state, NOT the last-known numbers frozen on screen (screenshot during the disconnected window — the numbers must not silently continue looking "live"). After reconnect: panel resumes real polling and numbers update again (screenshot showing changed values across 2+ poll cycles, confirming genuinely live, not just "no longer says reconnecting"). | Killing the sidecar, seeing the numbers stop changing, and accepting that as "reconnecting works" without checking for the EXPLICIT reconnecting affordance — frozen-but-not-updating numbers with no "reconnecting…" label is the exact stale-data bug this row guards against (per plan.md's "never shows stale numbers" requirement); must confirm the affordance text/state is present, not just that updates paused. |
| SM-5-7 | Setup: same 2-track datamosh throwaway project. Drive: open Export dialog and start an export (File > Export) while the Monitor panel is open and visible, watching the panel during the export run. | During export, the frame-budget bar in the Monitor is REPLACED by a realtime-factor readout (a different metric, not the same bar now showing export-time numbers) — screenshot the panel mid-export showing the readout, and again after export completes showing the frame-budget bar has returned. | Watching the panel during export, seeing SOME numbers change, and assuming that satisfies "export-mode readout" — the claim is specifically that a DIFFERENT UI element (realtime-factor, not frame-budget-vs-elapsed) appears; a frame-budget bar that merely displays different numbers during export (because frames genuinely take longer) would look superficially similar but is not the branch this row is checking for. |

---

## PK.6 — Electron: System Monitor as a TRUE OS window (decision 28, depends on PK.5)

**EXPECTED-ABSENT until PK.6 ships** (or **SUPERSEDED** — before testing, check whether
`multiwindow-stage-a`'s `WindowManager` + `preload/monitor.ts` + `monitor.html` already exist in
the tree; if so, per `packets.md`'s explicit note, PK.6 is superseded and the correct surface to
test is `PK.5`'s panel mounted into `monitor-entry.tsx`, not a second hand-rolled window — re-scope
these rows to that swap before running them, don't blindly hunt for `system-monitor-window.ts`).

| # | Check (Setup + Drive, literal UI labels) | Oracle (falsifiable) | Trap |
|---|---|---|---|
| SM-6-1 | Setup: same 2-track datamosh throwaway project. Drive: View menu ▸ **"System Monitor"** (post-PK.6, this should open as a real OS window rather than only docking — check whichever entry point the shipped UI exposes, e.g. a toggle or a second menu item). | A genuinely SEPARATE `BrowserWindow` opens (not just a docked panel) — confirm via the OS window list / Mission Control / dragging it to a second display if available, or via `Cmd+~`/window-cycling showing 2 distinct Creatrix windows. Screenshot both windows visible simultaneously. | Opening "the Monitor" and seeing a panel, without confirming it's a SEPARATE OS-level window rather than the SAME docked panel PK.5 already built — visually a docked panel and an undecorated frameless window can look similar in a single screenshot; must show two independently-movable window frames. |
| SM-6-2 | Continuing from SM-6-1, with data populating in both the main window's docked panel (if still open) and the new OS window. | Live data in the OS window matches the docked panel at the same instant (same effect rows, same numbers within one poll cycle) — screenshot both side by side. | Assuming "it opened, therefore it's live" without a side-by-side numeric comparison — a window that opens with a frozen/stubbed snapshot (e.g. accidentally reusing the read-only pop-out preload precedent, RT-1) would look plausible at a glance but never update; must confirm at least 2 poll cycles of real change in the OS window specifically. |
| SM-6-3 | Continuing from SM-6-1/2. Drive: in the OS window, click a row's freeze button (same 2-track datamosh fixture). | The freeze actually round-trips (Ledger gains an entry, row shows ❄) FROM WITHIN the OS window — this is the row that would FAIL if PK.6 mistakenly reused the pop-out's read-only preload (`preload/pop-out.ts`, RT-1 forbids `ipcRenderer.invoke`) instead of the full `preload/index.ts`. | Only testing that the OS window DISPLAYS data (read path) and never testing an action that requires `sendCommand`/`invoke` FROM that window (write path) — RT-1's exact failure mode is a window that can receive pushed/polled data but silently no-ops or errors on any invoke-based action; freeze is the write action that must be tested here, not just polling. |
| SM-6-4 | Drive: close the OS Monitor window (its own close button/red traffic light, not Cmd+Q). | The main Creatrix window is completely unaffected — timeline still responsive, no crash, no dialog. Reopen the Monitor via the View menu again and confirm it opens fresh and resumes polling. | Closing the window and only checking "no crash dialog appeared" — must ALSO actively interact with the main window afterward (click a track, scrub the timeline) to confirm it's genuinely still responsive, not just visually present but hung. |
| SM-6-5 | Drive (shell): `cd frontend && npx playwright test` (the `_electron` E2E spec for this window). | Test passes: asserts a second `BrowserWindow` exists after the menu action, a `get_perf_stats` round-trip succeeds from within it, and closing it doesn't crash the main window. | Treating a green Vitest/component-test run as sufficient and skipping the Playwright E2E — per Gate 5's test-layer justification, OS-window/process-lifecycle behavior (second window existing, surviving close) is NOT reproducible in a component test; only the real Electron E2E run is a valid oracle for this packet's actual risk. |

---

## Definition of done — end-to-end journey

**Setup:** throwaway project. Two video tracks, each with one clip, each running `fx.datamosh`
(nonzero intensity) in its device chain — the fixture that exercises PK.1's anti-collapse fix at
every layer above it.

1. Launch the app fresh (canonical checkout, `npm start`) — confirm the live-runtime path matches
   the edited tree before proceeding.
2. At idle, statusbar CPU and RAM meters are BOTH visible immediately (no load, no memory
   pressure) — percentage rendered ON the CPU bar (PK.3).
3. Press Play; let both datamosh clips run for several seconds (multi-frame, not a single paused
   frame). Click the CPU meter → the System Monitor opens docked, on the CPU tab (PK.3 → PK.5).
4. The Monitor's table shows **2 distinct rows**, one per track's `fx.datamosh` instance — not
   merged into 1 — sorted with the higher "% of budget" row on top by default (PK.1's fix, verified
   live through PK.5's UI).
5. Click the top row's freeze button. The row shows ❄; Undo History gains a
   `"Freeze <track> up to <cut>"` entry (PK.4, dispatched through PK.5). Press Cmd+Z — reverts in
   one step, row un-freezes.
6. Resize the docked panel; kill + relaunch the app — the panel's width persisted (PK.5's
   `monitorPanelW` layout slot).
7. Open the Monitor as a separate OS window (PK.6). Confirm it is a genuinely separate,
   independently-movable `BrowserWindow` showing the same live 2-row table. From INSIDE that
   window, freeze the second row — Ledger gains a second entry, proving the OS window has real
   bidirectional IPC (not the pop-out's read-only preload). Close the OS window — main app
   unaffected, still responsive.
8. Kill the sidecar process — the Monitor (wherever open) shows "reconnecting…", never stale
   frozen numbers. Restart the sidecar — polling resumes, numbers change again across 2+ cycles.
9. Push the effect chain hard enough to blow frame budget for several consecutive seconds; tail
   `~/.creatrix/logs/sidecar.log` — exactly one rate-limited `slow_frame` line per second, never a
   flood (PK.2).
10. Start an export of the project — the Monitor's frame-budget bar is replaced by a
    realtime-factor readout for the duration of the export, then reverts once export completes
    (PK.5's folded-in export-mode branch).
11. Close the project (project-unload, not Cmd+Q) — a session performance summary log line appears
    in the sidecar log (PK.2).

**Pass condition:** all 11 steps produce their named evidence (screenshots for UI states, log-tail
output for backend claims, Ledger-entry text for undo claims) with no step requiring undocumented
knowledge or a workaround. A failure at any step names exactly which packet (PK.1–PK.6) is
responsible, since each step above is traceable to one packet's scope.
