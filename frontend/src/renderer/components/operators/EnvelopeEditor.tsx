import { useOperatorStore } from '../../stores/operators'
import type { Operator } from '../../../shared/types'

interface EnvelopeEditorProps {
  operator: Operator
}

export default function EnvelopeEditor({ operator }: EnvelopeEditorProps) {
  const updateOperator = useOperatorStore((s) => s.updateOperator)
  const params = operator.parameters

  const setParam = (key: string, value: number | boolean) => {
    updateOperator(operator.id, {
      parameters: { ...params, [key]: value },
    })
  }

  return (
    <div className="operator-card__body">
      <div className="operator-card__param-row">
        <span className="operator-card__param-label">Attack</span>
        <input
          className="operator-card__param-input"
          type="number"
          min={0}
          max={300}
          step={1}
          value={Number(params.attack ?? 10)}
          onChange={(e) => setParam('attack', parseInt(e.target.value) || 0)}
        />
      </div>
      <div className="operator-card__param-row">
        <span className="operator-card__param-label">Decay</span>
        <input
          className="operator-card__param-input"
          type="number"
          min={0}
          max={300}
          step={1}
          value={Number(params.decay ?? 5)}
          onChange={(e) => setParam('decay', parseInt(e.target.value) || 0)}
        />
      </div>
      <div className="operator-card__param-row">
        <span className="operator-card__param-label">Sustain</span>
        <input
          className="operator-card__param-input"
          type="number"
          min={0}
          max={1}
          step={0.05}
          value={Number(params.sustain ?? 0.7)}
          onChange={(e) => setParam('sustain', parseFloat(e.target.value) || 0)}
        />
      </div>
      <div className="operator-card__param-row">
        <span className="operator-card__param-label">Release</span>
        <input
          className="operator-card__param-input"
          type="number"
          min={0}
          max={300}
          step={1}
          value={Number(params.release ?? 20)}
          onChange={(e) => setParam('release', parseInt(e.target.value) || 0)}
        />
      </div>
      <div className="operator-card__param-row">
        <span className="operator-card__param-label">Trigger</span>
        <button
          className="operator-card__toggle-btn"
          style={{
            background: params.trigger ? '#4ade80' : undefined,
            color: params.trigger ? '#1a1a1a' : undefined,
          }}
          onMouseDown={() => setParam('trigger', true)}
          onMouseUp={() => setParam('trigger', false)}
          onMouseLeave={() => { if (params.trigger) setParam('trigger', false) }}
        >
          TRIG
        </button>
      </div>
    </div>
  )
}
