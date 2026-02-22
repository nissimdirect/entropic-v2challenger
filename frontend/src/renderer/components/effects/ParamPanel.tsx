import type { EffectInstance, EffectInfo, ParamDef } from '../../../shared/types'
import ParamSlider from './ParamSlider'
import ParamChoice from './ParamChoice'
import ParamToggle from './ParamToggle'
import ParamMix from './ParamMix'

interface ParamPanelProps {
  effect: EffectInstance | null
  effectInfo: EffectInfo | null
  onUpdateParam: (effectId: string, paramName: string, value: number | string | boolean) => void
  onSetMix: (effectId: string, mix: number) => void
}

export default function ParamPanel({ effect, effectInfo, onUpdateParam, onSetMix }: ParamPanelProps) {
  if (!effect || !effectInfo) {
    return (
      <div className="param-panel param-panel--empty">
        <span>Select an effect to edit parameters</span>
      </div>
    )
  }

  const renderParam = (key: string, def: ParamDef) => {
    const value = effect.parameters[key] ?? def.default

    switch (def.type) {
      case 'float':
      case 'int':
        return (
          <ParamSlider
            key={key}
            paramKey={key}
            def={def}
            value={value as number}
            onChange={(k, v) => onUpdateParam(effect.id, k, v)}
          />
        )
      case 'choice':
        return (
          <ParamChoice
            key={key}
            paramKey={key}
            def={def}
            value={value as string}
            onChange={(k, v) => onUpdateParam(effect.id, k, v)}
          />
        )
      case 'bool':
        return (
          <ParamToggle
            key={key}
            paramKey={key}
            def={def}
            value={value as boolean}
            onChange={(k, v) => onUpdateParam(effect.id, k, v)}
          />
        )
      default:
        return null
    }
  }

  return (
    <div className="param-panel">
      <div className="param-panel__header">{effectInfo.name}</div>
      <div className="param-panel__params">
        {Object.entries(effectInfo.params).map(([key, def]) => renderParam(key, def))}
      </div>
      <div className="param-panel__divider" />
      <ParamMix mix={effect.mix} onChange={(mix) => onSetMix(effect.id, mix)} />
    </div>
  )
}
