import { useState } from 'react'
import { useOperatorStore } from '../../stores/operators'
import type { OperatorType, EffectInfo } from '../../../shared/types'
import LFOEditor from './LFOEditor'
import EnvelopeEditor from './EnvelopeEditor'
import StepSequencerEditor from './StepSequencerEditor'
import AudioFollowerEditor from './AudioFollowerEditor'

interface OperatorRackProps {
  effectChain: { id: string; effectId: string }[]
  registry: EffectInfo[]
  operatorValues: Record<string, number>
  hasAudio: boolean
}

const TYPE_OPTIONS: { type: OperatorType; label: string; available: boolean }[] = [
  { type: 'lfo', label: 'LFO', available: true },
  { type: 'envelope', label: 'Envelope', available: true },
  { type: 'step_sequencer', label: 'Step Seq', available: true },
  { type: 'audio_follower', label: 'Audio', available: true },
  { type: 'video_analyzer', label: 'Video (6B)', available: false },
  { type: 'fusion', label: 'Fusion (6B)', available: false },
]

const TYPE_BADGE: Record<string, string> = {
  lfo: 'L',
  envelope: 'E',
  step_sequencer: 'S',
  audio_follower: 'A',
}

const TYPE_CSS: Record<string, string> = {
  lfo: 'lfo',
  envelope: 'envelope',
  step_sequencer: 'step-seq',
  audio_follower: 'audio',
}

export default function OperatorRack({ effectChain, registry, operatorValues, hasAudio }: OperatorRackProps) {
  const operators = useOperatorStore((s) => s.operators)
  const addOperator = useOperatorStore((s) => s.addOperator)
  const removeOperator = useOperatorStore((s) => s.removeOperator)
  const setEnabled = useOperatorStore((s) => s.setOperatorEnabled)

  const [showAddMenu, setShowAddMenu] = useState(false)

  return (
    <div className="operator-rack">
      <div className="operator-rack__header">
        <span className="operator-rack__title">Operators</span>
        <button
          className="operator-rack__add-btn"
          onClick={() => setShowAddMenu(!showAddMenu)}
        >
          {showAddMenu ? '×' : '+ Add'}
        </button>
      </div>

      {showAddMenu && (
        <div className="operator-rack__add-menu">
          {TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.type}
              className={`operator-rack__add-option${opt.available ? '' : ' operator-rack__add-option--disabled'}`}
              disabled={!opt.available}
              onClick={() => {
                addOperator(opt.type)
                setShowAddMenu(false)
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {operators.length === 0 ? (
        <div className="operator-rack__empty">No operators — click + Add to create one</div>
      ) : (
        <div className="operator-rack__cards">
          {operators.map((op) => {
            const cssType = TYPE_CSS[op.type] ?? 'lfo'
            const badge = TYPE_BADGE[op.type] ?? '?'
            const signalValue = operatorValues[op.id] ?? 0
            const isActive = signalValue > 0 && op.isEnabled

            return (
              <div
                key={op.id}
                className={`operator-card operator-card--${cssType}${op.isEnabled ? '' : ' operator-card--disabled'}`}
              >
                <div className="operator-card__header">
                  <span className={`operator-card__type-badge operator-card__type-badge--${cssType}`}>
                    {badge}
                  </span>
                  <span className="operator-card__label">
                    {op.label}
                    {op.mappings.length > 0 && (
                      <span className="operator-card__mapping-count">{op.mappings.length}</span>
                    )}
                  </span>
                  <span className={`operator-card__active-dot${isActive ? '' : ' operator-card__active-dot--inactive'}`} />
                  <div className="operator-card__controls">
                    <button
                      className="operator-card__toggle-btn"
                      onClick={() => setEnabled(op.id, !op.isEnabled)}
                    >
                      {op.isEnabled ? 'ON' : 'OFF'}
                    </button>
                    <button
                      className="operator-card__remove-btn"
                      onClick={() => removeOperator(op.id)}
                    >
                      ×
                    </button>
                  </div>
                </div>

                {op.type === 'lfo' && (
                  <LFOEditor operator={op} effectChain={effectChain} registry={registry} />
                )}
                {op.type === 'envelope' && (
                  <EnvelopeEditor operator={op} />
                )}
                {op.type === 'step_sequencer' && (
                  <StepSequencerEditor operator={op} />
                )}
                {op.type === 'audio_follower' && (
                  <AudioFollowerEditor operator={op} hasAudio={hasAudio} />
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
