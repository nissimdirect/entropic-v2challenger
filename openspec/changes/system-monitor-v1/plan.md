# Plan — system-monitor-v1

Consolidated for a cold packetizer. All file:line citations were verified against the live tree
during this planning pass (2026-07-03) — see "Code-ground verification" per packet. Do not
re-derive scope from the source PRDs without reading this file's Open Decisions first; the PRDs
contain two stale claims (the "95% assembled" timing claim and the "same undoable command"
freeze claim) that this plan corrects.

## Sequencing (binding)

**1 → 2**, with **3 and 4 parallel to 1/2** (disjoint files). **5 depends on 1 AND 4** (needs
`get_perf_stats`'s per-instance shape and the undoable freeze wrapper before the panel can freeze
rows correctly and log them). **6 depends on 5** (reuses 5's React component verbatim in a new
`BrowserWindow`).

```
1 (backend timing scope + get_perf_stats) ──┐
2 (backend perf logging)  ───────────────────┼──► 5 (Monitor panel, docked) ──► 6 (OS window)
3 (statusbar meters)  ────────────────────────┘        ▲
4 (Ledger fix for freeze/unfreeze) ────────────────────┘
```

**Merge gate:** backend `pytest -x -n auto` (full tier, `perf` marker stays deselected per
`pyproject.toml:39` — this change adds no perf-tier tests, only unit tests over `get_perf_stats`
shape and timing-scope correctness) + frontend `npx --no vitest run` + the
`relay-allowlist.test.ts` contract test (bidirectional: renderer→`ALLOWED_COMMANDS` AND
backend-handler→{`ALLOWED_COMMANDS` ∪ `BACKEND_ONLY_COMMANDS`}) + `tsc -b` clean. Packet 6 additionally
needs a Playwright `_electron` smoke opening the new window (justification below).

---

## Packet 1 — Backend: per-instance timing scope + `get_perf_stats` IPC command

