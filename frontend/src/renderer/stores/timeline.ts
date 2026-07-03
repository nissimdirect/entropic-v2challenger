import { create } from 'zustand'
import type { Track, Clip, Marker, TextClipConfig, ClipTransform, AudioClip, EffectInstance, MatteNode, ProbeBinding, AutomationLane } from '../../shared/types'
import { AUDIO_LIMITS, clampGainDb, clampNonNegSec } from '../../shared/types'
import { LIMITS } from '../../shared/limits'
import { randomUUID } from '../utils'
import { undoable, useUndoStore } from './undo'
import { useToastStore } from './toast'
import { useAutomationStore } from './automation'
import { pruneEffectDependents, restoreEffectDependents } from './crossStoreCleanup'
import type { PruneSnapshot } from './crossStoreCleanup'
import { useInstrumentsStore } from './instruments'
import { parseTransformLanePath, formatTransformLanePath } from '../utils/transformLanes'

/**
 * D4/D5 helper: swap a leading `${oldId}.` prefix with `${newId}.` for any
 * oldId present in idMap. If no prefix matches, return paramPath unchanged
 * (e.g. mixer/project-targeted paths like `master.volume`).
 */
function rekeyPath(paramPath: string, idMap: Map<string, string>): string {
  for (const [oldId, newId] of idMap.entries()) {
    if (paramPath.startsWith(`${oldId}.`)) {
      return `${newId}.${paramPath.slice(oldId.length + 1)}`
    }
  }
  return paramPath
}

/**
 * moveClip bugfix: clip-transform automation lanes (paramPath
 * `clipTransform.<clipId>.<field>`, see utils/transformLanes.ts) store RAW
 * timeline-time AutomationPoints keyed to a clipId. Moving the clip must
 * shift those points by the same delta so the keyframes ride the footage.
 * Track-level effect lanes (any paramPath that doesn't parse as a transform
 * lane for THIS clipId) are left untouched. Scans every track's lane list
 * (canonical state lives in useAutomationStore, not the Track object) since
 * a clip-transform lane is keyed to the clip, not necessarily the clip's
 * current track.
 */
function shiftClipTransformLaneTimes(clipId: string, delta: number): void {
  if (delta === 0) return
  const current = useAutomationStore.getState().lanes
  let changed = false
  const next: typeof current = { ...current }
  for (const [trackId, trackLanes] of Object.entries(current)) {
    let laneChanged = false
    const newLanes = trackLanes.map((lane) => {
      const parsed = parseTransformLanePath(lane.paramPath)
      if (!parsed || parsed.clipId !== clipId) return lane
      laneChanged = true
      return { ...lane, points: lane.points.map((p) => ({ ...p, time: p.time + delta })) }
    })
    if (laneChanged) {
      next[trackId] = newLanes
      changed = true
    }
  }
  if (changed) useAutomationStore.setState({ lanes: next })
}

/**
 * splitClip helper: partition a clip's clip-transform lane keyframes at the
 * cut time. Keyframes strictly before `cutTime` stay on clipA's (original
 * clipId) lane; keyframes at/after `cutTime` move to a NEW lane keyed to
 * clipB's id (paramPath rekeyed `clipTransform.<clipBId>.<field>` via
 * formatTransformLanePath). Mirrors shiftClipTransformLaneTimes's
 * scan-all-tracks approach since a clip-transform lane is keyed to the clip,
 * not necessarily its current track.
 *
 * Returns an inverse closure that restores the PRE-split automation lanes
 * state byte-for-byte (deep-cloned before mutation) — split/merge undo must
 * be exact, not a re-derived merge of the partitioned points.
 */
function splitClipTransformLaneKeyframes(
  clipId: string,
  clipBId: string,
  cutTime: number,
): () => void {
  const before = useAutomationStore.getState().lanes
  const snapshot: Record<string, AutomationLane[]> = {}
  for (const [trackId, trackLanes] of Object.entries(before)) {
    snapshot[trackId] = trackLanes.map((l) => ({ ...l, points: l.points.map((p) => ({ ...p })) }))
  }

  let changed = false
  const next: Record<string, AutomationLane[]> = { ...before }
  for (const [trackId, trackLanes] of Object.entries(before)) {
    const newLanes: AutomationLane[] = []
    let laneListChanged = false
    for (const lane of trackLanes) {
      const parsed = parseTransformLanePath(lane.paramPath)
      if (!parsed || parsed.clipId !== clipId) {
        newLanes.push(lane)
        continue
      }
      const beforePts = lane.points.filter((p) => p.time < cutTime)
      const afterPts = lane.points.filter((p) => p.time >= cutTime)
      if (afterPts.length === 0) {
        // Nothing crosses the cut — lane stays on clipA untouched.
        newLanes.push(lane)
        continue
      }
      laneListChanged = true
      changed = true
      // clipA keeps the before-cut points (may be empty).
      newLanes.push({ ...lane, points: beforePts })
      // clipB gets a NEW lane (new id, rekeyed paramPath) with the after-cut points.
      newLanes.push({
        ...lane,
        id: randomUUID(),
        paramPath: formatTransformLanePath(clipBId, parsed.field),
        points: afterPts,
      })
    }
    if (laneListChanged) next[trackId] = newLanes
  }

  if (changed) useAutomationStore.setState({ lanes: next })

  return () => {
    useAutomationStore.setState({ lanes: snapshot })
  }
}

/**
 * T3 lock helpers. A clip is effectively locked when its own `locked` flag is
 * set OR when its containing track is locked (track lock cascades to every
 * clip). These read the passed `tracks` snapshot so callers can guard BEFORE
 * entering an `undoable` transaction — a guarded no-op must never create an
 * empty undo entry.
 */
function isClipEffectivelyLocked(tracks: Track[], clipId: string): boolean {
  for (const t of tracks) {
    if (t.clips.some((c) => c.id === clipId)) {
      const c = t.clips.find((cc) => cc.id === clipId)!
      return c.locked === true || t.locked === true
    }
  }
  return false
}

function isTrackLocked(tracks: Track[], trackId: string): boolean {
  const t = tracks.find((tt) => tt.id === trackId)
  return t?.locked === true
}

/** Emit the standard "locked" no-op toast (rate-limited by shared source). */
function emitLockedToast(message: string): void {
  useToastStore.getState().addToast({ level: 'info', message, source: 'timeline-lock' })
}

interface TimelineState {
  // State
  tracks: Track[]
  playheadTime: number
  duration: number
  markers: Marker[]
  loopRegion: { in: number; out: number } | null
  isLooping: boolean
  zoom: number
  scrollX: number
  selectedTrackId: string | null
  /** @deprecated Use selectedClipIds instead. Kept for backward compat — returns first selected or null. */
  selectedClipId: string | null
  selectedClipIds: string[]
  speedDialog: { clipId: string; anchor: { x: number; y: number } } | null

  // Track actions
  addTrack: (name: string, color: string, type?: 'video' | 'text' | 'performance') => string | undefined
  /** P6.8 (I1): create the single inspector track (max 1 per project, v1). Returns
   * the new track id, or the existing inspector track's id if one already exists. */
  addInspectorTrack: (name?: string, color?: string) => string | undefined
  /** M.1 (Master-Out Bus PRD): create the single permanent Master track (exactly
   * 1 per project, ALWAYS — same "exactly one" idempotent contract as
   * addInspectorTrack). Returns the new track id, or the existing Master
   * track's id if one already exists. UNLIKE addTrack/addInspectorTrack, this
   * is never blocked by LIMITS.MAX_TRACKS — the migration contract
   * ("absent -> create") must never reject even when a loaded project is
   * already at the track cap. */
  addMasterTrack: (name?: string, color?: string) => string | undefined
  /** P6.8 (I1): add a probe binding to the inspector track (max 16 per track).
   * Returns the probeId on success, or undefined (with a toast) when at the cap,
   * the track is missing/not-inspector, or the same effect+param is already bound. */
  addProbeBinding: (trackId: string, binding: Omit<ProbeBinding, 'probeId'>) => string | undefined
  /** P6.8 (I1): remove a probe binding by probeId from its inspector track. */
  removeProbeBinding: (trackId: string, probeId: string) => void
  removeTrack: (id: string) => void
  reorderTrack: (fromIdx: number, toIdx: number) => void
  // P2.2a (slice 3c): setTrackOpacity / setTrackBlendMode removed — compositing
  // is now a terminal CompositeEffect on the chain, edited via the effect's params.
  /** Functional update of one track's effectChain. Pure store write (NOT undoable here —
   * callers in project.ts wrap with `undoable` so cross-store undo stays atomic).
   * Unknown trackId → no-op (map matches nothing). (design D2) */
  updateTrackEffectChain: (trackId: string, updater: (chain: EffectInstance[]) => EffectInstance[]) => void
  toggleMute: (id: string) => void
  toggleSolo: (id: string) => void
  renameTrack: (id: string, name: string) => void

  // Text track actions
  addTextTrack: (name: string, color: string) => void
  addTextClip: (trackId: string, config: TextClipConfig, position: number, duration: number) => void
  updateTextConfig: (clipId: string, config: Partial<TextClipConfig>) => void

  // Clip actions
  addClip: (trackId: string, clip: Clip) => void
  removeClip: (clipId: string) => void
  moveClip: (clipId: string, newTrackId: string, newPosition: number) => void
  trimClipIn: (clipId: string, newInPoint: number) => void
  trimClipOut: (clipId: string, newOutPoint: number) => void
  splitClip: (clipId: string, time: number) => void
  /** Ripple delete: remove clip and shift all later clips on the SAME track left by the deleted clip's duration.
   *  One undo entry. Does NOT affect other tracks. */
  rippleRemoveClip: (clipId: string) => void
  /** Ripple trim out: shorten a clip's out-point by delta and shift all later clips on the SAME track left.
   *  newOutPoint must be > clip.inPoint. One undo entry. */
  rippleTrimClipOut: (clipId: string, newOutPoint: number) => void
  /**
   * T2 SLIP: shift which part of the SOURCE plays without moving the clip's
   * timeline position or duration. `sourceDelta` is in SOURCE seconds (same
   * unit as inPoint/outPoint) and is added to BOTH inPoint and outPoint, so the
   * source window slides while its width (outPoint - inPoint) — and therefore
   * the clip's timeline duration — stays constant. The delta is clamped to the
   * available source range: inPoint stays >= 0 and, when `sourceLength` is
   * provided (source total seconds), outPoint stays <= sourceLength. Non-finite
   * deltas are ignored. One undo entry per call; a clamped-to-zero delta is a
   * no-op (no undo entry). Locked clips no-op with a toast. */
  slipClip: (clipId: string, sourceDelta: number, sourceLength?: number) => void
  /**
   * T2 SLIDE: move a clip's timeline position by `positionDelta` (timeline
   * seconds) while its two immediate neighbors on the SAME track auto-adjust to
   * keep the arrangement gapless and the total track duration stable — the clip
   * ending exactly at this clip's start (prev) has its out-point extended/
   * shrunk, and the clip starting exactly at this clip's end (next) has its
   * in-point + position shifted. The clip's own in/out and duration are
   * unchanged. The delta is clamped so neither neighbor can invert (each keeps
   * duration >= MIN_CLIP_SEC), next.inPoint stays >= 0, and — when
   * `prevSourceLength` is provided — prev.outPoint stays <= prevSourceLength.
   * A slide requires BOTH neighbors adjacent; if either is missing the call is a
   * no-op (nothing to absorb the shift without a gap). Non-finite deltas are
   * ignored. One undo entry per call; a clamped-to-zero delta is a no-op.
   * Locked clips (or clips on a locked track) no-op with a toast. */
  slideClip: (clipId: string, positionDelta: number, prevSourceLength?: number) => void
  setClipSpeed: (clipId: string, speed: number) => void
  openSpeedDialog: (clipId: string, anchor: { x: number; y: number }) => void
  closeSpeedDialog: () => void
  setClipTransform: (clipId: string, transform: ClipTransform) => void
  setClipOpacity: (clipId: string, opacity: number) => void
  duplicateClip: (clipId: string) => void
  /**
   * MK.9 — Copy the committed mask region to a NEW track above the source.
   * Duplicates the clip onto a fresh (empty-chain) video track inserted directly
   * above the source track, carrying a COPY of the committed matte node and
   * maskMode='deleteOutside' (only the masked region shows). The ORIGINAL is
   * untouched. One undo entry (restores tracks + selection deep-equal on undo).
   * No-op + toast if there is no committed selection on `clipId`.
   * Refuses + toast if the composite-layer cap (MAX_COMPOSITE_LAYERS) is reached.
   */
  copyRegionToTrack: (clipId: string) => void
  /**
   * MK.9 — Cut the committed mask region to a NEW track above the source.
   * Same as copyRegionToTrack PLUS the ORIGINAL gains the inverse matte
   * (maskMode='deleteInside') so the region visually "lifts" to its own layer,
   * leaving a hole below. One undo entry restoring BOTH clips deep-equal on undo.
   * Same no-op / cap-refusal guards as copyRegionToTrack.
   */
  cutRegionToTrack: (clipId: string) => void
  /**
   * MK.12 — Split a clip into subject + background twins by its ai_matte node.
   * One click, ONE undo entry: a new track is inserted directly above the
   * source carrying the SUBJECT twin (same source, deep copy of the ai_matte
   * node, maskMode='deleteOutside' → only the subject shows). The ORIGINAL
   * becomes the BACKGROUND twin: it keeps its matte node and gains the
   * INVERTED consumption (maskMode='deleteInside' → hole where the subject is)
   * — complementary refs over the same matte, zero new engine machinery
   * (SPEC §4.2). Tracks are named `<clip> · subject` / `<clip> · background`.
   * No-op + toast when the clip has no ai_matte node; refuses + toast at the
   * track / composite-layer caps (MK.9 guard parity).
   */
  splitByMatte: (clipId: string) => void
  toggleClipEnabled: (clipId: string) => void
  reverseClip: (clipId: string) => void
  /** UE.7: Set or clear clip label. Empty string clears it (falls back to asset name). Clamped to MAX_CLIP_NAME_LENGTH. */
  renameClip: (clipId: string, name: string) => void
  /** UE.7: Set or clear clip body tint. Pass undefined to reset to default. */
  setClipColor: (clipId: string, color: string | undefined) => void
  /** T3: Toggle a clip's lock. Undoable. A locked clip's mutation guards no-op
   *  (no undo entry). No-op when the value is unchanged. */
  setClipLock: (clipId: string, locked: boolean) => void
  /** T3: Toggle a track's lock. Undoable. A locked track guards all its clips,
   *  rejects reorder/drops onto it, and is skipped by shifting ripple ops.
   *  No-op when the value is unchanged. */
  setTrackLock: (trackId: string, locked: boolean) => void

