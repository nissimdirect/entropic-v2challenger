/**
 * B1 — Read-only 1-voice Sampler types (INSTRUMENTS-BUILD-PLAN.md §3 B1).
 *
 * Co-located here (not shared/types.ts) to keep the B1 core isolated from the
 * Creatrix PR-A/PR-B schema work. PR-B may later promote SamplerInstrumentV1
 * into the shared instrument union.
 */
import type { BlendMode, EffectInstance } from '../../../shared/types'

/**
 * B3.1 — Loop region descriptor for SamplerInstrumentV1.
 *
 * All fields optional with safe defaults:
 *   enabled: false  → loop off; sampler behavior is byte-identical to B1/B2.
 *   in / out        → frame indices inside [0, frameCount-1]; validated/clamped
 *                     by the engine. Default: in=0, out=frameCount-1.
 *   dir             → 'fwd' (default) | 'rev' | 'pingpong'.
 *   crossfade       → blend frames near the seam (0 = hard cut). Clamp [0, 32].
 *
 * No PROJECT_VERSION bump required — all fields are additive optionals
 * (UE.7 precedent: missing → undefined → engine uses safe defaults).
 */
export interface SamplerLoopConfig {
  enabled: boolean
  /** Loop-in point (inclusive). Defaults to 0. */
  in?: number
  /** Loop-out point (inclusive). Defaults to frameCount-1. */
  out?: number
  /** Playback direction within the loop. Default: 'fwd'. */
  dir?: 'fwd' | 'rev' | 'pingpong'
  /**
   * Crossfade blend length in frames at the loop seam (0 = hard cut).
   * Clamped to [0, 32].
   */
  crossfade?: number
}