| Field | Value |
|---|---|
| Risk | MED |
| Files | `backend/src/engine/pipeline.py` (`record_timing` signature + 3 call sites `:424,468,496`; `apply_chain` gains optional `timing_scope` kwarg); `backend/src/zmq_server.py` (new `elif cmd == "get_perf_stats":` arm near the existing `elif cmd == "effect_stats":` at `:526`; `_handle_render_composite`'s layer loop `:1407-1473` passes `layer_id` as `timing_scope` into its `apply_chain` call); `frontend/src/main/zmq-relay.ts` (`ALLOWED_COMMANDS` entry, `:40` block, alongside the existing `'effect_stats'` line) |
| Hard oracle | New backend unit test: build a fake composite render with two layers both running the same effect TYPE, assert `get_perf_stats()['effects']` returns 2 distinct entries (not 1, not merged) with a `track`/`scope` field distinguishing them. `relay-allowlist.test.ts` green (new command reachable both directions). `pytest -x -n auto` full tier green — the default-`None` scope path must produce byte-identical `_effect_timing` keys to today for the single-clip preview path (regression: existing `test_effect_harness.py` and any test asserting on `_effect_timing`/`get_effect_stats()` key shape must still pass unmodified). |

**Code-ground verification:** `_effect_timing: dict[str, deque]` is a **module-level global**
(`pipeline.py:56`, `defaultdict(lambda: deque(maxlen=100))`), keyed by `effect_id` which is read
from `effect_instance.get("effect_id")` (`pipeline.py:314`) — the effect TYPE string, confirmed by
reading the full `apply_chain` loop (`pipeline.py:309-519`). Three call sites append timing:
banded path `:424`, field-codegen path `:468`, standard path `:496` — all three need the same
`timing_scope`-aware key composition, since any one effect entry can route through any of the
three paths per-frame depending on its param shape (banded vs. pointwise-codegen vs. plain).
`get_effect_stats()` (`pipeline.py:100-112`) iterates `_effect_timing.items()` and returns
p50/p95/max/drop_rate — this function is REUSED unchanged by `get_perf_stats`, it does not need to
know about scoping, only the dict's keys change shape.

`effect_stats` command (`zmq_server.py:526`, `return {"id": msg_id, "ok": True, "stats":
get_effect_stats()}`) is **already shipped and already allowlisted** (`zmq-relay.ts` `'effect_health',
'effect_stats'` on the Playback/Info line) with **zero frontend consumers** (confirmed:
`grep -rl effect_stats frontend/src/renderer` matches only `__tests__/contracts/*` allowlist
files). `get_perf_stats` is a NEW, separate command (not a rename) that additionally assembles
`frame` (from `self.last_frame_ms`, already tracked at `zmq_server.py:946` inside
`_handle_render_frame`), `memory`/`caches` (from the existing `_handle_pressure_status`
`:3297-...` and `masking/matte_source.py:91` `cache_stats()` / `effects/field_source.py:420`
`cache_stats()`), and `groups` (aggregated from the per-instance `effects[]` rows — no separate
collection needed, pure aggregation in the handler). `effect_stats`/`effect_health` are left
shipped and untouched (additive; no removal, no behavior change to existing callers).

`_handle_render_composite` (`zmq_server.py:1407`) already iterates `raw_layers`, each carrying a
`layer_id` computed per-layer (`:1470` for group layers: `f"group:{grp_id}"`; non-group layers
carry their own id from the layer_info dict) BEFORE calling `apply_chain` for that layer's chain —
this is the scope value Packet 1 threads through. This does **not** depend on
`wave0-prerouted-presets`' D-1 (instance-UUID end-to-end route addressing,
`frontend/src/shared/ipc-serialize.ts:45`, `SerializedEffectInstance` has **no** instance-UUID
field at all) — Packet 1 scopes by `layer_id` (already on the wire, always present, unrelated to
the routing-mapping instance-addressing question D-1 is about) plus chain position `i`, not by any
new instance-UUID scheme. `frame.budget_ms`: no `33ms`/`FRAME_BUDGET_MS` constant exists anywhere
in the codebase (confirmed: zero hits for `33\.3|budget_ms|FRAME_BUDGET|PREVIEW_FPS` across
`backend/src`); compute `budget_ms = 1000.0 / project_fps` from the project's actual fps (already
known to the sidecar via the existing `clock_set_fps` command) rather than hardcoding an
assumed-30fps constant that can drift from the real project.

---

## Packet 2 — Backend: performance logging (slow-frame WARN, session summary, crash enrichment)

| Field | Value |
|---|---|
| Risk | LOW-MED |
| Files | `backend/src/engine/pipeline.py` or a new small module it calls into (slow-frame check, using the existing `EFFECT_WARN_MS`/`EFFECT_ABORT_MS` constants at `:44-45` as the pattern, NOT reusing those constants themselves — those are per-effect, this is per-frame); `backend/src/diagnostics.py` (`crash_data` dict, `:164-175`, gains `last_frames` key fed from a small ring buffer); shutdown hook (wherever `flush_timing()` `pipeline.py:115-117` is currently called — the session-summary log line goes right before that flush) |
| Hard oracle | Unit test: feed N consecutive over-budget frames within a simulated 1-second window, assert exactly 1 `slow_frame` JSON log line emitted (not N) — mirrors the existing toast-dedup pattern's rate-limit test shape (project CLAUDE.md "Toast Conventions": 2s dedup by source). Unit test: crash-report JSON (via `setup_excepthook`'s testable inner function) includes a `last_frames` array of ≤30 entries when the ring buffer has data. |

