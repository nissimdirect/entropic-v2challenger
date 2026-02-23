import { useRef, useCallback } from 'react'
import type { EffectInstance, EffectInfo, ParamDef } from '../../../shared/types'
import Knob from '../common/Knob'
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
  const paramsRef = useRef<HTMLDivElement>(null)

  const handleParamKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key !== 'Tab') return
    // Let native Tab/Shift+Tab cycle through focusable knobs and controls
    // Focus ring is handled by CSS :focus-visible on .knob__svg and .hslider__track
  }, [])

  if (!effect || !effectInfo) {
    return (
      <div className="param-panel param-panel--empty">
        <span>Select an effect to edit parameters</span>
      </div>
    )
  }

  const paramEntries = Object.entries(effectInfo.params)
  const numericParams = paramEntries.filter(([, def]) => def.type === 'float' || def.type === 'int')
  const otherParams = paramEntries.filter(([, def]) => def.type !== 'float' && def.type !== 'int')

  const renderKnob = (key: string, def: ParamDef) => {
    const value = effect.parameters[key] ?? def.default
    // TODO Phase 6: Replace ghostValue with resolved modulation value
    const ghostValue = value as number
    return (
      <Knob
        key={key}
        value={value as number}
        min={def.min ?? 0}
        max={def.max ?? 1}
        default={def.default as number}
        label={def.label}
        type={def.type as 'float' | 'int'}
        unit={def.unit}
        curve={def.curve}
        description={def.description}
        ghostValue={ghostValue}
        onChange={(v) => onUpdateParam(effect.id, key, v)}
      />
    )
  }

  const renderOther = (key: string, def: ParamDef) => {
    const value = effect.parameters[key] ?? def.default
    switch (def.type) {
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

  const needsScroll = paramEntries.length > 6

  return (
    <div className="param-panel">
      <div className="param-panel__header">{effectInfo.name}</div>
      <div
        ref={paramsRef}
        className={`param-panel__params ${needsScroll ? 'param-panel__params--scrollable' : ''}`}
        onKeyDown={handleParamKeyDown}
      >
        {numericParams.length > 0 && (
          <div className="param-panel__knobs">
            {numericParams.map(([key, def]) => renderKnob(key, def))}
          </div>
        )}
        {otherParams.map(([key, def]) => renderOther(key, def))}
      </div>
      <div className="param-panel__divider" />
      <ParamMix mix={effect.mix} onChange={(mix) => onSetMix(effect.id, mix)} />
    </div>
  )
}
