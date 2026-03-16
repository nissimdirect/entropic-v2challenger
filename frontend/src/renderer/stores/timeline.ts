import { create } from 'zustand'
import type { Track, Clip, Marker, BlendMode } from '../../shared/types'
import { LIMITS } from '../../shared/limits'
import { randomUUID } from '../utils'
import { undoable } from './undo'
import { useToastStore } from './toast'

interface TimelineState {
  // State
  tracks: Track[]
  playheadTime: number
  duration: number
  markers: Marker[]
  loopRegion: { in: number; out: number } | null
  zoom: number
  scrollX: number
  selectedTrackId: string | null
  selectedClipId: string | null

  // Track actions
  addTrack: (name: string, color: string) => void
  removeTrack: (id: string) => void
  reorderTrack: (fromIdx: number, toIdx: number) => void
  setTrackOpacity: (id: string, opacity: number) => void
  setTrackBlendMode: (id: string, mode: BlendMode) => void
  toggleMute: (id: string) => void
  toggleSolo: (id: string) => void
  renameTrack: (id: string, name: string) => void

  // Clip actions
  addClip: (trackId: string, clip: Clip) => void
  removeClip: (clipId: string) => void
  moveClip: (clipId: string, newTrackId: string, newPosition: number) => void
  trimClipIn: (clipId: string, newInPoint: number) => void
  trimClipOut: (clipId: string, newOutPoint: number) => void
  splitClip: (clipId: string, time: number) => void
  setClipSpeed: (clipId: string, speed: number) => void

  // Playhead
  setPlayheadTime: (t: number) => void
  setDuration: (d: number) => void

  // Markers
  addMarker: (time: number, label: string, color: string) => void
  removeMarker: (id: string) => void
  moveMarker: (id: string, newTime: number) => void

  // Loop
  setLoopRegion: (inTime: number, outTime: number) => void
  clearLoopRegion: () => void

  // View
  setZoom: (pxPerSec: number) => void
  setScrollX: (px: number) => void

  // Selection
  selectTrack: (id: string | null) => void
  selectClip: (id: string | null) => void

  // Helpers
  getActiveClipsAtTime: (time: number) => { track: Track; clip: Clip }[]
  getTimelineDuration: () => number

  // Reset
  reset: () => void
}

function makeEmptyTrack(name: string, color: string, id?: string): Track {
  return {
    id: id ?? randomUUID(),
    type: 'video',
    name,
    color,
    isMuted: false,
    isSoloed: false,
    opacity: 1.0,
    blendMode: 'normal',
    clips: [],
    effectChain: [],
    automationLanes: [],
  }
}

