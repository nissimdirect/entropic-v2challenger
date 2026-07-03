# Field-Mapping — Build Plan (the package)

**Execution model (per stakeholder):** "massive package — loop-until-complete, `/review` at every checkpoint." Phased; each phase ends at a **checkpoint gate** that must pass before the next starts. No marathon (learning #206) — validate each phase.
**North star (2026-07-03):** build on the existing chain + routing (not a parallel system); the differentiator is **pre-routed chained presets** in a first-class Presets folder. **Wave 0 ships first** — it proves the thesis with no new engine.

## Checkpoint gate protocol (runs at every ▣)
1. **Tests green** — backend `pytest -x`, frontend `vitest run`; new code ships with tests (the PRD's acceptance oracle).
2. **`/review`** — code review (ultra at risky phases). Fix confirmed findings before merge.
3. **Verify for real** — drive the feature / render a mock, not just tests.
4. **Determinism/parity** where applicable (preview==export).
5. **Update these docs** — PRD status + registry (avoid plan-code drift, learning #204).
6. **Lifecycle + edge-cases** — each phase must satisfy the relevant rows of `REVIEW.md` (lifecycle spec + edge-case register).
7. Merge via PR (never direct-to-main; campaign merge autonomy applies).

## Phases

### ▣ W0 — Wave 0: Pre-Routed Preset MVP  · PRD-wave0-preset-mvp  **[BUILD FIRST]**
Extend `effect_chain` presets + `preset.schema.json` to bundle routes; first-class **Presets folder**; seed the ~24 🟢 ship-today presets. **No new engine.**
**Gate adds:** wired-preset round-trip; apply==hand-built (pixel-diff); transparency (apply→remove==baseline); backward-compat; preset schema version + unknown-field-preserve.

### ▣ U0 — Near-free upgrades (ride alongside W0)  · PRD-mix-macro, PRD-edge-curve-ui
`_mix` as a visible + mappable wet/dry macro; wire + editor for the per-edge `curve` (serialized-but-unapplied today).
**Gate:** `_mix`/`curve` default == byte-identical to today (no silent change); `_mix` doesn't trip the `_*` reserved guard; curve LUT unit-tested.

### ▣ K1 — Mapping Framework keystone  · PRD-mapping-framework
Field-source operator type · `field_dst: coord` (ungate `EXPERIMENTAL_FIELD_DST`) · `reduce` rule · preset-bundle infra · `FieldProvider` cache (`field_source.py`). **Load-bearing — `/review` ultra.**
**Gate:** transparency-invariant test; `reduce` unit test; field-dst on/off test.

### ▣ ST — Signal Tap (exposes existing fields)  · PRD-signal-tap + SOURCES-SPEC
Publisher API; the 7 v1 taps (motion/spectral/chromagram/attractor/trail/entropy/flow); per-shape source inspectors incl. the **spectrum-EQ** editor.
**Gate:** tap→param round-trip; spectral band+threshold fires only above; per-band fan-out; no-double-compute; host render byte-identical with tap added.

### ▣ P1 — First field producers  · PRD-structure-tensor-utility, PRD-depth-utility, PRD-displace-destination
`fx.structure_tensor` (output + presets) · `Displace` destination (`field_dst:coord`) · `Depth` (classical v0 → ONNX sidecar). Each triple-use.
**Gate:** utilities register+render; tensor deterministic; `Tensor→Hue/Displace` presets round-trip; depth sidecar smoke + classical fallback.

### ▣ P2 — Routing UX (the three surfaces)  · SOURCES-SPEC §5, ARCHITECTURE §7
Per-param "map ▸" + "Route out ▸" suggestions (static affinity) · extend `ModulationMatrix`/`OperatorTopologyGraph` for field sources · device-rack + layers-routing UI · route-order rendering (fwd solid / back dashed 1f).
**Gate:** map from UI → edge in matrix; suggestion→one-tap; agent-native parity; source inspectors per shape.

### ▣ P3 — Effects that ride W0–P2  · PRD-kuwahara-npr, PRD-self-steering-distortion
Kuwahara (motion-coherent + juiced) · Self-steering · depth-gated composites · motion wet-paint.
**Gate:** motion demos hold (anti-flicker measured); parity; `/review`.

### ▣ E2s — Field-Solver SPIKE  · PRD-field-solver-spike  ✅ **RUN — GO (2026-07-03)**
MLX physarum probe measured: **0.74 ms/frame @512²/130k agents, deterministic, no op gaps** (`SPIKES.md` S9). Gate CLEARED — E2 unblocked. (A fuller on-device report — memory, RD-parity, larger N — still worth capturing at build.)

### ▣ E2 — Field-Solver Substrate + sims  · PRD-field-solver-substrate, PRD-physarum  **[UNBLOCKED — spike GO]**
Substrate + physarum + curl-fluid.
**Gate:** hosts ≥2 sims; seeded determinism; perf budget; GPU release; `/review` ultra.

### ▣ P5 — Field Mixer + Compositions + Morph  · PRD-field-mixer, PRD-composition-morph
Field Mixer (×/+/−/min/max/lerp) · composition capture · morph (params+depth+`_mix`; output-dissolve fallback) · `t` mappable.
**Gate:** `Flow×Depth` exact; morph t=0==A / t=1==B byte-identical.

### ▣ P6 — Cross-Modal Route-Out  · PRD-cross-modal-routeout  **[ships only with ≥4 seed presets]**
Visual field → audio param via `reduce` + rate-bridge smoothing.
**Gate:** 4 presets audibly work; no zipper noise; round-trip.

### ▣ P7 — L-axis / AI  **[gated on a separate sidecar latency spike]**
Diffusion sidecar, semantic modulation (CLIP), ControlNet-from-effects. Do not start before the latency spike passes.

## Dependency order
**W0** (+U0 alongside) → **K1** → **ST** → **P1** → **P2** → **P3** → **E2s(spike)** → E2 → P5 → P6 → P7.
Load-bearing: W0 proves the thesis with no engine; K1's `field_dst:coord` + `reduce` + `FieldProvider` unlock everything; E2s gates the one high-risk build.

## Status
All ⚪ not-started (planning). PRDs 🟢 drafted: W0, U0(mix/curve), K1, ST+SOURCES-SPEC, U1/U2/D1, Kuwahara, self-steer, field-solver-spike + substrate, physarum, field-mixer, composition-morph, cross-modal, prerouted-presets. Cross-cutting: `REVIEW.md` (UX routing map + lifecycle + edge-cases) is a build precondition per gate step 6.
