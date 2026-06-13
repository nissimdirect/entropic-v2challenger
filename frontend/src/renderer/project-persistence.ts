/**
 * Project persistence — save, load, new, autosave.
 * Standalone functions that orchestrate multiple stores.
 * Not a hook — callable from keyboard shortcuts and UI handlers.
 */
import type { Project, ProjectSettings, Timeline, Asset, EffectInstance, DrumRack, Operator, AutomationLane, MIDIPersistData, BlendMode, MatteNode, MatteNodeKind, MatteOp } from '../shared/types'
import { normalizeTransform, COMPOSITE_EFFECT_ID } from '../shared/types'
import { useProjectStore } from './stores/project'
import { useTimelineStore } from './stores/timeline'
import { useUndoStore } from './stores/undo'
import { usePerformanceStore } from './stores/performance'
import { useOperatorStore } from './stores/operators'
import { useAutomationStore } from './stores/automation'
import { useMIDIStore } from './stores/midi'
import { useToastStore } from './stores/toast'
import { useInstrumentsStore } from './stores/instruments'
import type { SamplerInstrumentV1, RackNode, RackPad } from './components/instruments/types'
import { SAMPLER_SPEED_MIN, SAMPLER_SPEED_MAX, RACK_PAD_OPACITY_MIN, RACK_PAD_OPACITY_MAX, MAX_BRANCH_DEPTH } from './components/instruments/types'
import { clampFinite } from '../shared/numeric'
import { randomUUID } from './utils'
import { FF } from '../shared/feature-flags'
import { LIMITS } from '../shared/limits'

// B1 mount: blend modes accepted on a persisted sampler (mirrors SamplerDevice).
const VALID_BLEND_MODES = new Set<BlendMode>([
  'normal', 'add', 'multiply', 'screen', 'overlay',
  'difference', 'exclusion', 'darken', 'lighten',
])

const GLITCH_FILTERS = [{ name: 'Creatrix Project', extensions: ['glitch'] }]
const AUTOSAVE_INTERVAL_MS = 60_000
const PROJECT_VERSION = '3.0.0'
const PROJECT_VERSION_MAJOR = 3
const MAX_RECENT_PROJECTS = 20

// MK.1: Matte node trust boundary constants (mirrored from backend masking/schema.py).
const MAX_MATTE_NODES_PER_CLIP = 8
const MATTE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/
const VALID_MATTE_KINDS = new Set<MatteNodeKind>([
  'rect', 'ellipse', 'polygon', 'bitmap',
  'chroma_key', 'luma_key', 'color_range', 'ai_matte',
])
const VALID_MATTE_OPS = new Set<MatteOp>(['add', 'subtract', 'intersect'])
const FEATHER_MIN = 0
const FEATHER_MAX = 100
const GROW_SHRINK_MIN = -50
const GROW_SHRINK_MAX = 50

/**
 * MK.1: Load-time validator for a single MatteNode from persisted JSON.
 *
 * Trust boundary (P6.6 pattern + feedback_numeric-trust-boundary.md):
 *   - Unknown id (bad regex) → reject (return null)
 *   - Unknown kind → reject (return null)
 *   - feather: NaN/Inf → 0, out-of-range → clamped [0, 100]
 *   - growShrink: NaN/Inf → 0, out-of-range → clamped [−50, 50]
 *   - params numeric values: NaN/Inf → 0; strings pass through
 *   - op: unknown → 'add'
 *   - enabled/invert: coerced to boolean
 *
 * Returns a validated MatteNode, or null if the node must be dropped.
 */
function validateMatteNode(raw: unknown): MatteNode | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>

  // id: must match regex
  const id = r.id
  if (typeof id !== 'string' || !MATTE_ID_PATTERN.test(id)) return null

  // kind: must be in allowlist
  const kind = r.kind
  if (typeof kind !== 'string' || !VALID_MATTE_KINDS.has(kind as MatteNodeKind)) return null

  // op: unknown → 'add'
  const rawOp = r.op
  const op: MatteOp = (typeof rawOp === 'string' && VALID_MATTE_OPS.has(rawOp as MatteOp))
    ? (rawOp as MatteOp)
    : 'add'

  // Clamp finite helper
  const clampFiniteNum = (v: unknown, lo: number, hi: number): number => {
    const n = Number(v)
    if (!Number.isFinite(n)) return 0
    return Math.max(lo, Math.min(hi, n))
  }

  const feather = clampFiniteNum(r.feather, FEATHER_MIN, FEATHER_MAX)
  const growShrink = clampFiniteNum(r.growShrink, GROW_SHRINK_MIN, GROW_SHRINK_MAX)
  const invert = Boolean(r.invert)
  const enabled = r.enabled === undefined ? true : Boolean(r.enabled)

  // params: sanitize numeric values, pass strings through
  const rawParams = (typeof r.params === 'object' && r.params !== null)
    ? r.params as Record<string, unknown>
    : {}
  const params: Record<string, number | string> = {}
  for (const [k, v] of Object.entries(rawParams)) {
    if (typeof v === 'number') {
      params[k] = Number.isFinite(v) ? v : 0
    } else if (typeof v === 'string') {
      params[k] = v
    }
  }

  return { id, kind: kind as MatteNodeKind, params, op, invert, feather, growShrink, enabled }
}

/**
 * MK.1: Validate and sanitize a clip's maskStack at load time.
 *
 * Rules (P6.6 pattern):
 *   - Non-array → return []
 *   - Each entry passed through validateMatteNode; null → dropped with toast
 *   - Stack capped at MAX_MATTE_NODES_PER_CLIP (8)
 */
function loadMaskStack(raw: unknown, clipId: string): MatteNode[] {
  if (!Array.isArray(raw)) return []
  const validated: MatteNode[] = []
  for (const entry of raw) {
    if (validated.length >= MAX_MATTE_NODES_PER_CLIP) break
    const node = validateMatteNode(entry)
    if (node !== null) {
      validated.push(node)
    } else {
      useToastStore.getState().addToast({
        level: 'warning',
        source: 'mask-stack-load',
        message: `Clip ${clipId}: malformed matte node dropped on load`,
      })
    }
  }
  return validated
}

// B4.1 — Sample Rack load-time validation (additive optional; no version bump).
// Max pads per rack — a generous trust-boundary cap (far above any real rack).
const MAX_PADS_PER_RACK = 64

/**
 * B4.1: Validate + sanitize a single RackPad from persisted JSON.
 *
 * Trust boundary (feedback_numeric-trust-boundary.md + P6.6 pattern):
 *   - non-object → drop (null)
 *   - missing/non-string id → drop (cross-store key must exist)
 *   - instrument missing or type !== 'sampler' → drop (a pad IS a sampler leaf)
 *   - opacity: NaN/Inf → 1, out-of-range → clamped [0,1]
 *   - blend: unknown → 'normal'
 *   - mute/solo: coerced to boolean
 *   - instrument numerics clamped at the same bounds as a bare sampler.
 *
 * Returns a validated RackPad, or null if the pad must be DROPPED.
 */