  // Track actions
  duplicateTrack: (trackId: string) => void

  // Playhead
  setPlayheadTime: (t: number) => void
  setDuration: (d: number) => void

  // Markers
  addMarker: (time: number, label: string, color: string) => void
  removeMarker: (id: string) => void
  moveMarker: (id: string, newTime: number) => void
  renameMarker: (id: string, label: string) => void

  // Loop
  setLoopRegion: (inTime: number, outTime: number) => void
  clearLoopRegion: () => void
  setLooping: (on: boolean) => void
  toggleLooping: () => void

  // View
  setZoom: (pxPerSec: number) => void
  setScrollX: (px: number) => void

  // Selection
  selectTrack: (id: string | null) => void
  selectClip: (id: string | null) => void
  toggleClipSelection: (clipId: string) => void
  rangeSelectClips: (fromId: string, toId: string) => void
  clearSelection: () => void
  deleteSelectedClips: () => void
  selectAllClips: () => void
  invertSelection: () => void
  selectClipsByTrack: (trackId: string) => void

  // Audio track actions
  addAudioTrack: (name?: string, color?: string) => string | undefined
  addAudioClip: (trackId: string, clip: Omit<AudioClip, 'id' | 'trackId'>) => string | undefined
  removeAudioClip: (clipId: string) => void
  removeAudioClips: (clipIds: string[]) => void
  setClipGain: (clipId: string, gainDb: number) => void
  setClipFade: (clipId: string, fadeInSec: number, fadeOutSec: number) => void
  setTrackGain: (trackId: string, gainDb: number) => void
  moveAudioClip: (clipId: string, newStartSec: number) => void
  trimAudioClip: (clipId: string, newInSec: number, newOutSec: number) => void
  toggleAudioClipMute: (clipId: string) => void
  getActiveAudioClipsAtTime: (time: number) => { track: Track; clip: AudioClip }[]
  /** UE.5: Update the path of an audio clip after media relink and clear its missing flag. */
  relinkAudioClip: (clipId: string, newPath: string) => void
  /** UE.5: Clear the missing flag on all Clip entries (video/image) referencing assetId. */
  clearClipMissingFlag: (assetId: string) => void
  /** UE.5: Set or clear the missing flag on a specific audio clip by id. */
  setAudioClipMissing: (clipId: string, missing: boolean) => void
  /** UE.5: Set or clear the missing flag on all Clips referencing a given assetId. */
  setClipMissingByAssetId: (assetId: string, missing: boolean) => void

  // --- MK.4: Preview marquee interaction state ---
  /**
   * In-progress drag rect (DOM-space, px). Null when no drag is active.
   * NOT persisted — purely ephemeral UI state cleared on commit/cancel.
   * Owned by: timeline store (preview-interaction state collocated with clip state).
   */
  marqueeInProgress: { x1: number; y1: number; x2: number; y2: number } | null
  /**
   * Committed selection MatteNode (frame-coord params, kind rect|ellipse).
   * Present after a successful drag commit; consumed by delete/fill ops.
   * Null = no active selection.
   */
  committedMaskSelection: { nodeId: string; clipId: string } | null
  /** Currently active preview tool mode. Null = normal (select/transform). */
  previewToolMode: 'marquee-rect' | 'marquee-ellipse' | 'lasso-freehand' | 'lasso-polygon' | 'wand' | 'eyedropper' | null

  // Preview tool actions
  setPreviewToolMode: (mode: 'marquee-rect' | 'marquee-ellipse' | 'lasso-freehand' | 'lasso-polygon' | 'wand' | 'eyedropper' | null) => void
  /** MK.6: wand tolerance (RGB Euclidean distance, [0, 441.67]). Default 30. */
  wandTolerance: number
  setWandTolerance: (tol: number) => void
  setMarqueeInProgress: (rect: { x1: number; y1: number; x2: number; y2: number } | null) => void
  clearMaskSelection: () => void

  // --- MK.4: Matte node CRUD (undoable) ---
  addMatteNode: (clipId: string, node: MatteNode) => void
  removeMatteNode: (clipId: string, nodeId: string) => void
  updateMatteNode: (clipId: string, nodeId: string, patch: Partial<MatteNode>) => void
  /** MK.4: Set clip maskMode + optional fill color. Undoable. */
  setClipMaskMode: (clipId: string, mode: 'deleteInside' | 'deleteOutside' | 'fill', fillColor?: string) => void
  // --- MK.7: Matte stack reorder + enable/disable (undoable) ---
  /** Move a node one position toward index 0 (up) or away from 0 (down). No-op at boundaries. */
  reorderMatteNode: (clipId: string, nodeId: string, direction: 'up' | 'down') => void
  /** Toggle the `enabled` field of a single matte node. */
  toggleMatteNode: (clipId: string, nodeId: string) => void

  // Helpers
  getActiveClipsAtTime: (time: number) => { track: Track; clip: Clip }[]
  getTimelineDuration: () => number

  // Reset
  reset: () => void
}

function makeEmptyTrack(name: string, color: string, id?: string, type: Track['type'] = 'video'): Track {
  const base: Track = {
    id: id ?? randomUUID(),
    type,
    name,
    color,
    isMuted: false,
    isSoloed: false,
    clips: [],
    effectChain: [],
    automationLanes: [],
  }
  if (type === 'audio') {
    base.gainDb = 0
    base.audioClips = []
  }
  if (type === 'inspector') {
    // P6.8 (I1): inspector tracks carry probe bindings, no clips.
    base.probeBindings = []
  }
  return base
}

/** Count audio tracks currently active. */
function countAudioTracks(tracks: Track[]): number {
  return tracks.filter((t) => t.type === 'audio').length
}

/**
 * MK.9 — pre-flight composite-layer count for the cut/copy-to-track cap.
 *
 * Mirrors what the backend `_handle_render_composite` would have to composite:
 * every visual clip on a video/text track plus every performance track is one
 * potential RGBA layer. Audio tracks contribute no composite layer. This is a
 * conservative upper bound (total visual clips, not just the ones live at the
 * current playhead) — deliberately so: the guard must refuse BEFORE any reachable
 * frame would exceed the backend INJ-3 cap, not only the current frame.
 */
function countCompositeLayers(tracks: Track[]): number {
  let n = 0
  for (const t of tracks) {
    if (t.type === 'video' || t.type === 'text') {
      n += t.clips.length
    } else if (t.type === 'performance') {
      n += 1
    }
  }
  return n
}

/** Find the audio clip by id across all audio tracks. Returns null if not found. */
function findAudioClip(tracks: Track[], clipId: string): { track: Track; clip: AudioClip } | null {
  for (const t of tracks) {
    if (t.type !== 'audio' || !t.audioClips) continue
    const clip = t.audioClips.find((c) => c.id === clipId)
    if (clip) return { track: t, clip }
  }
  return null
}

/** Normalize an AudioClip's numeric fields with full trust-boundary clamps. */
function normalizeAudioClip(clip: Omit<AudioClip, 'id' | 'trackId'>, id: string, trackId: string): AudioClip {
  const inSec = clampNonNegSec(clip.inSec)
  const outSec = Math.max(inSec + AUDIO_LIMITS.MIN_CLIP_SEC, clampNonNegSec(clip.outSec))
  const clipDur = outSec - inSec
  const fadeIn = Math.max(0, Math.min(clipDur, clampNonNegSec(clip.fadeInSec)))
  const fadeOut = Math.max(0, Math.min(clipDur - fadeIn, clampNonNegSec(clip.fadeOutSec)))
  return {
    id,
    trackId,
    path: String(clip.path ?? ''),
    inSec,
    outSec,
    startSec: clampNonNegSec(clip.startSec),
    gainDb: clampGainDb(clip.gainDb),
    fadeInSec: fadeIn,
    fadeOutSec: fadeOut,
    muted: Boolean(clip.muted),
    missing: clip.missing ? true : undefined,
  }
}

/**
 * MK.9 — shared implementation for copyRegionToTrack / cutRegionToTrack.
 *
 * Pre-flight (NO state change, NO undo entry):
 *   1. There must be a committedMaskSelection on `clipId` and the referenced
 *      MatteNode must still exist in the clip's maskStack — else no-op + toast.
 *   2. The composite-layer count must be < MAX_COMPOSITE_LAYERS (a cut/copy adds
 *      exactly one layer) — else REFUSE + toast.
 *
 * The whole operation is ONE undoable() entry: forward captures the composed
 * post-state; inverse restores the captured pre-state tracks + selection
 * verbatim, guaranteeing deep-equal on undo (the cut/copy is reversible in a
 * single HistoryPanel row).
 */
function cutOrCopyRegionToTrack(
  get: () => TimelineState,
  set: (partial: Partial<TimelineState>) => void,
  clipId: string,
  mode: 'cut' | 'copy',
): void {
  const sel = get().committedMaskSelection
  const toast = useToastStore.getState()

  // Guard 1: must have a committed selection on THIS clip.
  if (!sel || sel.clipId !== clipId) {
    toast.addToast({
      level: 'warning',
      message: `${mode === 'cut' ? 'Cut' : 'Copy'} to new track: select a region first`,
      source: 'mk9-region-to-track',
    })
    return
  }

  // Locate the source clip + its track, and the committed node in its stack.
  let sourceClip: Clip | undefined
  let sourceTrackId: string | undefined
  let sourceTrackIdx = -1
  const prevTracks = get().tracks
  for (let i = 0; i < prevTracks.length; i++) {
    const c = prevTracks[i].clips.find((cl) => cl.id === clipId)
    if (c) { sourceClip = c; sourceTrackId = prevTracks[i].id; sourceTrackIdx = i; break }
  }
  const sourceNode = sourceClip?.maskStack?.find((n) => n.id === sel.nodeId)

  // Guard 1b: stale selection (clip or node gone) → no-op + toast.
  if (!sourceClip || !sourceTrackId || sourceTrackIdx === -1 || !sourceNode) {
    toast.addToast({
      level: 'warning',
      message: `${mode === 'cut' ? 'Cut' : 'Copy'} to new track: selection is no longer valid`,
      source: 'mk9-region-to-track',
    })
    return
  }

  // Guard 2: layer cap — a cut/copy adds exactly ONE composite layer.
  if (countCompositeLayers(prevTracks) >= LIMITS.MAX_COMPOSITE_LAYERS) {
    toast.addToast({
      level: 'warning',
      message: `Composite layer limit (${LIMITS.MAX_COMPOSITE_LAYERS}) reached — cannot ${mode === 'cut' ? 'cut' : 'copy'} to a new track`,
      source: 'mk9-region-to-track',
    })
    return
  }

  // Guard 3: respect the track cap too (addTrack's own contract). Compose, not bypass.
  if (prevTracks.length >= LIMITS.MAX_TRACKS) {
    toast.addToast({
      level: 'warning',
      message: `Track limit (${LIMITS.MAX_TRACKS}) reached`,
      source: 'mk9-region-to-track',
    })
    return
  }

  // Pre-generate all IDs OUTSIDE the undoable (deterministic redo — undo.ts contract).
  const newTrackId = randomUUID()
  const newClipId = randomUUID()
  const newNodeId = randomUUID()

  // Build the duplicated matte node — a DEEP copy (own params object) so the
  // top-layer matte and the original's inverse matte never alias one node object
  // (the documented aliasing failure mode; the deep-equal undo test catches it).
  const dupNode: MatteNode = {
    ...sourceNode,
    id: newNodeId,
    params: { ...sourceNode.params },
  }

  // The lifted duplicate clip: same media/timing, carrying only the dup matte,
  // maskMode = deleteOutside (only the region shows). Fresh id, on the new track.
  const dupClip: Clip = {
    ...sourceClip,
    id: newClipId,
    trackId: newTrackId,
    maskStack: [dupNode],
    maskMode: 'deleteOutside',
    // The lifted clip carries no inherited fill color from a prior fill op.
    maskFillColor: undefined,
    ...(sourceClip.transform ? { transform: { ...sourceClip.transform } } : {}),
    ...(sourceClip.textConfig ? { textConfig: { ...sourceClip.textConfig } } : {}),
  }

  // New track: EMPTY chain (independent processing is the whole point — asserted
  // failure mode: must NOT inherit the source chain). Inserted directly ABOVE the
  // source (lower array index = topmost UI row = top of composite, App.tsx:1029).
  const newTrack = makeEmptyTrack(`${sourceClip.name ?? 'Region'}`, prevTracks[sourceTrackIdx].color, newTrackId, 'video')
  newTrack.clips = [dupClip]

  // Capture FULL pre-state for the inverse (deep-equal restore). Snapshot the
  // selection too — forward clears it (the region has been consumed).
  const capturedTracks = prevTracks
  const capturedSelection = get().committedMaskSelection
  const capturedSelClipId = get().selectedClipId
  const capturedSelClipIds = get().selectedClipIds

  undoable(
    mode === 'cut' ? 'Cut region to new track' : 'Copy region to new track',
    () => {
      // Insert the new track directly above the source track.
      const cur = [...get().tracks]
      const insertAt = cur.findIndex((t) => t.id === sourceTrackId)
      const idx = insertAt === -1 ? cur.length : insertAt
      cur.splice(idx, 0, newTrack)

      // CUT only: the original gains the inverse matte (deleteInside → hole).
      // COPY: original is untouched.
      const tracks = mode === 'cut'
        ? cur.map((t) =>
            t.id === sourceTrackId
              ? {
                  ...t,
                  clips: t.clips.map((c) =>
                    c.id === clipId ? { ...c, maskMode: 'deleteInside' as const } : c,
                  ),
                }
              : t,
          )
        : cur

      set({
        tracks,
        duration: recalcDuration(tracks),
        // The region has lifted — clear the now-consumed selection.
        committedMaskSelection: null,
      })
    },
    () => {
      // Restore the captured pre-state verbatim → deep-equal pre-state.
      set({
        tracks: capturedTracks,
        duration: recalcDuration(capturedTracks),
        committedMaskSelection: capturedSelection,
        selectedClipId: capturedSelClipId,
        selectedClipIds: capturedSelClipIds,
      })
    },
  )
}