**Code-ground verification:** `backend/src/diagnostics.py:136-198` (`setup_excepthook` /
`_crash_excepthook`) builds `crash_data` as a plain dict (`:164-175`: `timestamp`,
`exception_type`, `exception_message`, `traceback`, `python_version`, `platform`,
`memory_usage_mb`, `last_command`) then PII-strips it (`:177-192`) and writes it with restricted
permissions (`:194-198`, `os.umask(0o077)`). Adding `last_frames`/top-offenders means importing a
small frame-timing ring buffer module from here — this is a NEW cross-module import
(`diagnostics.py` currently imports nothing from `engine.pipeline`); keep the ring buffer in its
own tiny module (not inside `pipeline.py`, to avoid a diagnostics→engine circular-import risk) so
both `pipeline.py` (writer) and `diagnostics.py` (reader, on crash) can import it independently.
No existing "session perf summary on shutdown" hook exists — confirmed no such log line anywhere
in `pipeline.py` or `zmq_server.py`'s shutdown path (`elif cmd == "shutdown":` `zmq_server.py:388`
is a `sys.exit` fired from the main-process side, not a natural place for a clean-shutdown log —
verify at execution time whether Python gets a clean-exit hook at all before this line runs, or
whether the summary must instead piggyback on `flush_timing()`'s callers, which fire on project
unload, not process exit — these are DIFFERENT events; scope this packet to "on project
unload/flush_timing" summary, not "on process exit," since the latter may not have a reliable hook).

---

## Packet 3 — Frontend: statusbar Ableton-clone meters (decision 26)