export interface SamplerInstrumentV1 {
  id: string
  type: 'sampler'
  clipId: string // source asset id (resolves to assetPath + frameCount)
  startFrame: number // playhead start, clamped [0, frameCount-1]
  speed: number // 1=native, 0=freeze, <0=reverse; clamp [-8, 8]
  opacity: number // per-voice value, clamp [0,1] — set on the layer dict
  blendMode: BlendMode
  /**
   * B3.1: Optional loop end frame (inclusive). Defaults to frameCount-1.
   * Allows trimming the playback range without enabling the full loop engine.
   * No PROJECT_VERSION bump (UE.7: additive optional).
   */
  endFrame?: number
  /**
   * B3.1: Optional loop configuration. When absent or loop.enabled=false,
   * playback is byte-identical to B1/B2 (regression-safe).
   */
  loop?: SamplerLoopConfig
  /**
   * B3.2: Optional scrub position — a modulation DESTINATION (not persisted in
   * the saved project). When a finite scrub is present (written per-frame by
   * resolveSamplerModulations / resolve_sampler_modulations), the playhead
   * position is DRIVEN by scrub (0..1) across the sampler's playable range,
   * overriding the playhead-derived offset. Absent → undefined → B3.1 behavior
   * unchanged (regression-safe). No PROJECT_VERSION bump (additive optional).
   */
  scrub?: number
  /**
   * B3.3: Optional per-channel RGB frame offset (chromatic time-displacement).
   *
   * Each channel's output pixel is sampled from a footage frame offset by its
   * channel's amount relative to the playhead-derived frame index:
   *   R-channel ← clamp(playheadFrame + r, playableBounds)
   *   G-channel ← clamp(playheadFrame + g, playableBounds)
   *   B-channel ← clamp(playheadFrame + b, playableBounds)
   *
   * {r:0, g:0, b:0} (or absent) → output byte-identical to B3.2 (regression-
   * safe). Interpolation for offset frames: nearest (integer clamped). The
   * playable bounds used for clamping respect loop.in/out when loop is enabled,
   * else [startFrame, endFrame|last]. No PROJECT_VERSION bump (additive optional).
   *
   * MIRROR: export.py ExportManager._compute_voice_rgb_frame_indices
   */
  rgbOffset?: { r: number; g: number; b: number }
  /**
   * B3.3: Optional position/speed glide (portamento) in frames.
   *
   * On a new voice trigger (retrigger), instead of the playhead origin jumping
   * instantaneously to the new value, it LERPs from the previous playhead
   * position to the new target over `glide` frames.
   *
   * glide=0 or absent → instant jump = exactly B3.2 behavior (regression-safe).
   * Clamp [0, 300]. No PROJECT_VERSION bump (additive optional).
   *
   * MIRROR: export.py ExportManager._apply_glide_ramp
   */
  glide?: number
  /**
   * B3.4: Optional melodic (pitch-tracking) configuration.
   *
   * When `enabled`, a voice triggered by MIDI note `n` is transposed relative to
   * `rootNote`:
   *   mode='startFrame' → startFrame += (n - rootNote)   (1 frame per semitone)
   *   mode='speed'      → speed *= 2 ** ((n - rootNote) / 12)  (chromatic rate)
   *
   * `enabled=false` (or `melodic` absent) → NO transposition → playback is
   * byte-identical to B3.3 (regression-safe). A voice whose note == rootNote is
   * never transposed in either mode. No PROJECT_VERSION bump (additive optional).
   *
   * MIRROR: export.py ExportManager._apply_melodic
   */
  melodic?: {
    enabled: boolean
    /** 'startFrame' → semitone→frame offset; 'speed' → chromatic playback rate. */
    mode: 'startFrame' | 'speed'
    /** MIDI note that plays untransposed (the sample's native pitch). Default 60. */
    rootNote: number
  }
  /**
   * P5b.23 — B9 Y-as-time: per-instrument time-axis switch.
   *
   * Controls how the playhead advances through footage for this sampler voice:
   *   't' (default) — unchanged legacy behavior: time advances the playhead.
   *   'y' — slit-scan: output row r samples footage frame f(r) where r is
   *          normalized across the clip's playable range (scanline-as-time).
   *   'x' — column-symmetric: output col c samples footage frame f(c).
   *
   * Additive optional — absent → 't' → byte-identical to pre-B9 behavior.
   * Lowercase only (P1-A axis canon: 'Y'/'X' rejected by the backend validator).
   * No PROJECT_VERSION bump (UE.7: additive optional).
   *
   * ROADMAP G4 scope: instrument-scoped only (footage indexing by row/col).
   * Per-pixel param-field general case (C2/C3) deferred by #158.
   *
   * MIRROR: backend security.validate_frame_bank / engine.frame_bank._resolve_slit_scan
   */
  timeAxis?: 't' | 'y' | 'x'
}

/**
 * The composite-layer dict the sampler appends to the render_composite `layers`
 * array (mirrors the shape App.tsx builds for video clips). NOT a Composite
 * effect — opacity rides on the layer.
 *
 * P5a.3: `voice_id` added for per-voice state keying on the backend (P5a.2).
 * Constraint: must match backend VOICE_ID_PATTERN `^[A-Za-z0-9_-]{1,128}$`
 * (no colons — the backend prepends "voice:" as namespace prefix). The FSM
 * voiceId (`voice:{instrumentId}:{triggerFrame}:{eventIndex}`) is encoded
 * colon-free as `{instrumentId}_{triggerFrame}_{eventIndex}` in the layer.
 */
