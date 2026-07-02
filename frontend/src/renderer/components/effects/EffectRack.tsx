import { useState, useCallback } from 'react'
import type { EffectInstance, EffectInfo } from '../../../shared/types'
import EffectCard from './EffectCard'
import FreezeOverlay from './FreezeOverlay'
import Tooltip from '../common/Tooltip'
import { useFreezeStore } from '../../stores/freeze'
import ContextMenu from '../timeline/ContextMenu'
import type { MenuItem } from '../timeline/ContextMenu'
import { shortcutRegistry } from '../../utils/shortcuts'
import { prettyShortcut } from '../../utils/pretty-shortcut'

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
    // Shared ContextMenu clamps to viewport internally — pass raw coords.
    setContextMenu({ x: e.clientX, y: e.clientY, index })
  }, [])

  const closeContextMenu = useCallback(() => {
    setContextMenu(null)
  }, [])

  /** Build context-menu items for the right-clicked effect at `index`. */
  const buildContextItems = useCallback((index: number): MenuItem[] => {
    const items: MenuItem[] = []
    if (onFreezeUpTo) {
      items.push({
        label: 'Freeze up to here',
        action: () => { onFreezeUpTo(index) },
        shortcut: prettyShortcut(shortcutRegistry.getEffectiveKey('freeze_up_to')),
      })
    }
    if (onUnfreeze && checkFrozen(index)) {
      items.push({
        label: 'Unfreeze',
        action: () => { onUnfreeze() },
        shortcut: prettyShortcut(shortcutRegistry.getEffectiveKey('unfreeze_effects')),
      })
    }
    if (onFlatten && checkFrozen(index)) {
      items.push({
        label: 'Flatten to video',
        action: () => { onFlatten() },
        shortcut: prettyShortcut(shortcutRegistry.getEffectiveKey('flatten_to_video')),
      })
    }
    if (onSaveEffectPreset) {
      items.push({
        label: 'Save effect as preset',
        action: () => { onSaveEffectPreset(chain[index].id) },
        shortcut: prettyShortcut(shortcutRegistry.getEffectiveKey('save_effect_preset')),
      })
    }
    return items
  }, [onFreezeUpTo, onUnfreeze, onFlatten, onSaveEffectPreset, chain])

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

      {contextMenu && (() => {
        const items = buildContextItems(contextMenu.index)
        if (items.length === 0) return null
        return (
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            items={items}
            onClose={closeContextMenu}
          />
        )
      })()}
    </div>
  )
}
