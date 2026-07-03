/**
 * Automation store — manages automation lanes for timeline-locked parameter recording.
 * Lanes are keyed by trackId, each containing AutomationLane[] with points.
 * All mutations go through the undo system.
 */
import { create } from 'zustand'
import type { AutomationLane, AutomationPoint, TriggerMode, ADSREnvelope, InterpolationMode } from '../../shared/types'
import { isTriggerLane } from '../utils/automation-evaluate'
import { validateLaneAxisBinding, type LaneAxisBinding, type Axis } from '../../shared/axis-binding'

// PR-B Commit-2: SPEC-2 Tier-1 also restricts the DOMAIN to t/y/x (c/f/l are
// Tier-4+). The canonical validateLaneAxisBinding only tier-gates bindingRule, so
// we add this domain guard to match the spec. Returns null if ok, else an error.
const TIER1_DOMAINS: ReadonlyArray<Axis> = ['t', 'y', 'x']
// P5b.21 (B9): the shared TIER_1_BINDING_RULES widened to the 4 mod-routing
// rules, but lane RENDERING still only implements `broadcast` — so lanes keep
// their own narrower rule set here. Widening lanes would be a half-state
// (accepted but not honored by the lane renderer). Mod-routing edges use the
// widened set via validateModRouteBindingRule in the operator store.
const LANE_TIER1_RULES: ReadonlyArray<LaneAxisBinding['bindingRule']> = ['broadcast']
function validateLaneAxisTier1(binding: LaneAxisBinding): string | null {
  if (!TIER1_DOMAINS.includes(binding.domain)) {
    return `domain '${binding.domain}' requires a later tier; Tier 1 supports t, y, x`
  }
  if (!LANE_TIER1_RULES.includes(binding.bindingRule)) {
    return `bindingRule '${binding.bindingRule}' requires tier 3; lane Tier 1 supports only 'broadcast'`
  }
  return validateLaneAxisBinding(binding, 1)
}

// PR-B Commit-1: map the legacy TriggerMode arg to the unified InterpolationMode.
// 'toggle' has no lane equivalent (it's a Pad behavior) → treated as 'gate'.
function triggerModeToInterp(mode: TriggerMode): InterpolationMode {
  return mode === 'one-shot' ? 'oneShot' : 'gate'
}
import { undoable } from './undo'
import { useToastStore } from './toast'
import { simplifyPoints } from '../utils/automation-simplify'
import type { AutomationRecordMode } from '../utils/automation-record'

export type AutomationMode = 'read' | 'latch' | 'touch' | 'draw'
export type { AutomationRecordMode } from '../utils/automation-record'

interface AutomationClipboard {
  points: AutomationPoint[]
  duration: number
}

// AA.4 — breakpoint selection (marquee-select, move, copy/paste).
// Selection is scoped to a SINGLE (trackId, laneId) at a time — matches how
// the marquee overlay is mounted per-lane (one SVG surface per automation
// lane), mirroring the timeline's per-track clip marquee (MarqueeOverlay.tsx).
// `indices` are indices into that lane's `points` array, always kept sorted
// ascending + unique.
export interface AutomationPointSelection {
  trackId: string
  laneId: string
  indices: number[]
}

/** Quantize grid options — same math as Clip.tsx's `snapPosition` (Cmd+U). */
export interface QuantizeGridOptions {
  enabled: boolean
  bpm: number
  division: number
}

/**
 * Snap a time value to the quantize grid using the SAME grid math as clip
 * editing: gridInterval = (60/bpm) * (4/division). Returns `time` unchanged
 * when quantize is disabled or bpm/division are invalid — mirrors the
 * quantizeEnabled/quantizeDivision toggle in stores/layout.ts (Cmd+U).
 */
