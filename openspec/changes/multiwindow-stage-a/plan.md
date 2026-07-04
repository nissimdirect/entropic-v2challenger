# Plan: multiwindow-stage-a

Read `proposal.md` first — Open Decisions OD-1..OD-5 gate several choices below; each packet
below states which OD it depends on and what it does if the recommended default is overridden.

## 1. Code-grounded starting state (cite-checked 2026-07-03)

| Claim | Evidence |
|---|---|
| Exactly 2 `BrowserWindow`s exist today | `grep -rn "new BrowserWindow" frontend/src/main` → `frontend/src/main/index.ts:145` (main), `frontend/src/main/pop-out-window.ts:132` (pop-out). No third. |
| Pop-out preload is READ-ONLY, one-way push, no invoke/send | `frontend/src/preload/pop-out.ts:1-44` — comment at :3-4 ("RT-1: READ-ONLY preload... MUST NOT expose ipcRenderer.invoke() or ipcRenderer.send()"), only `onFrameUpdate`/`onClose`/`onPing`/`getLastPingAt` exposed. |
| Per-window bounds persistence + display-clamp is already duplicated once | `frontend/src/main/index.ts:73-132` (`loadWindowState`/`saveWindowState`/`validateWindowBounds`, path `~/.creatrix/window-state.json`) vs. `frontend/src/main/pop-out-window.ts:64-116` (`loadPopOutBounds`/`savePopOutBounds`/`validatePopOutBounds`, path `~/.creatrix/pop-out-state.json`) — near-identical logic, two copies. A third copy for the monitor would be the third. |
| Existing writes are NOT atomic (violates house landmine PLAY-007 as written) | `index.ts:110` and `pop-out-window.ts:96` both call `writeFileSync(PATH, ...)` directly, no temp+rename. Pre-existing, out of scope to fix (proposal.md non-goals), but the NEW file this change adds must not copy the anti-pattern. |
| `get_perf_stats` / `SystemMonitor` / `WindowManager` do not exist anywhere in the repo | `grep -rln "WindowManager\|system-monitor\|SystemMonitor\|get_perf_stats" frontend/src backend/src` → no output. |
| `_effect_timing` is a global-by-TYPE dict, not per-instance/track | `backend/src/engine/pipeline.py:56` (`_effect_timing: dict[str, deque]`), `:95-97` (`record_timing` keyed by bare `effect_id`), `:100-112` (`get_effect_stats`). Confirms UNIFICATION-2026-07-03.md §2 finding #70 ("System Monitor '95% assembled' claim is wrong") — another reason OD-2 defers the real table. |
| `get_perf_stats` is not in the IPC allowlist | `frontend/src/main/zmq-relay.ts:40-103` (`ALLOWED_COMMANDS`) — no `get_perf_stats` entry; adding a new command must also satisfy the bidirectional contract test noted at `zmq-relay.ts:37-38` (`src/__tests__/contracts/relay-allowlist.test.ts`). |
| Freeze is fire-and-forget IPC with an existing allowlisted command | `freeze_prefix` IS in `ALLOWED_COMMANDS` (`zmq-relay.ts:62`); `frontend/src/renderer/stores/freeze.ts:49-74` (`freezePrefix`) calls `sendCommand` directly. |
| Freeze has **zero** undo wiring today | `frontend/src/renderer/stores/freeze.ts` — no import of `useUndoStore`, no `undoable()` call anywhere in the file. Confirms OD-5. |
| App's real undo/redo is renderer-local keyboard dispatch, NOT the native menu role | `frontend/src/renderer/App.tsx:627-628` (`shortcutRegistry.register('undo', () => useUndoStore.getState().undo())` / `'redo'`), bound to `meta+z`/`meta+shift+z` in `frontend/src/renderer/utils/default-shortcuts.ts:15-16`. The `menu:action` switch in App.tsx (~`:2251-2367`) has **no** `case 'undo'`/`case 'redo'` — `menu.ts`'s `editMenu` uses native `{ role: 'undo' }`/`{ role: 'redo' }` (menu.ts, editMenu block) which does not reach `useUndoStore`. **Consequence: no existing channel can trigger app-level undo from outside the main renderer's own keydown handler — Packet 2 must add one.** |
| `watchdog.ts` already broadcasts connection status to ALL windows, not just main | `frontend/src/main/watchdog.ts:25-29` (`broadcast()` iterates `BrowserWindow.getAllWindows()`, sends `'engine-status'`). This means the monitor window gets connection-status for free by adding its own tiny `onEngineStatus` listener (mirroring `frontend/src/preload/index.ts:9-12`) — **no main-process change needed for this piece**, and no shared Zustand store is required or possible across processes (each window is a separate JS context) — corrects the System-Monitor-PRD §8 phrase "reuses the existing heartbeat store" to mean "same broadcast channel, independently observed," not a shared store instance. |
| Docked-panel precedent already exists and is the right size for Stage A (not a generic registry) | `frontend/src/renderer/App.tsx:380-381` (`const [showHistory, setShowHistory] = useState(false)`) + `:4099-4114` (conditional overlay render of `<HistoryPanel/>`), component at `frontend/src/renderer/components/layout/HistoryPanel.tsx`. Stage B's generic panel registry is NOT this — see proposal.md non-goals. |
| No existing multi-window Playwright E2E test, even for the pop-out (2 real windows exist today, untested at the E2E layer) | `find frontend/tests/e2e -iname "*pop-out*"` → empty. Pop-out is covered only by Vitest unit tests (`frontend/src/__tests__/main/pop-out-window.test.ts`, `.../pop-out-contract.test.ts`). The shared fixture `frontend/tests/e2e/fixtures/electron-app.fixture.ts:74-87` only exposes `firstWindow()` — a second-window fixture must be added. |
| Menu is a single global `Menu.setApplicationMenu`, not per-window | `frontend/src/main/menu.ts` (last line, `buildMenu`) — one call, built once against `mainWindow`; macOS has one app-wide menu bar. `role: 'windowMenu'` is included on macOS (`menu.ts` template array) but this repo cannot verify at doc-time whether its default Close entry actually targets the OS-focused window for Cmd+W vs. a hardcoded `mainWindow` reference — **this must be an E2E oracle (§5), not an assumption.** |

