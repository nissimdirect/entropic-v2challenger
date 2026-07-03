/**
 * Entropic v2 — Core data types.
 * Matches DATA-SCHEMAS.md. Python must serialize/deserialize these exact shapes.
 */
import type { Axis, BindingRule, LaneAxisBinding } from './axis-binding'
import type { FieldRefValue } from './field-param'
import type { CCBankBinding, BankAssignment, SlotTarget, CCSlotMapping } from './bankTypes'

// --- Param values ---

/**
 * P6.6 — a single effect-parameter value. Scalars (the legacy shape) OR a
 * FieldRef wrapper ({__field__: {...}}) when the param is image/video-driven.
 * Only params present in the effect's `fieldParams` allow-list may carry a
 * FieldRef; scalar params are completely unaffected (additive / backward-compat).
 */
export type ParamValue = number | string | boolean | FieldRefValue

// --- Project ---

export interface Project {
  version: string;
  id: string;
  created: number;
  modified: number;
  author: string;
  settings: ProjectSettings;
  assets: Record<string, Asset>;
  timeline: Timeline;
  drumRack?: DrumRack;
  operators?: Operator[];
  midiMappings?: MIDIPersistData;
}

export interface ProjectSettings {
  resolution: [number, number];
  frameRate: number;
  audioSampleRate: number;
  masterVolume: number;
  seed: number;
  bpm: number;
}

export interface Asset {
  id: string;
  path: string;
  type: "video" | "image" | "audio";
  meta: {
    width: number;
    height: number;
    duration: number;
    fps: number;
    codec: string;
    hasAudio: boolean;
  };
}

// --- Timeline ---

export interface Timeline {
  duration: number;
  tracks: Track[];
  markers: Marker[];
  loopRegion: { in: number; out: number } | null;
  /** Pixels per second on the timeline ruler. Optional for backward compat
   * with .glitch files saved before F-0512-25. */
  zoom?: number;
}

/**
 * P6.8 (I1) — a probe binding lives on an inspector track. It pins one
 * post-modulation parameter value so the backend probe registry records its
 * history; the frontend draws the live sparkline. `probeId` matches the backend
 * registry key (`probe_register`/`probe_snapshot`). Bindings are pure data and
 * round-trip through project save/load like any other additive Track field.
 */
export interface ProbeBinding {
  probeId: string;
  /** Probe kind. v1 only emits `'param_postmod'`; the union mirrors the backend
   * `ProbeKind` so a future kind from disk validates instead of being dropped. */
  kind: "param_postmod";
  /** EffectInstance.id (NOT effectId) — instance identity, matches CC/operator refs. */
  effectId: string;
  /** Param key on the effect (e.g. `"radius"`). */
  paramPath: string;
  /** Human label shown on the probe row (e.g. `"Blur · radius"`). */
  label: string;
}

export interface Track {
  id: string;
  // P6.8 (I1): `"inspector"` is a first-class track type carrying probe rows
  // (no clips). Adding it touches save/load — the persistence validator accepts
  // it and unknown future types are dropped (forward-tolerance) rather than
  // rejecting the whole project.
  // M.1 (Master-Out Bus PRD, 2026-07-03): `"master"` is a first-class NO-CLIPS
  // track type (same precedent as "inspector") — exactly ONE per project,
  // bootstrap-created on New Project and migration-injected on load when
  // absent (never rejected). Carries effects + automation only (never clips,
  // never instruments — the instrument/composite REJECT guard is UI, M.2).
  // Its effectChain runs on the FINAL COMPOSITED frame post-render (see
  // engine/compositor.py::render_composite's `master_chain` param).
  type: "video" | "performance" | "text" | "audio" | "inspector" | "master";
  name: string;
  color: string;
  isMuted: boolean;
  isSoloed: boolean;
  /**
   * T3: track lock. Optional, additive — absent/false = editable. When true, ALL
   * of this track's clips are guarded against move/trim/split/delete, the track
   * itself rejects reorder + drops onto it, and ripple ops that would shift it are
   * skipped. Serialized and re-applied on load (see project-persistence hydrate).
   */
  locked?: boolean;
  // P2.2a (slice 3c, Decision D1 clean break): `opacity` and `blendMode` were
  // removed from Track. Compositing now lives in a TERMINAL `CompositeEffect`
  // at the end of `effectChain` (see CompositeEffect / getTerminalComposite below).
  // A track with no terminal composite renders fully opaque, blend mode 'normal'
  // (COMPOSITE_DEFAULTS). v2 projects that carried these track-level fields are
  // rejected at load by the backend schema validator ("Unsupported project format").
  clips: Clip[];
  effectChain: EffectInstance[];
  automationLanes: AutomationLane[];
  // Audio track only (undefined for video/performance/text)
  gainDb?: number;
  audioClips?: AudioClip[];
  // Inspector track only (P6.8 / I1) — undefined for all other track types.
  probeBindings?: ProbeBinding[];
}