export interface SamplerVoiceLayer {
  layer_type: 'video'
  asset_path: string
  frame_index: number
  /**
   * B4-pad-chain: per-pad insert effect chain applied by render_composite
   * (`apply_chain` only `if chain:`). Widened from `never[]` so a rack pad's
   * chain can ride on its voice layer. The per-track sampler render path still
   * emits `chain: []` (no per-voice chain there) and typechecks unchanged
   * (`[]` is assignable to `EffectInstance[]`). Empty → no-op (byte-identical
   * to a pad with no chain).
   */
  chain: EffectInstance[]
  opacity: number
  blend_mode: BlendMode
  /** P5a.3: per-voice state cache key for the backend. No colons (P5a.2 constraint). */
  voice_id?: string
  /**
   * B3.3: Per-channel frame indices for RGB offset (chromatic time-displacement).
   * Present only when inst.rgbOffset is non-zero. When absent, the backend uses
   * frame_index for all channels (byte-identical to B3.2).
   * MIRROR: export.py ExportManager._compute_voice_rgb_frame_indices
   */
  rgb_frame_indices?: { r: number; g: number; b: number }
  /**
   * P5b.23 — B9: per-voice time-axis (forwarded from inst.timeAxis).
   * Present only when timeAxis is 'y' or 'x' (absent = 't' = legacy, byte-identical).
   * Lowercase only (P1-A axis canon); the backend validator enforces this.
   * MIRROR: backend zmq_server.py sampler arm / security.validate_voice_layers
   */
  time_axis?: 't' | 'y' | 'x'
}

/**
 * B5.1 — a GROUP layer descriptor (composite-tree node). Emitted by
 * buildRackLayers/flattenRackTree for a pad that holds a `branch`. The backend
 * compositor expands a group by recursively `render_composite`-ing its
 * `children` into a sub-frame, applying the group's `chain` to that sub-frame,
 * then compositing the result upward with the group's `composite` (opacity/blend).
 *
 * `children` is an ordered bottom-to-top list of EITHER SamplerVoiceLayer (a leaf
 * child's voice layers) OR nested RackGroupLayer (a deeper branch) — recursive.
 *
 * `group_id` is a PATH-FROM-ROOT id (e.g. `b0` / `b0_b2`) used as the sub-frame's
 * state key so two sibling branches' stateful chains do NOT alias. Colon-free,
 * `[A-Za-z0-9_-]`. Every descendant leaf voice_id is ALSO path-prefixed with the
 * branch path so nested stateful effects key independently per branch.
 */
export interface RackGroupLayer {
  layer_type: 'group'
  /** Path-from-root group identity (state key for the sub-frame). */
  group_id: string
  /** Bottom-to-top children: leaf voice layers and/or nested groups. */
  children: (SamplerVoiceLayer | RackGroupLayer)[]
  /** Branch chain — runs on the COMPOSITED children sub-frame (not per-child). */
  chain: EffectInstance[]
  /** Branch composite opacity (multiplies onto the emitted group layer). */
  opacity: number
  /** Branch composite blend (how the group layer blends into its parent). */
  blend_mode: BlendMode
}

/** Hard speed bounds (reverse..forward), per B1 plan. */
export const SAMPLER_SPEED_MIN = -8
export const SAMPLER_SPEED_MAX = 8

/**
 * B6.1 — Frame-Bank (wavetable) instrument (INSTRUMENTS-BUILD-PLAN.md §B6).
 *
 * The video analog of a wavetable oscillator: an indexed BANK of frames that a
 * modulatable POSITION (0..1) scans + interpolates through. An LFO over
 * `position` = a "wavetable sweep" through footage.
 *
 * This slice ships the MODEL + the BACKEND render (export path) + the byte-budget
 * decoded-frame LRU (the OOM guard) + caps. The UI, per-frame `position`
 * modulation (SG-8), and `interp:'flow'` (needs B7 optical flow) are LATER slices.
 * `interp:'flow'` is ACCEPTED by the schema but the backend renders it as `blend`
 * (a documented TODO) — it never errors.
 *
 * Additive optional — NO PROJECT_VERSION bump (UE.7 precedent: a project with no
 * frameBank renders byte-identical to today; the export payload omits `frameBanks`
 * when empty).
 */
export interface SlotRef {
  /** Source asset id (resolves to assetPath via the project assets table). */
  clipId: string
  /** Frame index within that clip (>= 0; clamped to the clip's range by the engine). */
  frameIndex: number
}

