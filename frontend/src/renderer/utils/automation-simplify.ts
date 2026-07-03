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
  if (epsilon <= 0 || !Number.isFinite(epsilon)) return points

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

  // All intermediate points are within tolerance — keep only endpoints, but
  // re-fit the kept segment's curve tension so the eased shape approximates
  // where the removed points actually sat, instead of blindly inheriting
  // first.curve verbatim.
  const fittedCurve = fitCurveForSegment(points)
  return [{ ...first, curve: fittedCurve }, last]
}

/**
 * AA.1 gap 2 — derive a curve tension for a collapsed RDP segment.
 *
 * Heuristic (not an exact fit — "reasonable heuristic" per spec):
 * automation-evaluate's applyEasing bows the value curve above the
 * straight first->last line when sign(curve) === sign(deltaValue), and
 * below it otherwise. So:
 *   1. Compute each removed point's signed deviation from the straight
 *      first->last line (in value space, at that point's normalized time).
 *   2. Average the signed deviations to get the dominant bow direction.
 *   3. Pick curve's sign so applyEasing bows the same direction.
 *   4. Scale magnitude against ~0.375*|deltaValue|, the approximate max
 *      deviation applyEasing produces at curve=1 (t=0.5), and clamp to
 *      [-1, 1].
 */
function fitCurveForSegment(points: AutomationPoint[]): number {
  const first = points[0]
  const last = points[points.length - 1]
  if (points.length <= 2) return first.curve

  const deltaTime = last.time - first.time
  const deltaValue = last.value - first.value
  if (deltaTime === 0 || deltaValue === 0) return 0

  let sumDev = 0
  let maxAbsDev = 0
  for (let i = 1; i < points.length - 1; i++) {
    const t = (points[i].time - first.time) / deltaTime
    const linVal = first.value + deltaValue * t
    const dev = points[i].value - linVal
    sumDev += dev
    maxAbsDev = Math.max(maxAbsDev, Math.abs(dev))
  }

  const avgDev = sumDev / (points.length - 2)
  if (avgDev === 0) return 0

  const curveSign = Math.sign(avgDev) === Math.sign(deltaValue) ? 1 : -1
  const magnitude = Math.min(1, maxAbsDev / (Math.abs(deltaValue) * 0.375))
  return curveSign * magnitude
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
