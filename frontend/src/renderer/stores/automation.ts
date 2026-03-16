/**
 * Automation store — manages automation lanes for timeline-locked parameter recording.
 * Lanes are keyed by trackId, each containing AutomationLane[] with points.
 * All mutations go through the undo system.
 */
import { create } from 'zustand'
import type { AutomationLane, AutomationPoint } from '../../shared/types'
import { useUndoStore } from './undo'
import { simplifyPoints } from '../utils/automation-simplify'

export type AutomationMode = 'read' | 'latch' | 'touch' | 'draw'

interface AutomationClipboard {
  points: AutomationPoint[]
  duration: number
}

interface AutomationState {
  lanes: Record<string, AutomationLane[]>
  mode: AutomationMode
  armedTrackId: string | null
  recordingParamPath: string | null
  clipboard: AutomationClipboard | null

  // Lane CRUD
  addLane: (trackId: string, effectId: string, paramKey: string, color: string) => void
  removeLane: (trackId: string, laneId: string) => void
  clearLane: (trackId: string, laneId: string) => void
  setLaneVisible: (trackId: string, laneId: string, visible: boolean) => void
  simplifyLane: (trackId: string, laneId: string, tolerance: number) => void

  // Point CRUD
  addPoint: (trackId: string, laneId: string, time: number, value: number, curve?: number) => void
  removePoint: (trackId: string, laneId: string, pointIndex: number) => void
  updatePoint: (trackId: string, laneId: string, pointIndex: number, updates: Partial<AutomationPoint>) => void
  setPoints: (trackId: string, laneId: string, points: AutomationPoint[]) => void

  // Recording state
  setMode: (mode: AutomationMode) => void
  armTrack: (trackId: string | null) => void
  setRecordingParamPath: (path: string | null) => void

  // Clipboard
  copyRegion: (trackId: string, laneId: string, startTime: number, endTime: number) => void
  pasteAtPlayhead: (trackId: string, laneId: string, playheadTime: number) => void

  // Selectors
  getLanesForTrack: (trackId: string) => AutomationLane[]
  getLanesForEffect: (effectId: string) => AutomationLane[]
  getAllLanes: () => AutomationLane[]

  // Bulk operations
  resetAutomation: () => void
  loadAutomation: (lanes: Record<string, AutomationLane[]>) => void
}

let nextLaneId = 1

function insertPointSorted(points: AutomationPoint[], point: AutomationPoint): AutomationPoint[] {
  const result = [...points]
  let insertIdx = result.length
  for (let i = 0; i < result.length; i++) {
    if (result[i].time >= point.time) {
      insertIdx = i
      break
    }
  }
  result.splice(insertIdx, 0, point)
  return result
}