function quantizeTime(time: number, quantize?: QuantizeGridOptions): number {
  if (!quantize || !quantize.enabled) return time
  if (!Number.isFinite(quantize.bpm) || quantize.bpm <= 0) return time
  if (!Number.isFinite(quantize.division) || quantize.division <= 0) return time
  const gridInterval = (60 / quantize.bpm) * (4 / quantize.division)
  if (!Number.isFinite(gridInterval) || gridInterval <= 0) return time
  return Math.round(time / gridInterval) * gridInterval
}

// AA.4b — transform box (scale / skew / flatten / ramp). See
// docs/plans/2026-07-03-automation-editing-gestures.md. All four gestures
// (edge-scale, corner-scale, skew, flatten, ramp) are ONE pure affine mapping
// of the selected (time, value) points, parameterized differently per gesture:
//
//   u = normalized time position of a selected point within the selection's
//       own [timeMin, timeMax] span (0 at the earliest selected point, 1 at
//       the latest). Time never skews (only the horizontal axis is genuinely
//       "time"); value skews AS A FUNCTION OF u — that's what turns a flat
//       selection into a ramp.
//
//   newTime  = anchorTime + (time - anchorTime) * timeScale
//   newValue = anchorValue + (value - anchorValue) * lerp(valueScaleLeft, valueScaleRight, u)
//              + lerp(valueShiftLeft, valueShiftRight, u)
//
// - Edge (time) scale:              timeScale != 1, value* untouched (scale 1/1, shift 0/0).
// - Edge (value) scale, no skew:    valueScaleLeft === valueScaleRight (uniform), shift 0/0.
// - Skew ("drag one side down"):    valueScaleLeft = valueScaleRight = 1 (no scale), and
//                                    valueShiftLeft != valueShiftRight (the shift ramps
//                                    linearly across u) — this is what turns flat -> ramp,
//                                    since a pure *scale* of a flat selection is a no-op
//                                    (value - anchorValue === 0 everywhere).
// - Corner scale (both dims):       timeScale != 1 AND valueScaleLeft === valueScaleRight != 1.
// - Flatten:                        valueScaleLeft = valueScaleRight = 0, shiftLeft = shiftRight
//                                    = target value (scale-to-zero collapses the range; the
//                                    constant shift places it).
// - Ramp (interior -> line):        valueScaleLeft = valueScaleRight = 0, shiftLeft =
//                                    firstSelected.value, shiftRight = lastSelected.value —
//                                    endpoints land back on their own original value (u=0/1
//                                    reconstruct exactly), interior points land on the
//                                    straight line between them.
export interface BoxTransformParams {
  timeScale: number
  anchorTime: number
  valueScaleLeft: number
  valueScaleRight: number
  valueShiftLeft: number
  valueShiftRight: number
  anchorValue: number
}

export const IDENTITY_TRANSFORM: BoxTransformParams = {
  timeScale: 1,
  anchorTime: 0,
  valueScaleLeft: 1,
  valueScaleRight: 1,
  valueShiftLeft: 0,
  valueShiftRight: 0,
  anchorValue: 0,
}

/** Flatten: collapse every selected point to a single constant `target` value. */
export function flattenParams(target: number): BoxTransformParams {
  return {
    timeScale: 1,
    anchorTime: 0,
    valueScaleLeft: 0,
    valueScaleRight: 0,
    valueShiftLeft: target,
    valueShiftRight: target,
    anchorValue: 0,
  }
}

/** Ramp: straight line from `firstValue` (earliest selected) to `lastValue` (latest selected). */
export function rampParams(firstValue: number, lastValue: number): BoxTransformParams {
  return {
    timeScale: 1,
    anchorTime: 0,
    valueScaleLeft: 0,
    valueScaleRight: 0,
    valueShiftLeft: firstValue,
    valueShiftRight: lastValue,
    anchorValue: 0,
  }
}

/**
 * Pure mapping — applies `params` to the points at `indices`, leaving every
 * other point untouched. Clamps time >= 0 and value to [0, 1] (lane bounds),
 * grid-snaps time when `quantize.enabled`. Does NOT re-sort or mutate the
 * input array (callers that need re-sort + reselect, e.g. the store action
 * below, do that themselves — mirrors moveSelectedPoints' own re-sort step).
 */
