# Mapping Framework — Architecture

**Status:** part 🔒 (grounded), part 🌱 (ideation). This answers the direct questions raised: *where do preset routings live, are displacement/hue their own utilities, where are things exposed to be mapped, and how do suggestions / route-out work.*

---

## The mental model

```
   SOURCE (a field)          BINDING RULE           DESTINATION
   ─────────────────         ─────────────          ─────────────────────
   Structure Tensor    ──►   scanOver / remap  ──►  Displace  (coord field)
   Depth               ──►   sampleAt / ease   ──►  hue_shift.angle  (param)
   Optical Flow        ──►   integrate         ──►  blur.radius      (param)
   Physarum trail      ──►   reduce → scalar   ──►  LFO.rate  (an operator param)
   CLIP similarity     ──►   painted (gated)   ──►  any of the 6 axes
```

Every arrow is a **`ModEdge`** (`{src, src_axis, dst, dst_axis, binding_rule, depth}`) — the schema that **already exists**. The initiative adds new **sources**, one new **destination** (`Displace`), preset **bundles** of these edges, and a **UX** to discover them.

---

## 1. Where preset routings live 🔒→🌱

**Answer:** a **Routing Preset** — unified term **= composition = pre-routed chained preset** (one concept; see `prd/PRD-prerouted-presets-library.md`) — is a named bundle of `ModEdge`s (a saved sub-graph), attached to a Utility but stored as its own inspectable object.

- The Structure-Tensor utility ships presets: **`Tensor → Displace`**, **`Tensor → Hue`**, **`Tensor → Blur`** (the three from the "one field, many destinations" mock), and combos like **`Tensor → Displace + Hue`** (the striking pair).
- Selecting a preset **materializes real edges** into the modulation graph — which the user can then open in the `ModulationMatrix` and edit. *The preset is not a mode; it's a starting patch.* (Transparency invariant.)
- 🌱 Open: presets bundled *inside* the utility vs a global **Recipe library** (shareable `.recipe` objects). Leaning Recipe-library — it makes presets first-class, remixable, and community-shareable, and it's where Compositions live too.

## 2. Are displacement and hue their own utilities? 🔒

**Hue — already a destination, no new utility.** `hue_shift.py` exposes an `angle` param; `target_param_key: "angle"` on `hue_shift`'s effect id is a valid `ModEdge` destination *today*. So "map a field to hue" is a routing, not a new utility. Same for blur radius, saturation, grain, etc. — **most striking destinations already exist as effect params.**

**Displacement — the one genuinely-new destination.** A per-pixel coordinate warp is not a scalar param; it needs `field_dst: coord` (a reserved capability). Two shapes 🌱:
- **(a) A `Displace` utility/effect** — a node that takes a field input and warps the frame along it. Clean, discoverable, one place. *(Leaning this for v1.)*
- **(b) A universal coord-field input on every effect** — heavier, but "warp anything by anything." A v2 generalization.

So: **hue/blur/etc. = existing param destinations; displacement = a new `Displace` destination.** Both are "mappable"; they differ only in whether the destination already exists.

## 3. Where are destinations exposed to be mapped? 🔒

Three existing surfaces, extended:
- **Per-param map affordance** (in `ParamPanel` / effect UI) — a "map ▸" control on each param that opens a source picker. *(Extend: add the new field sources + a "map to Displace" for coord.)*
- **`ModulationMatrix.tsx`** — the grid of source × destination edges (surface 3 / under-the-hood). New field sources appear as rows.
- **`OperatorTopologyGraph.tsx`** — the node/route canvas; the visual "route out" from a source node to a destination. New field sources are nodes.

## 4. Suggestions & route-out 🌱 (the discovery layer the user asked for)

> "could also have suggestions in the actual effect UI that shows options of things to map it to or be able to route out."

Two complementary affordances:

- **Route-out from a source** — on a field-producer (Tensor/Depth/Flow), a **"route out ▸"** button lists suggested destinations with a one-tap preview: *"→ Displace (warp along grain) · → Hue (iridescent edges) · → Blur (coherence DoF)."* Each is a preset edge; accepting materializes it.
- **Suggested-inputs on a destination** — on any mappable param, a **"map from ▸"** list of relevant sources ranked by fit (e.g., a blur radius suggests Depth first — DoF; a kaleidoscope angle suggests Tensor).

