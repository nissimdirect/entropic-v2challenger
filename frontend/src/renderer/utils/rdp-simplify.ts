/**
 * Ramer–Douglas–Peucker (RDP) polyline simplification.
 *
 * Pure function — no side effects, no DOM dependency.
 *
 * Used by the freehand lasso (MK.5) to reduce sampled pointer paths to a
 * bounded polygon before committing a MatteNode.
 *
 * Guarantees:
 *   - Output vertex count ≤ MAX_VERTICES (256) — enforced by iterative
 *     doubling of epsilon when the RDP result exceeds the cap.
 *   - The simplification algorithm preserves the topology of the original path;
 *     self-intersections are allowed and passed through (even-odd fill rule
 *     handles them in the backend rasterizer — MK.5 contract).
 *   - A two-point input (or fewer) is returned as-is after cap enforcement.
 *   - Iterative (stack-based) RDP — safe for 10,000-point inputs without
 *     stack overflow.
 */

export interface Point2D {
  x: number;
  y: number;
}

/** Hard vertex cap for committed polygon MatteNodes. */
export const MAX_VERTICES = 256;

/**
 * Perpendicular distance from point P to the line defined by start → end.
 *
 * Degenerate case (start === end): returns Euclidean distance from P to start.
 */
function perpendicularDistance(p: Point2D, start: Point2D, end: Point2D): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) {
    // Degenerate segment — return distance to the single point
    return Math.hypot(p.x - start.x, p.y - start.y);
  }
  // |cross(end−start, start−p)| / |end−start|
  const cross = Math.abs(dx * (start.y - p.y) - (start.x - p.x) * dy);
  return cross / Math.hypot(dx, dy);
}

/**
 * Core RDP routine — iterative (stack-based) to avoid stack overflow on
 * large inputs.
 *
 * Returns an index array of kept points.
 */
function rdpIterative(
  points: ReadonlyArray<Point2D>,
  epsilon: number,
): Uint8Array {
  const n = points.length;
  const result = new Uint8Array(n);
  result[0] = 1;
  result[n - 1] = 1;

  // Stack of [start, end] segment pairs to process
  const stack: [number, number][] = [[0, n - 1]];

  while (stack.length > 0) {
    const [start, end] = stack.pop()!;
    if (end <= start + 1) continue;

    let maxDist = 0;
    let maxIdx = start;

    for (let i = start + 1; i < end; i++) {
      const d = perpendicularDistance(points[i], points[start], points[end]);
      if (d > maxDist) {
        maxDist = d;
        maxIdx = i;
      }
    }

    if (maxDist > epsilon) {
      result[maxIdx] = 1;
      stack.push([start, maxIdx]);
      stack.push([maxIdx, end]);
    }
  }

  return result;
}

/**
 * RDP simplify — reduces `points` to at most `MAX_VERTICES` vertices with a
 * maximum deviation of `epsilon` pixels (or less if the cap requires it).
 *
 * @param points   Input polyline (any length ≥ 0).
 * @param epsilon  Initial maximum allowed deviation in the same unit as the
 *                 point coordinates. Default 2.0 (px).
 * @returns        Simplified array of points. Length ≤ MAX_VERTICES.
 *
 * If the RDP result at the requested epsilon exceeds MAX_VERTICES, epsilon is
 * doubled and the simplification is retried. This loop continues until the cap
 * is met (guaranteed to terminate because in the limit the result converges to
 * just the two endpoints).
 */
export function rdpSimplify(
  points: ReadonlyArray<Point2D>,
  epsilon = 2.0,
): Point2D[] {
  if (points.length <= 2) return points.slice() as Point2D[];

  let eps = epsilon;
  // Retry loop — tighten the epsilon until the vertex cap is met.
  // Worst case: O(log n) iterations × O(n) RDP = O(n log n).
  for (let attempt = 0; attempt < 32; attempt++) {
    const result = rdpIterative(points, eps);

    const simplified: Point2D[] = [];
    for (let i = 0; i < points.length; i++) {
      if (result[i]) simplified.push(points[i]);
    }

    if (simplified.length <= MAX_VERTICES) {
      return simplified;
    }

    // Too many vertices — double the epsilon and retry
    eps *= 2;
  }

  // Absolute fallback: return just the endpoints (unreachable in practice)
  return [points[0], points[points.length - 1]];
}

/**
 * Sample a raw pointer-event path at ≥ `minDelta` px movement intervals.
 * Returns a new array with only the sampled points (always includes the first).
 *
 * This pre-filter keeps the point array small BEFORE RDP runs, which matters
 * for very fast pointer sweeps that generate thousands of events per second.
 */
export function samplePath(
  points: ReadonlyArray<Point2D>,
  minDelta = 4,
): Point2D[] {
  if (points.length === 0) return [];
  const sampled: Point2D[] = [points[0]];
  let last = points[0];
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - last.x;
    const dy = points[i].y - last.y;
    if (Math.hypot(dx, dy) >= minDelta) {
      sampled.push(points[i]);
      last = points[i];
    }
  }
  // Always include the last point (so the path closes properly)
  if (sampled[sampled.length - 1] !== points[points.length - 1]) {
    sampled.push(points[points.length - 1]);
  }
  return sampled;
}