export function applyBoxTransform(
  points: AutomationPoint[],
  indices: number[],
  params: BoxTransformParams,
  quantize?: QuantizeGridOptions,
): AutomationPoint[] {
  if (indices.length === 0) return points
  const idxSet = new Set(indices)
  const selectedTimes = indices
    .map((i) => points[i]?.time)
    .filter((t): t is number => typeof t === 'number' && Number.isFinite(t))
  if (selectedTimes.length === 0) return points
  const timeMin = Math.min(...selectedTimes)
  const timeMax = Math.max(...selectedTimes)
  const timeSpan = timeMax - timeMin

  return points.map((p, i) => {
    if (!idxSet.has(i)) return p
    const u = timeSpan > 0 ? (p.time - timeMin) / timeSpan : 0

    let newTime = params.anchorTime + (p.time - params.anchorTime) * params.timeScale
    newTime = Math.max(0, quantizeTime(newTime, quantize))

    const localScale = params.valueScaleLeft + (params.valueScaleRight - params.valueScaleLeft) * u
    const localShift = params.valueShiftLeft + (params.valueShiftRight - params.valueShiftLeft) * u
    let newValue = params.anchorValue + (p.value - params.anchorValue) * localScale + localShift
    newValue = Math.max(0, Math.min(1, newValue))

    return { ...p, time: newTime, value: newValue }
  })
}

interface AutomationState {
  lanes: Record<string, AutomationLane[]>
  mode: AutomationMode
  armedTrackId: string | null
  clipboard: AutomationClipboard | null

  // A4 — write mode for continuous-lane recording (D2 default 'replace' /
  // punch-replace; 'overdub' additively layers new points on top of existing
  // ones instead of overwriting a nearby point). Session-only, like `mode` and
  // `armedTrackId` above — not persisted to the project file.
  recordMode: AutomationRecordMode
  /** Toggle between 'replace' (default, D2) and 'overdub' (additive) write mode. */
  setRecordMode: (mode: AutomationRecordMode) => void

  // SG-3 clause-3: muted lane IDs from the sentinel's lane_aborted reply field.
  // lane_id in the backend reply is "unknown" (the output gate cannot identify
  // the specific modulation lane that produced the corrupt frame), so a non-empty
  // set means "an SG-3 abort is active". Two consumers read it (audit medium #1):
  //   1. App.tsx's render-frame chain build suppresses automation lane payloads
  //      while the set is non-empty (stops re-sending the corrupt automation).
  //   2. LaneBadges (Track.tsx) renders a MUTED badge + dimmed styling on tracks
  //      that have automation lanes while the set is non-empty.
  // The user clears it with `clearSg3Abort()` / `clearAllSg3Aborts()`.
  sg3AbortedLaneIds: ReadonlySet<string>
  /** Mark a lane as SG-3 aborted (from the lane_aborted IPC reply field). */
  markSg3Aborted: (laneId: string) => void
  /** Clear the SG-3 aborted state so the user re-enables the lane. */
  clearSg3Abort: (laneId: string) => void
  /** Clear ALL SG-3 aborted states (re-enable all). */
  clearAllSg3Aborts: () => void

  // Lane CRUD
  addLane: (trackId: string, effectId: string, paramKey: string, color: string) => void
  addTriggerLane: (trackId: string, effectId: string, paramKey: string, color: string, triggerMode: TriggerMode, triggerADSR?: ADSREnvelope) => string | null
  removeLane: (trackId: string, laneId: string) => void
  clearLane: (trackId: string, laneId: string) => void
  setLaneVisible: (trackId: string, laneId: string, visible: boolean) => void
  setLaneAxisBinding: (trackId: string, laneId: string, binding: LaneAxisBinding | undefined) => void
  simplifyLane: (trackId: string, laneId: string, tolerance: number) => void

