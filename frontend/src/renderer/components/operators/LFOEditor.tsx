import { useOperatorStore } from '../../stores/operators'
import type { Operator, LFOWaveform, OperatorMapping, EffectInfo } from '../../../shared/types'

const WAVEFORMS: LFOWaveform[] = ['sine', 'saw', 'square', 'triangle', 'random', 'noise', 'sample_hold']

interface LFOEditorProps {
  operator: Operator
  effectChain: { id: string; effectId: string }[]
  registry: EffectInfo[]
}

export default function LFOEditor({ operator, effectChain, registry }: LFOEditorProps) {
  const updateOperator = useOperatorStore((s) => s.updateOperator)
  const addMapping = useOperatorStore((s) => s.addMapping)
  const removeMapping = useOperatorStore((s) => s.removeMapping)

  const params = operator.parameters

  const setParam = (key: string, value: number | string) => {
    updateOperator(operator.id, {
      parameters: { ...params, [key]: value },
    })
  }

  const handleAddMapping = () => {
    if (effectChain.length === 0) return
    const firstEffect = effectChain[0]
    const info = registry.find((r) => r.id === firstEffect.effectId)
    const firstParam = info ? Object.keys(info.params)[0] : ''
    const mapping: OperatorMapping = {
      targetEffectId: firstEffect.id,
      targetParamKey: firstParam,
      depth: 1.0,
      min: 0.0,
      max: 1.0,
      curve: 'linear',
    }
    addMapping(operator.id, mapping)
  }

  return (
    <div className="operator-card__body">
      <div className="operator-card__param-row">
        <span className="operator-card__param-label">Wave</span>
        <select
          className="operator-card__param-select"
          value={String(params.waveform ?? 'sine')}
          onChange={(e) => setParam('waveform', e.target.value)}
        >
          {WAVEFORMS.map((w) => (
            <option key={w} value={w}>{w}</option>
          ))}
        </select>
      </div>
      <div className="operator-card__param-row">
        <span className="operator-card__param-label">Rate</span>
        <input
          className="operator-card__param-input"
          type="number"
          min={0.01}
          max={50}
          step={0.1}
          value={Number(params.rate_hz ?? 1)}
          onChange={(e) => setParam('rate_hz', parseFloat(e.target.value) || 0.01)}
        />
        <span className="operator-card__param-label">Hz</span>
      </div>
      <div className="operator-card__param-row">
        <span className="operator-card__param-label">Phase</span>
        <input
          className="operator-card__param-input"
          type="number"
          min={0}
          max={6.28}
          step={0.1}
          value={Number(params.phase_offset ?? 0)}
          onChange={(e) => setParam('phase_offset', parseFloat(e.target.value) || 0)}
        />
      </div>

      <div className="operator-card__mappings">
        <div className="operator-card__param-row">
          <span className="operator-card__param-label">Mappings</span>
          <button
            className="operator-card__toggle-btn"
            onClick={handleAddMapping}
            disabled={effectChain.length === 0}
          >
            + Add
          </button>
        </div>
        {operator.mappings.map((m, i) => (
          <div key={`${m.targetEffectId}-${m.targetParamKey}`} className="operator-card__param-row">
            <span className="operator-card__param-label" style={{ fontSize: 9 }}>
              {m.targetParamKey}
            </span>
            <button
              className="operator-card__remove-btn"
              onClick={() => removeMapping(operator.id, i)}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
