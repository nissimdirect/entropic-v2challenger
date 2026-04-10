import { useCallback } from 'react'
import { useProjectStore } from '../../stores/project'
import { useEffectsStore } from '../../stores/effects'
import { useEngineStore } from '../../stores/engine'
import { LIMITS } from '../../../shared/limits'
import DeviceCard from './DeviceCard'

interface DeviceChainProps {
  modulatedValues?: Record<string, Record<string, number>>
}

export default function DeviceChain({ modulatedValues }: DeviceChainProps) {
  const effectChain = useProjectStore((s) => s.effectChain)
  const selectedEffectId = useProjectStore((s) => s.selectedEffectId)
  const registry = useEffectsStore((s) => s.registry)
  const lastFrameMs = useEngineStore((s) => s.lastFrameMs) ?? 0

  const handleSelect = useCallback((id: string) => {
    useProjectStore.getState().selectEffect(id)
  }, [])

  const handleToggle = useCallback((id: string) => {
    useProjectStore.getState().toggleEffect(id)
  }, [])

  const handleRemove = useCallback((id: string) => {
    useProjectStore.getState().removeEffect(id)
  }, [])

  const handleUpdateParam = useCallback(
    (effectId: string, paramName: string, value: number | string | boolean) => {
      useProjectStore.getState().updateParam(effectId, paramName, value)
    },
    [],
  )

  const handleSetMix = useCallback((effectId: string, mix: number) => {
    useProjectStore.getState().setMix(effectId, mix)
  }, [])

  const chainTimeColor = lastFrameMs < 50 ? '#4ade80' : lastFrameMs < 100 ? '#f59e0b' : '#ef4444'

  if (effectChain.length === 0) {
    return (
      <div className="device-chain" data-testid="device-chain">
        <div className="device-chain__header">
          <span className="device-chain__title">Device Chain</span>
        </div>
        <div className="device-chain__empty">
          <span>Add effects from the browser</span>
        </div>
      </div>
    )
  }

  return (
    <div className="device-chain" data-testid="device-chain">
      <div className="device-chain__header">
        <span className="device-chain__title">Device Chain</span>
        <span className="device-chain__info">
          <span
            className="device-chain__depth"
            style={{ color: effectChain.length >= LIMITS.MAX_EFFECTS_PER_CHAIN ? '#ef4444' : '#666' }}
          >
            {effectChain.length} / {LIMITS.MAX_EFFECTS_PER_CHAIN}
          </span>
          {lastFrameMs > 0 && (
            <span className="device-chain__timing" style={{ color: chainTimeColor }}>
              {lastFrameMs.toFixed(0)}ms
            </span>
          )}
        </span>
      </div>

      <div className="device-chain__strip" data-testid="device-chain-strip">
        {effectChain.map((effect, index) => {
          const info = registry.find((r) => r.id === effect.effectId)
          return (
            <div key={effect.id} className="device-chain__item">
              {index > 0 && (
                <span className="device-chain__arrow">&rarr;</span>
              )}
              <DeviceCard
                effect={effect}
                effectInfo={info}
                isSelected={effect.id === selectedEffectId}
                modulatedValues={modulatedValues?.[effect.id]}
                onSelect={() => handleSelect(effect.id)}
                onToggle={() => handleToggle(effect.id)}
                onRemove={() => handleRemove(effect.id)}
                onUpdateParam={handleUpdateParam}
                onSetMix={handleSetMix}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