function validateRackPad(raw: unknown, depth = 0): RackPad | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>

  if (typeof r.id !== 'string' || r.id.length === 0) return null

  const opacity = clampFinite(Number(r.opacity), RACK_PAD_OPACITY_MIN, RACK_PAD_OPACITY_MAX, 1)
  const blend: BlendMode = VALID_BLEND_MODES.has(r.blend as BlendMode) ? (r.blend as BlendMode) : 'normal'
  const mute = Boolean(r.mute)
  const solo = Boolean(r.solo)

  // B5.1 — a pad may hold a BRANCH (nested RackNode) instead of a leaf sampler.
  // Recurse into the branch (depth-capped: a branch nested past MAX_BRANCH_DEPTH
  // is DROPPED to the leaf, fail-closed — a weaponized .glitch can't blow the
  // stack). A pad with a valid branch is a GROUP; its leaf `instrument` is still
  // validated (model invariant — present but ignored for rendering) but may be a
  // placeholder. When `branch` is absent → flat leaf pad, byte-identical to B4.
  let branch: RackNode | undefined
  if (typeof r.branch === 'object' && r.branch !== null && depth < MAX_BRANCH_DEPTH) {
    const validated = validateRackNodeBranch(r.branch, r.id, depth + 1)
    if (validated) branch = validated
  }

  // The leaf instrument. A BRANCH pad's instrument may be a placeholder, so when
  // a branch is present an invalid/absent instrument falls back to a default
  // placeholder (the pad is still a valid group). A LEAF pad with no valid
  // sampler instrument is dropped exactly as B4.
  const inst = r.instrument
  let instrument: SamplerInstrumentV1 | null = null
  if (typeof inst === 'object' && inst !== null) {
    const ri = inst as Record<string, unknown>
    if (ri.type === 'sampler' && typeof ri.clipId === 'string') {
      instrument = {
        id: typeof ri.id === 'string' ? ri.id : 'sampler',
        type: 'sampler',
        clipId: ri.clipId,
        startFrame: Math.round(clampFinite(Number(ri.startFrame), 0, 1_000_000, 0)),
        speed: clampFinite(Number(ri.speed), SAMPLER_SPEED_MIN, SAMPLER_SPEED_MAX, 1),
        opacity: clampFinite(Number(ri.opacity), 0, 1, 1),
        blendMode: VALID_BLEND_MODES.has(ri.blendMode as BlendMode) ? (ri.blendMode as BlendMode) : 'normal',
      }
    }
  }
  if (!instrument) {
    if (!branch) return null // LEAF pad with no valid sampler → drop (B4 behavior).
    // BRANCH pad placeholder leaf (ignored for rendering).
    instrument = { id: 'sampler', type: 'sampler', clipId: '', startFrame: 0, speed: 1, opacity: 1, blendMode: 'normal' }
  }

  return { id: r.id, instrument, opacity, blend, mute, solo, ...(branch ? { branch } : {}) }
}

/**
 * B5.1 — validate a branch RackNode (a pad's nested rack). Recurses into pads
 * (which may themselves hold deeper branches — bounded by MAX_BRANCH_DEPTH).
 * Carries the branch-level chain/composite. A branch with zero valid pads is
 * dropped (the pad falls back to a leaf). Trust boundary: opacity clamped, blend
 * validated, depth-capped.
 */
function validateRackNodeBranch(raw: unknown, parentId: string, depth: number): RackNode | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  if (!Array.isArray(r.pads)) return null
  const pads: RackPad[] = []
  for (const entry of r.pads) {
    if (pads.length >= MAX_PADS_PER_RACK) break
    const pad = validateRackPad(entry, depth)
    if (pad !== null) pads.push(pad)
  }
  if (pads.length === 0) return null
  const node: RackNode = { id: typeof r.id === 'string' ? r.id : 'rack', type: 'rack', pads }
  // Branch-level composite (how the branch blends into its parent).
  if (typeof r.composite === 'object' && r.composite !== null) {
    const c = r.composite as Record<string, unknown>
    node.composite = {
      opacity: clampFinite(Number(c.opacity), RACK_PAD_OPACITY_MIN, RACK_PAD_OPACITY_MAX, 1),
      blend: VALID_BLEND_MODES.has(c.blend as BlendMode) ? (c.blend as BlendMode) : 'normal',
    }
  }
  return node
}

/**
 * B4.1: Validate + sanitize a RackNode from persisted JSON.
 *   - non-object / non-array pads → drop the whole rack (null)
 *   - malformed pads are DROPPED individually (with a toast), additive-safe
 *   - pad list capped at MAX_PADS_PER_RACK
 *   - a rack that ends up with zero valid pads is dropped (null)
 */
function validateRackNode(raw: unknown, trackId: string): RackNode | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  if (!Array.isArray(r.pads)) return null

  const pads: RackPad[] = []
  for (const entry of r.pads) {
    if (pads.length >= MAX_PADS_PER_RACK) break
    const pad = validateRackPad(entry)
    if (pad !== null) {
      pads.push(pad)
    } else {
      useToastStore.getState().addToast({
        level: 'warning',
        source: 'rack-load',
        message: `Track ${trackId}: malformed rack pad dropped on load`,
      })
    }
  }

  if (pads.length === 0) return null
  return { id: typeof r.id === 'string' ? r.id : 'rack', type: 'rack', pads }
}

// F-0514-10 + F-0514-11: numeric range guards mirrored from backend schema.py.
// Type-only checks let pathological values through; UAT 2026-05-14 confirmed only
// `clock_set_fps`'s guard_positive() caught fps<=0, so a malformed project loaded
// successfully and crashed audio/render downstream.
const FRAMERATE_MIN = 1
const FRAMERATE_MAX = 240
const RESOLUTION_MIN = 1
const RESOLUTION_MAX = 8192
const MASTER_VOLUME_MIN = 0
const MASTER_VOLUME_MAX = 2
const SEED_MIN = 0
const SEED_MAX = 2 ** 31 - 1
const VALID_SAMPLE_RATES = new Set([8000, 11025, 16000, 22050, 32000, 44100, 48000, 88200, 96000])

function isFiniteNumberInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
}

function isIntegerInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
}

// Project-file load hardening — defends against weaponized .glitch files.
// Project files are routinely shared (collab, presets, social posts), so the
// JSON.parse(readFile()) → validateProject path is an attacker-controlled boundary.
// Limits chosen to be far above any legitimate project's needs.
const MAX_JSON_DEPTH = 32
const MAX_KEYS_PER_NODE = 1024
const MAX_ARRAY_LENGTH = 10_000
const MAX_VERSION_STRING_LENGTH = 16
// RT-4: case-INsensitive match so a weaponized .glitch with `__PROTO__`,
// `Constructor`, etc. cannot bypass the prototype-pollution defense. Mirrors
// backend schema.py's FORBIDDEN_KEY_PATTERN.
const FORBIDDEN_KEY_PATTERN = /^(__proto__|constructor|prototype)$/i

interface StructureCheckResult {
  valid: boolean
  reason?: string
}