/**
 * Audio clip on an audio track.
 *
 * Numeric invariants (enforced by timeline store + backend validator):
 * - inSec >= 0, outSec > inSec + MIN_CLIP_SEC
 * - startSec >= 0
 * - gainDb clamped [-60, +6], finite
 * - fadeInSec in [0, outSec - inSec], finite
 * - fadeOutSec in [0, outSec - inSec - fadeInSec], finite
 */
export interface AudioClip {
  id: string;
  trackId: string;
  path: string;           // absolute, post validate_upload + realpath + magic-byte
  inSec: number;          // read offset into source file
  outSec: number;         // end offset into source file
  startSec: number;       // timeline position
  gainDb: number;         // [-60, +6]
  fadeInSec: number;      // linear ramp into clip
  fadeOutSec: number;     // linear ramp out
  muted: boolean;         // per-clip mute
  missing?: boolean;      // true when clip.path is no longer resolvable
}

/** Audio track invariants — backend mirrors these. */
export const AUDIO_LIMITS = {
  MIN_CLIP_SEC: 0.01,
  MAX_CLIP_DURATION_SEC: 3600,
  MAX_CLIPS_PER_TRACK: 500,
  MAX_AUDIO_TRACKS: 32,
  MAX_ACTIVE_CLIPS: 16,
  MIN_GAIN_DB: -60,
  MAX_GAIN_DB: 6,
  MAX_BATCH_DROP: 8,
} as const;

/** Clamp gain to the audio track range with NaN/Infinity rejection. */
export function clampGainDb(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(AUDIO_LIMITS.MIN_GAIN_DB, Math.min(AUDIO_LIMITS.MAX_GAIN_DB, n));
}

/** Non-negative finite seconds, NaN/Infinity rejected to 0. */
export function clampNonNegSec(value: unknown, max: number = AUDIO_LIMITS.MAX_CLIP_DURATION_SEC): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(max, n);
}

export type BlendMode =
  | "normal"
  | "add"
  | "multiply"
  | "screen"
  | "overlay"
  | "difference"
  | "exclusion"
  | "darken"
  | "lighten";

export interface ClipTransform {
  x: number;          // horizontal offset (px, relative to canvas center)
  y: number;          // vertical offset (px)
  scaleX: number;     // horizontal scale (1.0 = 100%)
  scaleY: number;     // vertical scale (1.0 = 100%)
  rotation: number;   // degrees
  anchorX: number;    // anchor X offset from clip center (px, 0 = center)
  anchorY: number;    // anchor Y offset from clip center (px, 0 = center)
  flipH: boolean;     // horizontal mirror
  flipV: boolean;     // vertical mirror
}

