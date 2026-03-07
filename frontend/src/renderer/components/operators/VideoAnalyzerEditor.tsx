import { useOperatorStore } from '../../stores/operators'
import type { Operator, VideoAnalyzerMethod } from '../../../shared/types'

const METHODS: { value: VideoAnalyzerMethod; label: string }[] = [
  { value: 'luminance', label: 'Luminance' },
  { value: 'motion', label: 'Motion' },
  { value: 'color', label: 'Color (Hue)' },
  { value: 'edges', label: 'Edges' },
  { value: 'histogram_peak', label: 'Histogram Peak' },
]

interface VideoAnalyzerEditorProps {
  operator: Operator
}

export default function VideoAnalyzerEditor({ operator }: VideoAnalyzerEditorProps) {
  const updateOperator = useOperatorStore((s) => s.updateOperator)
  const currentMethod = (operator.parameters.method as VideoAnalyzerMethod) || 'luminance'

  return (
    <div className="operator-editor operator-editor--video">
      <label className="operator-editor__label">
        Method
        <select
          className="operator-editor__select"
          value={currentMethod}
          onChange={(e) =>
            updateOperator(operator.id, {
              parameters: { ...operator.parameters, method: e.target.value },
            })
          }
        >
          {METHODS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </label>
      <div className="operator-editor__hint">
        Analyzes 64×64 proxy of current frame
      </div>
    </div>
  )
}