export function validateProjectStructure(data: unknown): StructureCheckResult {
  if (typeof data === 'object' && data !== null) {
    const obj = data as Record<string, unknown>
    if (typeof obj.version === 'string') {
      if (obj.version.length > MAX_VERSION_STRING_LENGTH) {
        return { valid: false, reason: `version field exceeds ${MAX_VERSION_STRING_LENGTH} chars` }
      }
      // Red-team RT-2: a non-digit-prefixed version ("v2.0.0") made parseInt
      // return NaN and SKIPPED the version gate entirely — clean-break evasion.
      // The version head must be strictly numeric; anything else is invalid.
      const versionHead = obj.version.split('.')[0]
      if (!/^\d+$/.test(versionHead)) {
        return { valid: false, reason: `Invalid project version format: ${obj.version.slice(0, 16)}` }
      }
      const major = Number.parseInt(versionHead, 10)
      if (Number.isFinite(major) && major > PROJECT_VERSION_MAJOR) {
        return {
          valid: false,
          reason: `Project saved by a newer Creatrix version (v${major}). Update Creatrix to open it.`,
        }
      }
      // P2.2a (slice 3c, Decision D1 clean break): v3 removed track-level
      // opacity/blendMode for a terminal CompositeEffect. There is no migration —
      // pre-v3 projects are rejected LOUDLY (toast, never a crash / silent partial
      // load). Message is contractual; mirrors backend schema.V2_UNSUPPORTED_MESSAGE.
      if (Number.isFinite(major) && major < PROJECT_VERSION_MAJOR) {
        return {
          valid: false,
          reason: 'v2 projects unsupported — start a new project',
        }
      }
    }
  }

  function walk(node: unknown, depth: number, path: string): string | null {
    if (depth > MAX_JSON_DEPTH) {
      return `JSON nesting depth exceeds ${MAX_JSON_DEPTH} at ${path}`
    }
    if (Array.isArray(node)) {
      if (node.length > MAX_ARRAY_LENGTH) {
        return `Array length ${node.length} exceeds ${MAX_ARRAY_LENGTH} at ${path}`
      }
      for (let i = 0; i < node.length; i++) {
        const reason = walk(node[i], depth + 1, `${path}[${i}]`)
        if (reason) return reason
      }
      return null
    }
    if (typeof node === 'object' && node !== null) {
      const keys = Object.keys(node)
      if (keys.length > MAX_KEYS_PER_NODE) {
        return `Object key count ${keys.length} exceeds ${MAX_KEYS_PER_NODE} at ${path}`
      }
      for (const key of keys) {
        if (FORBIDDEN_KEY_PATTERN.test(key)) {
          return `Forbidden key "${key}" at ${path}`
        }
      }
      for (const key of keys) {
        const reason = walk((node as Record<string, unknown>)[key], depth + 1, `${path}.${key}`)
        if (reason) return reason
      }
    }
    return null
  }

  const reason = walk(data, 0, '$')
  if (reason) return { valid: false, reason }
  return { valid: true }
}

export interface RecentProject {
  path: string
  name: string
  lastModified: number
}

let autosaveTimer: ReturnType<typeof setInterval> | null = null

function defaultSettings(): ProjectSettings {
  return {
    resolution: [1920, 1080],
    frameRate: 30,
    audioSampleRate: 44100,
    masterVolume: 1.0,
    seed: Math.floor(Math.random() * 2147483647),
    bpm: 120,
  }
}

function serializeProject(): string {
  const projectStore = useProjectStore.getState()
  const timelineStore = useTimelineStore.getState()
  const performanceStore = usePerformanceStore.getState()

  const timeline: Timeline = {
    duration: timelineStore.duration,
    tracks: timelineStore.tracks,
    markers: timelineStore.markers,
    loopRegion: timelineStore.loopRegion,
    // F-0512-25: persist zoom so reloads don't lose the user's view setting.
    ...(FF.F_0512_25_ZOOM_PERSIST ? { zoom: timelineStore.zoom } : {}),
  }

  const operatorStore = useOperatorStore.getState()
  const automationStore = useAutomationStore.getState()

  const midiStore = useMIDIStore.getState()

  // G10 resolution: B2's track-keyed `instruments` supersedes B1's global
  // single `instrument` (#156). Legacy saves with `instrument` are dropped
  // with a toast in hydrateStores — clean-break policy, never a throw.
  const project: Project & { drumRack?: DrumRack; operators?: Operator[]; automationLanes?: Record<string, AutomationLane[]>; midiMappings?: MIDIPersistData; deviceGroups?: Record<string, { name: string; effectIds: string[]; mix: number; isEnabled: boolean }>; instruments?: Record<string, SamplerInstrumentV1>; racks?: Record<string, RackNode> } = {
    version: PROJECT_VERSION,
    id: randomUUID(),
    created: Date.now(),
    modified: Date.now(),
    author: '',
    settings: {
      ...defaultSettings(),
      resolution: projectStore.canvasResolution,
      // HT-4: persist project-level seed so freeze caches are reproducible
      // across reloads. defaultSettings() supplies a random seed for brand-new
      // projects; the store seed wins once loaded.
      seed: projectStore.seed,
      // Persist the actual project tempo (defaultSettings() only supplies 120).
      // Paired with the hydrateStores setBpm restore — together they fix BPM
      // round-trip (was write-default + never-read → tempo always reset to 120).
      // P2.1: Only 'bpm' (the persisted baseline) is saved here. The derived
      // 'effectiveBpm' (modulation-adjusted value) is NEVER serialized — it is
      // always recomputed from the automation lanes on each frame.
      bpm: projectStore.bpm,
    },
    assets: projectStore.assets,
    timeline,
    // Epic 05 D2: masterEffectChain removed — per-track chains are now serialized
    // inside timeline.tracks[].effectChain and restored by hydrateStores.
    drumRack: performanceStore.drumRack,
    operators: operatorStore.operators,
    automationLanes: automationStore.lanes,
    // B2: per-Performance-track samplers, keyed by trackId (remapped on load).
    instruments: useInstrumentsStore.getState().instruments,
    // B4.1: per-Performance-track Sample Racks, keyed by trackId (remapped on
    // load). Omitted entirely when there are no racks so a no-rack project's
    // serialized JSON is byte-identical to today (regression-safe).
    ...(Object.keys(useInstrumentsStore.getState().racks).length > 0
      ? { racks: useInstrumentsStore.getState().racks }
      : {}),
    midiMappings: midiStore.getMIDIPersistData(),
    deviceGroups: Object.keys(projectStore.deviceGroups).length > 0 ? projectStore.deviceGroups : undefined,
  }

  return JSON.stringify(project, null, 2)
}

