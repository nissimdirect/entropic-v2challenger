# Mad-Scientist × CTO — Cross-Module Capability Catalog

**Date:** 2026-07-03 · **Track:** research/planning, **parallel** to the 4 keystone builds (not a build itself — plan first).
**Collab:** mad-scientist (generate wild cross-module combinations) × CTO (feasibility, cost, reuse-don't-rebuild).

## Thesis (CTO)

The four approved keystones — **(1)** a GPU field-solver substrate, **(2)** the binding-rule routing layer, **(3)** vision channels (depth/landmarks/CLIP/optical-flow), **(4)** the L-axis — plus the shared-atom library we already own (`remap_frame` advection, `fbm`/curl noise, the Kuwahara sector-kernel → a **free structure tensor**, `attractor_solver`, masking) create a **combinatorial surface**. Most ideas below are **new *wiring*, not new engines** — they re-use modules already scoped. That is the whole point: per the "don't rebuild what exists" rule, the cheapest novelty is *recombination*. Each item is graded: **leverage** (modules reused), **cost** (given the keystones land), **reuse** (no rebuild), **determinism**, **novelty**.

Legend: 🟢 buildable now / cheap · 🟡 medium · 🔴 needs AI sidecar · ⭐ mad-scientist "industry-first" swing · 🎬 mocked (real render) · 💡 concept mock.

---

## Tier A — free riders on the keystones (buildable now, cheap, novel)

### A1 · Self-steering distortion ⭐🎬
**Concept:** the Kuwahara build already computes a **structure tensor** (local orientation + coherence). Expose it as a **flow field** and advect/warp the image *along its own grain*. The picture distorts following its own forms — liquid-metal, silk, marbled.
**Re-wires:** structure tensor (free from Kuwahara) → `remap_frame` advection → feedback. **Zero new engine.**
**CTO:** leverage=high · cost=🟢 tiny · reuse=100% · deterministic=yes. **Novelty:** high — a self-referential warp; the distortion field *is* the image.

### A2 · Depth-as-an-axis (depth-gated / depth-ramped effects) 🎬
**Concept:** bind ANY effect's intensity to the depth channel. Paint the foreground, datamosh the background; granulate only near objects; blur by distance. A whole family from one wiring.
**Re-wires:** vision `depth` source → `painted`/`scanOver` binding rule → any existing effect + masking.
**CTO:** leverage=high · cost=🟢 (once depth ships) · reuse=100% · deterministic=yes (given depth). **Novelty:** high — turns the flat 155-effect library depth-aware with no new effects.

### A3 · Emergent foraging — sims that eat your other modules ⭐🎬
**Concept:** physarum/boids whose **sensor field is another module's output** — the audio spectrum (F-axis), the depth map, optical flow, or another effect's frame. Slime that traces the image's forms / dances to the beat / follows motion.
**Re-wires:** field-solver substrate + any field as the "food" input. One substrate, many behaviors.
**CTO:** leverage=very high · cost=🟡 (needs substrate) · reuse=high · deterministic=seeded. **Novelty:** high — cross-modal emergent systems; no VJ tool wires audio/depth *into* the agent physics like this.

### A4 · Motion wet-paint (Kuwahara advected by optical flow) 🎬(shown in proposals)
**Concept:** the temporally-coherent Kuwahara buffer, advected by optical flow, so brushwork **flows with the footage** — living oil paint. Already demonstrated in the proposals gallery.
**Re-wires:** Kuwahara + optical-flow + feedback substrate. **CTO:** 🟢–🟡 · reuse=high. **Novelty:** high (signature look).

### A5 · Structure-tensor as a universal steering source
**Concept:** generalize A1 — the orientation field drives *any* field-consuming effect: `domain_warp`, `pixel_flow_field`, kaleidoscope segment angle, physarum heading bias.
**Re-wires:** tensor → binding router → many effects. **CTO:** 🟢 · reuse=100%. **Novelty:** medium-high (one source, everywhere).

### A6 · Field-as-modulation-source
**Concept:** any sim's trail/velocity field becomes a **modulation source** — `reduce()` it to a scalar to drive an LFO/param, or `field_dst` it as a per-pixel map. Closes the loop: effects modulate effects.
**Re-wires:** field-solver output → `reduce`/`field_dst` binding rules → operator layer. **CTO:** 🟢 (needs `reduce`/`field_dst`) · reuse=high. **Novelty:** high (the mod-bus the synth-paradigm vision asked for).

---

## Tier B — buildable now, medium cost

### B1 · Sim-as-wavetable axis ("scrub the simulation") ⭐💡
**Concept:** treat a simulation's **time** as a scrubbable, modulatable axis — a *wavetable of states* (reaction-diffusion / fluid / physarum evolution) you scrub, loop, or drive with an LFO. This is the synth-paradigm thesis (wavetable-axes) applied to the field-solver. The running physarum/fluid loops in the proposals gallery already prove the substrate produces scrubbable state.
**Re-wires:** field-solver substrate + Frame-Bank/Wavetable instrument. **CTO:** 🟡 (state caching) · reuse=high · deterministic=yes. **Novelty:** high — directly extends the user's own vision doc.

### B2 · Feedback ecosystems / mod-bus loops
**Concept:** route module outputs back as modulation sources into effects **and themselves** (single-tick delay), building self-evolving patches — the modular-synth feedback the vision doc anticipated.
**Re-wires:** operator graph + single-tick delay (cycle-handling already exists in `engine.py`). **CTO:** 🟡 · reuse=100%. **Novelty:** high.

### B3 · `pathMorph` binding rule (Dubins-curve morphs)
**Concept:** a new binding-rule mode that morphs between two clips/shapes via optimal point-correspondence + min-curvature paths — smooth, non-teleporting morphs. (Verified fringe technique, Zach Lieberman.)
**Re-wires:** new binding rule in `resolve_axis_binding`. **CTO:** 🟡 · reuse=high. **Novelty:** high (a routing primitive, not an effect).

### B4 · Structure-tensor kaleidoscope / polar
**Concept:** orientation field drives kaleidoscope symmetry order or the `polar` reparameterization — radial patterns that track the image's grain.
**Re-wires:** tensor + `polar` binding rule + kaleidoscope. **CTO:** 🟢–🟡 · reuse=high. **Novelty:** medium.

### B5 · Cross-modal sonification loop
**Concept:** image → scale-quantized MIDI events (Function Store TopToMidi pattern) → those events drive audio-reactive effects → closes an **audio↔visual feedback loop** inside one tool. Ties into your active LayerTap routing + H-series MIDI.
**Re-wires:** `sampleAt` pixel readout → note events → audio-follower → effects. **CTO:** 🟡 · reuse=high. **Novelty:** high.

---

## Tier C — needs the AI / L-axis sidecar (higher cost, biggest upside)

### C1 · Semantic modulation (CLIP-as-mod-source) ⭐💡
**Concept:** drive any parameter by **semantic similarity** to a word or image — "distort more the more it looks like fire," "granulate when it stops looking like a face." Modulation by *meaning*.
**Re-wires:** CLIP operator → binding router. **CTO:** 🔴 (needs CLIP sidecar) · reuse=high. **Novelty:** very high — no video tool modulates by semantics. The single most novel swing here.

### C2 · Latent granulator
**Concept:** the granulator instrument, but grains are points in **CLIP/latent space** — granular synthesis of meaning, not frames.
**Re-wires:** granulator + L-axis. **CTO:** 🔴 · reuse=medium. **Novelty:** very high.

### C3 · Audio-driven prompt-travel (the FM jump)
**Concept:** an LFO/audio-follower scrubs a diffusion prompt/latent interpolation — L becomes a **modulation destination**. The FM-synthesis-level jump the vision doc anticipated.
**Re-wires:** L-axis diffusion + existing operators. **CTO:** 🔴 · reuse=high. **Novelty:** high.

### C4 · ControlNet-from-effects
**Concept:** existing effects (edge_detect, entropy_map, depth, RVM matte) become **ControlNet conditioning** for the diffusion pass — the 155 effects become diffusion *controllers*.
**Re-wires:** effects → ControlNet input of the diffusion sidecar. **CTO:** 🔴 · reuse=very high. **Novelty:** high.

---

## CTO synthesis — recommended build order

1. **Tier A rides free with the keystones.** A1/A2/A5/A6 are wiring on top of Kuwahara + depth + the binding router + the substrate — schedule them *as* those land, not as separate projects. Highest ROI in the catalog.
2. **Tier B when the substrate is stable.** B1 (sim-wavetable) and B2 (mod-bus loops) are the synth-paradigm payoff; B3/B5 are routing adds that compound the library.
3. **Tier C gated on the diffusion/CLIP sidecar spike** (the same spike that gates proposal #4). Don't start until latency is proven.

## Mad-scientist picks — the three swings worth taking

- **A1 Self-steering distortion** — elegant, free, and genuinely novel (the warp field *is* the image). Mocked.
- **B1 Sim-as-wavetable axis** — the clearest expression of the user's own synth-paradigm; turns simulations into playable instruments.
- **C1 Semantic modulation (CLIP)** — the industry-first swing: modulation by meaning. Needs the sidecar, but nothing else on the market does it.

**Mocks rendered 2026-07-03** (`madsci_mocks.py`, standalone): A1 self-steer, A2 depth-gate, A3 foraging — real algorithms on `grasp.JPG`. See the gallery artifact. Sim-wavetable (B1) + Tier C are concept-only pending the substrate / sidecar.
