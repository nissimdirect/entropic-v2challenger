# Change — system-monitor-v1

**Status:** PLANNING (docs-only pass). Not decisions-locked — 4 real tensions surfaced during
code-grounding this session; see Open Decisions below (each has a recommended default).
**Source of truth (read-order):** `~/.claude/plans/creatrix-system-monitor-prd.md` (PRIMARY) →
`~/.claude/plans/creatrix-layertap-routing-prd.md` §4 decisions 16, 22, 26, 27, 28 (the routing
suite's numbered decision list — NOT circled-glyph numbering; the doc uses plain arabic numbers)
→ `docs/plans/2026-07-field-mapping/UNIFICATION-2026-07-03.md` §2 finding #70 (mandatory re-scope)
→ `openspec/PLANNING-QUEUE.md` Lane 2 item 6.

## Why

Per-effect timing is already collected (`pipeline._effect_timing`, rolling `deque(maxlen=100)`,
`backend/src/engine/pipeline.py:56/95-97`) and a health/auto-disable system already exists
(`_record_failure`/`_disabled_effects`, `pipeline.py:59-92`) — but **nothing surfaces either to
the user**, and slow frames are not logged with attribution. Stakeholder input (verbatim,
`creatrix-system-monitor-prd.md`):

> "like a system monitor for internal use… should be able to freeze in that panel… modal separate
> window you can drag around or be attached… any window area should be able to be detached"

The routing-design-suite separately banked three decisions that constrain this change: **16**
(CPU observability suite: global CPU meter, per-effect/group budget share, actionable warning
toast), **22** (System Monitor: full PRD here, Activity-Monitor-style panel + statusbar chip +
slow-frame logging + crash enrichment), **26** (statusbar meters are an Ableton-clone: CPU meter
with the percentage rendered ON the bar, verbatim Live CPU-box pattern, plus a sibling RAM meter
upgrading the existing `MemoryStatus` badge to the same always-visible form; each meter click
opens the System Monitor at the matching tab), and **28** (the System Monitor ships as a TRUE OS
window — `BrowserWindow` — because multi-display matters and its data is a 2 Hz IPC poll, not a
Zustand-bridged surface; the generic any-panel-detach epic is separate and unaffected).

**A P0 code-reality correction (UNIFICATION #70) changes the shape of the backend command:**
`_effect_timing` is keyed by `effect_id` alone, and `effect_id` is populated from
`effect_instance.get("effect_id")` (`pipeline.py:314`) — the effect **TYPE** string (e.g.
`"fx.datamosh"`), not a per-instance or per-track identifier. The PRD's "95% assembled from
`_effect_timing`" claim (§3.1) describes a command that, if built as literally specified ("one row
per effect instance, groupable by track"), cannot be assembled from the existing global TYPE-keyed
dict: two tracks each running `fx.datamosh` would collapse into ONE row today. This proposal
re-scopes the backend timing surface per the mandate below (Open Decision OD-1) before any panel
code is written against it.

**Separately confirmed this session (not in the source PRDs, code-grounded now):** the IPC command
`effect_stats` (returning `get_effect_stats()` — p50/p95/max/drop_rate, same TYPE-keyed dict) is
**already shipped** — `backend/src/zmq_server.py:526`, already in `ALLOWED_COMMANDS`
(`frontend/src/main/zmq-relay.ts:40` block, `'effect_stats'` entry) — with **zero frontend
consumers** (`grep -rl effect_stats frontend/src/renderer` returns nothing outside contract-test
allowlists). The "gap" is real, but narrower than the PRD states: the exposure half-exists; what's
missing is the per-instance dimension, the frame/memory/cache aggregation into one payload, and
every bit of UI.

## What changes

1. **Backend — `get_perf_stats` IPC command** (new `elif` arm, `zmq_server.py`; new `ALLOWED_COMMANDS`
   entry, `zmq-relay.ts:40`). Assembles `{frame, effects[], groups[], memory, caches}` from
   `get_effect_stats()` + `get_effect_health()` + the existing pressure monitor + `cache_stats()`
   functions (`masking/matte_source.py:91`, `effects/field_source.py:420`) — additive, no new
   collection subsystem. Polled by the frontend at 2 Hz only while a monitor surface (docked or
   OS-window) is open; never pushed. `frame.last_ms` already exists as `self.last_frame_ms`
   (`zmq_server.py:946`) — reused, not reinvented.
2. **Backend — per-instance timing re-scope** (OD-1, mandatory per UNIFICATION #70). `record_timing`
   gains a caller-supplied scope so two tracks' same-type effects don't collapse into one row.
3. **Backend — performance logging.** Slow-frame WARN (rate-limited 1/s, existing toast-dedup
   pattern per project CLAUDE.md "Toast Conventions"), session perf summary on clean shutdown,
   crash-report enrichment (`backend/src/diagnostics.py:164-175` `crash_data` dict gains
   `last_frames` + top offenders).
4. **Frontend — statusbar meter cluster** (decision 26). New always-visible CPU meter (% rendered
   on the bar, Ableton Live CPU-box pattern) + RAM meter upgrading `MemoryStatus.tsx` from its
   current **conditional** (`level === 'ok'` → renders nothing) form to an always-visible one. Each
   meter click opens the System Monitor at the matching tab.
5. **Frontend — System Monitor panel** (decision 22/16). Activity-Monitor-style table: one row per
   effect instance (per OD-1's scope), groupable by track/group; columns name · track · ms/frame
   (p50) · % of budget (bar-in-cell) · latency (frames) · state (live/❄ frozen/⛔ auto-disabled).
   Freeze/unfreeze button per freezable row, same command as existing timeline freeze
   (`useFreezeStore.freezePrefix`/`unfreezePrefix`, `App.tsx:2427-2468`) — **see OD-4**: that
   command currently has **zero** History Ledger integration, contradicting the source docs'
   claim that this is "the same undoable command."
6. **Electron — System Monitor as a TRUE OS window** (decision 28). New `BrowserWindow` following
   the `pop-out-window.ts` precedent (bounds persistence, CSP mirroring per `PLAY-009`,
   `will-navigate` prevention) — but reusing the **full** main preload (`preload/index.ts`), not
   the pop-out's deliberately read-only preload (`preload/pop-out.ts`, RT-1: "MUST NOT expose
   `ipcRenderer.invoke()`"), because the monitor needs bidirectional `sendCommand` (poll +
   fire-and-forget freeze) that RT-1 explicitly forbids on the pop-out precedent. New renderer
   HTML entry (`system-monitor.html` + `system-monitor-entry.tsx`, mirroring `pop-out.html`/
   `pop-out-entry.tsx`) mounting the SAME React panel component used in docked mode.
7. **Menu + hotkey.** View ▸ System Monitor menu item (`frontend/src/main/menu.ts:121-134` View
   submenu). Hotkey: see OD-2 — the PRD's proposed Cmd+Shift+A collides with a live binding.

## Non-goals (explicitly out of scope for this change, per source PRD §5/§6)

- No per-pixel profiling, no flame graphs, no GPU counters (UNIFICATION #84: GPU has no
  observability surface in Monitor v1 — declared deferred explicitly).
- No OS-level process stats beyond what `memory_status`/`pressure_status` already return.
- No generic any-panel float/dock registry — that is the separate `multiwindow-stage-a` change
  (`PLANNING-QUEUE.md` Lane 2 item 7); this change only builds the ONE hand-rolled docked slot the
  Monitor itself needs (see plan.md Packet 4) and the ONE `BrowserWindow` the Monitor itself needs.
- No offender/trivial-freeze toast integration (routing PRD decision 16's "actionable warning
  toast," and the "toast's Freeze C1 action" the source PRD assumes exists) — confirmed
  code-grounded this session: **no such toast exists anywhere in the frontend today**
  (`grep -rn "Freeze C\|offender\|routing_budget_warn" frontend/src/renderer` → zero hits). That
  logic belongs to the still-unbuilt `layertap-matte-v1` change (`PLANNING-QUEUE.md` Lane 2 item
  2, stage ⬜). This change's freeze button calls the same underlying command
  (`freeze_prefix`/`invalidate_cache`) but does not build or depend on the toast-offender system.
- No new numeric ParamDef-style user-tunable effect parameters — the curve+unit-metadata landmine
  (house rule) does not bind here; offender/warn thresholds (25% budget, 10-min trivial-freeze
  candidate) are internal code constants, not effect params surfaced to `ParamDef`.
- Does not resolve `wave0-prerouted-presets`' D-1 (instance-UUID end-to-end routing addressing).
  This change's per-instance timing key is independent of that decision (see plan.md Packet 1
  "Code-ground verification" for why).

## Open Decisions

### OD-1 · Per-effect timing re-scope (mandatory — UNIFICATION #70)
| Option | What | Cost | Risk |
|---|---|---|---|
| **(a) Add a per-instance scope to `record_timing` (RECOMMENDED — task mandate default)** | `apply_chain` gains an optional `timing_scope: str \| None` kwarg; single-clip preview path (no multi-track ambiguity) passes `None` → today's TYPE-only key (byte-identical); the composite-render path (`zmq_server.py:1407` `_handle_render_composite`, which already iterates `raw_layers` with a `layer_id` per layer, `:1470`) passes that `layer_id` as scope. `record_timing` composes the key as `f"{scope}:{effect_id}#{i}"` when scope is given, else `effect_id` (unchanged). Frontend correlates instance→track using its OWN per-track chain state (`Track.effectChain`, already shipped per PR-zero epics 01-06) — no track_id needs to cross the wire for this. | 1 new kwarg + ~10 line change in `pipeline.py` (`record_timing`, 3 call sites `:424/468/496`) + 1 call-site change in `zmq_server.py` composite path | LOW; additive, default-None preserves every existing caller/test byte-identical |
| (b) Descope v1 to per-TYPE rows only (document the duplicate-effect-type limitation) | Ship `get_perf_stats` on top of the existing `_effect_timing` dict unchanged; Monitor table shows one row per effect TYPE, not instance; a project with two `fx.datamosh` instances (anywhere, any track) shows one merged row | near-zero | MED — directly contradicts the PRD's explicit UI spec ("one row per effect instance, groupable by track") and undersells a feature the user asked for by name |

Recommendation: **(a)**. This task's own mandate names option (a) as "small" — confirmed small by
code-grounding: no track_id needs to be threaded through the render IPC contract (that is the
separate, larger `04-freeze-pertrack`-adjacent epic in `openspec/project.md`'s PR-zero table), and
no dependency on `wave0-prerouted-presets`' D-1 (instance-UUID wire addressing) is created — (a)
uses the composite path's already-available `layer_id`, not a new instance-UUID scheme.

### OD-2 · Hotkey conflict (Cmd+Shift+A is taken)
The PRD proposes **Cmd+Shift+A** ("Activity-monitor mnemonic; free against the existing shortcut
table" — PRD §4). Code-grounded this session: **false** — `frontend/src/renderer/utils/default-
shortcuts.ts:86` already binds `meta+shift+a` to `mask_deselect_all` ("Mask: Deselect All"),
`context: 'normal'` (globally active, not scoped to a mask-editing sub-context — both bindings
would collide at the same context level).
- **Recommended default:** reassign the Monitor hotkey to an unused `meta+shift+*` combo — full
  scan of `default-shortcuts.ts` (this session) shows `meta+shift+{g,h,q,r,u,w,x,y}` are all free.
  No strong mnemonic exists among them (the "A" mnemonic is what made Cmd+Shift+A attractive).
  Recommend **Cmd+Shift+U** as a placeholder pending user pick — flag clearly in the shortcut
  table / `ShortcutEditor.tsx` that this is a placeholder, not a final mnemonic decision.
- Do NOT silently ship Cmd+Shift+A — it will silently break `mask_deselect_all` for anyone with a
  mask selected, or vice versa depending on dispatch order (untested collision behavior either way).

### OD-3 · Docked ("attached") mode layout slot
The PRD says the Monitor "opens ATTACHED (docked right of the inspector) by default" and "can also
dock back (attached mode renders the same component in-app)" (§4, §6). Code-grounded: no generic
dock/panel-slot system exists in `frontend/src/renderer/stores/layout.ts` today — it holds four
named, fixed CSS-grid sizes (`leftColW`, `inspectorH`, `previewHPct`, `deviceChainH`), not a
registry. Building the PRD's full generic panel registry is explicitly the separate
`multiwindow-stage-a` epic (see Non-goals).
- **Recommended default:** add ONE new named slot, `monitorPanelW` (or similar), following the
  exact persistence pattern the four existing sizes already use (`layout.ts` `clampFinite` +
  `persistCreatrixLayout`) — a fixed-width collapsible column, not a drag-anywhere panel. This is
  the smallest slice that satisfies "docked right of the inspector by default" without building
  the deferred registry.

### OD-4 · History Ledger for freeze/unfreeze (house landmine #5 collision)
The source PRD/routing-suite spec both assert "Freeze-from-monitor = the same undoable command as
timeline/toast freeze" (`creatrix-system-monitor-prd.md` §8). Code-grounded this session: **that
command has zero undo integration today.** `handleFreezeUpTo`/`handleUnfreeze`
(`frontend/src/renderer/App.tsx:2427-2468`) call `useFreezeStore.getState().freezePrefix`/
`unfreezePrefix` (`stores/freeze.ts:47-91`) directly — no `undoable()` wrapper anywhere in that
path. Per the binding house landmine ("History Ledger row + specific undoable() description for
every new user-visible op"), the Monitor's freeze button is a new user-visible entry point onto an
op that currently produces no Ledger row.
| Option | What | Cost | Risk |
|---|---|---|---|
| **(a) Wrap `freezePrefix`/`unfreezePrefix` in `undoable()` as part of this change (RECOMMENDED)** | Fix `App.tsx:2427-2468` once; the Monitor's freeze button, the (future) toast's freeze action, and today's existing timeline freeze UI all become undoable for free, since they share one call site | Small — one call site; existing regression suite already covers this surface (`__tests__/epic03-freeze-pertrack.test.ts`, `b10-performance-freeze-fsm.test.ts`, `stores/freeze.test.ts`, `components/freeze-ui.test.ts`) and must stay green | LOW-MED — touches a live, tested feature; must not change `freezePrefix`'s async/error-path behavior, only wrap it |
| (b) Ship the Monitor's freeze button without a Ledger row, matching today's (undocumented) reality; file a follow-up bug | Zero | Zero build cost | Ships a NEW user-visible surface with a documented-but-false "undoable" claim; violates the house landmine at the point of shipping, not retroactively |

Recommendation: **(a)** — small, contained, and the existing freeze test suite is the regression
guard.

## Definition of done

`get_perf_stats` returns real per-instance data (verified: two tracks both running `fx.datamosh`
produce two distinct rows). The statusbar CPU/RAM meters are always visible (Ableton pattern),
click-through to the matching Monitor tab. The System Monitor opens as a real OS `BrowserWindow`
(multi-display capable) and can also render docked in-app from the same component. Freeze/unfreeze
from the panel produces a named History Ledger entry. Slow frames are logged rate-limited; crash
reports carry `last_frames`. All 4 Open Decisions above are resolved (by user or by the recommended
default) before `/packetize`.


## T1 Verdicts (LOCKED 2026-07-03, /marathon chunked T1 — do not re-open)
All Open Decisions above: **defaults ACCEPTED as written** (user: "Accept all 33 defaults"). Hotkey ODs additionally governed by the global verdict: menu-entry-only now, accelerator picked at build/UAT.