  // Point CRUD
  addPoint: (trackId: string, laneId: string, time: number, value: number, curve?: number) => void
  removePoint: (trackId: string, laneId: string, pointIndex: number) => void
  updatePoint: (trackId: string, laneId: string, pointIndex: number, updates: Partial<AutomationPoint>) => void
  setPoints: (trackId: string, laneId: string, points: AutomationPoint[]) => void

  // Recording state
  setMode: (mode: AutomationMode) => void
  armTrack: (trackId: string | null) => void
  /** Record a trigger event (key-down/up) to the appropriate trigger lane during overdub */
  recordTriggerEvent: (trackId: string, laneId: string, time: number, eventType: 'trigger' | 'release') => void
  /** Merge retro-captured trigger points into a lane */
  mergeCapturedTriggers: (trackId: string, laneId: string, points: AutomationPoint[]) => void

  // Clipboard
  copyRegion: (trackId: string, laneId: string, startTime: number, endTime: number) => void
  pasteAtPlayhead: (trackId: string, laneId: string, playheadTime: number) => void

  // AA.4 — breakpoint selection
  /** Active breakpoint selection (single lane at a time), or null. */
  selectedPoints: AutomationPointSelection | null
  /**
   * Marquee-select: select every point in `laneId` whose (time, value) falls
   * inside the given box (inclusive bounds). `additive` (shift-drag) unions
   * with the prior selection when it's on the SAME lane; otherwise (or when
   * not additive) replaces the selection outright — mirrors MarqueeOverlay's
   * shift-union behavior for clips.
   */
  selectPointsInRect: (
    trackId: string,
    laneId: string,
    minTime: number,
    maxTime: number,
    minValue: number,
    maxValue: number,
    additive?: boolean,
  ) => void
  /** Select a single point by index. `additive` (shift-click) unions. */
  selectPoint: (trackId: string, laneId: string, index: number, additive?: boolean) => void
  /** Clear the active selection. */
  clearPointSelection: () => void
  /**
   * Move every selected point by (deltaTime, deltaValue), applied against the
   * CURRENT point positions. Time is clamped to >=0, value to [0,1] (lane
   * bounds). When `quantize.enabled`, the resulting time is snapped to the
   * quantize grid (same toggle as clip editing — Cmd+U). Undoable.
   */
  moveSelectedPoints: (deltaTime: number, deltaValue: number, quantize?: QuantizeGridOptions) => void
  /**
   * Copy the selected points into the clipboard, time-shifted so the
   * earliest selected point sits at time 0 — reuses the same clipboard shape
   * as copyRegion(), so pasteAtPlayhead() round-trips selection-based copies
   * exactly like region-based ones.
   */
  copySelectedPoints: () => void

  // AA.4b — transform box (scale / skew / flatten / ramp). See BoxTransformParams
  // doc comment above for the shared affine mapping every gesture parameterizes.
  /**
   * Apply `params` to the current selection as ONE undoable step. `quantize`
   * grid-snaps the resulting time the same way moveSelectedPoints does.
   * `description` labels the undo-history entry (defaults to a generic one so
   * flatten/ramp — which call through this — can give a more specific label).
   */
  transformSelectedPoints: (
    params: BoxTransformParams,
    quantize?: QuantizeGridOptions,
    description?: string,
  ) => void
  /**
   * Collapse the selection to a single constant value — a horizontal line.
   * `mode: 'release'` uses `releaseValue` (e.g. the value under the pointer
   * when the user releases the drag); `mode: 'average'` uses the mean of the
   * currently selected values. ONE undo step (delegates to transformSelectedPoints).
   */
  flattenSelectedPoints: (mode: 'average' | 'release', releaseValue?: number) => void
  /**
   * Replace the selection with a straight line from the earliest selected
   * point to the latest selected point (both keep their own original value;
   * everything between is re-laid onto that line). No-op with < 2 selected
   * points. ONE undo step (delegates to transformSelectedPoints).
   */
  rampSelectedPoints: () => void
  /**
   * Non-undoable raw point replace for a single lane — used ONLY for the
   * transform box's live drag preview (AutomationTransformBox.tsx), which
   * repaints from an origin snapshot on every pointermove and then restores
   * + recommits through transformSelectedPoints (the undoable action) on
   * release. Not for general use — every other mutation should go through an
   * undoable() action.
   */
  setPointsRaw: (trackId: string, laneId: string, points: AutomationPoint[]) => void

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
  clipboard: null,
  recordMode: 'replace',
  sg3AbortedLaneIds: new Set<string>(),
  selectedPoints: null,

