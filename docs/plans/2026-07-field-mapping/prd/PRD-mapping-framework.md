# PRD — Mapping Framework (the keystone)

> **Immutable stakeholder input** (exact quotes):
> - "i like the depth as a modulation source… things like that are cool"
> - "make sure those routings are presets under the tensor mapping utility"
> - "where are those exposed to be mapped? could also have suggestions in the actual effect ui that shows options of things to map it to or be able to route out"
> - "smart but transparent… we don't want to be obtuse but we want to guide people to cool outcomes and also allow for people to really get under the hood"
>
> _Type:_ framework · _Status:_ 🟢 drafted · _Depends on:_ existing `ModEdge`/`ModulationMatrix` (real), `EXPERIMENTAL_FIELD_DST`

## 1. Problem / why
Creatrix can already route a scalar operator (LFO, video_analyzer) to an effect param via `ModEdge`. But it can't yet: (a) treat an arbitrary **2D field** (depth, tensor, flow) as a source, (b) drive a **per-pixel destination** (displacement), (c) offer **presets** or **suggestions** so people find good routings without reading a manual. This framework adds those — turning a fixed effect library into a patchable instrument, with a guided front door.

## 2. What it does (scope)
- **Field sources:** a new operator family whose output is a 2D field, plugging into the existing `mappings[]`/`ModEdge` system. (Utilities register as sources.)
- **`field_dst: coord`:** a per-pixel coordinate destination (enables Displace) — flip `EXPERIMENTAL_FIELD_DST`, add the coord destination kind in `routing.py`.
- **`reduce(op)` binding rule:** collapse a field → scalar (mean/max/peak) so a field can drive a *scalar* param (operator or effect).
- **Routing presets:** named bundles of `ModEdge`s (saved sub-graphs) that materialize real, editable edges.
- **Suggestion / route-out UX:** "route out ▸" on sources, "map from ▸" on params, from a static affinity table.
- **Out of scope:** the individual utilities (own PRDs), learned/ranked suggestions (v2), cross-modal (audio) destinations (🌱).

## 3. Composable parts (reuse, don't rebuild) 🔒
- `backend/src/modulation/schema.py::ModEdge` — the edge already exists; add `reduce` to `BindingRule`, ungate `field_dst`.
- `backend/src/modulation/routing.py::resolve_axis_binding` — add `reduce` + the coord field-dst branch (the `_IMPLEMENTED_BINDING_RULES` seam).
- `frontend/.../stores/operators.ts` `mappings[]` + `OperatorMapping` — field sources are operators; presets append edges here.
- `ModulationMatrix.tsx` + `OperatorTopologyGraph.tsx` — surface 3, already built; new sources appear as rows/nodes.
- `backend/src/effects/field_source.py` (P6) — extend as the per-frame **field cache** (compute-once, triple-use).

## 4. The three surfaces
- **Preset:** pick "Rack focus" → materializes `Depth → blur.radius` edges. One click.
- **Suggested:** on a Depth source, "route out ▸ Blur (DoF) · Displace (parallax) · Desaturate (aerial)."
- **Full control:** open `ModulationMatrix` → every edge's binding rule / curve / depth / min-max, editable.

## 5. Design / architecture
- Field sources emit a cached `field(H,W)` (float32, [0,1] or vector). Consumed as output / mod-source (`ModEdge`) / mask.
- `field_dst: coord` returns a 2-channel (dx,dy) destination the compositor applies via `remap_frame` (existing atom).
- `reduce` mirrors `broadcast` in `routing.py` but N→1.
- Presets = JSON list of `ModEdge` dicts + metadata; stored in the project (reuse persistence) or a Recipe library 🌱.
- **Transparency invariant (hard requirement):** a preset must produce only normal, user-editable edges — no hidden state. Test: after applying a preset, deleting all its edges returns to baseline byte-identically.

## 6. Acceptance criteria (oracle)
- [ ] `resolve_axis_binding(..., binding_rule="reduce")` returns the correct scalar (unit test, exact values).
- [ ] With `EXPERIMENTAL_FIELD_DST=on`, a field routed to a `Displace` coord-dst warps the frame; off → rejected (no silent partial render).
- [ ] Applying then fully removing a preset is byte-identical to never applying it (transparency invariant test).
- [ ] A field source → effect param round-trips through save/load (schema + persistence test).
- [ ] Determinism: tensor/depth-driven edges render byte-identical preview vs export.

## 7. Risks & open questions 🌱
- Per-pixel field edges are heavier than scalar edges → needs a PERF-MODEL field-edge class + budget guard (P6 has precedent).
- Preset storage: in-project vs shared Recipe library — decide with U1.
- Suggestion affinity table: hand-authored v1; who curates, how it's kept fresh.
- 🌱 Should `reduce` expose *where* (a probe point / region) it samples, or always whole-field? Probe = more musical.

## 8. Ancillary wins
Once this lands, every utility is "just" a new source; every striking destination (hue/blur/…) is already mappable; compositions become shareable saved edges; and agents get a routing API for free (each preset/suggestion = an agent action).
