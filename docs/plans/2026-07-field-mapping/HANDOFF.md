# HANDOFF — Field-Mapping / Pre-Routed Presets (for the next session)

**Date:** 2026-07-03 · **Repo:** `~/Development/entropic-v2challenger` (Creatrix) · **Plan home:** `docs/plans/2026-07-field-mapping/`
**State:** planning COMPLETE + reviewed + spike-measured. **Verdict: APPROVE — one-shottable W0→E2.** Next step = build Wave 0.
*(Handoff co-located with the plan; per learning #126 a pointer also belongs in `~/Documents/Obsidian/process/` if you keep the cross-project index.)*

---

## 0. TL;DR — what to do next session
**Build Wave 0** (`prd/PRD-wave0-preset-mvp.md`). It needs **no new engine** and proves the whole thesis. Start at **P0.1** (§7 below has the exact file surface, already verified). Then U0 (mix/curve) alongside.

---

## 1. Doc map (everything authored this session, all in the plan folder)
**Read-order / spine:** `README.md` (index + north star + registry) → `BUILD-PLAN.md` (phases W0→P7 + gate protocol) → `REVIEW.md` (coherence + UX map + lifecycle + edge-cases + one-shot assessment of ALL PRDs) → `SPIKES.md` (all spikes, worked through).
**Specs:** `ARCHITECTURE.md` (mapping framework, §7 route-order), `SOURCES-SPEC.md` (every source: shape→affordance→interaction; spectral=EQ), `CATALOG.md` (utilities/effects/compositions — consider renaming → INVENTORY.md).
**Presets:** `PRESET-TOP50.md` = **the roster (gated ≤50, canonical)**; `PRESET-CATALOG.md`/`PRESET-ARTDIRECTOR-20.md`/`CTO-BUILDABLE-IDEAS.md` = the bench (not shipping set).
**PRDs (21 in `prd/`):** wave0-preset-mvp, prerouted-presets-library (flagship), signal-tap, mapping-framework (K1), mix-macro, edge-curve-ui, structure-tensor-utility, depth-utility, displace-destination, optical-flow-utility, entropy-luma-utilities, kuwahara-npr, self-steering-distortion, field-solver-spike, field-solver-substrate, physarum, field-mixer, composition-morph, cross-modal-routeout, + `_TEMPLATE.md`.

## 2. The north star (locked)
1. Build **on** the existing device chain + routing — not a parallel system.
2. Differentiator = **pre-routed chained presets** (devices + params + modulation edges, one click, inspectable) in a **first-class Presets folder**.
3. **Transparency invariant:** a preset IS a saved wiring you can open + remix (beginners get results AND learn by inspecting).

## 3. Build order (itemized — from BUILD-PLAN.md, all ⚪ not-started)
| Phase | What | Status/notes |
|-------|------|--------------|
| **W0** | Pre-Routed Preset MVP (bundle routes into chain presets + Presets folder + 24 🟢 presets) | **BUILD FIRST — no new engine** |
| U0 | `_mix` mappable macro + edge-curve wire+editor | ride alongside W0 |
| K1 | Mapping Framework (`field_dst:coord` + `reduce` + `FieldProvider` cache + preset-bundle infra) | keystone; `/review` ultra |
| ST | Signal Tap (7 taps + per-shape inspectors + spectral-EQ) | force-multiplier |
| P1 | Utilities: structure-tensor, depth (classical v0→ONNX), displace | ride K1 |
| P2 | Routing UX (map▸/route-out/suggestions/Matrix/rack) | the three surfaces |
| P3 | Effects: kuwahara (motion-coherent+juiced), self-steering | ride W0–P2 |
| E2s | Field-solver SPIKE | ✅ **DONE — GO** (0.74ms, deterministic) |
| E2 | Field-solver substrate + physarum + curl-fluid | **UNBLOCKED** by spike |
| P5 | Field mixer + compositions + morph | — |
| P6 | Cross-modal route-out (field→audio) | ⚠️ two-system bridge (see §6); ships w/ ≥4 seed presets |
| P7 | L-axis / AI | gated on S10 latency spike (unmeasured) |
**Every phase ends at a `/review` checkpoint gate** (tests → review → verify-real → parity → update docs → lifecycle/edge-cases → PR). See BUILD-PLAN §"Checkpoint gate protocol."

## 4. Verified facts (do NOT re-verify — evidence in SPIKES.md)
- **Field-solver GPU spike RUN:** MLX physarum 512²/130k agents = **0.74 ms/frame, deterministic** (max|Δ|=0.00), no op gaps → **GO**.
- Preset apply path **exists** + handles `effect_chain` (`App.tsx:3769`); materialize APIs exist (`operators.ts` `addOperator`/`addMapping`); `PresetBrowser` mounted (App.tsx:3756, "Presets" tab).
- `preset.schema.json` has `effect_chain`+`chainData.effects`(maxItems 10)+`modulations`; **needs `routes[]` added**.
- `_mix` popped by `container.py:59` at runtime (routable; the `_*` guard is registration-only).
- edge-`curve` serialized but **NOT applied** in the engine (only axis-lane curve exists); `util/curves.py` reusable.
- `field_dst` = per-row vector only, gated off; `coord`(dx,dy) dst is new. `reduce` not implemented. `field_source.py` exists (P6 field cache).
- `video_analyzer.motion` = **scalar** (not a field). datamosh has real Farneback flow to reuse. RVM ONNX-sidecar path exists (for depth).
- Signal-tap publishes via `state_out['_tap_*']` — no effect-contract change.

## 5. Decisions locked (SPIKES.md D1–D4)
- **D1** two-sources→one-param = **additive default** (reuse `blend_mode:'add'`); last-write/max optional.
- **D2** apply onto non-empty chain = **append default** (current behavior), offer Replace.
- **D3** tap on a powered-off host = **idles/zero** (no signal).
- **D4** per-band fan-out band-count change = **clamp band index**.
**Terminology unified:** composition = routing-preset = pre-routed chained preset (one thing).

## 6. Known obstacles (specced, not open)
- **Wave-0 id-remap (the #1 correctness detail):** apply reassigns fresh UUIDs (`App.tsx:3772`), so bundled routes referencing `target_effect_id` must be **remapped old→new** on apply or they dangle. Test required. (In wave0 PRD.)
- **Cross-modal (P6):** audio params live in a **separate `automation.ts`**; the modulation engine routes to *effect* params only → field→audio is a **two-system bridge**, not wiring. Late + preset-gated; doesn't block critical path. (In cross-modal PRD.)
- **Edge-curve silent-change risk:** existing presets carry `curve` unapplied; turning application on could change output → default/absent curve MUST == linear/identity. Test.
- **S10 (only open spike):** diffusion/CLIP latency — unmeasured (no model in this env); gates P7 only.

## 7. START HERE — Wave 0 P0.1 (exact file surface, verified)
1. **Schema:** `frontend/src/shared/schemas/preset.schema.json` — add `chainData.routes: ModulationRoute[]` (+ `presetSchemaVersion`, unknown-field-preserve); bump `effects.maxItems` 10→~24.
2. **Save:** `frontend/src/renderer/components/library/PresetSaveDialog.tsx` (chain branch ~line 60) — collect the chain's operator `mappings`/`ModEdge`s → `chainData.routes`.
3. **Apply:** `frontend/src/renderer/App.tsx:3757` `onApplyPreset` (effect_chain branch :3769) — after adding effects, build **old-id→new-id map**, then materialize routes (`operators.ts` `addOperator`+`addMapping` with remapped ids) + macros (currently unapplied).
4. **Folder UI:** promote `PresetBrowser.tsx` to a foldered/searchable Presets Library.
5. **Seed:** author the 24 🟢 presets from `PRESET-TOP50.md` (🟢 rows) as `.glitchpreset` JSON + thumbnails.
**Acceptance (wave0 PRD §5):** wired round-trip byte-identical · apply==hand-built (pixel-diff) · **id-remap test** · transparency (apply→remove==baseline) · backward-compat.

## 8. Creatrix build gotchas (from campaign memory — carry forward)
- **PR-only, never push to main.** Merge on **SMOKE-green** (`test.yml`); e2e/sidecar are standing-red — gate on smoke only. Campaign merge autonomy applies (squash, CI green, no `.github/workflows/**` changes).
- **This machine:** background poll loops / `gh run watch` **die exit-144** → merge-on-wake, don't sleep-poll.
- **Hex-ratchet CI:** no new raw hex in `frontend/src/renderer/styles/*.css` → use `--cx-*` tokens.
- **Worktree executors can't run vitest** (tsc-only) → CI smoke is the frontend gate.
- **Possible linter quirk:** a past session saw the Entropic linter revert Edit-tool changes to docs — **verify the plan docs are intact at session start** (`git status`); if reverted, re-apply via Write.
- **Test cmds** (CLAUDE.md): backend `cd backend && python -m pytest -x -n auto --tb=short`; frontend `cd frontend && npx --no vitest run`.

## 9. Optional next-session openers
- `/packetize` W0+U0 → one-shot build packets, OR start P0.1 directly on a branch (e.g., `feat/wave0-prerouted-presets`).
- Later: run S10 (diffusion latency) on a machine with the sidecar to un-gate P7.
