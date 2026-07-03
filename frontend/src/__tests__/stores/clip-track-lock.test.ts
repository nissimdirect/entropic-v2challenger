/**
 * T3 — clip + track lock (master plan WS1, decision D3 = BOTH clip and track lock).
 *
 * Covers:
 *   1. Each guarded clip action (move/trim/trim-out/split/remove/ripple-remove/
 *      ripple-trim/transform/deleteSelected) is a NO-OP when the clip is locked
 *      and behaves NORMALLY when unlocked.
 *   2. Track lock cascades to every contained clip (same guards fire).
 *   3. A locked track rejects reorder + drops (moveClip / addClip) onto it, and
 *      ripple ops never shift a locked track's clips.
 *   4. Guarded no-ops create NO undo entry; lock/unlock toggles ARE undoable.
 *   5. Lock round-trips through persistence (serialize → hydrate) and a
 *      non-boolean persisted value is dropped at the trust boundary.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// window.entropic mock BEFORE store imports (matches project-persistence.test.ts)
const mockEntropic = {
  onEngineStatus: vi.fn(),
  sendCommand: vi.fn().mockResolvedValue({ ok: true }),
  selectFile: vi.fn().mockResolvedValue(null),
  selectSavePath: vi.fn().mockResolvedValue(null),
  onExportProgress: vi.fn().mockReturnValue(vi.fn()),
  getPathForFile: vi.fn().mockReturnValue('/test/video.mp4'),
  showSaveDialog: vi.fn().mockResolvedValue('/test/project.glitch'),
  showOpenDialog: vi.fn().mockResolvedValue('/test/project.glitch'),
  readFile: vi.fn().mockResolvedValue('{}'),
  writeFile: vi.fn().mockResolvedValue(undefined),
  deleteFile: vi.fn().mockResolvedValue(undefined),
  fileExists: vi.fn().mockResolvedValue(true),
  getAppPath: vi.fn().mockResolvedValue('/test/userData'),
}
;(globalThis as any).window = { entropic: mockEntropic }

import { useTimelineStore } from '../../renderer/stores/timeline'
import { useUndoStore } from '../../renderer/stores/undo'
import { useToastStore } from '../../renderer/stores/toast'
import { useProjectStore } from '../../renderer/stores/project'
import { serializeProject, hydrateStores, validateProject } from '../../renderer/project-persistence'
import type { Clip, Track, ClipTransform } from '../../shared/types'

// --------------------------------------------------------------------------- #
//  Helpers
// --------------------------------------------------------------------------- #

function makeClip(over: Partial<Clip> = {}): Clip {
  return {
    id: over.id ?? 'clip-1',
    assetId: 'asset-1',
    trackId: over.trackId ?? 'track-1',
    position: 0,
    duration: 10,
    inPoint: 0,
    outPoint: 10,
    speed: 1,
    ...over,
  }
}

function makeTrack(over: Partial<Track> = {}): Track {
  return {
    id: over.id ?? 'track-1',
    type: 'video',
    name: over.name ?? 'V1',
    color: '#4ade80',
    isMuted: false,
    isSoloed: false,
    clips: over.clips ?? [],
    effectChain: [],
    automationLanes: [],
    ...over,
  }
}

/** Inject a known tracks state directly (bypasses undoable setup noise). */
function setTracks(tracks: Track[]) {
  useTimelineStore.setState({ tracks, duration: 60, selectedClipId: null, selectedClipIds: [] })
  useUndoStore.getState().clear()
  useToastStore.setState({ toasts: [] })
}

function getClip(clipId: string): Clip | undefined {
  for (const t of useTimelineStore.getState().tracks) {
    const c = t.clips.find((cc) => cc.id === clipId)
    if (c) return c
  }
  return undefined
}

function undoDepth(): number {
  return useUndoStore.getState().past.length
}

beforeEach(() => {
  useTimelineStore.getState().reset()
  useUndoStore.getState().clear()
  useToastStore.setState({ toasts: [] })
})

// --------------------------------------------------------------------------- #
//  1. Guarded clip actions — no-op when locked, normal when unlocked
// --------------------------------------------------------------------------- #

