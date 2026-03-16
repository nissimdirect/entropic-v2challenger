import { useOperatorStore } from '../../stores/operators'
import type { Operator } from '../../../shared/types'

interface StepSequencerEditorProps {
  operator: Operator
}

export default function StepSequencerEditor({ operator }: StepSequencerEditorProps) {
  const updateOperator = useOperatorStore((s) => s.updateOperator)
  const params = operator.parameters

  // Steps stored as comma-separated string in parameters
  const stepsStr = String(params.steps ?? '0,0.25,0.5,0.75,1,0.75,0.5,0.25')
  const steps = stepsStr.split(',').map((s) => parseFloat(s.trim()) || 0)

  const setParam = (key: string, value: number | string) => {
    updateOperator(operator.id, {
      parameters: { ...params, [key]: value },
    })
  }

  const setStep = (index: number, value: number) => {
    const newSteps = [...steps]
    newSteps[index] = Math.max(0, Math.min(1, value))
    setParam('steps', newSteps.join(','))
  }

  return (
    <div className="operator-card__body">
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
      <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 40, marginTop: 4 }}>
        {steps.map((val, i) => (
          <div
            key={i}
            style={{
              width: Math.max(8, 120 / steps.length),
              height: `${val * 100}%`,
              minHeight: 2,
              background: '#4ade80',
              borderRadius: 1,
              cursor: 'pointer',
            }}
            title={`Step ${i + 1}: ${val.toFixed(2)}`}
            onClick={() => {
              // Cycle through 0 → 0.25 → 0.5 → 0.75 → 1.0 → 0
              const next = val >= 1 ? 0 : Math.round((val + 0.25) * 4) / 4
              setStep(i, next)
            }}
          />
        ))}
      </div>
    </div>
  )
}
