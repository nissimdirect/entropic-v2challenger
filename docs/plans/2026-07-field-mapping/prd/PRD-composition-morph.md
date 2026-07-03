# PRD — Composition Morph (crossfade between recipes)

> **Immutable stakeholder input** (exact quotes):
> - "composition morph is interesting how would crossfade work in practice?"
>
> _Type:_ composition · _Status:_ 🟢 drafted (design answer) · _Depends on:_ Mapping Framework (K1); compositions = saved edges

## 1. The question, answered: how crossfade works in practice
A composition is three things: **effect params**, **edge depths** (routings), and **which effects are present**. A morph between composition **A** and **B** is a single value `t ∈ [0,1]` that interpolates all three. Two modes, chosen automatically by whether the chains are compatible:

### Mode 1 — Parametric morph (same / compatible chain) · the default, cheap, musical
- **Numeric params:** lerp `A→B` by `t`. (blur radius 4→12, hue 0°→90°.)
- **Edge depths / min / max:** lerp by `t`. An edge only in A fades its depth `→0` as `t→1`; an edge only in B fades in from 0. *(Depth is continuous — this is why routings morph smoothly.)*
- **Effect presence (add/remove):** ramp the effect's **`_mix`** — the per-effect synthetic mix key the container *already* has (`registry.py` `KNOWN_SYNTHETIC_KEYS`). An A-only effect ramps `_mix 1→0`; a B-only effect ramps `0→1`. No new plumbing.
- **Enums / discrete params** (blend mode, waveform): can't lerp — **snap at `t=0.5`** (or hold-A-until-threshold, per-param policy).

### Mode 2 — Output morph (incompatible topology) · the always-works fallback
If A and B have different chain *order* or structurally incompatible graphs, you can't lerp structure. Render both chains and **dissolve their outputs** by `t` (a render-level A/B crossfade). ~2× cost; used only when Mode 1 can't apply. The UI tells the user which mode a given A/B pair will use.

### Driving `t`
`t` is **itself a mappable param** — an LFO / audio-follower / hardware knob / the morph handle drives it. So "morph to the drop on the beat" is just `audio.onset → morph.t`. This is the payoff: whole-look automation from one control.

## 2. Scope
- In: A/B snapshot capture; parametric morph (params + edge depths + `_mix`); auto mode-select; `t` as a mappable destination; the morph handle in the composition bracket UI.
- Out (🌱): >2-way morph (a morph "space"/pad); learned param-correspondence between very different chains; per-param morph curves (v2).

## 3. Composable parts 🔒
- Per-effect `_mix` (exists) = the add/remove ramp.
- `ModEdge.depth` (exists, continuous) = the routing morph.
- Project persistence = A/B snapshots are just saved edge/param sets.
- Compositor = Mode-2 output dissolve reuses existing blend.

## 4. Acceptance criteria (oracle)
- [ ] Parametric morph at `t=0` byte-identical to A; `t=1` byte-identical to B.
- [ ] An A-only effect at `t=1` is byte-identical to bypassed (via `_mix→0`).
- [ ] `t` driven by an operator round-trips save/load.
- [ ] Mode auto-select: compatible chains → parametric (asserted), incompatible → output-dissolve (asserted), no crash on mismatch.

## 5. Risks / open 🌱
- Enum snapping can pop mid-morph — per-param policy table needed; document which params are "snap" vs "lerp".
- Mode-2 cost: cap at 2 simultaneous chains; warn in UI.
- 🌱 A "morph pad" (2D between 4 compositions) is the exciting extension — park for v2.

## 6. Ancillary wins
`t`-as-mappable makes every saved look an automatable macro; the same machinery powers scene-launch crossfades for live/VJ use.