function validateProject(data: unknown): data is Project {
  if (typeof data !== 'object' || data === null) return false
  const obj = data as Record<string, unknown>

  // Required top-level fields
  const required = ['version', 'id', 'created', 'modified', 'settings', 'assets', 'timeline']
  for (const field of required) {
    if (!(field in obj)) return false
  }

  if (typeof obj.version !== 'string') return false
  if (typeof obj.id !== 'string') return false
  if (typeof obj.created !== 'number') return false
  if (typeof obj.modified !== 'number') return false

  // Settings validation — type + range. Mirrors backend schema._validate_settings_ranges.
  const settings = obj.settings as Record<string, unknown>
  if (typeof settings !== 'object' || settings === null) return false
  if (!Array.isArray(settings.resolution) || settings.resolution.length !== 2) return false
  if (!isIntegerInRange(settings.resolution[0], RESOLUTION_MIN, RESOLUTION_MAX)) return false
  if (!isIntegerInRange(settings.resolution[1], RESOLUTION_MIN, RESOLUTION_MAX)) return false
  if (!isFiniteNumberInRange(settings.frameRate, FRAMERATE_MIN, FRAMERATE_MAX)) return false
  if (settings.audioSampleRate !== undefined &&
      !(typeof settings.audioSampleRate === 'number' && VALID_SAMPLE_RATES.has(settings.audioSampleRate))) return false
  if (settings.masterVolume !== undefined &&
      !isFiniteNumberInRange(settings.masterVolume, MASTER_VOLUME_MIN, MASTER_VOLUME_MAX)) return false
  if (settings.seed !== undefined &&
      !isIntegerInRange(settings.seed, SEED_MIN, SEED_MAX)) return false

  // Timeline validation
  const timeline = obj.timeline as Record<string, unknown>
  if (typeof timeline !== 'object' || timeline === null) return false
  if (!Array.isArray(timeline.tracks)) return false
  if (!Array.isArray(timeline.markers)) return false

  // Assets validation — each must have id, path, and meta object
  if (typeof obj.assets !== 'object' || obj.assets === null) return false
  for (const asset of Object.values(obj.assets as Record<string, unknown>)) {
    if (typeof asset !== 'object' || asset === null) return false
    const a = asset as Record<string, unknown>
    if (typeof a.id !== 'string') return false
    if (typeof a.path !== 'string') return false
    if (typeof a.meta !== 'object' || a.meta === null) return false
  }

  // Track/clip field validation
  for (const track of timeline.tracks as unknown[]) {
    if (typeof track !== 'object' || track === null) return false
    const t = track as Record<string, unknown>
    if (typeof t.id !== 'string') return false
    if (typeof t.name !== 'string') return false
    if (!Array.isArray(t.clips)) return false
    // Track type validation — accept video, performance, text, audio
    if (t.type !== undefined && typeof t.type === 'string') {
      if (!['video', 'performance', 'text', 'audio'].includes(t.type)) return false
    }
    for (const clip of t.clips as unknown[]) {
      if (typeof clip !== 'object' || clip === null) return false
      const c = clip as Record<string, unknown>
      if (typeof c.id !== 'string') return false
      if (typeof c.position !== 'number' || !Number.isFinite(c.position as number)) return false
      if (typeof c.duration !== 'number' || !Number.isFinite(c.duration as number)) return false
      // Text clip config validation
      if (c.textConfig !== undefined) {
        if (typeof c.textConfig !== 'object' || c.textConfig === null) return false
        const tc = c.textConfig as Record<string, unknown>
        if (typeof tc.text !== 'string') return false
      }
    }
    // Audio-clip validation (audio tracks use t.audioClips, not t.clips)
    if (t.audioClips !== undefined) {
      if (!Array.isArray(t.audioClips)) return false
      for (const clip of t.audioClips as unknown[]) {
        if (typeof clip !== 'object' || clip === null) return false
        const c = clip as Record<string, unknown>
        if (typeof c.id !== 'string') return false
        if (typeof c.path !== 'string') return false
        // Numeric trust boundary: every field must be finite before clamp.
        // The timeline store's normalizeAudioClip() re-clamps on hydrate; this
        // validator rejects non-number-shaped data at the file boundary.
        for (const key of ['inSec', 'outSec', 'startSec', 'gainDb', 'fadeInSec', 'fadeOutSec']) {
          const v = c[key]
          if (typeof v !== 'number' || !Number.isFinite(v)) return false
        }
        if (c.muted !== undefined && typeof c.muted !== 'boolean') return false
      }
    }
    if (t.gainDb !== undefined && (typeof t.gainDb !== 'number' || !Number.isFinite(t.gainDb))) return false
  }

  // P1-5: Optional drumRack validation
  if ('drumRack' in obj && obj.drumRack !== undefined) {
    const rack = obj.drumRack as Record<string, unknown>
    if (typeof rack !== 'object' || rack === null) return false
    if (!Array.isArray(rack.pads)) return false
  }

  // P6A: Optional operators validation
  if ('operators' in obj && obj.operators !== undefined) {
    if (!Array.isArray(obj.operators)) return false
  }

  // P9: Optional midiMappings validation
  if ('midiMappings' in obj && obj.midiMappings !== undefined) {
    const midi = obj.midiMappings as Record<string, unknown>
    if (typeof midi !== 'object' || midi === null) return false
    if (midi.ccMappings !== undefined && !Array.isArray(midi.ccMappings)) return false
    if (midi.padMidiNotes !== undefined && (typeof midi.padMidiNotes !== 'object' || midi.padMidiNotes === null)) return false
  }

  // B4.1: optional racks. Shape-check only (object of objects) — per-pad
  // validation + malformed-pad dropping happens at hydrate. Absent = no rack.
  if ('racks' in obj && obj.racks !== undefined) {
    if (typeof obj.racks !== 'object' || obj.racks === null || Array.isArray(obj.racks)) return false
  }

  // B1 mount: optional sampler instrument. Shape-check only — numeric ranges are
  // clamped at hydrate (deserialization trust boundary). Absent = older project.
  if (obj.instrument !== undefined) {
    if (typeof obj.instrument !== 'object' || obj.instrument === null) return false
    const ri = obj.instrument as Record<string, unknown>
    if (ri.type !== 'sampler') return false
    if (typeof ri.clipId !== 'string') return false
  }

  return true
}

