# Plan — device-monitors-v1

> Packets point at §-anchors. Proposal ODs 1-4 carry recommended defaults.

## §1 Panel registry (or registration-only, per OD-1 supersede-check)

`frontend/src/renderer/panels/registry.ts`: `registerPanel({id, title, render, defaultSize,
minSize})`; panel state `{open, x, y, w, h, z}` in `stores/layout.ts` (persisted, clamped
on-screen at restore — pop-out-window.ts bounds-validation precedent). Float layer mounts
once in App.tsx at `--cx-z-panel: 150` (OD-4, new token). Drag by header, resize by corner,
click-to-front (z cycling within tier). Extends `.floating-panel` with a
`--draggable` modifier — existing two consumers untouched.

## §2 Tap render IPC (backend — single-flight zmq_server.py)

- New verb `tap_render {track_id, device_index|'output', width, fps_cap}`:
  - `'output'` on instrument/rack track → layer-subset form: reuse
    `_handle_render_composite` internals with the track's layers only, proxy width.
  - `device_index` on an effect chain → chain-prefix form: `apply_chain(chain[:k+1])` via
    the freeze-prefix slice pattern (`pipeline.py:207-229`), decoded source per the
    LayerTap stage definition (joint schema — pre=pre-chain decoded, post=post-chain incl.
    masks, SOURCE pixel space).
  - ⚠ STATE ISOLATION (verified 2026-07-18): `apply_chain` threads stateful-effect state
    (`states`/`new_states` dicts) across frames. Tap renders MUST use an ISOLATED per-tap
    state store (keyed `tap::<id>`), NEVER the main render's states — sharing would advance
    temporal effects (datamosh family etc.) at monitor cadence and corrupt the main output.
    Consequence to document in the UI contract: stateful effects in a 10fps tap will DRIFT
    from the 30fps main output — acceptable for monitoring; the tap is a faithful signal
    shape, not a frame-exact mirror. Oracle: main-render byte-identity with 4 taps open
    (regression test), tap-state keys never intersect main-state keys (unit).
  - LOW-PRIORITY: main render always preempts; taps drop frames, never queue >1 deep
    (latest-wins slot per tap id). Budget guard: aggregate tap time metered into
    `_effect_timing`-adjacent stats for System Monitor.
  - Trust boundary at the handler: finite ints, track exists, index in range; stale tap
    (device deleted) → `ok:false` + reason; frontend renders explicit empty state, never a
    frozen frame masquerading as live.
- Frontend relay: monitor frames arrive on the existing frame-push pattern
  (`pop-out:frame` precedent) keyed by tap id; `enqueueExchange` FIFO discipline (#431)
  respected — taps use the same serialized socket, hence low fps caps. ⚠ Load math:
  4 monitors × 10fps = up to 40 extra exchanges/s on the ONE REQ socket. If P2's perf row
  shows main-render latency regression, the ESCALATION PATH (do not improvise a new one)
  is the multiwindow Stage-C second-consumer stream (a second subscriber id on the sidecar
  — multiwindow PRD §Stage C); fps floor rather than socket forking is the v1 rule.

## §3 MonitorPanel component

`panels/MonitorPanel.tsx`: header = device breadcrumb + tap-point tag + live/paused badge +
close/pop-out(disabled until multiwindow B); body = frame canvas (T2) or static thumb (T1
fallback when paused/over-budget); footer = fps chip. LRU manager in `stores/layout.ts`:
opening a 5th live monitor pauses least-recently-VIEWED (interaction timestamps), paused =
frozen frame + ▶ resume. All `--cx-*` tokens.

## §4 Defaults policy (OD-2)

Registry: additive `monitor_default` field (backend `effects/registry.py` entries +
instrument types) with curated first-pass list (proposal verdict 1). `list_effects`
exposes it; UI monitor chips read it — zero hardcoded effect names in the frontend
(anti-dead-flag test: flipping a registry entry flips the chip presence).

## §5 Metering + perf rows

System Monitor (when landed) shows per-monitor cost; until then, statusbar warn at
aggregate tap time > 30% frame budget. Perf harness: add `tap_render` rows (proxy 320px
budget target; measure both forms) to `docs/perf/` baselines — nightly covers regression.

## §6 File surface / cross-change

NEW: `panels/registry.ts`, `panels/MonitorPanel.tsx`, tests · MODIFIED: `stores/layout.ts`,
`App.tsx` (float layer mount + monitor chips on device cards), `zmq_server.py` +
`pipeline.py` (tap handler — **single-flight with sampler-clip-editor P5 and any layertap
packet**), `effects/registry.py` (field), `tokens.css` (`--cx-z-panel`), styles.
Wave0 rule: `stores/operators.ts`/`modulation/routing.py` untouched — N/A.
Joint-schema gate: tap request/stage schema reviewed against LayerTap PRD §9 BEFORE P2.

## §7 Tests

Vitest: registry open/close/persist/clamp/z-cycle/LRU (state-machine suite); monitor chip
presence driven by registry field; empty-state on stale tap. Pytest: tap_render both forms
— chain-prefix result == full render of truncated chain (equivalence oracle); layer-subset
== render_composite with filtered layers; negatives (bad index, deleted track, non-finite);
priority: tap under load never delays main render beyond epsilon (perf-tier test).
E2E: open monitor → drag → persists across relaunch (multi-window Playwright pattern).
