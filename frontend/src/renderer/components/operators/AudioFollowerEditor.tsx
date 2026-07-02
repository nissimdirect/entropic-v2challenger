import { useOperatorStore } from '../../stores/operators'
import type { Operator } from '../../../shared/types'

interface AudioFollowerEditorProps {
  operator: Operator
  hasAudio: boolean
}

export default function AudioFollowerEditor({ operator, hasAudio }: AudioFollowerEditorProps) {
  const updateOperator = useOperatorStore((s) => s.updateOperator)
  const params = operator.parameters

  const setParam = (key: string, value: number | string) => {
    updateOperator(operator.id, {
      parameters: { ...params, [key]: value },
    })
  }

  return (
    <div className="operator-card__body">
      {!hasAudio && (
        <div style={{ fontSize: 10, color: '#f59e0b', marginBottom: 4 }}>
          Requires audio — load a video with audio
        </div>
      )}
      <div className="operator-card__param-row">
        <span className="operator-card__param-label">Method</span>
        <select
          className="operator-card__param-select"
          value={String(params.method ?? 'rms')}
          onChange={(e) => setParam('method', e.target.value)}
        >
          <option value="rms">RMS</option>
          <option value="frequency_band">Freq Band</option>
          <option value="onset">Onset</option>
        </select>
      </div>
      <div className="operator-card__param-row">
        <span className="operator-card__param-label">Sensitivity</span>
        <input
          className="operator-card__param-input"
          type="number"
          min={0.1}
          max={10}
          step={0.1}
          value={Number(params.sensitivity ?? 1.4)}
          onChange={(e) => setParam('sensitivity', parseFloat(e.target.value) || 1.0)}
        />
      </div>
      {params.method === 'frequency_band' && (
        <>
          <div className="operator-card__param-row">
            <span className="operator-card__param-label">Low Hz</span>
            <input
              className="operator-card__param-input"
              type="number"
              min={20}
              max={20000}
              step={10}
              value={Number(params.low_hz ?? 20)}
              onChange={(e) => setParam('low_hz', parseInt(e.target.value) || 20)}
            />
          </div>
          <div className="operator-card__param-row">
            <span className="operator-card__param-label">High Hz</span>
            <input
              className="operator-card__param-input"
              type="number"
              min={20}
              max={20000}
              step={10}
              value={Number(params.high_hz ?? 200)}
              onChange={(e) => setParam('high_hz', parseInt(e.target.value) || 200)}
            />
          </div>
        </>
      )}
    </div>
  )
}