function hydrateStores(project: Project & { masterEffectChain?: EffectInstance[]; drumRack?: DrumRack; operators?: Operator[]; automationLanes?: Record<string, AutomationLane[]>; midiMappings?: MIDIPersistData; deviceGroups?: Record<string, { name: string; effectIds: string[]; mix: number; isEnabled: boolean }>; instruments?: Record<string, SamplerInstrumentV1>; racks?: Record<string, RackNode> }): void {
  const projectStore = useProjectStore.getState()
  const timelineStore = useTimelineStore.getState()
  const undoStore = useUndoStore.getState()

  // Reset stores first
  projectStore.resetProject()
  timelineStore.reset()
  undoStore.clear()
  usePerformanceStore.getState().resetDrumRack()
  useOperatorStore.getState().resetOperators()
  useAutomationStore.getState().resetAutomation()
  useMIDIStore.getState().resetMIDI()
  useInstrumentsStore.setState({ instruments: {}, racks: {} })

  // B2: saved trackId → freshly-created trackId (tracks get new ids on load).
  // Used to re-key the per-track samplers after the track loop.
  const trackIdMap: Record<string, string> = {}

  // HT-4: hydrate project-level seed for deterministic renders + freeze caches.
  // Validation already clamped it to [0, 2^31-1] in validateProject().
  if (project.settings && typeof project.settings.seed === 'number') {
    projectStore.setSeed(project.settings.seed)
  }

  // Hydrate BPM (drives the quantize grid + clip snapping). Was serialized to
  // settings.bpm but never restored — reloading a project silently reset it to 120.
  // setBpm clamps to [1, 300].
  if (project.settings && typeof project.settings.bpm === 'number') {
    projectStore.setBpm(project.settings.bpm)
  }

  // Hydrate assets
  for (const asset of Object.values(project.assets)) {
    projectStore.addAsset(asset as Asset)
  }

  // G10 (B1→B2 seam): legacy saves carry a GLOBAL single `instrument` (#156's
  // shape). B2's store is track-keyed and a global sampler has no track to bind
  // to, so per clean-break policy it is DROPPED with a toast — never a throw.
  const rawInst = (project as { instrument?: unknown }).instrument
  if (rawInst && typeof rawInst === 'object') {
    useToastStore.getState().addToast({
      level: 'warning',
      source: 'legacy-instrument',
      message: 'Legacy single-sampler project: sampler dropped — re-add it to a Performance track',
    })
  }

  // Epic 05 D2: masterEffectChain hydrate stub removed. Per-track effectChains
  // are now restored inside the track loop below via updateTrackEffectChain.

  // Hydrate device groups (metadata-only)
  if (project.deviceGroups && typeof project.deviceGroups === 'object') {
    useProjectStore.setState({ deviceGroups: project.deviceGroups })
  }

  // Hydrate timeline tracks
  for (const track of project.timeline.tracks) {
    const tls = useTimelineStore.getState()
    const isAudio = track.type === 'audio'
    let addedTrackId: string | undefined
    if (isAudio) {
      addedTrackId = tls.addAudioTrack(track.name, track.color)
    } else {
      // B2: preserve performance/text type on reload (was collapsing → video).
      const addType = track.type === 'text' ? 'text' : track.type === 'performance' ? 'performance' : undefined
      tls.addTrack(track.name, track.color, addType)
      const freshTracks = useTimelineStore.getState().tracks
      addedTrackId = freshTracks[freshTracks.length - 1]?.id
    }
    if (!addedTrackId) continue
    trackIdMap[track.id] = addedTrackId
    // Set shared track properties
    if (track.isMuted) useTimelineStore.getState().toggleMute(addedTrackId)
    if (track.isSoloed) useTimelineStore.getState().toggleSolo(addedTrackId)
    if (isAudio) {
      // Restore audio track gain
      const gainDb = (track as unknown as { gainDb?: number }).gainDb
      if (typeof gainDb === 'number' && Number.isFinite(gainDb) && gainDb !== 0) {
        useTimelineStore.getState().setTrackGain(addedTrackId, gainDb)
      }
      // Hydrate audio clips
      const audioClips = (track as unknown as { audioClips?: unknown[] }).audioClips ?? []
      for (const rawClip of audioClips) {
        const c = rawClip as Record<string, unknown>
        useTimelineStore.getState().addAudioClip(addedTrackId, {
          path: String(c.path ?? ''),
          inSec: Number(c.inSec) || 0,
          outSec: Number(c.outSec) || 0,
          startSec: Number(c.startSec) || 0,
          gainDb: Number(c.gainDb) || 0,
          fadeInSec: Number(c.fadeInSec) || 0,
          fadeOutSec: Number(c.fadeOutSec) || 0,
          muted: Boolean(c.muted),
          missing: c.missing === true ? true : undefined,
        })
      }
    } else {
      // P2.2a (slice 3c, Decision D1 clean break): track-level opacity/blendMode
      // are gone. Compositing is restored as the terminal CompositeEffect inside
      // the effectChain (hydrated below). v2 files carrying these fields are
      // rejected by the backend schema validator before reaching this loader.
      // Add video/text clips (migrate legacy transform format: {scale} → {scaleX, scaleY, ...})
      // MK.1: also validate and hydrate maskStack at the persistence trust boundary.
      // IMPORTANT: always use the validated maskStack (not the raw clip's maskStack), so
      // malformed nodes from disk are dropped before reaching the store.
      for (const clip of track.clips) {
        const rawClip = clip as unknown as Record<string, unknown>
        const maskStack = loadMaskStack(rawClip.maskStack, clip.id)
        // Build the migrated clip WITHOUT spreading the raw maskStack (it may contain invalid nodes).
        // We destructure clip explicitly to exclude maskStack, then add the validated one.
        const { maskStack: _rawMaskStack, ...clipWithoutMaskStack } = rawClip
        const base = {
          ...clipWithoutMaskStack,
          trackId: addedTrackId,
          ...(clip.transform ? { transform: normalizeTransform(clip.transform as any) } : {}),
        }
        const migratedClip = maskStack.length > 0
          ? { ...base, maskStack }
          : base
        useTimelineStore.getState().addClip(addedTrackId, migratedClip as any)
      }
    }

    // Epic 05 D1: restore per-track effectChain after clips are added.
    // Trust boundary: guard the saved chain is an array of objects with a string effectId;
    // drop malformed entries. updateTrackEffectChain is a plain store write (NOT undoable).
    // Review hardening (trust boundary): the saved chain is untrusted disk input that flows
    // store -> IPC -> backend. (a) Require BOTH id (instance identity — ALL cross-store keys
    // use it; a missing id orphans operator/automation/CC/group refs) AND effectId (effect type)
    // as strings. (b) Finite-guard numeric params + clamp mix to [0,1] (numeric-trust-boundary rule).
    // (c) Cap to the per-track chain limit (hydrate must not bypass MAX_EFFECTS_PER_CHAIN).
    const rawChain = Array.isArray((track as any).effectChain) ? (track as any).effectChain : []
    const sanitized = (rawChain as unknown[]).reduce<EffectInstance[]>((acc, raw) => {
      if (typeof raw !== 'object' || raw === null) return acc
      const e = raw as Record<string, unknown>
      if (typeof e.id !== 'string' || typeof e.effectId !== 'string') return acc // missing identity -> drop (would orphan)
      const parameters: Record<string, number | string | boolean> = {}
      if (e.parameters && typeof e.parameters === 'object') {
        for (const [k, v] of Object.entries(e.parameters as Record<string, unknown>)) {
          if (typeof v === 'number') { if (Number.isFinite(v)) parameters[k] = v } // drop NaN/Inf
          else if (typeof v === 'string' || typeof v === 'boolean') parameters[k] = v
        }
      }
      acc.push({
        id: e.id,
        effectId: e.effectId,
        isEnabled: typeof e.isEnabled === 'boolean' ? e.isEnabled : true,
        isFrozen: typeof e.isFrozen === 'boolean' ? e.isFrozen : false,
        parameters,
        modulations: (e.modulations && typeof e.modulations === 'object' ? e.modulations : {}) as EffectInstance['modulations'],
        mix: typeof e.mix === 'number' && Number.isFinite(e.mix) ? Math.max(0, Math.min(1, e.mix)) : 1,
        mask: (e.mask && typeof e.mask === 'object' ? e.mask : null) as EffectInstance['mask'],
        ...(e.abState && typeof e.abState === 'object' ? { abState: e.abState as EffectInstance['abState'] } : {}),
      })
      return acc
    }, [])
    // P2.2a load-time composite placement guard (red-team RT-1): hydration writes
    // chains via the raw store primitive, BYPASSING the transaction-commit
    // validator — so the placement rules (no composite on audio tracks, at most
    // one composite, composite terminal) must also be enforced HERE, at the
    // disk trust boundary. Drop/normalize with a toast, never crash.
    let guarded = sanitized
    if (isAudio && guarded.some((e) => e.effectId === COMPOSITE_EFFECT_ID)) {
      guarded = guarded.filter((e) => e.effectId !== COMPOSITE_EFFECT_ID)
      useToastStore.getState().addToast({ level: 'warning', message: `Track "${track.name}": composite effect on an audio track removed on load`, source: 'project-load' })
    } else {
      const composites = guarded.filter((e) => e.effectId === COMPOSITE_EFFECT_ID)
      if (composites.length > 1) {
        const terminal = composites[composites.length - 1]
        guarded = [...guarded.filter((e) => e.effectId !== COMPOSITE_EFFECT_ID), terminal]
        useToastStore.getState().addToast({ level: 'warning', message: `Track "${track.name}": duplicate composite effects — kept the terminal one`, source: 'project-load' })
      } else if (composites.length === 1 && guarded[guarded.length - 1].effectId !== COMPOSITE_EFFECT_ID) {
        guarded = [...guarded.filter((e) => e.effectId !== COMPOSITE_EFFECT_ID), composites[0]]
        useToastStore.getState().addToast({ level: 'warning', message: `Track "${track.name}": composite effect moved to the end of the chain on load`, source: 'project-load' })
      }
    }
    const savedChain = guarded.slice(0, LIMITS.MAX_EFFECTS_PER_CHAIN)
    if (savedChain.length < guarded.length) {
      useToastStore.getState().addToast({ level: 'warning', message: `Track "${track.name}" effect chain truncated to ${LIMITS.MAX_EFFECTS_PER_CHAIN} on load`, source: 'project-load' })
    }
    if (savedChain.length) {
      useTimelineStore.getState().updateTrackEffectChain(addedTrackId, () => savedChain)
    }
  }

  // Hydrate markers
  for (const marker of project.timeline.markers) {
    timelineStore.addMarker(marker.time, marker.label, marker.color)
  }

  // Hydrate loop region
  if (project.timeline.loopRegion) {
    timelineStore.setLoopRegion(project.timeline.loopRegion.in, project.timeline.loopRegion.out)
  }

  // Hydrate duration
  if (project.timeline.duration > 0) {
    timelineStore.setDuration(project.timeline.duration)
  }

  // F-0512-25: hydrate timeline zoom (optional; absent on legacy files)
  if (FF.F_0512_25_ZOOM_PERSIST && typeof project.timeline.zoom === 'number' && project.timeline.zoom > 0) {
    timelineStore.setZoom(project.timeline.zoom)
  }

  // Hydrate drum rack (backward compat: missing = use defaults)
  if (project.drumRack && Array.isArray(project.drumRack.pads)) {
    usePerformanceStore.getState().loadDrumRack(project.drumRack as DrumRack)
  }

  // Hydrate operators (backward compat: missing = empty array)
  if (Array.isArray(project.operators)) {
    useOperatorStore.getState().loadOperators(project.operators as Operator[])
  }

  // Hydrate automation lanes (backward compat: missing = empty)
  if (project.automationLanes && typeof project.automationLanes === 'object') {
    useAutomationStore.getState().loadAutomation(project.automationLanes)
  }

  // Hydrate MIDI mappings (backward compat: missing = empty)
  if (project.midiMappings && typeof project.midiMappings === 'object') {
    useMIDIStore.getState().loadMIDIMappings(project.midiMappings)
  }

  // B2: restore per-track samplers, re-keyed to the new trackIds + clamped at the
  // deserialization trust boundary. Samplers whose track didn't survive are dropped.
  if (project.instruments && typeof project.instruments === 'object') {
    const instr = useInstrumentsStore.getState()
    for (const [oldId, raw] of Object.entries(project.instruments)) {
      const newId = trackIdMap[oldId]
      if (!newId || !raw || typeof raw !== 'object' || (raw as SamplerInstrumentV1).type !== 'sampler') continue
      const s = raw as SamplerInstrumentV1
      instr.addSampler(newId, typeof s.clipId === 'string' ? s.clipId : '')
      instr.updateSampler(newId, {
        startFrame: Math.round(clampFinite(Number(s.startFrame), 0, 1_000_000, 0)),
        speed: clampFinite(Number(s.speed), SAMPLER_SPEED_MIN, SAMPLER_SPEED_MAX, 1),
        opacity: clampFinite(Number(s.opacity), 0, 1, 1),
        blendMode: VALID_BLEND_MODES.has(s.blendMode as BlendMode) ? s.blendMode : 'normal',
      })
    }
  }

  // B4.1: restore per-track Sample Racks, re-keyed to the new trackIds. Each rack
  // is validated at this deserialization trust boundary — malformed pads are
  // DROPPED individually (with a toast), a rack with zero valid pads is dropped,
  // and a rack whose track didn't survive is dropped. Additive-safe: a project
  // with no `racks` field leaves the racks store empty (no-rack regression).
  if (project.racks && typeof project.racks === 'object') {
    const restored: Record<string, RackNode> = {}
    for (const [oldId, raw] of Object.entries(project.racks)) {
      const newId = trackIdMap[oldId]
      if (!newId) continue
      const rack = validateRackNode(raw, oldId)
      if (rack) restored[newId] = rack
    }
    if (Object.keys(restored).length > 0) {
      useInstrumentsStore.setState((s) => ({ racks: { ...s.racks, ...restored } }))
    }
  }

  // Hydrate canvas resolution from project settings (backward compat: default 1920x1080)
  if (project.settings?.resolution && Array.isArray(project.settings.resolution) && project.settings.resolution.length === 2) {
    useProjectStore.getState().setCanvasResolution(project.settings.resolution[0], project.settings.resolution[1])
  }

  // D1 (Epic 02): after all tracks load, if no track is selected, select the first video track.
  // addTrack auto-selects when none was selected, but reset() + replay through addTrack
  // means the first addTrack will select, but subsequent hydrate may not. Ensure it's explicit.
  const finalTl = useTimelineStore.getState()
  if (!finalTl.selectedTrackId) {
    const firstVideoTrack = finalTl.tracks.find((t) => t.type === 'video')
    if (firstVideoTrack) {
      finalTl.selectTrack(firstVideoTrack.id)
    }
  }
}