function recalcDuration(tracks: Track[]): number {
  let max = 0
  for (const track of tracks) {
    for (const clip of track.clips) {
      const end = clip.position + clip.duration
      if (end > max) max = end
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
  zoom: 50,
  scrollX: 0,
  selectedTrackId: null as string | null,
  selectedClipId: null as string | null,
}

export const useTimelineStore = create<TimelineState>((set, get) => ({
  ...INITIAL_STATE,

  // --- Track actions ---

  addTrack: (name, color) => {
    if (get().tracks.length >= LIMITS.MAX_TRACKS) {
      useToastStore.getState().addToast({ level: 'warning', message: `Track limit (${LIMITS.MAX_TRACKS}) reached`, source: 'timeline' })
      return
    }
    const trackId = randomUUID()
    const oldTracks = get().tracks

    undoable(
      'Add track',
      () => {
        const track = makeEmptyTrack(name, color, trackId)
        set({ tracks: [...get().tracks, track] })
      },
      () => {
        const tracks = get().tracks.filter((t) => t.id !== trackId)
        set({ tracks, duration: recalcDuration(tracks) })
      },
    )
  },

  removeTrack: (id) => {
    const track = get().tracks.find((t) => t.id === id)
    if (!track) return
    // Capture full track for restoration
    const removedTrack = { ...track, clips: [...track.clips], effectChain: [...track.effectChain], automationLanes: [...track.automationLanes] }
    const prevId = (() => {
      const idx = get().tracks.findIndex((t) => t.id === id)
      return idx > 0 ? get().tracks[idx - 1].id : null
    })()

    undoable(
      `Remove track "${track.name}"`,
      () => {
        const state = get()
        const tracks = state.tracks.filter((t) => t.id !== id)
        const selectedTrackId = state.selectedTrackId === id ? null : state.selectedTrackId
        const selectedClipId =
          state.selectedClipId && track.clips.some((c) => c.id === state.selectedClipId)
            ? null
            : state.selectedClipId
        set({ tracks, selectedTrackId, selectedClipId, duration: recalcDuration(tracks) })
      },
      () => {
        const tracks = [...get().tracks]
        const insertIdx = prevId !== null ? tracks.findIndex((t) => t.id === prevId) + 1 : 0
        tracks.splice(insertIdx, 0, removedTrack)
        set({ tracks, duration: recalcDuration(tracks) })
      },
    )
  },

  reorderTrack: (fromIdx, toIdx) => {
    const tracks = get().tracks
    if (fromIdx < 0 || fromIdx >= tracks.length) return
    if (toIdx < 0 || toIdx >= tracks.length) return
    if (fromIdx === toIdx) return
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

  setTrackOpacity: (id, opacity) => {
    const track = get().tracks.find((t) => t.id === id)
    if (!track) return
    const oldOpacity = track.opacity
    const clamped = Math.max(0, Math.min(1, opacity))

    undoable(
      `Set track opacity`,
      () => set({ tracks: get().tracks.map((t) => (t.id === id ? { ...t, opacity: clamped } : t)) }),
      () => set({ tracks: get().tracks.map((t) => (t.id === id ? { ...t, opacity: oldOpacity } : t)) }),
    )
  },

  setTrackBlendMode: (id, mode) => {
    const track = get().tracks.find((t) => t.id === id)
    if (!track) return
    const oldMode = track.blendMode

    undoable(
      `Set blend mode`,
      () => set({ tracks: get().tracks.map((t) => (t.id === id ? { ...t, blendMode: mode } : t)) }),
      () => set({ tracks: get().tracks.map((t) => (t.id === id ? { ...t, blendMode: oldMode } : t)) }),
    )
  },

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
        const selectedClipId = state.selectedClipId === clipId ? null : state.selectedClipId
        set({ tracks, selectedClipId, duration: recalcDuration(tracks) })
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
    const oldTrackId = oldClip.trackId
    const oldPosition = oldClip.position

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
      },
    )
  },

  trimClipIn: (clipId, newInPoint) => {
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

  splitClip: (clipId, time) => {
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
      },
    )
  },

  setClipSpeed: (clipId, speed) => {
    let oldSpeed = 1
    for (const track of get().tracks) {
      const clip = track.clips.find((c) => c.id === clipId)
      if (clip) { oldSpeed = clip.speed; break }
    }
    const clamped = Math.max(0.1, speed)

    undoable(
      'Set clip speed',
      () => set({
        tracks: get().tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) => (c.id === clipId ? { ...c, speed: clamped } : c)),
        })),
      }),
      () => set({
        tracks: get().tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) => (c.id === clipId ? { ...c, speed: oldSpeed } : c)),
        })),
      }),
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

  // --- View (NOT undoable — UI state) ---

  setZoom: (pxPerSec) => set({ zoom: Math.max(10, Math.min(200, pxPerSec)) }),
  setScrollX: (px) => set({ scrollX: Math.max(0, px) }),

  // --- Selection (NOT undoable — UI state) ---

  selectTrack: (id) => set({ selectedTrackId: id }),
  selectClip: (id) => set({ selectedClipId: id }),

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

  // --- Reset ---

  reset: () => set(INITIAL_STATE),
}))
