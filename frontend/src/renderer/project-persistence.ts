/**
 * Project persistence — save, load, new, autosave.
 * Standalone functions that orchestrate multiple stores.
 * Not a hook — callable from keyboard shortcuts and UI handlers.
 */
import type { Project, ProjectSettings, Timeline, Asset, EffectInstance, DrumRack, Operator, AutomationLane, MIDIPersistData, BlendMode } from '../shared/types'
import { normalizeTransform } from '../shared/types'
import { useProjectStore } from './stores/project'
import { useTimelineStore } from './stores/timeline'
import { useUndoStore } from './stores/undo'
import { usePerformanceStore } from './stores/performance'
import { useOperatorStore } from './stores/operators'
import { useAutomationStore } from './stores/automation'
import { useMIDIStore } from './stores/midi'
import { useToastStore } from './stores/toast'
import { useInstrumentsStore } from './stores/instruments'
import type { SamplerInstrumentV1 } from './components/instruments/types'
import { SAMPLER_SPEED_MIN, SAMPLER_SPEED_MAX } from './components/instruments/types'
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
      const major = Number.parseInt(obj.version.split('.')[0], 10)
      if (Number.isFinite(major) && major > PROJECT_VERSION_MAJOR) {
        return {
          valid: false,
          reason: `Project saved by a newer Creatrix version (v${major}). Update Creatrix to open it.`,
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
  const project: Project & { drumRack?: DrumRack; operators?: Operator[]; automationLanes?: Record<string, AutomationLane[]>; midiMappings?: MIDIPersistData; deviceGroups?: Record<string, { name: string; effectIds: string[]; mix: number; isEnabled: boolean }>; instruments?: Record<string, SamplerInstrumentV1> } = {
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

function hydrateStores(project: Project & { masterEffectChain?: EffectInstance[]; drumRack?: DrumRack; operators?: Operator[]; automationLanes?: Record<string, AutomationLane[]>; midiMappings?: MIDIPersistData; deviceGroups?: Record<string, { name: string; effectIds: string[]; mix: number; isEnabled: boolean }>; instruments?: Record<string, SamplerInstrumentV1> }): void {
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
  useInstrumentsStore.setState({ instruments: {} })

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
      if (track.opacity !== 1.0) useTimelineStore.getState().setTrackOpacity(addedTrackId, track.opacity)
      if (track.blendMode !== 'normal') useTimelineStore.getState().setTrackBlendMode(addedTrackId, track.blendMode)
      // Add video/text clips (migrate legacy transform format: {scale} → {scaleX, scaleY, ...})
      for (const clip of track.clips) {
        const migratedClip = clip.transform
          ? { ...clip, trackId: addedTrackId, transform: normalizeTransform(clip.transform as any) }
          : { ...clip, trackId: addedTrackId }
        useTimelineStore.getState().addClip(addedTrackId, migratedClip)
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
    const savedChain = sanitized.slice(0, LIMITS.MAX_EFFECTS_PER_CHAIN)
    if (savedChain.length < sanitized.length) {
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
  useInstrumentsStore.setState({ instruments: {} })
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

// Export for testing
export { serializeProject, validateProject, hydrateStores }
