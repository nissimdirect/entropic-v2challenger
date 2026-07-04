# Change: multiwindow-stage-a

> Source: `~/.claude/plans/creatrix-multiwindow-prd.md` §Stage A ONLY (Stages B/C are
> explicit non-goals per the calling brief). Cross-referenced against
> `~/.claude/plans/creatrix-system-monitor-prd.md` (the panel this change hosts) and
> `~/.claude/plans/creatrix-layertap-routing-prd.md` §10.1 (Cmd+Z forwarding rule).
> Code-grounded against `docs/plans/2026-07-field-mapping/UNIFICATION-2026-07-03.md`
> §2/§3 register and a fresh repo read (2026-07-03, no branch — greenfield for this
> capability: zero existing hits for `WindowManager`, `system-monitor`, `SystemMonitor`,
> `get_perf_stats` anywhere in `frontend/src` or `backend/src`).

## Open Decisions

### OD-1 · Per-window bundle strategy: separate Vite entry vs. `?panel=` route in the main bundle
The source PRD says: *"The window loads the same renderer bundle with `?panel=system-monitor`
route — one build, per-window entry."* The only existing precedent in this repo for a second
`BrowserWindow` (the pop-out preview) does the **opposite**: a fully separate Vite entry —
`frontend/src/preload/pop-out.ts` + `frontend/src/renderer/pop-out.html` +
`frontend/src/renderer/pop-out-entry.tsx`, wired as their own `rollupOptions.input` keys in
`frontend/electron.vite.config.ts:14-29` (main renderer entry is `frontend/src/renderer/index.html`,
4492 lines of `App.tsx` behind it — a route-flag inside that monolith is not "cheap").
- **Recommended default: follow the pop-out precedent** — `frontend/src/preload/monitor.ts`,
  `frontend/src/renderer/monitor.html`, `frontend/src/renderer/monitor-entry.tsx`, two new
  `rollupOptions.input` keys (`preload.monitor`, `renderer.monitor`) mirroring the existing
  `pop-out` keys line-for-line. Zero risk of App.tsx route-flag regressions, proven pattern,
  same team already debugged its lifecycle (PLAY-009).
- Reject-if: a future Stage C actually needs the full renderer's Zustand stores in-process —
  at that point the state-bridge PRD (§1C) supersedes this anyway, so it doesn't cost anything
  to diverge from the PRD's literal text now.

### OD-2 · System Monitor content (`get_perf_stats` + Activity-Monitor table) is a separate,
sequenced prerequisite, not part of this change
`~/.claude/plans/creatrix-routing-suite-INDEX.md` "Build order" lists **item 5 — System Monitor
v1** (`get_perf_stats` IPC + panel + statusbar meters + slow-frame logging) *before* **item 6 —
Multiwindow Stage A**, as two separate, sequential build items. Code confirms neither exists yet:
zero grep hits for `get_perf_stats` in `backend/src/zmq_server.py` or `SystemMonitor`/`get_perf_stats`
anywhere in `frontend/src`. `get_perf_stats` is also absent from `ALLOWED_COMMANDS` in
`frontend/src/main/zmq-relay.ts:40-103` (the enforced allowlist a new IPC command must join,
per the contract test noted at `zmq-relay.ts:37-38`).
- **Recommended default:** this change builds ONLY the window-mechanics (WindowManager,
  attach/detach, dock/undock UI shell, hotkey/menu entry, undo/freeze forwarding contract).
  It targets a `<SystemMonitorPanel/>` component by a fixed import path/props contract (see
  plan.md) that **may be a minimal stub** (header + connection status, see plan.md's
  `engine-status` reuse) if the System Monitor v1 change hasn't landed yet when this one ships.
  Swapping the stub for the real Activity-Monitor table is then a zero-rework, additive change.
  For its own oracle, this change uses an **already-allowlisted** fire-and-forget command
  (`freeze_prefix`) to prove the round-trip, not `get_perf_stats`.
