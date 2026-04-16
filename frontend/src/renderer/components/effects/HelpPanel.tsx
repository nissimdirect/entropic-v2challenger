import { useEffectsStore } from '../../stores/effects'
import { useBrowserStore } from '../../stores/browser'

export default function HelpPanel() {
  const hoveredEffectId = useBrowserStore((s) => s.hoveredEffectId)
  const registry = useEffectsStore((s) => s.registry)

  const info = hoveredEffectId ? registry.find((r) => r.id === hoveredEffectId) : null

  if (!info) {
    return (
      <div className="help-panel" data-testid="help-panel">
        <div className="help-panel__empty">Hover an effect for details</div>
      </div>
    )
  }

  const paramCount = Object.keys(info.params).length
  const paramNames = Object.values(info.params).map((p) => p.label).join(', ')

  return (
    <div className="help-panel" data-testid="help-panel">
      <div className="help-panel__title">{info.name}</div>
      <div className="help-panel__category">{info.category}</div>
      <div className="help-panel__params">
        {paramCount} params: {paramNames}
      </div>
    </div>
  )
}