/** Normalize a partial/legacy transform to the full interface. */
export function normalizeTransform(t?: Partial<ClipTransform> & { scale?: number }): ClipTransform {
  return {
    x: t?.x ?? 0,
    y: t?.y ?? 0,
    scaleX: t?.scaleX ?? (t as any)?.scale ?? 1,
    scaleY: t?.scaleY ?? (t as any)?.scale ?? 1,
    rotation: t?.rotation ?? 0,
    anchorX: t?.anchorX ?? 0,
    anchorY: t?.anchorY ?? 0,
    flipH: t?.flipH ?? false,
    flipV: t?.flipV ?? false,
  }
}

/** Identity transform — no changes applied. */
export const IDENTITY_TRANSFORM: ClipTransform = {
  x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0,
  anchorX: 0, anchorY: 0, flipH: false, flipV: false,
}

// --- Masking (MK.1) ---

/**
 * Known matte node kinds (SPEC §3.2).
 * Static kinds resolve once and cache; procedural kinds re-evaluate per frame.
 */
export type MatteNodeKind =
  | 'rect'
  | 'ellipse'
  | 'polygon'
  | 'bitmap'
  | 'chroma_key'
  | 'luma_key'
  | 'color_range'
  | 'ai_matte';

export type MatteOp = 'add' | 'subtract' | 'intersect';

/**
 * One node in a clip's per-clip mask stack (SPEC §3.2).
 *
 * Additive optional field on Clip (maskStack?) — no PROJECT_VERSION bump,
 * UE.7 precedent. Absent = no mask applied (byte-identical legacy behavior).
 *
 * Numeric trust boundary: feather ∈ [0, 100], growShrink ∈ [−50, 50].
 * Load-time validator in project-persistence.ts drops malformed nodes and
 * clamps out-of-range numerics (P6.6 pattern).
 */
export interface MatteNode {
  /** Unique node identity. Must match ^[A-Za-z0-9_-]{1,64}$. */
  id: string;
  kind: MatteNodeKind;
  /**
   * Kind-specific parameters.
   * - rect:    { x, y, w, h } — numbers
   * - ellipse: { cx, cy, rx, ry } — numbers
   * - polygon: { vertices: [x0,y0, x1,y1, ...] } — flat number[] or [[x,y],...] list
   *   (MK.5: vertices stored as number[] flat array; backend _rasterize_polygon
   *    receives the list as-is through JSON serialization)
   */
  params: Record<string, number | string | number[] | number[][]>;
  op: MatteOp;
  invert: boolean;
  /** Gaussian feather radius in px. Clamped [0, 100] at the persistence boundary. */
  feather: number;
  /** Morphological grow (+) / shrink (−) in px. Clamped [−50, 50] at the persistence boundary. */
  growShrink: number;
  enabled: boolean;
}

export interface Clip {
  id: string;
  assetId: string;
  trackId: string;
  position: number;
  duration: number;
  inPoint: number;
  outPoint: number;
  speed: number;
  textConfig?: TextClipConfig;
  transform?: ClipTransform;
  opacity?: number;      // 0.0–1.0, default 1.0 (undefined = fully opaque)
  isEnabled?: boolean;   // default true (undefined = enabled)
  reversed?: boolean;    // default false
  /**
   * T3: per-clip lock. Optional, additive — absent/false = editable. A locked
   * clip (or any clip on a locked track) cannot be moved, trimmed, split, or
   * deleted; guarded actions become no-ops (no undo entry). Serialized + restored
   * at the persistence trust boundary (only `true` survives, else dropped).
   */
  locked?: boolean;
  missing?: boolean;     // true when the referenced asset path is no longer resolvable (UE.5)
  name?: string;         // UE.7: optional user-set label (≤ LIMITS.MAX_CLIP_NAME_LENGTH chars)
  color?: string;        // UE.7: optional clip body tint (one of the 8 DESIGN-SPEC §8 swatches)
  /**
   * MK.1: per-clip mask stack. Optional, additive — absent = no masking.
   * Max MAX_MATTE_NODES_PER_CLIP (8) entries; load-time validator enforces cap.
   * No PROJECT_VERSION bump required (UE.7 precedent).
   */
  maskStack?: MatteNode[];
  /**
   * MK.4: stack-consumption mode. Rides MK.3's render payload.
   * - 'deleteInside':  alpha = a·(1−m)  — transparent inside the matte
   * - 'deleteOutside': alpha = a·m       — transparent outside the matte
   * - 'fill':          composite solid fill color through the matte
   * Absent = no consumption (stack nodes route effects only, MK.3 behavior).
   * Not persisted across sessions (ephemeral per edit session — set by delete/fill actions).
   */
  maskMode?: 'deleteInside' | 'deleteOutside' | 'fill';
  /** MK.4: fill color (CSS hex, one of the 8 DESIGN-SPEC §8 swatches) when maskMode='fill'. */
  maskFillColor?: string;
}

