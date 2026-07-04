# UAT — multiwindow-stage-a (PRE-BUILD)

**Companion to** `docs/UAT-PLAN-2026-07-02-live-cu.md` (runtime protocol applies verbatim: canonical
checkout launch (`cd frontend && npm start`), live-runtime path check before any verdict,
throwaway projects for anything destructive, screenshot-per-verdict, ✅❌🐛⏸ only, effect-amount-
nonzero precheck before any "render broken" claim) and `packets.md`/`plan.md` in this same
directory (the packet IDs, file lists, and hard oracles below are copied verbatim from there —
this doc does not re-derive wire shapes).

**Why this doc is PRE-BUILD:** none of PK.1–PK.4 exist yet. This script is written to be run
**repeatedly as each packet lands**, in the locked sequence PK.1 → PK.2 → PK.3 → PK.4
(`packets.md` "Sequencing" — strictly serial, no packet is parallel-dispatchable). Every row that
checks a piece of NEW UI is explicitly marked **EXPECTED-ABSENT** for the packets that haven't
shipped yet — running the row and finding the UI absent is not a failure, it is the correct
baseline, and the SAME row flipping to present/passing after its packet merges is this doc's
build-completion detector. Do not skip a row because "it's not built yet."

**Hard rules inherited (do not relax for this change):**
- Temporal/stateful effects → verdict only during multi-frame Play, never a single paused
  screenshot (learning #44). This change's one stateful surface is freeze/unfreeze — the frozen
  indicator and its reversal must each be confirmed across **multiple Play frames**, not one.
- Alpha/matte claims → N/A for this change (no pixel/alpha work — plan.md §4 confirms).
- Destructive steps → throwaway project. Freeze mutates track state (PK.2/PK.3) and
  `~/.creatrix/panel-windows.json` holds real persisted layout state (PK.3 relaunch tests) — both
  get a throwaway project / copy-aside backup per row below, mirroring the house C7 convention.
- Effect-amount-nonzero-equivalent precheck before any "broken" verdict: confirm the target track
  has no pre-existing freeze badge before clicking Freeze; confirm the docked panel is genuinely
  absent (not just visually similar to background) before calling a mount "missing."
- Every new-UI row states EXPECTED-ABSENT-until-<packet> explicitly.
- **Merge gate note (not this doc's job, but do not silently substitute for it):** every packet
  requires full backend pytest + full frontend vitest + `Skill(review)` before merge; PK.2
  additionally requires `Skill(qa-redteam)` (HIGH risk). This UAT doc verifies the shipped
  *behavior*; it does not replace those gates.

**Row format:** `| # | Check (Setup + Drive) | Oracle (falsifiable) | Trap (rubber-stamp caught) |`

---

## PK.1 — WindowManager + monitor window shell (OD-1, OD-4) — no user-facing UI yet

Per `packets.md` PK.1's own text: *"no menu entry exists yet (PK.3 adds the user-facing
trigger); this is plumbing verified by window-count E2E assertions, not a visual walkthrough."*
This section is **shell-command oracle rows**, not a CU click-path — there is nothing a human/CU
agent can reach through the running app's UI for this packet alone.

| # | Check (Setup + Drive) | Oracle (falsifiable) | Trap (rubber-stamp caught) |
|---|---|---|---|
| PK1-1 | Setup (shell): `cd frontend && npx --no vitest run src/__tests__/main/window-manager.test.ts`. EXPECTED-ABSENT pre-PK.1: this file does not exist on `origin/main` today — running it must fail with "no test found," which is the correct baseline (greenfield capability, zero prior hits per proposal.md). | Post-ship: all cases pass, 0 skipped — open (creates), open-again (focuses existing, `BrowserWindow` count stays 1), close (destroys + clears ref), reattach (closes OS window + fires **exactly one** `panel:mode` `{mode:'docked'}` send), clamp-to-display with a synthetic fully-offscreen saved rect falls back to centered default. CSP header string is byte-equal to `pop-out-window.ts`'s dev/prod branches (direct string-equality assertion in the test output, not eyeballed). | Accepting "tests pass" without reading which assertions ran — a version that fires `panel:mode` twice per reattach, or a CSP that's "close enough" (not byte-equal), would still show green under a loose test; the count and the byte-equality are the two easy things to skim past. |
| PK1-2 | Setup (shell): `cd frontend && npx --no vitest run src/__tests__/main/window-bounds.test.ts`. EXPECTED-ABSENT pre-PK.1 (new extracted util, no prior file). | Passes for all three call-site minimums: 400×300 (main), 200×150 (pop-out), and the monitor's own minimum — identical accept/reject verdicts to the two inline validators it replaces, proving the extraction is behavior-preserving. | Running only the NEW test file and calling the refactor "done" without also re-running the two pre-existing files it touched (`index.ts`, `pop-out-window.ts`) — see PK1-3. |
| PK1-3 | Setup (shell): `cd frontend && npx --no vitest run` (full suite, no filter). | Green — this is the anti-dead-flag check for a refactor-only edit: `index.ts`'s and `pop-out-window.ts`'s **existing, unmodified test files** must still pass unchanged after being pointed at the extracted `window-bounds.ts` util. | Treating "the new files pass" as sufficient proof the refactor is safe — a refactor bug shows up in the OLD test files failing, which only the full-suite run surfaces. |
| PK1-4 | Setup (shell): `cd frontend && npx playwright test tests/e2e/multiwindow/window-lifecycle.spec.ts`. EXPECTED-ABSENT pre-PK.1 (directory `frontend/tests/e2e/multiwindow/` does not exist today — `find frontend/tests/e2e -iname "*pop-out*"` in plan.md's own code-ground shows zero multi-window E2E precedent). | Asserts `electronApp.windows().length === 2` immediately after `openPanel('system-monitor')` is called (test-internal, not via UI), `=== 1` after `closePanel('system-monitor')`. | Confirming the spec FILE exists (a stub that always passes) without checking it actually drives `WindowManager`'s exported functions and asserts the real Electron window count — a spec that mocks `BrowserWindow` entirely would "pass" while proving nothing about real window lifecycle. |
| PK1-5 | Setup (shell): `cd frontend && npx playwright test tests/e2e/multiwindow/sidecar-restart-survival.spec.ts`. EXPECTED-ABSENT pre-PK.1. | Kill/restart the Python sidecar process from within the test harness; assert the monitor window survives (not destroyed/orphaned) and its next `getPerfStats()`/ping call succeeds post-restart. Scoped exactly as `plan.md:193-196` describes — not a full watchdog E2E rebuild. | Testing sidecar restart only against the MAIN window (which already has watchdog coverage) and assuming the monitor window "probably" survives too — the monitor is a second, independent `BrowserWindow`; it must be asserted directly. |
| PK1-6 | Setup (shell): `cd frontend && npx --no vitest run src/__tests__/main/zmq-relay-fifo.test.ts`. EXPECTED-ABSENT pre-PK.1. | Fires two `sendZmqCommand`-equivalent calls concurrently (mocked `zeromq.Request` whose `send`/`receive` resolve on separate microtask ticks) and asserts the second call's `send()` is not invoked until the first call's `receive()` resolves — proves FIFO ordering, not just eventual completion (OD-4's mechanical proof). **If** the packet's STOP semantics fired (a live spike showed `zeromq.Request` already serializes internally), the test instead asserts the wrapper is a documented no-op passthrough with a code comment citing the spike evidence — check which of the two outcomes shipped, both are valid, a silent third option (neither tested nor commented) is not. | Accepting "the socket didn't crash" as proof of FIFO ordering — a race that merely doesn't crash but interleaves `send`/`receive` pairs would still "work" most of the time; only the explicit ordering assertion (not eventual-completion) catches it. |
| PK1-7 | Setup (shell): `grep -rn "new BrowserWindow" frontend/src/main` (repeat plan.md's own code-ground check post-merge). | Exactly 3 hits now: `index.ts` (main), `pop-out-window.ts` (pop-out), `window-manager.ts` (monitor) — was 2 before this packet. | Assuming the monitor window is created via a different, undocumented path (e.g. reusing `pop-out-window.ts`'s constructor with a flag) — the grep count is the cheap, falsifiable proof a genuinely new window class was added, not a hidden variant of an existing one. |

---

## PK.2 — Command-forwarding contract + undo plumbing (OD-5) — **RISK: HIGH** — no UI trigger yet

The Freeze button PK.2 adds to `SystemMonitorStub.tsx` is real, visible UI — but it lives inside
the monitor window, and the ONLY way to open that window from the app's own UI is
`window.entropic.windowManager.open(...)`, which PK.3 adds to the preload bridge. Until PK.3
ships, there is **no UI path** for a CU agent to reach this button (do not attempt to reach it via
DevTools console injection either — the exposed API does not exist yet). This section is
shell-command oracle rows; the CU-driven version of this same behavior is re-tested from the
reachable side in **PK3-4** once PK.3 lands.

| # | Check (Setup + Drive) | Oracle (falsifiable) | Trap (rubber-stamp caught) |
|---|---|---|---|
| PK2-1 | Setup (shell): confirm the fail-before state first — `grep -n "useUndoStore" frontend/src/renderer/stores/freeze.ts` must return **nothing** on pre-PK.2 `main` (plan.md's own code-ground: "no import of `useUndoStore`, no `undoable()` call anywhere in the file"). Then, on the PK.2 branch, run `cd frontend && npx --no vitest run src/__tests__/stores/freeze-undo.test.ts`. | Component/unit test: `entropicMonitor.dispatch('freeze', {trackId})` (mocked IPC round-trip) produces **exactly ONE** `useUndoStore` entry with description text `"Freeze <trackId>"` — capture the grep-empty output (fail-before) and the test-pass output (pass-after) as paired evidence, not the pass-after alone. | Rubber-stamping the pass-after run in isolation — an already-green test proves nothing about NEW capability if you never confirmed the pre-packet tree genuinely lacked the wiring; the paired before/after is what proves the delta is real. |
| PK2-2 | Setup (shell): `cd frontend && npx --no vitest run src/__tests__/main/panel-bridge.test.ts`. EXPECTED-ABSENT pre-PK.2. | Allowlist rejects unknown `panel`/`type` pairs with the same rejection shape as `zmq-relay.ts:267-271`; accepts the known `{panel:'system-monitor', type: 'freeze'|'unfreeze'|'undo'|'redo'}` set. | Testing only the accept path — a reject path with the WRONG shape (e.g. throws instead of returning a typed error) means the monitor's future error surface (once PK.3 renders it) shows a blank/garbled message instead of a real toast. |
| PK2-3 | Setup (shell): `grep -rn "ipcMain.handle('panel:dispatch'" frontend/src/main/`. | Exactly **one** hit, in the new `panel-bridge.ts`. | A stray second registration (e.g. a leftover draft handler in `index.ts`) would silently shadow or double-fire validation — this is the trust-boundary check `packets.md` calls out explicitly; a passing component test upstream of the handler cannot catch a duplicate registrant downstream of it. |
| PK2-4 | Setup (shell, THROWAWAY project referenced by the test fixture): `cd frontend && npx playwright test tests/e2e/multiwindow/undo-forwarding.spec.ts`. EXPECTED-ABSENT pre-PK.2. | A synthetic `panel:command('undo')` sent to the main renderer while the monitor window is focused reverses a prior freeze (main window's visible frozen-track indicator disappears — DOM assertion). A **real keyboard** Cmd+Z pressed inside the monitor window (not a synthetic IPC send) is asserted to affect the MAIN window's undo stack, not a local no-op in the monitor's own (nonexistent) store. Per the stateful-effect rule: the spec must assert the frozen indicator's presence/absence across **multiple rendered frames**, not a single tick after the event fires. | Asserting on the DOM state one tick after dispatch — a bake/unbake transition that "looks reversed" for one frame but reverts on the next real frame would pass a single-tick check and fail a real user watching playback; the spec must sample more than once. |
| PK2-5 | Setup (shell): `cd frontend && npx --no vitest run` (full suite). | Green — proves the EXISTING direct `sendCommand` freeze path used by timeline/toast freeze buttons is untouched (Non-scope in `packets.md`: "only the monitor's path routes through the new wrapper"). | Only running the new PK.2 test files and never re-running `freeze.ts`'s pre-existing tests — a single-writer refactor gone wrong could silently reroute the EXISTING UI's freeze buttons through the new `undoable()` wrapper too, doubling undo entries for ordinary in-app freezes. |
| PK2-6 | Setup (shell): read the merged PR body/commit message for this packet. | PR body's last line matches the executor-brief format and explicitly names a `qa-redteam` finding count (or `"none"`) — `Skill(qa-redteam)` is a mandatory pre-merge gate for this HIGH-risk packet per `packets.md:20-21`, not optional. | Treating a green CI run as sufficient for a HIGH-risk packet — CI does not run `Skill(qa-redteam)`; its absence from the PR record means the merge gate was skipped, which this row exists to catch even though it happened before this UAT doc runs. |

---

## PK.3 — Attach/detach shell + menu entry (OD-3) — first CU-reachable packet

This is the packet that makes the whole feature reachable by a human/CU agent for the first time.
Rows PK3-1 through PK3-8 are the primary CU journey for this change.

**Setup common to all rows below:** launch via the canonical checkout (`cd frontend && npm start`);
confirm the live-runtime path matches the edited tree before any verdict (live-runtime rule). Rows
PK3-4 and PK3-6 mutate real state (track freeze, persisted layout JSON) — see their own Setup for
the throwaway-project / copy-aside requirement.

| # | Check (Setup + Drive) | Oracle (falsifiable) | Trap (rubber-stamp caught) |
|---|---|---|---|
| PK3-1 | Drive: open the **View** menu and read every item top to bottom. **EXPECTED-ABSENT until PK.3 ships** — pre-PK.3 (even after PK.1/PK.2 have merged), there must be NO item labeled `"System Monitor"` anywhere in the View menu; this is the correct baseline, not a bug. | Screenshot of the full View menu item list. Post-PK.3: a new item reading exactly `"System Monitor"` appears, with **no accelerator/keyboard-shortcut text** shown beside it (OD-3, locked — "menu-entry-only now, accelerator picked at build/UAT" for the separate system-monitor-v1 change). | Reporting "menu item present" without checking for the ABSENCE of an accelerator label — OD-3 explicitly forbids one at this stage; a stray `Cmd+M` or similar next to the label is itself a finding, not a bonus. |
| PK3-2 | Drive: click View → `"System Monitor"`. | A docked panel mounts inside the main window's layout, rendering `SystemMonitorStub`'s content (a header + a connection-status indicator sourced from the existing `engine-status` broadcast, e.g. an "Engine: Connected" style badge matching the statusbar's existing wording convention). Pixel-verify the panel uses this project's real CSS custom-property tokens (e.g. the `--cx-surface-*`/`--cx-line-*` families already in use elsewhere) — screenshot and confirm it does NOT look like an unstyled/default box; never assert a raw hex value. | Confirming the menu item toggles SOME visible change (e.g. a blank gray rectangle appears) without checking real content mounted — a wired boolean pointing at an empty `<div>` looks identical to a real panel from a quick glance. |
| PK3-3 | Drive: still on the docked panel from PK3-2, read its connection-status text and the `getPerfStats()` fallback state (backend command `get_perf_stats` is explicitly NOT implemented in this change — OD-2, cross-change with `system-monitor-v1`). | The panel shows a graceful **"stats unavailable"**-class fallback string (per `plan.md:2.4`'s stated contract) instead of a blank area, a spinner that never resolves, or a crash/white-screen. Screenshot the literal fallback text. | Mistaking a blank/empty panel region for "the stub is incomplete, not my problem" instead of confirming the SPECIFIC graceful-fallback text renders — a hard crash and an intentional graceful fallback can look identical (both "nothing there") unless you read what text, if any, is actually present. |
| PK3-4 | Drive: click the **"Detach"** button inside the docked panel. | A second, distinct OS-level window opens (screenshot showing 2 separately title-barred windows, or the OS window switcher showing 2 Creatrix entries) **in the same screenshot pass** that the docked panel's DOM region disappears from the main window — mutual exclusivity (only one instance of the panel ever renders, per `plan.md`'s "panel:mode" invariant). | Confirming only that "a new window appeared" without checking the docked copy actually unmounted — a bug that renders BOTH simultaneously (two live Freeze buttons wired to the same underlying track) is a real double-mutation risk that a window-count-only check would miss entirely. |
| PK3-5 | **Setup: THROWAWAY PROJECT** (this row mutates track state). Precheck (effect-amount-nonzero-equivalent): before clicking Freeze, screenshot the target track and confirm it shows **no pre-existing** freeze badge. Drive: inside the now-detached monitor window, click the **"Freeze"** button (PK.2's test-affordance, first CU-reachable here via PK.3's Detach). Then, in the MAIN window, press Play and let it run across **at least 2 full seconds / multiple frames** (stateful-effect rule — learning #44; a single paused screenshot proves nothing about a baked/frozen render). | Main window's timeline shows the frozen-track indicator, confirmed stable across **multiple sampled frames** of Play (not one). Then, with the MONITOR window focused, press Cmd+Z. Oracle: the frozen-track indicator disappears from the main window, again confirmed across **multiple Play frames** after the undo (not a single tick). | Judging freeze/undo from one paused screenshot immediately after each click — a bake/unbake transition that settles late (or a race that "looks reversed" for one rendered frame then snaps back) will fool a single-frame check; only sampling several frames on both sides of the freeze AND the undo catches it. |
| PK3-6 | Drive: press **Esc** while the monitor window is focused (or click its **"Reattach"** button). | The OS window closes (screenshot: window count back to 1 — also check the app's Window menu/Dock for a lingering hidden instance, not just the visible desktop), and the docked panel's DOM node reappears in the main window (reverse of PK3-4's mutual-exclusivity check). | Confirming the OS window merely became invisible (minimized/hidden) rather than genuinely destroyed — a "reattach" that just hides the window would leak a live, still-mutating second renderer process silently. |
| PK3-7 | **Setup: back up `~/.creatrix/panel-windows.json` first** (copy-aside, not `mv` — this file holds real persisted user layout state; restore it after this row regardless of outcome, per the house C7 backup convention). Drive: leave the monitor detached at a distinctive on-screen position, quit the app fully (Cmd+Q — not just closing the window), relaunch. | Monitor reopens **detached** at the same saved x/y (screenshot position comparison against the pre-quit screenshot). | Only testing the "everything stays where I left it" happy path — see PK3-8 for the clamp case, which this row alone cannot prove. |
| PK3-8 | Continuing from PK3-7's backed-up file: hand-edit `panel-windows.json`'s saved `x` to an out-of-range value (e.g. `9999`), simulating an unplugged display. Relaunch. **Restore the backed-up `panel-windows.json` after this row.** | Monitor reopens **detached** but clamped fully on-screen (visible display bounds), not off-screen or invisible. | Skipping the out-of-range case and only testing the valid-position restore (PK3-7) — the clamp is PK.1's `clampToDisplay` util wired into PK.3's restore path; this is the ONLY CU-visible proof that the cross-packet integration (not just PK.1's own unit test in isolation) actually works. |
| PK3-9 | Optional DevTools spot-check for the mutual-exclusivity race called out in `packets.md`'s STOP semantics ("if `panel:mode` events race with window close/open... do not paper over with a `setTimeout`"). With the monitor detached, open DevTools in the main window and query the DOM for the docked panel's root node. | Query returns null/absent — no lingering ghost node. | A flicker-open-then-close race papered over with a timeout might look fine to the naked eye (the flash is too fast to see) but would still leave a stale DOM node behind; a direct DOM query after the transition settles catches what a glance would miss. |
| PK3-10 | **Non-blocking note, not a pass/fail row:** the manual matrix (2-display arrangement, display unplug mid-session, fullscreen main + detached monitor on a second display, sleep/wake) is explicitly descoped by `plan.md §5` as "human spot-check required... do not claim automated coverage." | N/A — record as a flagged item in the PR body, not a UAT verdict. | Silently marking these as ✅ from a single-display test rig — the plan itself forbids claiming coverage here; don't let a green single-display run imply the multi-display matrix was checked. |

---

## PK.4 — Cmd+W / focus-routing verification — verification-only, no new UI

| # | Check (Setup + Drive) | Oracle (falsifiable) | Trap (rubber-stamp caught) |
|---|---|---|---|
| PK4-1 | Setup (shell): `cd frontend && npx playwright test tests/e2e/multiwindow/focus-routing.spec.ts`. EXPECTED-ABSENT pre-PK.4 — this file does not exist until this packet ships; running it must fail with "no test found," the correct baseline. | Post-ship, BOTH assertions pass in the same run: **(a)** focus the monitor window, press Cmd+W → `electronApp.windows().length === 1` (monitor closed), remaining window is main, unaffected (no dialog, no reload, state preserved). **(b)** focus the main window, press Cmd+W → the EXISTING close-confirmation flow (`index.ts:174-194`) still fires exactly as it did before this change (regression spy/mock assertion). | Accepting a green run on (a) alone — a fix that correctly routes Cmd+W to the monitor could easily, if `role:'windowMenu'`'s Close item was touched carelessly, also break the PRE-EXISTING main-window close-confirmation; both directions must be checked in the same pass, not just the new behavior. |
| PK4-2 | Live CU spot-check (real keyboard, not synthetic): click to focus the monitor window, press Cmd+W for real. | Screenshot before/after: which window actually closed. Cross-check against PK4-1's automated result — they must agree. | Trusting the automated spec alone for a claim about NATIVE OS menu-accelerator routing — this is exactly the class of behavior `plan.md:23` flagged as unverifiable from code-reading alone ("this repo cannot verify at doc-time... this must be an E2E oracle, not an assumption"); one real keypress is cheap insurance against a spec that mocks too much. |
| PK4-3 | **If PK4-1/PK4-2 reveal a REAL bug** (Cmd+W targets/affects the wrong window): check the merged PR body/commit history for this packet. | The PR record shows the STOP-and-report step actually happened BEFORE any `menu.ts` edit landed — i.e., a documented reproduction + proposed minimal fix, not a silent same-PR patch. Per `packets.md` STOP semantics: "do not silently patch `menu.ts` and expand scope... wait for confirmation before touching `menu.ts`." | Finding a `menu.ts` diff inside this packet's PR with no preceding STOP/confirmation record — that means scope grew without the required checkpoint, even if the resulting fix is technically correct. |

---

## Definition of done — single end-to-end journey

**Setup:** throwaway project. Launch via the canonical checkout (`cd frontend && npm start`),
confirm live-runtime path. Back up `~/.creatrix/panel-windows.json` first (restore after).

**Drive (one continuous session, screenshot at each numbered beat):**
1. Open **View** menu → click `"System Monitor"` → docked panel mounts with real app tokens and a
   connection-status readout (not a blank box).
2. Click **"Detach"** → a second OS window opens; the docked copy disappears from the main window
   (mutual exclusivity, both directions checked).
3. Inside the detached window, confirm the track has no pre-existing freeze badge, then click
   **"Freeze"** on a track row.
4. In the MAIN window, press Play and observe **at least 2 seconds / multiple frames**: the
   frozen-track indicator is present and stable across frames (not a single paused screenshot).
5. With the MONITOR window focused, press **Cmd+Z** → across another multiple-frame Play window in
   the main window, the frozen indicator disappears and stays gone.
6. Press **Esc** inside the monitor window → OS window closes, docked panel reappears in the main
   window.
7. Quit the app fully (Cmd+Q) with the monitor left **detached** at a distinctive position, then
   relaunch → the monitor reopens detached at the same saved position (screenshot comparison).
8. Focus the monitor window, press **Cmd+W** → only the monitor closes; the main window is
   untouched (still shows the reversed-freeze state from step 5, no reload, no dialog). Focus the
   main window, press **Cmd+W** → the existing close-confirmation dialog still appears exactly as
   it did before this change shipped.

**Oracle (falsifiable, all must hold together):** every screenshot pair in steps 2, 4, 5, and 6
shows the mutual-exclusivity/multi-frame conditions stated in their PK.3 rows above (PK3-4/PK3-5/
PK3-6); step 7's position match is pixel-comparable against the pre-quit screenshot; step 8's two
Cmd+W outcomes both match PK4-1's automated assertions. Restore the backed-up
`panel-windows.json` at the end regardless of outcome.

**Trap this journey is designed to catch:** validating PK.1–PK.4 in isolation (as the sections
above do) can miss an INTEGRATION-only failure — e.g., PK.1's `clampToDisplay` working alone,
PK.2's undo wiring working alone, and PK.3's docked/detached toggle working alone, but the
*combination* (detach → freeze → undo → reattach → relaunch → Cmd+W) hitting a state the
per-packet tests never exercised together, such as the `panel:mode` listener missing an event
during the freeze/undo round-trip, or the relaunch restore firing before the undo's async IPC
round-trip has settled. Only running the full chain in one continuous session, with multi-frame
verification at every stateful beat, proves the change works end-to-end — not just
packet-by-packet.
