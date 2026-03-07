import { useRef, useCallback } from 'react'
import type { EffectInstance, EffectInfo, ParamDef } from '../../../shared/types'
import Knob from '../common/Knob'
import ParamChoice from './ParamChoice'
import ParamToggle from './ParamToggle'
import ParamMix from './ParamMix'
import { useAutomationStore } from '../../stores/automation'
import { useTimelineStore } from '../../stores/timeline'
import { recordPoint } from '../../utils/automation-record'

interface ParamPanelProps {
  effect: EffectInstance | null
  effectInfo: EffectInfo | null
  onUpdateParam: (effectId: string, paramName: string, value: number | string | boolean) => void
  onSetMix: (effectId: string, mix: number) => void
  /** Resolved modulation values per param key (ghost handles) */
  modulatedValues?: Record<string, number>
}

export default function ParamPanel({ effect, effectInfo, onUpdateParam, onSetMix, modulatedValues }: ParamPanelProps) {
  const paramsRef = useRef<HTMLDivElement>(null)

  const handleParamKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key !== 'Tab') return
  }, [])

  // Phase 7: Latch/touch automation recording on knob change.
  // Must be declared before early return to maintain hook ordering.
  const handleKnobChange = useCallback(
    (effectId: string, key: string, def: ParamDef, value: number) => {
      onUpdateParam(effectId, key, value)

      // Write automation points in latch/touch mode
      const autoStore = useAutomationStore.getState()
      const mode = autoStore.mode
      if (mode !== 'latch' && mode !== 'touch') return
      if (!autoStore.armedTrackId) return

      const paramPath = `${effectId}.${key}`
      const lanes = autoStore.getLanesForTrack(autoStore.armedTrackId)
      const lane = lanes.find((l) => l.paramPath === paramPath)
      if (!lane) return

      const time = useTimelineStore.getState().playheadTime
      const pMin = def.min ?? 0
      const pMax = def.max ?? 1
      const normalized = pMax > pMin ? (value - pMin) / (pMax - pMin) : 0
      const newPoints = recordPoint(lane.points, time, Math.max(0, Math.min(1, normalized)))
      autoStore.setPoints(autoStore.armedTrackId, lane.id, newPoints)
    },
    [onUpdateParam],
  )

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
    const ghostValue = modulatedValues?.[key] ?? (value as number)
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
        onChange={(v) => handleKnobChange(effect.id, key, def, v)}
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
