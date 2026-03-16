import type { AutomationPoint } from '../../shared/types'

/**
 * Insert a single recorded point into a sorted automation array.
 * Replaces any existing point within timeThreshold; otherwise inserts in order.
 * Returns a new array (immutable).
 */
export function recordPoint(
  existingPoints: AutomationPoint[],
  time: number,
  value: number,
  timeThreshold: number = 0.033
): AutomationPoint[] {
  const newPoint: AutomationPoint = { time, value, curve: 0 }
  const result = [...existingPoints]

  // Check if an existing point is close enough to replace
  const nearIndex = result.findIndex(
    (p) => Math.abs(p.time - time) <= timeThreshold
  )

  if (nearIndex !== -1) {
    result[nearIndex] = newPoint
    return result
  }

  // Insert in sorted position
  const insertIndex = result.findIndex((p) => p.time > time)
  if (insertIndex === -1) {
    result.push(newPoint)
  } else {
    result.splice(insertIndex, 0, newPoint)
  }

  return result
}

/**
 * Bulk insert points from a mouse-drag stroke into existing automation.
 * Stroke points replace any existing points within 0.001s.
 * Returns a new sorted array.
 */
export function recordDrawStroke(
  existingPoints: AutomationPoint[],
  strokePoints: Array<{ time: number; value: number }>
): AutomationPoint[] {
  const STROKE_THRESHOLD = 0.001

  // Convert stroke points to AutomationPoints
  const newPoints: AutomationPoint[] = strokePoints.map((sp) => ({
    time: sp.time,
    value: sp.value,
    curve: 0,
  }))

  // Filter out existing points that overlap with stroke points
  const filtered = existingPoints.filter((ep) =>
    !newPoints.some((np) => Math.abs(np.time - ep.time) <= STROKE_THRESHOLD)
  )

  // Merge and sort by time
  return [...filtered, ...newPoints].sort((a, b) => a.time - b.time)
}

/**
 * Record a trigger event (key-down → 1.0, key-up → 0.0) into an automation lane.
 * Merges with existing points during overdub (does not replace).
 * Points are clamped to exactly 0.0 or 1.0 (square-wave).
 */
export function recordTriggerPoint(
  existingPoints: AutomationPoint[],
  time: number,
  eventType: 'trigger' | 'release',
): AutomationPoint[] {
  const value = eventType === 'trigger' ? 1.0 : 0.0
  const newPoint: AutomationPoint = { time, value, curve: 0 }

  // Merge into existing (overdub — don't replace, layer on top)
  const result = [...existingPoints, newPoint]
  result.sort((a, b) => a.time - b.time)
  return result
}

/**
 * Merge trigger automation points from a retro-capture dump with existing lane data.
 * Used by CAPTURE button to merge 60s buffer events into a trigger lane.
 */
export function mergeTriggerCapture(
  existingPoints: AutomationPoint[],
  capturedPoints: AutomationPoint[],
): AutomationPoint[] {
  // Simply merge and sort — overdub layering, not replacement
  const merged = [...existingPoints, ...capturedPoints]
  merged.sort((a, b) => a.time - b.time)
  return merged
}