// UE.4: rolling numbered backups — rotate .bak.1..5 beside the project file.
// Rotation always happens BEFORE the overwrite so the last good copy is preserved.
// Rotation failure must NOT block the save (log + toast warning per the packet spec).
export const MAX_BACKUPS = 5

export async function rotateBackups(filePath: string): Promise<void> {
  if (!window.entropic) return

  // Shift .bak.4 -> .bak.5, .bak.3 -> .bak.4, ..., .bak.1 -> .bak.2.
  // A missing .bak.N is normal (readFile throws — skip); shift failures are
  // best-effort and never block the save, but the user is warned once.
  let rotationFailed = false
  for (let n = MAX_BACKUPS - 1; n >= 1; n--) {
    const src = `${filePath}.bak.${n}`
    const dst = `${filePath}.bak.${n + 1}`
    let content: string
    try {
      content = await window.entropic.readFile(src)
    } catch {
      continue // .bak.N does not exist yet — normal
    }
    try {
      await window.entropic.writeFile(dst, content)
      await window.entropic.deleteFile(src)
    } catch (err) {
      console.warn(`[Backup] Shift ${src} -> ${dst} failed:`, err)
      rotationFailed = true
    }
  }

  // Copy current project file -> .bak.1. If the project file is unreadable it
  // does not exist yet (first save) — skip silently. If it IS readable but the
  // backup write fails, that is a real rotation failure: warn, never block.
  let current: string | null = null
  try {
    current = await window.entropic.readFile(filePath)
  } catch {
    // first save — nothing to back up
  }
  if (current !== null) {
    try {
      await window.entropic.writeFile(`${filePath}.bak.1`, current)
    } catch (err) {
      console.warn('[Backup] Rotation failed, save will continue:', err)
      rotationFailed = true
    }
  }

  if (rotationFailed) {
    useToastStore.getState().addToast({
      level: 'warning',
      source: 'backup-rotation',
      message: 'Backup rotation failed — save will continue without backup',
    })
  }
}

