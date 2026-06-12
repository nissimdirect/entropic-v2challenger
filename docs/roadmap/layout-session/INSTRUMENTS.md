---
title: Creatrix — Instruments & Performance (discovery + implementation plan)
version: 1.1
created: 2026-06-02
revised: 2026-06-02 (folded in /review: architecture-strategist + security-sentinel + data-integrity-guardian, all verified against codebase)
status: plan-reviewed / CONDITIONAL — approvable for planning, NOT for implementation. See §10.
authors: brainstorm thread (user + Claude) → /cto plan → /review hardening
relationship: |
  This is the deferred "instruments-tab internals" + performance-mode discovery
  that PLAN.md §12 ("Sample explorer / drum rack internals — placeholder ships in
  PR-A") and DECISIONS.md #5 ("sample bank / drum rack… more discovery necessary")
  flagged as missing. It does NOT replace PLAN.md — it sequences AFTER / alongside it.
inputs:
  - this brainstorm thread (2026-06-02)
  - PLAN.md v1.2 (Creatrix arrangement-view redesign)
  - DECISIONS.md (28-decision worksheet)
  - entropic-synth-paradigm-vision.md (wavetable-axes liberation)
  - codebase ground-truth (compositor.py, applyCCModulations.ts, performance.ts, App.tsx)
  - history crawl (learnings 41/104/106, BUG-PREVENTION A1, ARCHITECTURE/PRD/UX-SPEC/DATA-SCHEMAS)
coordination: |
  3 sessions live at authoring time (23dd223c, 0f61f5a3, c8c1bc5f). One is poised to
  start PR-zero. This is a NEW file; do not edit PLAN.md/DECISIONS.md/index.html (owned
  by that work). Instrument PRs (PI-*) depend on PR-zero + PR-B + PR-C landing first.
---

# Creatrix — Instruments & Performance

## 0. What this document is

The **WHAT** (vision + locked decisions) and a draft **HOW** (CTO implementation plan)
for Creatrix's instruments and performance capability. This is the discovery the main
Creatrix plan explicitly deferred. Nothing here is built yet.

---

## 1. Core thesis — the video sampler paradigm

Map the **sampler / instrument-rack paradigm onto video.** The key structural insight:

> A **video voice has two playheads** an audio voice doesn't:
> **footage position** (which frame shows) + **composite presence** (opacity/blend into
> the output) — plus **spatial placement**. They are independent.

| Synth voice | Video instrument voice |
|---|---|
| Oscillator / sample playback | **Playback engine** — how footage frames advance |
| VCA (amp envelope) | **Per-voice opacity** → set directly on the `VoiceLayer` (NOT the track-terminal Composite — see §10 P1-4) |
| Filter / mod envelopes / LFOs | **Mod section** — envelopes/LFOs routed to any param |
| Pitch / keytrack | **Playback speed** (the repurposed "pitch" knob) |
| Pan | **Spatial placement** (X/Y transform on canvas) |

**A voice = one composited layer.** Polyphony = N simultaneous layers in
`compositor.render_composite` (which already exists and already threads per-layer state).
Instruments are **sources** that land on an ordinary track and then flow through the
normal pipeline (effect chain → Composite → automation). Not a parallel universe.

---

## 2. Performance mode — grounded in history (READ FIRST)

**Performance mode exists, but it is NOT a separate view/mode.** This is the single most
important constraint, learned the hard way:

- **Learning #106:** 3 separate modes (Quick/Timeline/Perform) → user: *"if a performance
  is supposed to be time-based, why do I have [separate modes]"* → **separate modes =
  cognitive overhead, not power.**
- **Learning #104:** 2+ sessions of cosmetic fixes on an architecturally-broken Perform/Mixer view.
- **Learning #41:** built triggers/ADSR/compositing without scoping jobs-to-be-done first.
- **BUG-PREVENTION.md A1:** *"Perform = separate view → 'This separate mixer view is a UX
  nightmare.' → Performance Track is a timeline track type, not a separate view. All
  interaction happens in the same timeline UI."*

**Canonical design (ARCHITECTURE / PRD / UX-SPEC / DATA-SCHEMAS §5):**
- A **Performance Track** — a timeline track type (electric blue) that holds **trigger
  events**, not footage. Created with `Cmd+Shift+T`.
- It is a **Source in the modulation system**: routes signal into any param of any track.
- **Context-sensitive bottom panel:** selecting a Performance Track shows the **Sample Rack
  editor** in the device-chain row (exactly as selecting a video track shows its effect chain).
- Retro-capture buffer, choke groups, MIDI/keyboard input.

**Current state = the discouraged half-build.** `isPerformMode` (the `P` toggle) +
`PerformancePanel` is a *modal* perform mode — the very thing A1 warns against. Creatrix
should realize the **track-type** vision and retire the modal toggle.

**Definition adopted:** "Performance mode" = the **Performance Track type + live input
(MIDI/keyboard) woven into the unified timeline.** A full dedicated *Live Performance Mode*
with graceful degradation (vision E6, Tier 5, gated by SG-8) is a far-future layer on top,
not v1.

---

## 3. Locked decisions (from the brainstorm thread)

### Sampler playback model
1. **No transposition.** The "pitch" knob → **playback speed** (1×; 0 = freeze; negative =
   reverse; >1 fast). Decoupled from any audio-pitch notion.
2. **Playhead** selects the **start point**; **trigger = "hit play at the playhead."**
3. **Loop** — on/off + in/out + direction (fwd/rev/ping-pong).
4. **Scrub** = playhead **position is a modulation destination** (LFO/env/velocity-drivable);
   **speed is independently modulatable** too. Position-as-field = the synth-paradigm's T-as-field.

### Voices / polyphony / compositing
5. **A voice = one layer.** Polyphony = simultaneous composited layers.
6. **Hard cap = 4 voices.** Not a default — a ceiling. **Rationale: force frequent Freeze.**
   Also honest re: the **16GB Apple-silicon bottleneck** (vision flags this as THE
   constraint; this is the manual version of SG-8 memory-pressure auto-disable).
7. **Voice stealing: oldest drops** at the cap.
8. **Z-order: newest on top.**
9. **Freeze is track-level** (consistent with existing Freeze/Flatten, PR #70), NOT per-voice.
   Workflow: play → fill 4 voices → **freeze the track** (bake take to a flat clip) → freed
   slots → keep playing. (Tension noted: track-freeze is a chunkier rhythm than per-voice;
   revisit at build once it's felt.)

### Modulation
10. **One envelope → many destinations simultaneously** (one-to-many).
11. **Velocity is just another mod source** on the bus (default → opacity, repointable).
12. **Tensor mod-routing** (per-mod-edge axis binding): each routing declares which axis its
    source reads (T/Y/X/C/F/L). User wants this **to experiment** → build the data model
    tensor-shaped from day one. = vision **B4 Cross-Axis Routing Tensor**, gated by **SG-5**
    (dynamic cycle detection — painted/learned bindings can form runtime-dependent cycles).
13. **Y-as-time** (and X-as-time) = a **per-instrument mode switch** (simplest); the fancy
    per-param/per-edge binding rides #12. = vision **C1 Scanline-as-Time** (cheap once
    schema-aware automation lands).

### Trigger modes (orthogonal to the playback engine)
14. **gate · one-shot · toggle · continuous.** gate/one-shot map directly onto the unified
    automation `InterpolationMode = smooth | step | gate | oneShot` (already in PR-B).
    toggle/continuous are pad *behaviors* that emit gate/oneShot events under the hood.

### Tempo / quantize (resolved — minimal)
15. **No beat-warping of video.** Out of scope. Quantize stays the existing edit/slice grid
    (Cmd+U), on/off, for editing and slicing. (Quantized launch can ride that grid later;
    not building footage time-stretch.)

### Naming
16. **Creatrix = the whole app** (Entropic renamed, v3.0, PR-D). NOT the perform mode.
    (Collision with ghostwriter's chaos-oracle Creatrix is accepted; memory disambiguates.)
17. Instruments: **Sample Rack** (renamed from Drum Rack), **Sampler**, **Granulator**,
    **Frame-Bank / Wavetable** — four distinct instruments.
18. **`Pad.mappings` → `Pad.modRoutes`** (resolves the `Operator.mappings` collision from
    PLAN §7.7/L4 WITHOUT colliding with the existing `DEFAULT_PAD_BINDINGS` keycode constant —
    "padBindings" would have created a worse near-collision, §10 P2-3). Ships once, in PR-B's
    v3 schema break (not duplicated in PI-2).

---

## 4. The instrument set (4) + Ableton-clone rack features

| Instrument | What | Vision ref |
|---|---|---|
| **Sample Rack** | The **instrument-rack host.** Grid of pads; each pad = note holder + one instrument + per-pad effect chain + sends; summed to one rack output. | — |
| **Sampler** | Single clip; melodic (piano-roll-playable) **or** triggered; **sliceable** (transient/grid/manual) → "slice to Sample Rack" auto-builds one pad per slice. | — |
| **Granulator** | Grains as (T,Y,X,C,F,L) interval tuples + per-axis envelopes; density/jitter modulatable. Heavier; safety-gated. | A1 |
| **Frame-Bank (Wavetable)** | Up to 256 slots (stills/clips/generative); modulatable wavetable-position + optical-flow morph between slots. **Distinct from Granulator.** | A3 / C9 |

**Ableton-clone rack features (user: "clone that"):**
- **Grouping** = the composite **tree**: a pad can hold a sub-rack (branch) that composites
  its children to one output upward. Recursion = nesting.
- **Channels** = per-pad chain with **sends/returns** (shared busses — e.g. a shared
  "feedback" or "datamosh" return several pads send into).
- **Macros** = 8 macro knobs per rack, each mapping to one-or-many params (Ableton rack macros).
- **Choke groups** within a sibling set.

---

## 5. The instrument contract + voice model (CTO, verified against code)

**Keep the existing split:** frontend = state authority (voice lifecycle, polyphony, envelope
eval, mod bus, tree ordering); Python sidecar = stateless renderer. Already how `performance.ts`
+ `App.tsx` + `compositor.render_composite` work.

```ts
// Frontend pure evaluator, per frame tick
interface Instrument {
  type: 'sampleRack' | 'sampler' | 'granulator' | 'frameBank';
  params: InstrumentParams;
  evaluate(ctx: EvalContext, stateIn: InstrumentState): {
    voices: VoiceLayer[];      // 0..N declarative layer specs (polyphony)
    stateOut: InstrumentState; // playhead positions, env phases, voice ages
  };
}
interface EvalContext {
  frameIndex: number;                      // determinism anchor (transport position)
  triggers: TriggerEvent[];                // note on/off this tick (live) or from clip (captured)
  modSources: Record<string, number>;      // velocity, LFOs, env values = the bus
  projectSeed: number;
}
// A voice maps 1:1 onto compositor.render_composite's existing layer dict
interface VoiceLayer {
  voiceId: string;                         // state threading + steal/choke
  source: { clipId: string; footageFrameIndex: number } | { generator: GenSpec };
  opacity: number;                         // per-voice VCA — set on THIS layer; distinct from the track-terminal Composite (§10 P1-4)
  blendMode: BlendMode;
  transform: { x; y; scale; rotate };      // spatial placement (X/Y)
  chain: EffectInstance[];                 // per-pad / leaf effect chain
  perChannelOffset?: [number, number, number]; // C-axis freebie
  timeAxis?: 't' | 'y' | 'x';              // per-instrument axis binding (#13); lowercase canon (review P1-A)
}

// Rack = composite tree (#4 grouping)
type RackNode =
  | { kind: 'leaf';   instrument: Instrument; chain: EffectInstance[]; sends: Send[] }
  | { kind: 'branch'; children: RackNode[]; chain: EffectInstance[];
      composite: { opacity; mode }; chokeGroups: ChokeGroup[]; voiceCap: number;
      macros: Macro[] };
```

**Render = post-order traversal.** Leaf → `evaluate()` → voices. Branch → cap/choke/order
children → composite (`render_composite`) → branch chain → one layer upward. **v1 = flat
(single Sample Rack branch reusing `render_composite` as-is); recursion is a small isolated
backend add for the nested case.**

**Determinism preserved (the key insight) — with three hard conditions (§10):** live play is
nondeterministic (human input), but **rendered/exported output replays from captured events.**
Given (event list + frameIndex + seed), the evaluator emits identical layer specs → identical
pixels. Voice state is *derived from events*, never an independent RNG. **Conditions for this to
actually hold:** (1) steal/choke/age decisions recompute purely from `(frameIndex, event-index)`
— **never** from `performance.now()` (it's currently in the capture payload, `padActions.ts:25`);
(2) events must NOT embed a mutable `mappings` snapshot that drifts from live edits
(`padActions.ts:30,50` does this today — must change); (3) **export is backend-driven**
(`export.py:310`), so the voice FSM + event list must be replayed *backend-side* (or serialized
into the export job) — the frontend authority that holds in live preview is NOT the export
authority. The seed lock `Hash(ProjectID+EffectID+FrameIndex+Seed)` survives only under these.

**Sampler param set (vs Ableton + the 6 axes):** start/end (playhead), speed, loop (in/out/dir),
**loop crossfade**, **frame interpolation** (PI-1 = nearest/blend ONLY; optical-flow deferred to
PI-3 — **RIFE is NOT in this repo**, it's a morphlab model port = SG-1-gated sub-project, §10 P1-3),
**per-channel RGB offset** (C-axis), **axis-binding** (T/Y/X), **position/speed glide**,
opacity-ADSR (→ the per-voice `VoiceLayer.opacity`, NOT the terminal Composite — §10 P1-4), trigger mode.

---

## 6. Reconciliation with the Creatrix 5-PR plan

| Our piece | Lands on / depends on |
|---|---|
| Instrument → dedicated output track w/ own chain | **PR-zero** (per-track effect chains) |
| Opacity envelope (VCA) | **PR-B** Composite-as-terminal-effect → modulate `Composite.opacity` |
| Trigger modes gate/one-shot | **PR-B** `InterpolationMode` (already exists) |
| Envelope → many destinations | **PR-B** `applyEffectModulations` / `applyProjectModulations` |
| Tensor mod-routing | **PR-C** operators + vision **B4**, gated **SG-5** |
| Y-as-time / axis binding | vision **C1**, needs schema-aware automation (B1, Tier 1) |
| Per-channel RGB offset | vision **C-axis** |
| 4-voice cap → freeze | **16GB bottleneck**; manual **SG-8** |
| `Pad.mappings`→`modRoutes` rename | **PR-B** types.ts v3 break (single location) |

---

## 7. Implementation plan (CTO) — phased, NO code yet

**Type: ARCHITECTURE. Feasibility: HIGH** — compositor (multi-layer + per-layer state) and
modulation (pure-function param override) already exist; this adds a *voice/instrument layer*
on top, not a new renderer. Strategy: extend, don't rebuild.

**Hard dependency order:** the existing sweep lands first — **PR-zero → PR-A → PR-B → PR-C**.
Instrument PRs (PI-*) come after, because they need per-track chains (PR-zero), Composite-as-
effect + unified automation + modulation refactor (PR-B), and the operator/tensor system (PR-C).

### PI-0 — Performance Track type + Instrument contract (the spine)  · M (~8–12h, de-risked)
- Add **Performance Track** track type (electric blue), `Cmd+Shift+T`. NOTE: `Track.type` already
  includes `"performance"` (`types.ts:60`) — partly pre-wired. Context-sensitive device-chain row
  renders the instrument editor on selection. **Retire `isPerformMode` modal toggle** (A1) — this
  touches 9 `App.tsx` refs + `PerformancePanel`/`PadGrid`/`global.css` + 4 test files; enumerate them.
- Define `Instrument` / `VoiceLayer` / `RackNode` contract (§5). Frontend voice-lifecycle FSM
  (attack→…→idle), polyphony cap (4, oldest-drops), z-order (newest-on-top), choke.
- Extend `render_composite`/pipeline to resolve `VoiceLayer.source` refs. **The declarative
  `{asset_path, frame_index}` decode path ALREADY EXISTS** (`zmq_server.py:704-808`) — flat
  rendering is largely done. **The real work: change per-layer state keying from `asset:{path}`
  (`zmq_server.py:763-765`) to `voice:{voiceId}` END-TO-END, and define stolen-voice cleanup that
  resets ONLY the dropped voice's cache (today any layer-set change cold-starts all survivors,
  `zmq_server.py:690-692`).** Without this, two voices of one clip cross-contaminate (§10 P1-1).
  **v1 flat** (no branch recursion yet).
- **Security (backend-enforced):** `MAX_COMPOSITE_LAYERS` rejected at `_handle_render_composite`
  BEFORE decode; clamp `footageFrameIndex` to `[0,frame_count-1]`; validate `voiceId`; finite+range
  guards on `transform`/speed/`perChannelOffset` (`feedback_numeric-trust-boundary`).
- **Tests:** trigger→layer L1 delta (oracle); cap=4 → 5th steals oldest; choke; **two voices on the
  SAME clip don't cross-contaminate stateful effects (datamosh)**; determinism regression that
  includes an **edit-after-capture replay** + a **malformed-event-list fuzz case** (not just
  capture-render-twice, which passes trivially — §10 P1-2).

### PI-1 — Sampler instrument (default)  · M (~8–10h, RIFE removed)
- Full param set (§5). Playback engine modes (one-shot/loop/hold/scrub + reverse/ping-pong).
- Opacity-ADSR routed to the **per-voice `VoiceLayer.opacity`** (NOT the terminal Composite — §10 P1-4).
- **Frame interpolation = nearest/blend ONLY.** Optical-flow/RIFE is NOT here (cross-repo morphlab
  model) → deferred to PI-3 behind SG-1, separately estimated (§10 P1-3). Per-channel offset.
- Melodic piano-roll play; **slicing** (transient/grid/manual) → emits a Sample Rack.
- **Tests:** per-param visual-diff (kills dead params, per BUG-PREVENTION P2); loop seam crossfade;
  reverse; scrub-by-LFO; slice count == transient count.
- **Recommended (Open Fork #1):** a read-only 1-voice Sampler can ship in **PR-A** as the
  placeholder-killer (the decode path already works) — validates the thesis before PI-2/PI-3 complexity.

### PI-2 — Sample Rack host + Ableton-clone grouping/channels/macros  · L (~16–22h)
- Sample Rack = pad grid; per-pad chain + sends/returns; summed to one rack output.
- **Grouping** = composite-tree branch recursion (the deferred nesting from PI-0). Depth cap.
- **Macros** (8/rack → one-to-many param maps, fan-out capped — §10 P1-3). **Choke groups.**
  (`Pad.mappings`→`modRoutes` rename already done in PR-B, not here.)
- **Slice-to-rack** consumes PI-1.
- **Security:** branch depth cap; macro fan-out cap; per-rack voice budget.
- **Tests:** nested-branch composite correctness; send/return routing; macro one-to-many; choke
  across siblings; slice-to-rack round-trip.

### PI-3 — Granulator + Frame-Bank (Wavetable) + optical-flow interp  · XL (~35–55h, split)
- **Frame-Bank** (A3) — wavetable of frames, modulatable position, **RAM budget in BYTES**
  (not slot count — 256×4K RGBA ≈ 8.5GB → 16GB freeze; downscale-proxy policy), RAM-LRU.
- **Optical-flow / RIFE frame interpolation** = its OWN line item (~15–25h): cross-repo model
  port (torch/onnx + weights + GPU lifetime + cross-driver determinism validation). NOT a "reuse."
- **Granulator** (A1) — grains across axes; GPU path.
- **Safety gates (all unbuilt — must land first):** SG-1 (GPU resource lifetime) blocks GPU
  granulator + RIFE; SG-3 (latent NaN sentinel) if latent grain selection; SG-8 memory-pressure.
- **Tests:** Frame-Bank byte-budget eviction; RIFE determinism across drivers; grain count cap;
  per-axis grain envelope; SG-8 degradation.

### PI-4 — Tensor mod-routing (the experiment) + Y-as-time  · L (~14–18h)
- Per-mod-edge axis binding (vision **B4**): edges carry (src_axis, dst_axis, binding_rule, depth).
- Y-as-time / X-as-time per-instrument switch (vision **C1**) as the first felt axis.
- **Safety gate: SG-5** (dynamic cycle detection) is a hard precondition. CAVEAT (§10 P2-1):
  the CURRENT `_topological_sort` (`engine.py:20`) is Kahn's-algorithm, `list[dict]`-based, reads
  `parameters.sources`, handles **Fusion-only**, and **does NOT raise on a cycle — it logs a
  warning and falls back to declaration order** (stale `0.0` reads). PR-B (§4.5) must REPLACE it
  with a real DFS that raises `ModulationCycleError` and walks ALL edges — and PLAN.md §4.5's
  proposed signature must be corrected to match the real `dict`/`parameters.sources` shape before
  PI-4 can depend on it. SG-5 must also define **deterministic cycle-break ordering** (stable
  tie-break by edge id), not just "snapshot," or replay isn't byte-identical for tensor projects.
  SG-3 (NaN sentinel) gates learned/painted binding values here too.
- **Tests:** cycle detection (direct/2-hop/3-hop/axis-bound + runtime-conditional); deterministic
  cycle-break replay; Y-as-time scanline output; tensor edge depth/binding correctness.

### PI-5 — Live performance affordances  · M (~10–14h)
- MIDI Learn for pads/params; **frictionless track Freeze** gesture (the 4-cap loop); quantized
  launch riding the existing grid; panic/recover; retro-capture → events on the Performance Track.
- **NOT** a modal view. Full Live Performance Mode (vision E6 + SG-8 degradation) explicitly deferred.
- **Tests:** MIDI map persistence (snapshot wire shape); freeze frees voices; panic clears all;
  retro-capture replays deterministically.

**Rough total: ~100–145h** (revised up — RIFE/optical-flow honestly costed as its own item;
per-phase redistribution: PI-0 smaller/de-risked, PI-1 smaller without RIFE, PI-2 tree-state
bigger, PI-3 bigger). *After* the existing 5-PR sweep. Sequence-gated by PR-zero/B/C. PI-3 and
PI-4 carry hard safety-gate preconditions (SG-1/3/5/8 — all currently unbuilt).

### Security summary — ENFORCEMENT CONTRACT (not prose; §10 Real Tigers)
The user-facing "4-voice cap" is a UX convention. The **security boundary is backend-enforced**
in `backend/src/security.py` with hard constants, rejected at `_handle_render_composite` BEFORE
the decode loop (mirroring SEC-6/SEC-7), because the frontend can be buggy / a project file can be
malformed:
- `MAX_COMPOSITE_LAYERS` — reject render if `len(layers)` exceeds it (today: no cap → 16GB freeze).
- `MAX_BRANCH_DEPTH` + `MAX_TOTAL_VOICES_PER_RENDER` — bound composite-tree recursion + fan-out.
- `MAX_MODROUTES_PER_MACRO` / `MAX_TOTAL_EDGES` — bound macro & tensor-edge fan-out (operators are
  capped at 16 but mappings-per-operator are NOT, today).
- **Frame-Bank: a byte budget** (resident decoded RAM), NOT a slot count — 256×4K RGBA ≈ 8.5GB;
  the only existing bound (`_max_readers=10`) caps file handles, not frames. Downscale-proxy policy.
- Clamp `footageFrameIndex` to `[0, frame_count-1]` and validate `voiceId` ∈ live-voices at the IPC
  boundary (today `zmq_server.py:728` does bare `int()`, no clamp → negative reaches PyAV seek).
- Extend `project/schema.py` to validate instrument/event-list contents (finite + range +
  referential integrity) on FILE LOAD, not just IPC.
- Cycle detection: SG-5 must define **deterministic cycle-break ordering** (stable tie-break by
  edge id), not just "snapshot per tick" — else replay isn't byte-identical for tensor projects.
- **Safety gates SG-1/3/5/7/8 do not exist in the codebase yet** (zero references). They are
  funded build items, and PI-3/PI-4 stay hard-blocked until they land. SG-3 (NaN sentinel) gates
  PI-4 tensor/learned bindings too, not only PI-3 latent grains.

### Recommendation
**GO to plan** — design tree-shaped + tensor-shaped now, implement flat-then-recursive. Build
PI-0/PI-1/PI-2 as the near-term shippable core (real Sampler + Sample Rack), treating
Granulator/Frame-Bank/Tensor (PI-3/PI-4) as the synth-paradigm follow-on behind their safety
gates. Do **not** start before PR-zero/PR-B/PR-C land. No code until this plan is approved.

---

## 8. Open forks still needing a decision
1. **Sequencing:** PI-* as a distinct post-sweep track (this doc), or pull a minimal real Sampler
   into PR-A in place of the placeholder?
2. **Frame-Bank vs Granulator priority** within PI-3 (Frame-Bank is cheaper/closer).
3. **Macro count** — 8 (Ableton parity) confirmed?
4. **Retro-capture target** — capture trigger events only, or also the rendered composite?
5. **Does the modal `isPerformMode` get removed in PI-0, or kept as a transitional "focus" view?**

## 9. Next step
Approve / adjust this plan, then it routes to `/workflows:plan` (or folds into the Creatrix PR
queue as PI-0..PI-5). No implementation until "go."

---

## 10. Review (v1.1) — CTO + Red Team + Data Integrity (verified against codebase)

Three independent agents reviewed v1.0 against the live `entropic-v2challenger` source.
**Combined verdict: CONDITIONAL** — approvable as a planning artifact, NOT for implementation
until the P1s below are resolved and safety gates SG-1/3/5/7/8 are funded builds. The core thesis
(voice = layer; `render_composite` as polyphony engine; frontend-authority/stateless-sidecar;
declarative source refs) was **verified and is the soundest part** — and the decode path already
ships, so PI-0 is partly pre-built.

### What's already true in the codebase (de-risks the plan)
- `render_composite(layers,…,layer_states)` exists and composites bottom-to-top with per-layer
  state threading (`compositor.py:82`).
- Declarative `{asset_path, frame_index, transform, chain, opacity, blend_mode}` decode path
  already ships (`zmq_server.py:704-808`).
- `Track.type` already includes `"performance"` (`types.ts:60`).
- `applyCCModulations` is the correct one-to-many precedent (clones chain, finite-guards, min/max scale).

### 🔴 P1 — must resolve before any implementation
- **P1-1 Per-voice state keying (top risk, CTO + DataIntegrity).** State is keyed `asset:{path}`
  (`zmq_server.py:763-765`), not `voiceId`. Two voices of one clip cross-contaminate stateful
  effects; stealing one cold-starts all survivors (`zmq_server.py:690-692`). → key on `voiceId`
  end-to-end + per-voice cleanup symmetry. (Folded into PI-0.)
- **P1-2 Capture-replay isn't deterministic as written.** Events embed mutable `mappings` +
  `performance.now()` (`padActions.ts:25,30,50`); edit-after-capture mixes stale+live; export is
  backend-driven (`export.py:310`) so authority must replay backend-side. → steal/choke pure from
  `(frameIndex, event-index)`; validate event list on load; backend replay. (Folded into §5, PI-0.)
- **P1-3 RIFE "reuse" is false.** Not in this repo — cross-repo morphlab GPU model port, SG-1-gated.
  → removed from PI-1 (nearest/blend only); separate ~15-25h item in PI-3. (Folded in.)
- **P1-4 Per-voice opacity vs single-terminal-Composite conflict.** VCA can't be "the terminal
  Composite's opacity" under polyphony (N voices, N opacities). → VCA = per-voice `VoiceLayer.opacity`,
  distinct from the track Composite. (Folded into §1, §5, PI-1.)
- **P1-5 Caps are frontend conventions, not backend boundaries (3 Real Tigers).** No
  `MAX_COMPOSITE_LAYERS`/`MAX_BRANCH_DEPTH`/`MAX_TOTAL_VOICES`/edge-fan-out cap in `security.py`;
  16GB-Mac freeze path. → §7 upgraded to an enforcement contract. (Folded in.)

### 🟡 P2 — resolve during planning
- **P2-1 SG-5 needs deterministic cycle-break ordering**, not just snapshot; current toposort
  warns-not-raises and falls back to declaration order (`engine.py:75-80`). PLAN.md §4.5's proposed
  signature doesn't match the real `dict`/`parameters.sources` function — correct it before PI-4. (Folded into PI-4.)
- **P2-2 Composite-tree state caching is single-level** (`zmq_server.py:782`); nested branches need
  hierarchical (path-from-root) state keys, and `loadDrumRack` must recurse into branch children
  (today flat `rack.pads.map`, `performance.ts:320`) or nested pads orphan MIDI/undo. → bump PI-2.
- **P2-3 Rename `Pad.mappings`→`modRoutes`** (NOT `padBindings` — collides with existing
  `DEFAULT_PAD_BINDINGS` keycodes, `constants.ts:31`); ship once in PR-B's v3 break. (Folded in.)
- **P2-4 Freeze↔`padStates` coupling undefined** — `freeze.ts` is decoupled from voices today;
  async freeze + mid-freeze triggers = orphaned voices (the attack-ramp/`isActive` bug class).
  Needs a state-machine spec; depends on PR-zero's per-track freeze landing. (Open Fork #5, PI-5.)
- **P2-5 `footageFrameIndex` unclamped** → negative reaches PyAV seek (`zmq_server.py:728`). Frame-Bank
  256-slot ≈ 8.5GB. (Folded into §7, PI-3.)

### 🔵 P3 — hardening nits
MIDI-flood rate-limit (reuse toast 2s-dedup pattern); SG-7 PyAV decode timeout; no video magic-byte
check (extension-only `validate_upload`); v2→v3 autosave landmine (`restoreAutosave`, delete stale
on version mismatch); SG-3 should also gate PI-4 (done).

### Required before status → APPROVED-FOR-IMPLEMENTATION
1. P1-1 voiceId keying + cleanup symmetry spec.  2. P1-2 determinism conditions + backend replay.
3. P1-3 RIFE unbundled (done).  4. P1-4 opacity model resolved (done).  5. P1-5 §7 enforcement
contract → real constants in `security.py` (done in doc; must land in code).  6. PR-B's DFS
cycle-detector corrected + landed before PI-4.  7. SG-1/3/5/7/8 confirmed as funded builds.
PI-3/PI-4 stay hard-blocked until their gates exist — this discipline is the plan's strongest feature.

## 11. Next step
Approve / adjust, then `/workflows:plan` (or fold into the Creatrix PR queue). **No implementation
until "go" AND the §10 P1s + PR-zero/B/C are resolved.**
