---
title: Creatrix Instruments & Performance — sequenced build plan with gates + designs
version: 1.0
created: 2026-06-02
status: plan-draft (NOT approved for implementation; designs complete for near-term builds)
companion: INSTRUMENTS.md (vision, 18 locked decisions, §10 review findings — read first)
incorporates: all /review P1–P3 findings (architecture-strategist + security-sentinel + data-integrity-guardian)
target_repo: entropic-v2challenger → creatrix
coordination: |
  3 sessions live; one starts PR-zero on user "go". This plan SEQUENCES ON TOP of that work
  (PR-zero/A/B/C/D). §2 lists exactly what must be injected into those PRs vs. what ships as
  new instrument PRs (B1–B10). New file — does not edit PLAN.md/DECISIONS.md/index.html.
---

# Creatrix Instruments — Sequenced Build Plan

> **Read INSTRUMENTS.md first** for the vision, the 18 locked decisions, and the §10 review
> findings this plan operationalizes. This doc answers **in what order, behind which gates, and
> with what design** each piece gets built.

---

## 1. Gate model

A **gate** is a binary precondition. A build cannot start until its IN-gates are GREEN, and cannot
merge until its OUT-gates are GREEN. Two gate kinds:

- **Dependency gate (DEP)** — another PR/build must have landed (e.g. "PR-zero merged").
- **Safety gate (SG)** — an operational-safety contract must exist *in code* (not vocabulary).
  SG-1/3/5/7/8 are currently UNBUILT (§5). A build behind an SG is hard-blocked until that SG ships.

**Universal OUT-gate checklist (every build):**
1. Tests at the right layer green (Vitest logic/component · Playwright process · pytest backend).
2. Every numeric crossing IPC clamped + finite-guarded (`feedback_numeric-trust-boundary`).
3. No backend cap left as a frontend-only convention (security boundary enforced server-side).
4. Determinism regression passes (where the build touches voices): capture → backend-replay → byte-identical, INCLUDING an edit-after-capture case + a malformed-event fuzz case.
5. Design section in this doc matches what shipped (update if it drifted).

> **Global determinism rule (all builds):** every "byte-identical" gate is an **EXPORT-PATH** gate.
> Live preview seeds with `Date.now()` (`App.tsx:840,857`) and is non-deterministic *by design* — never
> assert byte-identity against the preview path (B6/B8 seeded-replay tests must run the export path).

---

## 2. Dependency graph + hand-offs to the in-flight Creatrix sweep

```
Creatrix sweep (parallel session)         Instrument builds (this plan)
─────────────────────────────────         ─────────────────────────────
PR-zero  per-track effect chains  ─────┐
PR-A     layout + browser tabs    ──┐   │
PR-B     Composite-as-effect,       │   │
         automation unify,          │   │
         modulation refactor,       │   │
         DFS cycle-detector,        │   │
         rename Pad.mappings→modRoutes  │
PR-C     operators + tensor base  ──┼─┐ │
                                    │ │ │
                                    ▼ │ │
                             B1  1-voice Sampler (rides PR-A)   [DEP: PR-A]
                                      │ │
                                      ▼ │
                             B2  Voice spine / Performance Track [DEP: PR-zero, PR-B]
                                      │
                                      ▼
                             B3  Full Sampler                    [DEP: B2]
                                      │
                                      ▼
                             B4  Sample Rack (host + macros)     [DEP: B3]
                                      ▼
                             B5  Grouping / composite-tree       [DEP: B4]
                                      ▼
                             B6  Frame-Bank      [DEP: B5, SG-1?, SG-8]
                             B7  Optical-flow/RIFE interp [DEP: SG-1]
                             B8  Granulator      [DEP: B5, SG-1, SG-3, SG-8]
                                      ▼
                             B9  Tensor mod-routing + Y-as-time  [DEP: PR-C, SG-5, SG-3]
                                      ▼
                             B10 Live affordances (MIDI/freeze)  [DEP: B2, B4, SG-8]
```