export async function saveProject(): Promise<boolean> {
  if (!window.entropic) return false

  const projectStore = useProjectStore.getState()
  let filePath = projectStore.projectPath

  if (!filePath) {
    filePath = await window.entropic.showSaveDialog({
      filters: GLITCH_FILTERS,
    })
    if (!filePath) return false // user cancelled
  }

  // UE.4: rotate backups BEFORE overwriting the project file
  await rotateBackups(filePath)

  const json = serializeProject()
  try {
    await window.entropic.writeFile(filePath, json)
  } catch (err) {
    // Mirror saveProjectAs: a failed write must not mutate store state or
    // surface as an unhandled rejection. The rotated .bak.1 still holds the
    // last good copy.
    console.error('[Save] Write failed:', err)
    useToastStore.getState().addToast({
      level: 'error',
      source: 'save-project',
      message: `Save failed: ${err instanceof Error ? err.message : String(err)}`,
    })
    return false
  }

  // Update project path and name
  const name = filePath.split('/').pop()?.replace('.glitch', '') ?? 'Untitled'
  projectStore.setProjectPath(filePath)
  projectStore.setProjectName(name)
  useUndoStore.getState().clearDirty()

  // Delete autosave after successful save
  deleteAutosave()

  // Track as recent project
  addRecentProject({ path: filePath, name, lastModified: Date.now() })

  return true
}

// UE.4: Save As — open native dialog, write to the new path, rebind the project.
// If the write fails, the store is NOT rebound (Cmd+S still targets the original file).
export async function saveProjectAs(): Promise<boolean> {
  if (!window.entropic) return false

  const projectStore = useProjectStore.getState()
  const currentPath = projectStore.projectPath

  // Suggest a default filename: current name + " copy"
  const currentName = projectStore.projectName ?? 'Untitled'
  const defaultName = `${currentName} copy.glitch`

  const newPath = await window.entropic.showSaveDialog({
    filters: GLITCH_FILTERS,
    defaultPath: defaultName,
  })
  if (!newPath) return false // user cancelled

  // Write to the new path first — do NOT rebind until write succeeds
  const json = serializeProject()
  try {
    await window.entropic.writeFile(newPath, json)
  } catch (err) {
    console.error('[SaveAs] Write failed, keeping original binding:', err)
    useToastStore.getState().addToast({
      level: 'error',
      source: 'save-as',
      message: `Save As failed: ${err instanceof Error ? err.message : String(err)}`,
    })
    // Return false — Cmd+S still targets the ORIGINAL file (store not mutated)
    return false
  }

  // Write succeeded — now rebind
  const name = newPath.split('/').pop()?.replace('.glitch', '') ?? 'Untitled'
  projectStore.setProjectPath(newPath)
  projectStore.setProjectName(name)
  useUndoStore.getState().clearDirty()

  // Delete autosave for the old path
  if (currentPath) {
    try {
      const dir = currentPath.substring(0, currentPath.lastIndexOf('/'))
      await window.entropic.deleteFile(`${dir}/.autosave.glitch`)
    } catch {
      // Best-effort cleanup
    }
  }

  // Track as recent project
  addRecentProject({ path: newPath, name, lastModified: Date.now() })

  return true
}

export async function loadProject(
  filePath?: string,
  onHydrated?: () => void | Promise<void>,
): Promise<boolean> {
  if (!window.entropic) return false

  // Check if dirty and prompt
  if (useUndoStore.getState().isDirty) {
    // In a real app, show a confirmation dialog.
    // For now, proceed — the plan says to prompt but
    // that requires a custom dialog component (deferred).
  }

  let path: string | undefined = filePath
  if (!path) {
    const selected = await window.entropic.showOpenDialog({
      filters: GLITCH_FILTERS,
    })
    if (!selected) return false // user cancelled
    path = selected
  }

  try {
    const json = await window.entropic.readFile(path)
    const data = JSON.parse(json)

    const structureCheck = validateProjectStructure(data)
    if (!structureCheck.valid) {
      console.error('[Project] Project file rejected:', structureCheck.reason)
      useToastStore.getState().addToast({
        level: 'error',
        source: 'project-load',
        message: `Project file rejected: ${structureCheck.reason}`,
      })
      return false
    }

    if (!validateProject(data)) {
      console.error('[Project] Invalid project file — validation failed')
      useToastStore.getState().addToast({
        level: 'error',
        source: 'project-load',
        message: 'Invalid project file — schema validation failed',
      })
      return false
    }

    hydrateStores(data as Project & { masterEffectChain?: EffectInstance[]; drumRack?: DrumRack; operators?: Operator[]; automationLanes?: Record<string, AutomationLane[]>; midiMappings?: MIDIPersistData; deviceGroups?: Record<string, { name: string; effectIds: string[]; mix: number; isEnabled: boolean }> })

    const name = path.split('/').pop()?.replace('.glitch', '') ?? 'Untitled'
    useProjectStore.getState().setProjectPath(path)
    useProjectStore.getState().setProjectName(name)

    // Track as recent project.
    addRecentProject({ path: path, name, lastModified: Date.now() })

    // Post-hydrate: App.tsx wires preview refs/totalFrames from the hydrated
    // project. See PLAY-010 — preview state is shadow-duplicated in App.tsx
    // refs and must be initialized after every hydrate path.
    if (onHydrated) await onHydrated()

    return true
  } catch (err) {
    console.error('[Project] Failed to load project:', err)
    return false
  }
}

export function newProject(): void {
  useProjectStore.getState().resetProject()
  useTimelineStore.getState().reset()
  useUndoStore.getState().clear()
  usePerformanceStore.getState().resetDrumRack()
  useOperatorStore.getState().resetOperators()
  useAutomationStore.getState().resetAutomation()
  useMIDIStore.getState().resetMIDI()
  // B2: clear ALL per-track samplers (the old no-arg removeSampler() became a
  // silent no-op when the store went track-keyed — samplers must not survive New Project)
  // B4.1: also clear racks.
  // B6.3: also clear frameBanks (must not survive New Project — same reason).
  useInstrumentsStore.setState({ instruments: {}, racks: {}, frameBanks: {} })
}

export function startAutosave(): void {
  if (autosaveTimer !== null) return

  autosaveTimer = setInterval(async () => {
    const undoStore = useUndoStore.getState()
    if (!undoStore.isDirty) return
    if (!window.entropic) return

    try {
      const projectStore = useProjectStore.getState()
      let autosavePath: string

      if (projectStore.projectPath) {
        // Save alongside project file
        const dir = projectStore.projectPath.substring(0, projectStore.projectPath.lastIndexOf('/'))
        autosavePath = `${dir}/.autosave.glitch`
      } else {
        // Fallback to userData directory
        const userDataDir = await window.entropic.getAppPath('userData')
        autosavePath = `${userDataDir}/.autosave.glitch`
      }

      const json = serializeProject()
      await window.entropic.writeFile(autosavePath, json)
    } catch (err) {
      console.warn('[Autosave] failed:', err)
    }
  }, AUTOSAVE_INTERVAL_MS)
}

export function stopAutosave(): void {
  if (autosaveTimer !== null) {
    clearInterval(autosaveTimer)
    autosaveTimer = null
  }
}

async function deleteAutosave(): Promise<void> {
  if (!window.entropic) return

  try {
    const projectStore = useProjectStore.getState()
    if (projectStore.projectPath) {
      const dir = projectStore.projectPath.substring(0, projectStore.projectPath.lastIndexOf('/'))
      await window.entropic.deleteFile(`${dir}/.autosave.glitch`)
    }
    const userDataDir = await window.entropic.getAppPath('userData')
    await window.entropic.deleteFile(`${userDataDir}/.autosave.glitch`)
  } catch {
    // Ignore — autosave files may not exist
  }
}

