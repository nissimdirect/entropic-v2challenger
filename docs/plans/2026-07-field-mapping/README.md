# Creatrix — Field-Mapping Initiative (consolidation + plan)

**Status:** planning / ideation (no build yet). **Started:** 2026-07-03.
**One-line:** turn Creatrix from a fixed effect library into a **patchable instrument** where every computed field (depth, structure-tensor, optical-flow, sims, entropy, spectral, matte, CLIP) is a first-class, routable modulation source — with a guided front door and a fully-exposed under-the-hood.

> This is a **living, exploratory** plan. Sections marked 🌱 are open ideation, not decisions. Sections marked 🔒 are grounded in the current codebase and safe to build against. Decisions get promoted from 🌱 → 🔒 as we choose.

## ⭐ North star (crystallized 2026-07-03)

Two decisions now anchor everything:

1. **Build ON the existing device chain + routing — not a parallel system.** Each new piece (utility / effect / destination) is a **complete, composable device** that plugs into Creatrix's *natural* routing (`device chain` + operator `mappings`/`ModEdge` + `ModulationMatrix`). We verified the substrate is already real; this is additive wiring, not a new engine.
2. **The differentiator is pre-routed chained presets, in a first-class Presets folder.** The pieces *in tandem* let us ship whole **wired** chains (devices + params + modulation edges) as one click — grounded in the existing `effect_chain` preset + `ModulationRoute` types (a modest extension). See **`prd/PRD-prerouted-presets-library.md`** — the flagship. Terminology unified: **composition = routing-preset = pre-routed chained preset** (one concept).

---

## How we got here (the source docs — consolidated)

All prior research now feeds this initiative. Read in this order:

| Doc | What it is |
|-----|-----------|
| `docs/research/2026-07-03-vj-touchdesigner-recipe-cannibalization.md` | The external scan (TD + VJ tools + indie devs), code-verified. Where the raw techniques came from. |
| `docs/research/2026-07-03-madsci-cto-cross-module-catalog.md` | Mad-scientist × CTO — 14 cross-module capabilities that re-wire (not rebuild). |
| `docs/research/2026-07-03-field-as-modulation-enablement.md` | The thesis: **any field is a modulation source**; the triple-use-field principle; the cross-DAW enablement graph. |
| **this folder** | Consolidates the above into an architecture + catalog + PRD-per-element. |