Curation model 🌱: **v1 = static, hand-authored suggestion table** (source→destination affinities, with a one-line "what it does"). *Later* 🌱: rank by co-occurrence ("people who mapped Tensor→Displace also…") — but static first, no telemetry dependency.

**Agent-native note:** every suggestion is also an **agent-executable action** — the same "route out → Displace" an agent can perform via a tool. Keeps human and agent affordances at parity (the repo's agent-native principle).

---

## 5. The load-bearing wiring (build-first) 🔒

Two capabilities gate almost everything:
- **`field_dst: coord`** — lets a field target a per-pixel destination (Displace, and later warp-any-param). Flip `EXPERIMENTAL_FIELD_DST` + add the coord destination kind. *Unlocks the whole "field → displacement" column.*
- **`reduce(op)`** — collapse a field to a scalar (mean/max/peak) so a field can drive a *scalar* operator param (e.g., physarum density → LFO rate). *Closes the loop: fields modulate operators, not just effects.*

With those two + the existing `ModEdge`/`ModulationMatrix`, new utilities are "just" new source operators.

---

## 6. Data-flow sketch 🌱

```
Frame ─► [Utility: StructureTensor] ─► field(H,W) ──┐
                                                     ├─(as OUTPUT)  ─► viewable effect
         field ─► [reduce] ─► scalar ───────────────┤
                                                     ├─(as MOD SRC) ─► ModEdge ─► dst param
         field ─► [threshold] ─► mask ───────────────┘─(as MASK)    ─► routing.py painted
```
One producer, the triple-use fan-out. The Utility computes once; the three consumers (output/mod/mask) read the cached field.

---

## 7. Route-out vs. stack order — how the composed chain resolves 🔒→🌱

The render chain is **linear, left→right** (Ableton-style). The modulation graph is a **separate layer** on top. They interact by two rules:

1. **A Utility reads the frame at its slot.** Structure Tensor placed *after* Kuwahara computes its field from the *painted* frame; placed *before*, from the raw frame. So **position determines the field's input** — moving a utility up/down the stack changes what it sees. (This is the Photoshop "adjustment layer sees everything below it" intuition.)
2. **Route-out can target any device's param, regardless of position** — but direction sets timing:
   - **Forward edge** (utility → a *downstream* device): same-frame, causal. The field is ready before the target renders.
   - **Backward edge** (utility → an *upstream* device, i.e. feedback): auto-inserts a **single-tick delay** (uses the previous frame's field), using the existing cycle guard in `engine.py`. No manual work; the UI marks it "1-frame".

So the "stack order shakes out" as: **order controls what each field sees; route-out is free to point anywhere, with backward edges made feedback-safe automatically.** The UI should draw forward edges solid and backward edges dashed + "1f" so the timing is legible.

**Compositions** preserve stack order. **Morph** (see PRD) is param/depth/`_mix` space when two compositions share order (Mode 1), and an output-dissolve when orders differ (Mode 2) — so a morph never has to "reorder" a chain mid-transition.

🌱 Open: do we let a utility explicitly pick "read pre-chain (raw source)" vs "read at slot" as a toggle? Likely yes — a "tap point" selector — since some fields (a clean depth map) want the raw frame even when placed late.

## Open architecture questions 🌱

- **Field caching** — a field computed for output should be reused as mod-source + mask in the same frame (compute-once). Where does the per-frame field cache live — pipeline, or a `FieldProvider` (P6 already has `field_source.py`)? Likely extend `field_source`.
- **Cost budget** — a field as mod-source at per-pixel (`field_dst`) is heavier than a scalar edge. PERF-MODEL needs a field-edge class.
- **Determinism** — Tensor/Depth are deterministic; a sim field carries seeded RNG. Mark field sources by determinism so render-mode can gate.
- **Cross-modal route-out** 🌱 — should a visual field be routable to an *audio* param (Tensor→filter cutoff)? Ties to the sonification loop; big, exploratory.