export const useAutomationStore = create<AutomationState>((set, get) => ({
  lanes: {},
  mode: 'read',
  armedTrackId: null,
  recordingParamPath: null,
  clipboard: null,

  addLane: (trackId, effectId, paramKey, color) => {
    const laneId = `auto-${Date.now()}-${nextLaneId++}`
    const newLane: AutomationLane = {
      id: laneId,
      paramPath: `${effectId}.${paramKey}`,
      color,
      isVisible: true,
      points: [],
    }

    const forward = () => {
      const current = { ...get().lanes }
      current[trackId] = [...(current[trackId] ?? []), newLane]
      set({ lanes: current })
    }
    const inverse = () => {
      const current = { ...get().lanes }
      current[trackId] = (current[trackId] ?? []).filter((l) => l.id !== laneId)
      if (current[trackId].length === 0) delete current[trackId]
      set({ lanes: current })
    }

    useUndoStore.getState().execute({
      forward,
      inverse,
      description: `Add automation lane for ${paramKey}`,
      timestamp: Date.now(),
    })
  },

  removeLane: (trackId, laneId) => {
    const trackLanes = get().lanes[trackId]
    if (!trackLanes) return
    const index = trackLanes.findIndex((l) => l.id === laneId)
    if (index === -1) return
    const removed = trackLanes[index]

    const forward = () => {
      const current = { ...get().lanes }
      current[trackId] = (current[trackId] ?? []).filter((l) => l.id !== laneId)
      if (current[trackId].length === 0) delete current[trackId]
      set({ lanes: current })
    }
    const inverse = () => {
      const current = { ...get().lanes }
      const arr = [...(current[trackId] ?? [])]
      arr.splice(index, 0, removed)
      current[trackId] = arr
      set({ lanes: current })
    }

    useUndoStore.getState().execute({
      forward,
      inverse,
      description: `Remove automation lane`,
      timestamp: Date.now(),
    })
  },

  clearLane: (trackId, laneId) => {
    const trackLanes = get().lanes[trackId]
    if (!trackLanes) return
    const lane = trackLanes.find((l) => l.id === laneId)
    if (!lane) return
    const oldPoints = [...lane.points]

    const forward = () => {
      const current = { ...get().lanes }
      current[trackId] = (current[trackId] ?? []).map((l) =>
        l.id === laneId ? { ...l, points: [] } : l,
      )
      set({ lanes: current })
    }
    const inverse = () => {
      const current = { ...get().lanes }
      current[trackId] = (current[trackId] ?? []).map((l) =>
        l.id === laneId ? { ...l, points: oldPoints } : l,
      )
      set({ lanes: current })
    }

    useUndoStore.getState().execute({
      forward,
      inverse,
      description: `Clear automation lane`,
      timestamp: Date.now(),
    })
  },

  setLaneVisible: (trackId, laneId, visible) => {
    const trackLanes = get().lanes[trackId]
    if (!trackLanes) return
    const lane = trackLanes.find((l) => l.id === laneId)
    if (!lane) return
    const oldVisible = lane.isVisible

    const forward = () => {
      const current = { ...get().lanes }
      current[trackId] = (current[trackId] ?? []).map((l) =>
        l.id === laneId ? { ...l, isVisible: visible } : l,
      )
      set({ lanes: current })
    }
    const inverse = () => {
      const current = { ...get().lanes }
      current[trackId] = (current[trackId] ?? []).map((l) =>
        l.id === laneId ? { ...l, isVisible: oldVisible } : l,
      )
      set({ lanes: current })
    }

    useUndoStore.getState().execute({
      forward,
      inverse,
      description: `${visible ? 'Show' : 'Hide'} automation lane`,
      timestamp: Date.now(),
    })
  },

  simplifyLane: (trackId, laneId, tolerance) => {
    const trackLanes = get().lanes[trackId]
    if (!trackLanes) return
    const lane = trackLanes.find((l) => l.id === laneId)
    if (!lane || lane.points.length <= 2) return
    const oldPoints = [...lane.points]
    const simplified = simplifyPoints(lane.points, tolerance)

    const forward = () => {
      const current = { ...get().lanes }
      current[trackId] = (current[trackId] ?? []).map((l) =>
        l.id === laneId ? { ...l, points: simplified } : l,
      )
      set({ lanes: current })
    }
    const inverse = () => {
      const current = { ...get().lanes }
      current[trackId] = (current[trackId] ?? []).map((l) =>
        l.id === laneId ? { ...l, points: oldPoints } : l,
      )
      set({ lanes: current })
    }

    useUndoStore.getState().execute({
      forward,
      inverse,
      description: `Simplify automation lane`,
      timestamp: Date.now(),
    })
  },

  addPoint: (trackId, laneId, time, value, curve = 0) => {
    const trackLanes = get().lanes[trackId]
    if (!trackLanes) return
    const lane = trackLanes.find((l) => l.id === laneId)
    if (!lane) return
    const oldPoints = [...lane.points]
    const newPoint: AutomationPoint = { time, value, curve }
    const newPoints = insertPointSorted(lane.points, newPoint)

    const forward = () => {
      const current = { ...get().lanes }
      current[trackId] = (current[trackId] ?? []).map((l) =>
        l.id === laneId ? { ...l, points: newPoints } : l,
      )
      set({ lanes: current })
    }
    const inverse = () => {
      const current = { ...get().lanes }
      current[trackId] = (current[trackId] ?? []).map((l) =>
        l.id === laneId ? { ...l, points: oldPoints } : l,
      )
      set({ lanes: current })
    }

    useUndoStore.getState().execute({
      forward,
      inverse,
      description: `Add automation point`,
      timestamp: Date.now(),
    })
  },

  removePoint: (trackId, laneId, pointIndex) => {
    const trackLanes = get().lanes[trackId]
    if (!trackLanes) return
    const lane = trackLanes.find((l) => l.id === laneId)
    if (!lane || pointIndex < 0 || pointIndex >= lane.points.length) return
    const oldPoints = [...lane.points]
    const newPoints = lane.points.filter((_, i) => i !== pointIndex)

    const forward = () => {
      const current = { ...get().lanes }
      current[trackId] = (current[trackId] ?? []).map((l) =>
        l.id === laneId ? { ...l, points: newPoints } : l,
      )
      set({ lanes: current })
    }
    const inverse = () => {
      const current = { ...get().lanes }
      current[trackId] = (current[trackId] ?? []).map((l) =>
        l.id === laneId ? { ...l, points: oldPoints } : l,
      )
      set({ lanes: current })
    }

    useUndoStore.getState().execute({
      forward,
      inverse,
      description: `Remove automation point`,
      timestamp: Date.now(),
    })
  },

  updatePoint: (trackId, laneId, pointIndex, updates) => {
    const trackLanes = get().lanes[trackId]
    if (!trackLanes) return
    const lane = trackLanes.find((l) => l.id === laneId)
    if (!lane || pointIndex < 0 || pointIndex >= lane.points.length) return
    const oldPoints = [...lane.points]
    const newPoints = [...lane.points]
    newPoints[pointIndex] = { ...newPoints[pointIndex], ...updates }
    // Re-sort if time changed
    if (updates.time !== undefined) {
      newPoints.sort((a, b) => a.time - b.time)
    }

    const forward = () => {
      const current = { ...get().lanes }
      current[trackId] = (current[trackId] ?? []).map((l) =>
        l.id === laneId ? { ...l, points: newPoints } : l,
      )
      set({ lanes: current })
    }
    const inverse = () => {
      const current = { ...get().lanes }
      current[trackId] = (current[trackId] ?? []).map((l) =>
        l.id === laneId ? { ...l, points: oldPoints } : l,
      )
      set({ lanes: current })
    }

    useUndoStore.getState().execute({
      forward,
      inverse,
      description: `Update automation point`,
      timestamp: Date.now(),
    })
  },

  setPoints: (trackId, laneId, points) => {
    const trackLanes = get().lanes[trackId]
    if (!trackLanes) return
    const lane = trackLanes.find((l) => l.id === laneId)
    if (!lane) return
    const oldPoints = [...lane.points]

    const forward = () => {
      const current = { ...get().lanes }
      current[trackId] = (current[trackId] ?? []).map((l) =>
        l.id === laneId ? { ...l, points: [...points] } : l,
      )
      set({ lanes: current })
    }
    const inverse = () => {
      const current = { ...get().lanes }
      current[trackId] = (current[trackId] ?? []).map((l) =>
        l.id === laneId ? { ...l, points: oldPoints } : l,
      )
      set({ lanes: current })
    }

    useUndoStore.getState().execute({
      forward,
      inverse,
      description: `Set automation points`,
      timestamp: Date.now(),
    })
  },

  setMode: (mode) => set({ mode }),
  armTrack: (trackId) => set({ armedTrackId: trackId }),
  setRecordingParamPath: (path) => set({ recordingParamPath: path }),

  copyRegion: (trackId, laneId, startTime, endTime) => {
    const trackLanes = get().lanes[trackId]
    if (!trackLanes) return
    const lane = trackLanes.find((l) => l.id === laneId)
    if (!lane) return

    const regionPoints = lane.points
      .filter((p) => p.time >= startTime && p.time <= endTime)
      .map((p) => ({ ...p, time: p.time - startTime }))

    set({ clipboard: { points: regionPoints, duration: endTime - startTime } })
  },

  pasteAtPlayhead: (trackId, laneId, playheadTime) => {
    const { clipboard } = get()
    if (!clipboard || clipboard.points.length === 0) return
    const trackLanes = get().lanes[trackId]
    if (!trackLanes) return
    const lane = trackLanes.find((l) => l.id === laneId)
    if (!lane) return

    const oldPoints = [...lane.points]
    const pastedPoints = clipboard.points.map((p) => ({
      ...p,
      time: p.time + playheadTime,
    }))

    // Merge pasted points into existing, sorted by time
    let merged = [...lane.points]
    for (const pp of pastedPoints) {
      merged = insertPointSorted(merged, pp)
    }

    const forward = () => {
      const current = { ...get().lanes }
      current[trackId] = (current[trackId] ?? []).map((l) =>
        l.id === laneId ? { ...l, points: merged } : l,
      )
      set({ lanes: current })
    }
    const inverse = () => {
      const current = { ...get().lanes }
      current[trackId] = (current[trackId] ?? []).map((l) =>
        l.id === laneId ? { ...l, points: oldPoints } : l,
      )
      set({ lanes: current })
    }

    useUndoStore.getState().execute({
      forward,
      inverse,
      description: `Paste automation region`,
      timestamp: Date.now(),
    })
  },

  getLanesForTrack: (trackId) => get().lanes[trackId] ?? [],

  getLanesForEffect: (effectId) => {
    const allLanes: AutomationLane[] = []
    for (const trackLanes of Object.values(get().lanes)) {
      for (const lane of trackLanes) {
        if (lane.paramPath.startsWith(`${effectId}.`)) {
          allLanes.push(lane)
        }
      }
    }
    return allLanes
  },

  getAllLanes: () => {
    const allLanes: AutomationLane[] = []
    for (const trackLanes of Object.values(get().lanes)) {
      allLanes.push(...trackLanes)
    }
    return allLanes
  },

  resetAutomation: () =>
    set({
      lanes: {},
      mode: 'read',
      armedTrackId: null,
      recordingParamPath: null,
      clipboard: null,
    }),

  loadAutomation: (lanes) => {
    const validated: Record<string, AutomationLane[]> = {}
    for (const [trackId, trackLanes] of Object.entries(lanes)) {
      if (!Array.isArray(trackLanes)) continue
      const validLanes = trackLanes.filter((lane): lane is AutomationLane => {
        if (typeof lane !== 'object' || lane === null) return false
        if (typeof lane.id !== 'string' || !lane.id) return false
        if (typeof lane.paramPath !== 'string') return false
        if (!Array.isArray(lane.points)) return false
        return true
      }).map((lane) => ({
        ...lane,
        // Filter out invalid points and sort by time for binary search
        points: lane.points
          .filter((p) =>
            typeof p === 'object' && p !== null &&
            typeof p.time === 'number' && Number.isFinite(p.time) &&
            typeof p.value === 'number' && Number.isFinite(p.value),
          )
          .sort((a, b) => a.time - b.time),
      }))
      if (validLanes.length > 0) {
        validated[trackId] = validLanes
      }
    }
    set({ lanes: validated })
  },
}))