// --- Text ---

export type TextAnimation =
  | "none"
  | "fade_in"
  | "fade_out"
  | "scale_up"
  | "slide_left"
  | "slide_up"
  | "typewriter"
  | "bounce";

export interface TextClipConfig {
  text: string;
  fontFamily: string;
  fontSize: number;
  color: string;
  position: [number, number];
  alignment: "left" | "center" | "right";
  opacity: number;
  strokeWidth: number;
  strokeColor: string;
  shadowOffset: [number, number];
  shadowColor: string;
  animation: TextAnimation;
  animationDuration: number;
}

export interface Marker {
  id: string;
  time: number;
  label: string;
  color: string;
}

// --- Effects ---

export interface ABState {
  a: Record<string, number | string | boolean>;
  b: Record<string, number | string | boolean>;
  active: 'a' | 'b';
}

/**
 * MK.3 — handle that routes a device (or chain) THROUGH a matte node from the
 * clip's `maskStack`. The backend resolves `nodeId` against the clip's
 * `mask_stack` payload and injects the resolved matte as the container `_mask`
 * (per-device) — see SPEC §4.2. Optional + additive: absent → effect runs
 * unmasked (byte-identical legacy behavior). `invert` flips the routing at the
 * ref independently of the node's own invert.
 */
export interface MatteRef {
  /** Id of a MatteNode in the clip's maskStack. ^[A-Za-z0-9_-]{1,64}$. */
  nodeId: string;
  /** Flip the matte (1−m) at the ref before routing. */
  invert: boolean;
}

export interface EffectInstance {
  id: string;
  effectId: string;
  isEnabled: boolean;
  isFrozen: boolean;
  /**
   * P6.6: a param value is a scalar OR a FieldRef wrapper. The FieldRef shape is
   * only produced for params in the effect's `fieldParams` allow-list; all other
   * params remain scalar (legacy byte-identical).
   */
  parameters: Record<string, ParamValue>;
  modulations: Record<string, ModulationRoute[]>;
  mix: number;
  mask: MaskConfig | null;
  /**
   * MK.3 per-device mask routing. Optional, additive — absent = unmasked.
   * Points at a node in the owning clip's `maskStack`. Rich assignment UI is
   * MK.13's job; MK.3 ships a minimal "mask" row on DeviceCard.
   */
  maskRef?: MatteRef | null;
  abState?: ABState | null;
}

export interface ModulationRoute {
  sourceId: string;
  depth: number;
  min: number;
  max: number;
  curve: "linear" | "exponential" | "logarithmic" | "s-curve";
  effectId?: string;   // target effect instance id (for pad mappings)
  paramKey?: string;   // target param key (for pad mappings)
}

/**
 * P2.1 — Modulation sink discriminant.
 * Identifies the target category for a modulation route.
 *
 * - 'effectParam'   : effect instance parameter (existing, default when absent)
 * - 'projectParam'  : project-level parameter such as 'bpm'; writes to effectiveBpm,
 *                     never to the persisted bpm field.
 *
 * Absent / undefined means 'effectParam' (backward-compat with existing routes).
 */