### 2.1 Must be injected into the parallel session's PRs (coordinate before they lock)
These belong in the sweep, not in a PI build — flag to the PR-owner:
- **PR-B:** rename `Pad.mappings → Pad.modRoutes` (NOT `padBindings`; collides with `DEFAULT_PAD_BINDINGS`). Single location, in the v3 schema break.
- **PR-B:** DFS cycle-detector — correct PLAN.md §4.5's signature to the real `_topological_sort(list[dict])` reading `parameters.sources` (`engine.py:20`), and make it **raise** (today it warns + falls back to declaration order). B9 depends on this.
- **PR-B/PR-A:** add `MAX_COMPOSITE_LAYERS` to `security.py`, enforced at `_handle_render_composite` before the decode loop, and clamp `footageFrameIndex` to `[0, frame_count-1]` (today bare `int()`, `zmq_server.py:728`). B1 already benefits.
- **PR-A:** the `instruments` browser tab must expose a real (not placeholder) entry for B1's Sampler.

---

## 3. The builds (sequence + design + gates)

### B1 — Read-only 1-voice Sampler (FIRST BUILD, placeholder-killer)
**Rides PR-A.** Goal: prove instrument → voice → composite end-to-end with the *minimum* surface,
before any polyphony/FSM/tree complexity. The reviewers confirmed the decode path already ships,
so this is small.

**Design**
- **Data model** (`SamplerInstrument`, minimal):
  ```ts
  interface SamplerInstrumentV1 {
    type: 'sampler';
    clipId: string;           // source asset
    startFrame: number;       // playhead start (clamped [0, frameCount-1])
    speed: number;            // playback rate; 1 = native, 0 = freeze, <0 = reverse (clamp [-8, 8])
    opacity: number;          // per-voice VCA value (clamp [0,1]) — set on the VoiceLayer, NOT a Composite
    blendMode: BlendMode;
  }
  ```
- **Emits ONE `VoiceLayer`** (no polyphony) each frame: `{ voiceId:'sampler-singleton', source:{clipId,
  footageFrameIndex}, opacity, blendMode, transform: identity }`. `footageFrameIndex = startFrame +
  round(speed * (playheadFrame - triggerFrame))`, clamped to clip bounds.
- **Reuses** the shipping declarative composite path (`zmq_server.py:704-808`) verbatim — no backend change.
- **UI:** an `instruments`-tab entry "Sampler"; dropping it adds a single device tile with start/speed/
  opacity/blend controls (hover-help per PR-A inspector). NOT yet on its own track type — renders as one
  extra composite layer over the current output.
- **Explicitly NOT in B1:** polyphony, voice FSM, trigger modes, loop, scrub, slicing, MIDI, ADSR.

**Gates** — IN: PR-A merged. OUT: universal checklist; visual-diff test (load clip → layer differs
from base by L1); start/speed/reverse change output; opacity drives compositing.

**Est:** ~6–9h. **Risk:** low (no new backend).

---

### B2 — Voice spine: Performance Track + Instrument contract + polyphony (PI-0)
**The foundation everything else rides.** Goal: the real voice model, polyphony, and the
Performance Track type — woven into the timeline, NOT a modal mode.

**Design**
- **Instrument contract** (frontend pure evaluator) and **VoiceLayer** — full schema per
  INSTRUMENTS.md §5. Key invariant: **`opacity` is per-voice on the layer**, distinct from the
  track-terminal Composite (§10 P1-4).
- **voiceId state keying (the top review fix, P1-1):** change per-layer state keying from
  `asset:{path}` to `voice:{voiceId}` end-to-end — `zmq_server.py:763-765` + `_get_composite_states`/
  `_save_composite_states` signatures. Stolen-voice cleanup resets ONLY that voice's cache entry;
  do not cold-start survivors on layer-set change (today `zmq_server.py:690-692` drops the whole cache).
- **Voice lifecycle FSM:**
  ```
  idle ──trigger──▶ attack ──env──▶ sustain ──release(key-up / one-shot end)──▶ release ──env→0──▶ idle
   ▲                                                                                                  │
   └────────────────────────── choke / steal / panic ────────────────────────────────────────────────┘
  ```
  Each voice carries `{voiceId, instrumentId, triggerFrame, phase, footagePos}`. Pure function of events.
- **Polyphony:** voice cap = **4 (hard, backend-enforced via `MAX_TOTAL_VOICES_PER_RENDER`)**;
  steal = **oldest** (lowest triggerFrame, tie-break by event-index); z-order = **newest on top**
  (composite order = ascending triggerFrame). Choke groups force-idle siblings atomically.
