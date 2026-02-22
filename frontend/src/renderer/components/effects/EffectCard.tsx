import type { EffectInstance } from '../../../shared/types'

interface EffectCardProps {
  effect: EffectInstance
  name: string
  isSelected: boolean
  onSelect: () => void
  onToggle: () => void
  onRemove: () => void
}

export default function EffectCard({
  effect,
  name,
  isSelected,
  onSelect,
  onToggle,
  onRemove,
}: EffectCardProps) {
  return (
    <div
      className={`effect-card ${isSelected ? 'effect-card--selected' : ''} ${!effect.isEnabled ? 'effect-card--disabled' : ''}`}
      onClick={onSelect}
    >
      <button
        className="effect-card__toggle"
        onClick={(e) => {
          e.stopPropagation()
          onToggle()
        }}
        title={effect.isEnabled ? 'Disable' : 'Enable'}
      >
        {effect.isEnabled ? 'ON' : 'OFF'}
      </button>
      <span className="effect-card__name">{name}</span>
      <button
        className="effect-card__remove"
        onClick={(e) => {
          e.stopPropagation()
          onRemove()
        }}
        title="Remove effect"
      >
        x
      </button>
    </div>
  )
}
