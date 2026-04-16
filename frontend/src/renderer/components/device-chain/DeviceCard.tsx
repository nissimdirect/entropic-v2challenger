import { useCallback } from 'react'
import type { EffectInstance, EffectInfo, ParamDef } from '../../../shared/types'
import Knob from '../common/Knob'
import ParamChoice from '../effects/ParamChoice'
import ParamToggle from '../effects/ParamToggle'
import { useAutomationStore } from '../../stores/automation'
import { useTimelineStore } from '../../stores/timeline'
import { useMIDIStore } from '../../stores/midi'
import { recordPoint } from '../../utils/automation-record'
import ABSwitch from './ABSwitch'

interface DeviceCardProps {
  effect: EffectInstance
  effectInfo: EffectInfo | undefined
  isSelected: boolean
  modulatedValues?: Record<string, number>
  onSelect: () => void
  onToggle: () => void
  onRemove: () => void
  onUpdateParam: (effectId: string, paramName: string, value: number | string | boolean) => void
  onSetMix: (effectId: string, mix: number) => void
  onContextMenu?: (e: React.MouseEvent) => void
}

export default function DeviceCard({
  effect,
  effectInfo,
  isSelected,
  modulatedValues,
  onSelect,
  onToggle,
  onRemove,
  onUpdateParam,
  onSetMix,
  onContextMenu,
}: DeviceCardProps) {
  const handleKnobChange = useCallback(
    (key: string, def: ParamDef, value: number) => {
      onUpdateParam(effect.id, key, value)

      const autoStore = useAutomationStore.getState()
      const mode = autoStore.mode
      if (mode !== 'latch' && mode !== 'touch') return
      if (!autoStore.armedTrackId) return

      const paramPath = `${effect.id}.${key}`
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
    [effect.id, onUpdateParam],
  )

  const handleMixChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onSetMix(effect.id, parseFloat(e.target.value) / 100)
    },
    [effect.id, onSetMix],
  )

  if (!effectInfo) {
    return (
      <div className="device-card device-card--error" data-testid="device-card" onClick={onSelect} onContextMenu={onContextMenu}>
        <div className="device-card__header">
          <span className="device-card__name">{effect.effectId}</span>
        </div>
        <div className="device-card__body">Unknown effect</div>
      </div>
    )
  }

  const paramEntries = Object.entries(effectInfo.params)
  const numericParams = paramEntries.filter(([, def]) => def.type === 'float' || def.type === 'int')
  const otherParams = paramEntries.filter(([, def]) => def.type !== 'float' && def.type !== 'int')
  const mixPercent = Math.round(effect.mix * 100)

  return (
    <div
      className={`device-card${isSelected ? ' device-card--selected' : ''}${!effect.isEnabled ? ' device-card--disabled' : ''}`}
      data-testid="device-card"
      onClick={onSelect}
      onContextMenu={onContextMenu}
    >
      {/* Header */}
      <div className="device-card__header">
        <button
          className={`device-card__toggle${effect.isEnabled ? '' : ' device-card__toggle--off'}`}
          data-testid="device-toggle"
          onClick={(e) => { e.stopPropagation(); onToggle() }}
        >
          {effect.isEnabled ? 'ON' : 'OFF'}
        </button>
        <span className="device-card__name" data-testid="device-card-name">
          {effectInfo.name}
        </span>
        <ABSwitch
          effectId={effect.id}
          isActive={!!effect.abState}
          activeSlot={effect.abState?.active ?? 'a'}
        />
        <button
          className="device-card__remove"
          data-testid="device-remove"
          onClick={(e) => { e.stopPropagation(); onRemove() }}
          title="Remove"
        >
          ×
        </button>
      </div>

      {/* Params */}
      <div className="device-card__params" data-testid="device-params">
        {numericParams.map(([key, def]) => {
          const value = effect.parameters[key] ?? def.default
          const ghostValue = modulatedValues?.[key] ?? (value as number)
          const hasCCMapping = useMIDIStore.getState().ccMappings.some(
            (m) => m.effectId === effect.id && m.paramKey === key
          )

          return (
            <div key={key} className="device-card__param">
              <Knob
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
                onChange={(v) => handleKnobChange(key, def, v)}
              />
              {hasCCMapping && <span className="device-card__cc-badge">CC</span>}
            </div>
          )
        })}
        {otherParams.map(([key, def]) => {
          const value = effect.parameters[key] ?? def.default
          if (def.type === 'choice') {
            return (
              <ParamChoice
                key={key}
                paramKey={key}
                def={def}
                value={value as string}
                onChange={(k, v) => onUpdateParam(effect.id, k, v)}
              />
            )
          }
          if (def.type === 'bool') {
            return (
              <ParamToggle
                key={key}
                paramKey={key}
                def={def}
                value={value as boolean}
                onChange={(k, v) => onUpdateParam(effect.id, k, v)}
              />
            )
          }
          return null
        })}
      </div>

      {/* Mix */}
      <div className="device-card__mix" data-testid="device-mix">
        <span className="device-card__mix-label">Mix</span>
        <input
          className="device-card__mix-slider"
          type="range"
          min={0}
          max={100}
          value={mixPercent}
          onChange={handleMixChange}
          onClick={(e) => e.stopPropagation()}
        />
        <span className="device-card__mix-value">{mixPercent}%</span>
      </div>
    </div>
  )
}
