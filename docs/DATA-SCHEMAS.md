# Entropic v2 — Data Schemas

> TypeScript interfaces defining the shape of all data.
> Python must serialize/deserialize these exact shapes over ZMQ.

---

## 1. Project File (`.glitch`)

```typescript
interface Project {
  version: string;              // "2.0.0"
  id: string;                   // UUID — used in seeded determinism
  created: number;              // Unix timestamp
  modified: number;             // Unix timestamp
  author: string;

  settings: {
    resolution: [number, number]; // [1920, 1080]
    frameRate: number;            // 30
    audioSampleRate: number;      // 48000
    masterVolume: number;         // 0.0 - 1.0
    seed: number;                 // User seed for determinism
  };

  assets: Record<string, Asset>;
  timeline: Timeline;
}

interface Asset {
  id: string;                   // UUID
  path: string;                 // Relative to project directory
  type: "video" | "image" | "audio";
  meta: {
    width: number;
    height: number;
    duration: number;           // Seconds
    fps: number;
    codec: string;
    hasAudio: boolean;
  };
}
```

## 2. Timeline

```typescript
interface Timeline {
  duration: number;             // Total timeline duration in seconds
  tracks: Track[];
  markers: Marker[];
  loopRegion: { in: number; out: number } | null;
}

interface Track {
  id: string;                   // UUID
  type: "video" | "performance";
  name: string;
  color: string;                // Hex color for track header
  isMuted: boolean;
  isSoloed: boolean;
  opacity: number;              // 0.0 - 1.0 (video tracks only)
  blendMode: BlendMode;         // "normal" | "add" | "multiply" | ...
  clips: Clip[];
  effectChain: EffectInstance[];
  automationLanes: AutomationLane[];
}

type BlendMode = "normal" | "add" | "multiply" | "screen" | "overlay"
  | "difference" | "exclusion" | "darken" | "lighten";

interface Clip {
  id: string;                   // UUID
  assetId: string;              // Reference to Asset
  trackId: string;              // Parent track
  position: number;             // Start time on timeline (seconds)
  duration: number;             // Clip duration (seconds)
  inPoint: number;              // Source in point (seconds)
  outPoint: number;             // Source out point (seconds)
  speed: number;                // Playback rate (1.0 = normal)
}

interface Marker {
  id: string;
  time: number;
  label: string;
  color: string;
}
```

## 3. Effect Instance

```typescript
interface EffectInstance {
  id: string;                   // UUID (unique per instance)
  effectId: string;             // Registry ID: "fx.pixelsort", "util.levels"
  isEnabled: boolean;
  isFrozen: boolean;            // Prefix-chain freeze state

  parameters: Record<string, number | string | boolean>;

  modulations: Record<string, ModulationRoute[]>;

  mix: number;                  // Dry/wet 0.0 - 1.0
  mask: MaskConfig | null;
}

interface ModulationRoute {
  sourceId: string;             // ID of the operator (LFO, envelope, etc.)
  depth: number;                // 0.0 - 1.0 (modulation strength)
  min: number;                  // Mapped minimum value
  max: number;                  // Mapped maximum value
  curve: "linear" | "exponential" | "logarithmic" | "s-curve";
}

interface MaskConfig {
  type: "generated" | "asset";
  generatorId?: string;         // If type=generated, which mask generator
  assetId?: string;             // If type=asset, which image asset
  invert: boolean;
  feather: number;              // Edge feathering in pixels
}
```

## 4. Automation

```typescript
interface AutomationLane {
  id: string;
  paramPath: string;            // "track1.fx2.threshold"
  color: string;
  isVisible: boolean;
  points: AutomationPoint[];
}

interface AutomationPoint {
  time: number;                 // Seconds
  value: number;                // Normalized 0.0 - 1.0
  curve: number;                // -1.0 (log) to 1.0 (exp), 0 = linear
}
```

## 5. Performance Track

```typescript
interface PerformanceEvent {
  id: string;
  time: number;                 // Seconds
  duration: number;             // Seconds (0 for one-shot)
  padId: string;                // Which pad triggered this
  velocity: number;             // 0.0 - 1.0
}

interface Pad {
  id: string;
  label: string;
  keyBinding: string | null;    // "q", "w", etc.
  midiNote: number | null;      // MIDI note number
  mode: "gate" | "toggle" | "one-shot";
  chokeGroup: number | null;    // Choke group ID (null = none)
  envelope: {
    attack: number;             // Frames
    decay: number;              // Frames
    sustain: number;            // 0.0 - 1.0
    release: number;            // Frames
  };
  mappings: ModulationRoute[];  // What this pad controls
}

interface DrumRack {
  grid: "4x4" | "8x8";
  pads: Pad[];
}
```

## 6. Signal / Operator

```typescript
interface Operator {
  id: string;                   // UUID
  type: "lfo" | "envelope" | "sidechain" | "gate" | "math" | "fusion";
  parameters: Record<string, any>;
  mappings: ModulationRoute[];
}

// Signal value at any point in time
type SignalValue = number;      // Normalized 0.0 - 1.0

// Signal order: Base → Modulation → Automation → Clamp
interface ResolvedParam {
  base: number;                 // User-set value
  afterModulation: number;      // After all operators applied
  afterAutomation: number;      // After automation lane applied
  clamped: number;              // After clamping to valid range (this is sent to effect)
}
```

## 7. Preset (`.glitchpreset`)

```typescript
interface Preset {
  id: string;                   // UUID
  name: string;
  type: "single_effect" | "effect_chain";
  created: number;              // Unix timestamp
  tags: string[];
  isFavorite: boolean;

  // For single_effect
  effectData?: {
    effectId: string;
    parameters: Record<string, any>;
    modulations: Record<string, ModulationRoute[]>;
  };

  // For effect_chain
  chainData?: {
    effects: EffectInstance[];
    macros: MacroMapping[];
  };
}

interface MacroMapping {
  label: string;                // "Glitch Amount"
  targets: {
    effectIndex: number;
    paramKey: string;
    min: number;
    max: number;
  }[];
}
```

## 8. Undo Entry

```typescript
type UndoEntry =
  | { type: "command"; action: string; data: any; inverse: any; timestamp: number }
  | { type: "param_diff"; path: string; oldValue: any; newValue: any; timestamp: number };

// Stored in memory (up to 500 entries, 50MB cap)
// Overflow: serialized to disk as JSON lines
// Freeze undo: always on disk (separate buffer)
```

## 9. IPC Message Schemas

See `IPC-PROTOCOL.md` for full message specifications. Summary of types:

```typescript
// Electron → Python
type Command =
  | { cmd: "ping" }
  | { cmd: "shutdown" }
  | { cmd: "flush_state"; project: Project }
  | { cmd: "ingest"; path: string }
  | { cmd: "seek"; time: number }
  | { cmd: "render_frame"; time: number; chain: EffectInstance[] }
  | { cmd: "render_range"; start: number; end: number; chain: EffectInstance[]; fps: number }
  | { cmd: "list_effects" }
  | { cmd: "apply_chain"; frame_index: number; chain: EffectInstance[] }
  | { cmd: "export_start"; path: string; codec: string; settings: ExportSettings }
  | { cmd: "export_status"; job_id: string }
  | { cmd: "export_cancel"; job_id: string }
  | { cmd: "audio_decode"; asset_id: string; start: number; duration: number }
  | { cmd: "audio_analyze"; asset_id: string; time: number };

// Python → Electron (responses)
type Response =
  | { id: string; ok: true; [key: string]: any }
  | { id: string; ok: false; error: string };
```
