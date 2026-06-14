/**
 * OperatorDepthArc — a PURE SVG depth arc (P4.4).
 *
 * No store coupling: it is a leaf presentational component driven entirely by
 * props, so it can be reused unchanged by the P4.5 topology graph. It draws a
 * single circular arc whose swept angle encodes `depth` linearly:
 *
 *     depth 1.0 → 270° sweep     depth 0.5 → 135° sweep     depth 0.0 → empty
 *
 * The sweep is anchored at the 12-o'clock position (−90°) and grows clockwise.
 *
 * Trust boundary: `depth` is clamped to [0, 1] and NaN/Inf-guarded before any
 * trig runs, so the emitted path `d` is never NaN. At depth 0 the path is empty
 * (renders nothing) rather than a degenerate zero-length arc command.
 */

interface OperatorDepthArcProps {
  /** Modulation depth in [0, 1]. Out-of-range values are clamped. */
  depth: number
  /** Stroke color, applied verbatim to the arc. */
  color: string
  /** Arc radius in px. */
  radius: number
}

const MAX_SWEEP_DEG = 270
const START_ANGLE_DEG = -90 // 12 o'clock

/** Clamp to [0,1] and reject NaN/Inf (→ 0). The single numeric trust gate. */
function safeDepth(value: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

/** Polar (deg) → cartesian point on a circle centered at (cx, cy). */
function polar(cx: number, cy: number, r: number, angleDeg: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

export default function OperatorDepthArc({ depth, color, radius }: OperatorDepthArcProps) {
  const d = safeDepth(depth)
  const r = Number.isFinite(radius) && radius > 0 ? radius : 0

  // SVG viewBox sized to fit the full circle with a little stroke padding.
  const stroke = 2
  const pad = stroke + 1
  const size = r * 2 + pad * 2
  const cx = size / 2
  const cy = size / 2

  const sweep = d * MAX_SWEEP_DEG
  const endAngle = START_ANGLE_DEG + sweep

  // depth 0 (or zero radius) → empty path, never a degenerate/NaN arc command.
  let pathD = ''
  if (sweep > 0 && r > 0) {
    const start = polar(cx, cy, r, START_ANGLE_DEG)
    const end = polar(cx, cy, r, endAngle)
    const largeArc = sweep > 180 ? 1 : 0
    // sweep-flag 1 = clockwise (positive angle direction in SVG's y-down space).
    pathD = `M ${start.x.toFixed(4)} ${start.y.toFixed(4)} ` +
      `A ${r.toFixed(4)} ${r.toFixed(4)} 0 ${largeArc} 1 ${end.x.toFixed(4)} ${end.y.toFixed(4)}`
  }

  return (
    <svg
      className="operator-depth-arc"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      data-depth={d}
      data-sweep-deg={sweep.toFixed(2)}
      aria-hidden="true"
    >
      {pathD && (
        <path
          className="operator-depth-arc__path"
          d={pathD}
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
        />
      )}
    </svg>
  )
}