| Field | Value |
|---|---|
| Risk | LOW |
| Files | New component (e.g. `frontend/src/renderer/components/statusbar/SystemMeters.tsx`, avoiding the `components/performance/` directory name — that path is ALREADY the perform-mode pads/MIDI surface, confirmed live: `frontend/src/renderer/components/performance/{applyBankModulations.ts,PadCell.tsx,...}` — naming collision the source PRD explicitly flags and this plan avoids); `frontend/src/renderer/components/statusbar/MemoryStatus.tsx` (behavior change: currently `if (level === 'ok') return null` at `:21` — decision 26 wants an ALWAYS-visible RAM meter, so this conditional either moves into `SystemMeters` or `MemoryStatus` itself drops the early-return for the meter-cluster form while keeping degrade-badge behavior elsewhere if still needed); `frontend/src/renderer/App.tsx:93,4481` (mount site) |
| Hard oracle | Vitest component test (mirrors `frontend/src/__tests__/components/statusbar/memory-status.test.tsx` naming/pattern) with mock IPC (`window.entropic.sendCommand` stub): CPU meter renders a percentage number ON the bar element (not beside it); RAM meter is visible even when `level === 'ok'` (regression-checks the always-visible requirement against today's conditional); clicking either meter calls the Monitor-open handler with the correct tab argument (`'cpu' \| 'memory' \| 'caches'`). |

**Code-ground verification:** `MemoryStatus` is mounted unconditionally at `App.tsx:4481`
(imported `:93`) and polled by `useMemoryPressurePoll` (`frontend/src/renderer/hooks/
useMemoryPressurePoll.ts`) at a hardcoded 1 Hz (`PRESSURE_POLL_INTERVAL_MS = 1000`, `:18`) for the
app's entire lifetime (`useEffect(..., [])`, unconditional). This poll is INDEPENDENT of the
Monitor's own 2 Hz `get_perf_stats` poll (Packet 5) — the statusbar cluster keeps its existing 1 Hz
`pressure_status` poll (cheap, already running); the Monitor panel's 2 Hz `get_perf_stats` poll
only runs while the panel/window is open. Do not merge these two polls into one cadence — they
have different consumers and different lifetimes.

---

## Packet 4 — Frontend: History Ledger for freeze/unfreeze (OD-4)

| Field | Value |
|---|---|
| Risk | LOW-MED |
| Files | `frontend/src/renderer/App.tsx:2427-2468` (`handleFreezeUpTo`, `handleUnfreeze`); `frontend/src/renderer/stores/undo.ts` (`undoable()`, `:206`) |
| Hard oracle | Existing freeze regression suite stays green unmodified in assertions about freeze/unfreeze BEHAVIOR (`__tests__/epic03-freeze-pertrack.test.ts`, `__tests__/b10-performance-freeze-fsm.test.ts`, `__tests__/stores/freeze.test.ts`, `__tests__/components/freeze-ui.test.ts`) PLUS a new assertion in one of them: after `handleFreezeUpTo`/`handleUnfreeze`, `useUndoStore.getState().past` gains exactly one entry with a non-generic description (e.g. `"Freeze <trackLabel> up to <cutIndex>"`, not bare `"Freeze"`) — per the Ledger-lint convention (non-empty, non-generic `undoable()` descriptions). |

**Code-ground verification:** `handleFreezeUpTo`/`handleUnfreeze` (`App.tsx:2427-2468`) call
`useFreezeStore.getState().freezePrefix(...)`/`unfreezePrefix(trackId)` directly — no `undoable()`
call anywhere in that block (confirmed by reading the full 42-line span). `stores/freeze.ts:47-91`
(`freezePrefix`/`unfreezePrefix`) are plain async Zustand actions with an `operationState` FSM
guard (`idle`/`freezing`/`unfreezing`/`flattening`) but no undo-stack interaction. Wrap at the
`App.tsx` call site (not inside `freeze.ts`) so the FSM guard and the IPC round-trip stay exactly
as they are — `undoable()`'s forward/inverse closures should call the SAME store actions
(`freezePrefix(...)` forward, `unfreezePrefix(trackId)` inverse, and vice versa for the unfreeze
case) rather than re-implementing freeze/unfreeze logic inline in the closures (PLAY-003: closures
capture IDs, never indices — `trackId` is already an ID, safe to capture directly).

---

## Packet 5 — Frontend: System Monitor panel (docked)

| Field | Value |
|---|---|
| Risk | MED-HIGH |
| Files | New component tree, e.g. `frontend/src/renderer/components/system-monitor/SystemMonitorPanel.tsx` (table) + supporting files; `frontend/src/renderer/stores/layout.ts` (new `monitorPanelW`-style slot per OD-3, following the exact `clampFinite` + `persistCreatrixLayout` pattern the four existing sizes use, e.g. `inspectorH` `:68,92,136-137,185,276-278`); `frontend/src/main/menu.ts:121-134` (View submenu, new item, NO `accelerator` field per this file's own convention — `:18-19` comment: "Renderer owns all keyboard dispatch"); `frontend/src/renderer/utils/default-shortcuts.ts` (new binding per OD-2's resolved key, NOT `meta+shift+a`) |
| Hard oracle | Vitest: table sorts by any column, defaults to "% of budget desc" (offenders on top); groups aggregate member rows (sum ms, max latency) per the routing PRD's group-bus rule; freeze button on a row dispatches the Packet-4-wrapped undoable freeze command with mock IPC; docked-slot width persists across a simulated reload (localStorage round-trip) mirroring the existing `layout.ts` persistence tests. |

**Code-ground verification:** No generic panel-slot registry exists in `layout.ts` — it holds
exactly four named sizes (`leftColW`, `inspectorH`, `previewHPct`, `deviceChainH`; interface at
`:16-...`, persisted shape at `:82-92`). This packet adds a FIFTH named size, not a registry (OD-3
recommended default). `useEngineStore` (`frontend/src/renderer/stores/engine.ts`) is the existing
"heartbeat store" (`status: 'connected' | 'disconnected' | 'restarting'`, fed by
`window.entropic.onEngineStatus` `:41-44`) — the panel's "reconnecting…" state (source PRD §8)
reads THIS store, not a new one; when `status !== 'connected'`, the 2 Hz `get_perf_stats` poll
pauses and the panel shows the existing disconnected affordance rather than stale numbers.
`View` menu items in `menu.ts` intentionally omit Electron's `accelerator` field (confirmed
pattern across all 20+ existing items) — the tab-separated label suffix (e.g. `'\tCmdOrCtrl+B'`)
is DISPLAY ONLY; the actual key handling lives in `default-shortcuts.ts` + the renderer's shortcut
dispatcher, consistent with OD-2's fix living in that file, not in `menu.ts`.

---

## Packet 6 — Electron: System Monitor as a TRUE OS window (decision 28)