- Reject-if: the user wants System Monitor v1 and Stage A shipped as one PR — then this
  proposal's non-goals list below shrinks to include the backend IPC command, and Packet count
  grows; flag before packetize if so.

### OD-3 · Proposed hotkey collides with a shipped binding — no new global hotkey in this change
The source PRD/System-Monitor-PRD proposes `Cmd+Shift+A` to open the monitor. That combo is
**already bound**: `frontend/src/renderer/utils/default-shortcuts.ts:86` —
`{ action: 'mask_deselect_all', keys: 'meta+shift+a', ... }` (MK.4, shipped). Separately,
`meta+shift+m` is reserved system-wide for "New MIDI Track" (LayerTap PRD banked decision 19)
and must not be reused either.
- **Recommended default:** ship Stage A with a **View ▸ System Monitor** menu entry only
  (`frontend/src/main/menu.ts` `viewMenu.submenu`, following the existing `sendAction(mainWindow,
  '<action>')` pattern at menu.ts:122-133) and **no accelerator label** for now. Hotkey
  allocation is cosmetic UI wiring that belongs with System Monitor v1's own menu placement
  (OD-2) — don't spend Stage A's scope negotiating a free combo. Statusbar-meter-click-to-open
  (System Monitor PRD §4) is also deferred with OD-2's stub/real swap.

