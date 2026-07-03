# VJ / TouchDesigner Recipe Cannibalization → Creatrix

**Date:** 2026-07-03
**Author:** research pass (5 parallel agents: TD routing/CHOP paradigms, TD feedback/GPU sims, TD community toolkits, new VJ tools 2022–2026, livecoding/shader atoms) + main-context web research, all grounded against `backend/src/effects/` and `backend/src/modulation/routing.py`.
**Scope:** find techniques/primitives from the TouchDesigner community + the new wave of VJ/AI tools that Creatrix does NOT have, and that port as (a) new **routing styles** / binding rules, (b) new **effects**, (c) new **modulation operators**, (d) new **instruments/render-modes**, or (e) **L-axis / realtime-AI** features. Bias: **base-level primitives that STACK**, per the brief.

> **⚠️ CORRECTION (2026-07-03, code-verified — supersedes earlier draft).** The first draft leaned on subagent greps of `fx/*.py` alone and over-stated several gaps. Ground truth from the codebase: **Creatrix DOES have generators** (`generator`/`creative` effect categories; synthesizing effects `noise`/`tv_static`/`shape_overlay`/`strange_attractor`/`reaction_diffusion`/`crystal_growth`; a **Wavetable / Frame-Bank generator-instrument**), **DOES have instruments** (Sampler, Granulator, Frame-Bank/Wavetable — Drum Rack pending), **DOES have a block mosaic** (`block_crystallize`, block-average with `block_size`), **DOES have 8 compositor blend modes** (`normal/add/multiply/screen/overlay/difference/darken/lighten` in `backend/src/engine/compositor.py:101` — incl. `difference`), and **3 transitions** (not 2). Claims below are re-scoped accordingly; each gap is tagged **[verified-gap]**, **[partial]**, or **[audit]**.

---

## PART II — CODE-VERIFIED REASSESSMENT (read the implementations, not the outcomes)

The first pass compared at the **outcome** level ("do we have an X-looking effect?"). Reading the actual algorithms flips much of it. The honest reframe:

**Creatrix is not a thin effect app missing primitives. It is a deep, idiosyncratic 155-effect library on top of a *mature* modulation graph and a *reusable shared-atom layer*.** The research over-indexed on effect breadth (where you are already rich) and under-appreciated the routing/field machinery.

### What's actually under the hood (verified by reading the code)

| Comparable | How Creatrix ACTUALLY builds it | Verdict |
|---|---|---|
| Optical flow | `datamosh.py` uses **real `cv2.calcOpticalFlowFarneback`** + accumulation | **HAVE (real)** — gap is only *exposing flow as a reusable modulation source*, not the algorithm |
| Reaction-diffusion | `reaction_diffusion.py` = **real Gray-Scott**: scipy `convolve` Laplacian, `mode="wrap"`, `steps_per_frame` iterated, A/B fields ping-ponged via `state_in/state_out` | **HAVE (real iterative solver)** |
| Cellular automata | `cellular_automata.py` = **real Life**: `convolve2d` neighbor kernel, grid ping-pong, multiple rulesets | **HAVE (real)** |
| Domain warp | `domain_warp.py` = `remap_frame(frame, fbm_dx, fbm_dy)` — composes two shared atoms: `fractal_noise_2d` (real fBM, octaves/persistence) + `remap_frame` (cv2.remap, wrap/mirror/clamp) | **HAVE** — gap is only *warp-by-external-field* (Hydra `modulate()`) vs internal fBM |
| Value/fBM noise | `shared/noise_generators.py` — real value noise (bilinear+smoothstep) + fBM | **HAVE** — missing only curl-noise (divergence-free) + simplex |
| Displacement/advection | `shared/displacement.py::remap_frame` — the reusable warp atom every physics effect calls | **HAVE (single-step)** — see the real gap below |
| Curve/LUT | `util/curves.py` — points→cubic/linear LUT | **HAVE** — reuse it for a `remap`/`ease` binding rule |
| 2D→3D | `extrude_spin.py` lifts 2D→spinning 3D | **HAVE (partial)** |
| Fluid | `pixel_superfluid.py` = displacement-remap with vortex cores (`make_physics_state`/`remap_frame`) — **NOT** a solver | **displacement look, not physics** |
| Crystal/DLA | `crystal_growth.py` = probabilistic seed+branch growth | **HAVE the branching look**; random-walker DLA is partial |

### The ONE architectural gap that actually dominates

**There is no general iterative field-solver substrate — and no GPU one.** The bespoke solvers (RD, CA) prove the *pattern* works on CPU/scipy, but each is hand-rolled. And the "GPU" path (`field_codegen.py`, P6.5) is **not** a compute substrate — it renders the effect twice on CPU at `p_min`/`p_max` and MLX-*lerps* per pixel (`out = lerp(E_min, E_max, F)`); its own docstring says "True per-effect shader transpilation is a Tier-2 follow-up, deliberately out of scope." MLX/Metal is used only for that lerp, spectral DCT, and frame_bank.

**Consequence:** a single missing facility — a **persistent GPU (MLX/Metal) ping-pong field + per-step compute kernel + feedback** — is what blocks the *entire* class of emergent systems the library lacks, and would upgrade the existing CPU-scipy RD/CA to GPU for free:
- semi-Lagrangian **fluid** advection + Jacobi **pressure projection** (true Navier-Stokes)
- **physarum** (agent deposit → diffuse → decay) and **boids/flocking** (no agent/particle-texture substrate exists; current particles are *projected*, not simulated with sensors)
- **Lenia** (large-kernel continuous CA — you have only Gray-Scott + Life)
- **wave-equation ripple** (2nd-order; `wave_distort` is procedural sine)
- **curl-noise** advection

