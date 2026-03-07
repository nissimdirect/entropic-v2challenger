import { useOperatorStore } from '../../stores/operators'

interface RoutingLinesProps {
  operatorValues: Record<string, number>
}

/**
 * SVG overlay showing routing connections between operators and their mapped targets.
 * Renders colored lines from operator cards to effect params in the rack.
 *
 * This is a simplified implementation — uses operator index and mapping index
 * to compute Y positions rather than measuring DOM elements.
 */
export default function RoutingLines({ operatorValues }: RoutingLinesProps) {
  const operators = useOperatorStore((s) => s.operators)

  // Collect all active routings
  const lines: {
    opId: string
    opIndex: number
    targetEffectId: string
    targetParamKey: string
    depth: number
    signal: number
    type: string
  }[] = []

  operators.forEach((op, opIndex) => {
    if (!op.isEnabled) return
    const signal = operatorValues[op.id] ?? 0
    op.mappings.forEach((m) => {
      lines.push({
        opId: op.id,
        opIndex,
        targetEffectId: m.targetEffectId,
        targetParamKey: m.targetParamKey,
        depth: m.depth,
        signal,
        type: op.type,
      })
    })
  })

  if (lines.length === 0) return null

  const TYPE_COLORS: Record<string, string> = {
    lfo: '#4ade80',
    envelope: '#f59e0b',
    step_sequencer: '#3b82f6',
    audio_follower: '#a855f7',
    video_analyzer: '#ec4899',
    fusion: '#06b6d4',
  }

  return (
    <svg className="routing-lines" aria-hidden="true">
      {lines.map((line, i) => {
        const color = TYPE_COLORS[line.type] ?? '#4ade80'
        const opacity = 0.2 + line.signal * 0.6
        const strokeWidth = 1 + line.depth * 2

        // Simplified positioning: each operator card ~60px apart vertically
        const y1 = 20 + line.opIndex * 60
        const y2 = y1 + 30
        const x1 = 10
        const x2 = 100

        return (
          <path
            key={i}
            d={`M ${x1} ${y1} C ${x1 + 40} ${y1}, ${x2 - 40} ${y2}, ${x2} ${y2}`}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            opacity={opacity}
            strokeLinecap="round"
          />
        )
      })}
    </svg>
  )
}
