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
  type: "video" | "performance";
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