/**
 * MK.12 — shared implementation for splitByMatte.
 *
 * Mirrors cutOrCopyRegionToTrack's shape (pre-flight guards → pre-generated
 * ids → ONE undoable() with a verbatim pre-state inverse) but keys on the
 * clip's ai_matte node instead of a committed marquee selection:
 *
 *   SUBJECT twin — NEW track `<clip> · subject` inserted directly above the
 *   source, carrying a copy of the clip with maskStack=[deep copy of the
 *   ai_matte node] and maskMode='deleteOutside' (only the subject shows).
 *
 *   BACKGROUND twin — the ORIGINAL clip in place: keeps its full maskStack
 *   (device mask_refs by node id keep resolving) and gains
 *   maskMode='deleteInside' — the INVERTED consumption of the same matte (a
 *   subject-shaped hole). The original track is renamed `<clip> · background`.
 *
 * Complementary refs over one matte source = the packet's "maskRef on one,
 * inverted on the other", expressed through the existing MK.4/MK.9 clip
 * machinery (zero new engine machinery — SPEC §4.2).
 */
function splitByMatteImpl(
  get: () => TimelineState,
  set: (partial: Partial<TimelineState>) => void,
  clipId: string,
): void {
  const toast = useToastStore.getState()

  // Locate the source clip + its track.
  let sourceClip: Clip | undefined
  let sourceTrackId: string | undefined
  let sourceTrackIdx = -1
  const prevTracks = get().tracks
  for (let i = 0; i < prevTracks.length; i++) {
    const c = prevTracks[i].clips.find((cl) => cl.id === clipId)
    if (c) { sourceClip = c; sourceTrackId = prevTracks[i].id; sourceTrackIdx = i; break }
  }
  if (!sourceClip || !sourceTrackId || sourceTrackIdx === -1) {
    toast.addToast({
      level: 'warning',
      message: 'Split by matte: clip not found',
      source: 'mk12-split-by-matte',
    })
    return
  }

  // Guard 1: the clip must carry an ai_matte node (the LAST one wins — the
  // most recently generated matte).
  const aiNode = [...(sourceClip.maskStack ?? [])].reverse().find((n) => n.kind === 'ai_matte')
  if (!aiNode) {
    toast.addToast({
      level: 'warning',
      message: 'Split by matte: generate an AI matte on this clip first',
      source: 'mk12-split-by-matte',
    })
    return
  }

  // Guard 2: layer cap — the split adds exactly ONE composite layer.
  if (countCompositeLayers(prevTracks) >= LIMITS.MAX_COMPOSITE_LAYERS) {
    toast.addToast({
      level: 'warning',
      message: `Composite layer limit (${LIMITS.MAX_COMPOSITE_LAYERS}) reached — cannot split by matte`,
      source: 'mk12-split-by-matte',
    })
    return
  }

  // Guard 3: track cap (addTrack's own contract — compose, not bypass).
  if (prevTracks.length >= LIMITS.MAX_TRACKS) {
    toast.addToast({
      level: 'warning',
      message: `Track limit (${LIMITS.MAX_TRACKS}) reached`,
      source: 'mk12-split-by-matte',
    })
    return
  }

  // Pre-generate ids OUTSIDE the undoable (deterministic redo — undo.ts contract).
  const subjectTrackId = randomUUID()
  const subjectClipId = randomUUID()
  const subjectNodeId = randomUUID()

  const baseName = sourceClip.name ?? 'Clip'

  // Deep copy of the ai_matte node for the subject twin (own params object —
  // the MK.9 aliasing failure mode; deep-equal undo test catches it).
  const subjectNode: MatteNode = {
    ...aiNode,
    id: subjectNodeId,
    params: { ...aiNode.params },
  }

  // SUBJECT twin clip: same media/timing, only the matte copy, deleteOutside.
  const subjectClip: Clip = {
    ...sourceClip,
    id: subjectClipId,
    trackId: subjectTrackId,
    name: `${baseName} · subject`,
    maskStack: [subjectNode],
    maskMode: 'deleteOutside',
    maskFillColor: undefined,
    ...(sourceClip.transform ? { transform: { ...sourceClip.transform } } : {}),
    ...(sourceClip.textConfig ? { textConfig: { ...sourceClip.textConfig } } : {}),
  }

  // New track: EMPTY chain (independent processing is the whole point).
  const subjectTrack = makeEmptyTrack(
    `${baseName} · subject`,
    prevTracks[sourceTrackIdx].color,
    subjectTrackId,
    'video',
  )
  subjectTrack.clips = [subjectClip]

  // Capture FULL pre-state for the inverse (deep-equal restore).
  const capturedTracks = prevTracks
  const capturedSelClipId = get().selectedClipId
  const capturedSelClipIds = get().selectedClipIds

  undoable(
    'Split by matte',
    () => {
      const cur = [...get().tracks]
      const insertAt = cur.findIndex((t) => t.id === sourceTrackId)
      const idx = insertAt === -1 ? cur.length : insertAt
      cur.splice(idx, 0, subjectTrack)

      // BACKGROUND twin: the original clip gains the inverted consumption
      // (deleteInside) and the original track is renamed.
      const tracks = cur.map((t) =>
        t.id === sourceTrackId
          ? {
              ...t,
              name: `${baseName} · background`,
              clips: t.clips.map((c) =>
                c.id === clipId
                  ? { ...c, name: `${baseName} · background`, maskMode: 'deleteInside' as const }
                  : c,
              ),
            }
          : t,
      )

      set({ tracks, duration: recalcDuration(tracks) })
    },
    () => {
      // Restore the captured pre-state verbatim → deep-equal pre-state.
      set({
        tracks: capturedTracks,
        duration: recalcDuration(capturedTracks),
        selectedClipId: capturedSelClipId,
        selectedClipIds: capturedSelClipIds,
      })
    },
  )
}

function defaultTextConfig(): TextClipConfig {
  return {
    text: 'Text',
    fontFamily: 'Helvetica',
    fontSize: 48,
    color: '#ffffff',
    position: [960, 540],
    alignment: 'center',
    opacity: 1.0,
    strokeWidth: 0,
    strokeColor: '#000000',
    shadowOffset: [0, 0],
    shadowColor: '#00000080',
    animation: 'none',
    animationDuration: 1.0,
  }
}

function recalcDuration(tracks: Track[]): number {
  let max = 0
  for (const track of tracks) {
    for (const clip of track.clips) {
      const end = clip.position + clip.duration
      if (end > max) max = end
    }
    if (track.type === 'audio' && track.audioClips) {
      for (const clip of track.audioClips) {
        const end = clip.startSec + (clip.outSec - clip.inSec)
        if (end > max) max = end
      }
    }
  }
  return max
}

const INITIAL_STATE = {
  tracks: [] as Track[],
  playheadTime: 0,
  duration: 0,
  markers: [] as Marker[],
  loopRegion: null as { in: number; out: number } | null,
  isLooping: false,
  zoom: 50,
  scrollX: 0,
  selectedTrackId: null as string | null,
  selectedClipId: null as string | null,
  selectedClipIds: [] as string[],
  speedDialog: null as { clipId: string; anchor: { x: number; y: number } } | null,
  // MK.4: preview interaction state
  marqueeInProgress: null as { x1: number; y1: number; x2: number; y2: number } | null,
  committedMaskSelection: null as { nodeId: string; clipId: string } | null,
  previewToolMode: null as 'marquee-rect' | 'marquee-ellipse' | 'lasso-freehand' | 'lasso-polygon' | 'wand' | 'eyedropper' | null,
  // MK.6: wand tolerance state
  wandTolerance: 30,
}

/** Get all clips in track order (top track first, then by position within track). */
function getAllClipsInOrder(tracks: Track[]): Clip[] {
  const result: Clip[] = []
  for (const track of tracks) {
    const sorted = [...track.clips].sort((a, b) => a.position - b.position)
    result.push(...sorted)
  }
  return result
}