describe('locked clip guards every mutation path (no-op + no undo entry)', () => {
  it('removeClip: locked clip is not deleted and no undo entry is created', () => {
    setTracks([makeTrack({ clips: [makeClip({ locked: true })] })])
    useTimelineStore.getState().removeClip('clip-1')
    expect(getClip('clip-1')).toBeDefined()
    expect(undoDepth()).toBe(0)
  })

  it('removeClip: unlocked clip IS deleted (normal path)', () => {
    setTracks([makeTrack({ clips: [makeClip()] })])
    useTimelineStore.getState().removeClip('clip-1')
    expect(getClip('clip-1')).toBeUndefined()
    expect(undoDepth()).toBe(1)
  })

  it('moveClip: locked clip does not move', () => {
    setTracks([makeTrack({ clips: [makeClip({ locked: true })] })])
    useTimelineStore.getState().moveClip('clip-1', 'track-1', 25)
    expect(getClip('clip-1')!.position).toBe(0)
    expect(undoDepth()).toBe(0)
  })

  it('moveClip: unlocked clip moves to the requested position', () => {
    setTracks([makeTrack({ clips: [makeClip()] })])
    useTimelineStore.getState().moveClip('clip-1', 'track-1', 25)
    expect(getClip('clip-1')!.position).toBe(25)
    expect(undoDepth()).toBe(1)
  })

  it('trimClipIn / trimClipOut: locked clip does not trim', () => {
    setTracks([makeTrack({ clips: [makeClip({ locked: true })] })])
    useTimelineStore.getState().trimClipIn('clip-1', 3)
    useTimelineStore.getState().trimClipOut('clip-1', 7)
    const c = getClip('clip-1')!
    expect(c.inPoint).toBe(0)
    expect(c.outPoint).toBe(10)
    expect(undoDepth()).toBe(0)
  })

  it('trimClipIn: unlocked clip trims', () => {
    setTracks([makeTrack({ clips: [makeClip()] })])
    useTimelineStore.getState().trimClipIn('clip-1', 3)
    expect(getClip('clip-1')!.inPoint).toBe(3)
    expect(undoDepth()).toBe(1)
  })

  it('splitClip: locked clip does not split', () => {
    setTracks([makeTrack({ clips: [makeClip({ locked: true })] })])
    useTimelineStore.getState().splitClip('clip-1', 5)
    expect(useTimelineStore.getState().tracks[0].clips).toHaveLength(1)
    expect(undoDepth()).toBe(0)
  })

  it('splitClip: unlocked clip splits into two', () => {
    setTracks([makeTrack({ clips: [makeClip()] })])
    useTimelineStore.getState().splitClip('clip-1', 5)
    expect(useTimelineStore.getState().tracks[0].clips).toHaveLength(2)
    expect(undoDepth()).toBe(1)
  })

  it('setClipTransform: locked clip rejects transform', () => {
    setTracks([makeTrack({ clips: [makeClip({ locked: true })] })])
    const tf = { scaleX: 2, scaleY: 2, translateX: 0, translateY: 0, rotation: 0, anchorX: 0.5, anchorY: 0.5 } as unknown as ClipTransform
    useTimelineStore.getState().setClipTransform('clip-1', tf)
    expect(getClip('clip-1')!.transform).toBeUndefined()
    expect(undoDepth()).toBe(0)
  })

  it('rippleRemoveClip: locked clip is not removed', () => {
    setTracks([makeTrack({ clips: [makeClip({ locked: true }), makeClip({ id: 'clip-2', position: 10 })] })])
    useTimelineStore.getState().rippleRemoveClip('clip-1')
    expect(getClip('clip-1')).toBeDefined()
    expect(getClip('clip-2')!.position).toBe(10) // later clip NOT shifted
    expect(undoDepth()).toBe(0)
  })

  it('rippleTrimClipOut: locked clip is not ripple-trimmed', () => {
    setTracks([makeTrack({ clips: [makeClip({ locked: true }), makeClip({ id: 'clip-2', position: 10 })] })])
    useTimelineStore.getState().rippleTrimClipOut('clip-1', 5)
    expect(getClip('clip-1')!.outPoint).toBe(10)
    expect(getClip('clip-2')!.position).toBe(10)
    expect(undoDepth()).toBe(0)
  })

  it('deleteSelectedClips: locked members are skipped, unlocked members deleted', () => {
    setTracks([
      makeTrack({
        clips: [makeClip({ locked: true }), makeClip({ id: 'clip-2', position: 10 })],
      }),
    ])
    useTimelineStore.setState({ selectedClipIds: ['clip-1', 'clip-2'], selectedClipId: 'clip-1' })
    useTimelineStore.getState().deleteSelectedClips()
    expect(getClip('clip-1')).toBeDefined()   // locked survived
    expect(getClip('clip-2')).toBeUndefined() // unlocked deleted
    expect(undoDepth()).toBe(1)
  })

  it('deleteSelectedClips: all-locked selection is a no-op with no undo entry', () => {
    setTracks([
      makeTrack({ clips: [makeClip({ locked: true }), makeClip({ id: 'clip-2', position: 10, locked: true })] }),
    ])
    useTimelineStore.setState({ selectedClipIds: ['clip-1', 'clip-2'], selectedClipId: 'clip-1' })
    useTimelineStore.getState().deleteSelectedClips()
    expect(getClip('clip-1')).toBeDefined()
    expect(getClip('clip-2')).toBeDefined()
    expect(undoDepth()).toBe(0)
  })
})

