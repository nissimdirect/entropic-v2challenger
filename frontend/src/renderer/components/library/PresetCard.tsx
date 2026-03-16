import type { Preset } from '../../../shared/types'

interface PresetCardProps {
  preset: Preset
  onApply: (preset: Preset) => void
  onToggleFavorite: (id: string) => void
  onDelete: (id: string) => void
}

export default function PresetCard({
  preset,
  onApply,
  onToggleFavorite,
  onDelete,
}: PresetCardProps) {
  return (
    <div
      className="preset-card"
      draggable="true"
      onDragStart={(e) => {
        e.dataTransfer.setData('application/entropic-preset', JSON.stringify(preset))
        e.dataTransfer.effectAllowed = 'copy'
      }}
      onClick={() => onApply(preset)}
    >
      <div className="preset-card__header">
        <span className="preset-card__name">{preset.name}</span>
        <button
          className={`preset-card__fav ${preset.isFavorite ? 'preset-card__fav--active' : ''}`}
          onClick={(e) => {
            e.stopPropagation()
            onToggleFavorite(preset.id)
          }}
          title={preset.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        >
          {preset.isFavorite ? '\u2605' : '\u2606'}
        </button>
      </div>
      <div className="preset-card__meta">
        <span className="preset-card__type">
          {preset.type === 'single_effect' ? 'Effect' : 'Chain'}
        </span>
        {preset.tags.length > 0 && (
          <span className="preset-card__tags">
            {preset.tags.slice(0, 3).join(', ')}
          </span>
        )}
      </div>
      <button
        className="preset-card__delete"
        onClick={(e) => {
          e.stopPropagation()
          onDelete(preset.id)
        }}
        title="Delete preset"
      >
        x
      </button>
    </div>
  )
}
