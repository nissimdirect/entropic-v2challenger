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
