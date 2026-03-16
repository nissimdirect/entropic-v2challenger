import type { AutomationPoint } from '../../shared/types'

/**
 * Ramer-Douglas-Peucker simplification for automation curves.
 * Reduces point count while preserving shape within epsilon tolerance.
 */
export function simplifyPoints(
  points: AutomationPoint[],
  epsilon: number
): AutomationPoint[] {
  if (points.length <= 2) return points

  // Find the point with maximum perpendicular distance from the line
  // between the first and last points
  const first = points[0]
  const last = points[points.length - 1]

  let maxDist = 0
  let maxIndex = 0

  for (let i = 1; i < points.length - 1; i++) {
    const dist = perpendicularDistance(points[i], first, last)
    if (dist > maxDist) {
      maxDist = dist
      maxIndex = i
    }
  }

  if (maxDist > epsilon) {
    const left = simplifyPoints(points.slice(0, maxIndex + 1), epsilon)
    const right = simplifyPoints(points.slice(maxIndex), epsilon)
    // Concatenate, removing duplicate point at the junction
    return left.slice(0, -1).concat(right)
  }

  // All intermediate points are within tolerance — keep only endpoints
  return [first, last]
}

/** Perpendicular distance from point p to the line defined by a and b. */
function perpendicularDistance(
  p: AutomationPoint,
  a: AutomationPoint,
  b: AutomationPoint
): number {
  const dx = b.time - a.time
  const dy = b.value - a.value
  const lineLenSq = dx * dx + dy * dy

  if (lineLenSq === 0) {
    // a and b are the same point — distance is point-to-point
    const ex = p.time - a.time
    const ey = p.value - a.value
    return Math.sqrt(ex * ex + ey * ey)
  }

  // |cross product| / |line length|
  const cross = Math.abs(
    dx * (a.value - p.value) - dy * (a.time - p.time)
  )
  return cross / Math.sqrt(lineLenSq)
}