export interface FrameBankInstrument {
  id: string
  type: 'frameBank'
  /** The indexed bank of frames the position scans through (ordered). */
  slots: SlotRef[]
  /** Scan position, 0..1 — a modulation DESTINATION. Clamped [0,1] + finite-guarded. */
  position: number
  /**
   * Frame selection / interpolation:
   *   nearest → round(idx) → that slot's frame.
   *   blend   → linear interpolate slot[lo] and slot[lo+1] by frac (per-pixel uint8).
   *   flow    → DEFERRED (needs B7); backend renders it as `blend` (documented TODO).
   */
  interp: 'nearest' | 'blend' | 'flow'
  /**
   * Resident DECODED-frame ceiling in BYTES (the OOM guard). A REQUEST — the
   * backend renderer is the AUTHORITY and CLAMPS this to
   * [FRAMEBANK_BYTE_BUDGET_MIN, MAX] then honors it via LRU eviction +
   * downscale-proxy. 256 slots × 4K RGBA ≈ 8.5 GB if all decoded at once, so this
   * bound is the freeze guard, NOT the slot count.
   */
  byteBudget: number
  /**
   * P5b.23 — B9 Y-as-time: per-instrument time-axis switch (IMPLEMENTED).
   *
   *   't' (default) — position scans the bank as-is (unchanged legacy behavior).
   *   'y' — slit-scan: output row r samples the bank at position r/(H-1).
   *          Row 0 → frame at position 0, row H-1 → frame at position 1.
   *   'x' — column-symmetric: output col c samples the bank at position c/(W-1).
   *
   * Additive optional — absent → 't' → byte-identical to pre-B9 behavior.
   * Lowercase only (P1-A axis canon); the backend validator rejects 'Y'/'X'.
   * No PROJECT_VERSION bump (UE.7: additive optional).
   *
   * MIRROR: backend security.validate_frame_bank / engine.frame_bank._resolve_slit_scan
   */
  timeAxis?: 't' | 'y' | 'x'
  /** Per-voice opacity, clamp [0,1] — rides on the emitted layer (mirrors sampler). */
  opacity?: number
  /** Layer blend mode (how the bank's frame composites). Default 'normal'. */
  blendMode?: BlendMode
}

/**
 * B6.1 — Frame-Bank caps. MIRROR of backend security.py (MAX_FRAMEBANK_SLOTS /
 * FRAMEBANK_BYTE_BUDGET_{MIN,MAX}). The backend is the enforcing trust boundary
 * (validate_frame_bank clamps position + byteBudget and rejects over-cap slots);
 * the frontend mirrors these for the editor UI (disable "add slot" past the cap)
 * and the local request guard.
 */
export const MAX_FRAMEBANK_SLOTS = 256
export const FRAMEBANK_BYTE_BUDGET_MIN = 16 * 1024 * 1024 // 16 MB
export const FRAMEBANK_BYTE_BUDGET_MAX = 2 * 1024 * 1024 * 1024 // 2 GB
export const FRAMEBANK_POSITION_MIN = 0
export const FRAMEBANK_POSITION_MAX = 1

/**
 * B4.1 — Sample Rack data model (INSTRUMENTS-BUILD-PLAN.md §B4).
 *
 * A rack hosts N pads; each pad is a CHANNEL holding one Sampler leaf. All pad
 * channels are SUMMED to ONE rack output (composited via the existing backend
 * compositor — opacity/blend per pad). This slice (B4.1) builds ONLY the data
 * model + per-pad channel summing (opacity / blend / mute / solo). Sends,
 * macros, choke-groups and the editor UI are LATER B4 slices.
 *
 * The full §B4 leaf is `{ instrument, chain: EffectInstance[], sends: Send[] }`.
 * B4.1 ships `instrument` + a typed-but-unused `chain`/`sends` placeholder (see
 * RackPad below). Per the plan, those fields are left absent/unused with a TODO;
 * their BEHAVIOR is NOT built here.
 *
 * Additive optional — NO PROJECT_VERSION bump (UE.7 precedent: missing →
 * undefined → engine uses safe defaults; a project with no rack renders
 * byte-identical to today).
 */
