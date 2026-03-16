import { useOperatorStore } from '../../stores/operators'
import type { Operator, FusionBlendMode } from '../../../shared/types'

const BLEND_MODES: { value: FusionBlendMode; label: string }[] = [
  { value: 'weighted_average', label: 'Weighted Avg' },
  { value: 'max', label: 'Max' },
  { value: 'min', label: 'Min' },
  { value: 'multiply', label: 'Multiply' },
  { value: 'add', label: 'Add' },
]

interface FusionEditorProps {
  operator: Operator
  availableOperators: { id: string; label: string }[]
}

export default function FusionEditor({ operator, availableOperators }: FusionEditorProps) {
  const updateOperator = useOperatorStore((s) => s.updateOperator)
  const blendMode = (operator.parameters.blend_mode as FusionBlendMode) || 'weighted_average'

  // Sources stored as comma-separated "id:weight" pairs in parameters
  const sourcesStr = (operator.parameters.sources as string) || ''
  const sources = sourcesStr
    .split(',')
    .filter(Boolean)
    .map((s) => {
      const [opId, w] = s.split(':')
      return { operatorId: opId, weight: parseFloat(w) || 1.0 }
    })

  const updateSources = (newSources: { operatorId: string; weight: number }[]) => {
    const str = newSources.map((s) => `${s.operatorId}:${s.weight}`).join(',')
    updateOperator(operator.id, {
      parameters: { ...operator.parameters, sources: str },
    })
  }

  const addSource = (opId: string) => {
    updateSources([...sources, { operatorId: opId, weight: 1.0 }])
  }

  const removeSource = (index: number) => {
    updateSources(sources.filter((_, i) => i !== index))
  }

  const setWeight = (index: number, weight: number) => {
    const updated = [...sources]
    updated[index] = { ...updated[index], weight }
    updateSources(updated)
  }

  // Exclude self and already-added operators
  const usedIds = new Set(sources.map((s) => s.operatorId))
  const available = availableOperators.filter(
    (o) => o.id !== operator.id && !usedIds.has(o.id),
  )

  return (
    <div className="operator-editor operator-editor--fusion">
      <label className="operator-editor__label">
        Blend
        <select
          className="operator-editor__select"
          value={blendMode}
          onChange={(e) =>
            updateOperator(operator.id, {
              parameters: { ...operator.parameters, blend_mode: e.target.value },
            })
          }
        >
          {BLEND_MODES.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </label>

      <div className="operator-editor__sources">
        {sources.map((src, i) => {
          const opLabel =
            availableOperators.find((o) => o.id === src.operatorId)?.label ?? src.operatorId
          return (
            <div key={src.operatorId} className="operator-editor__source-row">
              <span className="operator-editor__source-label">{opLabel}</span>
              <input
                type="range"
                className="operator-editor__slider"
                min={0}
                max={2}
                step={0.05}
                value={src.weight}
                onChange={(e) => setWeight(i, parseFloat(e.target.value))}
              />
              <span className="operator-editor__source-weight">{src.weight.toFixed(2)}</span>
              <button
                className="operator-editor__remove-btn"
                onClick={() => removeSource(i)}
              >
                ×
              </button>
            </div>
          )
        })}
      </div>

      {available.length > 0 && (
        <select
          className="operator-editor__select"
          value=""
          onChange={(e) => {
            if (e.target.value) addSource(e.target.value)
          }}
        >
          <option value="">+ Add source…</option>
          {available.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      )}

      {sources.length === 0 && (
        <div className="operator-editor__hint">Add other operators as sources to blend</div>
      )}
    </div>
  )
}
