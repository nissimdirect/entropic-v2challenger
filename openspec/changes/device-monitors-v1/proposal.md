# Proposal — device-monitors-v1 (per-device live video monitors + panel registry)

> **Status:** PLANNING (docs-only). Source PRD: `~/.claude/plans/creatrix-clip-editor-device-monitors-prd.md`.
> Depends: ui-foundation (frame), `sampler-clip-editor` P1 (FrameStrip exists for the large
> editor view). **BLOCKING pre-build constraint:** tap request schema must be specced
> JOINTLY with `layertap-matte-v1` (§9 LayerTap) BEFORE either change builds — one
> primitive, two consumers (user-locked sequencing).

## Why

"How do you see the video?" — there is exactly ONE preview surface today (PreviewCanvas +
its OS pop-out twin). You cannot see what a sampler is playing, what a rack pad outputs, or
the signal mid-chain. This change ships the monitoring tier: floating monitor panels showing
live per-device output, under an opinionated default policy.

## Locked verdicts (user, 2026-07-18)

1. **Sub-part-addressing principle** decides live-monitor defaults: devices that select/
   consume part of a clip → ON (Sampler, Sample Rack output, Frame-Bank, Granulator);
   temporal/codec effects (datamosh family, copy_machine, temporal_*, freeze/strobe/repeat,
   afterimage/backspin when built) → chip visible, one click; blanket transforms →
   right-click only. Enumeration is first-pass — review at build.
2. Budget: **4 concurrent live monitors, LRU-paused** (frozen last frame + resume
   affordance). Policy switch (LRU/degrade-fps/uncapped-warn) in Preferences = post-MVP.
3. Monitors NEVER dock into the device-chain strip (capped row) — floating panels, promoted
   to OS windows when multiwindow Stage B exists.

## Open Decisions

### OD-1 · Panel registry ownership (single-flight with system-monitor-v1)
`system-monitor-v1` PK-series also specs a detachable panel (its PRD §6 "panel registry
v1"). Whichever change builds FIRST ships the registry; the other consumes it.
**Recommended:** registry lands here ONLY if system-monitor-v1 hasn't started; else this
change's P1 collapses to "register monitor panels." A supersede-check runs before P1
dispatch (the PK.6 precedent).

### OD-2 · Registry field for the default policy
No stateful/temporal marker exists in the effects registry (warm-up test is deliberately
general, `backend/tests/test_all_effects.py:318`). **Recommended:** additive
`monitor_default: 'on'|'chip'|'context'` on effect/instrument registry entries, defaulted
`'context'`, curated list per verdict 1. Single source; UI reads it, never hardcodes names.

### OD-3 · Monitor render constants
**Recommended:** proxy 320px-wide, ~10fps, JPEG (alpha visualization = backend checkerboard
composite, Rule 1). Tap renders run on a LOW-PRIORITY queue: drop-frames-never-block; a
tap render never delays the main preview frame (budget guard + System Monitor metering).
Numbers are packet-tunable; the QUEUE SEMANTICS are normative.

### OD-4 · Z-tier for draggable panels
`.floating-panel` sits at z-200 with dialogs (deliberate, `floating-panel.css:9-11`).
**Recommended:** new `--cx-z-panel: 150` tier for draggable monitor panels (above
preferences 100, below dialogs 200); existing two floating panels stay at 200 until the
registry migrates them (out of scope here).

## The two tap forms (architecture — verified against the render path)

1. **Layer-subset tap** (pad/lane/instrument monitors): voice/pad layers are computed
   FRONTEND-side (`buildVoiceLayers`/`buildRackLayers`, App.tsx:1309-1466) → a monitor
   render is a second `render_composite` call with only that device's layers at proxy res.
   NO new backend semantics — new IPC verb wraps existing handler with res/priority.
2. **Chain-prefix tap** (feeds `chain-tap-preview` + LayerTap): render `chain[:k]` — the
   freeze-prefix slicing (`pipeline.py:207-229`) generalized from bake-time to live. NEW
   handler, shared request shape `{track, deviceIndex|'output', res, fps}` = LayerTap's
   `{track, stage}` extended to per-device index (joint schema, see header).

## Non-Goals

Right-click "preview to here" UX (that's `chain-tap-preview`) · OS-window promotion
(multiwindow Stage B) · scopes/histograms (multiwindow catalog) · in-monitor editing (view
only; the large FrameStrip editor is a separate panel body) · shared-memory transport.

## Code-grounding facts

- Panel substrate: `.floating-panel` BEM (`floating-panel.css`) — fixed, header/close idiom,
  two consumers; NO drag/resize/z/persist. Registry = extension, not invention.
- No containing-block hazards for `position:fixed` (no transform/filter on structural
  containers — verified).
- Layout store already persists panel-ish state (`PopOutBounds`, 4 region dims) — monitor
  bounds ride the same persistence.
- Perf: routing perf harness + baselines exist (`RUN_PERF=1`, `docs/perf/`,
  nightly workflow) — tap-render budget rows are additive to that harness.
- LayerTap chips spec 16px live thumbs ~10fps + cached-proxy hover-audition (LayerTap PRD
  §9/§10.8) — same stream family, smallest consumer.
- System Monitor self-accounting precedent: windows/panels show their own cost
  (multiwindow PRD §7).
- JPEG transport drops alpha (Rule 1) — matte monitors composite checkerboard backend-side.
