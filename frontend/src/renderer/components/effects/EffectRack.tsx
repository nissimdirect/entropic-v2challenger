import { useState, useCallback } from 'react'
import type { EffectInstance, EffectInfo } from '../../../shared/types'
import EffectCard from './EffectCard'
import FreezeOverlay from './FreezeOverlay'
import Tooltip from '../common/Tooltip'
import { useFreezeStore } from '../../stores/freeze'
import { useStableListener } from '../../hooks/useStableListener'

interface EffectRackProps {
  chain: EffectInstance[]
  registry: EffectInfo[]
  selectedEffectId: string | null
  trackId?: string
  onSelect: (id: string) => void
  onToggle: (id: string) => void
  onRemove: (id: string) => void
  onReorder: (fromIndex: number, toIndex: number) => void
  onFreezeUpTo?: (index: number) => void | Promise<void>
  onUnfreeze?: () => void | Promise<void>
  onFlatten?: () => void | Promise<void>
  onSavePreset?: () => void
  onSaveEffectPreset?: (effectId: string) => void
}

export default function EffectRack({
  chain,
  registry,
  selectedEffectId,
  trackId = 'default',
  onSelect,
  onToggle,
  onRemove,
  onReorder,
  onFreezeUpTo,
  onUnfreeze,
  onFlatten,
  onSavePreset,
  onSaveEffectPreset,
}: EffectRackProps) {
  const frozenPrefixes = useFreezeStore((s) => s.frozenPrefixes)
  const checkFrozen = (effectIndex: number): boolean => {
    const info = frozenPrefixes[trackId]
    return info ? effectIndex <= info.cutIndex : false
  }
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; index: number } | null>(null)

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

  const handleContextMenu = useCallback((e: React.MouseEvent, index: number) => {
    e.preventDefault()
    // Clamp to viewport so menu doesn't extend off-screen
    const menuWidth = 170
    const menuHeight = 140
    const x = Math.min(e.clientX, window.innerWidth - menuWidth)
    const y = Math.min(e.clientY, window.innerHeight - menuHeight)
    setContextMenu({ x, y, index })
  }, [])

  const closeContextMenu = useCallback(() => {
    setContextMenu(null)
  }, [])

  // Dismiss context menu on Escape or click outside
  useStableListener(window, 'keydown', (e: Event) => {
    if ((e as KeyboardEvent).key === 'Escape') {
      e.preventDefault()
      setContextMenu(null)
    }
  }, contextMenu !== null)

  useStableListener(window, 'click', () => setContextMenu(null), contextMenu !== null)

  if (chain.length === 0) {
    return (
      <div className="effect-rack effect-rack--empty">
        <span className="effect-rack__placeholder">No effects. Add from browser.</span>
      </div>
    )
  }

  return (
    <div className="effect-rack">
      <div className="effect-rack__header">
        <span>Effect Chain</span>
        {onSavePreset && (
          <Tooltip text="Save chain as preset" position="bottom">
            <button
              className="effect-rack__save-preset"
              onClick={onSavePreset}
              title="Save chain as preset"
            >
              Save Preset
            </button>
          </Tooltip>
        )}
      </div>
      <div className="effect-rack__list">
        {chain.map((effect, index) => (
          <div
            key={effect.id}
            className="effect-rack__item"
            onContextMenu={(e) => handleContextMenu(e, index)}
          >
            <div className="effect-rack__arrows">
              <Tooltip text="Move up" position="right">
                <button
                  className="effect-rack__arrow"
                  onClick={() => handleMoveUp(index)}
                  disabled={index === 0}
                  title="Move up"
                >
                  ^
                </button>
              </Tooltip>
              <Tooltip text="Move down" position="right">
                <button
                  className="effect-rack__arrow"
                  onClick={() => handleMoveDown(index)}
                  disabled={index === chain.length - 1}
                  title="Move down"
                >
                  v
                </button>
              </Tooltip>
            </div>
            <div style={{ position: 'relative', flex: 1 }}>
              <EffectCard
                effect={effect}
                name={getEffectName(effect.effectId)}
                isSelected={selectedEffectId === effect.id}
                onSelect={() => onSelect(effect.id)}
                onToggle={() => onToggle(effect.id)}
                onRemove={() => onRemove(effect.id)}
              />
              <FreezeOverlay isFrozen={checkFrozen(index)} />
            </div>
          </div>
        ))}
      </div>

      {contextMenu && (
        <div
          className="effect-rack__context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          {onFreezeUpTo && (
            <button
              className="effect-rack__context-item"
              onClick={() => {
                onFreezeUpTo(contextMenu.index)
                closeContextMenu()
              }}
            >
              Freeze up to here
            </button>
          )}
          {onUnfreeze && checkFrozen(contextMenu.index) && (
            <button
              className="effect-rack__context-item"
              onClick={() => {
                onUnfreeze()
                closeContextMenu()
              }}
            >
              Unfreeze
            </button>
          )}
          {onFlatten && checkFrozen(contextMenu.index) && (
            <button
              className="effect-rack__context-item"
              onClick={() => {
                onFlatten()
                closeContextMenu()
              }}
            >
              Flatten to video
            </button>
          )}
          {onSaveEffectPreset && (
            <button
              className="effect-rack__context-item"
              onClick={() => {
                onSaveEffectPreset(chain[contextMenu.index].id)
                closeContextMenu()
              }}
            >
              Save effect as preset
            </button>
          )}
        </div>
      )}
    </div>
  )
}
