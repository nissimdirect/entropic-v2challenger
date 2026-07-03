# Field-as-Modulation — the cross-DAW enablement map

**Date:** 2026-07-03 · **Track:** planning (no build). Follows the mad-scientist × CTO catalog.
**Prompted by:** "I like depth as a modulation source… things like that are cool. What are the implications across sources — how does implementing these enable other things across the DAW?"

---

## The meta-unlock: **any field is a modulation source**

Depth-as-a-modulation-source isn't one feature — it's the **gateway example of the single highest-leverage capability in the whole study.** The moment the binding-rule router accepts *any 2D field* as a source, you get a combinatorial matrix:

```
{ fields }              ×   { destinations }        ×  { binding rules }
depth                       any effect param            broadcast
structure-tensor coherence  any of the 6 axes           sampleAt
optical-flow magnitude      displacement (coord field)  scanOver
physarum trail / sim field  blur / hue / grain / gain   integrate
entropy_map                 mask / gate                 remap(curve)
spectral-band energy (F)    instrument trigger          ease / derivative
RVM matte / luminance       diffusion prompt weight     painted / polar …
CLIP semantic similarity
```

`depth → focus` is **one cell** of that matrix. `structure-coherence → displacement` is another (mocked). There are hundreds. This is what converts Creatrix from a *fixed effect library* into a *patchable modular instrument* — the DAW-wide superpower. Everything below is a consequence of this one idea.

## The **triple-use field** principle (why each field pays for itself 3×)

Every field Creatrix can compute is usable **three ways at once**, from one producer:

| Use | What it is | Example |
|-----|-----------|---------|
| **1. Output** | a viewable effect in its own right | `fx.depth_map`, `fx.structure_tensor`, flow viz, entropy map |
| **2. Modulation source** | routed to any param via the binding rules | depth→blur, tensor→displace, flow→everything |
| **3. Mask / gate** | region routing, per-band effect | paint FG / mosh BG, effect only where coherent |

So building **one** field-producer (depth, tensor, flow, a sim) yields **three** capabilities. That's the leverage — and it's why your instinct to expose depth + tensor as **independent outputs** is architecturally right: build the producer once (shared helper), consume it as output + modulation + mask.

---

## Enablement graph — what each keystone unlocks downstream

The keystones aren't isolated features; each is a **field producer** that lights up a cascade.

### Binding-rule router + field-as-source  →  *the enabler for all of it*
Unlocks: depth-mod · tensor-mod · flow-mod · sim-mod · audio-spatial-mod · semantic-mod · **self-mod** (an effect's own output modulates its params). Combinatorial. **Build-first.**

### Structure tensor (falls out of the Kuwahara build)
→ self-steering distortion (A1) · flow-aligned Kuwahara (better NPR) · tensor kaleidoscope / polar (B4) · **coherence-as-modulation** (the field-matrix mock) · tensor-as-mask ("only affect structured regions"). *One computation, five features.*

### Depth (vision channel)  ← **your favorite**
→ depth-as-axis / depth-gating (A2) · **rack-focus & depth-of-field** (N1, mocked) · aerial-perspective grade · 2.5D parallax · 3D point-cloud lift · depth-region routing · **depth-conditioned diffusion** (ControlNet). *A flat frame becomes spatially aware everywhere.*

### Field-solver substrate
→ the emergent sims (physarum/fluid/Lenia/wave) · **their fields become modulation sources** (A6) · GPU-upgrades the existing scipy RD/CA · sim-as-wavetable (B1). *One engine, a whole subsystem — plus every sim is also a mod source.*

### Optical flow (already real inside `datamosh`, just needs exposing)
→ motion wet-paint (A4) · motion-steered physarum · **motion-as-modulation** (the whole DAW reacts to movement in the footage) · better datamosh. *Expose the field you already compute → it feeds everything.*

### L-axis (diffusion / CLIP)
→ semantic modulation (C1) · prompt-travel driven by audio (C3) · ControlNet-from-effects (C4) · latent granulator (C2). *The empty axis becomes the richest modulation source of all — meaning.*

---

## Cross-source chains (module → module → module)

The interesting behavior is where fields **feed each other**:

- `depth → mask → routing → any effect` — three modules chain into depth-aware everything.
- `tensor → steering → advection / physarum` — the image's own grain drives the sims.
- `optical-flow → {advect Kuwahara, steer physarum, modulate params}` — **one field, many consumers** at once.
- `sim field → modulation → warps footage → re-analyzed → sim` — a **feedback ecosystem** (B2), self-evolving.
- `RVM matte → depth → CLIP` — subject, distance, and meaning stacked into one conditioning signal.

## Second-order capabilities (emerge only because the modules coexist)

These aren't on any single tool's roadmap — they exist only when the fields can be freely cross-wired:

- **Semantic depth-of-field** — CLIP finds the subject, depth says how far, focus follows *meaning*.
- **Audio-reactive rack focus** — the audio-follower drives the focal plane through depth (the mocked rack focus, but the focal plane is on the beat).
- **Motion-painted diorama** — depth layers + Kuwahara paint + optical-flow wet-paint = a moving painted 3D scene.
- **Living portrait** — RVM subject matte + physarum foraging on the subject + depth parallax.
- **Structure-reactive glitch** — datamosh strength driven by tensor coherence, so corruption follows the image's forms.

---

## CTO implication for sequencing

The enablement graph says **the router's field-as-source capability is the true keystone** — more than any single effect. Recommended emphasis:

1. **Ship field producers as shared helpers with the triple contract** (output + modulation + mask) from day one — depth, structure-tensor, optical-flow (expose the one already inside datamosh), entropy (already an effect). Cheap, and each pays 3×.
2. **The binding-router `field_dst: coord` + `reduce` rules are the load-bearing wiring** — they're what let a field drive a per-pixel param or collapse to a scalar for an LFO. Prioritize them over any individual effect.
3. Then the second-order capabilities cost almost nothing — they're patches, not builds.

**Bottom line:** you're not adding effects, you're making **every signal in the DAW routable to every other**. Depth-as-modulation is the first, most tangible taste of it — and the reason to build the router's field-source path before the shiny effects.

*Mocks (`next_mocks.py`, 2026-07-03): N1 depth-as-modulation rack focus (mock depth), N2 field→many-destinations matrix (real structure tensor). See gallery.*
