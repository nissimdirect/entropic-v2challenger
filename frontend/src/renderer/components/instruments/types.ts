/**
 * B1 — Read-only 1-voice Sampler types (INSTRUMENTS-BUILD-PLAN.md §3 B1).
 *
 * Co-located here (not shared/types.ts) to keep the B1 core isolated from the
 * Creatrix PR-A/PR-B schema work. PR-B may later promote SamplerInstrumentV1
 * into the shared instrument union.
 */
import type { BlendMode } from '../../../shared/types'

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
  chain: never[]
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
}

/** Hard speed bounds (reverse..forward), per B1 plan. */
export const SAMPLER_SPEED_MIN = -8
export const SAMPLER_SPEED_MAX = 8

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
  // ---- LATER B4 slices (typed-but-unused; do NOT build behavior here) ----
  // TODO(B4.2+): per-pad effect chain.   chain?: EffectInstance[]
  // TODO(B4.3+): per-pad sends to return busses.   sends?: Send[]
  // TODO(B4.4+): choke-group membership.   chokeGroup?: number | null
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
}

/** Per-pad opacity bounds (mirrors sampler opacity clamp). */
export const RACK_PAD_OPACITY_MIN = 0
export const RACK_PAD_OPACITY_MAX = 1

/**
 * B4.2 — Sample Rack macro fan-out caps. MIRROR of backend security.py
 * (MAX_MACROS_PER_RACK / MAX_MODROUTES_PER_MACRO / MAX_TOTAL_EDGES). The backend
 * is the enforcing trust boundary; the frontend mirrors these for the editor UI
 * (disable "add route" past the cap) and the local resolveRackMacros guard.
 */
export const MAX_MACROS_PER_RACK = 8
export const MAX_MODROUTES_PER_MACRO = 32
export const MAX_TOTAL_EDGES = 256

/** Pad-instrument params a macro route may drive → [min, max] clamp bounds. */
export const RACK_MACRO_PARAM_BOUNDS: Record<string, [number, number]> = {
  scrub: [0, 1],
  speed: [-8, 8],
  opacity: [0, 1],
}