Mock galleries (Artifacts, rendered on the user's own footage): Kuwahara value probe · proposals motion probes · madsci×CTO catalog · field-as-modulation map.

---

## The taxonomy (so we're precise — learning: don't conflate parallel systems)

Five distinct element types. Keeping them separate is what keeps the plan from getting muddy.

1. **Utilities (field producers)** — compute a 2D field from the frame/inputs. Structure-Tensor, Depth, Optical-Flow, Entropy, Luminance, a sim's velocity/trail. *Each is triple-use: output + modulation source + mask.*
2. **Destinations** — things a field can drive. Two kinds: **(a) effect params** (hue angle, blur radius — already mappable today) and **(b) the `Displace` destination** (a per-pixel coordinate warp — needs the reserved `field_dst: coord`).
3. **Effects (finished looks)** — Kuwahara/NPR, physarum, fluid, self-steering, etc.
4. **Mapping framework (the router)** — the wiring that connects sources → destinations via binding rules, plus **preset routings** and the **suggestion/route-out UX**. *This is the true keystone.*
5. **Compositions (recipes)** — curated stacks that guide people to cool outcomes (paint-then-glitch, depth diorama, structure-reactive glitch). Every composition is an inspectable saved routing, not a black box.

---

## Design philosophy — guide, don't obscure (the user's north star)

> "smart but transparent… we don't want to be obtuse but we want to guide people to cool outcomes and also allow for people to really get under the hood."

**Three surfaces of depth (progressive disclosure):**

| Surface | Who it's for | What it is |
|---------|-------------|-----------|
| **1 · Compositions / Presets** | anyone, first 30 seconds | One click → a cool outcome. "Paint-then-glitch," "Rack focus," "Living portrait." |
| **2 · Suggested routings** | the curious | The UI *proposes* — "this Tensor field → try Displace / Hue / Blur." Assisted discovery, one tap to accept. |
| **3 · Full routing** | power users | The `ModulationMatrix` + topology graph: every edge, binding rule, curve, depth, min/max, exposed and editable. |

**Transparency invariant:** a preset **is** a saved routing. Open any composition and you see the exact edges it created, editable. No magic — presets are recipes you can read and remix. This is the thing that lets beginners and power users share one system.

---

## Grounding — what already exists (🔒, don't rebuild)

The routing substrate is **already real** (verified 2026-07-03):
- **Operators** carry `mappings[]`. Each = `{ target_effect_id, target_param_key, depth, min, max, curve, blend_mode, source_key?, src_axis?, dst_axis?, binding_rule? }` → backend `ModEdge`.
- **`ModulationMatrix.tsx`** + **`OperatorTopologyGraph.tsx`** = the routing UI (surface 3 already partly exists).
- Per-mapping **`curve`** already exists (easing is partly there).
- **`video_analyzer`** (luminance/motion) is already a field-ish source operator — the template for new field sources.
- Binding rules: `broadcast/sampleAt/scanOver/integrate` live; `painted/hilbert/polar/learned` gated behind `EXPERIMENTAL_AXIS_BINDINGS`.

So the initiative is mostly **additive wiring on a real system**, not a new engine. See `ARCHITECTURE.md`.

---

## PRD registry (start of "prd for each")

Each element gets a PRD in `prd/`. Template: `prd/_TEMPLATE.md`. Status: 🟢 drafted · 🟡 outlined · ⚪ queued.

| # | Element | Type | Status | Notes |
|---|---------|------|--------|-------|
| ⭐W0 | **Wave 0 — Pre-Routed Preset MVP** | framework/product | 🟢 `prd/PRD-wave0-preset-mvp.md` | **BUILD FIRST** — narrow slice, no new engine, proves the thesis; +impl plan P0.1–P0.4 |
| ⭐P | **Pre-Routed Chained Presets + Presets Library** | framework/product | 🟢 `prd/PRD-prerouted-presets-library.md` | **FLAGSHIP** — the differentiator; extends existing `effect_chain` preset; incl. uninvasive related-preset suggestions |
| ⭐ST | **Signal Tap** (existing effects' fields → sources) | framework | 🟢 `prd/PRD-signal-tap.md` + `SOURCES-SPEC.md` | force-multiplier; motion/spectral/flow/entropy-reactive **today**, ~0 new field code |
| src | **Sources spec** (shape → affordance → interaction) | reference | 🟢 `SOURCES-SPEC.md` | **all sources documented**; spectral=EQ/freq-gated-threshold, depth=focal, etc. |
| M1x | **`_mix` mappable wet/dry macro** | primitive | 🟢 `prd/PRD-mix-macro.md` | near-free (backend already mixes); powers morph |
| CRV | **Editable per-edge curve** | primitive | 🟢 `prd/PRD-edge-curve-ui.md` | `curve` serialized-but-unapplied → wire + editor; EQ-curve for spectral |
| E2s | **Field-Solver SPIKE gate** | infra (spike) | 🟢 `prd/PRD-field-solver-spike.md` | measure-before-commit; go/preview-only/defer matrix |
| K1 | **Mapping Framework** (field sources + `field_dst:coord` + `reduce` + presets + suggestions) | framework | 🟢 `prd/PRD-mapping-framework.md` | **THE keystone — build first** |
| U1 | **Structure-Tensor Utility** | utility | 🟢 `prd/PRD-structure-tensor-utility.md` | output + preset routings (displace/hue/blur) |
| U2 | **Depth Utility** | utility | 🟢 `prd/PRD-depth-utility.md` | vision; output + mod + mask; rack-focus; classical v0 |
| U3 | Optical-Flow Utility | utility | 🟢 `prd/PRD-optical-flow-utility.md` | expose the field already inside `datamosh` |
| U4 | Entropy / Luminance utilities | utility | 🟢 `prd/PRD-entropy-luma-utilities.md` | `entropy_map` → free field source |
| D1 | **Displace destination** (`field_dst:coord`) | destination | 🟢 `prd/PRD-displace-destination.md` | the one genuinely-new destination |
| E1 | Kuwahara / NPR (motion-coherent + juiced) | effect | 🟢 `prd/PRD-kuwahara-npr.md` | proposals gallery validated |
| E2 | Field-Solver Substrate | effect/infra | 🟢 `prd/PRD-field-solver-substrate.md` | keystone for sims; highest-risk surface |
| E3 | Self-steering distortion | effect | 🟢 `prd/PRD-self-steering-distortion.md` | rides U1+D1 |
| E4 | Physarum / foraging | effect | 🟢 `prd/PRD-physarum.md` | rides E2 |
| M1 | **Field Mixer** (combine fields before routing) | utility | 🟢 `prd/PRD-field-mixer.md` | **greenlit** — Depth×Flow, Tensor−Entropy |
| MO1 | **Composition Morph** (crossfade recipes) | composition | 🟢 `prd/PRD-composition-morph.md` | crossfade design answered (param+depth+`_mix` / output-dissolve) |
| XM1 | **Cross-Modal Route-Out** (field → audio) | framework ext | 🟢 `prd/PRD-cross-modal-routeout.md` | **greenlit, gated on seed presets** |
| C* | Compositions (recipes) | composition | 🟡 `CATALOG.md` | paint-then-glitch, depth diorama, etc. |
| X* | 🌱 Ideation backlog | — | 🌱 `CATALOG.md` §wild | semantic mod, sim-wavetable, learned fields… |

**Sequencing (CTO):** see **`BUILD-PLAN.md`** — phased P0→P7 with a `/review` checkpoint gate at each. K1 → U1 (+D1) → the effects that ride them. The framework's field-source path + `field_dst:coord` + `reduce` are load-bearing; everything else is cheaper once they land.

**UI:** device-rack + Photoshop-layers routing mockup (v2, plugin-styled). Route-out vs stack order resolved in `ARCHITECTURE.md §7` (forward = same-frame, backward = 1-frame feedback; position sets what a field reads).

---

## Open questions 🌱 (ideation — not yet decided)

- Are Utilities **operators** (source side) or **effects** (they also render)? Likely *both* — a field producer that can be dropped as an effect (output) or referenced as a source. How does that dual identity live in the stores?
- Preset routings: **bundled with the utility** vs **a separate "recipe" object**? (Leaning: recipe object = shareable, inspectable, remixable.)
- Suggestions: **static curation** vs **learned/ranked** ("people who mapped Tensor also mapped Displace")? Start static.
- Does `Displace` become one effect, or does *every* effect gain an optional coord-field input? (Trade-off: one clean node vs universal but heavier.)
- How far do we let a field route **out** of the visual domain — Tensor → audio param? (Cross-modal; ties to the sonification loop.)
