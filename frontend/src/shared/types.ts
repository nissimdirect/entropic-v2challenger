/**
 * Entropic v2 — Core data types.
 * Matches DATA-SCHEMAS.md. Python must serialize/deserialize these exact shapes.
 */

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
}

export interface Track {
  id: string;
  type: "video" | "performance" | "text";
  name: string;
  color: string;
  isMuted: boolean;
  isSoloed: boolean;
  opacity: number;
  blendMode: BlendMode;
  clips: Clip[];
  effectChain: EffectInstance[];
  automationLanes: AutomationLane[];
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

export interface EffectInstance {
  id: string;
  effectId: string;
  isEnabled: boolean;
  isFrozen: boolean;
  parameters: Record<string, number | string | boolean>;
  modulations: Record<string, ModulationRoute[]>;
  mix: number;
  mask: MaskConfig | null;
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

export interface MaskConfig {
  type: "generated" | "asset";
  generatorId?: string;
  assetId?: string;
  invert: boolean;
  feather: number;
}

// --- Automation ---

export interface AutomationLane {
  id: string;
  paramPath: string;
  color: string;
  isVisible: boolean;
  points: AutomationPoint[];
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
  mappings: ModulationRoute[];
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
  | { type: 'cc'; effectId: string; paramKey: string };

export interface MIDIPersistData {
  padMidiNotes: Record<string, number | null>; // padId → midiNote
  ccMappings: CCMapping[];
  channelFilter: number | null; // 0-15 or null (all)
}

// --- Operators (Phase 6A) ---

export type OperatorType = 'lfo' | 'envelope' | 'video_analyzer' | 'audio_follower' | 'step_sequencer' | 'fusion';

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

// --- Presets (Phase 10) ---

export interface MacroMapping {
  label: string;
  effectIndex: number;
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