- **Performance Track type:** `Track.type` already includes `"performance"` (`types.ts:60`).
  Selecting it renders the instrument editor in the context-sensitive device-chain row. **Retire
  `isPerformMode`** — migrate `performance.ts` from modal flag to track-bound state; enumerate the
  9 `App.tsx` refs + `PerformancePanel`/`PadGrid`/`global.css` + 4 test files.
- **Determinism (P1-2):** capture-event schema carries `{frameIndex, eventIndex, note, velocity}` —
  **NO `performance.now()`, NO embedded mutable `mappings`** (today `padActions.ts:25,30,50` violate
  both). Steal/choke/age recompute purely from `(frameIndex, eventIndex)`. **Export replays the voice
  FSM backend-side** (export is backend-driven, `export.py:310`) — serialize the event list + FSM into
  the export job; the frontend live-authority is not the export authority.
- **Security:** `MAX_COMPOSITE_LAYERS`, `MAX_TOTAL_VOICES_PER_RENDER` in `security.py`, rejected at
  `_handle_render_composite` before decode; validate `voiceId ∈ live set`; clamp `transform`/speed/
  `footageFrameIndex`/`perChannelOffset`; extend `project/schema.py` to validate event-list contents
  on file load (finite + range + referential integrity).

**Gates** — IN: PR-zero + PR-B merged (per-track chains; Composite-as-effect; rename; cap constants).
OUT: universal checklist; **two voices on the same clip do NOT cross-contaminate stateful effects
(datamosh)**; cap=4 → 5th steals oldest; choke; panic clears all; determinism regression incl.
edit-after-capture + malformed-event fuzz + 30fps-vs-60fps time-aligned export.

**Est:** ~10–14h (de-risked decode path; voiceId-keying + FSM + export-replay are the real work).
**Risk:** medium-high (the voiceId keying + export authority are the load-bearing changes).

---

### B3 — Full Sampler (PI-1)
**Design**
- **Params** (full): startFrame, endFrame, speed, **loop** (on/off, in/out, dir fwd/rev/ping-pong),
  **loop crossfade** (frame-blend the seam), **scrub** (position is a mod *destination* — driven by
  LFO/env/velocity; speed independently modulatable), **per-channel RGB offset** (C-axis),
  **axis-binding** T/Y/X (per-instrument switch; Y-as-time wiring deferred to B9), **position/speed
  glide** (portamento on retrigger), **frame interpolation = nearest/blend ONLY** (RIFE is B7).
- **Trigger modes** (orthogonal to playback engine): `gate` / `one-shot` map onto the unified
  `InterpolationMode` (PR-B); `toggle` / `continuous` are pad behaviors emitting gate/oneShot events.
- **Opacity-ADSR** → the per-voice `VoiceLayer.opacity`.
- **Slicing:** transient / grid / manual → "slice to Sample Rack" emits a B4 rack, one pad per slice.
- **Melodic mode:** played across a note range via piano roll (note → startFrame offset OR speed —
  per-instrument choice; this is the "chromatic" instrument vs the "trigger" rack distinction).

**Gates** — IN: B2. OUT: universal; per-param visual-diff (kills dead params, BUG-PREVENTION P2);
loop crossfade seam; reverse; scrub-by-LFO; slice count == transient count; glide smoothness.
**Est:** ~8–10h (RIFE removed). **Risk:** medium.

---

### B4 — Sample Rack host + Ableton-clone channels/macros (PI-2a)
**Design**
- **`RackNode` leaf** = `{ instrument, chain: EffectInstance[], sends: Send[] }`. Pad = note holder
  (`Pad.modRoutes` — renamed in PR-B) + one leaf.