export async function restoreAutosave(
  path: string,
  onHydrated?: () => void | Promise<void>,
): Promise<boolean> {
  if (!window.entropic) return false

  try {
    const json = await window.entropic.readFile(path)
    const data = JSON.parse(json)

    const structureCheck = validateProjectStructure(data)
    if (!structureCheck.valid) {
      console.error('[Autosave] Autosave file rejected:', structureCheck.reason)
      useToastStore.getState().addToast({
        level: 'error',
        source: 'project-load',
        message: `Autosave rejected: ${structureCheck.reason}`,
      })
      return false
    }

    if (!validateProject(data)) {
      console.error('[Autosave] Invalid autosave file — validation failed')
      useToastStore.getState().addToast({
        level: 'error',
        source: 'project-load',
        message: 'Autosave file failed schema validation',
      })
      return false
    }

    hydrateStores(data as Project & { masterEffectChain?: EffectInstance[]; drumRack?: DrumRack; operators?: Operator[]; automationLanes?: Record<string, AutomationLane[]>; midiMappings?: MIDIPersistData; deviceGroups?: Record<string, { name: string; effectIds: string[]; mix: number; isEnabled: boolean }> })

    // Delete autosave after successful restore
    try {
      await window.entropic.deleteFile(path)
    } catch {
      // Best-effort cleanup
    }

    // PLAY-010 — preview state lives in App.tsx refs, not the project store,
    // so the hydrator can't populate it. Caller passes the init callback.
    if (onHydrated) await onHydrated()

    return true
  } catch (err) {
    console.error('[Autosave] Failed to restore:', err)
    return false
  }
}

// --- Recent projects ---

export async function loadRecentProjects(): Promise<RecentProject[]> {
  if (!window.entropic) return []
  try {
    const data = await window.entropic.readRecentProjects()
    if (!Array.isArray(data)) return []
    // Validate each entry has the required shape
    return data.filter(
      (entry): entry is RecentProject =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof entry.path === 'string' &&
        typeof entry.name === 'string' &&
        typeof entry.lastModified === 'number',
    )
  } catch {
    return []
  }
}

export async function addRecentProject(project: RecentProject): Promise<void> {
  if (!window.entropic) return
  try {
    const existing = await loadRecentProjects()
    // Remove any existing entry with the same path
    const filtered = existing.filter((p) => p.path !== project.path)
    // Add new entry at front
    filtered.unshift(project)
    // Sort by lastModified descending
    filtered.sort((a, b) => b.lastModified - a.lastModified)
    // Cap at MAX_RECENT_PROJECTS
    const capped = filtered.slice(0, MAX_RECENT_PROJECTS)
    await window.entropic.writeRecentProjects(capped)
  } catch {
    // Best-effort — don't break save flow
  }
}

/**
 * UE.5: Probe all asset paths (video/image) and audio clip paths in the loaded project
 * and return a list of missing items.  Called once on hydrate, before the user sees the
 * timeline.  The probe is a single batched pass — one `fileExists` call per distinct path.
 *
 * Returns an array of `{assetId, name, oldPath, kind}` entries for every path that does
 * not exist on disk.  An empty array means all assets are present → no dialog shown.
 */
export async function probeForMissingAssets(): Promise<
  { assetId: string; name: string; oldPath: string; kind: 'video' | 'image' | 'audio' }[]
> {
  if (!window.entropic) return []

  const projectStore = useProjectStore.getState()
  const timelineStore = useTimelineStore.getState()

  // Collect (assetId, path, kind, displayName) for every referenced path.
  // Using a Map to deduplicate by assetId (multiple clips can share one asset).
  const candidates = new Map<
    string,
    { assetId: string; name: string; oldPath: string; kind: 'video' | 'image' | 'audio' }
  >()

  // Asset registry (video / image)
  for (const asset of Object.values(projectStore.assets)) {
    if (!candidates.has(asset.id)) {
      const name = asset.path.split('/').pop() ?? asset.path
      const kind: 'video' | 'image' | 'audio' = asset.type === 'audio' ? 'audio' : asset.type
      candidates.set(asset.id, { assetId: asset.id, name, oldPath: asset.path, kind })
    }
  }

  // Audio clips (path stored directly on AudioClip, not via asset registry)
  for (const track of timelineStore.tracks) {
    if (track.type !== 'audio') continue
    const audioClips = (track as unknown as { audioClips?: { id: string; path: string }[] }).audioClips ?? []
    for (const clip of audioClips) {
      const syntheticId = `audio:${clip.path}`
      if (!candidates.has(syntheticId)) {
        const name = clip.path.split('/').pop() ?? clip.path
        candidates.set(syntheticId, { assetId: syntheticId, name, oldPath: clip.path, kind: 'audio' })
      }
    }
  }

  if (candidates.size === 0) return []

  // Single batched existence pass — one IPC call per path.
  const missing: { assetId: string; name: string; oldPath: string; kind: 'video' | 'image' | 'audio' }[] = []
  for (const entry of candidates.values()) {
    try {
      const exists = await window.entropic.fileExists(entry.oldPath)
      if (!exists) missing.push(entry)
    } catch {
      // If the IPC call itself fails (path denied), treat as missing.
      missing.push(entry)
    }
  }

  return missing
}

/**
 * UE.5: Mark a single asset's clips as missing (user clicked Skip).
 * Audio clips use the synthetic `audio:<oldPath>` id.
 */
export function markAssetMissing(assetId: string): void {
  const timelineStore = useTimelineStore.getState()

  if (assetId.startsWith('audio:')) {
    const oldPath = assetId.slice('audio:'.length)
    const tracks = timelineStore.tracks
    for (const track of tracks) {
      if (track.type !== 'audio') continue
      const audioClips = (track as unknown as { audioClips?: { id: string; path: string }[] }).audioClips ?? []
      for (const clip of audioClips) {
        if (clip.path === oldPath) {
          // Mark missing via relinkAudioClip with the same path but set missing=true
          // We use a direct setState since this is a persistence-correction, not an edit
          timelineStore.setAudioClipMissing(clip.id, true)
        }
      }
    }
  } else {
    // Video/image asset: mark all clips referencing this asset as missing
    timelineStore.setClipMissingByAssetId(assetId, true)
  }
}

/**
 * UE.5: Relink a single asset — update the store path so the next save persists
 * the new location, and clear the `missing` flag on all clips referencing the asset.
 */
export function relinkAsset(assetId: string, newPath: string): void {
  const projectStore = useProjectStore.getState()
  const timelineStore = useTimelineStore.getState()

  // Handle asset-registry entries (video/image)
  if (assetId.startsWith('audio:')) {
    // Audio clip pseudo-id: update all AudioClip entries with the old path
    const oldPath = assetId.slice('audio:'.length)
    const tracks = timelineStore.tracks
    for (const track of tracks) {
      if (track.type !== 'audio') continue
      const audioClips = (track as unknown as { audioClips?: { id: string; path: string; missing?: boolean }[] }).audioClips ?? []
      for (const clip of audioClips) {
        if (clip.path === oldPath) {
          timelineStore.relinkAudioClip(clip.id, newPath)
        }
      }
    }
  } else {
    // Video/image asset: update the asset registry entry
    const asset = projectStore.assets[assetId]
    if (asset) {
      projectStore.relinkAsset(assetId, newPath)
      // Clear missing flag on all Clip entries referencing this assetId
      timelineStore.clearClipMissingFlag(assetId)
    }
  }
}

// Export for testing
export { serializeProject, validateProject, hydrateStores, validateRackNode, validateRackPad }