export type ModulationSinkKind = 'effectParam' | 'projectParam';

/**
 * Well-known projectParam keys for modulation targets.
 * Only 'bpm' exists at P2.1; future project params extend this union.
 */
export type ProjectParamKey = 'bpm';

export interface MaskConfig {
  type: "generated" | "asset";
  generatorId?: string;
  assetId?: string;
  invert: boolean;
  feather: number;
}

// --- Automation ---

export type TriggerMode = 'toggle' | 'gate' | 'one-shot';

/**
 * PR-B Commit-1: unified lane interpolation/behavior mode. Collapses the old
 * (isTrigger + triggerMode) pair into one field.
 *  - smooth  : continuous interpolation (the old non-trigger lane)
 *  - step    : hold each point's value until the next (no interpolation)
 *  - gate    : trigger lane, held while "on" (old isTrigger + triggerMode 'gate')
 *  - oneShot : trigger lane, fires its ADSR once (old triggerMode 'one-shot')
 * gate/oneShot are the trigger modes — see isTriggerLane().
 */
export type InterpolationMode = 'smooth' | 'step' | 'gate' | 'oneShot';

export interface AutomationLane {
  id: string;
  paramPath: string;
  color: string;
  isVisible: boolean;
  points: AutomationPoint[];
  mode: InterpolationMode;
  triggerADSR?: ADSREnvelope; // envelope for gate/oneShot modes
  // PR-B Commit-2: optional B4-lite axis binding. Absent = evaluate at time (t).
  // NB: LaneAxisBinding.interpolationMode is a DISTINCT concept from `mode` above —
  // it controls between-keyframe interp ALONG the chosen axis, not lane behavior.
  // Tier-1 only renders broadcast/t; richer domains (y/x/...) land with C2/C3.
  axisBinding?: LaneAxisBinding;
}

export interface AutomationPoint {
  time: number;
  value: number;
  curve: number;
}

// --- IPC ---

export interface IPCRequest {
  cmd: string;
  id: string;
  [key: string]: unknown;
}

export interface IPCResponse {
  id: string;
  ok: boolean;
  error?: string;
  [key: string]: unknown;
}

export interface EffectInfo {
  id: string;
  name: string;
  category: string;
  params: Record<string, ParamDef>;
  /**
   * P6.2/P6.6: sorted list of param names that accept a FieldRef value (the
   * "field-capable" params from the backend FIELD_TOP25 allow-list). The
   * "Field…" assignment control is shown only for params in this list.
   * Optional / may be absent on registries served before P6.2 (treated as []).
   */
  fieldParams?: string[];
}

export type ParamCurve = "linear" | "logarithmic" | "exponential" | "s-curve";

export interface ParamDef {
  type: "float" | "int" | "bool" | "choice";
  min?: number;
  max?: number;
  default: number | string | boolean;
  label: string;
  description?: string;
  options?: string[];
  curve?: ParamCurve;
  unit?: string;
}

// --- Undo ---

export interface UndoEntry {
  forward: () => void;
  inverse: () => void;
  description: string;
  timestamp: number;
}

// --- Performance ---

export type PadMode = 'gate' | 'toggle' | 'one-shot';

export type ADSRPhase = 'idle' | 'attack' | 'decay' | 'sustain' | 'release';

export interface ADSREnvelope {
  attack: number;  // frames, >= 0
  decay: number;   // frames, >= 0
  sustain: number; // level, 0-1
  release: number; // frames, >= 0
}

export interface Pad {
  id: string;
  label: string;
  keyBinding: string | null; // KeyboardEvent.code
  midiNote: number | null;   // MIDI note number (0-127)
  mode: PadMode;
  chokeGroup: number | null;
  envelope: ADSREnvelope;
  modRoutes: ModulationRoute[];
  color: string;
}

export interface DrumRack {
  grid: '4x4';
  pads: Pad[];
}