- **Signal routing (clone Ableton):** each pad = a channel with its own effect chain + **sends** to
  shared **return** busses (e.g. a "feedback"/"datamosh" return several pads feed); all channels
  **summed to one rack output** (→ a track via B2's Performance Track). Per-pad: opacity, blend, M/S, choke.
- **Macros:** 8 per rack, each → one-or-many param destinations. **Fan-out capped**
  (`MAX_MODROUTES_PER_MACRO`, `MAX_TOTAL_EDGES` in `security.py`, §10 P1-5).
- **Choke groups** within the rack's sibling set.
- **Editor UI:** context-sensitive device-chain row shows the pad grid + selected-pad detail (key,
  MIDI, mode, ADSR, modRoutes, sends, choke). Reuses existing PadGrid/PadEditor, adapted off the
  modal store.

**Gates** — IN: B3. OUT: universal; send/return routing correct; macro one-to-many within fan-out cap;
choke across siblings; slice-to-rack round-trip; pad delete cleans voice + MIDI + undo symmetrically.
**Est:** ~12–16h. **Risk:** medium.

---

### B5 — Grouping / composite-tree (PI-2b)
**Design**
- **`RackNode` branch** = `{ children: RackNode[], chain, composite:{opacity,mode}, chokeGroups,
  voiceCap, macros }`. A pad can hold a branch → one note fires an ensemble.
- **Render = post-order traversal:** branch caps/chokes/orders children → composites
  (`render_composite`) → applies branch chain → emits ONE layer upward.
- **Hierarchical state keys (§10 P2-2):** per-layer state keyed by **path-from-root**, not a flat
  signature (`zmq_server.py:782`) — else nested stateful effects alias on sibling reorder.
- **`loadDrumRack` must recurse** into branch children for pad-id reconciliation (today flat
  `rack.pads.map`, `performance.ts:320`) or nested pads orphan MIDI/undo.
- **Depth cap:** `MAX_BRANCH_DEPTH` + `MAX_TOTAL_VOICES_PER_RENDER` enforced in traversal (§10 P1-5).

**Gates** — IN: B4. OUT: universal; nested-branch composite correctness; per-path state isolation on
sibling reorder; depth-cap rejection; nested-pad reconciliation on load.
**Est:** ~10–14h. **Risk:** medium-high (recursion + state keying).

---

> **Caveat for B6–B10 designs:** these are now full designs (per user request), but each depends on a
> safety gate (SG-1/3/5/8) that does not yet exist in code. The SG contract may refine the GPU/memory/
> numeric details below at build time — treat the **data model + behavior + UI + tests** as stable and
> the **GPU/memory enforcement specifics** as "final at gate."

### B6 — Frame-Bank (Wavetable) (PI-3a) · gated SG-8 (+ SG-1 if flow-morph)
The video analog of a wavetable oscillator: an indexed **bank of frames** that a modulatable
**position** scans/interpolates through.
**Design**
- **Data model:**
  ```ts
  interface FrameBankInstrument {
    type: 'frameBank';
    slots: SlotRef[];                 // SlotRef = {clipId|stillId|generative, frameIndex}
    position: number;                 // 0..1 across the bank; PRIME mod destination (LFO sweep = wavetable scan)
    interp: 'nearest' | 'blend' | 'flow';   // 'flow' uses B7 (optical-flow morph between adjacent slots)
    byteBudget: number;               // resident decoded-frame ceiling in BYTES (NOT slot count)
    timeAxis?: 't' | 'y' | 'x';       // position may itself be axis-bound (B9 tensor); lowercase canon (P1-A)
  }
  ```
- **Behavior:** `idx = position * (slots.length-1)`; integer part = slot, fractional part = blend/morph
  with the next slot. Emits one `VoiceLayer` (the resolved/interpolated frame) per active voice;
  polyphonic via B2 if multiple positions are triggered. `position` is the headline mod target — an
  LFO over it is a "wavetable sweep" through footage.
- **Memory (the safety crux):** byte-budget **LRU over decoded frames**, NOT a slot count (256×4K RGBA
  ≈ 8.5GB → 16GB freeze). When over budget, evict LRU + serve a **downscale-proxy** of the requested
  slot; SG-8 drops resolution/slot-residency further under system memory pressure. The existing
  `_max_readers=10` caps file handles, not decoded RAM — this is a NEW bound.
- **UI:** horizontal slot strip (thumbnails) + a position knob with a live moving indicator (Kentaro
  viz principle) + interp dropdown + a byte-budget/residency readout.
- **Security:** `MAX_FRAMEBANK_SLOTS`, `byteBudget` hard cap, `position` clamp [0,1] + finite guard,
  per-slot `validate_upload` on add. SG-8 gate; SG-1 only if `interp==='flow'` (rides B7's GPU path).
  **The byte-budget is BACKEND-enforced** (resident decoded-frame accounting lives where the OOM happens,
  the sidecar) — the `byteBudget` field is a request, not the enforcement; the renderer is the authority.
- **Tests (export-path for determinism):** fractional-position crossfade; byte-budget eviction → proxy
  served, no OOM; position-LFO sweep determinism (seeded, **export path**); SG-8 degrade drops to proxy not crash.
**Gates** — IN: B5 + SG-8 (+ SG-1 if flow). OUT: above + universal checklist. **Est:** ~12–18h.

### B7 — Optical-flow / RIFE frame interpolation (PI-3b) · gated SG-1
High-quality frame interpolation for slow-mo, scrub-between-frames, and Frame-Bank morph. **Not in
this repo** — a model port from morphlab (vendored RIFE arch + pending Kaggle weights).
**Design**
- **Service shape:** a sidecar interpolation function `interp(frameA, frameB, t∈(0,1)) → frame`,
  callable by Sampler (speed≠1 / scrub) and Frame-Bank (slot morph). Stateless per call.
- **Dependency:** torch **or** ONNX runtime + bundled weights. **Decision: bundle an fp32 ONNX model**
  (deterministic, no first-run download stall, no torch heft) for the export path; an optional MPS/Metal
  fast path for live preview only.
- **Determinism (the crux):** GPU inference varies across drivers/precision. **Rule:** the export path
  uses the **deterministic fp32 ONNX** model so the byte-identical export gate holds; the live MPS path
  is preview-only and never feeds export. If a platform lacks the deterministic path, flow frames are
  marked non-deterministic and **excluded** from the export hash gate (documented per-platform).
- **Fallback:** model absent/load-fail → degrade to `blend` interp (no hard dependency; never crash).
- **UI:** the interp-quality selector on Sampler/Frame-Bank shows nearest/blend/flow; flow shows a
  "loading model" state on first use.
- **Security:** SG-1 GPU resource lifetime (RAII handles, pool ceiling); model-file integrity check;
  per-inference timeout (degrade to blend on timeout).
- **Tests:** slow-mo quality (no ghosting on motion vectors); chosen-path export reproducibility; blend
  fallback when model absent; GPU handle leak == 0 (SG-1 CI).
**Gates** — IN: SG-1. OUT: above. **Est:** ~15–25h (standalone model-integration sub-project).

### B8 — Granulator (PI-3c) · gated SG-1 + SG-3 + SG-8
The headline synth-paradigm instrument: a **cloud of grains**, each an N-axis (T,Y,X,C,F,L) slice of
source, windowed and composited.
**Design**
- **Data model:**
  ```ts
  interface GranulatorInstrument {
    type: 'granulator';
    source: SourceRef;
    density: number;                       // grains spawned per frame (cap MAX_GRAINS)
    grain: { T; Y; X; C; F; L };           // per-axis interval size of each grain
    jitter: { T; Y; X; C; F; L };          // per-axis randomization (seeded → deterministic)
    position: { T; Y; X; C; F; L };        // per-axis grain-cloud center, each modulatable
    window: 'hann' | 'tri' | 'rect';       // grain envelope shape
    selection: 'random' | 'latentSimilarity' | 'onset' | 'scenePayload';
    grainEnv: Record<Axis, EnvSpec>;       // per-axis amplitude envelope across the grain
  }
  ```
- **Behavior:** each frame, spawn `density` grains; each grain samples `source` at `position+jitter`
  over its axis-intervals, applies `window`+`grainEnv`, composites into the instrument's single output
  layer. Grains are **sub-voices inside the instrument's voice budget** (not top-level voices). Selection
  rule picks grain positions: `random` (seeded), `onset` (audio/scene triggers), `latentSimilarity`
  (embedding-nearest → **requires SG-3**), `scenePayload` (cut metadata).
- **Rendering:** GPU — each grain ≈ a textured quad / shader pass; ~200 grains/frame is real GPU work →
  **SG-1 mandatory.** Render-budget guard degrades `density` if eval > 16ms/frame.
- **Memory/perf:** `MAX_GRAINS` hard cap; SG-8 drops density (then spectral, then latent grains per the
  SG-8 degrade order) under memory pressure.
- **Determinism:** seeded grain positions/jitter (`Hash(seed+frameIndex+grainIndex)`) → identical
  replay. Latent selection (SG-3) must NaN-sentinel latents (OOD → blank/NaN frames otherwise).
- **UI:** per-axis density/size/jitter/position knobs; a live grain-cloud visualization; selection-rule
  picker; per-axis envelope mini-editors (Kentaro density-without-clutter).
- **Security:** SG-1 (GPU), SG-3 (latent NaN), SG-8 (memory), `MAX_GRAINS`, all axis numerics clamped+finite.
- **Tests:** grain-count cap; per-axis envelope shape; seeded grain replay byte-identical (**export path**
  — preview seed is wall-clock); latent NaN sentinel aborts lane + toasts; SG-8 density degrade; GPU leak == 0.
**Gates** — IN: B5 + SG-1 + SG-3 + SG-8. OUT: above. **Est:** L–XL (~40–70h).

---

### B9 — Tensor mod-routing + Y-as-time (PI-4) · gated SG-5 (+ SG-3 for learned bindings)
Modulation routing becomes a **tensor**: an edge reads along one axis and writes along another (vision
B4). The experiment the user explicitly wants. Ship T + Y/X bindings first; painted/learned are research.
**Design**
- **Data model:**
  ```ts
  // LOWERCASE axis is CANONICAL (matches SPEC-2 validator, demo .entropic files, and .dna serialization;
  // review P1-A — uppercase here was the minority/wrong side, now fixed).
  type Axis = 't' | 'y' | 'x' | 'c' | 'f' | 'l';
  // ONE shared 8-member union (the same one PR-B/SPEC-2 ship). The ACCEPT-SET is tier-gated, NOT the union.
  type BindingRule = 'broadcast' | 'sampleAt' | 'scanOver' | 'integrate'
                   | 'painted' | 'hilbert' | 'polar' | 'learned';
  // B9 CONSUMES PR-B/SPEC-2's axis-extended OperatorMapping — does NOT declare a parallel ModEdge (review P2-A).
  // Shape (snake_case, per SPEC-2): { source_id, target_param_path, src_axis, dst_axis, binding_rule, depth, curve, polarity }
  ```
  > **Namespace footgun (review P3-B):** "B4" is overloaded — **Vision-B4** = the cross-axis tensor *schema*
  > (SPEC-2, lands in PR-B); **Creatrix-B4** = the Sample Rack build (this plan). They are different things;
  > the SPEC-1 crosswalk disambiguates.
- **Y-as-time first (vision C1):** a per-instrument `timeAxis: 't'|'y'|'x'` switch (already a field on
  Sampler/Frame-Bank). `Y` → the playhead advances down image rows (slit-scan / scanline-as-time). This
  is the cheap, felt, shippable primitive; the full per-edge tensor is the general case on top.
- **Engine:** extend the modulation resolver so an edge maps a source value *over srcAxis* to a
  destination *over dstAxis* via `bindingRule`: `broadcast` (scalar→all), `sampleAt` (index), `scanOver`
  (per-row/col vector), `integrate` (cumulative). Destinations may be scalar OR a **field** (2D) when
  `dstAxis` is spatial — the hook for per-pixel param fields (vision C3, future; B9 ships scalar +
  scanOver, field-dst behind a flag).
- **Cycle safety (SG-5, the hard precondition):** axis-bound edges (esp. painted/learned) can form
  **runtime-dependent** cycles. PR-B's DFS toposort must (a) be corrected to the real `list[dict]`/
  `parameters.sources` shape (§2.1), (b) **raise** `ModulationCycleError` (today it warns + falls back
  to declaration order → silent stale `0.0`), and (c) extend to axis edges. SG-5 adds **deterministic
  cycle-break ordering** (stable tie-break by edge id) + **snapshot routing per render-tick** so a
  conditional cycle resolves identically across the two replay passes (else the byte-identical export
  gate is flaky for tensor projects).
- **UI:** a routing inspector rendering edges as a compact topology graph (Kentaro principle:
  modulator→target lines, depth = line thickness, color per source); per-edge axis pickers +
  binding-rule + depth arc around the target knob (Bitwig-style). Painted/learned hidden behind a
  research toggle.
- **Flag enforcement at the TRUST BOUNDARY (not just UI):** `bindingRule` is a string enum; hiding
  `painted`/`learned`/`hilbert`/`polar` + field-destinations behind a UI toggle is INSUFFICIENT — a
  hand-edited/malformed project file can persist `bindingRule:'learned'` and the loader would evaluate it.
  **`project/schema.py` must reject (or coerce to `broadcast`) any flagged `bindingRule` whose flag is off,
  at load time.** SG-5 gates cycles and SG-3 gates NaN — neither gates the enum itself; this is a separate
  validation rule.
- **Security:** SG-5 (cycles), SG-3 (learned-binding NaN), schema-level bindingRule flag-rejection (above),
  `MAX_TOTAL_EDGES`, depth/finite clamps on every edge.
- **Tests (export-path for determinism):** cycle detection (direct / n-hop / runtime-conditional /
  axis-bound); deterministic cycle-break replay (same project → identical break order → byte-identical,
  **export path**); flagged-bindingRule rejected at schema load when flag off; Y-as-time scanline output;
  per-binding-rule correctness; field-destination smoke (flagged).
**Gates** — IN: PR-C + **PR-B's §2.1 toposort correction (raise + correct signature)** + SG-5 (+ SG-3 for
learned) + **widen SPEC-2's Tier-1 validator accept-set from `{broadcast}` to the rules B9 implements, in
lockstep (review P1-B) — enforced by SPEC-6 Lint-3** (new enum value must land with renderer impl + validator
update in the same PR). OUT: above. **Est:** ~14–18h for T+Y/X+core rules; painted/learned/field-dst research.

---

### B10 — Live performance affordances (PI-5) · gated SG-8
The live-input layer that makes the instruments *playable* — woven into the timeline, NOT a modal mode.
**Design**
- **MIDI Learn** — `{ controlId → {target: padId|ParamPath, kind: 'note'|'cc', min, max} }`, persisted in
  project. **MIDI input rate-limit** (reuse the toast 2s-dedup pattern, §10 P3) so a stuck controller
  can't thrash voice-steal or balloon the capture buffer. Echo-suppression (SG-H3) on motorized faders.
- **Frictionless track Freeze** (the 4-voice forcing function) + **Freeze↔voice state machine** (§10 P2-4,
  the attack-ramp/`isActive` bug class):
  ```
  IDLE ──user freeze──▶ FREEZING (async render bake) ──ok──▶ FROZEN (voices released, slots freed)
                            │  trigger arrives mid-freeze → QUEUE by frameIndex (NOT promise-time)
                            ├──bake error (freeze.ts finally→idle)──▶ IDLE: drain queue vs PRE-freeze state
                            └──user cancel──▶ IDLE: drain queue vs PRE-freeze state (no slots freed)
  ```
  **Three things the FSM must pin down (else it's the attack-ramp/`isActive` bug class, §10 P2-4):**
  1. **Drain by `frameIndex`, not Promise-resolution time** — a queued trigger applies at a deterministic
     frame so capture-replay is byte-identical (else B10's own retro-capture gate flakes).
  2. **Freeze-FAILURE branch is explicit** — `freeze.ts`'s `finally` sets `idle` even on error; queued
     triggers must drain against the PRE-freeze state on failure, against FROZEN on success.
  3. **Double-bake guard** — the bake snapshot MUST exclude queued-but-not-applied voices (a queued voice
     is neither baked into the freeze nor lost).
  Depends on PR-zero's per-track freeze shape (`freeze.ts` is decoupled from `padStates` today — this
  build introduces the coupling).
- **Quantized launch** — triggers snap to the next division of the **existing edit/slice grid** (no
  footage warp; resolved decision §15). Off by default.
- **Panic** — clears all voices (existing `panicAll`), bound to a hard key.
- **Retro-capture** — rolling event buffer → dumped as events on the Performance Track. **Events only**
  (resolved decision §6.4): `{frameIndex, eventIndex, note, velocity}`, **no `performance.now()`, no
  embedded mutable mappings** → deterministic replay.
- **NOT** a modal Live Performance Mode (vision E6 — graceful axis-aware degradation, multi-output — is
  far-future and needs SG-8's full degradation policy).
**Gates** — IN: B2 + B4 + SG-8. OUT: MIDI map persists + round-trips; rate-limit drops flood;
freeze frees voice slots deterministically; **mid-freeze trigger → QUEUED (not orphaned/baked)** test;
panic clears all; retro-capture replay byte-identical (incl. edit-after-capture). **Est:** ~10–14h.

---

## 4. Full sequence (linear, with gates)

| # | Build | DEP gates | SG gates | Est |
|---|---|---|---|---|
| — | (sweep) PR-zero, PR-A, PR-B, PR-C | — | — | (parallel session) |
| 1 | **B1** 1-voice Sampler | PR-A | — | 6–9h |
| 2 | **B2** Voice spine + Performance Track | PR-zero, PR-B | — | 10–14h |
| 3 | **B3** Full Sampler | B2 | — | 8–10h |
| 4 | **B4** Sample Rack + macros | B3 | — | 12–16h |
| 5 | **B5** Grouping / tree | B4 | — | 10–14h |
| 6 | **B6** Frame-Bank | B5 | SG-8 (SG-1 if GPU) | 12–18h |
| 7 | **B7** Optical-flow/RIFE | — | SG-1 | 15–25h |
| 8 | **B8** Granulator | B5 | SG-1, SG-3, SG-8 | L–XL |
| 9 | **B9** Tensor + Y-as-time | PR-C | SG-5 (SG-3) | 14–18h |
| 10 | **B10** Live affordances | B2, B4 | SG-8 | 10–14h |

**Near-term shippable core = B1→B5** (~46–63h after the sweep): real Sampler + Sample Rack with
macros/grouping. **B6–B10 are gated** behind unbuilt safety contracts and authored fully at gate.

---

## 5. Safety-gate designs (SG-*) — all currently UNBUILT, must land before their dependents

| SG | Contract | Enforced where | Blocks |
|---|---|---|---|
| **SG-1** | GPU resource lifetime: every Metal/GL handle RAII-owned, texture-pool ceiling per effect, CI "create+destroy 10k handles, leak==0" | new GPU codegen layer | B7, B8 |
| **SG-3** | Latent NaN/Inf sentinel: L2-clamp/project-to-manifold on feedback-capable mod paths; NaN-detector aborts the lane + toasts; never silent-pass NaN frames | render pipeline output | B8 latent, B9 learned bindings |
| **SG-5** | Dynamic cycle detection + **deterministic cycle-break ordering** (stable tie-break by edge id); snapshot routing per render-tick; CI "conditional cycle detected <16ms" | extends PR-B's DFS toposort (`engine.py`) | B9 |
| **SG-7** | Codec/decode timeout on untrusted sources (PyAV `av.open`/`to_ndarray` wrapped, default 5s/frame); corrupt file rejected upstream | `video/reader.py` + `security.py` | any untrusted clip import |
| **SG-8** | Memory-pressure auto-disable tiered to detected RAM (16/32/64GB); degrade order (latent grains → spectral grains → grain density → frame-bank slots); status overlay | engine telemetry | B6, B8, B10 |

Plus hygiene (all tiers): disk-LRU on caches (SG-H1), FD management (SG-H2), MIDI/OSC echo-suppression (SG-H3).

---

## 6. Decisions — RESOLVED (2026-06-03)
1. **B1 placement → its own minimal PR right after PR-A.** Keeps PR-A info-only; avoids scope-creeping
   the parallel session. Spec'd in `B1-1VOICE-SAMPLER-PLAN.md`.
2. **Melodic note mapping → default `note → startFrame offset` (chromatic scrub** — the granular-video
   keyboard, consistent with "pitch is a speed *knob*, not the keyboard"). `note → speed` is a
   per-instrument option. (B3.)
3. **Macro count → 8** (Ableton parity).
4. **Retro-capture → trigger events ONLY** (deterministic + light; baking the rendered composite is
   Freeze/Flatten's job, not capture's).
5. **Gated-tier order → B6 (Frame-Bank) before B8 (Granulator)** — cheaper, closer, needs no SG-3.
6. **§2.1 hand-offs → documented here as the authoritative checklist.** This session does NOT
   unilaterally file issues against the parallel session's PRs (cross-session/outward action); relay to
   the PR owner, or say "file them" and I'll open issues.

## 7. Next step
Approve the sequence + B1 design → B1 routes to `/workflows:plan` (or straight to build as the
placeholder-killer once PR-A lands). B2 onward unlock as their DEP/SG gates go green. No
implementation until "go."
