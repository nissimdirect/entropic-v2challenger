/**
 * Project persistence — save, load, new, autosave.
 * Standalone functions that orchestrate multiple stores.
 * Not a hook — callable from keyboard shortcuts and UI handlers.
 */
import type { Project, ProjectSettings, Timeline, Asset, EffectInstance, DrumRack, Operator, AutomationLane, MIDIPersistData } from '../shared/types'
import { normalizeTransform } from '../shared/types'
import { useProjectStore } from './stores/project'
import { useTimelineStore } from './stores/timeline'
import { useUndoStore } from './stores/undo'
import { usePerformanceStore } from './stores/performance'
import { useOperatorStore } from './stores/operators'
import { useAutomationStore } from './stores/automation'
import { useMIDIStore } from './stores/midi'
import { useToastStore } from './stores/toast'
import { randomUUID } from './utils'

const GLITCH_FILTERS = [{ name: 'Entropic Project', extensions: ['glitch'] }]
const AUTOSAVE_INTERVAL_MS = 60_000
const PROJECT_VERSION = '2.0.0'
const PROJECT_VERSION_MAJOR = 2
const MAX_RECENT_PROJECTS = 20

// Project-file load hardening — defends against weaponized .glitch files.
// Project files are routinely shared (collab, presets, social posts), so the
// JSON.parse(readFile()) → validateProject path is an attacker-controlled boundary.
// Limits chosen to be far above any legitimate project's needs.
const MAX_JSON_DEPTH = 32
const MAX_KEYS_PER_NODE = 1024
const MAX_ARRAY_LENGTH = 10_000
const MAX_VERSION_STRING_LENGTH = 16
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

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
          reason: `Project saved by a newer Entropic version (v${major}). Update Entropic to open it.`,
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
        if (FORBIDDEN_KEYS.has(key)) {
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
  }

  const operatorStore = useOperatorStore.getState()
  const automationStore = useAutomationStore.getState()

  const midiStore = useMIDIStore.getState()

  const project: Project & { masterEffectChain?: EffectInstance[]; drumRack?: DrumRack; operators?: Operator[]; automationLanes?: Record<string, AutomationLane[]>; midiMappings?: MIDIPersistData; deviceGroups?: Record<string, { name: string; effectIds: string[]; mix: number; isEnabled: boolean }> } = {
    version: PROJECT_VERSION,
    id: randomUUID(),
    created: Date.now(),
    modified: Date.now(),
    author: '',
    settings: { ...defaultSettings(), resolution: projectStore.canvasResolution },
    assets: projectStore.assets,
    timeline,
    masterEffectChain: projectStore.effectChain,
    drumRack: performanceStore.drumRack,
    operators: operatorStore.operators,
    automationLanes: automationStore.lanes,
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

  // Settings validation
  const settings = obj.settings as Record<string, unknown>
  if (typeof settings !== 'object' || settings === null) return false
  if (!Array.isArray(settings.resolution) || settings.resolution.length !== 2) return false
  if (typeof settings.frameRate !== 'number') return false

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
    // Track type validation — accept video, performance, text
    if (t.type !== undefined && typeof t.type === 'string') {
      if (!['video', 'performance', 'text'].includes(t.type)) return false
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

  return true
}

function hydrateStores(project: Project & { masterEffectChain?: EffectInstance[]; drumRack?: DrumRack; operators?: Operator[]; automationLanes?: Record<string, AutomationLane[]>; midiMappings?: MIDIPersistData; deviceGroups?: Record<string, { name: string; effectIds: string[]; mix: number; isEnabled: boolean }> }): void {
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

  // Hydrate assets
  for (const asset of Object.values(project.assets)) {
    projectStore.addAsset(asset as Asset)
  }

  // Hydrate master effect chain
  if (Array.isArray(project.masterEffectChain)) {
    for (const effect of project.masterEffectChain) {
      projectStore.addEffect(effect as EffectInstance)
    }
  }

  // Hydrate device groups (metadata-only)
  if (project.deviceGroups && typeof project.deviceGroups === 'object') {
    useProjectStore.setState({ deviceGroups: project.deviceGroups })
  }

  // Hydrate timeline tracks
  for (const track of project.timeline.tracks) {
    const tls = useTimelineStore.getState()
    tls.addTrack(track.name, track.color, track.type === 'text' ? 'text' : undefined)
    // Re-read state after addTrack to get the new track
    const freshTracks = useTimelineStore.getState().tracks
    const addedTrack = freshTracks[freshTracks.length - 1]
    // Set track properties
    if (track.isMuted) useTimelineStore.getState().toggleMute(addedTrack.id)
    if (track.isSoloed) useTimelineStore.getState().toggleSolo(addedTrack.id)
    if (track.opacity !== 1.0) useTimelineStore.getState().setTrackOpacity(addedTrack.id, track.opacity)
    if (track.blendMode !== 'normal') useTimelineStore.getState().setTrackBlendMode(addedTrack.id, track.blendMode)
    // Add clips (migrate legacy transform format: {scale} → {scaleX, scaleY, ...})
    for (const clip of track.clips) {
      const migratedClip = clip.transform
        ? { ...clip, trackId: addedTrack.id, transform: normalizeTransform(clip.transform as any) }
        : { ...clip, trackId: addedTrack.id }
      useTimelineStore.getState().addClip(addedTrack.id, migratedClip)
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

  // Hydrate canvas resolution from project settings (backward compat: default 1920x1080)
  if (project.settings?.resolution && Array.isArray(project.settings.resolution) && project.settings.resolution.length === 2) {
    useProjectStore.getState().setCanvasResolution(project.settings.resolution[0], project.settings.resolution[1])
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

  const json = serializeProject()
  await window.entropic.writeFile(filePath, json)

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

    // Track as recent project
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