| Field | Value |
|---|---|
| Risk | MED |
| Files | New `frontend/src/main/system-monitor-window.ts` (mirrors `pop-out-window.ts` structure: bounds persistence to `~/.creatrix/system-monitor-state.json`, CSP mirroring, `will-navigate` prevention, `closed` handler); new `frontend/src/renderer/system-monitor.html` + `system-monitor-entry.tsx` (mirrors `pop-out.html`/`pop-out-entry.tsx`, mounts `SystemMonitorPanel` from Packet 5 — same component, no duplication); `frontend/electron.vite.config.ts:15-18,26-29` (new `preload`/`renderer` rollup `input` entries — **preload entry is NOT needed**, see below); `frontend/src/main/menu.ts` View item wires to open this window (or dock, per user toggle) |
| Hard oracle | Electron main-process test verifying the window-creation function sets CSP headers identically to `pop-out-window.ts`'s dev/prod branch (`isDev` check, `:196-197`) and reuses `preload/index.ts` (asserted via the `webPreferences.preload` path in the `BrowserWindow` constructor call, not `preload/pop-out.js`). Playwright `_electron` E2E: open the app, trigger the menu action, assert a second `BrowserWindow` exists AND a `get_perf_stats` round-trip succeeds from within it (justifies the Playwright layer — this is genuine OS-window/process-lifecycle surface, not logic or component interaction; per Gate 5's test-layer-selection rule). |

