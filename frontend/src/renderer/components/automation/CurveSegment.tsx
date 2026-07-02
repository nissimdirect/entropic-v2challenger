/**
 * SVG path between two automation nodes.
 * Curve type determines path shape (linear=line, ease-in/out=bezier).
 */
import type { AutomationPoint } from '../../../shared/types'

interface CurveSegmentProps {
  from: AutomationPoint
  to: AutomationPoint
  color: string
  opacity: number
  timeToX: (time: number) => number
  valueToY: (value: number) => number
}

export default function CurveSegment({
  from,
  to,
  color,
  opacity,
  timeToX,
  valueToY,
}: CurveSegmentProps) {
  const x1 = timeToX(from.time)
  const y1 = valueToY(from.value)
  const x2 = timeToX(to.time)
  const y2 = valueToY(to.value)

  const curve = from.curve

  let d: string
  if (curve === 0) {
    // Linear
    d = `M ${x1} ${y1} L ${x2} ${y2}`
  } else {
    // Bezier curve — curve > 0 = ease-out, curve < 0 = ease-in
    if (curve > 0) {
      // Ease-out: fast start, slow end — control point near start
      const cpX = x1 + (x2 - x1) * 0.25
      const cpY = y2
      d = `M ${x1} ${y1} Q ${cpX} ${cpY} ${x2} ${y2}`
    } else {
      // Ease-in: slow start, fast end — control point near end
      const cpX = x1 + (x2 - x1) * 0.75
      const cpY = y1
      d = `M ${x1} ${y1} Q ${cpX} ${cpY} ${x2} ${y2}`
    }
  }

  return (
    <path
      d={d}
      fill="none"
      stroke={color}
      strokeWidth={1.5}
      opacity={opacity}
      className="auto-curve"
    />
  )
}