export const useTimelineStore = create<TimelineState>((set, get) => ({
  ...INITIAL_STATE,

  // --- Track actions ---

  addTrack: (name, color, type) => {
    if (get().tracks.length >= LIMITS.MAX_TRACKS) {
      useToastStore.getState().addToast({ level: 'warning', message: `Track limit (${LIMITS.MAX_TRACKS}) reached`, source: 'timeline' })
      return undefined
    }
    const trackId = randomUUID()
    // D1: capture prior selectedTrackId for undo inverse
    const prevSelectedTrackId = get().selectedTrackId

    undoable(
      'Add track',
      () => {
        const track = makeEmptyTrack(name, color, trackId, type ?? 'video')
        set({ tracks: [...get().tracks, track] })
        // D1: auto-select the new track when none was selected
        if (!get().selectedTrackId) {
          set({ selectedTrackId: trackId })
        }
      },
      () => {
        const tracks = get().tracks.filter((t) => t.id !== trackId)
        set({ tracks, duration: recalcDuration(tracks), selectedTrackId: prevSelectedTrackId })
      },
    )
    return trackId
  },

  // --- Inspector track actions (P6.8 / I1) ---

  addInspectorTrack: (name, color) => {
    // v1 simplification: exactly one inspector track per project. A second
    // request is a no-op that returns the existing track's id (idempotent).
    const existing = get().tracks.find((t) => t.type === 'inspector')
    if (existing) {
      useTimelineStore.getState().selectTrack(existing.id)
      return existing.id
    }
    if (get().tracks.length >= LIMITS.MAX_TRACKS) {
      useToastStore.getState().addToast({ level: 'warning', message: `Track limit (${LIMITS.MAX_TRACKS}) reached`, source: 'timeline' })
      return undefined
    }
    const trackId = randomUUID()
    const prevSelectedTrackId = get().selectedTrackId
    undoable(
      'Add inspector track',
      () => {
        const track = makeEmptyTrack(name ?? 'Inspector', color ?? '#5fd7a8', trackId, 'inspector')
        set({ tracks: [...get().tracks, track] })
        if (!get().selectedTrackId) set({ selectedTrackId: trackId })
      },
      () => {
        const tracks = get().tracks.filter((t) => t.id !== trackId)
        set({ tracks, duration: recalcDuration(tracks), selectedTrackId: prevSelectedTrackId })
      },
    )
    return trackId
  },

  // --- Master track actions (M.1 — Master-Out Bus PRD) ---

  addMasterTrack: (name, color) => {
    // Exactly one Master track per project, ALWAYS — idempotent (mirrors
    // addInspectorTrack's "exactly one" precedent). A second request is a
    // no-op that returns the existing track's id. Deliberately NOT capped by
    // LIMITS.MAX_TRACKS (unlike addTrack/addInspectorTrack): the migration
    // contract is "absent -> create, NEVER reject" — a project already at the
    // track cap must still get its Master track injected on load.
    //
    // UNLIKE addTrack/addInspectorTrack, this is a DIRECT `set()`, NOT wrapped
    // in `undoable()`. Master is never user-created (no "Add Master" UI
    // control exists — it's permanent/non-deletable, PRD design #1) and is
    // ONLY ever called from bootstrap (newProject) or migration (hydrate).
    // Both of those must leave the project in a CLEAN (not dirty, empty undo
    // stack) state — mirrors the existing T3 track-lock hydrate precedent
    // ("Direct setState ... so hydration never pollutes the undo stack").
    // Going through `undoable()` here would mark a just-opened/just-created
    // project as having unsaved changes purely from its own bootstrap.
    const existing = get().tracks.find((t) => t.type === 'master')
    if (existing) {
      return existing.id
    }
    const trackId = randomUUID()
    const track = makeEmptyTrack(name ?? 'Master', color ?? '#e8b923', trackId, 'master')
    set({ tracks: [...get().tracks, track] })
    return trackId
  },

  addProbeBinding: (trackId, binding) => {
    const track = get().tracks.find((t) => t.id === trackId)
    if (!track || track.type !== 'inspector') return undefined
    const bindings = track.probeBindings ?? []
    // Dedup: one probe per effect+param. Re-adding the same target is a no-op
    // (returns the existing probeId) so a double-drop doesn't create a phantom.
    const dup = bindings.find((b) => b.effectId === binding.effectId && b.paramPath === binding.paramPath)
    if (dup) return dup.probeId
    if (bindings.length >= LIMITS.MAX_PROBES_PER_TRACK) {
      useToastStore.getState().addToast({
        level: 'warning',
        message: `Probe limit (${LIMITS.MAX_PROBES_PER_TRACK}) reached on inspector track`,
        source: 'inspector-probes',
      })
      return undefined
    }
    // Deterministic probeId. CRITICAL: it MUST equal the key the backend's
    // render-time recording site writes to so live values actually populate this
    // probe's history. P6.7 records post-modulation lane outputs under
    // `{effectId}.{param}:lane_output` (zmq_server.py probe site 4 — DO-NOT-TOUCH),
    // so the binding registers under that exact key. The backend
    // `probe_register` is idempotent on it, so a mount-after-reload reuses the
    // same registry slot.
    const probeId = `${binding.effectId}.${binding.paramPath}:lane_output`
    const newBinding: ProbeBinding = { probeId, ...binding }
    undoable(
      'Add probe',
      () => set({ tracks: get().tracks.map((t) => (t.id === trackId ? { ...t, probeBindings: [...(t.probeBindings ?? []), newBinding] } : t)) }),
      () => set({ tracks: get().tracks.map((t) => (t.id === trackId ? { ...t, probeBindings: (t.probeBindings ?? []).filter((b) => b.probeId !== probeId) } : t)) }),
    )
    return probeId
  },

  removeProbeBinding: (trackId, probeId) => {
    const track = get().tracks.find((t) => t.id === trackId)
    if (!track || track.type !== 'inspector') return
    const removed = (track.probeBindings ?? []).find((b) => b.probeId === probeId)
    if (!removed) return
    undoable(
      'Remove probe',
      () => set({ tracks: get().tracks.map((t) => (t.id === trackId ? { ...t, probeBindings: (t.probeBindings ?? []).filter((b) => b.probeId !== probeId) } : t)) }),
      () => set({ tracks: get().tracks.map((t) => (t.id === trackId ? { ...t, probeBindings: [...(t.probeBindings ?? []), removed] } : t)) }),
    )
  },

  // --- Text track actions ---

  addTextTrack: (name, color) => {
    if (get().tracks.length >= LIMITS.MAX_TRACKS) {
      useToastStore.getState().addToast({ level: 'warning', message: `Track limit (${LIMITS.MAX_TRACKS}) reached`, source: 'timeline' })
      return
    }
    const trackId = randomUUID()

    undoable(
      'Add text track',
      () => {
        const track = makeEmptyTrack(name, color, trackId, 'text')
        set({ tracks: [...get().tracks, track] })
      },
      () => {
        const tracks = get().tracks.filter((t) => t.id !== trackId)
        set({ tracks, duration: recalcDuration(tracks) })
      },
    )
  },

  addTextClip: (trackId, config, position, duration) => {
    const track = get().tracks.find((t) => t.id === trackId)
    if (!track || track.type !== 'text') return
    if (track.clips.length >= LIMITS.MAX_CLIPS_PER_TRACK) {
      useToastStore.getState().addToast({ level: 'warning', message: `Clip limit (${LIMITS.MAX_CLIPS_PER_TRACK}) reached`, source: 'timeline' })
      return
    }
    const clipId = randomUUID()
    const newClip: Clip = {
      id: clipId,
      assetId: '',
      trackId,
      position,
      duration,
      inPoint: 0,
      outPoint: duration,
      speed: 1.0,
      textConfig: { ...defaultTextConfig(), ...config },
    }

    undoable(
      'Add text clip',
      () => {
        const tracks = get().tracks.map((t) =>
          t.id === trackId ? { ...t, clips: [...t.clips, newClip] } : t,
        )
        set({ tracks, duration: recalcDuration(tracks) })
      },
      () => {
        const tracks = get().tracks.map((t) =>
          t.id === trackId ? { ...t, clips: t.clips.filter((c) => c.id !== clipId) } : t,
        )
        set({ tracks, duration: recalcDuration(tracks) })
      },
    )
  },

  updateTextConfig: (clipId, config) => {
    let oldConfig: TextClipConfig | undefined
    for (const track of get().tracks) {
      const clip = track.clips.find((c) => c.id === clipId)
      if (clip?.textConfig) {
        oldConfig = { ...clip.textConfig }
        break
      }
    }
    if (!oldConfig) return

    undoable(
      'Update text',
      () => set({
        tracks: get().tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) =>
            c.id === clipId && c.textConfig ? { ...c, textConfig: { ...c.textConfig, ...config } } : c,
          ),
        })),
      }),
      () => set({
        tracks: get().tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) =>
            c.id === clipId ? { ...c, textConfig: oldConfig } : c,
          ),
        })),
      }),
    )
  },

  removeTrack: (id) => {
    const track = get().tracks.find((t) => t.id === id)
    if (!track) return
    // Structural invariant: the Master (and Inspector) are singleton, bootstrap-
    // injected tracks that must never be deleted. M.2 made the Master selectable,
    // so the native "Delete Selected Track" menu can now target it — guard here
    // (the trust boundary) rather than only in the UI. (redteam MEDIUM, M.2.)
    if (track.type === 'master' || track.type === 'inspector') {
      useToastStore.getState().addToast({
        level: 'info',
        message: `The ${track.type === 'master' ? 'Master' : 'Inspector'} track can't be deleted.`,
        source: 'timeline-master-guard',
      })
      return
    }
    // Capture full track for restoration
    const removedTrack = { ...track, clips: [...track.clips], effectChain: [...track.effectChain], automationLanes: [...track.automationLanes] }
    const prevId = (() => {
      const idx = get().tracks.findIndex((t) => t.id === id)
      return idx > 0 ? get().tracks[idx - 1].id : null
    })()

    // Closure var: populated by pruneEffectDependents in forward, consumed by inverse. (D3)
    let pruneSnap: PruneSnapshot | undefined

    undoable(
      `Remove track "${track.name}"`,
      () => {
        const state = get()
        const tracks = state.tracks.filter((t) => t.id !== id)
        const selectedTrackId = state.selectedTrackId === id ? null : state.selectedTrackId
        const trackClipIds = new Set(track.clips.map((c) => c.id))
        const selectedClipIds = state.selectedClipIds.filter((cid) => !trackClipIds.has(cid))
        const selectedClipId = selectedClipIds[0] ?? null
        set({ tracks, selectedTrackId, selectedClipId, selectedClipIds, duration: recalcDuration(tracks) })
        // D3: prune all cross-store dependents for this track's effect chain + its lane bucket
        pruneSnap = pruneEffectDependents(
          removedTrack.effectChain.map((e) => e.id),
          { dropTrackLanes: id },
        )
        // #10 audit fix: remove per-track instrument state that would otherwise leak.
        // Neither removeFrameBank nor removeGranulator was called on track delete;
        // both are no-ops when the track has no instrument (safe to call unconditionally).
        useInstrumentsStore.getState().removeFrameBank(id)
        useInstrumentsStore.getState().removeGranulator(id)
      },
      () => {
        const tracks = [...get().tracks]
        const insertIdx = prevId !== null ? tracks.findIndex((t) => t.id === prevId) + 1 : 0
        tracks.splice(insertIdx, 0, removedTrack)
        set({ tracks, duration: recalcDuration(tracks) })
        // D3: restore all cross-store state from snapshot
        if (pruneSnap) restoreEffectDependents(pruneSnap)
      },
    )
  },

  reorderTrack: (fromIdx, toIdx) => {
    const tracks = get().tracks
    if (fromIdx < 0 || fromIdx >= tracks.length) return
    if (toIdx < 0 || toIdx >= tracks.length) return
    if (fromIdx === toIdx) return
    // T3: a locked track cannot be reordered, and a locked track's slot rejects
    // being displaced by a reorder onto it. Guard BEFORE the undoable (no-op, no
    // empty undo entry).
    if (tracks[fromIdx].locked === true || tracks[toIdx].locked === true) {
      emitLockedToast('Track is locked')
      return
    }
    const oldOrder = tracks.map((t) => t.id)

    undoable(
      'Reorder tracks',
      () => {
        const current = [...get().tracks]
        const [moved] = current.splice(fromIdx, 1)
        current.splice(toIdx, 0, moved)
        set({ tracks: current })
      },
      () => {
        const current = get().tracks
        const restored = oldOrder
          .map((id) => current.find((t) => t.id === id))
          .filter((t): t is Track => t !== undefined)
        set({ tracks: restored })
      },
    )
  },

  // Epic 01: per-track effect chain primitive. Plain set (not undoable) —
  // callers in project.ts wrap with `undoable` so cross-store undo is atomic.
  // Unknown trackId → no-op. (design D2)
  //
  // P2.2a (slice 3c): setTrackOpacity / setTrackBlendMode removed. Track-level
  // opacity/blend is now a terminal CompositeEffect on this chain; edit it via the
  // effect's params (updateParam) instead of dedicated track setters.
  updateTrackEffectChain: (trackId, updater) =>
    set((state) => ({
      tracks: state.tracks.map((t) =>
        t.id === trackId ? { ...t, effectChain: updater(t.effectChain) } : t,
      ),
    })),

  toggleMute: (id) => {
    const track = get().tracks.find((t) => t.id === id)
    if (!track) return
    const wasMuted = track.isMuted

    undoable(
      `${wasMuted ? 'Unmute' : 'Mute'} track`,
      () => set({ tracks: get().tracks.map((t) => (t.id === id ? { ...t, isMuted: !wasMuted } : t)) }),
      () => set({ tracks: get().tracks.map((t) => (t.id === id ? { ...t, isMuted: wasMuted } : t)) }),
    )
  },

  toggleSolo: (id) => {
    const track = get().tracks.find((t) => t.id === id)
    if (!track) return
    const wasSoloed = track.isSoloed

    undoable(
      `${wasSoloed ? 'Unsolo' : 'Solo'} track`,
      () => set({ tracks: get().tracks.map((t) => (t.id === id ? { ...t, isSoloed: !wasSoloed } : t)) }),
      () => set({ tracks: get().tracks.map((t) => (t.id === id ? { ...t, isSoloed: wasSoloed } : t)) }),
    )
  },

  renameTrack: (id, name) => {
    const track = get().tracks.find((t) => t.id === id)
    if (!track) return
    const oldName = track.name

    undoable(
      `Rename track`,
      () => set({ tracks: get().tracks.map((t) => (t.id === id ? { ...t, name } : t)) }),
      () => set({ tracks: get().tracks.map((t) => (t.id === id ? { ...t, name: oldName } : t)) }),
    )
  },

  // --- Clip actions ---

  addClip: (trackId, clip) => {
    const track = get().tracks.find((t) => t.id === trackId)
    // T3: a locked track rejects drops (new clips) onto it. Guard before the
    // undoable. NOTE: persistence hydrate restores clips BEFORE re-applying the
    // track lock, so loading a locked track's saved clips is never blocked.
    if (track?.locked === true) {
      emitLockedToast('Track is locked')
      return
    }
    if (track && track.clips.length >= LIMITS.MAX_CLIPS_PER_TRACK) {
      useToastStore.getState().addToast({ level: 'warning', message: `Clip limit (${LIMITS.MAX_CLIPS_PER_TRACK}) reached`, source: 'timeline' })
      return
    }
    const newClip = { ...clip, trackId }

    undoable(
      'Add clip',
      () => {
        const tracks = get().tracks.map((t) =>
          t.id === trackId ? { ...t, clips: [...t.clips, newClip] } : t,
        )
        set({ tracks, duration: recalcDuration(tracks) })
      },
      () => {
        const tracks = get().tracks.map((t) =>
          t.id === trackId ? { ...t, clips: t.clips.filter((c) => c.id !== clip.id) } : t,
        )
        set({ tracks, duration: recalcDuration(tracks) })
      },
    )
  },

  removeClip: (clipId) => {
    // T3: locked clip (or clip on a locked track) cannot be deleted.
    if (isClipEffectivelyLocked(get().tracks, clipId)) {
      emitLockedToast('Clip is locked')
      return
    }
    // Find the clip and its track for restoration
    let removedClip: Clip | null = null
    let removedFromTrackId: string | null = null
    for (const track of get().tracks) {
      const clip = track.clips.find((c) => c.id === clipId)
      if (clip) {
        removedClip = { ...clip }
        removedFromTrackId = track.id
        break
      }
    }
    if (!removedClip || !removedFromTrackId) return

    undoable(
      'Remove clip',
      () => {
        const state = get()
        const tracks = state.tracks.map((t) => ({
          ...t,
          clips: t.clips.filter((c) => c.id !== clipId),
        }))
        const selectedClipIds = state.selectedClipIds.filter((id) => id !== clipId)
        const selectedClipId = selectedClipIds[0] ?? null
        const speedDialog = state.speedDialog?.clipId === clipId ? null : state.speedDialog
        set({ tracks, selectedClipId, selectedClipIds, speedDialog, duration: recalcDuration(tracks) })
      },
      () => {
        const tracks = get().tracks.map((t) =>
          t.id === removedFromTrackId ? { ...t, clips: [...t.clips, removedClip!] } : t,
        )
        set({ tracks, duration: recalcDuration(tracks) })
      },
    )
  },

  moveClip: (clipId, newTrackId, newPosition) => {
    // Capture old state for undo
    let oldClip: Clip | null = null
    for (const track of get().tracks) {
      const clip = track.clips.find((c) => c.id === clipId)
      if (clip) {
        oldClip = { ...clip }
        break
      }
    }
    if (!oldClip) return
    // T3: a locked clip (or clip on a locked track) cannot be moved, and a
    // locked TARGET track rejects the drop. Guard before the undoable.
    if (isClipEffectivelyLocked(get().tracks, clipId) || isTrackLocked(get().tracks, newTrackId)) {
      emitLockedToast('Clip is locked')
      return
    }
    const oldTrackId = oldClip.trackId
    const oldPosition = oldClip.position

    // Overlap snap: don't let the moved clip occupy the same time range as
    // any other clip on the target track. If newPosition would overlap, snap
    // to the closest free position (either right after the overlapping clip
    // or right before it, whichever is closer to the requested newPosition).
    const targetTrack = get().tracks.find((t) => t.id === newTrackId)
    if (targetTrack) {
      const myDuration = oldClip.duration
      const siblings = targetTrack.clips
        .filter((c) => c.id !== clipId)
        .map((c) => ({ start: c.position, end: c.position + c.duration }))
        .sort((a, b) => a.start - b.start)

      const overlaps = (start: number) =>
        siblings.some((s) => start < s.end && start + myDuration > s.start)

      if (overlaps(newPosition)) {
        // Build the set of free intervals between siblings on the target track.
        const free: Array<[number, number]> = []
        let cursor = 0
        for (const s of siblings) {
          if (s.start - cursor >= myDuration) free.push([cursor, s.start])
          cursor = Math.max(cursor, s.end)
        }
        free.push([cursor, Infinity])

        // Pick the free interval whose nearest valid start is closest to
        // the requested newPosition. Tie-break by preferring the interval
        // that contains newPosition's neighborhood.
        let best = newPosition
        let bestDist = Infinity
        for (const [a, b] of free) {
          const cand = Math.max(a, Math.min(b - myDuration, newPosition))
          if (cand + myDuration > b) continue // doesn't fit
          const dist = Math.abs(cand - newPosition)
          if (dist < bestDist) {
            bestDist = dist
            best = cand
          }
        }
        newPosition = best
      }
    }

    // No-op fast path: if the snap produced the same track + position, skip
    // the undoable so a held drag-on-overlap doesn't spam undo entries.
    if (oldTrackId === newTrackId && Math.abs(oldPosition - newPosition) < 1e-6) {
      return
    }

    // Bugfix: clip-transform automation lanes are keyed to this clipId and
    // store raw timeline-time points — they must ride the clip. Compute the
    // delta once so undo/redo shift the keyframes symmetrically.
    const positionDelta = newPosition - oldPosition

    undoable(
      'Move clip',
      () => {
        let movedClip: Clip | null = null
        let tracks = get().tracks.map((t) => {
          const clip = t.clips.find((c) => c.id === clipId)
          if (clip) {
            movedClip = { ...clip, trackId: newTrackId, position: newPosition }
            return { ...t, clips: t.clips.filter((c) => c.id !== clipId) }
          }
          return t
        })
        if (!movedClip) return
        tracks = tracks.map((t) =>
          t.id === newTrackId ? { ...t, clips: [...t.clips, movedClip!] } : t,
        )
        set({ tracks, duration: recalcDuration(tracks) })
        shiftClipTransformLaneTimes(clipId, positionDelta)
      },
      () => {
        let movedBack: Clip | null = null
        let tracks = get().tracks.map((t) => {
          const clip = t.clips.find((c) => c.id === clipId)
          if (clip) {
            movedBack = { ...clip, trackId: oldTrackId, position: oldPosition }
            return { ...t, clips: t.clips.filter((c) => c.id !== clipId) }
          }
          return t
        })
        if (!movedBack) return
        tracks = tracks.map((t) =>
          t.id === oldTrackId ? { ...t, clips: [...t.clips, movedBack!] } : t,
        )
        set({ tracks, duration: recalcDuration(tracks) })
        shiftClipTransformLaneTimes(clipId, -positionDelta)
      },
    )
  },

  trimClipIn: (clipId, newInPoint) => {
    // T3: locked clip (or clip on a locked track) cannot be trimmed.
    if (isClipEffectivelyLocked(get().tracks, clipId)) {
      emitLockedToast('Clip is locked')
      return
    }
    // Find old clip state
    let oldClip: Clip | null = null
    for (const track of get().tracks) {
      const clip = track.clips.find((c) => c.id === clipId)
      if (clip) { oldClip = { ...clip }; break }
    }
    if (!oldClip || newInPoint < 0 || newInPoint >= oldClip.outPoint) return

    undoable(
      'Trim clip in',
      () => {
        const tracks = get().tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) => {
            if (c.id !== clipId) return c
            if (newInPoint < 0 || newInPoint >= c.outPoint) return c
            const delta = newInPoint - c.inPoint
            return { ...c, inPoint: newInPoint, position: c.position + delta, duration: c.duration - delta }
          }),
        }))
        set({ tracks, duration: recalcDuration(tracks) })
      },
      () => {
        const tracks = get().tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) =>
            c.id === clipId ? { ...c, inPoint: oldClip!.inPoint, position: oldClip!.position, duration: oldClip!.duration } : c,
          ),
        }))
        set({ tracks, duration: recalcDuration(tracks) })
      },
    )
  },

  trimClipOut: (clipId, newOutPoint) => {
    // T3: locked clip (or clip on a locked track) cannot be trimmed.
    if (isClipEffectivelyLocked(get().tracks, clipId)) {
      emitLockedToast('Clip is locked')
      return
    }
    let oldClip: Clip | null = null
    for (const track of get().tracks) {
      const clip = track.clips.find((c) => c.id === clipId)
      if (clip) { oldClip = { ...clip }; break }
    }
    if (!oldClip || newOutPoint <= oldClip.inPoint) return

    undoable(
      'Trim clip out',
      () => {
        const tracks = get().tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) => {
            if (c.id !== clipId) return c
            if (newOutPoint <= c.inPoint) return c
            return { ...c, outPoint: newOutPoint, duration: (newOutPoint - c.inPoint) / c.speed }
          }),
        }))
        set({ tracks, duration: recalcDuration(tracks) })
      },
      () => {
        const tracks = get().tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) =>
            c.id === clipId ? { ...c, outPoint: oldClip!.outPoint, duration: oldClip!.duration } : c,
          ),
        }))
        set({ tracks, duration: recalcDuration(tracks) })
      },
    )
  },

  rippleRemoveClip: (clipId) => {
    // T3: locked clip (or clip on a locked track) cannot be ripple-deleted. This
    // also satisfies "ripple ops skip a locked track": a locked track cascades
    // lock to all its clips, so the ripple never shifts a locked track's clips.
    if (isClipEffectivelyLocked(get().tracks, clipId)) {
      emitLockedToast('Clip is locked')
      return
    }
    // Find the clip to delete and its track
    let removedClip: Clip | null = null
    let removedTrackId: string | null = null
    for (const track of get().tracks) {
      const clip = track.clips.find((c) => c.id === clipId)
      if (clip) {
        removedClip = { ...clip }
        removedTrackId = track.id
        break
      }
    }
    if (!removedClip || !removedTrackId) return

    const deletedDuration = removedClip.duration
    const deletedPosition = removedClip.position
    const trackId = removedTrackId

    // Bugfix: clip-transform automation lanes are keyed to a clipId and store
    // raw timeline-time points — every later same-track sibling clip whose
    // position shifts must have its own clip-transform lane keyframes shift
    // by the SAME per-clip delta (mirrors moveClip's shiftClipTransformLaneTimes
    // pattern). Precompute per-sibling deltas up front so the actual position
    // change (which clamps at 0) and the lane shift always agree, in both
    // forward and undo.
    const siblingDeltas = new Map<string, number>()
    for (const t of get().tracks) {
      if (t.id !== trackId) continue
      for (const c of t.clips) {
        if (c.id === clipId) continue
        if (c.position > deletedPosition) {
          const newPos = Math.max(0, c.position - deletedDuration)
          siblingDeltas.set(c.id, newPos - c.position)
        }
      }
    }

    undoable(
      'Ripple delete',
      () => {
        const state = get()
        const tracks = state.tracks.map((t) => {
          if (t.id !== trackId) return t
          // Remove the deleted clip; shift all later clips left by deletedDuration
          const clips = t.clips
            .filter((c) => c.id !== clipId)
            .map((c) => {
              if (c.position > deletedPosition) {
                const newPos = Math.max(0, c.position - deletedDuration)
                return { ...c, position: newPos }
              }
              return c
            })
          return { ...t, clips }
        })
        const selectedClipIds = state.selectedClipIds.filter((id) => id !== clipId)
        const selectedClipId = selectedClipIds[0] ?? null
        const speedDialog = state.speedDialog?.clipId === clipId ? null : state.speedDialog
        set({ tracks, selectedClipId, selectedClipIds, speedDialog, duration: recalcDuration(tracks) })
        for (const [siblingId, delta] of siblingDeltas) {
          shiftClipTransformLaneTimes(siblingId, delta)
        }
      },
      () => {
        // Undo: restore original positions (shift later clips right, re-insert deleted clip)
        const tracks = get().tracks.map((t) => {
          if (t.id !== trackId) return t
          const clips = t.clips.map((c) => {
            if (c.position >= deletedPosition) {
              return { ...c, position: c.position + deletedDuration }
            }
            return c
          })
          return { ...t, clips: [...clips, removedClip!] }
        })
        set({ tracks, duration: recalcDuration(tracks) })
        for (const [siblingId, delta] of siblingDeltas) {
          shiftClipTransformLaneTimes(siblingId, -delta)
        }
      },
    )
  },

  rippleTrimClipOut: (clipId, newOutPoint) => {
    // T3: locked clip (or clip on a locked track) cannot be ripple-trimmed.
    if (isClipEffectivelyLocked(get().tracks, clipId)) {
      emitLockedToast('Clip is locked')
      return
    }
    let oldClip: Clip | null = null
    let clipTrackId: string | null = null
    for (const track of get().tracks) {
      const clip = track.clips.find((c) => c.id === clipId)
      if (clip) { oldClip = { ...clip }; clipTrackId = track.id; break }
    }
    if (!oldClip || !clipTrackId || newOutPoint <= oldClip.inPoint) return

    const delta = oldClip.outPoint - newOutPoint   // positive = trim shortens the clip
    if (delta <= 0) return                          // only ripple when shortening (out-point moves left)

    const clipPos = oldClip.position
    const trackId = clipTrackId
    const oldOut = oldClip.outPoint
    const oldDuration = oldClip.duration

    // Bugfix: same-track sibling clip-transform automation lanes must ride the
    // ripple shift. Precompute per-sibling deltas (position clamps at 0) so the
    // lane shift always agrees with the actual position change.
    const siblingDeltas = new Map<string, number>()
    for (const c of get().tracks.find((t) => t.id === trackId)?.clips ?? []) {
      if (c.id === clipId) continue
      if (c.position > clipPos) {
        const newPos = Math.max(0, c.position - delta)
        siblingDeltas.set(c.id, newPos - c.position)
      }
    }

    undoable(
      'Ripple trim',
      () => {
        const tracks = get().tracks.map((t) => {
          if (t.id !== trackId) return t
          const clips = t.clips.map((c) => {
            if (c.id === clipId) {
              return { ...c, outPoint: newOutPoint, duration: (newOutPoint - c.inPoint) / c.speed }
            }
            // Shift clips that start AFTER the trimmed clip's original end position
            if (c.position > clipPos) {
              const newPos = Math.max(0, c.position - delta)
              return { ...c, position: newPos }
            }
            return c
          })
          return { ...t, clips }
        })
        set({ tracks, duration: recalcDuration(tracks) })
        for (const [siblingId, siblingDelta] of siblingDeltas) {
          shiftClipTransformLaneTimes(siblingId, siblingDelta)
        }
      },
      () => {
        const tracks = get().tracks.map((t) => {
          if (t.id !== trackId) return t
          const clips = t.clips.map((c) => {
            if (c.id === clipId) {
              return { ...c, outPoint: oldOut, duration: oldDuration }
            }
            if (c.position > clipPos) {
              return { ...c, position: c.position + delta }
            }
            return c
          })
          return { ...t, clips }
        })
        set({ tracks, duration: recalcDuration(tracks) })
        for (const [siblingId, siblingDelta] of siblingDeltas) {
          shiftClipTransformLaneTimes(siblingId, -siblingDelta)
        }
      },
    )
  },

  slipClip: (clipId, sourceDelta, sourceLength) => {
    // T3: locked clip (or clip on a locked track) cannot be slipped.
    if (isClipEffectivelyLocked(get().tracks, clipId)) {
      emitLockedToast('Clip is locked')
      return
    }
    // Trust boundary: a non-finite gesture delta must never poison in/out.
    if (!Number.isFinite(sourceDelta)) return

    let oldClip: Clip | null = null
    for (const track of get().tracks) {
      const clip = track.clips.find((c) => c.id === clipId)
      if (clip) { oldClip = { ...clip }; break }
    }
    if (!oldClip) return

    // Clamp the shift to the available source range. The window width
    // (outPoint - inPoint) is preserved, so we only bound the delta:
    //   inPoint + delta >= 0                       → delta >= -inPoint
    //   outPoint + delta <= sourceLength (if given) → delta <= sourceLength - outPoint
    let delta = sourceDelta
    const lower = -oldClip.inPoint
    if (delta < lower) delta = lower
    if (sourceLength !== undefined && Number.isFinite(sourceLength)) {
      const upper = Math.max(0, sourceLength - oldClip.outPoint)
      // `upper` is relative to the current out-point; clamp only when the
      // source has a real ceiling (>= current out-point). If sourceLength is
      // somehow < outPoint (stale metadata), upper is 0 → no forward slip.
      if (delta > upper) delta = upper
    }

    // Clamped-to-zero slip → no-op, no undo entry.
    if (Math.abs(delta) < 1e-9) return

    const newIn = oldClip.inPoint + delta
    const newOut = oldClip.outPoint + delta
    const prevIn = oldClip.inPoint
    const prevOut = oldClip.outPoint

    undoable(
      'Slip clip',
      () => {
        const tracks = get().tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) =>
            c.id === clipId ? { ...c, inPoint: newIn, outPoint: newOut } : c,
          ),
        }))
        // position + duration are intentionally untouched; recalc is cheap and
        // keeps the code uniform with the other edit primitives.
        set({ tracks, duration: recalcDuration(tracks) })
      },
      () => {
        const tracks = get().tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) =>
            c.id === clipId ? { ...c, inPoint: prevIn, outPoint: prevOut } : c,
          ),
        }))
        set({ tracks, duration: recalcDuration(tracks) })
      },
    )
  },

  slideClip: (clipId, positionDelta, prevSourceLength) => {
    // T3: locked clip (or clip on a locked track) cannot be slid.
    if (isClipEffectivelyLocked(get().tracks, clipId)) {
      emitLockedToast('Clip is locked')
      return
    }
    if (!Number.isFinite(positionDelta)) return

    // Locate the clip AND its track (slide only touches same-track neighbors).
    let clip: Clip | null = null
    let trackId: string | null = null
    for (const t of get().tracks) {
      const c = t.clips.find((cc) => cc.id === clipId)
      if (c) { clip = { ...c }; trackId = t.id; break }
    }
    if (!clip || !trackId) return

    const track = get().tracks.find((t) => t.id === trackId)!
    const EPS = 1e-6
    const clipStart = clip.position
    const clipEnd = clip.position + clip.duration

    // prev = the clip ending exactly at this clip's start.
    // next = the clip starting exactly at this clip's end.
    const prev = track.clips.find(
      (c) => c.id !== clipId && Math.abs(c.position + c.duration - clipStart) < EPS,
    )
    const next = track.clips.find(
      (c) => c.id !== clipId && Math.abs(c.position - clipEnd) < EPS,
    )
    // A slide needs BOTH neighbors to absorb the shift without opening a gap.
    if (!prev || !next) return

    // Snapshot originals for undo + clamp math.
    const prevSnap = { ...prev }
    const nextSnap = { ...next }
    const clipSnap = { ...clip }

    // Clamp so neither neighbor inverts and source bounds hold.
    //  Δ > 0 (move right): prev EXTENDS (dur + Δ, out + Δ·prevSpeed ≤ src),
    //                      next SHRINKS (dur − Δ ≥ MIN).
    //  Δ < 0 (move left):  prev SHRINKS (dur + Δ ≥ MIN),
    //                      next EXTENDS (dur − Δ, in + Δ·nextSpeed ≥ 0).
    const MIN = AUDIO_LIMITS.MIN_CLIP_SEC
    // Upper bound (most positive Δ):
    let upper = nextSnap.duration - MIN            // next must keep MIN duration
    if (prevSourceLength !== undefined && Number.isFinite(prevSourceLength)) {
      const headroom = (prevSourceLength - prevSnap.outPoint) / (prevSnap.speed || 1)
      upper = Math.min(upper, Math.max(0, headroom))
    }
    // Lower bound (most negative Δ):
    let lower = -(prevSnap.duration - MIN)         // prev must keep MIN duration
    // next retreats its in-point by Δ·speed when Δ<0; keep in-point >= 0.
    const nextInFloor = -(nextSnap.inPoint) / (nextSnap.speed || 1)
    lower = Math.max(lower, nextInFloor)

    let delta = positionDelta
    if (delta > upper) delta = upper
    if (delta < lower) delta = lower
    if (Math.abs(delta) < 1e-9) return

    // Precompute new field values.
    const prevNewDur = prevSnap.duration + delta
    const prevNewOut = prevSnap.inPoint + prevNewDur * (prevSnap.speed || 1)
    const nextNewPos = nextSnap.position + delta
    const nextNewDur = nextSnap.duration - delta
    const nextNewIn = nextSnap.inPoint + delta * (nextSnap.speed || 1)
    const clipNewPos = clipSnap.position + delta

    undoable(
      'Slide clip',
      () => {
        const tracks = get().tracks.map((t) => {
          if (t.id !== trackId) return t
          const clips = t.clips.map((c) => {
            if (c.id === clipId) return { ...c, position: clipNewPos }
            if (c.id === prevSnap.id) return { ...c, duration: prevNewDur, outPoint: prevNewOut }
            if (c.id === nextSnap.id) return { ...c, position: nextNewPos, duration: nextNewDur, inPoint: nextNewIn }
            return c
          })
          return { ...t, clips }
        })
        set({ tracks, duration: recalcDuration(tracks) })
      },
      () => {
        const tracks = get().tracks.map((t) => {
          if (t.id !== trackId) return t
          const clips = t.clips.map((c) => {
            if (c.id === clipId) return { ...c, position: clipSnap.position }
            if (c.id === prevSnap.id) return { ...c, duration: prevSnap.duration, outPoint: prevSnap.outPoint }
            if (c.id === nextSnap.id) return { ...c, position: nextSnap.position, duration: nextSnap.duration, inPoint: nextSnap.inPoint }
            return c
          })
          return { ...t, clips }
        })
        set({ tracks, duration: recalcDuration(tracks) })
      },
    )
  },

  splitClip: (clipId, time) => {
    // T3: locked clip (or clip on a locked track) cannot be split.
    if (isClipEffectivelyLocked(get().tracks, clipId)) {
      emitLockedToast('Clip is locked')
      return
    }
    // Find the clip and validate split is possible
    let originalClip: Clip | null = null
    let trackId: string | null = null
    for (const track of get().tracks) {
      const clip = track.clips.find((c) => c.id === clipId)
      if (clip) {
        originalClip = { ...clip }
        trackId = track.id
        break
      }
    }
    if (!originalClip || !trackId) return
    const clipStart = originalClip.position
    const clipEnd = originalClip.position + originalClip.duration
    if (time <= clipStart || time >= clipEnd) return

    // Pre-generate clipB ID outside closure
    const clipBId = randomUUID()
    const splitOffset = time - clipStart
    const splitInSource = originalClip.inPoint + splitOffset * originalClip.speed
    // Captured across forward/inverse: forward sets it to the exact inverse
    // closure (pre-split lanes snapshot) that undo must call.
    let splitClipLaneUndo: (() => void) | null = null

    undoable(
      'Split clip',
      () => {
        const tracks = get().tracks.map((t) => {
          if (t.id !== trackId) return t
          const clipIdx = t.clips.findIndex((c) => c.id === clipId)
          if (clipIdx === -1) return t
          const clip = t.clips[clipIdx]

          const clipA: Clip = { ...clip, duration: splitOffset, outPoint: splitInSource }
          const clipB: Clip = { ...clip, id: clipBId, position: time, duration: clip.duration - splitOffset, inPoint: splitInSource }

          const clips = [...t.clips]
          clips.splice(clipIdx, 1, clipA, clipB)
          return { ...t, clips }
        })
        set({ tracks, duration: recalcDuration(tracks) })
        // Bugfix: partition clip-transform automation keyframes at the cut —
        // before-cut points stay on clipA's lane, at/after-cut points move to
        // a new clipB-keyed lane. Runs AFTER the position/tracks update so a
        // caller observing state mid-transaction never sees a lane pointing
        // at a clipB that doesn't exist yet.
        splitClipLaneUndo = splitClipTransformLaneKeyframes(clipId, clipBId, time)
      },
      () => {
        // Merge clipA and clipB back into original
        const tracks = get().tracks.map((t) => {
          if (t.id !== trackId) return t
          const clips = t.clips.filter((c) => c.id !== clipBId)
            .map((c) => (c.id === clipId ? originalClip! : c))
          return { ...t, clips }
        })
        set({ tracks, duration: recalcDuration(tracks) })
        // Restore the pre-split automation lanes state byte-for-byte.
        splitClipLaneUndo?.()
      },
    )
  },

  setClipSpeed: (clipId, speed) => {
    if (!Number.isFinite(speed)) return
    let oldSpeed = 1
    let oldDuration = 0
    let found = false
    for (const track of get().tracks) {
      const clip = track.clips.find((c) => c.id === clipId)
      if (clip) { oldSpeed = clip.speed; oldDuration = clip.duration; found = true; break }
    }
    if (!found) return
    // Store is the trust boundary: clamp both bounds regardless of caller (dialog, menubar, automation, scripting).
    const clamped = Math.max(0.1, Math.min(10, speed))
    // Timeline duration scales inversely with speed: 2x speed → half the timeline length
    const newDuration = oldDuration * (oldSpeed / clamped)

    undoable(
      'Set clip speed',
      () => {
        const tracks = get().tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) =>
            c.id === clipId ? { ...c, speed: clamped, duration: newDuration } : c,
          ),
        }))
        const nextDuration = recalcDuration(tracks)
        const nextPlayhead = Math.min(get().playheadTime, nextDuration)
        set({ tracks, duration: nextDuration, playheadTime: nextPlayhead })
      },
      () => {
        const tracks = get().tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) =>
            c.id === clipId ? { ...c, speed: oldSpeed, duration: oldDuration } : c,
          ),
        }))
        set({ tracks, duration: recalcDuration(tracks) })
      },
    )
  },

  openSpeedDialog: (clipId, anchor) => set({ speedDialog: { clipId, anchor } }),
  closeSpeedDialog: () => set({ speedDialog: null }),

  setClipTransform: (clipId, transform) => {
    // T3: transform is a spatial "move" — a locked clip (or clip on a locked
    // track) cannot be transformed.
    if (isClipEffectivelyLocked(get().tracks, clipId)) {
      emitLockedToast('Clip is locked')
      return
    }
    let oldTransform: ClipTransform | undefined
    for (const track of get().tracks) {
      const clip = track.clips.find((c) => c.id === clipId)
      if (clip) { oldTransform = clip.transform; break }
    }

    undoable(
      'Set clip transform',
      () => set({
        tracks: get().tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) => (c.id === clipId ? { ...c, transform } : c)),
        })),
      }),
      () => set({
        tracks: get().tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) => (c.id === clipId ? { ...c, transform: oldTransform } : c)),
        })),
      }),
    )
  },

  setClipOpacity: (clipId, opacity) => {
    let oldOpacity: number | undefined
    for (const track of get().tracks) {
      const clip = track.clips.find((c) => c.id === clipId)
      if (clip) { oldOpacity = clip.opacity; break }
    }
    const clamped = Math.max(0, Math.min(1, opacity))
    undoable(
      'Set clip opacity',
      () => set({
        tracks: get().tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) => (c.id === clipId ? { ...c, opacity: clamped } : c)),
        })),
      }),
      () => set({
        tracks: get().tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) => (c.id === clipId ? { ...c, opacity: oldOpacity } : c)),
        })),
      }),
    )
  },

  duplicateClip: (clipId) => {
    let sourceClip: Clip | undefined
    let sourceTrackId: string | undefined
    for (const track of get().tracks) {
      const c = track.clips.find((cl) => cl.id === clipId)
      if (c) { sourceClip = c; sourceTrackId = track.id; break }
    }
    if (!sourceClip || !sourceTrackId) return

    const newClip: Clip = {
      ...sourceClip,
      id: randomUUID(),
      position: sourceClip.position + 0.5,
      ...(sourceClip.transform ? { transform: { ...sourceClip.transform } } : {}),
      ...(sourceClip.textConfig ? { textConfig: { ...sourceClip.textConfig } } : {}),
    }

    undoable(
      'Duplicate clip',
      () => {
        const tracks = get().tracks.map((t) =>
          t.id === sourceTrackId ? { ...t, clips: [...t.clips, newClip] } : t,
        )
        set({ tracks, duration: recalcDuration(tracks) })
      },
      () => {
        const tracks = get().tracks.map((t) =>
          t.id === sourceTrackId ? { ...t, clips: t.clips.filter((c) => c.id !== newClip.id) } : t,
        )
        set({ tracks, duration: recalcDuration(tracks) })
      },
    )
  },

  // --- MK.9: Cut / copy mask region to a new track ---
  //
  // Both ops are composed from the SAME primitives MK.1–MK.8 already render
  // (addTrack-style empty-chain track, clip duplication, maskStack assignment,
  // maskMode) but are expressed as ONE undoable() transaction so the whole
  // operation is a single HistoryPanel row whose inverse restores the exact
  // pre-state (deep-equal). We do NOT modify addTrack/removeClip/moveClip — we
  // build on top: the forward composes their effect (a new track above + a
  // masked duplicate clip), the inverse restores the captured pre-state tracks
  // array verbatim (UE.2 precedent: compose, never mutate the contracts).
  //
  // `mode` selects copy vs cut: 'cut' additionally stamps the inverse matte
  // (deleteInside) onto the ORIGINAL so the region lifts and leaves a hole.
  copyRegionToTrack: (clipId) => {
    cutOrCopyRegionToTrack(get, set, clipId, 'copy')
  },

  cutRegionToTrack: (clipId) => {
    cutOrCopyRegionToTrack(get, set, clipId, 'cut')
  },

  // MK.12 — subject/background twin split keyed on the clip's ai_matte node.
  splitByMatte: (clipId) => {
    splitByMatteImpl(get, set, clipId)
  },

  toggleClipEnabled: (clipId) => {
    let oldEnabled: boolean | undefined
    for (const track of get().tracks) {
      const clip = track.clips.find((c) => c.id === clipId)
      if (clip) { oldEnabled = clip.isEnabled; break }
    }

    const newEnabled = oldEnabled === false ? undefined : false // undefined = enabled (default)

    undoable(
      'Toggle clip enabled',
      () => set({
        tracks: get().tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) => (c.id === clipId ? { ...c, isEnabled: newEnabled } : c)),
        })),
      }),
      () => set({
        tracks: get().tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) => (c.id === clipId ? { ...c, isEnabled: oldEnabled } : c)),
        })),
      }),
    )
  },

  reverseClip: (clipId) => {
    let oldReversed: boolean | undefined
    for (const track of get().tracks) {
      const clip = track.clips.find((c) => c.id === clipId)
      if (clip) { oldReversed = clip.reversed; break }
    }

    const newReversed = oldReversed ? undefined : true

    undoable(
      'Reverse clip',
      () => set({
        tracks: get().tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) => (c.id === clipId ? { ...c, reversed: newReversed } : c)),
        })),
      }),
      () => set({
        tracks: get().tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) => (c.id === clipId ? { ...c, reversed: oldReversed } : c)),
        })),
      }),
    )
  },

  renameClip: (clipId, name) => {
    // UE.7: trust boundary — clamp at MAX_CLIP_NAME_LENGTH; empty string clears (undefined = fallback to asset name)
    const clamped = name.slice(0, LIMITS.MAX_CLIP_NAME_LENGTH)
    const newName = clamped.length > 0 ? clamped : undefined

    let oldName: string | undefined
    for (const track of get().tracks) {
      const clip = track.clips.find((c) => c.id === clipId)
      if (clip) { oldName = clip.name; break }
    }

    undoable(
      'Rename clip',
      () => set({
        tracks: get().tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) => (c.id === clipId ? { ...c, name: newName } : c)),
        })),
      }),
      () => set({
        tracks: get().tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) => (c.id === clipId ? { ...c, name: oldName } : c)),
        })),
      }),
    )
  },

  setClipColor: (clipId, color) => {
    let oldColor: string | undefined
    for (const track of get().tracks) {
      const clip = track.clips.find((c) => c.id === clipId)
      if (clip) { oldColor = clip.color; break }
    }

    undoable(
      'Set clip color',
      () => set({
        tracks: get().tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) => (c.id === clipId ? { ...c, color } : c)),
        })),
      }),
      () => set({
        tracks: get().tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) => (c.id === clipId ? { ...c, color: oldColor } : c)),
        })),
      }),
    )
  },

  // T3: lock toggles. Undoable so a lock/unlock can be reverted; the guarded
  // no-ops on locked clips never enter `undoable`, so they cannot create empty
  // undo entries. Both actions bail out (no undo entry) when the value is
  // unchanged, and normalize the stored flag to `true | undefined` so an
  // unlocked clip/track serializes byte-identically to today.
  setClipLock: (clipId, locked) => {
    let prev: boolean | undefined
    let found = false
    for (const track of get().tracks) {
      const clip = track.clips.find((c) => c.id === clipId)
      if (clip) { prev = clip.locked; found = true; break }
    }
    if (!found) return
    const next = locked ? true : undefined
    if ((prev === true) === (next === true)) return // no change → no undo entry

    undoable(
      locked ? 'Lock clip' : 'Unlock clip',
      () => set({
        tracks: get().tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) => (c.id === clipId ? { ...c, locked: next } : c)),
        })),
      }),
      () => set({
        tracks: get().tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) => (c.id === clipId ? { ...c, locked: prev } : c)),
        })),
      }),
    )
  },

  setTrackLock: (trackId, locked) => {
    const track = get().tracks.find((t) => t.id === trackId)
    if (!track) return
    const prev = track.locked
    const next = locked ? true : undefined
    if ((prev === true) === (next === true)) return // no change → no undo entry

    undoable(
      locked ? 'Lock track' : 'Unlock track',
      () => set({ tracks: get().tracks.map((t) => (t.id === trackId ? { ...t, locked: next } : t)) }),
      () => set({ tracks: get().tracks.map((t) => (t.id === trackId ? { ...t, locked: prev } : t)) }),
    )
  },

  duplicateTrack: (trackId) => {
    /**
     * D4 + D5: duplicateTrack copies the source track's automation lanes (canonical
     * state in useAutomationStore) to the new track id, re-keying paramPaths so
     * effect-id prefixes point at the duplicate's NEW effect ids.
     *
     * Operator and CC mappings are deliberately NOT duplicated: the duplicate's
     * new effects start unmapped, which is valid (no dangling reference is created).
     * The source track's existing mappings continue to point validly at the source.
     * Re-mapping modulation is a future user action, not a correctness fix.
     */
    const source = get().tracks.find((t) => t.id === trackId)
    if (!source) return

    const newTrackId = randomUUID()

    // D4: build oldEffectId -> newEffectId map while cloning the chain
    const idMap = new Map<string, string>()
    const newChain = source.effectChain.map((e) => {
      const nid = randomUUID()
      idMap.set(e.id, nid)
      return { ...e, id: nid, parameters: { ...e.parameters } }
    })

    // D4: copy canonical store lanes for the source track, re-keyed through idMap
    const srcLanes = useAutomationStore.getState().lanes[trackId] ?? []
    const newStoreLanes = srcLanes.map((l) => ({
      ...l,
      id: randomUUID(),
      paramPath: rekeyPath(l.paramPath, idMap),
      points: l.points.map((p) => ({ ...p })),
    }))

    // D4: also re-key the vestigial Track.automationLanes paramPaths for consistency
    const newTrack: Track = {
      ...source,
      id: newTrackId,
      name: `${source.name} (Copy)`,
      clips: source.clips.map((c) => ({
        ...c,
        id: randomUUID(),
        trackId: newTrackId,
        ...(c.transform ? { transform: { ...c.transform } } : {}),
        ...(c.textConfig ? { textConfig: { ...c.textConfig } } : {}),
      })),
      effectChain: newChain,
      automationLanes: source.automationLanes.map((l) => ({
        ...l,
        id: randomUUID(),
        paramPath: rekeyPath(l.paramPath, idMap),
        points: l.points.map((p) => ({ ...p })),
      })),
    }
    const idx = get().tracks.findIndex((t) => t.id === trackId)
    const insertIdx = idx >= 0 ? idx + 1 : get().tracks.length

    undoable(
      'Duplicate track',
      () => {
        const tracks = [...get().tracks]
        tracks.splice(insertIdx, 0, newTrack)
        set({ tracks })
        // D4: write canonical store lanes for the duplicate (via lazy getState)
        if (newStoreLanes.length > 0) {
          const currentLanes = { ...useAutomationStore.getState().lanes }
          currentLanes[newTrackId] = newStoreLanes
          useAutomationStore.setState({ lanes: currentLanes })
        }
      },
      () => {
        set({ tracks: get().tracks.filter((t) => t.id !== newTrackId) })
        // D4: remove the duplicate's store lanes on undo
        const currentLanes = { ...useAutomationStore.getState().lanes }
        delete currentLanes[newTrackId]
        useAutomationStore.setState({ lanes: currentLanes })
      },
    )
  },

  // --- Playhead (NOT undoable — continuous) ---

  setPlayheadTime: (t) => set({ playheadTime: t }),
  setDuration: (d) => set({ duration: d }),

  // --- Markers ---

  addMarker: (time, label, color) => {
    if (get().markers.length >= LIMITS.MAX_MARKERS) {
      useToastStore.getState().addToast({ level: 'warning', message: `Marker limit (${LIMITS.MAX_MARKERS}) reached`, source: 'timeline' })
      return
    }
    const markerId = randomUUID()

    undoable(
      'Add marker',
      () => set({ markers: [...get().markers, { id: markerId, time, label, color }] }),
      () => set({ markers: get().markers.filter((m) => m.id !== markerId) }),
    )
  },

  removeMarker: (id) => {
    const marker = get().markers.find((m) => m.id === id)
    if (!marker) return
    const removed = { ...marker }

    undoable(
      'Remove marker',
      () => set({ markers: get().markers.filter((m) => m.id !== id) }),
      () => set({ markers: [...get().markers, removed] }),
    )
  },

  moveMarker: (id, newTime) => {
    const marker = get().markers.find((m) => m.id === id)
    if (!marker) return
    const oldTime = marker.time

    undoable(
      'Move marker',
      () => set({ markers: get().markers.map((m) => (m.id === id ? { ...m, time: newTime } : m)) }),
      () => set({ markers: get().markers.map((m) => (m.id === id ? { ...m, time: oldTime } : m)) }),
    )
  },

  renameMarker: (id, label) => {
    const marker = get().markers.find((m) => m.id === id)
    if (!marker) return
    const oldLabel = marker.label

    // T4: trust boundary — this is user text rendered into the DOM. React escapes
    // it, but we still (a) strip control chars (incl. newlines/tabs that would
    // corrupt a single-line flag label), (b) collapse to trimmed text, and
    // (c) cap length. Empty/whitespace-only input falls back to the default
    // 'Marker' label rather than leaving an invisible flag.
    // eslint-disable-next-line no-control-regex
    const sanitized = label.replace(/[\x00-\x1F\x7F]/g, '').trim().slice(0, LIMITS.MAX_MARKER_LABEL_LENGTH)
    const newLabel = sanitized.length > 0 ? sanitized : 'Marker'

    if (newLabel === oldLabel) return

    undoable(
      'Rename marker',
      () => set({ markers: get().markers.map((m) => (m.id === id ? { ...m, label: newLabel } : m)) }),
      () => set({ markers: get().markers.map((m) => (m.id === id ? { ...m, label: oldLabel } : m)) }),
    )
  },

  // --- Loop ---

  setLoopRegion: (inTime, outTime) => {
    const oldRegion = get().loopRegion

    undoable(
      'Set loop region',
      () => set({ loopRegion: { in: inTime, out: outTime } }),
      () => set({ loopRegion: oldRegion }),
    )
  },

  clearLoopRegion: () => {
    const oldRegion = get().loopRegion
    if (!oldRegion) return

    undoable(
      'Clear loop region',
      () => set({ loopRegion: null }),
      () => set({ loopRegion: oldRegion }),
    )
  },

  setLooping: (on) => set({ isLooping: on }),
  toggleLooping: () => set((s) => ({ isLooping: !s.isLooping })),

  // --- View (NOT undoable — UI state) ---

  setZoom: (pxPerSec) => set({ zoom: Math.max(0.5, Math.min(500, pxPerSec)) }),
  setScrollX: (px) => {
    const { duration, zoom } = get()
    const maxScroll = Math.max(0, (duration + 1) * zoom)
    set({ scrollX: Math.max(0, Math.min(maxScroll, px)) })
  },

  // --- Selection (NOT undoable — UI state) ---

  selectTrack: (id) => set({ selectedTrackId: id }),
  selectClip: (id) => set({
    selectedClipId: id,
    selectedClipIds: id ? [id] : [],
  }),

  toggleClipSelection: (clipId) => {
    const state = get()
    const ids = state.selectedClipIds
    const newIds = ids.includes(clipId)
      ? ids.filter((id) => id !== clipId)
      : [...ids, clipId]
    set({ selectedClipIds: newIds, selectedClipId: newIds[0] ?? null })
  },

  rangeSelectClips: (fromId, toId) => {
    const state = get()
    const allClips = getAllClipsInOrder(state.tracks)
    const fromIdx = allClips.findIndex((c) => c.id === fromId)
    const toIdx = allClips.findIndex((c) => c.id === toId)
    if (fromIdx === -1 || toIdx === -1) return
    const lo = Math.min(fromIdx, toIdx)
    const hi = Math.max(fromIdx, toIdx)
    const rangeIds = allClips.slice(lo, hi + 1).map((c) => c.id)
    set({ selectedClipIds: rangeIds, selectedClipId: rangeIds[0] ?? null })
  },

  clearSelection: () => set({ selectedClipIds: [], selectedClipId: null }),

  deleteSelectedClips: () => {
    const state = get()
    if (state.selectedClipIds.length === 0) return
    const idsToRemove = new Set(state.selectedClipIds)

    // Capture removed clips for undo. T3: locked clips (and every clip on a
    // locked track) are skipped — only the unlocked members of the selection are
    // deleted. If the entire selection is locked, this is a no-op (no undo entry).
    const removedClips: { trackId: string; clip: Clip }[] = []
    let skippedLocked = false
    for (const track of state.tracks) {
      for (const clip of track.clips) {
        if (idsToRemove.has(clip.id)) {
          if (clip.locked === true || track.locked === true) {
            skippedLocked = true
            continue
          }
          removedClips.push({ trackId: track.id, clip: { ...clip } })
        }
      }
    }
    if (removedClips.length === 0) {
      if (skippedLocked) emitLockedToast('Clip is locked')
      return
    }

    undoable(
      `Delete ${removedClips.length} clip${removedClips.length > 1 ? 's' : ''}`,
      () => {
        const removeSet = new Set(removedClips.map((r) => r.clip.id))
        const state = get()
        const tracks = state.tracks.map((t) => ({
          ...t,
          clips: t.clips.filter((c) => !removeSet.has(c.id)),
        }))
        const speedDialog =
          state.speedDialog && removeSet.has(state.speedDialog.clipId) ? null : state.speedDialog
        set({ tracks, selectedClipId: null, selectedClipIds: [], speedDialog, duration: recalcDuration(tracks) })
      },
      () => {
        let tracks = get().tracks
        for (const { trackId, clip } of removedClips) {
          tracks = tracks.map((t) =>
            t.id === trackId ? { ...t, clips: [...t.clips, clip] } : t,
          )
        }
        set({ tracks, duration: recalcDuration(tracks) })
      },
    )
  },

  selectAllClips: () => {
    const allIds = get().tracks.flatMap((t) => t.clips.map((c) => c.id))
    set({ selectedClipIds: allIds, selectedClipId: allIds[0] ?? null })
  },

  invertSelection: () => {
    const current = new Set(get().selectedClipIds)
    const inverted = get().tracks.flatMap((t) => t.clips.map((c) => c.id)).filter((id) => !current.has(id))
    set({ selectedClipIds: inverted, selectedClipId: inverted[0] ?? null })
  },

  selectClipsByTrack: (trackId) => {
    const track = get().tracks.find((t) => t.id === trackId)
    if (!track) return
    const ids = track.clips.map((c) => c.id)
    set({ selectedClipIds: ids, selectedClipId: ids[0] ?? null })
  },

  // --- Helpers ---

  getActiveClipsAtTime: (time) => {
    const { tracks } = get()
    const result: { track: Track; clip: Clip }[] = []
    for (const track of tracks) {
      for (const clip of track.clips) {
        if (time >= clip.position && time < clip.position + clip.duration) {
          result.push({ track, clip })
        }
      }
    }
    return result
  },

  getTimelineDuration: () => recalcDuration(get().tracks),

  // --- Audio track actions ---

  addAudioTrack: (name, color) => {
    if (get().tracks.length >= LIMITS.MAX_TRACKS) {
      useToastStore.getState().addToast({ level: 'warning', message: `Track limit (${LIMITS.MAX_TRACKS}) reached`, source: 'timeline' })
      return undefined
    }
    if (countAudioTracks(get().tracks) >= AUDIO_LIMITS.MAX_AUDIO_TRACKS) {
      useToastStore.getState().addToast({ level: 'warning', message: `Audio track limit (${AUDIO_LIMITS.MAX_AUDIO_TRACKS}) reached`, source: 'timeline' })
      return undefined
    }
    const trackId = randomUUID()
    const resolvedName = name ?? `Audio ${countAudioTracks(get().tracks) + 1}`
    const resolvedColor = color ?? '#4ade80'

    undoable(
      'Add audio track',
      () => {
        const track = makeEmptyTrack(resolvedName, resolvedColor, trackId, 'audio')
        set({ tracks: [...get().tracks, track] })
      },
      () => {
        const tracks = get().tracks.filter((t) => t.id !== trackId)
        set({ tracks, duration: recalcDuration(tracks) })
      },
    )
    return trackId
  },

  addAudioClip: (trackId, clip) => {
    const track = get().tracks.find((t) => t.id === trackId)
    if (!track || track.type !== 'audio') return undefined
    const existing = track.audioClips ?? []
    if (existing.length >= AUDIO_LIMITS.MAX_CLIPS_PER_TRACK) {
      useToastStore.getState().addToast({ level: 'warning', message: `Audio clip limit (${AUDIO_LIMITS.MAX_CLIPS_PER_TRACK}) reached`, source: 'timeline' })
      return undefined
    }
    const clipId = randomUUID()
    const newClip = normalizeAudioClip(clip, clipId, trackId)

    undoable(
      'Add audio clip',
      () => {
        const tracks = get().tracks.map((t) =>
          t.id === trackId ? { ...t, audioClips: [...(t.audioClips ?? []), newClip] } : t,
        )
        set({ tracks, duration: recalcDuration(tracks) })
      },
      () => {
        const tracks = get().tracks.map((t) =>
          t.id === trackId ? { ...t, audioClips: (t.audioClips ?? []).filter((c) => c.id !== clipId) } : t,
        )
        set({ tracks, duration: recalcDuration(tracks) })
      },
    )
    return clipId
  },

  removeAudioClip: (clipId) => {
    const found = findAudioClip(get().tracks, clipId)
    if (!found) return
    const { track: owner, clip: removed } = found
    const ownerId = owner.id

    undoable(
      'Remove audio clip',
      () => {
        const tracks = get().tracks.map((t) =>
          t.id === ownerId ? { ...t, audioClips: (t.audioClips ?? []).filter((c) => c.id !== clipId) } : t,
        )
        const selectedClipIds = get().selectedClipIds.filter((id) => id !== clipId)
        set({
          tracks,
          duration: recalcDuration(tracks),
          selectedClipIds,
          selectedClipId: get().selectedClipId === clipId ? null : get().selectedClipId,
        })
      },
      () => {
        const tracks = get().tracks.map((t) =>
          t.id === ownerId ? { ...t, audioClips: [...(t.audioClips ?? []), removed] } : t,
        )
        set({ tracks, duration: recalcDuration(tracks) })
      },
    )
  },

  removeAudioClips: (clipIds) => {
    if (clipIds.length === 0) return
    // Transaction coalesces all deletes into one undo entry.
    const undo = useUndoStore.getState()
    undo.beginTransaction(`Remove ${clipIds.length} audio clip${clipIds.length === 1 ? '' : 's'}`)
    try {
      for (const id of clipIds) get().removeAudioClip(id)
    } finally {
      undo.commitTransaction()
    }
  },

  setClipGain: (clipId, gainDb) => {
    const found = findAudioClip(get().tracks, clipId)
    if (!found) return
    const oldGain = found.clip.gainDb
    const newGain = clampGainDb(gainDb)
    if (oldGain === newGain) return
    const trackId = found.track.id

    undoable(
      'Set audio clip gain',
      () => set({
        tracks: get().tracks.map((t) =>
          t.id === trackId ? {
            ...t,
            audioClips: (t.audioClips ?? []).map((c) => c.id === clipId ? { ...c, gainDb: newGain } : c),
          } : t,
        ),
      }),
      () => set({
        tracks: get().tracks.map((t) =>
          t.id === trackId ? {
            ...t,
            audioClips: (t.audioClips ?? []).map((c) => c.id === clipId ? { ...c, gainDb: oldGain } : c),
          } : t,
        ),
      }),
    )
  },

  setClipFade: (clipId, fadeInSec, fadeOutSec) => {
    const found = findAudioClip(get().tracks, clipId)
    if (!found) return
    const { clip: current, track: owner } = found
    const clipDur = current.outSec - current.inSec
    const newIn = Math.max(0, Math.min(clipDur, clampNonNegSec(fadeInSec)))
    const newOut = Math.max(0, Math.min(clipDur - newIn, clampNonNegSec(fadeOutSec)))
    if (newIn === current.fadeInSec && newOut === current.fadeOutSec) return
    const oldIn = current.fadeInSec
    const oldOut = current.fadeOutSec
    const trackId = owner.id

    undoable(
      'Set audio clip fade',
      () => set({
        tracks: get().tracks.map((t) =>
          t.id === trackId ? {
            ...t,
            audioClips: (t.audioClips ?? []).map((c) => c.id === clipId ? { ...c, fadeInSec: newIn, fadeOutSec: newOut } : c),
          } : t,
        ),
      }),
      () => set({
        tracks: get().tracks.map((t) =>
          t.id === trackId ? {
            ...t,
            audioClips: (t.audioClips ?? []).map((c) => c.id === clipId ? { ...c, fadeInSec: oldIn, fadeOutSec: oldOut } : c),
          } : t,
        ),
      }),
    )
  },

  setTrackGain: (trackId, gainDb) => {
    const track = get().tracks.find((t) => t.id === trackId)
    if (!track || track.type !== 'audio') return
    const newGain = clampGainDb(gainDb)
    const oldGain = track.gainDb ?? 0
    if (oldGain === newGain) return

    undoable(
      'Set audio track gain',
      () => set({
        tracks: get().tracks.map((t) => t.id === trackId ? { ...t, gainDb: newGain } : t),
      }),
      () => set({
        tracks: get().tracks.map((t) => t.id === trackId ? { ...t, gainDb: oldGain } : t),
      }),
    )
  },

  moveAudioClip: (clipId, newStartSec) => {
    const found = findAudioClip(get().tracks, clipId)
    if (!found) return
    const oldStart = found.clip.startSec
    const cleanStart = clampNonNegSec(newStartSec)
    if (oldStart === cleanStart) return
    const trackId = found.track.id

    undoable(
      'Move audio clip',
      () => {
        const tracks = get().tracks.map((t) =>
          t.id === trackId ? {
            ...t,
            audioClips: (t.audioClips ?? []).map((c) => c.id === clipId ? { ...c, startSec: cleanStart } : c),
          } : t,
        )
        set({ tracks, duration: recalcDuration(tracks) })
      },
      () => {
        const tracks = get().tracks.map((t) =>
          t.id === trackId ? {
            ...t,
            audioClips: (t.audioClips ?? []).map((c) => c.id === clipId ? { ...c, startSec: oldStart } : c),
          } : t,
        )
        set({ tracks, duration: recalcDuration(tracks) })
      },
    )
  },

  trimAudioClip: (clipId, newInSec, newOutSec) => {
    const found = findAudioClip(get().tracks, clipId)
    if (!found) return
    const { clip: current, track: owner } = found
    const inSec = clampNonNegSec(newInSec)
    const outSec = Math.max(inSec + AUDIO_LIMITS.MIN_CLIP_SEC, clampNonNegSec(newOutSec))
    if (inSec === current.inSec && outSec === current.outSec) return
    const oldIn = current.inSec
    const oldOut = current.outSec
    // Preserve existing fades if they still fit; clamp otherwise.
    const newDur = outSec - inSec
    const fadeIn = Math.min(current.fadeInSec, newDur)
    const fadeOut = Math.min(current.fadeOutSec, newDur - fadeIn)
    const oldFadeIn = current.fadeInSec
    const oldFadeOut = current.fadeOutSec
    const trackId = owner.id

    undoable(
      'Trim audio clip',
      () => {
        const tracks = get().tracks.map((t) =>
          t.id === trackId ? {
            ...t,
            audioClips: (t.audioClips ?? []).map((c) =>
              c.id === clipId ? { ...c, inSec, outSec, fadeInSec: fadeIn, fadeOutSec: fadeOut } : c,
            ),
          } : t,
        )
        set({ tracks, duration: recalcDuration(tracks) })
      },
      () => {
        const tracks = get().tracks.map((t) =>
          t.id === trackId ? {
            ...t,
            audioClips: (t.audioClips ?? []).map((c) =>
              c.id === clipId ? { ...c, inSec: oldIn, outSec: oldOut, fadeInSec: oldFadeIn, fadeOutSec: oldFadeOut } : c,
            ),
          } : t,
        )
        set({ tracks, duration: recalcDuration(tracks) })
      },
    )
  },

  toggleAudioClipMute: (clipId) => {
    const found = findAudioClip(get().tracks, clipId)
    if (!found) return
    const wasMuted = found.clip.muted
    const trackId = found.track.id
    undoable(
      wasMuted ? 'Unmute audio clip' : 'Mute audio clip',
      () => set({
        tracks: get().tracks.map((t) =>
          t.id === trackId ? {
            ...t,
            audioClips: (t.audioClips ?? []).map((c) => c.id === clipId ? { ...c, muted: !wasMuted } : c),
          } : t,
        ),
      }),
      () => set({
        tracks: get().tracks.map((t) =>
          t.id === trackId ? {
            ...t,
            audioClips: (t.audioClips ?? []).map((c) => c.id === clipId ? { ...c, muted: wasMuted } : c),
          } : t,
        ),
      }),
    )
  },

  relinkAudioClip: (clipId, newPath) => {
    // UE.5: Update the path of an audio clip after relink; clear missing flag.
    // Not undoable — relink is a persistent correction, not an edit operation.
    set({
      tracks: get().tracks.map((t) =>
        t.type === 'audio'
          ? {
              ...t,
              audioClips: (t.audioClips ?? []).map((c) =>
                c.id === clipId ? { ...c, path: newPath, missing: undefined } : c,
              ),
            }
          : t,
      ),
    })
  },

  clearClipMissingFlag: (assetId) => {
    // UE.5: Clear missing flag on all Clip entries referencing assetId.
    // Not undoable — relink is a persistent correction.
    set({
      tracks: get().tracks.map((t) => ({
        ...t,
        clips: t.clips.map((c) =>
          c.assetId === assetId ? { ...c, missing: undefined } : c,
        ),
      })),
    })
  },

  setAudioClipMissing: (clipId, missing) => {
    // UE.5: Set or clear missing flag on a specific audio clip.
    set({
      tracks: get().tracks.map((t) =>
        t.type === 'audio'
          ? {
              ...t,
              audioClips: (t.audioClips ?? []).map((c) =>
                c.id === clipId ? { ...c, missing: missing ? true : undefined } : c,
              ),
            }
          : t,
      ),
    })
  },

  setClipMissingByAssetId: (assetId, missing) => {
    // UE.5: Set or clear missing flag on all Clips referencing assetId.
    set({
      tracks: get().tracks.map((t) => ({
        ...t,
        clips: t.clips.map((c) =>
          c.assetId === assetId ? { ...c, missing: missing ? true : undefined } : c,
        ),
      })),
    })
  },

  getActiveAudioClipsAtTime: (time) => {
    const { tracks } = get()
    const result: { track: Track; clip: AudioClip }[] = []
    // Respect solo: if any audio track is soloed, only return clips from soloed tracks
    const anyAudioSolo = tracks.some((t) => t.type === 'audio' && t.isSoloed)
    for (const track of tracks) {
      if (track.type !== 'audio' || !track.audioClips) continue
      if (track.isMuted) continue
      if (anyAudioSolo && !track.isSoloed) continue
      for (const clip of track.audioClips) {
        if (clip.muted || clip.missing) continue
        const end = clip.startSec + (clip.outSec - clip.inSec)
        if (time >= clip.startSec && time < end) {
          result.push({ track, clip })
        }
      }
    }
    return result
  },

  // --- MK.4: Preview tool + marquee interaction ---

  setPreviewToolMode: (mode) => {
    // Switching tool clears any in-progress drag and committed selection (ephemeral UI)
    set({ previewToolMode: mode, marqueeInProgress: null, committedMaskSelection: null })
  },

  // --- MK.6: Wand + eyedropper state ---

  setWandTolerance: (tol) => {
    // Clamp to [0, 441.67] (max RGB Euclidean distance) before storing.
    // Finite guard: NaN/Inf → 30 (default).
    const safe = Number.isFinite(tol) ? Math.max(0, Math.min(441.67, tol)) : 30
    set({ wandTolerance: safe })
  },

  setMarqueeInProgress: (rect) => {
    set({ marqueeInProgress: rect })
  },

  clearMaskSelection: () => {
    set({ committedMaskSelection: null, marqueeInProgress: null })
  },

  // --- MK.4: Matte node CRUD (undoable) ---

  addMatteNode: (clipId, node) => {
    // Find clip to capture pre-state for undo
    let prevStack: MatteNode[] | undefined
    for (const track of get().tracks) {
      const clip = track.clips.find((c) => c.id === clipId)
      if (clip) { prevStack = clip.maskStack ? [...clip.maskStack] : []; break }
    }
    if (prevStack === undefined) return  // unknown clip — no-op

    const withNode = [...prevStack, node]

    undoable(
      'Add matte node',
      () => set({
        tracks: get().tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) =>
            c.id === clipId ? { ...c, maskStack: withNode } : c,
          ),
        })),
      }),
      () => set({
        tracks: get().tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) =>
            c.id === clipId ? { ...c, maskStack: prevStack } : c,
          ),
        })),
      }),
    )
  },

  removeMatteNode: (clipId, nodeId) => {
    let prevStack: MatteNode[] | undefined
    for (const track of get().tracks) {
      const clip = track.clips.find((c) => c.id === clipId)
      if (clip) { prevStack = clip.maskStack ? [...clip.maskStack] : []; break }
    }
    if (prevStack === undefined) return

    const withoutNode = prevStack.filter((n) => n.id !== nodeId)

    undoable(
      'Remove matte node',
      () => set({
        tracks: get().tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) =>
            c.id === clipId ? { ...c, maskStack: withoutNode } : c,
          ),
        })),
      }),
      () => set({
        tracks: get().tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) =>
            c.id === clipId ? { ...c, maskStack: prevStack } : c,
          ),
        })),
      }),
    )
  },

  updateMatteNode: (clipId, nodeId, patch) => {
    let prevStack: MatteNode[] | undefined
    let prevNode: MatteNode | undefined
    for (const track of get().tracks) {
      const clip = track.clips.find((c) => c.id === clipId)
      if (clip) {
        prevStack = clip.maskStack ? [...clip.maskStack] : []
        prevNode = prevStack.find((n) => n.id === nodeId)
        break
      }
    }
    if (!prevStack || !prevNode) return

    const capturedPrev = { ...prevNode }
    const capturedPrevStack = prevStack
    const updatedNode: MatteNode = { ...prevNode, ...patch, id: nodeId }
    const withUpdate = prevStack.map((n) => n.id === nodeId ? updatedNode : n)

    undoable(
      'Update matte node',
      () => set({
        tracks: get().tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) =>
            c.id === clipId ? { ...c, maskStack: withUpdate } : c,
          ),
        })),
      }),
      () => set({
        tracks: get().tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) =>
            c.id === clipId ? { ...c, maskStack: capturedPrevStack.map((n) => n.id === nodeId ? capturedPrev : n) } : c,
          ),
        })),
      }),
    )
  },

  setClipMaskMode: (clipId, mode, fillColor) => {
    let prevMode: string | undefined
    let prevFillColor: string | undefined
    for (const track of get().tracks) {
      const clip = track.clips.find((c) => c.id === clipId)
      if (clip) { prevMode = clip.maskMode; prevFillColor = clip.maskFillColor; break }
    }

    undoable(
      `Mask ${mode}`,
      () => set({
        tracks: get().tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) =>
            c.id === clipId ? { ...c, maskMode: mode, ...(fillColor ? { maskFillColor: fillColor } : {}) } : c,
          ),
        })),
      }),
      () => set({
        tracks: get().tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) =>
            c.id === clipId ? { ...c, maskMode: prevMode as any, maskFillColor: prevFillColor } : c,
          ),
        })),
      }),
    )
  },

  // --- MK.7: Matte stack reorder + enable/disable (undoable) ---

  reorderMatteNode: (clipId, nodeId, direction) => {
    let prevStack: MatteNode[] | undefined
    for (const track of get().tracks) {
      const clip = track.clips.find((c) => c.id === clipId)
      if (clip) { prevStack = clip.maskStack ? [...clip.maskStack] : []; break }
    }
    if (!prevStack || prevStack.length === 0) return

    const idx = prevStack.findIndex((n) => n.id === nodeId)
    if (idx === -1) return
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1
    if (targetIdx < 0 || targetIdx >= prevStack.length) return  // at boundary — no-op

    const nextStack = [...prevStack]
    ;[nextStack[idx], nextStack[targetIdx]] = [nextStack[targetIdx], nextStack[idx]]

    const capturedPrev = prevStack

    undoable(
      'Reorder matte node',
      () => set({
        tracks: get().tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) =>
            c.id === clipId ? { ...c, maskStack: nextStack } : c,
          ),
        })),
      }),
      () => set({
        tracks: get().tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) =>
            c.id === clipId ? { ...c, maskStack: capturedPrev } : c,
          ),
        })),
      }),
    )
  },

  toggleMatteNode: (clipId, nodeId) => {
    let prevStack: MatteNode[] | undefined
    let prevNode: MatteNode | undefined
    for (const track of get().tracks) {
      const clip = track.clips.find((c) => c.id === clipId)
      if (clip) {
        prevStack = clip.maskStack ? [...clip.maskStack] : []
        prevNode = prevStack.find((n) => n.id === nodeId)
        break
      }
    }
    if (!prevStack || !prevNode) return

    const capturedPrev = prevStack
    const toggled: MatteNode = { ...prevNode, enabled: !prevNode.enabled }
    const nextStack = prevStack.map((n) => n.id === nodeId ? toggled : n)

    undoable(
      'Toggle matte node',
      () => set({
        tracks: get().tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) =>
            c.id === clipId ? { ...c, maskStack: nextStack } : c,
          ),
        })),
      }),
      () => set({
        tracks: get().tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) =>
            c.id === clipId ? { ...c, maskStack: capturedPrev } : c,
          ),
        })),
      }),
    )
  },

  // --- Reset ---

  reset: () => set(INITIAL_STATE),
}))
