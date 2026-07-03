# PRD — Structure-Tensor Utility

> **Immutable stakeholder input** (exact quotes):
> - "your one field many destinations demo is very cool make sure those routings are presets under the tensor mapping utility"
> - "displacement and hue shift are striking as is the actual heat map"
> - "make sure that we can actually have that as an output independently"
>
> _Type:_ utility (field producer) · _Status:_ 🟢 drafted · _Depends on:_ Mapping Framework (K1); reuses the Kuwahara tensor

## 1. Problem / why
The structure tensor (local orientation + coherence) is computed anyway for anisotropic Kuwahara — but it's **striking on its own** (the flow-hue heat map) and it's the source behind the "one field → many destinations" demo the user loved. Expose it as a first-class **utility**: a viewable output *and* a modulation source with preset routings.

## 2. What it does (scope)
- Computes `orientation θ` and `coherence` from the frame (Sobel → structure tensor → gaussian smooth).
- **Output mode:** renders the field (flow-hue map, or coherence grayscale) as a viewable effect. *(Satisfies "have that as an output independently.")*
- **Source mode:** exposes the field to the Mapping Framework with **preset routings**: `→ Displace (warp along grain)`, `→ Hue`, `→ Blur (coherence DoF)`, `→ Displace + Hue` (the striking pair).
- **Mask mode:** coherence as a gate ("affect only structured regions").
- Params: tensor sigma (smoothing scale), coherence gamma, output style (flow-hue | coherence | orientation-lines).
- **Out of scope:** the Displace destination itself (D1 PRD); self-steering feedback effect (E3).

## 3. Composable parts 🔒
- Reuses the exact `structure_tensor()` from the Kuwahara build (Sobel + `Jxx/Jyy/Jxy` + gaussian). One computation shared with `fx.kuwahara` (anisotropic mode).
- Registers via `backend/src/effects/registry.py` (`EFFECT_ID/NAME/CATEGORY/PARAMS`, pure `(frame,params,state)->(result,state)`).
- Field cache via `field_source.py` so output/mod/mask read one compute.

## 4. The three surfaces
- **Preset:** "Self-steering flow" / "One-field triptych" compositions in the Recipe library.
- **Suggested:** on the Tensor node, "route out ▸ Displace · Hue · Blur."
- **Full control:** sigma / gamma / output-style params + per-edge binding rule & curve in the matrix.

## 5. Design / architecture
- Deterministic (no RNG) → renders byte-identical; clears parity gate by construction.
- Output style is a param, not a separate effect (keep the registry tidy).
- The field is [0,1] coherence (scalar) *and* θ (angle) — Displace uses both (magnitude=coherence, direction=θ); Hue/Blur use coherence scalar.

## 6. Acceptance criteria (oracle)
- [ ] `fx.structure_tensor` registers and renders an output frame (smoke test).
- [ ] Deterministic: same input → identical output (hash test); preview == export.
- [ ] As a source: `Tensor → hue_shift.angle` preset materializes a valid `ModEdge` that round-trips save/load.
- [ ] As a source with `field_dst:coord`: `Tensor → Displace` warps along θ (pixel-diff vs reference).
- [ ] Coherence-as-mask gates an effect to structured regions (mask multiply test).

## 7. Risks & open questions 🌱
- Output-style-as-param vs three sibling effects — leaning one effect, param-switched.
- 🌱 Should the utility expose the raw θ and coherence as *two* separate sources (so users route them independently)? Probably yes — more expressive.
- Perf: Sobel + 3 gaussian smooths per frame; cheap, but confirm at 1080p against budget.

## 8. Ancillary wins
Free from the Kuwahara build; the heat-map output doubles as PopChaos album-art/promo material; the same tensor powers self-steering (E3) and tensor-kaleidoscope (B4) — one utility, several downstream effects.