// --------------------------------------------------------------------------- #
//  2. Track lock cascades to contained clips
// --------------------------------------------------------------------------- #

describe('track lock guards every contained clip', () => {
  it('a clip on a locked track cannot be moved, trimmed, split, or deleted', () => {
    setTracks([makeTrack({ locked: true, clips: [makeClip()] })])
    const tl = useTimelineStore.getState()
    tl.moveClip('clip-1', 'track-1', 20)
    tl.trimClipIn('clip-1', 4)
    tl.splitClip('clip-1', 5)
    tl.removeClip('clip-1')
    const c = getClip('clip-1')!
    expect(c).toBeDefined()
    expect(c.position).toBe(0)
    expect(c.inPoint).toBe(0)
    expect(useTimelineStore.getState().tracks[0].clips).toHaveLength(1)
    expect(undoDepth()).toBe(0)
  })
})

// --------------------------------------------------------------------------- #
//  3. Locked track rejects reorder + drops, ripple skips it
// --------------------------------------------------------------------------- #

describe('locked track rejects structural changes onto it', () => {
  it('reorderTrack is a no-op when the moved track is locked', () => {
    setTracks([makeTrack({ id: 'track-1', locked: true }), makeTrack({ id: 'track-2', name: 'V2' })])
    useTimelineStore.getState().reorderTrack(0, 1)
    expect(useTimelineStore.getState().tracks.map((t) => t.id)).toEqual(['track-1', 'track-2'])
    expect(undoDepth()).toBe(0)
  })

  it('reorderTrack is a no-op when the destination slot holds a locked track', () => {
    setTracks([makeTrack({ id: 'track-1' }), makeTrack({ id: 'track-2', name: 'V2', locked: true })])
    useTimelineStore.getState().reorderTrack(0, 1)
    expect(useTimelineStore.getState().tracks.map((t) => t.id)).toEqual(['track-1', 'track-2'])
    expect(undoDepth()).toBe(0)
  })

  it('reorderTrack works normally between two unlocked tracks', () => {
    setTracks([makeTrack({ id: 'track-1' }), makeTrack({ id: 'track-2', name: 'V2' })])
    useTimelineStore.getState().reorderTrack(0, 1)
    expect(useTimelineStore.getState().tracks.map((t) => t.id)).toEqual(['track-2', 'track-1'])
  })

  it('addClip is rejected when the target track is locked', () => {
    setTracks([makeTrack({ locked: true })])
    useTimelineStore.getState().addClip('track-1', makeClip({ id: 'new-clip' }))
    expect(useTimelineStore.getState().tracks[0].clips).toHaveLength(0)
    expect(undoDepth()).toBe(0)
  })

  it('moveClip onto a locked track is rejected (drop guard)', () => {
    setTracks([
      makeTrack({ id: 'track-1', clips: [makeClip({ id: 'clip-1' })] }),
      makeTrack({ id: 'track-2', name: 'V2', locked: true }),
    ])
    useTimelineStore.getState().moveClip('clip-1', 'track-2', 0)
    expect(getClip('clip-1')!.trackId).toBe('track-1')
    expect(undoDepth()).toBe(0)
  })

  it('ripple delete on an unlocked track still shifts its own clips (control)', () => {
    setTracks([makeTrack({ clips: [makeClip({ id: 'clip-1' }), makeClip({ id: 'clip-2', position: 10 })] })])
    useTimelineStore.getState().rippleRemoveClip('clip-1')
    expect(getClip('clip-2')!.position).toBe(0) // shifted left by 10
  })
})

// --------------------------------------------------------------------------- #
//  4. Toggle is undoable; guarded no-op is not
// --------------------------------------------------------------------------- #