export interface RackPad {
  /** Stable pad identity (cross-store key; survives reorder). */
  id: string
  /** The pad's sample leaf. clipId '' = unsourced (renders nothing). */
  instrument: SamplerInstrumentV1
  /** Per-pad channel opacity, clamped [0,1]. Multiplies onto the voice opacity. */
  opacity: number
  /** Per-pad channel blend mode (how this channel composites onto the sum). */
  blend: BlendMode
  /** Muted pad contributes NOTHING to the rack output. */
  mute: boolean
  /** If ANY pad in the rack is soloed, only soloed pads render. */
  solo: boolean
  /**
   * B4-choke — choke-group membership. When a pad in group G triggers, every
   * OTHER pad in group G has its currently-sounding voices SILENCED at the trigger
   * frame (classic drum-machine hi-hat: closed hat cuts open hat). `null`/absent →
   * the pad belongs to no group and neither chokes nor is choked.
   *
   * Additive optional: a rack saved before B4-choke has no `chokeGroup` field →
   * undefined → no choke (renders byte-identical). Valid groups are small ints
   * 1..8 (validated by setRackPadChokeGroup); null clears membership.
   */
  chokeGroup?: number | null
  /**
   * B4-pad-chain (ENGINE slice) — per-pad insert effect chain. The pad's voice
   * layers carry this chain to `render_composite`, which applies it via
   * `apply_chain` (preview) and the SAME compositor in export (parity). The
   * DeviceChain UI that POPULATES this chain is a LATER slice; this slice only
   * makes a populated chain RENDER + EXPORT identically.
   *
   * Additive optional: a rack saved before B4-pad-chain has no `chain` field →
   * undefined → buildRackLayers emits `chain: []` and export serializes `[]` →
   * no chain reaches render_composite → byte-identical render. NO
   * PROJECT_VERSION bump (UE.7 precedent).
   */
  chain?: EffectInstance[]
  /**
   * B5.1 — Sample Rack grouping (composite-tree). A pad may hold a BRANCH (a
   * nested RackNode) INSTEAD of a leaf instrument: "one note fires an ensemble."
   * When `branch` is present the pad is a GROUP — its `instrument` leaf is IGNORED
   * for rendering and the branch's children are composited into a sub-frame, the
   * branch's chain + composite folded in, and ONE layer emitted upward.
   *
   * MUTUALLY EXCLUSIVE with leaf rendering: a pad with a `branch` renders the
   * branch; a pad without renders its `instrument` leaf EXACTLY as today.
   *
   * Additive optional: a rack saved before B5 has no `branch` field → undefined →
   * every pad is a flat leaf → buildRackLayers emits the SAME flat voice layers
   * with the SAME voice_ids as today (flat byte-identical). NO PROJECT_VERSION
   * bump (UE.7 precedent). The nested-rack EDITING UI is a LATER slice; this slice
   * builds the model + recursive render + export parity + caps + path-keys.
   */
  branch?: RackNode
  // ---- LATER B4 slices (typed-but-unused; do NOT build behavior here) ----
  // TODO(B4.3+): per-pad sends to return busses.   sends?: Send[]
}

/**
 * B4.2 — a single macro route: ONE macro destination.
 *
 * `targetPath` addresses a param on one of the rack's pads, in the form
 * `pad.<padId>.<param>` where <param> is a macro-able instrument param
 * (`scrub` | `speed` | `opacity`). `depth` scales the macro value into the
 * target (`resolved = macro.value * depth`). A route whose path is unknown /
 * malformed is SKIPPED by the resolver, never throws (trust boundary).
 */
export interface MacroRoute {
  targetPath: string
  /** Scales the macro value into the target param. May be negative (invert). */
  depth: number
}