## 2. New contracts (defined here — the source PRD does not pin exact wire shapes for Stage A;
this is the implementer's single source of truth, do not re-derive)

### 2.1 `panel-windows.json` — layout persistence (new file, atomic write per PLAY-007)
Path: `~/.creatrix/panel-windows.json` (sibling of the existing `window-state.json` /
`pop-out-state.json`, same `~/.creatrix` dir already created by both).
```json
{
  "version": 1,
  "panels": {
    "system-monitor": {
      "mode": "docked",
      "x": 100, "y": 100, "width": 480, "height": 360,
      "wasOpenDetached": false
    }
  }
}
```
- `mode`: `"docked" | "detached"` — which surface last rendered the panel; drives restore-on-launch.
- Bounds fields are only meaningful when `mode: "detached"`; absent/invalid → default size,
  centered (same fallback shape as `pop-out-window.ts`'s `winOpts` default).
- **Write path MUST be temp-write + rename** (`fs.writeFileSync(tmp, ...)` then
  `fs.renameSync(tmp, path)`, `finally` cleanup of the tmp file) — PLAY-007, and an explicit
  deviation from the two precedent files this design otherwise mirrors (see proposal.md
  non-goals: not back-ported to those two).
- Validation on load: same shape-check + `width/height` minimum + `getDisplayMatching` +
  ≥50px-visible overlap test as `pop-out-window.ts:69-116`'s `loadPopOutBounds`/
  `validatePopOutBounds` pair — **extract this pair into a shared
  `frontend/src/main/window-bounds.ts` util** (`clampToDisplay(rect, minW, minH): Rect | null`)
  and refactor `index.ts`'s `validateWindowBounds` + `pop-out-window.ts`'s
  `validatePopOutBounds` to call it, rather than writing a third copy. Additive, behavior-preserving
  refactor — no change to either file's persisted JSON shape.

### 2.2 IPC command-forwarding contract (single-writer preservation)
Two new channels, main-process-mediated (never window-to-window directly):

- **`panel:dispatch`** (panel renderer → main, `ipcRenderer.invoke`) — payload:
  `{ panel: "system-monitor", type: "freeze" | "unfreeze" | "undo" | "redo", args?: unknown }`
- **`panel:command`** (main → main renderer, `webContents.send`) — main's `panel:dispatch`
  handler does nothing but validate `panel`/`type` against an explicit allowlist (mirrors the
  `ALLOWED_COMMANDS` pattern in `zmq-relay.ts:40-103`, own small set, not the ZMQ one) and
  forward verbatim to `mainWindow.webContents.send('panel:command', payload)`.
- App.tsx gains a `panel:command` listener (new `useEffect`, alongside the existing
  `menu:action` listener block) that switches on `type`:
  - `'undo'` → `useUndoStore.getState().undo()`
  - `'redo'` → `useUndoStore.getState().redo()`
  - `'freeze'` / `'unfreeze'` → calls a **new** `undoable()`-wrapped wrapper (OD-5), NOT
    `useFreezeStore.freezePrefix` directly — the wrapper does `freezePrefix(...)` inside the
    `undoable()` forward closure and `unfreezePrefix(...)`-equivalent (or cache restore) in the
    inverse, description `"Freeze <trackId>"` / `"Unfreeze <trackId>"`.
- **Never** call `useUndoStore`/`useFreezeStore` from the monitor window's own process — those
  Zustand instances are process-local and would silently no-op or diverge (this is the concrete
  mechanism behind the PRD's "single writer" rule, not just a principle).
- **`panel:mode`** (main → main renderer, `webContents.send`) — `{ panel: "system-monitor",
  mode: "docked" | "detached" }`, sent whenever WindowManager opens/closes/reattaches the OS
  window, so `App.tsx`'s docked overlay (§2.3) mounts/unmounts in lockstep — only one instance
  of the panel ever renders.

### 2.3 WindowManager surface (main process, `frontend/src/main/window-manager.ts`, new file)
```ts
export function openPanel(panelId: 'system-monitor'): BrowserWindow   // creates or focuses (HT-4 pattern)
export function closePanel(panelId: 'system-monitor'): void
export function reattachPanel(panelId: 'system-monitor'): void        // closes OS window, sends panel:mode docked
export function registerWindowManagerHandlers(): void                 // ipcMain.handle wiring, mirrors registerPopOutHandlers
```
- Registered in `frontend/src/main/index.ts` alongside the existing
  `registerPopOutHandlers()` call at `:241` (same `app.whenReady()` block).
- `openPanel` mirrors `createPopOutWindow`'s existing-window-focus guard
  (`pop-out-window.ts:119-123`, "HT-4") — one instance per panel, opening again focuses.
- CSP mirrors `pop-out-window.ts:194-205` (dev `'unsafe-inline'` script-src, else strict) —
  PLAY-009 requires this exactly, not approximately (the black-window bug was CSP + missing
  preload-time listener, both must be replicated).
- Preload-time listener replay: `preload/monitor.ts` must attach its `ipcRenderer.on(...)`
  listeners at module scope (before React mount), per PLAY-009's second half — frames/pushes
  sent between `loadURL` and mount are otherwise silently dropped.

### 2.4 `preload/monitor.ts` bridge surface (new, minimally-privileged — NOT the full `entropic` bridge)
```ts
contextBridge.exposeInMainWorld('entropicMonitor', {
  dispatch: (type: 'freeze'|'unfreeze'|'undo'|'redo', args?: unknown) =>
    ipcRenderer.invoke('panel:dispatch', { panel: 'system-monitor', type, args }),
  reattach: () => ipcRenderer.invoke('window-manager:reattach', 'system-monitor'),
  onEngineStatus: (cb: (s: EngineStatusPayload) => void) => { /* mirrors preload/index.ts:9-12 */ },
  getPerfStats: () => ipcRenderer.invoke('send-command', { cmd: 'get_perf_stats', id: crypto.randomUUID() }),
})
```
- `getPerfStats()` will fail cleanly today (`get_perf_stats` not yet in `ALLOWED_COMMANDS` — OD-2)
  — the stub panel must render a "stats unavailable" state on `{ ok: false }`, not crash. This
  IS the contract the real System Monitor v1 content swaps into later.
- Explicitly does **not** expose file dialogs, project I/O, or any of the ~20 other channels on
  `preload/index.ts`'s `entropic` bridge — least-privilege, same principle pop-out already
  applies (PLAY-001).

## 3. Packet candidates

| # | Packet | Files (verified) | Risk | Hard oracle |
|---|---|---|---|---|
| 1 | **WindowManager + monitor window shell** (OD-1, OD-4) | new: `frontend/src/main/window-manager.ts`, `frontend/src/main/window-bounds.ts` (extracted shared clamp util), `frontend/src/preload/monitor.ts`, `frontend/src/renderer/monitor.html`, `frontend/src/renderer/monitor-entry.tsx`, `frontend/src/renderer/components/monitor/SystemMonitorStub.tsx`; edits: `frontend/electron.vite.config.ts` (+2 rollupOptions entries), `frontend/src/main/index.ts` (register handlers, call site mirrors `:241`), `frontend/src/main/zmq-relay.ts` (FIFO-serialize `sendZmqCommand` per OD-4), `frontend/src/main/index.ts`/`pop-out-window.ts` (refactor to call the extracted `window-bounds.ts` util, behavior-preserving) | MED | open/close/reattach state machine unit-tested (Vitest, `frontend/src/__tests__/main/window-manager.test.ts` mirroring `pop-out-window.test.ts`'s shape); clamp-to-display unit test with a synthetic offscreen saved rect; CSP header byte-equal to pop-out's dev/prod branches; **new E2E** (`frontend/tests/e2e/multiwindow/`) opens the monitor window via `electronApp.waitForEvent('window')`, asserts exactly 2 windows exist, closes it, asserts 1 |
| 2 | **Command-forwarding contract + undo plumbing** (OD-5) | edits: `frontend/src/renderer/App.tsx` (+`panel:command` listener, + `case 'undo'`/`case 'redo'` if also wired through `menu:action` for symmetry — optional, not required by this packet), `frontend/src/main/index.ts` or a new `frontend/src/main/panel-bridge.ts` (`panel:dispatch` handler + allowlist), `frontend/src/renderer/stores/freeze.ts` OR a new thin wrapper module (do not remove the direct `sendCommand` path used by existing timeline/toast freeze buttons — only the monitor path routes through the new `undoable()` wrapper, per single-writer rule; existing surfaces keep working unchanged, which is itself a gap this packet documents but does not need to fix for ALL surfaces if out of scope) | HIGH | `panel:dispatch('freeze', ...)` produces exactly ONE `useUndoStore` entry with description `"Freeze <trackId>"`; a synthetic `panel:command('undo')` sent to the main renderer while the monitor window is focused reverses the freeze; Cmd+Z **inside the monitor window** (keydown captured by the monitor's own tiny key-listener, not `shortcutRegistry`) invokes `entropicMonitor.dispatch('undo')` and is asserted via E2E to affect the main window's undo stack, not a local no-op |
| 3 | **Attach/detach shell + menu entry** (OD-3) | edits: `frontend/src/renderer/App.tsx` (+`showSystemMonitor` state mirroring `showHistory` at `:380-381`/`:4099-4114`, +`panel:mode` listener to flip docked visibility), `frontend/src/main/menu.ts` (viewMenu +1 item, no accelerator per OD-3), new: `frontend/src/renderer/components/monitor/SystemMonitorPanel.tsx` (thin wrapper rendering `SystemMonitorStub` docked or a "Detach" button that calls `window.entropic.windowManager.open('system-monitor')` — a NEW small addition to `preload/index.ts`'s `entropic` bridge, invoke `window-manager:open`) | MED | mutual exclusivity: opening detached hides the docked instance (assert via DOM query in a Vitest component test with mock IPC — no live app needed); reattach (Esc inside the monitor window, or its own "Reattach" button) restores the docked instance and closes the OS window; relaunch with `panel-windows.json` `mode:"detached"` restores detached (E2E, `frontend/tests/e2e/multiwindow/`) |
| 4 | **Cmd+W / focus-routing verification** (no code assumed — verification packet) | no new source files; adds `frontend/tests/e2e/multiwindow/focus-routing.spec.ts` | LOW (verification-only) unless it uncovers a real Cmd+W routing bug against `role:'windowMenu'`'s default Close item always targeting `mainWindow`, in which case this packet gains a small `menu.ts` fix (scope grows, flag before merge) | E2E: focus the monitor window, press Cmd+W, assert the monitor window closes and the main window remains open and unaffected; focus main, press Cmd+W, assert main's own close-confirmation flow (`index.ts:174-194`) still fires unchanged |

**Sequencing:** 1 → 2 → 3 → 4 (each depends on the previous window/contract existing). Packet 1
is the only one that touches `zmq-relay.ts`'s shared-socket serialization (OD-4) — land and full-suite-green it before Packet 1's own monitor poll loop starts polling in a follow-up change, per this repo's `UD-3` house convention (merge gate = STRICT FULL-TIER, no packet merges on smoke-green alone — `docs/plans/2026-07-field-mapping/MARATHON-BRIEF-wave0-AMENDED.md` line 14).

## 4. House landmines — how each applies here

- **Curve+unit metadata on every new numeric param:** N/A — this change adds no `ParamDef`
  numeric params (window bounds are Electron API integers, not effect-chain params).
- **Explicit-import effect registry:** N/A — no effects added.
- **Alpha never crosses JPEG preview transport:** N/A — Stage A carries no MJPEG frames (that's
  Stage C's "second consumer stream," explicitly out of scope).
- **cv2/C-contiguous/float-hoisted for field/pixel work:** N/A — no pixel work in this change.
- **History Ledger row for every new user-visible op:** applies directly to the freeze-from-monitor
  affordance (OD-5, Packet 2) — the ONE piece of this change that touches user-visible state.
  Opening/closing/detaching a window is UI chrome, not a Ledger-worthy op (same precedent as
  `toggle-sidebar`/`toggle-focus`, which are not undoable either).
- **preview==export parity via single-clip path:** N/A — no render-path change.
- **Additive schema, no PROJECT_VERSION bump:** `panel-windows.json` is a brand-new file, not
  part of the project schema — no version coupling. `panel:command`/`panel:dispatch` are new IPC
  channels, not wire-schema fields on any persisted document.

## 5. Test Plan

### Unit (Vitest, mock IPC — `frontend/src/__tests__/main/`)
- `window-manager.test.ts`: open (creates), open-again (focuses existing, no second window),
  close (destroys, clears ref), reattach (closes OS window + fires `panel:mode` docked), clamp-to-
  display with a synthetic saved rect fully offscreen → falls back to centered default (mirrors
  `pop-out-window.test.ts`'s existing bounds-validation test shape).
- `window-bounds.test.ts` (new, for the extracted shared util): identical assertions as the two
  pre-existing inline validators it replaces, run against BOTH call sites' minimum sizes (400×300
  for main, 200×150 for pop-out, and Stage A's own monitor minimum) to prove the extraction is
  behavior-preserving.
- `panel-bridge.test.ts`: `panel:dispatch` allowlist rejects unknown `panel`/`type` values
  (mirrors the `ALLOWED_COMMANDS` rejection shape at `zmq-relay.ts:267-271`).

### Component (Vitest + mock IPC — `frontend/src/__tests__/components/`)
- `SystemMonitorPanel` docked/detached mutual exclusivity: mount App-level state with
  `showSystemMonitor: true` + a `panel:mode` event of `{mode:'detached'}` → assert the docked
  DOM node unmounts; the reverse event remounts it. Mirrors the existing
  `pop-out-preview-heartbeat.test.tsx` pattern for a push-driven UI state test.
- `SystemMonitorStub` renders "stats unavailable" on `getPerfStats()` resolving `{ok:false}`
  (OD-2's contract) without throwing.
- Freeze-forwarding: `entropicMonitor.dispatch('freeze', {trackId})` mock → assert exactly one
  `useUndoStore` entry pushed with the expected description string (OD-5).

### Backend (pytest) — none required by this change (no backend files touched; `get_perf_stats`
is explicitly out of scope per OD-2). If OD-2 is overridden and the command is added here
instead, add `test_get_perf_stats_shape` mirroring the System Monitor PRD §7's stated test list.

### E2E (Playwright `_electron`, new `frontend/tests/e2e/multiwindow/`)
Extend `frontend/tests/e2e/fixtures/electron-app.fixture.ts` with a `secondWindow` fixture using
`electronApp.waitForEvent('window')` (not currently exposed — the fixture today only provides
`firstWindow()`).
- **BDD-style scenarios** (drawn from the source PRD §3's own test bullets):
  1. *Detach the monitor → freeze from the window → verify main-window timeline reflects it.*
     Given the main window is open and a track exists, when the user detaches the System Monitor
     and clicks Freeze on a row, then the main window's timeline shows the frozen-track indicator
     and Edit ▸ Undo History (or `Cmd+Z`) reverses it.
  2. *Reattach restores docked mode.* Given the monitor is detached, when the user presses Esc
     inside it (or clicks Reattach), then the OS window closes and the docked panel reappears
     in-app.
  3. *Relaunch restores layout.* Given the monitor was left detached with a specific position at
     quit, when the app relaunches, then the monitor reopens detached at that position (or
     clamped-on-screen if the saved display is gone — simulate via a hand-edited
     `panel-windows.json` with an out-of-range `x`).
  4. *Cmd+W closes only the panel.* Focus monitor → Cmd+W → monitor closes, main survives
     (Packet 4's verification target — see §1 table row on `role:'windowMenu'` uncertainty).
  5. *Sidecar restart does not orphan the monitor window.* Kill/restart the Python sidecar (reuse
     the existing watchdog-restart test harness if one exists for the main window; if none exists,
     this scenario is scoped to "monitor window survives and its next `getPerfStats()`/`ping`
     succeeds post-restart," not a full watchdog E2E rebuild).
- Manual matrix (not automatable in this environment): 2-display arrangement, display unplug
  mid-session, fullscreen main + detached monitor on second display, sleep/wake — flag these in
  the PR description as **human spot-check required**, per the source PRD §3's own manual-matrix
  line; do not claim automated coverage for them.

## 6. Rollback
Additive throughout: new files, two new IPC channels, one new persisted JSON file, one menu
item. Killing the feature = don't call `registerWindowManagerHandlers()` from `index.ts`, remove
the menu item; `panel-windows.json` sits inert on disk. No schema version bump, no migration.