This is the real "base-level thing that stacks": **build the substrate once → it hosts a dozen looks and upgrades two existing effects.** The outcome-level research completely missed this because from the outside "we have reaction-diffusion and a superfluid" looks like coverage; under the hood, one is a real solver and the other is a remap trick, and neither is a reusable substrate.

### So the three genuine opportunity clusters (not a laundry list)

1. **A GPU iterative field-solver substrate** → unlocks fluid / physarum / boids / Lenia / wave-ripple / curl-noise, and GPU-upgrades RD/CA. *(effects/architecture)*
2. **Routing/binding-rule vocabulary** — the effect library outpaces the routing layer. 4 rules + banded Y/X lanes + a signal `processor` (smooth/quantize/scale/threshold) is mature but narrow; the Hydra-`modulate*` / TD-CHOP vocabulary (per-pixel coord-field, remap/LUT via existing `curves.py`, ease, derivative, combine-as-routing, polar, axisCast, reduce, trail/scrub) composes over the **155 existing effects** for combinatorial payoff with little new effect code. *(routing)*
3. **The L (latent) axis** — genuinely empty (RVM only), strategically the biggest. Verified indie ports exist (below). *(L-axis)*

### Verified indie-dev finds (GitHub, each repo fetched live 2026-07-03)

The rigorous pass *corrected the earlier hallucinations* (LYNX doesn't exist; "T3KRA"=garbled `t3kt`; "Vince Allen"=a JS lib; EnviroModalSystems→EnviralDesign; keijiro has no TD repos). Confirmed steal-first, on real repos:

| Primitive | Verified repo (stars) | Creatrix target | Novelty |
|---|---|---|---|
| **Diffusion-in-the-loop** (img2img per-frame, workflow-JSON→params, WebSocket) | olegchomp/TDComfyUI (262★) | `diffusion_bridge` instrument — L-axis | fills the L gap directly |
| **Live monocular depth** (Depth Anything, ONNX→TensorRT) | olegchomp/TDDepthAnything (180★) | `depth` source → mask/displacement | new per-pixel channel |
| **Zero-copy CUDA↔tensor bridge** | IntentDev/TopArray (40★) | infra for the reserved **`learned`** binding slot | unlocks ML routing cheaply |
| **Physarum agent trail sim** | DBraun/TouchDesigner_Shared (999★) | first tenant of the field-solver substrate (#1) | distinct sim class |
| **Jump Flood Algorithm** (distance-field/Voronoi, GPU) | DBraun (999★) | operator: nearest-seed field, dual-use as routing source | new |
| **Anisotropic Kuwahara** (structure-tensor NPR) | yeataro/TD-Anisotropic-Kuwahara (129★) | `anisotropic_kuwahara` stylize effect | **genuinely absent** — no NPR/painterly effect exists |
| **Body/hand/face landmarks** (browser-WASM inference) | torinmb/mediapipe-touchdesigner (~2.5k★) | `landmarks` modulation source | new (RVM is mask-only) |
| **FleX/Bullet solvers** as native ops | vinz9 FlexCHOP (148★)/BulletCHOP | `physics_solver` instrument | true constraint solver |
| **SDF node-graph compiler** | t3kt/raytk (344★) / shader-park (144★) | composable SDF generator | partial (fixed SDF-ish effects exist) |

### Verified fringe / individual-artist techniques (each traced to a fetched source, 2026-07-03)

Genuinely-absent capability classes, not restyles of existing effects:

| Technique | Fetched source | Base stackable primitive | Creatrix target | Novelty |
|---|---|---|---|---|
| **Kuwahara / Anisotropic-Kuwahara painterly** ⭐ *(found by 2 independent agents)* | yeataro repo + Heckel article | structure-tensor sector-variance filter | `kuwahara_paint` stylize effect — the one credible **non-diffusion "style transfer"** | **yes** — no NPR/painterly class exists |
| **Wave Function Collapse** texture synth | github.com/mxgmn/WaveFunctionCollapse | entropy-ranked constraint solver | generator; natural tenant of the reserved **`learned`** slot | **yes** — no constraint synthesis anywhere |
| **Chladni-plate audio field** | didgety.github.io chladni sim | harmonic-eq → velocity field → particle advect | generator dropping straight into the audio-follower/LFO chain | **yes** |
| **Differential growth** | github.com/jasonwebb/2d-differential-growth | node-graph relaxation + topology mutation | generator (topology-based, vs `crystal_growth`'s field-based) | **yes** |
| **Dubins-curve correspondence morph** | zachlieberman medium | optimal point-correspondence + min-curvature path | **new binding-rule mode `pathMorph`** — a routing primitive, reusable across effects | **yes** |
| **Marching-squares → vector contours** | mattkeeter.com/projects/contours | raster field → vector isolines (quadtree) | `contour_extract` — raster→**vector** output modality (note `contour_lines` produces a raster map, not paths) | **yes (partial vs `contour_lines`)** |
| **Poisson-disk stippling** (Bridson) | sighack.com poisson-disk | blue-noise point distribution | render mode beside ascii/braille | **yes** |
| **Superformula** shape generator | gpfault.net superformula | parametric organic radius function | mask/shape generator | **yes** |
| **Droste recursive zoom** | SableRaf/Filters4Processing | polar-log recursive remap | kaleidoscope/warp-family effect | **yes** |
| **Complex-domain feedback (ComplexOp)** | derivative.ca (Dan Molnar) | complex-number transform per feedback iter | extends `entropy_domain_warp`/`generation_loss` | partial |
| **GPU parallel pixel-sort + noise/matte reset-mask** | ciphrd + DBraun forum | field-encoded odd-even sort + RVM-mask-gated reset | upgrades `pixelsort` (perf + live/audio-reactive control via existing RVM) | partial (upgrade) |
| **RGBA-as-data → vertex displacement + SSAO** | simonaa.media | texture-as-data → geometry relief | pseudo-3D relief render path | partial (vs `extrude_spin`) |

Honestly excluded as unverifiable: Ottografo/Vsevolod Taran (no fetchable technique), zenmatte, hikoki, Manuel Chantre (outcome-only), chromostereopsis (no indie impl), Moire Architect Patreon (403), petersistrom.com (cert error).

### Verified store / Patreon creators (each page fetched)

| Creator (fetched) | Signature stackable primitive | Creatrix target | Novelty |
|---|---|---|---|
| **Function Store / Dan Molnár** — TopToMidi | **image→pitched-event sonification**: sampler-defined pixel readout → scale-quantized note/CHOP/MIDI triggers | new routing recipe (`sampleAt`/`scanOver` → pitched events); ties to your H-series MIDI + LayerTap | **yes** (video-analyzer is video→scalar, not scale-quantized events) |
| **Paketa12 / Aurelian Ionus** — Particle Life | **asymmetric per-type attraction matrix** → emergent clustering (not grid-convolution like CA/RD) | another tenant of the field-solver substrate (#1) | **yes** |
| **Supermarket Sallad / S. Ryden** | **GPU particle feedback with per-particle age/life buffers + 3D curl advection** | persistent particle generator/instrument | partial (flow/force fields exist; life-buffer + curl is missing) |
| **Torin Blankensmith** — DepthAnything + MediaPipe | **vision-as-modulation**: monocular depth channel + body/hand landmarks as control streams | depth source + `landmarks` operator (RVM siblings) | **yes** (cross-confirmed w/ GitHub pass) |
| **dotsimulate** — StreamDiffusionTD / StreamV2V | **temporal-cache feedback rig** (last-frame cached-blend for motion coherence) — *portable even without the AI stage* | feedback rig + L-axis diffusion | **yes** (cross-confirmed) |
| **MaxMainio** (derivative.ca assets) | **morphological mask ops** (erode/dilate/open/close), **SDF fields**, **ordered dithering**, **table-driven FSM scene router** | cheap masking/stylize fills + a state-machine sequencer above step-seq | partial→yes |
| **Simon Alexander-Adams** | **perfect-loop phase-locked noise** (seamless N-frame loops) | small LFO mode add | partial |

Excluded unverifiable: Noonès/Acraziel (no confirmable page), pixelmixture (DNS dead). Interactive & Immersive HQ = education/index source, not a technique supplier.

### ⭐ Cross-agent convergence (highest-confidence — surfaced by ≥2 independent *verified* passes)

These are the findings I'd trust most, because independent fetch-verified passes landed on them separately:
1. **Vision-as-modulation — depth maps + body/hand landmarks** (Torin Blankensmith; GitHub + store passes). A whole new class of *control channels*, and RVM is already the proof the inference plumbing works.
2. **Diffusion-in-the-loop** (TDComfyUI + dotsimulate; GitHub + store passes). The L-axis, concretely portable.
3. **Kuwahara / NPR painterly** (yeataro repo + Heckel article; GitHub + fringe passes). A genuinely absent stylization *class* — the one credible non-AI "style transfer."
4. **Emergent particle systems** — Particle Life (per-type force matrix) + curl-feedback life-buffer particles + physarum agents (Paketa12 + Supermarket Sallad + DBraun). All three independently point at the **same missing substrate** (§ "the one architectural gap"): a persistent GPU ping-pong field/agent buffer. This convergence is the strongest argument for building the substrate first.

---

---

## 0. The one-paragraph finding

Creatrix's `resolve_axis_binding()` (`backend/src/modulation/routing.py:58`) is a clean pluggable seam with **four implemented rules** (`broadcast` / `sampleAt` / `scanOver` / `integrate`) and **four reserved-but-rejected slots** (`painted` / `hilbert` / `polar` / `learned`). The whole VJ/livecoding world has spent 20 years building exactly the vocabulary that fills those slots — Hydra's `modulate*` family, TouchDesigner's CHOP-plumbing operators, and the shader-scene's SDF/palette/noise atoms are, structurally, *routing styles we mostly don't have yet.* **[verified-gap]** The single load-bearing structural fact: **the per-pixel *field* / coordinate destination is half-built** — `EXPERIMENTAL_FIELD_DST` gates it off and `scanOver` collapses to a mean scalar (`routing.py:120`). Turning that on + adding a `coord` vector-field destination unlocks the majority of the highest-leverage ports (Hydra's whole `modulate*` family) with *zero new effects* — just wiring. (The earlier "no generators" framing was wrong — see correction box; generators exist, so the opportunity is *routing sophistication* over the sources/effects already present, not a missing source category.)

---

## 1. Headline: NEW ROUTING STYLES (binding rules)

This is the direct answer to "additional routing styles." Each maps to a reserved slot or a brand-new rule in `_IMPLEMENTED_BINDING_RULES`. They **stack**: a routing style is a function on the wire, so they chain (remap → ease → smooth → combine). Ranked by leverage.

### Tier 1 — build first (max composability, low cost)

| # | New rule | What it does | Source analog | Fills |
|---|----------|--------------|---------------|-------|
| R1 | **`field_dst: coord`** (turn on `EXPERIMENTAL_FIELD_DST` + add a 2D *vector* destination, not just 2D scalar) | Lets a modulation source become a **per-pixel displacement field** on sampling coordinates, not just a scalar param. | Hydra `modulate()` — the whole `modulate*` family collapses to "sample a second texture, perturb a param per-pixel." | **Unblocks 5 of Hydra's 8 `modulate*` functions with no new effects.** Highest leverage-per-line in the report. |
| R2 | **`combine(mode)`** **[partial]** | Expose blend-mode as a *binding rule between modulation sources*, and extend the compositor's existing **8 modes** (`normal/add/multiply/screen/overlay/difference/darken/lighten`, `compositor.py:101`) toward Composite TOP's ~40 (add dodge/burn/hue/color/atop/xor…). | TD **Composite TOP**, `blendModes` palette. | Partial: 8 image blend modes already exist for *compositing*; the new part is (a) using blend-mode as a *routing* rule where two sources meet, and (b) the ~30 missing modes. |
| R3 | **`painted(maskSource)`** | Per-pixel gate: "source A where the mask is white, source B where black," mask from a hand-painted matte, luma key, or a generator. | TD **Matte TOP** ("A over B with alpha of C"). | Ships the reserved **`painted`** slot exactly. Composes with R2 (mask picks *where*, blend picks *how*) and with masking system already in-app. |
| R4 | **`remap(curve)` / LUT** | Reshape a scalar through a user-authored curve/LUT before it reaches the destination (nonlinear, not linear `depth`). | TD **Lookup CHOP**; ISF/Hydra shaping. | New rule; sits under *every* other rule as a pre-shape. |
| R5 | **`ease(curve)` on the edge `depth`** | Add smoothstep/cubic/pow easing to the currently-linear `_blend_contributions` map. | Book of Shaders "shaping functions." | Not a new rule — a **per-edge option** that makes *every existing modulation edge in the app* feel better with zero new effects. |

### Tier 2 — history / time-axis rules

| # | New rule | What it does | Source analog | Fills |
|---|----------|--------------|---------------|-------|
| R6 | **`derivative`** | Rate-of-change of the source (velocity/accel/jerk). The literal **missing inverse of the existing `integrate`**. | TD **Slope CHOP**. | New; pairs with `integrate` to complete the calculus. |
| R7 | **`inertial(damping)`** | Spring/lag smoothing, adaptive to signal speed (low cutoff when slow for stability, higher when fast). | TD **Lag / Filter CHOP**. | New post-process; stacks on any rule. |
| R8 | **`trail(window)`** | Materialize the *raw windowed history* of a value as a T-axis vector (unlike `integrate`, which reduces to a running scalar). | TD **Trail CHOP**. | New; the buffer that `scrub` addresses into. |
| R9 | **`scrub(offset)`** | Read the signal/video *N ticks ago*, where N itself is modulatable ("read 8 frames back, 8 from an LFO"). Generalizes the single-tick feedback delay. | TD **Cache Select TOP** (`-1`=prev, `-2`=2-back…). | New; `sampleAt` specialized onto T with backward indexing + ring buffer. |

### Tier 3 — structural / geometry rules

| # | New rule | What it does | Source analog | Fills |
|---|----------|--------------|---------------|-------|
| R10 | **`polar`** (coordinate adapter) | Reparameterize X/Y into radius/theta *before* any other rule reads it — so `scanOver`/`sampleAt` become radial scans. | TD Projection POP; iq polar coords; Book of Shaders ch.7. | Ships the reserved **`polar`** slot. Correct architecture: a stackable **coordinate pre-stage**, not a standalone destination. |
| R11 | **`axisCast(from,to)`** | Relabel a source's home axis: a video's per-column (X) luma profile becomes a T-axis modulation stream. **The only cross-axis rule** — none of the current 4 cross axes. | TD **TOP↔CHOP** reinterpretation. | New; unlocks entire source/destination pairings that are impossible today. |
| R12 | **`reduce(op)`** | Field→scalar via mean/max/min/peak-count. The mirror of `broadcast` (scalar→field). | TD **Analyze TOP/CHOP**. | New; lets a 2D field (from `scanOver`, `video_analyzer`) feed back into a scalar-driven operator — completes a currently one-way round-trip. |
| R13 | **`select(index)` / `crossfade(pos)`** | Hard-switch (Switch CHOP) or scrubbable-blend (Cross CHOP) among N ordered sources by a continuous position. | TD **Switch / Cross CHOP**. | New; `crossfade` generalizes `fusion` into a scrubbable ordered list. |
| R14 | **`onehot` / `argmax`** | Scalar-index ↔ per-axis one-hot vector conversion (a one-hot vector *is* a `scanOver` field). | TD **Fan CHOP**. | New; the missing bridge between scalar control values and per-position destinations. |
| R15 | **`keyedLookup(row,col)`** | Indirection by *string key* — "give me the value in band `bass`, param `decay`" — instead of numeric index. | TD Parameter DAT / cell reference. | New; complements a future named-preset/patch-table system (semantic F-axis bands: bass/mid/air). |

> **Architectural note:** R4/R5/R7/R10 are *stackable wire functions* (pre-shape, ease, damp, reparameterize) that compose under R1/R2/R3 (the destination-shaping rules). That composition — "shape the value, then shape where it lands" — is the routing grammar Creatrix is missing and the reason to build them as chainable modifiers rather than monolithic rules.

**Full 21-candidate routing catalog** (with TD doc URLs per candidate) lives in the raw agent output; the above is the ranked, de-duplicated port list.

---

## 2. STACKABLE SIMULATION ATOMS (the base primitives)

The brief's "base-level things that can stack" is answered most literally here. Creatrix already ships *finished* sims (Gray-Scott RD, cellular automata, one strange attractor, pixel flow/force fields, superfluid, erosion, crystal growth). What's missing is the **atomic layer** — a handful of reusable mechanisms that recombine into dozens of looks. Build the atoms, not more monoliths.

| Rank | Atom | Mechanism | Finished looks it unlocks | Novelty |
|---|---|---|---|---|
| 1 | **Advect-a-field-by-a-velocity-field** | `field(x) = field_prev(x − vel(x)·dt)`, bilinear | stable fluids, curl-noise smoke, optical-flow warp, physarum transport, field-line viz | **the single most-reused atom in the whole report** |
| 2 | **Deposit + diffuse + decay** on a shared field | agents write → blur → ×decay each frame | physarum trails, light-trail echoes, pheromone networks, DLA (field variant) | new |
| 3 | **Agent-state-in-texture + feedback** | positions/velocities as texture pixels, GLSL kernel, ping-pong; count = texture res | boids, physarum-as-particles, GPU particles, DLA walkers, field-line tracers | partial (confirm particle count is res-driven, scalable to 100k+) |
| 4 | **Spatial binning / hash pass** | bucket agents into grid cells → O(1) neighbor queries | *scalable* boids/physarum, SPH particle fluids | new — the atom that makes neighbor-aware sims tractable |
| 5 | **Jacobi-iterated Poisson solve** | repeated local-average relaxation | pressure projection (true incompressible fluid), viscous diffusion | likely new (not needed by Gray-Scott/erosion) |
| 6 | **Large-radius kernel convolution** (direct or FFT) | tunable-radius weighted neighborhood + smooth growth map | **Lenia** (life-like blobs), multi-scale Turing patterns | new (distinct from GS's 3×3 Laplacian) |
| 7 | **Second-order (wave) Laplacian integration** | two-buffer height+velocity; propagates/reflects/interferes | ripple/water sims, driveable by audio F-axis or optical flow | new (vs `wave_distort` which is procedural, not a stateful 2nd-order sim) |
| 8 | **Irreversible freeze-on-contact** | threshold → permanent state lock | DLA, coral/frost/lightning growth, frozen-trail variants | audit `crystal_growth` first (near-synonym) |
| 9 | **Curl-noise field** | `curl(∇×potential-noise)` → divergence-free velocity | cheap "smoke" without a pressure solve; feeds atom #1 | partial (vs generic `domain_warp`) |
| 10 | **Optical-flow field** (computed, dense) | frame-diff → per-pixel motion vectors | motion-reactive smear; real footage drives a fluid look | partial — distinct from `datamosh_real` (codec macroblocks vs computed dense flow) |

**Finished effects these atoms unlock that we lack:** `physarum_trails` (agent slime networks), `boids_pixel_flock`, `fluid_stable` (real Navier-Stokes with projection — audit whether `pixel_superfluid` is flow-only), `lenia`, `turing_multiscale`, `wave_ripple`, `video_feedback_zoom` (the iconic 1970s zoom+rotate+chromatic-split analog-synth look — currently a gap despite `feedback_phaser`), `optical_flow_feedback`, `curl_smoke`.

**Cross-cutting multiplier (highest breadth-per-effort):** **2D-field → 3D lift.** A generic `heightfield_to_pointcloud` (Rutt-Etra / depthProjection) or `sdf_relief` (raymarch a field as relief) gives *every existing 2D effect a 3D mode for free* — Gray-Scott concentration, FFT magnitude, physarum density all become displaced point-clouds or raymarched reliefs. This is a render-mode/instrument, not a per-effect feature.

---

## 3. GENERATOR / SOURCE atoms — *specific* missing generators

**Correction:** Creatrix already has a generator category and synthesizing effects (`noise`, `tv_static`, `shape_overlay`, `strange_attractor`, `reaction_diffusion`, `crystal_growth`) plus the Wavetable/Frame-Bank generator-instrument. So this is **not** a missing category — it's a set of *specific* procedural sources common in Hydra/shader work that aren't among them. Each should be **[audit]**-ed against the existing generator effect before building.

| Atom | What | Stacks with | Status |
|---|---|---|---|
| `osc(freq,sync,offset)` | animated sine stripe/plasma — Hydra's "hello world" | geometry, color, `modulate*`, blend | [audit] vs existing generator fx |
| `noise(scale)` field as a *pure source* | 2D+t value/simplex noise generated (not overlaid on a frame like `noise.py`) | modulateScale, domain warp | [partial] — `noise.py` overlays; a from-scratch field source differs |
| `voronoi(scale,speed)` | Worley/cellular; also a **mask source** | color LUT, kaleid, edge | [audit] vs `cellular_*` effects |
| `polygon_sdf(sides,radius,smooth)` | filled SDF shape, antialiased free via `smoothstep(0,fwidth,d)` | blend/mask, kaleid, palette | [audit] vs `shape_overlay.py` (which may already cover this) |
| `gradient(speed)` / `solid(rgba)` | animated ramp / flat base layer | palette, blend/mask base | [audit] |
| `palette_ramp` (cosine) | cosine palette walked over `t` = infinite gradient from 12 floats | all color/blend | [verified-gap] no cosine-palette util found — see §4 |

**Real takeaway:** the generator *category* exists; the shader-scene atom actually worth stealing wholesale is the **cosine palette math** (below), not a new source category.

---

## 4. COLOR / BLEND / GEOMETRY atoms

Color coverage is already strong; these are the specific gaps.

**Color/blend:**
- **Cosine palette** `a + b·cos(2π(c·t + d))` (Inigo Quilez) — the single most-reused atom in the entire livecoding/Shadertoy scene. 12 floats + one `cos`. Maps any scalar field (incl. **F-axis spectral energy**) to smooth cyclic RGB. Ships as `util/palette.py` + `palette_cosine.py` color-op + a generator source. **Build this early — trivial, enormous reach.**
- ~~`diff` blend~~ — **already exists** (`difference` in `compositor.py:106`). Struck.
- **`thresh`/`luma` color-op** [partial] — plain luminance→binary with soft tolerance (distinct from `luma_key.py`'s *matte* use). Feeds ASCII/braille/edge atoms.
- **`colorama`** [partial] — auto hue-cycle mode on `hue_shift.py` (or a T-axis modulation of its angle).
- **ISF transition contract** (`startImage`/`endImage`/`progress`) [partial] — adopt as Creatrix's formal transition interface. **3 transitions** exist today (`transition_column_cascade`, `_reverse`, `transition_row_waterfall`); a standard 3-input contract makes every new transition drop-in interchangeable.

**Geometry (the "boring baseline" Hydra atoms — re-audited against real fx):**
- ~~`pixelate`~~ — **basically covered** by `block_crystallize` (block-average mosaic with `block_size`). A nearest-neighbor variant is cosmetic; struck as a priority.
- **`scroll(x,y,speed)`** [audit] — uniform wraparound pan. `row_shift.py` exists (per-row shift, scroll-adjacent); confirm whether a plain whole-frame wrap-pan is present before building. Feedback + scroll = infinite-scroll trails.
- **`twist`** — per-row progressive rotation = iq's `opTwist`; **the textbook showcase for the already-implemented `integrate` binding rule** over the Y axis.
- **`repeat(x,y)`** — plain tiling *without* mirroring (kaleid = tile + mirror). Expose as a standalone atom.
- **Generic domain-repetition wrapper** `opRep(child, spacing)` — a *decorator* that tiles any generator/SDF, rather than reimplementing tiling per-effect. Grammar-level win.

**SDF / math utilities** (`util/` helpers that unlock the generators above):
- `util/sdf2d.py` — ~30 iq analytic shapes (circle/box/star/hexagon/heart/…), antialiased free.
- `util/smin.py` — quadratic-polynomial smoothmin. **Dual-purpose:** SDF blending AND a smooth "melt masks together" mode the masking system lacks.
- `util/hash.py`, value-noise, fBM (note: `domain_warp.py`/`entropy_domain_warp.py` already do fBM — verify octave/lacunarity/gain are UI-exposed; if not, that's the gap).
- `util/polar.py` — polar coords; **directly unblocks the reserved `polar` binding rule (R10)**.
- `util/easing.py` — shaping functions; wires into R5 (easing on modulation edges).

---

## 5. NEW MODULATION OPERATORS

Current: `lfo, envelope, step_sequencer, audio_follower, video_analyzer, fusion, kentaroCluster, sidechain, gate, midiEnvStutter`. Gaps:

- **`pattern_gen`** — a *non-time-driven* array generator (ramp/step/noise-shape) that seeds LUTs (R4) and instance fan-out. Sits next to lfo/envelope/step_seq but is explicitly not `f(t)`. (TD Pattern CHOP.)
- **`optical_flow`** as an operator source — dense motion vectors from footage, usable to drive *any* param or as an advection velocity (atom #10).
- **`curl_noise`** as a field-source operator — divergence-free velocity feeding domain warp / flow effects (atom #9).
- **`arbitrate(policy=lastWrite)`** — governance primitive: when N operators target one destination, pick most-recently-changed instead of forcing manual mutes. Needed once instancing/table-routing makes sources compete. (TD Bind CHOP.)
- **`clip_embedding` (CLIP-vector source)** — drive any bound param by **semantic similarity** of the current frame to a target image/word ("more param X the more this looks like fire"). Nothing comparable exists. The single most novel operator here. (dotsimulate CLIP tools.) `[L-axis]`
- **`depth` source** — real-time monocular depth (DepthAnything/MiDaS) as a displacement/parallax/mask channel. A whole new modulation source. (mediapipe-touchdesigner / MiDaS TOP ports.)
- **`landmarks` source** — MediaPipe face/hand/pose skeleton channels — semantic (not pixel-level like `video_analyzer`).
- **Logic/gate atoms** (`latch`, `toggle`, `edge`, `slew`) — composable boolean/smoothing atoms for the modulation layer; cheapest high-leverage upgrade. (Supermarket Sallad utilities.)

**Cross-cutting perf operator — `change_gate(threshold)`:** skip an expensive effect/operator when the input frame delta is below a threshold (StreamDiffusion's *Stochastic Similarity Filter*, generalized). Applies to *every* heavy effect, not just AI — a pure composable atom that also lowers render cost. High value, low cost.

---

## 6. NEW DESTINATION CLASS + INSTRUMENTS

- **Instance fan-out (data-driven destination count)** — the destination *count itself* is driven by data: spawn/retire N addressable instances to match a source's row count, each independently bindable. This is a **new destination class** (not scalar, not field) with no current analog. (TD Replicator COMP + instancing; Matthew Ragan's instancing tutorials.) Pairs with `crossfade`/`trail`/`painted` per-instance.
- **2D→3D render-modes** (from §2): `heightfield_to_pointcloud`, `sdf_relief` — instrument/render-mode layer over the whole effect library.

---

## 7. L-AXIS / realtime-AI (the "new VJ tools" wave)

The biggest movement in VJ tooling 2024–2026 is **real-time diffusion**, and it maps precisely onto Creatrix's underused **L (latent) axis**. This is where "new tools popping up" concentrates.

| Tool / tech (year) | Signature technique | Port target | Novelty |
|---|---|---|---|
| **StreamDiffusion / StreamDiffusionTD** (dotsimulate, 2023→) · [docs](https://dotsimulate.com/docs/streamdiffusiontd) | real-time img2img diffusion driven by live camera/audio/sensor input | **L-axis effect**: `diffusion_restyle` — feed the current frame + prompt as a live effect | new; the flagship AI-VJ primitive |
| **Daydream hosted StreamDiffusion** (2025, API live Aug 2025) · [daydream](https://daydream.live/streamdiffusiontd) | **cloud-offloaded** inference — no local NVIDIA/CUDA; runs on any OS incl. Apple Silicon | de-risks Creatrix's Mac-first constraint: an optional hosted diffusion backend | new; solves the "no NVIDIA on a Mac" wall |
| **StreamV2V cached attention** · v0.3.1 processors | temporal consistency for video→video; **feedback + color-grade processors that COMPOUND through the diffusion pipeline** | diffusion effect that participates in the *effect chain* (upstream glitch → diffusion → downstream grade), not a terminal filter | new; the "diffusion as a stackable stage" insight |
| **ControlNet conditioning** (depth/pose/edge) | structural control of generation via a conditioning image | **routing into L**: use a Creatrix effect's output (edge_detect, entropy_map, a matte) as the ControlNet input → any effect *conditions* the diffusion | new; makes the existing 150 effects into diffusion controllers |
| **IP-Adapter** (image prompt) | steer style by an image, not text | L-axis: drag a still onto the prompt as a style source | new |
| **Prompt-travel / latent blending** | interpolate prompts/latents over time or a control signal | **modulate the L-axis with existing operators** — an LFO or audio_follower scrubs a prompt/latent interpolation. This is where L becomes a *modulation destination*, closing the synth-paradigm loop. | new; highest-fit with Creatrix's modulation model |
| **Synesthesia SSF** (audio-reactive shader format) · [synesthesia.live](https://synesthesia.live/) | ISF/Shadertoy import + **standardized audio uniforms** (bass/mid/treble/level as first-class scene inputs) | adopt an **ISF/SSF import path** → instantly absorb thousands of community shaders as effects/generators; standardize F-axis→shader audio uniforms | new; a whole content pipeline, not one effect |
| **Smode** (real-time compositor) | "After Effects without render delay" node compositor | validates the node-graph direction (P4/PR-C topology work) | reference, not port |
| **Hydra** (livecoding) · [hydra](https://hydra.ojack.xyz) | the `modulate*` family (§1) + generator atoms (§3) | already the backbone of §1 and §3 | new (covered above) |

**Practical L-axis sequence:** (1) `diffusion_restyle` as an effect (hosted backend to dodge the Mac/NVIDIA wall); (2) let existing effects feed ControlNet inputs (edge/depth/matte → conditioning) — **RVM is already a free ControlNet/segmentation input we aren't exploiting**; (3) make **L a modulation destination** so LFO/audio_follower drive prompt-travel/latent-blend — that is the FM-synthesis-level jump the synth-paradigm vision doc already anticipates; (4) **CLIP embeddings as both a modulation *source* and a "latent granulator"** — scrub/interpolate between two prompt embeddings like the T-axis, feedback-conditioned for temporal coherence (the L-axis analog of the existing granulator).

**Adjacent AI-input primitives (from community TD toolkits):** real-time **depth maps** (DepthAnything/MiDaS → displacement/parallax), **MediaPipe landmarks** (semantic face/hand/pose channels vs pixel-level `video_analyzer`), and **multi-class segmentation** → **region-routing** (route different effect chains to person/sky/background — RVM is single-subject; per-class regions is new). These make the masking + binding systems semantic.

> **Honest double-count caveats (don't re-scope what's built or cut):** Creatrix's tune-up campaign already shipped **transform-automation recording** (A1–A4) and **CC-records-automation** (H4), so Function Store's "automation recorder" is largely *present*. The synth-paradigm Round-1 doc explicitly **CUT** Ableton Link / DAW-sync — so TDAbleton's beat-clock is a *reopen decision*, not a free port (BPM sync + the H-series MIDI mapping already exist). Treat those as "already there / previously declined," and spend novelty budget on the L-axis and the routing atoms instead.

---

## 8. Cross-cutting conventions worth stealing

- **ISF `PERSISTENT` / `FLOAT` buffers + multi-pass `PASSES`** — promote Creatrix's per-effect `state_in/state_out` convention to a first-class, inspectable, HDR-precision buffer object any effect can declare. Underpins all accumulator/trail/sim effects cleanly.
- **ISF transition & input-type conventions** — standard interfaces so effects are interchangeable across the timeline/clip-transition UI.
- **Named target + reset pulse** on feedback — formalize the informal single-tick delay into a first-class primitive with an explicit reset gate and arbitrary tap-point.
- **Toolkits to mine directly** (community `.tox`/GitHub, for reference implementations): dotsimulate (StreamDiffusionTD, AudioReact, CLIP), Function Store (FS_ utility tools), nVoid/olib, Torin Blankensmith (framework, LiDAR/point-cloud), Matthew Ragan (instancing), Bileam Tschepe/elektronaut (feedback + RD example files), T3KRA (`t3kt/raymarching` SDF framework), EnviroModal, LYNX, DBraun (boids source). These are where the exact GLSL for §2–§4 atoms already exists.

---

## 9. MASTER BUILD LIST — do these first (base-level, stacks hardest)

Ranked for **composability × low cost**, the two things the brief asked to optimize:

1. **`field_dst: coord`** (flip `EXPERIMENTAL_FIELD_DST` + add a 2D vector destination) — unlocks Hydra's whole `modulate*` vocabulary with zero new effects. `[routing · verified-gap]`
2. **Cosine palette** (`util/palette.py` + color-op) — 12 floats, reaches color + F-axis at once; the one shader atom worth stealing wholesale. `[atom · verified-gap]`
3. **`painted` routing rule** (Matte TOP) — ships a reserved slot; composes with the 8-mode compositor and the masking system. `[routing · verified-gap]`
4. **Advect-a-field-by-velocity** + **deposit/diffuse/decay** atoms — the two mechanisms behind fluids, smoke, physarum, optical-flow warp (audit `pixel_superfluid`/`pixel_flow_field` for overlap). `[sim atoms]`
5. **`ease` on modulation-edge depth** + **`remap(curve)`** — nonlinear wire-shaping; makes every existing edge better (verify `_blend_contributions` is linear-only first). `[routing]`
6. **`twist`** geometry atom — showcases the *already-implemented but unused* `integrate` rule over the Y axis. `[atom]`
7. **2D→3D lift** (`heightfield_to_pointcloud` / `sdf_relief`) — a 3D mode for the entire existing library. `[render-mode · audit]`
8. **`derivative` + `inertial` + `trail`/`scrub`** history rules — complete the time-axis calculus around the existing `integrate`. `[routing]`
9. **`combine(mode)` as a routing rule** + extend the 8 compositor modes toward ~40 (dodge/burn/hue/xor). `[routing · partial]`
10. **`polar` + `axisCast`** — ship the reserved `polar` slot (via `util/polar.py`) and add the only cross-axis rule. `[routing]`
11. **L-axis `diffusion_restyle`** (hosted backend) + **L as a modulation destination** (prompt-travel driven by LFO/audio) + **`clip_embedding` as a modulation source** — the AI-VJ headline; L is Creatrix's weakest, highest-upside axis. `[L-axis]`
12. **`change_gate(threshold)`** + **logic/gate atoms** (latch/toggle/edge/slew) — cheap composable atoms that cut render cost and multiply the modulation layer. `[operators]`
13. **ISF/SSF import path** — absorb thousands of community shaders as effects/generators in one pipe. `[content]`
14. **`depth` + multi-class segmentation** sources — semantic displacement + region-routing (extends RVM). `[L-axis/routing]`

**Two seams that make ~half of the above "wiring, not building":** (a) the `resolve_axis_binding` slot table in `routing.py`, (b) `EXPERIMENTAL_FIELD_DST` + a coord-field destination. Prioritize those two enablers and the rest are incremental.

---

## 10. Sources (primary)

- Routing: TD [Composite TOP](https://docs.derivative.ca/Composite_TOP), [Matte TOP](https://docs.derivative.ca/Matte_TOP), [Lookup CHOP](https://derivative.ca/UserGuide/Lookup_CHOP), [Cross CHOP](https://docs.derivative.ca/Cross_CHOP), [Switch CHOP](https://derivative.ca/UserGuide/Switch_CHOP), [Fan CHOP](https://docs.derivative.ca/Fan_CHOP), [Trail CHOP](https://docs.derivative.ca/Trail_CHOP), [Cache Select TOP](https://docs.derivative.ca/Cache_Select_TOP), [Lag](https://docs.derivative.ca/Lag_CHOP)/[Filter](https://docs.derivative.ca/Filter_CHOP)/[Slope CHOP](https://docs.derivative.ca/Slope_CHOP), [Analyze TOP](https://docs.derivative.ca/Analyze_TOP), [TOP to CHOP](https://docs.derivative.ca/TOP_to_CHOP), [Replicator COMP](https://docs.derivative.ca/Replicator_COMP), [Feedback TOP](https://docs.derivative.ca/Feedback_TOP).
- Sims: [touchFluid](https://github.com/kamindustries/touchFluid), [GPU Gems Ch.38 fluids](https://developer.nvidia.com/gpugems/gpugems/part-vi-beyond-triangles/chapter-38-fast-fluid-dynamics-simulation-gpu), [physarum (bleuje)](https://bleuje.com/physarum-explanation/), [boids binning (Derivative)](https://derivative.ca/community-post/tutorial/boids-flocking-compute-shader-binning-particles/65246), [curl noise](https://emildziewanowski.com/curl-noise/), [Optical Flow TOP](https://docs.derivative.ca/Optical_Flow_TOP), [Lenia](https://chakazul.github.io/lenia.html), [multiscale Turing (Reusser)](https://rreusser.github.io/notebooks/multiscale-turing-patterns/), [depthProjection](https://docs.derivative.ca/Palette:depthProjection), [t3kt/raymarching](https://github.com/t3kt/raymarching).
- Shader atoms: [Hydra funcs](https://github.com/ojack/hydra/blob/main/docs/funcs.md), [Hydra modulate](https://hydra.ojack.xyz/docs/docs/learning/video-synth-basics/modulate/), [iq Palettes](https://iquilezles.org/articles/palettes/), [iq smin](https://iquilezles.org/articles/smin/), [iq 2D SDFs](https://iquilezles.org/articles/distfunctions2d/), [iq domain warp](https://iquilezles.org/articles/warp/), [Book of Shaders](https://thebookofshaders.com/), [ISF JSON ref](https://docs.isf.video/ref_json.html).
- AI/VJ: [StreamDiffusionTD](https://dotsimulate.com/docs/streamdiffusiontd), [Daydream hosted](https://daydream.live/streamdiffusiontd), [Synesthesia](https://synesthesia.live/), [ControlNet](https://medium.com/@kdk199604/controlnet-reliable-conditioning-for-text-to-image-systems-b9d1e593b302), [VJ software guide 2026](https://vjgalaxy.com/blogs/resources-digital-assets/vj-software-guide-2026-from-vjing-to-generative-art), [Matterform ToolBox](https://github.com/MatterformInc/ToolBox).