### OD-4 · Shared persistent ZMQ REQ socket has no visible request queue — a second poller is a new hazard class
`frontend/src/main/zmq-relay.ts:159-167` (`getOrCreateSocket`) and `:169-215`
(`sendZmqCommand`) use **one shared, persistent `zeromq.Request` socket** for every
`send-command` IPC call from every window, with no queue/mutex found anywhere in
`frontend/src/main` (grepped: no hits for `queue`, `mutex`, `pending`, `inFlight` besides the
unrelated `setRenderInFlight` render-in-flight flag). REQ sockets require strict
send→receive alternation; this repo cannot be run as part of this planning task, so whether the
`zeromq` npm binding already serializes concurrent `.send()` calls internally could not be
verified. Stage A is the **first** consumer that adds an independent poller (2 Hz) running
concurrently with the main window's existing render/audio/clock IPC traffic on the same
process — a plausible new race, not a hypothetical one.
- **Recommended default:** treat this as a REQUIRED Packet 1 hardening item, not an assumption:
  wrap `sendZmqCommand` calls behind an explicit FIFO promise chain in `zmq-relay.ts` (defense in
  depth) before the monitor's poll loop starts. Cheap, additive, and de-risks Stage A's headline
  oracle (the 2 Hz poll must not corrupt or stall the main window's frame pipeline).
- Reject-if: a spike in a real running session confirms `zeromq`'s `Request` class already
  queues internally (some async ZMQ bindings do) — then this becomes a no-op verification step,
  not a code change. Either way, verify before believing "it's fine."

### OD-5 · Freeze-from-monitor needs new undo plumbing that does not exist today — this is a build item, not a given
LayerTap PRD §10.1 states freeze "from ANY surface... = the same undoable command... one undo
entry" as if this already holds. It does not: `frontend/src/renderer/stores/freeze.ts`
(`freezePrefix`/`unfreezePrefix`) calls `sendCommand()` directly and **never imports or calls
`useUndoStore`/`undoable()`** — freezing today creates zero History Ledger rows in any surface.
Per this repo's own house landmine ("History Ledger row + specific `undoable()` description for
every new user-visible op"), a monitor-row freeze button is a **new** user-visible op surface and
cannot ship without closing this gap.
- **Recommended default:** if Stage A's stub panel (OD-2) includes a freeze affordance at all,
  wrap it during this change: freeze/unfreeze become `undoable()`-described actions (e.g.
  `"Freeze <track>"`) called from the **main renderer only** (single-writer rule), reached from
  the monitor window via the `panel:command` → `panel:dispatch` contract in plan.md — never a
  direct `sendCommand` from the monitor's own process. If OD-2 resolves to "stats-only stub, no
  freeze button yet," this item moves to System Monitor v1's own change instead.

## Why
The multiwindow PRD stages OS-window support behind the System Monitor because its data shape
(2 Hz poll, fire-and-forget commands) is the cheapest possible proof of the window-mechanics:
`WindowManager` open/close/reattach, per-panel layout persistence clamped to available displays,
and the attach↔detach UX — **without** touching the 8-Zustand-store state bridge that Stage C
requires. Shipping the mechanics against the lightest possible panel de-risks the plumbing before
any heavier panel (preview/matrix/timeline, Stage C) depends on it.

## What Changes
- A new **WindowManager** (main process) that can open/close/reattach a named panel as a real
  `BrowserWindow`, persist its bounds+display per panel (clamped to available displays on
  restore — a saved position on an unplugged monitor snaps back on-screen), and enforce
  one-instance-per-panel (opening again focuses the existing window — mirrors the pop-out's
  existing `createPopOutWindow` HT-4 guard).
- A new, minimally-privileged preload (`preload/monitor.ts`) and renderer entry
  (`renderer/monitor-entry.tsx`) for the System Monitor window, following the pop-out precedent
  (contextIsolation on, nodeIntegration off, sandboxed) — see OD-1.
- An **attach/detach contract**: the System Monitor renders identically whether docked in-app
  (a simple boolean-toggle overlay, following the existing `showHistory`/`HistoryPanel` pattern
  at `App.tsx:380-381` / `:4099-4114` — Stage B's generic panel registry is explicitly NOT built
  here) or as its own OS window; only one instance renders at a time.
- A **command-forwarding contract** (`panel:dispatch` → `panel:command`, defined in plan.md)
  so panel-window actions (freeze, undo/redo) execute in the main renderer — the single writer
  — never split-brained across processes. Cmd+Z inside the monitor window forwards to the main
  window's `useUndoStore` (LayerTap PRD §10.1); panel-local keys (Esc = reattach) never leak to
  main.
- Menu entry: View ▸ System Monitor (see OD-3 on the hotkey).

## Non-Goals (hard scope boundary — Stages B/C of the source PRD)
- **Stage B** — the generic in-app floating panel registry (inspector, matrix, browser…). Not
  built here; the attach/detach shell above is Stage-A-local and does not generalize.
- **Stage C** — the Zustand store-slice IPC bridge (`store:subscribe`/`store:dispatch`), a second
  MJPEG preview consumer, or any panel that reads/writes the 8 renderer stores directly.
- The `get_perf_stats` backend IPC command and the Activity-Monitor table UI itself — see OD-2.
  This change may ship with a stub panel; the real content is System Monitor v1's scope.
- Statusbar CPU/RAM meter chips (System Monitor PRD §4/§26) — depends on OD-2's content.
- The Performer/program-out window and any other item in the multiwindow PRD's §8 "pop-out
  catalog" — those are separate future changes that reuse this change's WindowManager.
- Cross-window drag-and-drop (multiwindow PRD §7 explicitly rules this out for v1 anyway).
- Any fix to the pre-existing `writeFileSync`-without-atomic-rename pattern in
  `frontend/src/main/index.ts`/`pop-out-window.ts` window-state persistence — out of scope to
  touch existing files' persistence style; the NEW `panel-windows.json` this change adds uses
  the atomic write pattern per PLAY-007 (see plan.md) without back-porting it to the two
  existing files.


## T1 Verdicts (LOCKED 2026-07-03, /marathon chunked T1 — do not re-open)
All Open Decisions above: **defaults ACCEPTED as written** (user: "Accept all 33 defaults"). Hotkey ODs additionally governed by the global verdict: menu-entry-only now, accelerator picked at build/UAT. Clarification: accelerator assignment is deferred to the separate system-monitor-v1 change (its own execution/UAT phase) — no packet in THIS change carries a hotkey decision point.