**Code-ground verification (the key finding of this packet):** only TWO `BrowserWindow`s exist in
the entire codebase today — `frontend/src/main/index.ts:145` (main window) and
`frontend/src/main/pop-out-window.ts:132` (preview pop-out). The pop-out's preload
(`frontend/src/preload/pop-out.ts`) is **deliberately read-only** — its own header comment says
"RT-1: READ-ONLY preload — exposes ONLY frame updates, close signal, and ping. MUST NOT expose
`ipcRenderer.invoke()` or `ipcRenderer.send()`." The Monitor needs BIDIRECTIONAL IPC (2 Hz
`get_perf_stats` poll via `invoke`, fire-and-forget freeze via `invoke`) — RT-1 forbids building
that onto the pop-out precedent. **However**, the main preload's `sendCommand`
(`frontend/src/preload/index.ts:15-17`, `ipcRenderer.invoke('send-command', command)`) is backed
by a GLOBAL `ipcMain.handle('send-command', ...)` registration (`frontend/src/main/zmq-relay.ts:267`)
— NOT scoped to the main `BrowserWindow` instance. Any window loaded with `preload/index.ts` gets
working `window.entropic.sendCommand` for free. **This means Packet 6 does NOT need a new preload
file** — reuse `preload/index.ts` verbatim for the Monitor window's `webPreferences.preload`, which
is cheaper than the source PRD's "fraction of the generic case" framing already assumed (no new
preload surface at all, vs. pop-out's bespoke restricted one). Bounds persistence, CSP mirroring
(`PLAY-009`: "Every new `BrowserWindow` must mirror `src/main/index.ts`'s dev-aware CSP... if it
receives push messages from main via `webContents.send`, the preload MUST attach the
`ipcRenderer.on` listener at preload time") — the Monitor window does NOT receive pushed frames
(it polls, per the source PRD's explicit "2 Hz poll, never pushed" design), so the PLAY-009
preload-cache-and-replay requirement does not apply here; only the CSP-mirroring half of PLAY-009
binds. `electron.vite.config.ts`'s `preload.build.rollupOptions.input` (`:15-18`) does NOT need a
new entry (Packet 6 reuses `index` preload); only `renderer.build.rollupOptions.input` (`:26-29`)
needs the new `system-monitor` HTML entry.

---

## Test Plan

### Backend (pytest, `backend/tests/`)
- **Unit — timing scope (Packet 1):** two-layer composite render, same effect TYPE on both layers
  → `get_effect_stats()`-equivalent internal dict has 2 keys, not 1; single-clip preview path
  (no `timing_scope` passed) → byte-identical keys to pre-change behavior (regression guard).
- **Unit — `get_perf_stats` shape (Packet 1):** response matches
  `{frame: {last_ms, avg_ms, budget_ms, fps}, effects: [...], groups: [...], memory: {...},
  caches: {...}}`; `budget_ms` reflects the actual project fps, not a hardcoded 33.
- **Unit — slow-frame rate limit (Packet 2):** N over-budget frames in <1s → exactly 1 log line.
- **Unit — crash enrichment (Packet 2):** `crash_data` (via the testable inner excepthook function)
  includes `last_frames` (≤30 entries) when timing data exists, omits/empties gracefully when not.
- Existing suite unaffected: `test_effect_harness.py` and anything asserting on `_effect_timing`/
  `get_effect_stats()` shape must pass unmodified (Packet 1's default-`None`-scope path is the
  regression guard).

### Frontend (Vitest, `frontend/src/__tests__/`, mock IPC via `window.entropic.sendCommand` stub)
- **`components/statusbar/system-meters.test.tsx` (Packet 3):** percentage-on-bar rendering;
  always-visible RAM meter (level `'ok'` still renders, unlike today's `MemoryStatus`); click →
  opens Monitor at correct tab.
- **`stores/freeze.test.ts` addition (Packet 4):** freeze/unfreeze produce exactly one Ledger
  entry each with a non-generic description; existing FSM-guard and IPC-shape assertions in that
  file and its siblings (`epic03-freeze-pertrack.test.ts`, `b10-performance-freeze-fsm.test.ts`,
  `components/freeze-ui.test.ts`) stay green.
- **`components/system-monitor/system-monitor-panel.test.tsx` (Packet 5):** sort-by-column, default
  sort order (offenders on top), group aggregation math, freeze-button dispatch, docked-width
  persistence round-trip, "reconnecting…" state driven by `useEngineStore.status`.
- **`contracts/relay-allowlist.test.ts` (Packet 1):** `get_perf_stats` reachable both directions
  (renderer allowlist AND backend handler table) — this is the bidirectional contract test named
  in this task's mandate; it already exists and enforces exactly this shape for every new command.

### Electron / Playwright (`frontend/tests/e2e` or wherever `_electron` specs live — Packet 6 only)
- Open Monitor window via menu action → second `BrowserWindow` exists, CSP header present, a real
  `get_perf_stats` round-trip succeeds inside it, closing it does not crash the main window.
  Justification for this layer (Gate 5): this exercises real OS-window lifecycle and a second
  Electron process boundary — not reproducible as logic or component-interaction tests.

### BDD-style scenarios (source PRD §7/§8, reproduced verbatim as acceptance criteria — no BDD
feature-file convention exists for this surface in the repo the way LayerTap's Gherkin features
do, so these are stated as UAT-guide entries per project CLAUDE.md's Visual UAT process, not new
`.feature` files):
- Monitor opens via menu AND via the (OD-2-resolved) hotkey.
- Freeze-from-panel works and produces a Ledger entry (Packet 4 dependency).
- Statusbar CPU/RAM chips are visible at idle (not just under load) and clicking either opens the
  matching Monitor tab.
- Induced slow-frame load produces exactly one rate-limited log line per second, not a flood.
- Sidecar restart while the Monitor is open → panel shows "reconnecting…" (never stale numbers),
  resumes polling on reconnect, and the window itself survives the restart (does not close).
- During export, the Monitor's frame-budget bar is replaced by a realtime-factor readout (source
  PRD §8) — out of this plan's packet list as written (no packet above builds the export-mode
  switch); **flag as a residual scope gap**: either fold into Packet 5 (small: branch on
  `is_export` in the panel's render, `is_export` is already a parameter threaded through
  `apply_chain`, `pipeline.py:132`) or open a follow-up packet. Recommend folding into Packet 5
  since the flag already exists on the wire — no new plumbing required, only new panel-side
  branching logic.
