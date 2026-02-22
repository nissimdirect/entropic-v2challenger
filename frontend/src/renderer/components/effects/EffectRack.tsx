import type { EffectInstance, EffectInfo } from '../../../shared/types'
import EffectCard from './EffectCard'

interface EffectRackProps {
  chain: EffectInstance[]
  registry: EffectInfo[]
  selectedEffectId: string | null
  onSelect: (id: string) => void
  onToggle: (id: string) => void
  onRemove: (id: string) => void
  onReorder: (fromIndex: number, toIndex: number) => void
}

export default function EffectRack({
  chain,
  registry,
  selectedEffectId,
  onSelect,
  onToggle,
  onRemove,
  onReorder,
}: EffectRackProps) {
  const getEffectName = (effectId: string): string => {
    const info = registry.find((r) => r.id === effectId)
    return info?.name ?? effectId
  }

  const handleMoveUp = (index: number) => {
    if (index > 0) onReorder(index, index - 1)
  }

  const handleMoveDown = (index: number) => {
    if (index < chain.length - 1) onReorder(index, index + 1)
  }

  if (chain.length === 0) {
    return (
      <div className="effect-rack effect-rack--empty">
        <span className="effect-rack__placeholder">No effects. Add from browser.</span>
      </div>
    )
  }

  return (
    <div className="effect-rack">
      <div className="effect-rack__header">Effect Chain</div>
      <div className="effect-rack__list">
        {chain.map((effect, index) => (
          <div key={effect.id} className="effect-rack__item">
            <div className="effect-rack__arrows">
              <button
                className="effect-rack__arrow"
                onClick={() => handleMoveUp(index)}
                disabled={index === 0}
                title="Move up"
              >
                ^
              </button>
              <button
                className="effect-rack__arrow"
                onClick={() => handleMoveDown(index)}
                disabled={index === chain.length - 1}
                title="Move down"
              >
                v
              </button>
            </div>
            <EffectCard
              effect={effect}
              name={getEffectName(effect.effectId)}
              isSelected={selectedEffectId === effect.id}
              onSelect={() => onSelect(effect.id)}
              onToggle={() => onToggle(effect.id)}
              onRemove={() => onRemove(effect.id)}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
