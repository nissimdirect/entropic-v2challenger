# Packets — system-monitor-v1

**Emitted:** 2026-07-04 by `/packetize`. **Plan:** `plan.md` (same dir — packets POINT to its
line-anchored code-ground verification; do not re-derive scope from the source PRDs). **Proposal:**
`proposal.md` — **T1 Verdicts are LOCKED (2026-07-03): all Open Decisions' defaults ACCEPTED as
written, with one override — hotkey ODs are additionally governed by the global verdict:
menu-entry-only now, accelerator picked at build/UAT.** This overrides `plan.md` Packet 5's file
list, which still names `default-shortcuts.ts` for a new binding — see PK.5 Non-scope correction
below. Do not re-open any Open Decision; if new ambiguity surfaces mid-execution, STOP per that
packet's STOP semantics rather than re-deciding.

**Branching rule (every packet):** cut from `origin/main` only; never from a local checkout a
parallel session owns. PR-only; squash merge; no `.github/workflows/**` edits.

**Merge gate (every packet, STRICT FULL-TIER per plan.md's own "Sequencing" section):** full
backend `cd backend && python -m pytest -x -n auto --tb=short` green + full frontend
`cd frontend && npx --no vitest run` green + `relay-allowlist.test.ts` green (bidirectional:
renderer→`ALLOWED_COMMANDS` AND backend-handler→{`ALLOWED_COMMANDS` ∪ `BACKEND_ONLY_COMMANDS`}) +
`cd frontend && npx tsc -b` clean → `Skill(review)` via Skill tool (ship-gate hook) → full CI green.
**PK.6 additionally** needs a Playwright `_electron` smoke (`cd frontend && npx playwright test`)
opening the new window, per Gate 5 test-layer justification (real OS-window/process-lifecycle
surface, not reproducible as logic/component tests).

**Cross-change constraint (named per task mandate):** PK.1 ships the `get_perf_stats` IPC command —
this is the **shared contract** the `multiwindow-stage-a` change's panel stubs are built against
(that change's packets must name `get_perf_stats`'s response shape — `{frame, effects[], groups[],
memory, caches}`, `plan.md` Packet 1 — as their stub target; do not let the two changes drift on
this shape independently). This change touches neither `stores/operators.ts` nor
`backend/modulation/routing.py` (the `wave0-prerouted-presets` rebase-trigger files), and ships no
new numeric `ParamDef`-style user-tunable params (proposal Non-goals — the curve+unit-metadata
landmine does not bind here, confirmed explicitly in `proposal.md`).

**Additional cross-change binding (window-hosting mechanism):** `multiwindow-stage-a` PK.1
independently builds a WindowManager + dedicated `preload/monitor.ts` + `monitor.html` intended to
host `<SystemMonitorPanel/>` (with a temporary stub, swapped for the real component once this
change lands) — this OVERLAPS with PK.6's own hand-rolled `system-monitor-window.ts` + reused
`preload/index.ts`. Before executing PK.6: (1) check whether multiwindow-stage-a's PK.1 has merged
(WindowManager + `preload/monitor.ts` + `monitor.html` exist in the tree); (2) if so, PK.6 is
SUPERSEDED — do not build a second window/preload/html-entry set; instead mount PK.5's
`SystemMonitorPanel` into the EXISTING `monitor-entry.tsx` in place of `SystemMonitorStub.tsx`,
re-scoping PK.6 to that swap only; (3) if not, PK.6 proceeds as written, but flag the ownership
question to the user/`/cto` before merging, since multiwindow-stage-a's docs will need a
symmetrical correction whichever change lands first.

**Soft cross-change note (not a hard dependency, file-churn hygiene only):** `wave0-prerouted-presets`
PK.1 also touches `frontend/src/renderer/App.tsx` (its apply path at `:3757`, its `:4373` tsc fix) —
disjoint line ranges from this change's App.tsx edits (PK.3's mount site, PK.4's freeze handlers),
but the same hot file. Recommend PK.3/PK.4 rebase onto `main` right before merge if
`wave0-prerouted-presets` has landed in the interim, to minimize merge-conflict noise. Not a
blocking `Depends` — the regions do not overlap semantically.

---

### PK.1 — Backend: per-instance timing scope + `get_perf_stats` IPC command
- **Scope:** OD-1(a) as locked — `apply_chain` gains optional `timing_scope: str | None` kwarg;
  `record_timing`'s key composition becomes `f"{scope}:{effect_id}#{i}"` when scope is given, else
  unchanged `effect_id` (all 3 call sites: `pipeline.py:424,468,496`); `_handle_render_composite`'s
  layer loop (`zmq_server.py:1407-1473`) passes its per-layer `layer_id` as `timing_scope`; new
  `get_perf_stats` IPC command assembling `{frame, effects[], groups[], memory, caches}` from
  `get_effect_stats()` (reused unchanged) + `get_effect_health()` + the existing pressure monitor +
  `cache_stats()` (`masking/matte_source.py:91`, `effects/field_source.py:420`); `frame.budget_ms`
  computed as `1000.0 / project_fps` (no hardcoded 33ms constant — none exists today, do not
  introduce one). **Non-scope:** `effect_stats`/`effect_health` commands (leave shipped, untouched,
  additive only); any instance-UUID wire-addressing scheme (that is `wave0-prerouted-presets`' D-1,
  independent of this packet's `layer_id`-based scoping); frontend consumption of the new command
  (PK.5).
- **Files:** `backend/src/engine/pipeline.py` (`record_timing` signature + 3 call sites
  `:424,468,496`; `apply_chain` gains `timing_scope` kwarg) — **single-flight with PK.2, order
  PK.1 → PK.2**; `backend/src/zmq_server.py` (new `elif cmd == "get_perf_stats":` arm near `:526`;
  `_handle_render_composite` layer loop `:1407-1473` passes `layer_id`); `frontend/src/main/zmq-relay.ts`
  (`ALLOWED_COMMANDS` entry, `:40` block, alongside existing `'effect_stats'`).
- **Depends:** none (dispatchable now). **Blocks:** PK.2 (pipeline.py single-flight), PK.5 (needs
  the per-instance shape).
- **Risk:** STD (MED) — additive but touches a hot, shared timing dict on 3 call sites.
- **Hard oracle:**
  - New backend unit test `backend/tests/test_engine/test_perf_stats.py`: build a fake composite
    render with two layers both running effect TYPE `fx.datamosh`; assert
    `get_perf_stats()['effects']` returns 2 distinct entries (not 1) with a `track`/`scope` field
    distinguishing them — **this test must FAIL on the pre-change tree** (anti-dead-flag proof:
    capture the failing output before implementing).
  - Same test file: default-`None`-scope path (single-clip preview) produces byte-identical
    `_effect_timing` keys to today — regression guard; run `test_effect_harness.py` unmodified and
    confirm it still passes.
  - `get_perf_stats` shape assertion: `{frame: {last_ms, avg_ms, budget_ms, fps}, effects: [...],
    groups: [...], memory: {...}, caches: {...}}`; `budget_ms` reflects actual project fps (assert
    != a hardcoded 33/33.3 literal by testing two different `clock_set_fps` values produce two
    different `budget_ms`).
  - `cd frontend && npx --no vitest run -- relay-allowlist` green (new command reachable both
    directions).
  - `cd backend && python -m pytest -x -n auto --tb=short` full tier green.
- **Test plan:** backend unit (`test_perf_stats.py`, new); backend regression (existing
  `test_effect_harness.py`, unmodified assertions); frontend contract test extension
  (`frontend/src/__tests__/contracts/relay-allowlist.test.ts`, new command entry).
- **Trust-boundary rule:** `get_perf_stats` is a read-only aggregation command with no
  user-controlled deserialization on this path — no new trust boundary is introduced. Verify with
  `grep -n "get_perf_stats" backend/src/zmq_server.py` before writing the brief to confirm the
  handler reads only internal state (never trusts a `layer_id`/`scope` value supplied over the
  wire as an index into anything unbounded).
- **STOP:** if `_handle_render_composite`'s layer loop has materially changed from
  `plan.md:63-66`'s code-ground (parallel sessions active), STOP and re-verify line numbers before
  editing · if the two-`fx.datamosh` anti-dead-flag test does NOT fail on the pre-change tree,
  STOP — the scoping bug this packet exists to fix may already be resolved elsewhere; report before
  proceeding.
- **Executor brief:** Sonnet. Inline verbatim: Gate 6 ("fixing a bug → RUN the failing code first,
  capture the actual error/stack trace... Reasoning about code is NOT enough"); Gate 13 trace-path
  discipline adapted to backend — read every function in the `record_timing` call chain (3 call
  sites + `get_effect_stats` + `get_perf_stats` handler) before editing, list the chain in a code
  comment; R4 ("Read files before editing — never Edit without prior Read"). **Last line: return
  PR # + the anti-dead-flag test's failing-then-passing output + oracle evidence list.**

---

### PK.2 — Backend: performance logging (slow-frame WARN, session summary, crash enrichment)
- **Scope:** slow-frame WARN check (per-frame, rate-limited 1/s — new logic, NOT reusing the
  per-effect `EFFECT_WARN_MS`/`EFFECT_ABORT_MS` constants at `pipeline.py:44-45`, only their
  pattern); session perf summary logged on project unload (piggybacking on `flush_timing()`'s
  existing call sites, `pipeline.py:115-117` — **not** on process `shutdown`, since
  `zmq_server.py:388`'s shutdown path is a `sys.exit` fired from the main-process side with no
  verified clean-exit hook; scope this packet to the project-unload event only); crash-report
  enrichment — `diagnostics.py:164-175` `crash_data` gains `last_frames` (≤30 entries) fed from a
  new small ring-buffer module (own file, imported independently by both `pipeline.py` as writer
  and `diagnostics.py` as reader — avoids a diagnostics→engine circular import). **Non-scope:**
  process-exit-time summary (no reliable hook confirmed to exist — do not build one speculatively);
  any change to the existing per-effect `EFFECT_WARN_MS`/`EFFECT_ABORT_MS` thresholds themselves.
- **Files:** `backend/src/engine/pipeline.py` (or a new small module it calls into) — single-flight
  with PK.1, **order PK.1 → PK.2** (both edit `pipeline.py`; PK.2 must land on top of PK.1's
  `record_timing` signature change); `backend/src/diagnostics.py` (`crash_data` dict, `:164-175`);
  new tiny ring-buffer module (new file, e.g. `backend/src/engine/frame_ring.py`).
- **Depends:** PK.1 (pipeline.py single-flight). **Blocks:** none hard (PK.5 does not consume
  PK.2's output — the live panel reads `get_perf_stats`, not the crash/summary logs).
- **Risk:** STD (LOW-MED).
- **Hard oracle:**
  - New unit test `backend/tests/test_engine/test_slow_frame_log.py`: feed N consecutive
    over-budget frames within a simulated 1-second window; assert exactly 1 `slow_frame` JSON log
    line emitted (not N) — this test must FAIL against a naive unrate-limited implementation
    (write the naive version first, confirm N log lines, THEN add the rate limit and confirm 1).
  - New unit test `backend/tests/test_diagnostics/test_crash_last_frames.py`: via the testable
    inner excepthook function, `crash_data` includes a `last_frames` array (≤30 entries) when the
    ring buffer has data, and omits/empties gracefully when it does not (no crash on empty buffer).
  - `cd backend && python -m pytest -x -n auto --tb=short` full tier green.
- **Test plan:** backend unit (`test_slow_frame_log.py`, `test_crash_last_frames.py`, both new).
- **STOP:** if no reliable clean-exit hook exists at the point originally assumed AND
  `flush_timing()`'s callers turn out not to fire reliably either (e.g. only on explicit user
  action, never on crash-adjacent unload), STOP and report — do not silently drop the session
  summary requirement or fake a hook.
- **Executor brief:** Sonnet. Inline verbatim: Toast Conventions rate-limit pattern from project
  CLAUDE.md ("rate-limited (2s dedup by `source`)") as the template this packet's 1/s slow-frame
  dedup mirrors, adjusted to a 1s window per this packet's own spec; Gate 6 (reproduce the
  unrate-limited flood first, capture the N-line output, before adding the limiter). **Last line:
  return PR # + the pre/post rate-limit log-count evidence + oracle evidence list.**

---

### PK.3 — Frontend: statusbar Ableton-clone meters (decision 26)
- **Scope:** new always-visible CPU meter (percentage rendered ON the bar, Ableton Live CPU-box
  pattern) + RAM meter upgrading `MemoryStatus.tsx` from its current conditional
  (`level === 'ok'` → `return null` at `:21`) to an always-visible form; each meter click opens the
  System Monitor at the matching tab (`'cpu' | 'memory' | 'caches'`). **Non-scope:** the System
  Monitor panel itself (PK.5); changing `MemoryStatus`'s existing 1 Hz `pressure_status` poll
  cadence or merging it with the Monitor's separate 2 Hz `get_perf_stats` poll (PK.5) — these stay
  two independent polls with different lifetimes, do not consolidate.
- **Files:** new `frontend/src/renderer/components/statusbar/SystemMeters.tsx` (do NOT use
  `components/performance/` — that path is already the perform-mode pads/MIDI surface, a confirmed
  naming collision the source PRD flags); `frontend/src/renderer/components/statusbar/MemoryStatus.tsx`
  (drop the early-return for the meter-cluster form); `frontend/src/renderer/App.tsx:93,4481` (mount
  site) — same file as PK.4's edits at `:2427-2468`, disjoint line ranges but single-flight risk
  (see Single-flight map below; recommend order PK.4 → PK.3).
- **Depends:** none hard (parallel-safe with PK.1/PK.2; soft-serializes with PK.4 on `App.tsx`, see
  Single-flight map). **Blocks:** none.
- **Risk:** LOW.
- **Hard oracle:** new Vitest component test
  `frontend/src/__tests__/components/statusbar/system-meters.test.tsx` (mirrors
  `memory-status.test.tsx` naming/pattern), mock IPC via `window.entropic.sendCommand` stub:
  CPU meter renders a percentage number on the bar element itself (query the bar element, assert
  text content, not a sibling element); RAM meter renders when `level === 'ok'` (regression check —
  this assertion must FAIL against today's `MemoryStatus.tsx` before the change, proving the
  always-visible requirement is real); clicking either meter calls the Monitor-open handler with
  the correct tab argument. `cd frontend && npx --no vitest run` full tier green.
- **Test plan:** component test with mock IPC (`system-meters.test.tsx`, new).
- **UAT journey:** launch app at idle (no load) → statusbar shows CPU % and RAM meters immediately
  visible (not just under memory pressure) → click CPU meter → System Monitor opens on the CPU tab
  → click RAM meter (from wherever Monitor is now) → tab switches to memory. Pixel-verify meter fill
  and percentage-on-bar rendering using `--cx-*` design tokens (no raw hex).
- **STOP:** if `MemoryStatus.tsx`'s conditional serves a second purpose beyond suppressing the
  always-visible meter (e.g. gating a distinct degrade-badge UI also used elsewhere), STOP and
  confirm scope — do not delete behavior other call sites depend on.
- **Executor brief:** Sonnet. Inline verbatim: Gate 14 Wiring Check ("verify: all interactive
  elements receive events... entry AND exit paths work") applied to the two meters' click handlers;
  the naming-collision note above (`components/performance/` is taken). **Last line: return PR # +
  screenshot path + oracle evidence list.**

---

### PK.4 — Frontend: History Ledger for freeze/unfreeze (OD-4, locked default (a))
- **Scope:** wrap `handleFreezeUpTo`/`handleUnfreeze`'s direct `useFreezeStore.getState().freezePrefix`/
  `unfreezePrefix` calls (`App.tsx:2427-2468`) in `undoable()` (`stores/undo.ts:206`) at the
  `App.tsx` call site — NOT inside `freeze.ts` — so the FSM guard and IPC round-trip stay exactly as
  they are; forward/inverse closures call the SAME store actions (`freezePrefix` forward,
  `unfreezePrefix` inverse, and vice versa), capturing `trackId` (an ID, not an index) directly per
  PLAY-003. **Non-scope:** any change to `freeze.ts`'s FSM guard, async behavior, or IPC shape;
  building the Monitor's own freeze button (PK.5 consumes this wrapper, does not rebuild it).
- **Files:** `frontend/src/renderer/App.tsx:2427-2468` — single-flight with PK.3 (see Single-flight
  map, recommend order PK.4 → PK.3); `frontend/src/renderer/stores/undo.ts` (`undoable()`, `:206`,
  read-only reference — call site only, no signature change expected; STOP if one is needed).
- **Depends:** none hard (parallel-safe with PK.1/PK.2/PK.3). **Blocks:** PK.5 (panel's freeze
  button dispatches through this wrapper — cannot log a correct Ledger entry without it).
- **Risk:** STD (LOW-MED) — touches a live, tested feature; must not change `freezePrefix`'s
  async/error-path behavior, only wrap it.
- **Hard oracle:** existing freeze regression suite stays green **unmodified in its
  behavior-assertions**: `frontend/src/__tests__/epic03-freeze-pertrack.test.ts`,
  `__tests__/b10-performance-freeze-fsm.test.ts`, `__tests__/stores/freeze.test.ts`,
  `__tests__/components/freeze-ui.test.ts` — plus a NEW assertion in `stores/freeze.test.ts`: after
  `handleFreezeUpTo`/`handleUnfreeze`, `useUndoStore.getState().past` gains exactly one entry with a
  non-generic description (e.g. `"Freeze <trackLabel> up to <cutIndex>"`, not bare `"Freeze"`) —
  this new assertion must FAIL on the pre-change tree (anti-dead-flag: capture the failing output
  showing zero Ledger entries today). `cd frontend && npx --no vitest run` full tier green.
- **Test plan:** unit/store test addition to `frontend/src/__tests__/stores/freeze.test.ts`
  (existing file, new assertion block) plus a full run of the four sibling regression files listed
  above to confirm zero behavioral drift.
- **STOP:** if wrapping in `undoable()` requires changing `freezePrefix`/`unfreezePrefix`'s
  signature or return shape (beyond what the closures capture), STOP — the design assumes a
  pure call-site wrap; a signature change means the assumption failed and needs re-scoping.
- **Executor brief:** Sonnet. Inline verbatim: PLAY-003 ("closures capture IDs, never indices —
  `trackId` is already an ID, safe to capture directly"); the house History Ledger landmine ("every
  new user-visible op needs a History Ledger row + specific `undoable()` description," non-generic
  per the Ledger-lint convention). **Last line: return PR # + the failing-then-passing Ledger
  assertion output + oracle evidence list.**

---

### PK.5 — Frontend: System Monitor panel (docked) — **RISK: HIGH**
- **Scope:** Activity-Monitor-style table component (new tree, e.g.
  `SystemMonitorPanel.tsx`): one row per effect instance (per PK.1's scope), groupable by
  track/group; columns name · track · ms/frame (p50) · % of budget (bar-in-cell, default sort
  offenders-on-top) · latency (frames) · state (live/❄ frozen/⛔ auto-disabled); freeze/unfreeze
  button per row dispatching PK.4's undoable-wrapped command; group aggregation (sum ms, max
  latency) per the routing PRD's group-bus rule; "reconnecting…" state driven by
  `useEngineStore.status !== 'connected'` (pauses the 2 Hz poll, does not show stale numbers);
  OD-3(a) locked default — ONE new named layout slot `monitorPanelW` in `layout.ts`, following the
  exact `clampFinite` + `persistCreatrixLayout` pattern the four existing sizes use (NOT a generic
  panel registry — that is `multiwindow-stage-a`); View ▸ System Monitor menu item
  (`menu.ts:121-134`, View submenu, **no `accelerator` field** — matches this file's own convention
  that "Renderer owns all keyboard dispatch," `:18-19`); export-mode readout — during export, the
  frame-budget bar is replaced by a realtime-factor readout, branching on the `is_export` flag
  already threaded through `apply_chain` (`pipeline.py:132`) — **folded into this packet per
  plan.md's explicit recommendation** (flag already on the wire, no new plumbing) rather than left
  as a residual gap. **Non-scope (T1-verdict correction — read before starting):** `plan.md`'s file
  list for this packet names `default-shortcuts.ts` for "a new binding per OD-2's resolved key, NOT
  meta+shift+a." **This is superseded by the T1 Verdicts global override:** menu-entry-only now,
  accelerator picked at build/UAT. Do NOT add a keybinding to `default-shortcuts.ts` in this
  packet — ship the View menu item with no accelerator wired; the hotkey is a separate, later
  decision. Also non-scope: the generic any-panel float/dock registry (`multiwindow-stage-a`); the
  offender/trivial-freeze toast integration (`layertap-matte-v1`, not built yet — this packet's
  freeze button calls the same underlying command but builds no toast).
- **Files:** new component tree under `frontend/src/renderer/components/system-monitor/`
  (`SystemMonitorPanel.tsx` + supporting files); `frontend/src/renderer/stores/layout.ts` (new
  `monitorPanelW` slot, following `inspectorH`'s pattern at `:68,92,136-137,185,276-278`);
  `frontend/src/main/menu.ts:121-134` (View submenu item) — single-flight with PK.6, **order
  PK.5 → PK.6** (already enforced by the Depends graph). **If mounting the docked panel requires an
  `App.tsx` change beyond the menu/layout files listed** (a plausible gap — `plan.md` did not list
  `App.tsx` for this packet despite the panel needing a docked mount point beside the inspector),
  **STOP and confirm the mount site before proceeding** rather than guessing where to splice it in.
- **Depends:** PK.1 (needs `get_perf_stats`'s per-instance shape), PK.4 (needs the undoable freeze
  wrapper so the panel's freeze button produces a correct Ledger entry). **Blocks:** PK.6 (reuses
  this packet's React component verbatim in the new `BrowserWindow`).
- **Risk:** HIGH — highest-risk packet in this change (plan.md rates it MED-HIGH, above every other
  packet): largest file surface, consumes two other packets' contracts, dispatches an undoable
  command from a new UI surface, and adds a new persisted layout slot. **Opus-tier executor +
  mandatory `/qa-redteam` before merge.**
- **Hard oracle:**
  - Vitest `frontend/src/__tests__/components/system-monitor/system-monitor-panel.test.tsx` (new,
    mock IPC): table sorts by any column, defaults to "% of budget desc"; group rows aggregate
    member rows correctly (sum ms, max latency) against a fixture with 2 tracks running the same
    effect TYPE (PK.1's exact anti-collapse scenario, now verified at the UI layer); freeze button
    on a row dispatches PK.4's undoable-wrapped command (assert `useUndoStore.getState().past`
    gains one entry, not zero); docked-slot width persists across a simulated reload (localStorage
    round-trip), mirroring existing `layout.ts` persistence tests; "reconnecting…" state renders
    when `useEngineStore.status !== 'connected'` and the poll pauses (assert no `sendCommand` calls
    while disconnected).
  - Export-mode branch: with `is_export` true (mocked), the frame-budget bar is replaced by a
    realtime-factor readout — new assertion in the same test file.
  - `cd frontend && npx --no vitest run` full tier green + `npx tsc -b` clean.
- **Test plan:** component test with mock IPC (`system-monitor-panel.test.tsx`, new, as above);
  reuses PK.1's backend fixture data shape for the two-track-same-TYPE group-aggregation case (no
  new backend test needed — this is a frontend-only aggregation check over a mocked payload).
- **UAT journey:** open System Monitor via View menu → table populated within one 2 Hz poll cycle →
  sort by "% of budget" (default, offenders on top) → click a row's freeze button → row shows ❄,
  History panel gains a "Freeze <track> up to <cut>" entry → Cmd+Z reverts, row un-freezes → toggle
  layout to resize the docked panel width → reload app → width persists → kill the sidecar process
  → panel shows "reconnecting…" (not stale numbers) → restart sidecar → panel resumes polling.
  Pixel-verify the offender bar-in-cell rendering and frozen/disabled state icons using `--cx-*`
  design tokens (no raw hex).
- **STOP:** if `App.tsx` mount site is ambiguous (see Files note above) → STOP · if the group-bus
  aggregation rule referenced from the routing PRD has changed since `plan.md` was written
  (parallel sessions active on routing docs), STOP and re-verify before implementing · if
  `useEngineStore`'s shape has drifted from `status: 'connected' | 'disconnected' | 'restarting'`,
  STOP rather than adapting silently.
- **Executor brief:** Opus-tier (Risk: HIGH). Inline verbatim: OD-3's locked default text ("add ONE
  new named slot... following the exact persistence pattern the four existing sizes already use...
  a fixed-width collapsible column, not a drag-anywhere panel"); the T1-verdict hotkey override
  above (menu-entry-only, no accelerator this packet); Gate 14 Wiring Check (props/callbacks/entry
  -and-exit paths, mount AND unmount) before declaring done. **Last line: return PR # + `/qa-redteam`
  findings summary + oracle evidence list + UAT screenshot paths.**

---

### PK.6 — Electron: System Monitor as a TRUE OS window (decision 28)
- **Scope:** new `frontend/src/main/system-monitor-window.ts` mirroring `pop-out-window.ts`'s
  structure (bounds persistence to `~/.creatrix/system-monitor-state.json`, CSP mirroring per
  PLAY-009's dev-aware branch, `will-navigate` prevention, `closed` handler); new
  `frontend/src/renderer/system-monitor.html` + `system-monitor-entry.tsx` mirroring
  `pop-out.html`/`pop-out-entry.tsx`, mounting PK.5's `SystemMonitorPanel` component verbatim (no
  duplication); **reuse `preload/index.ts` verbatim** for `webPreferences.preload` — confirmed this
  session that `sendCommand`'s backing `ipcMain.handle('send-command', ...)` is a GLOBAL
  registration (`zmq-relay.ts:267`), not scoped to the main window, so any window loaded with the
  full preload gets working bidirectional IPC for free; `electron.vite.config.ts`'s
  `renderer.build.rollupOptions.input` (`:26-29`) gains the new `system-monitor` HTML entry (the
  `preload` input list, `:15-18`, does NOT need a new entry — same preload file is reused).
  **Non-scope:** any new preload file (RT-1 forbids bidirectional IPC on the pop-out's read-only
  preload precedent — do not attempt to extend `preload/pop-out.ts` instead of reusing
  `preload/index.ts`); pushed-frame delivery (the Monitor polls at 2 Hz, never receives
  `webContents.send` pushes, so PLAY-009's preload-cache-and-replay requirement does not apply —
  only its CSP-mirroring half binds).
- **Files:** new `frontend/src/main/system-monitor-window.ts`; new
  `frontend/src/renderer/system-monitor.html` + `system-monitor-entry.tsx`;
  `frontend/electron.vite.config.ts:26-29` (renderer input only); `frontend/src/main/menu.ts` (View
  item wires to open this window) — single-flight with PK.5 on `menu.ts`, **order PK.5 → PK.6**
  (enforced by Depends).
- **Depends:** PK.5 (reuses its component verbatim). **Blocks:** none.
- **Risk:** STD (MED).
- **Hard oracle:**
  - New test `frontend/src/__tests__/main/system-monitor-window.test.ts`, mirroring the
    `vi.mock('electron', ...)` mocking pattern already used in
    `frontend/src/__tests__/main/pop-out-window.test.ts` (mock `BrowserWindow`, `ipcMain`,
    `screen`; assert on the `webPreferences.preload` string and `onHeadersReceived` CSP callback
    args passed to the `BrowserWindow` constructor mock). New Electron main-process unit test
    verifying the window-creation function sets CSP headers
    identically to `pop-out-window.ts`'s dev/prod branch (`isDev` check, `:196-197`) and passes
    `preload/index.ts`'s path (not `preload/pop-out.js`) as `webPreferences.preload` — assert the
    literal path string in the `BrowserWindow` constructor call.
  - Playwright `_electron` E2E (`cd frontend && npx playwright test`): launch the app, trigger the
    View ▸ System Monitor menu action, assert a second `BrowserWindow` exists, a real
    `get_perf_stats` round-trip succeeds from within it (bidirectional IPC proof — this is the test
    that would FAIL if PK.6 mistakenly reused the read-only pop-out preload instead), closing the
    window does not crash or affect the main window.
  - `cd backend && python -m pytest -x -n auto --tb=short` and
    `cd frontend && npx --no vitest run` stay full-tier green (no regression to the pop-out window
    path, which shares no files with this packet but shares the CSP-mirroring convention it must
    not silently diverge from).
- **Test plan:** Electron main-process unit test (new,
  `frontend/src/__tests__/main/system-monitor-window.test.ts`, CSP + preload-path assertions);
  Playwright `_electron` E2E (new spec under `frontend/tests/e2e/`, justified per Gate 5 as genuine
  OS-window/process-lifecycle surface, not reproducible as logic or component tests).
- **UAT journey:** View ▸ System Monitor → a real separate OS window opens (draggable to a second
  display if available) → live data populates identically to the docked mode → close the window →
  main app is unaffected → reopen → state resumes. No pixel-verify beyond confirming it's the same
  `SystemMonitorPanel` component already pixel-verified in PK.5 (no new visual surface to check
  here, only the window chrome).
- **STOP:** if `sendCommand`'s `ipcMain.handle` registration turns out to be window-scoped rather
  than global (re-verify at `zmq-relay.ts:267` before trusting this packet's own code-ground claim
  — parallel sessions may have changed it), STOP — the "no new preload needed" design collapses and
  this packet needs re-scoping to build a bidirectional preload from scratch. STOP if
  `frontend/src/main/window-manager.ts` or `frontend/src/preload/monitor.ts` already exist in the
  tree (multiwindow-stage-a landed first) — do not build a duplicate window/preload.
- **Executor brief:** Sonnet. Inline verbatim: RT-1 ("READ-ONLY preload — exposes ONLY frame
  updates, close signal, and ping. MUST NOT expose `ipcRenderer.invoke()` or `ipcRenderer.send()`"
  — the constraint this packet must NOT violate by copying the wrong precedent); PLAY-009's
  CSP-mirroring requirement ("every new `BrowserWindow` must mirror `src/main/index.ts`'s dev-aware
  CSP"). **Last line: return PR # + the CSP/preload-path assertion output + Playwright E2E run URL
  + oracle evidence list.**

---

## Single-flight map
| File | Packets | Order |
|---|---|---|
| `backend/src/engine/pipeline.py` | PK.1, PK.2 | 1 → 2 (per plan.md's own binding sequencing) |
| `frontend/src/renderer/App.tsx` | PK.3 (`:93,4481`), PK.4 (`:2427-2468`) | 4 → 3 (recommended — PK.4's edit is more surgical with an existing regression suite; PK.3's mount addition is trivial to rebase after) |
| `frontend/src/main/menu.ts` | PK.5, PK.6 | 5 → 6 (enforced by Depends graph) |
| `frontend/src/renderer/App.tsx` (cross-change) | this change's PK.3/PK.4, `wave0-prerouted-presets` PK.1 (`:3757`, `:4373`) | soft — disjoint line ranges; rebase either side onto latest `main` before merge to avoid conflict noise, not a hard `Depends` |

No packet in this change touches `stores/operators.ts` or `backend/modulation/routing.py` — the
`wave0-prerouted-presets` rebase-trigger files named in the task mandate do not bind here.

## Coverage check (plan.md → packets)
Per-instance timing rescope (OD-1) + `get_perf_stats` command → **PK.1**. Performance logging
(slow-frame WARN, session summary, crash enrichment) → **PK.2**. Statusbar Ableton-clone meters
(decision 26) → **PK.3**. History Ledger for freeze/unfreeze (OD-4) → **PK.4**. System Monitor
panel, docked slot (OD-3), menu item, export-mode readout → **PK.5**. System Monitor as a TRUE OS
window (decision 28) → **PK.6**. Hotkey (OD-2) → **explicitly descoped from every packet's
implementation** per the T1 Verdicts global override (menu-entry-only now, accelerator picked at
build/UAT) — not a silent narrowing: called out in PK.5's Non-scope with the correction reasoning,
and no packet below claims to ship a keybinding. Cross-change `get_perf_stats` contract-sharing
with `multiwindow-stage-a` → named in the header's Cross-change constraint section, not a packet
(no code to write on this change's side beyond shipping PK.1 as specified). curve+unit-metadata
landmine → N/A, confirmed via `proposal.md` Non-goals (no new numeric `ParamDef` params in this
change). Nothing else descoped.

## Ledger
| Packet | Status | PR | Oracle evidence |
|--------|--------|----|-----------------|
| PK.1 | ⬜ | — | — |
| PK.2 | ⬜ | — | — |
| PK.3 | ⬜ | — | — |
| PK.4 | ⬜ | — | — |
| PK.5 | ⬜ | — | — |
| PK.6 | ⬜ | — | — |