export interface PadRuntimeState {
  phase: ADSRPhase;
  triggerFrame: number;
  releaseFrame: number;
  currentValue: number;
  releaseStartValue: number;
  /**
   * H6 — MIDI note-on velocity (0-127) captured at trigger time. Scales the
   * ADSR envelope's peak intensity in computeADSR (velocity-sensitive pads
   * like nanoPAD2/Launchpad hit softer → lower modulation intensity reaching
   * applyPadModulations). Optional: absent/undefined (keyboard/mouse
   * triggers, or legacy state) defaults to 127 (full intensity) —
   * byte-identical to pre-H6 behavior.
   */
  velocity?: number;
}

// --- MIDI (Phase 9) ---

export interface CCMapping {
  cc: number;         // MIDI CC number (0-127)
  effectId: string;   // target effect instance id
  paramKey: string;   // target param key
}

export interface MIDIDevice {
  id: string;
  name: string;
  manufacturer: string;
  state: string;
}

export type LearnTarget =
  | { type: 'pad'; padId: string }
  // Legacy effect-knob learn (ParamPanel). Kept as its own variant — it binds
  // via the direct ccMappings list (CCMapping), UNCHANGED by H3.
  | { type: 'cc'; effectId: string; paramKey: string }
  // H3 (master plan WS5) — widened learn surface. Carries an H2 SlotTarget so
  // rack macros, instrument knobs, transform fields and mask op sliders can be
  // armed. The first CC after arming binds a CCSlotMapping (see midi.ts).
  | { type: 'slot'; target: SlotTarget };

export interface MIDIPersistData {
  padMidiNotes: Record<string, number | null>; // padId → midiNote
  ccMappings: CCMapping[];
  channelFilter: number | null; // 0-15 or null (all)
  /**
   * H2 — bank-relative hardware mapping (master-tuneup WS5). Additive to the
   * legacy `ccMappings` (a CC with a bank binding takes precedence at
   * resolve time — see applyBankModulations.ts). Always emitted (possibly
   * empty), matching the sibling fields above — NOT additive-optional like
   * `racks`/`frameBanks`, since it lives inside the always-emitted
   * `midiMappings` block.
   */
  ccBankBindings: CCBankBinding[];
  /** contextKey (focusContext.ts) -> saved BankAssignment. User-saved entries override deriveDefaultAssignment. */
  bankAssignments: Record<string, BankAssignment>;
  /**
   * H3 — direct (context-free) CC->SlotTarget mappings from the widened
   * MIDI-learn surface (macro/transform/mask/instrument knobs). Additive-
   * optional: absent on pre-H3 projects (loadMIDIMappings defaults to []),
   * always emitted by getMIDIPersistData. Legacy effect-knob learn stays in
   * `ccMappings`, so this list never holds effectParam-shaped entries in
   * practice.
   */
  ccSlotMappings?: CCSlotMapping[];
}

// --- Operators (Phase 6A) ---

export type OperatorType = 'lfo' | 'envelope' | 'video_analyzer' | 'audio_follower' | 'step_sequencer' | 'fusion' | 'kentaroCluster' | 'sidechain' | 'gate' | 'midiEnvStutter';

export type LFOWaveform = 'sine' | 'saw' | 'square' | 'triangle' | 'random' | 'noise' | 'sample_hold';

export type SignalBlendMode = 'add' | 'multiply' | 'max' | 'min' | 'average';

export type CurveType = 'linear' | 'exponential' | 'logarithmic' | 's-curve';

export interface SignalProcessingStep {
  type: 'threshold' | 'smooth' | 'quantize' | 'invert' | 'scale';
  params: Record<string, number>;
}