  // SG-3 clause-3: mute state actions
  markSg3Aborted: (laneId) => {
    const current = get().sg3AbortedLaneIds
    if (current.has(laneId)) return // already muted — no-op
    set({ sg3AbortedLaneIds: new Set([...current, laneId]) })
  },
  clearSg3Abort: (laneId) => {
    const current = get().sg3AbortedLaneIds
    if (!current.has(laneId)) return
    const next = new Set([...current])
    next.delete(laneId)
    set({ sg3AbortedLaneIds: next })
  },
  clearAllSg3Aborts: () => {
    if (get().sg3AbortedLaneIds.size === 0) return
    set({ sg3AbortedLaneIds: new Set<string>() })
  },


  addLane: (trackId, effectId, paramKey, color) => {
    const laneId = `auto-${Date.now()}-${nextLaneId++}`
    const newLane: AutomationLane = {
      id: laneId,
      paramPath: `${effectId}.${paramKey}`,
      color,
      isVisible: true,
      points: [],
      mode: 'smooth',
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

    undoable(`Add automation lane for ${paramKey}`, forward, inverse)
  },

  addTriggerLane: (trackId, effectId, paramKey, color, triggerMode, triggerADSR) => {
    // Exclusive param ownership: check no other trigger lane owns this param
    const paramPath = `${effectId}.${paramKey}`
    for (const trackLanes of Object.values(get().lanes)) {
      for (const lane of trackLanes) {
        if (isTriggerLane(lane) && lane.paramPath === paramPath) {
          useToastStore.getState().addToast({
            level: 'warning',
            message: `Parameter already mapped to trigger lane "${lane.id}"`,
            source: 'automation',
          })
          return null
        }
      }
    }

    const laneId = `trig-${Date.now()}-${nextLaneId++}`
    const defaultADSR: ADSREnvelope = { attack: 0, decay: 0, sustain: 1, release: 0 }
    const newLane: AutomationLane = {
      id: laneId,
      paramPath,
      color,
      isVisible: true,
      points: [],
      mode: triggerModeToInterp(triggerMode),
      triggerADSR: triggerADSR ?? defaultADSR,
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

    undoable(`Add trigger lane for ${paramKey}`, forward, inverse)
    return laneId
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

    undoable(`Remove automation lane`, forward, inverse)
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

    undoable(`Clear automation lane`, forward, inverse)
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

    undoable(`${visible ? 'Show' : 'Hide'} automation lane`, forward, inverse)
  },

  // PR-B Commit-2: set/clear a lane's B4-lite axis binding (Tier-1 gated).
  // Rejects non-broadcast rules / non-t/y/x domains on write (writer-side validator,
  // mirrors backend modulation.schema.validate_for_save). Pass undefined to clear.
  setLaneAxisBinding: (trackId, laneId, binding) => {
    const trackLanes = get().lanes[trackId]
    if (!trackLanes) return
    const lane = trackLanes.find((l) => l.id === laneId)
    if (!lane) return

    if (binding) {
      const err = validateLaneAxisTier1(binding)
      if (err) {
        useToastStore.getState().addToast({ level: 'warning', message: err, source: 'automation' })
        return
      }
    }
    const oldBinding = lane.axisBinding

    const forward = () => {
      const current = { ...get().lanes }
      current[trackId] = (current[trackId] ?? []).map((l) =>
        l.id === laneId ? { ...l, axisBinding: binding } : l,
      )
      set({ lanes: current })
    }
    const inverse = () => {
      const current = { ...get().lanes }
      current[trackId] = (current[trackId] ?? []).map((l) =>
        l.id === laneId ? { ...l, axisBinding: oldBinding } : l,
      )
      set({ lanes: current })
    }

    undoable(binding ? `Set lane axis → ${binding.domain}` : 'Clear lane axis', forward, inverse)
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

    undoable(`Simplify automation lane`, forward, inverse)
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

    undoable(`Add automation point`, forward, inverse)
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

    undoable(`Remove automation point`, forward, inverse)
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

    undoable(`Update automation point`, forward, inverse)
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

    undoable(`Set automation points`, forward, inverse)
  },

  setMode: (mode) => set({ mode }),
  armTrack: (trackId) => set({ armedTrackId: trackId }),
  setRecordMode: (recordMode) => set({ recordMode }),

  recordTriggerEvent: (trackId, laneId, time, eventType) => {
    const trackLanes = get().lanes[trackId]
    if (!trackLanes) return
    const lane = trackLanes.find((l) => l.id === laneId)
    if (!lane || !isTriggerLane(lane)) return

    // Clamp value to exactly 0 or 1 (square-wave, numeric trust boundary)
    const value = eventType === 'trigger' ? 1.0 : 0.0
    const newPoint: AutomationPoint = { time, value, curve: 0 }
    const newPoints = insertPointSorted([...lane.points], newPoint)

    const oldPoints = [...lane.points]
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

    // Uses undo transaction when inside overdub recording pass
    undoable(`Record trigger ${eventType}`, forward, inverse)
  },

  mergeCapturedTriggers: (trackId, laneId, points) => {
    const trackLanes = get().lanes[trackId]
    if (!trackLanes) return
    const lane = trackLanes.find((l) => l.id === laneId)
    if (!lane || !isTriggerLane(lane)) return

    const oldPoints = [...lane.points]
    // Merge and sort
    const merged = [...lane.points, ...points].sort((a, b) => a.time - b.time)

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

    undoable(`Merge captured trigger automation`, forward, inverse)
  },

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

    undoable(`Paste automation region`, forward, inverse)
  },

  // AA.4 — breakpoint selection

  selectPointsInRect: (trackId, laneId, minTime, maxTime, minValue, maxValue, additive = false) => {
    const trackLanes = get().lanes[trackId]
    const lane = trackLanes?.find((l) => l.id === laneId)
    if (!lane) return

    const lo = Math.min(minTime, maxTime)
    const hi = Math.max(minTime, maxTime)
    const vLo = Math.min(minValue, maxValue)
    const vHi = Math.max(minValue, maxValue)

    const hits = lane.points.reduce<number[]>((acc, p, i) => {
      if (p.time >= lo && p.time <= hi && p.value >= vLo && p.value <= vHi) acc.push(i)
      return acc
    }, [])

    const prior = get().selectedPoints
    if (additive && prior && prior.trackId === trackId && prior.laneId === laneId) {
      const merged = [...new Set([...prior.indices, ...hits])].sort((a, b) => a - b)
      set({ selectedPoints: { trackId, laneId, indices: merged } })
    } else {
      set({ selectedPoints: { trackId, laneId, indices: hits } })
    }
  },

  selectPoint: (trackId, laneId, index, additive = false) => {
    const trackLanes = get().lanes[trackId]
    const lane = trackLanes?.find((l) => l.id === laneId)
    if (!lane || index < 0 || index >= lane.points.length) return

    const prior = get().selectedPoints
    if (additive && prior && prior.trackId === trackId && prior.laneId === laneId) {
      if (prior.indices.includes(index)) return // already selected — no-op
      const merged = [...prior.indices, index].sort((a, b) => a - b)
      set({ selectedPoints: { trackId, laneId, indices: merged } })
    } else {
      set({ selectedPoints: { trackId, laneId, indices: [index] } })
    }
  },

  clearPointSelection: () => {
    if (get().selectedPoints === null) return
    set({ selectedPoints: null })
  },

  moveSelectedPoints: (deltaTime, deltaValue, quantize) => {
    const selection = get().selectedPoints
    if (!selection || selection.indices.length === 0) return
    const trackLanes = get().lanes[selection.trackId]
    const lane = trackLanes?.find((l) => l.id === selection.laneId)
    if (!lane) return

    const oldPoints = lane.points
    const oldSelection = selection

    // Compute the moved points as NEW object references (keyed by their
    // ORIGINAL index) so we can locate them again after re-sorting below —
    // reference identity survives the sort even when two points land on the
    // same time/value.
    const movedRefs = new Map<number, AutomationPoint>()
    for (const i of selection.indices) {
      const p = oldPoints[i]
      if (!p) continue
      let newTime = Math.max(0, p.time + deltaTime)
      newTime = Math.max(0, quantizeTime(newTime, quantize))
      const newValue = Math.max(0, Math.min(1, p.value + deltaValue))
      movedRefs.set(i, { ...p, time: newTime, value: newValue })
    }
    if (movedRefs.size === 0) return

    const combined = oldPoints.map((p, i) => movedRefs.get(i) ?? p)
    const sorted = [...combined].sort((a, b) => a.time - b.time)
    const movedRefSet = new Set(movedRefs.values())
    const newIndices = sorted.reduce<number[]>((acc, p, i) => {
      if (movedRefSet.has(p)) acc.push(i)
      return acc
    }, [])
    const newSelection: AutomationPointSelection = {
      trackId: oldSelection.trackId,
      laneId: oldSelection.laneId,
      indices: newIndices,
    }

    const forward = () => {
      const current = { ...get().lanes }
      current[oldSelection.trackId] = (current[oldSelection.trackId] ?? []).map((l) =>
        l.id === oldSelection.laneId ? { ...l, points: sorted } : l,
      )
      set({ lanes: current, selectedPoints: newSelection })
    }
    const inverse = () => {
      const current = { ...get().lanes }
      current[oldSelection.trackId] = (current[oldSelection.trackId] ?? []).map((l) =>
        l.id === oldSelection.laneId ? { ...l, points: oldPoints } : l,
      )
      set({ lanes: current, selectedPoints: oldSelection })
    }

    undoable('Move automation points', forward, inverse)
  },

  copySelectedPoints: () => {
    const selection = get().selectedPoints
    if (!selection || selection.indices.length === 0) return
    const trackLanes = get().lanes[selection.trackId]
    const lane = trackLanes?.find((l) => l.id === selection.laneId)
    if (!lane) return

    const pts = selection.indices
      .map((i) => lane.points[i])
      .filter((p): p is AutomationPoint => !!p)
    if (pts.length === 0) return

    const minTime = Math.min(...pts.map((p) => p.time))
    const maxTime = Math.max(...pts.map((p) => p.time))
    const regionPoints = pts.map((p) => ({ ...p, time: p.time - minTime }))

    set({ clipboard: { points: regionPoints, duration: maxTime - minTime } })
  },

  // AA.4b — transform box (scale / skew / flatten / ramp)

  transformSelectedPoints: (params, quantize, description = 'Transform automation points') => {
    const selection = get().selectedPoints
    if (!selection || selection.indices.length === 0) return
    const trackLanes = get().lanes[selection.trackId]
    const lane = trackLanes?.find((l) => l.id === selection.laneId)
    if (!lane) return

    const oldPoints = lane.points
    const oldSelection = selection
    const transformed = applyBoxTransform(oldPoints, selection.indices, params, quantize)

    // Same "track moved points by reference, relocate by identity after
    // sort" idiom as moveSelectedPoints — survives points landing on the
    // same time/value after the transform.
    const movedRefs = new Map<number, AutomationPoint>()
    for (const i of selection.indices) {
      const p = transformed[i]
      if (!p) continue
      movedRefs.set(i, p)
    }
    if (movedRefs.size === 0) return

    const combined = oldPoints.map((p, i) => movedRefs.get(i) ?? p)
    const sorted = [...combined].sort((a, b) => a.time - b.time)
    const movedRefSet = new Set(movedRefs.values())
    const newIndices = sorted.reduce<number[]>((acc, p, i) => {
      if (movedRefSet.has(p)) acc.push(i)
      return acc
    }, [])
    const newSelection: AutomationPointSelection = {
      trackId: oldSelection.trackId,
      laneId: oldSelection.laneId,
      indices: newIndices,
    }

    const forward = () => {
      const current = { ...get().lanes }
      current[oldSelection.trackId] = (current[oldSelection.trackId] ?? []).map((l) =>
        l.id === oldSelection.laneId ? { ...l, points: sorted } : l,
      )
      set({ lanes: current, selectedPoints: newSelection })
    }
    const inverse = () => {
      const current = { ...get().lanes }
      current[oldSelection.trackId] = (current[oldSelection.trackId] ?? []).map((l) =>
        l.id === oldSelection.laneId ? { ...l, points: oldPoints } : l,
      )
      set({ lanes: current, selectedPoints: oldSelection })
    }

    undoable(description, forward, inverse)
  },

  flattenSelectedPoints: (mode, releaseValue) => {
    const selection = get().selectedPoints
    if (!selection || selection.indices.length === 0) return
    const trackLanes = get().lanes[selection.trackId]
    const lane = trackLanes?.find((l) => l.id === selection.laneId)
    if (!lane) return

    const selectedValues = selection.indices
      .map((i) => lane.points[i]?.value)
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
    if (selectedValues.length === 0) return

    const target =
      mode === 'release' && typeof releaseValue === 'number' && Number.isFinite(releaseValue)
        ? Math.max(0, Math.min(1, releaseValue))
        : selectedValues.reduce((a, b) => a + b, 0) / selectedValues.length

    get().transformSelectedPoints(flattenParams(target), undefined, 'Flatten automation selection')
  },

  rampSelectedPoints: () => {
    const selection = get().selectedPoints
    if (!selection || selection.indices.length < 2) return
    const trackLanes = get().lanes[selection.trackId]
    const lane = trackLanes?.find((l) => l.id === selection.laneId)
    if (!lane) return

    // `indices` is documented as always sorted ascending, and it indexes
    // into a time-sorted `points` array — so the first/last index really are
    // the earliest/latest selected points in time.
    const firstPt = lane.points[selection.indices[0]]
    const lastPt = lane.points[selection.indices[selection.indices.length - 1]]
    if (!firstPt || !lastPt) return

    get().transformSelectedPoints(
      rampParams(firstPt.value, lastPt.value),
      undefined,
      'Ramp automation selection',
    )
  },

  setPointsRaw: (trackId, laneId, points) => {
    const trackLanes = get().lanes[trackId]
    if (!trackLanes) return
    if (!trackLanes.some((l) => l.id === laneId)) return
    const current = { ...get().lanes }
    current[trackId] = (current[trackId] ?? []).map((l) => (l.id === laneId ? { ...l, points } : l))
    set({ lanes: current })
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
      clipboard: null,
      recordMode: 'replace',
      sg3AbortedLaneIds: new Set<string>(),
      selectedPoints: null,
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
        // PR-B Commit-1: v3 lanes carry `mode`; default to 'smooth' if absent/invalid.
        mode: (['smooth', 'step', 'gate', 'oneShot'] as const).includes(lane.mode)
          ? lane.mode
          : 'smooth',
        // PR-B Commit-2: drop an axisBinding that fails the Tier-1 validator
        // (forward-compat: a file written by a future tier won't crash this one).
        axisBinding: lane.axisBinding && validateLaneAxisTier1(lane.axisBinding) === null
          ? lane.axisBinding
          : undefined,
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
