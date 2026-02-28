import { create } from 'zustand'
import type { Track, Clip, Marker, BlendMode } from '../../shared/types'
import { randomUUID } from '../utils'

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

function makeEmptyTrack(name: string, color: string): Track {
  return {
    id: randomUUID(),
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

  addTrack: (name, color) =>
    set((state) => {
      const track = makeEmptyTrack(name, color)
      return { tracks: [...state.tracks, track] }
    }),

  removeTrack: (id) =>
    set((state) => {
      const tracks = state.tracks.filter((t) => t.id !== id)
      const selectedTrackId = state.selectedTrackId === id ? null : state.selectedTrackId
      const selectedClipId =
        state.selectedClipId &&
        state.tracks.find((t) => t.id === id)?.clips.some((c) => c.id === state.selectedClipId)
          ? null
          : state.selectedClipId
      return { tracks, selectedTrackId, selectedClipId, duration: recalcDuration(tracks) }
    }),

  reorderTrack: (fromIdx, toIdx) =>
    set((state) => {
      if (fromIdx < 0 || fromIdx >= state.tracks.length) return state
      if (toIdx < 0 || toIdx >= state.tracks.length) return state
      const tracks = [...state.tracks]
      const [moved] = tracks.splice(fromIdx, 1)
      tracks.splice(toIdx, 0, moved)
      return { tracks }
    }),

  setTrackOpacity: (id, opacity) =>
    set((state) => ({
      tracks: state.tracks.map((t) =>
        t.id === id ? { ...t, opacity: Math.max(0, Math.min(1, opacity)) } : t,
      ),
    })),

  setTrackBlendMode: (id, mode) =>
    set((state) => ({
      tracks: state.tracks.map((t) => (t.id === id ? { ...t, blendMode: mode } : t)),
    })),

  toggleMute: (id) =>
    set((state) => ({
      tracks: state.tracks.map((t) => (t.id === id ? { ...t, isMuted: !t.isMuted } : t)),
    })),

  toggleSolo: (id) =>
    set((state) => ({
      tracks: state.tracks.map((t) => (t.id === id ? { ...t, isSoloed: !t.isSoloed } : t)),
    })),

  renameTrack: (id, name) =>
    set((state) => ({
      tracks: state.tracks.map((t) => (t.id === id ? { ...t, name } : t)),
    })),

  // --- Clip actions ---

  addClip: (trackId, clip) =>
    set((state) => {
      const tracks = state.tracks.map((t) =>
        t.id === trackId ? { ...t, clips: [...t.clips, { ...clip, trackId }] } : t,
      )
      return { tracks, duration: recalcDuration(tracks) }
    }),

  removeClip: (clipId) =>
    set((state) => {
      const tracks = state.tracks.map((t) => ({
        ...t,
        clips: t.clips.filter((c) => c.id !== clipId),
      }))
      const selectedClipId = state.selectedClipId === clipId ? null : state.selectedClipId
      return { tracks, selectedClipId, duration: recalcDuration(tracks) }
    }),

  moveClip: (clipId, newTrackId, newPosition) =>
    set((state) => {
      let movedClip: Clip | null = null
      // Remove from old track
      let tracks = state.tracks.map((t) => {
        const clip = t.clips.find((c) => c.id === clipId)
        if (clip) {
          movedClip = { ...clip, trackId: newTrackId, position: newPosition }
          return { ...t, clips: t.clips.filter((c) => c.id !== clipId) }
        }
        return t
      })
      if (!movedClip) return state
      // Add to new track
      tracks = tracks.map((t) =>
        t.id === newTrackId ? { ...t, clips: [...t.clips, movedClip!] } : t,
      )
      return { tracks, duration: recalcDuration(tracks) }
    }),

  trimClipIn: (clipId, newInPoint) =>
    set((state) => {
      const tracks = state.tracks.map((t) => ({
        ...t,
        clips: t.clips.map((c) => {
          if (c.id !== clipId) return c
          if (newInPoint < 0 || newInPoint >= c.outPoint) return c
          const delta = newInPoint - c.inPoint
          return {
            ...c,
            inPoint: newInPoint,
            position: c.position + delta,
            duration: c.duration - delta,
          }
        }),
      }))
      return { tracks, duration: recalcDuration(tracks) }
    }),

  trimClipOut: (clipId, newOutPoint) =>
    set((state) => {
      const tracks = state.tracks.map((t) => ({
        ...t,
        clips: t.clips.map((c) => {
          if (c.id !== clipId) return c
          if (newOutPoint <= c.inPoint) return c
          return {
            ...c,
            outPoint: newOutPoint,
            duration: newOutPoint - c.inPoint,
          }
        }),
      }))
      return { tracks, duration: recalcDuration(tracks) }
    }),

  splitClip: (clipId, time) =>
    set((state) => {
      const tracks = state.tracks.map((t) => {
        const clipIdx = t.clips.findIndex((c) => c.id === clipId)
        if (clipIdx === -1) return t

        const clip = t.clips[clipIdx]
        const clipStart = clip.position
        const clipEnd = clip.position + clip.duration

        // Can't split at or outside clip boundaries
        if (time <= clipStart || time >= clipEnd) return t

        const splitOffset = time - clipStart
        const splitInSource = clip.inPoint + splitOffset * clip.speed

        const clipA: Clip = {
          ...clip,
          duration: splitOffset,
          outPoint: splitInSource,
        }

        const clipB: Clip = {
          id: randomUUID(),
          assetId: clip.assetId,
          trackId: clip.trackId,
          position: time,
          duration: clip.duration - splitOffset,
          inPoint: splitInSource,
          outPoint: clip.outPoint,
          speed: clip.speed,
        }

        const clips = [...t.clips]
        clips.splice(clipIdx, 1, clipA, clipB)
        return { ...t, clips }
      })
      return { tracks }
    }),

  setClipSpeed: (clipId, speed) =>
    set((state) => ({
      tracks: state.tracks.map((t) => ({
        ...t,
        clips: t.clips.map((c) => (c.id === clipId ? { ...c, speed: Math.max(0.1, speed) } : c)),
      })),
    })),

  // --- Playhead ---

  setPlayheadTime: (t) => set({ playheadTime: t }),
  setDuration: (d) => set({ duration: d }),

  // --- Markers ---

  addMarker: (time, label, color) =>
    set((state) => ({
      markers: [...state.markers, { id: randomUUID(), time, label, color }],
    })),

  removeMarker: (id) =>
    set((state) => ({
      markers: state.markers.filter((m) => m.id !== id),
    })),

  moveMarker: (id, newTime) =>
    set((state) => ({
      markers: state.markers.map((m) => (m.id === id ? { ...m, time: newTime } : m)),
    })),

  // --- Loop ---

  setLoopRegion: (inTime, outTime) => set({ loopRegion: { in: inTime, out: outTime } }),
  clearLoopRegion: () => set({ loopRegion: null }),

  // --- View ---

  setZoom: (pxPerSec) => set({ zoom: Math.max(10, Math.min(200, pxPerSec)) }),
  setScrollX: (px) => set({ scrollX: Math.max(0, px) }),

  // --- Selection ---

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