describe('lock toggles are undoable and idempotent', () => {
  it('setClipLock toggles and round-trips through undo', () => {
    setTracks([makeTrack({ clips: [makeClip()] })])
    useTimelineStore.getState().setClipLock('clip-1', true)
    expect(getClip('clip-1')!.locked).toBe(true)
    expect(undoDepth()).toBe(1)
    useUndoStore.getState().undo()
    expect(getClip('clip-1')!.locked).toBeUndefined()
  })

  it('setClipLock is a no-op (no undo entry) when the value is unchanged', () => {
    setTracks([makeTrack({ clips: [makeClip({ locked: true })] })])
    useTimelineStore.getState().setClipLock('clip-1', true)
    expect(undoDepth()).toBe(0)
  })

  it('setTrackLock toggles and round-trips through undo', () => {
    setTracks([makeTrack()])
    useTimelineStore.getState().setTrackLock('track-1', true)
    expect(useTimelineStore.getState().tracks[0].locked).toBe(true)
    expect(undoDepth()).toBe(1)
    useUndoStore.getState().undo()
    expect(useTimelineStore.getState().tracks[0].locked).toBeUndefined()
  })
})

// --------------------------------------------------------------------------- #
//  5. Persistence round-trip + trust-boundary
// --------------------------------------------------------------------------- #

function makeProject(trackOver: Record<string, unknown> = {}, clipOver: Record<string, unknown> = {}) {
  return {
    version: '3.0.0',
    id: 'proj-t3',
    created: 1700000000000,
    modified: 1700000000000,
    author: '',
    settings: { resolution: [1920, 1080], frameRate: 30, audioSampleRate: 44100, masterVolume: 1.0, seed: 42 },
    assets: {},
    timeline: {
      duration: 30,
      tracks: [
        {
          id: 'track-01',
          type: 'video',
          name: 'V1',
          color: '#4ade80',
          isMuted: false,
          isSoloed: false,
          clips: [
            { id: 'clip-01', assetId: 'asset-01', trackId: 'track-01', position: 0, duration: 10, inPoint: 0, outPoint: 10, speed: 1, ...clipOver },
          ],
          effectChain: [],
          automationLanes: [],
          ...trackOver,
        },
      ],
      markers: [],
      loopRegion: null,
    },
  }
}

describe('lock survives persistence and is guarded at the trust boundary', () => {
  beforeEach(() => {
    useProjectStore.getState().resetProject()
    useTimelineStore.getState().reset()
    useUndoStore.getState().clear()
    useToastStore.setState({ toasts: [] })
  })

  it('clip.locked=true and track.locked=true survive hydrate (load fidelity)', () => {
    const data = makeProject({ locked: true }, { locked: true })
    expect(validateProject(data)).toBe(true)
    hydrateStores(data as any)
    // M.1 (Master-Out Bus PRD): no Master track in this fixture -> hydrate
    // injects one (appended after — the locked video track stays index 0).
    const tracks = useTimelineStore.getState().tracks
    expect(tracks).toHaveLength(2)
    expect(tracks[0].locked).toBe(true)
    expect(tracks[0].clips[0].locked).toBe(true)
  })

  it('a full serialize -> hydrate round trip preserves both locks', () => {
    // Build state in the store, serialize, reset, hydrate, compare.
    setTracks([makeTrack({ locked: true, clips: [makeClip({ locked: true })] })])
    const json = serializeProject()
    const parsed = JSON.parse(json)
    // The persisted JSON carries the flags on the track + clip.
    expect(parsed.timeline.tracks[0].locked).toBe(true)
    expect(parsed.timeline.tracks[0].clips[0].locked).toBe(true)

    useProjectStore.getState().resetProject()
    useTimelineStore.getState().reset()
    hydrateStores(parsed)
    const tracks = useTimelineStore.getState().tracks
    expect(tracks[0].locked).toBe(true)
    expect(tracks[0].clips[0].locked).toBe(true)
  })

  it('a non-boolean persisted locked value is dropped to undefined (trust boundary)', () => {
    const data = makeProject({ locked: 'yes' }, { locked: 1 })
    hydrateStores(data as any)
    const tracks = useTimelineStore.getState().tracks
    expect(tracks[0].locked).toBeUndefined()
    expect(tracks[0].clips[0].locked).toBeUndefined()
  })

  it('a project without lock fields loads clean (backward compat)', () => {
    const data = makeProject()
    hydrateStores(data as any)
    const tracks = useTimelineStore.getState().tracks
    expect(tracks[0].locked).toBeUndefined()
    expect(tracks[0].clips[0].locked).toBeUndefined()
  })
})