/**
 * B4.2 — a Sample Rack macro: ONE control (0..1) → MANY param destinations.
 *
 * A rack hosts up to MAX_MACROS_PER_RACK (8) macros. Each macro's `value` is
 * fanned out across its `routes` (one-to-many): for each route the resolved
 * value `value * route.depth` is written into the route's target pad param
 * BEFORE render (see resolveRackMacros — mirrors backend resolve_rack_macros).
 * A macro at 0, or with no routes, has NO effect (regression-safe).
 *
 * The FAN-OUT CAPS (per-macro routes, total edges across the rack) are the
 * trust boundary and are enforced in the backend `security.validate_rack_macros`
 * on the IPC/render + load boundary. MAX_* mirrored below for the editor UI.
 */
export interface RackMacro {
  /** Stable macro identity. */
  id: string
  /** User-facing macro name (e.g. "Chaos", "Decay"). */
  name: string
  /** The macro's control value, clamped [0, 1]. */
  value: number
  /** The macro's destinations — one-to-many fan-out. */
  routes: MacroRoute[]
}

export interface RackNode {
  /** Stable rack identity. */
  id: string
  type: 'rack'
  /** The pad channels, in display order. Each is summed to the rack output. */
  pads: RackPad[]
  /**
   * B4.2: up to 8 macros, each fanning one value across many pad params.
   * Additive optional — absent → undefined → no macro modulation (a rack saved
   * before B4.2 renders byte-identical). NO PROJECT_VERSION bump.
   */
  macros?: RackMacro[]
  /**
   * B5.1 — branch-level insert chain. When this RackNode is used as a pad's
   * `branch`, this chain runs on the COMPOSITED children sub-frame (NOT per-child)
   * before the branch emits its single layer upward. Folded in by the backend
   * sub-frame composite (compositor.py group expansion) so it matches preview ==
   * export. Absent/empty → no chain on the branch (children composite straight up).
   * Ignored for a top-level (per-track) rack — only meaningful on a branch.
   */
  chain?: EffectInstance[]
  /**
   * B5.1 — branch-level composite (how the branch's composited sub-frame blends
   * upward into its PARENT). opacity multiplies onto the branch's emitted layer;
   * blend is the branch layer's blend mode. Absent → {opacity:1, blend:'normal'}
   * (the branch composites straight up). Ignored for a top-level rack.
   */
  composite?: { opacity: number; blend: BlendMode }
}

/** Per-pad opacity bounds (mirrors sampler opacity clamp). */
export const RACK_PAD_OPACITY_MIN = 0
export const RACK_PAD_OPACITY_MAX = 1

/**
 * B4-choke — valid choke-group range. A pad's chokeGroup is null (no group) or a
 * small int in [1, 8]. Mirrored by setRackPadChokeGroup (store-write trust
 * boundary) and the RackDevice choke <select>.
 */
export const RACK_CHOKE_GROUP_MIN = 1
export const RACK_CHOKE_GROUP_MAX = 8

/**
 * B4.2 — Sample Rack macro fan-out caps. MIRROR of backend security.py
 * (MAX_MACROS_PER_RACK / MAX_MODROUTES_PER_MACRO / MAX_TOTAL_EDGES). The backend
 * is the enforcing trust boundary; the frontend mirrors these for the editor UI
 * (disable "add route" past the cap) and the local resolveRackMacros guard.
 */
export const MAX_MACROS_PER_RACK = 8
export const MAX_MODROUTES_PER_MACRO = 32
export const MAX_TOTAL_EDGES = 256

