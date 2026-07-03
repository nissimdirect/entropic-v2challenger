# Catalog — utilities, destinations, effects, compositions

Everything we've come up with, with **composable parts** and **ancillary wins**. Status: 🔒 grounded · 🟡 scoped · 🌱 ideation.

---

## 1. Utilities (field producers) — triple-use (output / modulation / mask)

| Utility | The field | Output viz | Preset routings | Composable parts (reused elsewhere) | Ancillary wins |
|---------|-----------|-----------|-----------------|-------------------------------------|----------------|
| **Structure Tensor** 🟡 | orientation + coherence | flow-hue map (striking on its own) | → Displace (warp along grain) · → Hue · → Blur (coherence DoF) | the tensor also powers Kuwahara (anisotropic), self-steering, tensor-kaleidoscope | falls out of the Kuwahara build for free; deterministic |
| **Depth** 🟡 | monocular depth (DepthAnything) | inferno depth map | → Blur (rack focus / DoF) · → Displace (parallax) · → desaturate (aerial) · → mask (FG/BG) | depth also enables 3D lift, ControlNet cond., region routing | one ONNX model → depth + DoF + parallax + gating; RVM proves the sidecar path |
| **Optical Flow** 🟡 | per-pixel motion vectors | vector-hue map | → Displace (motion smear) · → any param (motion-reactive) | **already computed inside `datamosh`** — just expose it | zero new algorithm; unlocks motion-as-modulation DAW-wide |
| **Entropy** 🔒→🟡 | local information density | `entropy_map` (exists) | → gain · → mask (affect busy regions) | already an effect; expose as source | free — reuse existing effect as a field source |
| **Luminance / Sim fields** 🟡 | brightness / trail / velocity | existing | → anything | sim fields come from the field-solver substrate | sims become modulation sources (A6) |

## 2. Destinations

| Destination | Kind | Exists today? | Note |
|-------------|------|--------------|------|
| **Effect params** (hue angle, blur radius, saturation, grain, opacity, kaleido sides…) | scalar / axis | 🔒 **yes** — valid `target_param_key` now | most striking destinations are already mappable |
| **Displace** (per-pixel coord warp) | coord field | 🟡 needs `field_dst: coord` | the one genuinely-new destination |
| **Operator params** (LFO rate, envelope…) | scalar | 🔒 yes (needs `reduce` to feed from a field) | fields modulate operators → feedback ecosystems |
| **Instrument triggers / axis values** | trigger / axis | 🔒 partial | granulator grain params, sampler speed… |

## 3. Effects (finished looks) — from the research

Kuwahara/NPR (motion-coherent + juiced) · Self-steering distortion · Physarum / foraging · Curl-noise fluid · Lenia · Wave-ripple · Anisotropic-Kuwahara · Depth-gated composites · Motion wet-paint. (Full provenance + novelty in the research docs.)

---

## 4. Compositions (recipes) — the guided outcomes 🟡

Every composition (**= routing-preset = pre-routed chained preset**, one unified concept — see `prd/PRD-prerouted-presets-library.md`) = an **inspectable saved routing** (open it, see the edges, remix). This is the "guide to cool outcomes without being obtuse" layer.

| Composition | The stack | What it gives | Under-the-hood |
|-------------|-----------|---------------|----------------|
| **Paint-then-glitch** | Kuwahara → channelshift → row_shift | painted canvas, then corrupted — the signature look | 3 effects, no routing; the base coat is the trick |
| **Rack focus** | Depth → Blur (+ aerial desat) | cinematic depth-of-field, focus pulls through the scene | 1 field, 2 edges; focal plane on an audio-follower = focus on the beat |
| **Self-steering flow** | Tensor → Displace (feedback) | image flows along its own grain (liquid metal) | tensor is free from Kuwahara |
| **One-field triptych** | Tensor → Displace + Hue + Blur | one heat-map driving three params at once (the mock) | the "modulation matrix" made concrete |
| **Depth diorama** | Depth layers + Kuwahara + optical-flow wet-paint | a moving painted 3D scene | second-order — only possible with 3 modules |
| **Structure-reactive glitch** | Tensor coherence → datamosh strength | corruption follows the image's forms | field-as-mod on an existing effect |
| **Living portrait** 🌱 | RVM subject + physarum foraging on subject + depth parallax | the subject dissolves into a living network in fake 3D | needs substrate + depth |

🌱 Composition ideation: an **agent that suggests a composition** from a source clip ("this footage has strong motion → try structure-reactive glitch"); "composition morph" (crossfade between two whole recipes).

---

## 5. Ancillary wins (things that fall out for free)

- **Structure tensor is dual-purpose** — computed for Kuwahara, reused as a utility, a steering field, and a mask. One computation, ~5 features.
- **Optical flow already exists** inside `datamosh` (real Farneback) — exposing it is near-zero-cost and unlocks motion-as-modulation everywhere.
- **`entropy_map` already an effect** → free field source.
- **Per-mapping `curve` already exists** → easing on edges is partly done.
- **RVM proves the ONNX sidecar path** → depth/CLIP reuse that plumbing.
- **The topology graph + ModulationMatrix already exist** → the "under-the-hood" surface is partly built.
- **Presets are just saved edges** → sharing/versioning presets reuses project persistence, no new format.

## 6. Ecosystem uses (across the DAW and beyond)

- **Live / VJ** — field-as-modulation makes everything audio-reactive without per-effect wiring; compositions = instant-recall scenes; hardware (H-series MIDI) maps to field depths.
- **Export / render** — deterministic utilities (tensor/depth) render byte-identical; sim fields flagged for render-mode determinism.
- **Music/label pipeline** — the striking outputs (tensor heat-map, depth map, self-steering) are album-art / promo-video generators on their own (the user's PopChaos content).
- **Agent-native** — every routing/suggestion is an agent-executable action → an agent can build a composition from a text goal ("make it look painted and 3D").
- **Community** — inspectable presets/compositions = a shareable recipe ecosystem (ties to the ISF/SSF import idea from the research).

---

## 7. Wild-ideas backlog 🌱 (ideation — not scoped, keep for later)

- **Semantic modulation (CLIP)** — modulate by meaning. The industry-first swing.
- **Sim-as-wavetable** — scrub a simulation's time like a wavetable axis (synth-paradigm).
- **Cross-modal route-out** — a visual field drives an audio param (Tensor → filter cutoff); the sonification loop.
- **Field arithmetic** — combine fields (Depth × Flow, Tensor − Entropy) before routing — a "field mixer" utility.
- **Learned fields** — the reserved `learned` binding rule; a small net that outputs a field trained on a target look.
- **Field recorder** — bake a field to a clip so expensive producers (depth) run once, then scrub.
- **"Explain this look"** — reverse: given an output, an agent annotates which edges/fields produced it (transparency taken to its conclusion).