export interface OperatorMapping {
  targetEffectId: string;
  targetParamKey: string;
  depth: number;
  min: number;
  max: number;
  curve: CurveType;
  blendMode?: SignalBlendMode;
  // P4.2: optional sub-source selector. For a kentaroCluster operator, set this
  // to e.g. 'lfo3' to read that single sub-LFO instead of the master mix. Absent
  // → reads the operator's master value (legacy behavior). Serialized as
  // snake_case `source_key`.
  sourceKey?: string;
  // P5b.21 (B9 tensor mod-routing): optional axis-extended routing fields.
  // A source value sampled over `srcAxis` is mapped to a destination over
  // `dstAxis` per `bindingRule`. ALL THREE are OPTIONAL and additive:
  //   absent → srcAxis='t', dstAxis='t', bindingRule='broadcast'  (legacy
  //   byte-identical scalar→all behavior). Removing the fields restores the
  //   old behavior exactly (ROLLBACK guarantee).
  // The accept-set is the 4 implemented rules (broadcast/sampleAt/scanOver/
  // integrate); the 4 research rules (painted/hilbert/polar/learned) are
  // flag-gated and REJECTED at the loader trust boundary (backend
  // project/schema.py), NOT here. Serialized snake_case: src_axis / dst_axis /
  // binding_rule.
  srcAxis?: Axis;
  dstAxis?: Axis;
  bindingRule?: BindingRule;
}

export type VideoAnalyzerMethod = 'luminance' | 'motion' | 'color' | 'edges' | 'histogram_peak';

export type FusionBlendMode = 'weighted_average' | 'max' | 'min' | 'multiply' | 'add';

export interface FusionSource {
  operatorId: string;
  weight: number;
}

export interface Operator {
  id: string;
  type: OperatorType;
  label: string;
  isEnabled: boolean;
  parameters: Record<string, number | string | boolean>;
  processing: SignalProcessingStep[];
  mappings: OperatorMapping[];
}

// --- Device Groups (Phase 14B) ---

export interface DeviceGroup {
  id: string;
  name: string;
  children: EffectInstance[];
  macroMappings: MacroMapping[];
  mix: number;
  isEnabled: boolean;
  abState?: ABState | null;
}

export type ChainItem = EffectInstance | DeviceGroup;

export function isDeviceGroup(item: ChainItem): item is DeviceGroup {
  return 'children' in item && Array.isArray((item as DeviceGroup).children);
}

export function flattenChain(chain: ChainItem[]): EffectInstance[] {
  return chain.flatMap(item =>
    isDeviceGroup(item) ? item.children : [item]
  );
}

// --- Composite as terminal effect (P2.2a, slice 3c) ---

/**
 * P2.2a (Decision D1 clean break): track compositing (`opacity` + blend `mode`)
 * is no longer a Track field. It is expressed as a single TERMINAL effect at the
 * END of a track's `effectChain`. Rules enforced by the timeline-store validator
 * at transaction commit:
 *   - at most ONE composite per chain;
 *   - it MUST be the last item (mid-chain composite is rejected);
 *   - never on an audio track (rejected in addEffect AND reorderEffect);
 *   - never inside a DeviceGroup.
 *
 * Ship the 9 existing blend modes (Decision D4 / BlendMode union above).
 */
export const COMPOSITE_EFFECT_ID = 'composite';

/** Default compositing for a track with no terminal composite. */
export const COMPOSITE_DEFAULTS: { opacity: number; mode: BlendMode } = {
  opacity: 1,
  mode: 'normal',
};

/**
 * A terminal composite is an EffectInstance whose `effectId === 'composite'` and
 * whose `parameters` carry the compositing params `{ opacity, mode }`. Modelled as
 * a narrowed EffectInstance so it lives in the existing `effectChain: EffectInstance[]`
 * with no disruption to other chain entries (UE.7 / P2.1 fields untouched).
 */
export interface CompositeEffect extends EffectInstance {
  effectId: typeof COMPOSITE_EFFECT_ID;
  params: { opacity: number; mode: BlendMode };
}