/**
 * B5.1 — Sample Rack grouping (composite-tree) caps. MIRROR of backend
 * security.py (MAX_BRANCH_DEPTH / MAX_TOTAL_VOICES_PER_RENDER). These are the
 * recursion trust boundary: a hostile/deep tree must be REJECTED or TRUNCATED,
 * never OOM or infinite-recurse. The frontend traversal (flattenRackTree) counts
 * depth + total voices and stops; the backend re-enforces on the IPC/render +
 * load boundary (fail-closed, mirroring MAX_OPERATORS / MAX_TOTAL_EDGES).
 *
 * MAX_BRANCH_DEPTH: how many levels of nested branches a tree may have. The
 * TOP-LEVEL rack is depth 0; a branch one level down is depth 1; the cap bounds
 * the deepest branch (a leaf pad does not increment depth). Depth 4 ⇒ at most 4
 * levels of nesting under the root.
 *
 * MAX_BRANCH_VOICES_PER_RENDER bounds the SUM of voice layers across the WHOLE
 * tree (all branches + leaves), so a deep fan-out cannot grow the state cache
 * without bound. This is a SEPARATE, tree-wide ceiling — the existing flat
 * per-track polyphony cap (backend MAX_TOTAL_VOICES_PER_RENDER = 4) is UNCHANGED;
 * a flat rack still emits ≤4 voices per pad exactly as today. B5 adds this
 * higher tree-wide ceiling only for the grouped (branch) case (an ensemble).
 */
export const MAX_BRANCH_DEPTH = 4
export const MAX_BRANCH_VOICES_PER_RENDER = 64

/** Pad-instrument params a macro route may drive → [min, max] clamp bounds. */
export const RACK_MACRO_PARAM_BOUNDS: Record<string, [number, number]> = {
  scrub: [0, 1],
  speed: [-8, 8],
  opacity: [0, 1],
}

// ---------------------------------------------------------------------------
// B8 — Granulator instrument (P5b.19 UI)
// ---------------------------------------------------------------------------

/**
 * B8 — Six axes for the Granulator: T, Y, X, C, F, L (LOWERCASE per P1-A canon).
 * The backend security boundary enforces lowercase; the UI must NEVER send uppercase.
 */
export type GranulatorAxis = 't' | 'y' | 'x' | 'c' | 'f' | 'l'

/**
 * B8 — Per-axis parameter block.
 *
 * `grain`    — base position along the axis, clamped [0, 1].
 * `jitter`   — maximum random displacement (uniform ± half-width), clamped [0, 1].
 * `position` — alias for grain (spec parity with the backend AxisParams).
 * `envelope` — per-axis envelope scale applied to each grain, clamped [0, 1].
 */
export interface GranulatorAxisParams {
  grain: number      // [0, 1]
  jitter: number     // [0, 1]
  position: number   // [0, 1]
  envelope: number   // [0, 1] — maps to backend `grain_env`
}

/**
 * B8 — Grain selection rule.
 *
 * `random`           — IMPLEMENTED. Seeded per-grain draw.
 * `onset`            — IMPLEMENTED. Biases toward audio-transient frames.
 * `latentSimilarity` — RESEARCH, flag-gated (EXPERIMENTAL_LATENT_SELECTION env).
 *                      The UI HIDES this when the flag is off (selector guard).
 * `scenePayload`     — RESERVED. No scene-detection source. NEVER shown in the UI.
 *
 * The UI picker shows only `random` and `onset` when the flag is off.
 * The UI picker adds `latentSimilarity` only when `latentSelectionEnabled` is true.
 * `scenePayload` is NEVER authored by the UI (reserved at the backend boundary).
 */
export type GranulatorSelectionRule = 'random' | 'onset' | 'latentSimilarity'

/**
 * B8 — Granulator instrument data model (P5b.19).
 *
 * Tracks a per-track B8 Granulator instrument. Serialized into a
 * `performance.granulator` payload by buildGranulatorLayer (mirrors how
 * buildSamplerLayer serializes a SamplerInstrumentV1). The backend
 * `_parse_granulator_layer` is the enforcing trust boundary.
 *
 * Axes are LOWERCASE (P1-A axis canon): t/y/x/c/f/l.
 * All numerics clamped at the store-write boundary; backend re-enforces.
 *
 * Additive optional — absent `granulators` map → no granulator render →
 * byte-identical to pre-B8 (regression-safe). No PROJECT_VERSION bump.
 */
