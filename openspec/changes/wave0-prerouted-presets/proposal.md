# Change — wave0-prerouted-presets

**Status:** decisions LOCKED (D1-D4, UD-1..UD-5) — ready for `/packetize`, no further design work.
**Source of truth (read-order):** `docs/plans/2026-07-field-mapping/MARATHON-BRIEF-wave0-AMENDED.md` (PRIMARY, supersedes the pre-amendment `MARATHON-BRIEF-wave0.md`) → `UNIFICATION-2026-07-03.md` → `prd/PRD-wave0-preset-mvp.md` + `prd/PRD-mix-macro.md` + `prd/PRD-edge-curve-ui.md` → `REVIEW.md` §6 → `HANDOFF.md` §4/§7 (HANDOFF's "SMOKE-green" merge gate and "Presets folder promotes App.tsx:3756" claims are **stale** — UD-3 and the UNIFICATION §4 correction supersede them; see plan.md Landmines).

## Why

The flagship product thesis — **pre-routed, swappable, inspectable presets** — can ship now, before any new engine work, because the pieces already exist: `effect_chain` presets, `ModulationRoute`/`OperatorMapping`, `preset.schema.json`, `PresetBrowser`, the device chain, and the operator-routing engine. Stakeholder input (verbatim, `PRD-wave0-preset-mvp.md`):

> "'Wave 0' — the pre-routed preset MVP, buildable now, before any utility… extend chain presets to bundle the modulation edges, surface a first-class Presets folder, and ship the ~18 '🟢 ships-today' presets… proves the entire product thesis… with almost no new engine code"

A `/cto` unification pass (144 agents, doc-coherence + codebase ground truth, `UNIFICATION-2026-07-03.md`) found one P0 code-reality correction that changes the shape of Packet 1 (route addressing is TYPE-scoped on the wire today, not instance-UUID as the original brief assumed) and reconciled 5 collisions with the parallel routing-design-suite (LayerTap) work. All 5 (D-1..D-5) are **user-decided and locked** as of 2026-07-03; this change consolidates the amended brief into a single one-shottable plan. No new decisions are made here.

## What changes

Three deliverables (`PRD-wave0-preset-mvp.md` §2), plus two riders (`_mix` macro, edge-curve) that are cheap and share file surface with Packet 1:

1. **Bundle routes into chain presets.** `preset.schema.json` gains `chainData.routes[]` (+ `presetSchemaVersion`, `effects.maxItems` 10→24). Save captures the chain's operator mappings; apply materializes devices + routes + macros in ONE undo transaction, with routes/operators rewritten through an old-id→new-id map. Route addressing moves to **instance-UUID end-to-end** (UD-1) — this is a real, contained, additive engine change to two files (`ipc-serialize.ts`, `modulation/routing.py`), not "no new engine" as originally scoped; the brief amendment accepts this cost explicitly.
2. **First-class Presets Library.** `PresetBrowser.tsx` gains folders/search/tags as an **embeddable** internal upgrade (no new top-level chrome), so it can be re-hosted later by the routing-suite's browser folder-tree without rework (UD-2).
3. **Seed 24 presets.** The 24 🟢 "ships-today" rows of `PRESET-TOP50.md`, as `.glitchpreset` JSON + rendered thumbnails, in `<Documents>/Creatrix/Presets/` subfolders (UD-4).
4. **`_mix` mappable macro** (`PRD-mix-macro.md`): expose the existing per-effect wet/dry as a visible knob and valid `ModEdge` target.
5. **Edge-curve v1** (`PRD-edge-curve-ui.md`, UD-5 scope): apply the existing-but-unapplied `OperatorMapping.curve` enum in the routing contribution step; add `smoothstep` to the enum; ship an enum picker (draggable-points editor explicitly deferred to K1).

Plus two prerequisite packets folded in by the amendment (not originally in the PRD, both REQUIRED before Wave-0 packets merge per UD-3):
- **Packet 00 — CI stabilization to full green** (e2e regression shards 2-3, `test_numeric_params_have_unit`, 2 `test_zmq*` failures, `App.tsx:4373` tsc error).
- **Packet 0a — History Ledger discipline** (lint test over `undoable()` descriptions; free, rides in front).

## Non-goals (explicitly out of scope for this change)

- The new field-mapping utilities (structure-tensor, depth, optical-flow, displace), the field-solver, signal-tap, the AI/L-axis — these are K1/ST/P1+ (separate future marathons; `MARATHON-BRIEF-wave0-AMENDED.md`: "Do NOT marathon past this").
- Changing the `_mix` blend math (exists, unchanged) or building per-region mix (masking's job).
- A draggable-points/Bezier curve editor (deferred to K1 where the spectral EQ-curve genuinely needs it).
- The routing-design-suite's (LayerTap) own build items (browser folder-tree as the top-level IA winner, System Monitor, multiwindow, transforms, history-panel-delta) — those are separate `openspec` changes per `PLANNING-QUEUE.md` Lane 2; this change only does the minimum to not block them (embeddable folders, not a competing top-level surface).
- Re-litigating D1-D4 or UD-1..UD-5 — they are stakeholder-locked; see plan.md for where they bind.

## Open Decisions

None. All blocking decisions (D-1 route addressing, D-2 marathon order + browser IA, D-3 merge-gate matrix, D-4 preset disk location, D-5 edge-curve editor shape) were resolved by the user on 2026-07-03 and are recorded verbatim as UD-1..UD-5 in `MARATHON-BRIEF-wave0-AMENDED.md` and reproduced in plan.md. No genuinely new contradiction was found while grounding this proposal against the current codebase (verified: `ipc-serialize.ts:45`, `routing.py:214-218/310`, `App.tsx:3757-3778/4373`, `PresetSaveDialog.tsx`, `library.ts`, `preset.schema.json`, `container.py:59`, `masking/schema.py:30-40`, `test_calibration.py:29`, `PRESET-TOP50.md` — all match the amended brief's claims).

## Definition of done

A user opens the Presets folder, one-click applies a wired preset (devices + routings + macros) onto a clip, the result renders identically to hand-building it, and opening the chain/Modulation Matrix shows normal editable edges (transparency invariant). `_mix` and edge-curve work with byte-identical defaults. Full CI green (UD-3 strict full-tier) on main. Then: archive the amended brief, write the K1 marathon brief next.