/** The 9 shipped blend modes (Decision D4) as a runtime Set for validation. */
export const VALID_BLEND_MODES: ReadonlySet<BlendMode> = new Set<BlendMode>([
  'normal',
  'add',
  'multiply',
  'screen',
  'overlay',
  'difference',
  'exclusion',
  'darken',
  'lighten',
]);

/** Type guard: is this chain entry the terminal composite effect? */
export function isCompositeEffect(e: EffectInstance): e is CompositeEffect {
  return e.effectId === COMPOSITE_EFFECT_ID;
}

/**
 * Read the terminal composite from a track's effect chain, or `null` when the
 * track has no composite (renders with COMPOSITE_DEFAULTS). Only the LAST entry
 * is considered the terminal composite — a composite anywhere else is invalid
 * (the validator rejects it) and is NOT treated as the terminal one here.
 */
export function getTerminalComposite(chain: EffectInstance[]): CompositeEffect | null {
  if (chain.length === 0) return null;
  const last = chain[chain.length - 1];
  return isCompositeEffect(last) ? last : null;
}

/**
 * Resolve a track's effective compositing `{ opacity, mode }` from its chain
 * terminal, falling back to COMPOSITE_DEFAULTS. Reads `params` when present
 * (canonical), else falls back to the generic `parameters` bag, then defaults —
 * every value passes a finite/validity guard (numeric trust boundary).
 */
export function getTrackCompositing(chain: EffectInstance[]): { opacity: number; mode: BlendMode } {
  const composite = getTerminalComposite(chain);
  if (!composite) return { ...COMPOSITE_DEFAULTS };

  const rawOpacity =
    composite.params?.opacity ??
    (typeof composite.parameters?.opacity === 'number' ? composite.parameters.opacity : undefined);
  const opacity =
    typeof rawOpacity === 'number' && Number.isFinite(rawOpacity)
      ? Math.max(0, Math.min(1, rawOpacity))
      : COMPOSITE_DEFAULTS.opacity;

  const rawMode =
    composite.params?.mode ??
    (typeof composite.parameters?.mode === 'string' ? composite.parameters.mode : undefined);
  const mode = VALID_BLEND_MODES.has(rawMode as BlendMode)
    ? (rawMode as BlendMode)
    : COMPOSITE_DEFAULTS.mode;

  return { opacity, mode };
}

/**
 * Construct a fresh terminal CompositeEffect at COMPOSITE_DEFAULTS. The `id` is
 * caller-supplied (this module stays dependency-free — the renderer passes
 * `randomUUID()`). The compositing params live in the generic `parameters` bag
 * keyed `opacity`/`mode` so they round-trip through persistence and are read by
 * `getTrackCompositing` (which prefers `params` then falls back to `parameters`).
 * P2.2b: created when a Composite is dropped on a track or the "+ Composite"
 * header affordance is used — always added LAST via the validated addEffect
 * transaction, never mid-chain.
 */
export function makeCompositeEffect(id: string): EffectInstance {
  return {
    id,
    effectId: COMPOSITE_EFFECT_ID,
    isEnabled: true,
    isFrozen: false,
    parameters: { opacity: COMPOSITE_DEFAULTS.opacity, mode: COMPOSITE_DEFAULTS.mode },
    modulations: {},
    mix: 1,
    mask: null,
  };
}

// --- Presets (Phase 10) ---

export interface MacroMapping {
  label: string;
  effectId: string;   // CTO I3: effectId not effectIndex (index breaks on reorder)
  paramKey: string;
  min: number;
  max: number;
}

export interface Preset {
  id: string;
  name: string;
  type: 'single_effect' | 'effect_chain';
  created: number;
  tags: string[];
  isFavorite: boolean;
  effectData?: {
    effectId: string;
    parameters: Record<string, number | string | boolean>;
    modulations: Record<string, ModulationRoute[]>;
  };
  chainData?: {
    effects: EffectInstance[];
    macros: MacroMapping[];
  };
}