export interface GranulatorInstrument {
  id: string
  type: 'granulator'
  /** Number of grains per frame; clamped [0, MAX_GRANULATOR_DENSITY]. */
  density: number
  /**
   * Grain window shape: 'hann' | 'tri' | 'rect'.
   * MIRROR: backend instruments/granulator_instrument.py VALID_WINDOWS.
   */
  window: 'hann' | 'tri' | 'rect'
  /**
   * Per-axis grain parameters, keyed by lowercase axis letter (t/y/x/c/f/l).
   * All axes are always present (defaulted at creation); backends fill missing
   * axes with safe defaults too.
   */
  axes: Record<GranulatorAxis, GranulatorAxisParams>
  /**
   * SG-3 gate flag — L-axis is inert unless this is true (P5b.18).
   * When false the L-axis row is shown in the UI but labelled as gated.
   */
  lAxisEnabled: boolean
  /**
   * Grain selection rule. See GranulatorSelectionRule.
   * The store allows writing `latentSimilarity` only when the flag is on.
   * The UI picker HIDES `latentSimilarity` when the flag is off.
   */
  selection: GranulatorSelectionRule
  /**
   * Backend render path (optional, additive — absent means 'cpu').
   *
   * 'cpu'  — default full-quality render (always reachable).
   * 'gpu'  — preview-only fast path; the backend zmq_server `_parse_granulator_layer`
   *           reads `render_path` from the IPC dict and routes to the GPU preview arm.
   *           Reachable by setting renderPath: 'gpu' on this instrument in the store
   *           (e.g. via useInstrumentsStore.getState().updateGranulatorRenderPath(trackId, 'gpu'))
   *           and then building the layer dict with buildGranulatorLayer — the serializer
   *           passes the value through as `render_path` in the IPC sub-dict.
   *
   * MIRROR: backend granulator_instrument.py / zmq_server.py `render_path` field.
   */
  renderPath?: 'cpu' | 'gpu'
  /**
   * Per-axis ADSR envelope mini-editors (optional, additive).
   * Absent → no per-axis envelope override (backend AxisParams.grain_env governs).
   * Stored alongside the instrument for UI state persistence; the `envelope`
   * field in each GranulatorAxisParams already propagates to the backend.
   */
  // (envelope config is encoded in axes[ax].envelope — no separate field needed)
}

/**
 * B8 — Maximum grain density (UI cap, mirrors backend MAX_GRAINS security cap).
 *
 * MIRROR: backend security.py MAX_GRAINS.
 * The backend rejects density > MAX_GRAINS loudly (non-silently). The UI must
 * never let the user input a value higher than this.
 */
export const MAX_GRANULATOR_DENSITY = 64

/** B8 — Grain density bounds (store-write trust boundary). */
export const GRANULATOR_DENSITY_MIN = 0
export const GRANULATOR_DENSITY_MAX = MAX_GRANULATOR_DENSITY

/** B8 — Grain-cloud visualization cap (≤ this many markers rendered in SVG/canvas). */
export const GRANULATOR_VIZ_MARKER_CAP = 64

/** B8 — Default per-axis params (safe, regression-neutral). */
export const DEFAULT_AXIS_PARAMS: GranulatorAxisParams = {
  grain: 0.5,
  jitter: 0.0,
  position: 0.5,
  envelope: 1.0,
}

/** B8 — The six lowercase axes in canonical order (T Y X C F L). */
export const GRANULATOR_AXES: GranulatorAxis[] = ['t', 'y', 'x', 'c', 'f', 'l']

/** B8 — Create a default per-axis params object (safe, all fields present). */
export function defaultAxisParams(): GranulatorAxisParams {
  return { ...DEFAULT_AXIS_PARAMS }
}

/** B8 — Create a default GranulatorInstrument. */
export function defaultGranulatorInstrument(id: string): GranulatorInstrument {
  const axes = {} as Record<GranulatorAxis, GranulatorAxisParams>
  for (const ax of GRANULATOR_AXES) axes[ax] = defaultAxisParams()
  return {
    id,
    type: 'granulator',
    density: 4,
    window: 'hann',
    axes,
    lAxisEnabled: false,
    selection: 'random',
  }
}
