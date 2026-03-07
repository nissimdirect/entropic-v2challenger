import type { AutomationLane, AutomationPoint } from '../../shared/types'

/**
 * Apply easing curve to a normalized t value (0-1).
 * curve=0 linear, curve>0 ease-out, curve<0 ease-in.
 */
export function applyEasing(t: number, curve: number): number {
  if (curve === 0) return t
  if (curve > 0) return 1 - Math.pow(1 - t, 1 + curve * 2)
  return Math.pow(t, 1 + Math.abs(curve) * 2)
}

/**
 * Evaluate an automation lane at a given time.
 * Returns null if the lane has no points (no override).
 * Uses O(log n) binary search for surrounding points.
 */
export function evaluateAutomation(lane: AutomationLane, time: number): number | null {
  const { points } = lane
  if (points.length === 0) return null
  if (points.length === 1) return points[0].value

  // Before first point
  if (time <= points[0].time) return points[0].value
  // After last point
  if (time >= points[points.length - 1].time) return points[points.length - 1].value

  // Binary search for the segment containing `time`
  let lo = 0
  let hi = points.length - 1
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1
    if (points[mid].time <= time) {
      lo = mid
    } else {
      hi = mid
    }
  }

  const a: AutomationPoint = points[lo]
  const b: AutomationPoint = points[hi]

  // Zero-duration segment — return first point's value
  const duration = b.time - a.time
  if (duration === 0) return a.value

  const t = (time - a.time) / duration
  const eased = applyEasing(t, a.curve)
  return a.value + (b.value - a.value) * eased
}

/** Map a normalized 0-1 value to a parameter range. */
export function denormalize(normalized: number, min: number, max: number): number {
  return min + normalized * (max - min)
}
