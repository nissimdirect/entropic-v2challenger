/**
 * Snap candidates helper for UE.1 — Timeline snapping.
 *
 * Pure function: given a raw timeline position and a set of candidate
 * positions (clip edges, playhead, markers, grid lines), returns the
 * snapped position if one is within the pixel threshold, or null if
 * nothing is close enough.
 *
 * Design decisions:
 * - Threshold is 8 screen pixels, converted to timeline units via zoom.
 * - Grid lines are included in the candidate list so a single
 *   nearest-wins pass handles both grid and edge snapping — no fight
 *   between the two systems.
 * - Degenerate inputs (zero-width clips, NaN, negative zoom) are
 *   guarded and return null rather than propagating NaN/Infinity.
 * - Called BEFORE moveClip / trimClipIn / trimClipOut so the store
 *   stays dumb and snap resolution lives entirely in this helper.
 */

import type { Marker } from '../../shared/types'

export const SNAP_THRESHOLD_PX = 8

export interface SnapInput {
  /** Raw position in timeline units (seconds) being dragged to. */
  rawPos: number
  /** Current zoom level (px per second). Must be positive and finite. */
  zoom: number
  /** Playhead time in seconds. */
  playheadTime: number
  /** All markers on the timeline. */
  markers: Marker[]
  /**
   * All clip edges (start and end positions in seconds) from other clips.
   * Typically: every track's clips except the one being dragged.
   */
  clipEdges: number[]
  /**
   * Grid interval in seconds.  Pass null / undefined if grid is disabled
   * or BPM is not set.
   */
  gridInterval?: number | null
  /**
   * Number of grid candidates to generate around rawPos.
   * Defaults to 3 (one cell each side + the nearest boundary).
   */
  gridWindowCells?: number
}

export interface SnapResult {
  /** The snapped position. */
  snappedPos: number
  /** Whether a snap actually occurred (false when rawPos is returned as-is). */
  snapped: boolean
}

/**
 * Compute the snapped position for a drag gesture.
 *
 * Returns null if:
 * - zoom is not positive/finite
 * - rawPos is not finite
 * - no candidate is within the threshold
 *
 * Never returns NaN or Infinity.
 */
export function computeSnapPosition(input: SnapInput): SnapResult {
  const { rawPos, zoom, playheadTime, markers, clipEdges, gridInterval, gridWindowCells = 3 } = input

  // Guard degenerate inputs
  if (!Number.isFinite(rawPos) || !Number.isFinite(zoom) || zoom <= 0) {
    return { snappedPos: Number.isFinite(rawPos) ? rawPos : 0, snapped: false }
  }

  const thresholdUnits = SNAP_THRESHOLD_PX / zoom

  // Build candidate list
  const candidates: number[] = []

  // 1. Playhead
  if (Number.isFinite(playheadTime) && playheadTime >= 0) {
    candidates.push(playheadTime)
  }

  // 2. Markers
  for (const m of markers) {
    if (Number.isFinite(m.time) && m.time >= 0) {
      candidates.push(m.time)
    }
  }

  // 3. Clip edges from neighbours
  for (const edge of clipEdges) {
    if (Number.isFinite(edge) && edge >= 0) {
      candidates.push(edge)
    }
  }

  // 4. Grid lines near rawPos (includes grid in the single nearest-wins pass)
  if (gridInterval != null && Number.isFinite(gridInterval) && gridInterval > 0) {
    const nearestLine = Math.round(rawPos / gridInterval) * gridInterval
    for (let i = -gridWindowCells; i <= gridWindowCells; i++) {
      const line = nearestLine + i * gridInterval
      if (line >= 0) candidates.push(line)
    }
  }

  if (candidates.length === 0) {
    return { snappedPos: rawPos, snapped: false }
  }

  // Find nearest candidate
  let bestDist = Infinity
  let bestCandidate = rawPos

  for (const c of candidates) {
    const d = Math.abs(c - rawPos)
    if (d < bestDist) {
      bestDist = d
      bestCandidate = c
    }
  }

  if (bestDist <= thresholdUnits) {
    return { snappedPos: bestCandidate, snapped: true }
  }

  return { snappedPos: rawPos, snapped: false }
}

/**
 * Collect all clip edge positions (start and end) from a set of clips,
 * optionally excluding a specific clip by ID (the one being dragged).
 */
export interface ClipEdgeSource {
  id: string
  position: number
  duration: number
}

export function collectClipEdges(
  clips: ClipEdgeSource[],
  excludeId?: string,
): number[] {
  const edges: number[] = []
  for (const c of clips) {
    if (c.id === excludeId) continue
    if (Number.isFinite(c.position) && c.duration >= 0) {
      edges.push(c.position)
      edges.push(c.position + c.duration)
    }
  }
  return edges
}
