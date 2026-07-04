# Packets — multiwindow-stage-a

**Emitted:** 2026-07-04 by /packetize. **Plan:** `plan.md` (same dir — packets POINT to its
line-anchored normative sections, especially §2 "New contracts" and §3 "Packet candidates";
do not re-derive wire shapes, re-litigate file lists, or restate code-ground already cited
there). **Proposal:** `proposal.md` — **Decisions:** ALL LOCKED (OD-1..OD-5, T1 Verdicts
2026-07-03: "Accept all defaults"; hotkey ODs additionally governed by "menu-entry-only now,
accelerator picked at build/UAT"). **No packet below re-opens an OD** — where an OD's
"Reject-if" clause could apply, the affected packet's STOP semantics say so explicitly instead
of pre-deciding it.

**Branching rule (every packet):** cut from `origin/main` only — never a local checkout that a
parallel session may own; verify with `git fetch origin && git log -1 origin/main` before
branching. PR-only; squash; no `.github/workflows/**` edits.
**Merge gate (every packet, STRICT FULL-TIER — no packet merges on smoke-green alone, per this
repo's own house convention cited in `plan.md:128`):** full backend pytest (`cd backend &&
python -m pytest -x -n auto --tb=short`) + full frontend vitest (`cd frontend && npx --no
vitest run` — on a main-checkout or CI runner; worktree executors cannot run vitest against a
running dev app) + `Skill(review)` via the Skill tool (ship-gate hook) + full CI green including
e2e-full where the packet touches `frontend/tests/e2e/**`. HIGH-risk packets additionally
require `Skill(qa-redteam)` before merge — see PK.2.

## Cross-change contracts (name in both directions per campaign convention)

- **`get_perf_stats` IPC contract — shared with `system-monitor-v1` (separate, not-yet-packetized
  change; proposal.md OD-2 / plan.md §2.4).** This change's `preload/monitor.ts` (PK.1) calls
  `ipcRenderer.invoke('send-command', { cmd: 'get_perf_stats', id: crypto.randomUUID() })` and
  `SystemMonitorStub.tsx` (PK.1) renders a "stats unavailable" state on `{ ok: false }` — this IS
  the contract, not a placeholder guess. `get_perf_stats` is NOT in `ALLOWED_COMMANDS`
  (`zmq-relay.ts:40-103`) today and this change does not add it (OD-2, hard non-goal). When
  `system-monitor-v1` is packetized, its own packets.md must name this same contract (command
  name `get_perf_stats`, request shape `{cmd, id}`, and the response shape it defines) so the
  stub swap is additive, zero-rework — per proposal.md's explicit design intent. No packet here
  is blocked waiting for it; the stub-tolerant contract is the whole point of OD-2.
- No packet in this change touches `frontend/src/renderer/stores/operators.ts` or
  `backend/src/modulation/routing.py` — the `wave0-prerouted-presets` REBASE-AFTER constraint on
  those files does not apply to this change. No packet touches a `DEPENDENT_PARAMS` registry
  (fx-afterimage/fx-backspin concern) — not applicable. No packet adds a new numeric `ParamDef` —
  no curve+unit calibration test required (plan.md §4 confirms N/A).

## PK.1 — WindowManager + monitor window shell (OD-1, OD-4)

- **Scope:** new `WindowManager` (open/close/reattach/focus-existing, `plan.md:83-99` contract)
  emitting `panel:mode` on every open/close/reattach transition; extracted shared
  `window-bounds.ts` clamp util (`clampToDisplay`) with `index.ts` and `pop-out-window.ts`
  refactored to call it (behavior-preserving only — see Non-scope); the monitor's own
  minimally-privileged preload (`preload/monitor.ts`, full `plan.md:101-116` surface: `dispatch`,
  `reattach`, `onEngineStatus`, `getPerfStats`) and renderer entry (`monitor.html`,
  `monitor-entry.tsx`); a stub content component (`SystemMonitorStub.tsx` — header + connection
  status via the existing `engine-status` broadcast, "stats unavailable" fallback on
  `getPerfStats()` `{ok:false}`, per OD-2); two new `electron.vite.config.ts` rollup entries
  mirroring the pop-out's `preload.pop-out`/`renderer.pop-out` keys line-for-line; FIFO-serializing
  `sendZmqCommand` in `zmq-relay.ts` (OD-4 hardening, see STOP for the reject-if spike); a new
  `secondWindow` Playwright fixture.
- **Non-scope:** the `panel:dispatch`/`panel:command` handler and any undo/freeze wiring (PK.2);
  the docked in-app overlay, `showSystemMonitor` state, and menu entry (PK.3); Cmd+W verification
  (PK.4); the `get_perf_stats` backend command itself (OD-2 — cross-change, see above); any
  behavior change to `pop-out.ts`/`pop-out-window.ts`/`index.ts`'s existing window-state JSON
  shape or its non-atomic write pattern (proposal.md non-goals — the refactor moves code, it does
  not change persisted shape or add atomicity to the two pre-existing files).
- **Files:**
  - create: `frontend/src/main/window-manager.ts`, `frontend/src/main/window-bounds.ts`,
    `frontend/src/preload/monitor.ts`, `frontend/src/renderer/monitor.html`,
    `frontend/src/renderer/monitor-entry.tsx`,
    `frontend/src/renderer/components/monitor/SystemMonitorStub.tsx` (PK.2 makes one additive
    edit to this file later — see single-flight map), `frontend/src/__tests__/main/window-manager.test.ts`,
    `frontend/src/__tests__/main/window-bounds.test.ts`, `frontend/src/__tests__/main/zmq-relay-fifo.test.ts`,
    `frontend/tests/e2e/multiwindow/window-lifecycle.spec.ts`,
    `frontend/tests/e2e/multiwindow/sidecar-restart-survival.spec.ts`.
  - edit: `frontend/electron.vite.config.ts` (+2 `rollupOptions.input` entries),
    `frontend/src/main/index.ts` (register `registerWindowManagerHandlers()` alongside the
    existing `registerPopOutHandlers()` call at `:241`; refactor `validateWindowBounds` to call
    `window-bounds.ts` — single-flight with PK.2, see map), `frontend/src/main/pop-out-window.ts`
    (refactor `validatePopOutBounds` to call `window-bounds.ts` only — no other change),
    `frontend/src/main/zmq-relay.ts` (FIFO-serialize `sendZmqCommand`),
    `frontend/tests/e2e/fixtures/electron-app.fixture.ts` (+`secondWindow` fixture using
    `electronApp.waitForEvent('window')`).
- **Depends:** none (dispatchable now). **Cross-change:** contract-only dependency on
  `system-monitor-v1` for `get_perf_stats` (non-blocking — see Cross-change contracts above).
  **Blocks:** PK.2, PK.3, PK.4 (all need the window/preload/entry to exist first).
- **Risk:** STD (MED). Not HIGH — no untrusted-input trust boundary crossed (window
  bounds/CSP/rollup config are local, not user- or network-supplied), but touches a shared IPC
  socket (`zmq-relay.ts`) used by the whole app, so it is not LOW either.
- **Hard oracle:**
  - `cd frontend && npx --no vitest run src/__tests__/main/window-manager.test.ts` → all pass, 0
    skipped: open (creates), open-again (focuses existing, `BrowserWindow` count stays 1), close
    (destroys + clears ref), reattach (closes OS window + fires exactly one `panel:mode`
    `{mode:'docked'}` send), clamp-to-display with a synthetic fully-offscreen saved rect → falls
    back to centered default. CSP header string byte-equal to `pop-out-window.ts`'s dev/prod
    branches (assert via a direct string-equality test against the two builder functions, not by
    eyeballing).
  - `cd frontend && npx --no vitest run src/__tests__/main/window-bounds.test.ts` → passes for
    all three call-site minimums (400×300 main, 200×150 pop-out, the monitor's own minimum),
    proving the extraction is behavior-preserving (identical accept/reject verdicts to the two
    inline validators it replaces).
  - `cd frontend && npx --no vitest run` (full suite) → green, proving the `index.ts`/
    `pop-out-window.ts` refactor broke nothing in their existing test files — this IS the
    anti-dead-flag check for a refactor-only edit (existing tests must still pass unchanged, not
    just the new ones).
  - `cd frontend && npx playwright test tests/e2e/multiwindow/window-lifecycle.spec.ts` → asserts
    `electronApp.windows().length === 2` immediately after `openPanel('system-monitor')`, `=== 1`
    after `closePanel('system-monitor')`. This test cannot pass before this packet exists
    (`WindowManager` is greenfield — zero prior hits per proposal.md) — that absence-of-target IS
    the anti-dead-flag proof for new capability.
  - `cd frontend && npx --no vitest run src/__tests__/main/zmq-relay-fifo.test.ts` → new test file:
    fire two `sendZmqCommand`-equivalent calls concurrently (e.g. via a mocked `zeromq.Request`
    whose `send`/`receive` resolve on separate microtask ticks) and assert the second call's
    `send()` is not invoked until the first call's `receive()` has resolved (proves FIFO ordering,
    not just eventual completion) — this is the mechanical proof for OD-4's "headline oracle", not
    the STOP-semantics prose alone.
- **Test plan:** unit (Vitest) — `window-manager.test.ts`, `window-bounds.test.ts`. E2E
  (Playwright `_electron`, justified: real `BrowserWindow` lifecycle, CSP enforcement, and
  multi-window focus cannot be exercised in jsdom) — `window-lifecycle.spec.ts`,
  `sidecar-restart-survival.spec.ts` (BDD scenario 5 from `plan.md:193-196`: kill/restart the
  Python sidecar, assert the monitor window survives and its next `getPerfStats()`/ping succeeds
  post-restart — scoped exactly as `plan.md` describes, not a full watchdog E2E rebuild).
- **UAT journey:** N/A for this packet — no menu entry exists yet (PK.3 adds the user-facing
  trigger); this is plumbing verified by window-count E2E assertions, not a visual walkthrough.
- **STOP semantics:**
  - If a live spike shows `zeromq`'s `Request` class already serializes concurrent `.send()`
    calls internally (OD-4's own reject-if), STOP before wrapping — downgrade the FIFO wrapper to
    a documented no-op passthrough with a comment citing the spike evidence, and report; do not
    silently skip the verification step either way.
  - If the `window-bounds.ts` extraction changes ANY existing `pop-out-window.test.ts` or
    `index.ts`-adjacent test's pass/fail verdict, STOP — "behavior-preserving" was a stated design
    assumption, not a given; report before adjusting the extraction.
  - If the monitor's CSP cannot be made byte-equal to pop-out's dev/prod branches without a
    functional reason (not "close enough"), STOP — PLAY-009 requires exact replication, this repo
    already shipped a black-window bug from an approximate CSP once.
- **Executor brief:** Sonnet-tier; template `~/.claude/templates/subagent-brief.md`. Inline
  verbatim: (1) OD-4 text — *"Stage A is the first consumer that adds an independent poller (2 Hz)
  running concurrently with the main window's existing render/audio/clock IPC traffic on the same
  process — a plausible new race, not a hypothetical one... verify before believing 'it's fine.'"*
  (2) PLAY-009 — CSP mirrors `pop-out-window.ts:194-205` exactly, and `preload/monitor.ts` must
  attach `ipcRenderer.on(...)` listeners at module scope before React mount (frames/pushes sent
  between `loadURL` and mount are otherwise silently dropped). (3) Core Rule 1 — "Read files
  before editing — never Edit without prior Read." Last line of your output: `PR #<n> — oracle
  evidence: <vitest summary line> / <playwright summary line>`.

## PK.2 — Command-forwarding contract + undo plumbing (OD-5) — **RISK: HIGH**

- **Scope:** the `panel:dispatch` (invoke) / `panel:command` (send) contract in a new
  `frontend/src/main/panel-bridge.ts` (allowlist-validated handler, mirrors the
  `ALLOWED_COMMANDS` shape at `zmq-relay.ts:40-103` with its own small `{panel, type}` set — NOT
  the ZMQ allowlist itself), registered from `index.ts`; App.tsx's `panel:command` listener
  (`useEffect`) switching `'undo'`→`useUndoStore.getState().undo()`, `'redo'`→`...redo()`,
  `'freeze'`/`'unfreeze'`→a **new** `undoable()`-wrapped wrapper (`stores/freeze-undo.ts`) that
  calls `freezePrefix`/the unfreeze-equivalent inside the forward/inverse closures with
  description `"Freeze <trackId>"` / `"Unfreeze <trackId>"`; a minimal test-affordance "Freeze"
  button added to `SystemMonitorStub.tsx` (PK.1's file) that calls
  `entropicMonitor.dispatch('freeze', {trackId})` — this is the change's OWN hard-oracle
  round-trip proof per proposal.md OD-2 ("uses `freeze_prefix`... not `get_perf_stats`"), not a
  System-Monitor-v1 feature; Cmd+Z captured by a small keydown listener inside the monitor
  window's own renderer (NOT `shortcutRegistry` — that's main-window-only) invoking
  `entropicMonitor.dispatch('undo')`.
- **Non-scope:** any change to the EXISTING direct `sendCommand` freeze path used by
  timeline/toast freeze buttons in the main renderer — those keep working unchanged; only the
  monitor's path routes through the new wrapper (single-writer rule, plan.md §2.2). No docked/
  detached UI (PK.3). No real Activity-Monitor freeze-per-row table (System Monitor v1).
- **Files:**
  - create: `frontend/src/main/panel-bridge.ts`, `frontend/src/renderer/stores/freeze-undo.ts`,
    `frontend/src/__tests__/main/panel-bridge.test.ts`,
    `frontend/src/__tests__/stores/freeze-undo.test.ts`,
    `frontend/tests/e2e/multiwindow/undo-forwarding.spec.ts`.
  - edit: `frontend/src/main/index.ts` (register panel-bridge handler — single-flight AFTER PK.1's
    own `index.ts` edit), `frontend/src/renderer/App.tsx` (+`panel:command` listener `useEffect`;
    optional `case 'undo'`/`case 'redo'` in the `menu:action` switch for symmetry — only if it
    does not disturb the existing `meta+z` `shortcutRegistry` path, see STOP), `frontend/src/renderer/components/monitor/SystemMonitorStub.tsx`
    (+minimal "Freeze" test button — single-flight AFTER PK.1 creates this file).
- **Depends:** PK.1 (needs the window/preload/`entropicMonitor.dispatch` surface to exist —
  `preload/monitor.ts`'s `dispatch()` already calls `ipcRenderer.invoke('panel:dispatch', ...)`
  per PK.1's contract; it will reject with no handler until this packet lands, which is expected
  and does not block PK.1's own oracle). **Blocks:** PK.3 (App.tsx edit ordering — see single-flight
  map), PK.4 (needs the full command flow to exist to be meaningfully verified end-to-end).
- **Risk:** **HIGH** → Opus-tier executor + mandatory `Skill(qa-redteam)` before merge. Rationale:
  this is the ONE piece of the change that creates NEW user-visible state mutation (freeze/undo)
  reachable from a second OS process, and per this repo's own house landmine, every new
  user-visible op needs a correct, non-bypassable History Ledger row — a wrong allowlist or a
  wrapper that silently drops the inverse closure corrupts undo history silently.
- **Hard oracle:**
  - Component test: `entropicMonitor.dispatch('freeze', {trackId})` (mocked IPC round-trip)
    produces exactly ONE `useUndoStore` entry with description `"Freeze <trackId>"` — this test
    MUST FAIL on the pre-packet tree (today `freeze.ts` never imports `useUndoStore`, confirmed by
    plan.md's code-ground; run the test against `git stash` of this packet's diff to prove the
    fail-before/pass-after delta, capture both outputs).
  - `cd frontend && npx --no vitest run src/__tests__/main/panel-bridge.test.ts` → allowlist
    rejects unknown `panel`/`type` pairs with the same rejection shape as
    `zmq-relay.ts:267-271`, accepts the known set.
  - E2E `undo-forwarding.spec.ts`: a synthetic `panel:command('undo')` sent to the main renderer
    while the monitor window is focused reverses a prior freeze (asserted via the main window's
    visible frozen-track indicator disappearing); Cmd+Z pressed **inside the monitor window**
    (real keyboard event via Playwright, not a synthetic IPC send) is asserted to affect the MAIN
    window's undo stack, not a local no-op in the monitor's own (nonexistent) store.
- **Test plan:** unit — `panel-bridge.test.ts` (allowlist), `freeze-undo.test.ts` (wrapper
  description string + forward/inverse closure correctness). Component (Vitest + mock IPC) —
  App.tsx `panel:command` listener dispatch-to-store-call mapping for all 4 types. E2E (justified:
  cross-process undo-store mutation and real OS-level Cmd+Z keyboard routing cannot be verified
  without two real `BrowserWindow`s) — `undo-forwarding.spec.ts`.
- **Trust-boundary rule (verify with a caller grep before writing the brief — do not assume):**
  the REAL boundary is `panel-bridge.ts`'s `ipcMain.handle('panel:dispatch', ...)` — this must be
  the ONLY registered handler for that channel (grep `ipcMain.handle('panel:dispatch'` across
  `frontend/src/main/**` and confirm exactly one hit, in this new file). Validation must happen
  there, BEFORE `mainWindow.webContents.send('panel:command', payload)` — validating only inside
  App.tsx's listener (after the payload is already trusted and forwarded) is a dead boundary.
- **UAT journey:** open the monitor (docked, via PK.3 once it lands — this packet's own UAT is
  exercisable standalone via the stub's test-affordance button before PK.3 ships the full
  docked/detached shell): click "Freeze" in the stub → main window's timeline shows the
  frozen-track indicator → Cmd+Z (from either window) reverses it. Pixel-verify the button state
  (enabled/disabled, focus ring) using this project's CSS custom-property tokens from
  `global.css` (e.g. the `--sidebar-width`/`--statusbar-height`-style token conventions already
  in use — never assert a raw hex value in the UAT script).
- **STOP semantics:**
  - If wrapping freeze in `undoable()` changes ANY existing timeline/toast freeze call site's
    behavior (this packet must not touch those), STOP — the wrapper must be additive-only,
    reached exclusively via the monitor's `entropicMonitor.dispatch` path.
  - If adding `case 'undo'`/`case 'redo'` to App.tsx's `menu:action` switch conflicts with or
    duplicates the existing `shortcutRegistry.register('undo', ...)` path (`App.tsx:627-628`),
    STOP and drop the optional symmetry addition — do not create two competing undo triggers.
  - If the `panel-bridge.ts` allowlist handler is not the sole registrant for `panel:dispatch`
    (grep finds more than one `ipcMain.handle('panel:dispatch'` hit), STOP — report the conflict,
    do not silently pick one.
- **Executor brief:** Opus-tier (HIGH risk); template `~/.claude/templates/subagent-brief.md`.
  Inline verbatim: (1) OD-5 text — *"a monitor-row freeze button is a new user-visible op surface
  and cannot ship without closing this gap... freeze/unfreeze become `undoable()`-described
  actions... called from the main renderer only (single-writer rule)... never a direct
  `sendCommand` from the monitor's own process."* (2) the Trust-boundary rule above, verbatim. (3)
  Gate 13 (Trace Path) — before writing the fix, grep `useUndoStore`/`freezePrefix` across ALL
  files and list the full chain (monitor keydown → `entropicMonitor.dispatch` → `panel:dispatch`
  invoke → `panel-bridge.ts` handler → `panel:command` send → App.tsx listener →
  `freeze-undo.ts` wrapper → `useUndoStore`) in a code comment before implementing. Last line of
  your output: `PR #<n> — oracle evidence: <fail-before/pass-after test output> — qa-redteam:
  <finding count, or "none">`.

## PK.3 — Attach/detach shell + menu entry (OD-3)

- **Scope:** `App.tsx` `showSystemMonitor` state mirroring `showHistory`
  (`App.tsx:380-381`/`:4099-4114`) with a docked conditional overlay render of
  `SystemMonitorPanel.tsx` (new thin wrapper — renders `SystemMonitorStub` docked, or a "Detach"
  button calling `window.entropic.windowManager.open('system-monitor')`); a `panel:mode` listener
  in App.tsx flipping `showSystemMonitor` visibility in lockstep with PK.1's WindowManager
  transitions (only one instance of the panel ever renders); `menu.ts` `viewMenu` +1 item, "System
  Monitor", **no accelerator** (OD-3, locked); Accelerator assignment is explicitly deferred to
  the separate system-monitor-v1 change's own build/UAT phase, per the T1 Verdict clarification
  in proposal.md — this packet does not include a decision point for picking one; a small
  addition to `preload/index.ts`'s `entropic`
  bridge exposing `windowManager.open(panelId)` → `ipcRenderer.invoke('window-manager:open',
  panelId)`.
- **Non-scope:** the generic Stage-B panel registry (this shell is Stage-A-local, does not
  generalize — proposal.md non-goals); any freeze/undo logic beyond what PK.2 already built;
  Cmd+W verification (PK.4).
- **Files:**
  - create: `frontend/src/renderer/components/monitor/SystemMonitorPanel.tsx`,
    `frontend/src/__tests__/components/system-monitor-panel.test.tsx`,
    `frontend/tests/e2e/multiwindow/reattach.spec.ts`, `frontend/tests/e2e/multiwindow/relaunch-restore.spec.ts`.
  - edit: `frontend/src/renderer/App.tsx` (+`showSystemMonitor` state, +docked overlay render,
    +`panel:mode` listener — single-flight AFTER PK.2's `panel:command` listener edit to the same
    file), `frontend/src/main/menu.ts` (+1 `viewMenu` item, no accelerator — single-flight BEFORE
    PK.4's conditional fix), `frontend/src/preload/index.ts` (+`windowManager.open` — this file is
    untouched by any other packet in this change).
- **Depends:** PK.1 (WindowManager + `panel:mode` emission must exist), PK.2 (App.tsx edit
  ordering — PK.2's listener lands first). **Blocks:** PK.4 (needs the full menu→open→docked/
  detached flow working end to end before Cmd+W routing can be meaningfully verified).
- **Risk:** STD (MED).
- **Hard oracle:**
  - Component test (mock IPC): mounting App-level state with `showSystemMonitor: true` then
    firing a `panel:mode` event `{mode:'detached'}` → assert the docked DOM node unmounts; firing
    `{mode:'docked'}` → assert it remounts. This test cannot pass before this packet exists
    (`showSystemMonitor` state is new) — anti-dead-flag by absence-of-target, same class as PK.1.
  - E2E `reattach.spec.ts`: detach via the button → OS window opens, docked panel DOM node gone
    from the main window; press Esc inside the monitor window (or click its Reattach button) → OS
    window closes, docked panel DOM node reappears.
  - E2E `relaunch-restore.spec.ts`: hand-edit `panel-windows.json` to `mode:"detached"` with a
    valid on-screen `x`/`y` → relaunch → monitor reopens detached at that position. Repeat with an
    out-of-range `x` (simulating an unplugged display) → relaunch → monitor reopens detached but
    clamped on-screen (exercises PK.1's `clampToDisplay`, proving cross-packet integration, not
    just this packet's own code).
  - Integration E2E (BDD scenario 1, `plan.md:180-183`): detach the monitor → click "Freeze" (via
    PK.2's stub affordance) → main window's timeline shows the frozen-track indicator → Cmd+Z
    reverses it. This exercises PK.1+PK.2+PK.3 together as the change's end-to-end proof.
- **Test plan:** component (Vitest + mock IPC) — `system-monitor-panel.test.tsx` (mutual
  exclusivity). E2E (Playwright `_electron`, justified: real disk-persisted `panel-windows.json`,
  real Electron relaunch, and real cross-window DOM state cannot be exercised in jsdom) —
  `reattach.spec.ts`, `relaunch-restore.spec.ts`.
- **UAT journey:** View menu → "System Monitor" → docked panel appears inside the main window
  (pixel-verify using this project's CSS custom-property token conventions — no raw hex) → click
  "Detach" → OS window opens, docked panel disappears → press Esc inside it (or click "Reattach")
  → OS window closes, docked panel reappears → quit and relaunch with the monitor left detached →
  it reopens detached at the saved position, or clamped on-screen if the saved display is gone.
- **STOP semantics:**
  - If `role: 'windowMenu'`'s default items conflict with placement of the new `viewMenu` entry,
    STOP and report the menu structure surprise rather than guessing a placement.
  - If `panel:mode` events race with window close/open (e.g. the docked overlay flickers open
    then closes on detach), STOP — do not paper over with a `setTimeout`; report the race for a
    design decision.
  - If `SystemMonitorPanel` needs direct access to a main-renderer Zustand store instance from
    inside the monitor's OWN process (rather than via the `panel:dispatch`/`panel:command`
    contract), STOP — that is the Stage-C state-bridge boundary, explicitly out of scope here.
- **Executor brief:** Sonnet-tier; template `~/.claude/templates/subagent-brief.md`. Inline
  verbatim: (1) OD-3 text — *"ship Stage A with a View ▸ System Monitor menu entry only... and no
  accelerator label for now."* (2) the "only one instance of the panel ever renders" invariant
  from `plan.md:78-81` (`panel:mode` contract). (3) Core Rule 14 (Wiring Check) — verify entry AND
  exit paths (open AND close, mount AND unmount), and that legacy/edited `panel-windows.json`
  loads without crash. Last line of your output: `PR #<n> — oracle evidence: <component test
  summary> / <2 playwright spec summaries>`.

## PK.4 — Cmd+W / focus-routing verification

- **Scope:** verification-only. New `frontend/tests/e2e/multiwindow/focus-routing.spec.ts`
  proving (or disproving) the uncertainty flagged in `plan.md:23` — whether `role: 'windowMenu'`'s
  default Close item targets the OS-focused window or a hardcoded `mainWindow` reference. **If**
  the test uncovers a real bug (Cmd+W with the monitor focused closes/affects the wrong window),
  scope grows to include a minimal, targeted `menu.ts` fix — but only AFTER the STOP-and-report
  below, never silently.
- **Non-scope:** any new feature; any fix beyond the minimal one needed to make focus-routing
  correct, if a bug is found.
- **Files:**
  - create: `frontend/tests/e2e/multiwindow/focus-routing.spec.ts`.
  - conditionally edit: `frontend/src/main/menu.ts` — ONLY if the oracle below fails AND the user/
    orchestrator has confirmed the scope growth per the STOP below.
- **Depends:** PK.1, PK.2, PK.3 (needs the full open/menu/dock/detach flow to exist for
  focus-routing to be meaningfully exercised). **Blocks:** none — last in the sequence.
- **Risk:** LOW by default (verification-only); escalates to STD if a real bug requires the
  conditional `menu.ts` fix — re-flag risk at that point, do not silently absorb it as LOW.
- **Hard oracle:**
  - `cd frontend && npx playwright test tests/e2e/multiwindow/focus-routing.spec.ts` →
    (a) focus the monitor window, press Cmd+W, assert `electronApp.windows().length === 1`
    (monitor closed) and the remaining window is the main window, unaffected (no dialog, no
    reload, state preserved); (b) focus the main window, press Cmd+W, assert the EXISTING
    close-confirmation flow (`index.ts:174-194`) still fires exactly as it does today (regression
    check — spy/mock the confirmation dialog and assert it was invoked, matching pre-packet
    behavior).
- **Test plan:** E2E only (justified: OS-level menu-accelerator routing and native window-focus
  semantics are not observable from unit or component tests — this is precisely the class Gate 5
  reserves for Playwright `_electron`).
- **UAT journey:** user presses Cmd+W with the monitor focused → monitor closes, main window
  survives untouched; user presses Cmd+W with main focused → existing close-confirmation dialog
  appears unchanged (regression, not new UI — no new pixel-verify surface).
- **STOP semantics:** if the test reveals a REAL Cmd+W routing bug (native Close targets the
  wrong window, or closes/affects main by accident), STOP immediately — do not silently patch
  `menu.ts` and expand scope. Report the finding, the exact reproduction, and the proposed minimal
  fix, and wait for confirmation before touching `menu.ts` (this is a scope-growth decision, not a
  bug-fix reflex).
- **Executor brief:** Sonnet-tier; template `~/.claude/templates/subagent-brief.md`. Inline
  verbatim: (1) Core Rule 6 (Reproduce) — "fixing a bug → RUN the failing code first, capture the
  actual error/stack trace. Reasoning about code is NOT enough." (2) the STOP semantics above,
  verbatim — scope growth requires confirmation, not silent action. (3) Core Rule 3 — "Do what was
  asked, nothing more — no bonus features." Last line of your output: `PR #<n> — oracle evidence:
  <playwright summary> — bug found: <yes/no, with repro if yes>`.

## Single-flight map

| File | Packets | Order |
|---|---|---|
| `frontend/src/main/index.ts` | PK.1 (register WindowManager handlers + bounds refactor), PK.2 (register panel-bridge handler) | PK.1 → PK.2 |
| `frontend/src/renderer/App.tsx` | PK.2 (+`panel:command` listener), PK.3 (+`showSystemMonitor` state, docked overlay, `panel:mode` listener) | PK.2 → PK.3 |
| `frontend/src/renderer/components/monitor/SystemMonitorStub.tsx` | PK.1 (create), PK.2 (+minimal Freeze test button) | PK.1 → PK.2 |
| `frontend/src/main/menu.ts` | PK.3 (+View item), PK.4 (conditional fix, only if bug found) | PK.3 → PK.4 |
| `frontend/tests/e2e/fixtures/electron-app.fixture.ts` | PK.1 (adds `secondWindow` fixture, sole editor) — read-only import by PK.2/PK.3/PK.4's specs | PK.1 first (no conflict, single owner) |

All other files (`window-manager.ts`, `window-bounds.ts`, `preload/monitor.ts`, `monitor.html`,
`monitor-entry.tsx`, `zmq-relay.ts`, `pop-out-window.ts`, `panel-bridge.ts`, `freeze-undo.ts`,
`SystemMonitorPanel.tsx`, `preload/index.ts`) are single-packet-owned — no serialization needed.

**Sequencing (also the dependency order):** PK.1 → PK.2 → PK.3 → PK.4, strictly serial — each
packet's oracle depends on the previous one's window/contract/UI existing. No two packets in this
change are parallel-dispatchable against each other (unlike wave0's PK.2/PK.4/PK.5 fan-out) —
Stage A's own plan.md states this explicitly (`plan.md:127`: "Sequencing: 1 → 2 → 3 → 4").

## Coverage check (plan.md → packets)

- §2.1 `panel-windows.json` + shared `window-bounds.ts` extraction → PK.1.
- §2.2 IPC command-forwarding contract (`panel:dispatch`/`panel:command`) + undo plumbing (OD-5)
  → PK.2. `panel:mode` (also §2.2) → emitted by PK.1 (WindowManager), consumed by PK.3 (docked
  overlay) — split across the two packets that own each end, both cited.
- §2.3 WindowManager surface (`openPanel`/`closePanel`/`reattachPanel`/`registerWindowManagerHandlers`)
  → PK.1.
- §2.4 `preload/monitor.ts` bridge surface → PK.1 (full contract, including the `get_perf_stats`
  cross-change stub tolerance, OD-2).
- §3 Packet-candidate table rows 1–4 → PK.1, PK.2, PK.3, PK.4 respectively (1:1).
- §4 House landmines: History Ledger row for freeze-from-monitor → PK.2. All other landmines
  confirmed N/A by plan.md itself (no numeric params, no effects, no MJPEG, no pixel work, no
  schema version bump) — no packet needed, explicit descope per plan.md's own text.
- §5 Test Plan E2E BDD scenarios: #1 (detach+freeze+undo+main-timeline) → PK.3 (integration,
  exercises PK.1+PK.2+PK.3). #2 (reattach restores docked) → PK.3. #3 (relaunch restores layout)
  → PK.3. #4 (Cmd+W closes only the panel) → PK.4. #5 (sidecar restart does not orphan monitor
  window) → PK.1, scoped exactly as plan.md describes (survival + next ping succeeds, not a full
  watchdog E2E rebuild).
- §5 "Manual matrix" (2-display arrangement, display unplug mid-session, fullscreen main +
  detached monitor on second display, sleep/wake) → **explicit descope, confirmed by plan.md
  itself**: "flag these in the PR description as human spot-check required... do not claim
  automated coverage for them." No packet covers this; PK.3's PR body must carry the flag since
  it ships the detach/relaunch surface these scenarios exercise.
- §6 Rollback → informational only (additive-only feature, no packet needed to "roll back";
  killing the feature = don't call `registerWindowManagerHandlers()` + remove the menu item, both
  already reversible single-line edits within PK.1/PK.3's own diffs).

Nothing silently narrowed. OD-1..OD-5 are fully absorbed into the packets above exactly as T1
locked them (no packet re-opens a Reject-if — those are handled as STOP conditions instead).

## Ledger

| Packet | Status | PR | Oracle evidence |
|--------|--------|----|-----------------|
| PK.1 | ⬜ | — | — |
| PK.2 | ⬜ | — | — |
| PK.3 | ⬜ | — | — |
| PK.4 | ⬜ | — | — |
