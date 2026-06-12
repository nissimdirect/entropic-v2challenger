import { useCallback, useRef, useState } from 'react'
import { useProjectStore, useActiveEffectChain, getActiveTrackId, useActiveTrackId } from '../../stores/project'
import { useEffectsStore } from '../../stores/effects'
import { useEngineStore } from '../../stores/engine'
import { useFreezeStore } from '../../stores/freeze'
import { useLayoutStore } from '../../stores/layout'
import { LIMITS } from '../../../shared/limits'
import DeviceCard from './DeviceCard'
import ContextMenu from '../timeline/ContextMenu'
import type { MenuItem } from '../timeline/ContextMenu'
import { shortcutRegistry } from '../../utils/shortcuts'
import { prettyShortcut } from '../../utils/pretty-shortcut'
import { EFFECT_DRAG_TYPE } from '../effects/EffectBrowser'
import { randomUUID } from '../../utils'
import type { EffectInstance } from '../../../shared/types'

interface DeviceChainProps {
  modulatedValues?: Record<string, Record<string, number>>
  /** F-0514-16: Freeze effects 0..index (inclusive) into a cached prefix. */
  onFreezeUpTo?: (cutIndex: number) => void | Promise<void>
  /** F-0514-16: Remove the frozen prefix and re-render live chain. */
  onUnfreeze?: () => void | Promise<void>
  /** F-0514-16: Render the frozen prefix to a new video file (user picks path). */
  onFlatten?: () => void | Promise<void>
  /** F-0516-1: Open the PresetSaveDialog in single-effect mode for the given instance. */
  onSaveAsPreset?: (instanceId: string) => void
  /** F-0516-1: Open the PresetSaveDialog in effect_chain mode for the entire chain. */
  onSaveChainAsPreset?: () => void
}

export default function DeviceChain({
  modulatedValues,
  onFreezeUpTo,
  onUnfreeze,
  onFlatten,
  onSaveAsPreset,
  onSaveChainAsPreset,
}: DeviceChainProps) {
  // D2 (Epic 02): display the ACTIVE track's chain via the active-track rule (D1).
  const effectChain = useActiveEffectChain()
  // Epic 3 (D3): read active trackId reactively so isFrozenAt queries the correct per-track state.
  const activeTrackId = useActiveTrackId()
  const selectedEffectId = useProjectStore((s) => s.selectedEffectId)
  const deviceGroups = useProjectStore((s) => s.deviceGroups)
  const registry = useEffectsStore((s) => s.registry)
  const lastFrameMs = useEngineStore((s) => s.lastFrameMs) ?? 0
  const isFrozenAt = useFreezeStore((s) => s.isFrozen)
  const freezeOpState = useFreezeStore((s) => s.operationState)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; effectId: string; index: number } | null>(null)

  const handleSelect = useCallback((id: string) => {
    useProjectStore.getState().selectEffect(id)
  }, [])

  // Drag-resize for the device chain panel — top-edge handle, vertical drag
  // adjusts height. Persists via the layout store. Matches the pattern used
  // by the timeline's resize handle (drag up = taller, drag down = shorter).
  const height = useLayoutStore((s) => s.deviceChainHeight)
  const resizeRef = useRef<{ startY: number; startH: number } | null>(null)
  const handleResizeDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault()
      resizeRef.current = { startY: e.clientY, startH: height }
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    },
    [height],
  )
  const handleResizeMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!resizeRef.current) return
    const dy = resizeRef.current.startY - e.clientY // drag up = taller
    const newH = Math.max(100, Math.min(600, resizeRef.current.startH + dy))
    useLayoutStore.getState().setDeviceChainHeight(newH)
  }, [])
  const handleResizeUp = useCallback(() => {
    resizeRef.current = null
  }, [])

  const handleToggle = useCallback((id: string) => {
    const trackId = getActiveTrackId()
    if (!trackId) return
    useProjectStore.getState().toggleEffect(trackId, id)
  }, [])

  const handleRemove = useCallback((id: string) => {
    const trackId = getActiveTrackId()
    if (!trackId) return
    useProjectStore.getState().removeEffect(trackId, id)
  }, [])

  // F-0514-7: drag-add from EffectBrowser. Accepts only our custom MIME type
  // so drags from outside the app (files, browser links, other apps) are
  // silently ignored. Read effect-id → look up registry entry → build
  // EffectInstance with defaults → addEffect (mirrors EffectBrowser.handleAdd).
  const [isDragOver, setIsDragOver] = useState(false)

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (!Array.from(e.dataTransfer.types).includes(EFFECT_DRAG_TYPE)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    // Only clear the highlight when the cursor leaves the outermost target —
    // dragleave fires on every child transition too.
    if (e.currentTarget === e.target) setIsDragOver(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      setIsDragOver(false)
      const effectId = e.dataTransfer.getData(EFFECT_DRAG_TYPE)
      // RT-3: cap defensively at 64 chars. Real effect IDs are <32 chars; an
      // XSS-in-renderer (or future hostile drag source) writing a multi-MB
      // string into dataTransfer would otherwise force a full registry scan
      // on an obviously bogus payload.
      if (!effectId || effectId.length > 64) return
      if (effectChain.length >= LIMITS.MAX_EFFECTS_PER_CHAIN) return
      const info = registry.find((r) => r.id === effectId)
      if (!info) return
      const trackId = getActiveTrackId()
      if (!trackId) return
      const instance: EffectInstance = {
        id: randomUUID(),
        effectId: info.id,
        isEnabled: true,
        isFrozen: false,
        parameters: Object.fromEntries(
          Object.entries(info.params).map(([key, def]) => [key, def.default]),
        ),
        modulations: {},
        mix: 1.0,
        mask: null,
      }
      useProjectStore.getState().addEffect(trackId, instance)
    },
    [effectChain.length, registry],
  )

  const handleUpdateParam = useCallback(
    (effectId: string, paramName: string, value: number | string | boolean) => {
      const trackId = getActiveTrackId()
      if (!trackId) return
      useProjectStore.getState().updateParam(trackId, effectId, paramName, value)
    },
    [],
  )

  const handleSetMix = useCallback((effectId: string, mix: number) => {
    const trackId = getActiveTrackId()
    if (!trackId) return
    useProjectStore.getState().setMix(trackId, effectId, mix)
  }, [])

  const handleContextMenu = useCallback((e: React.MouseEvent, effectId: string, index: number) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, effectId, index })
  }, [])

  const closeContextMenu = useCallback(() => {
    setContextMenu(null)
  }, [])

  /** Find the group this effect belongs to, if any */
  const findGroupForEffect = useCallback((effectId: string): string | null => {
    for (const [groupId, group] of Object.entries(deviceGroups)) {
      if (group.effectIds.includes(effectId)) return groupId
    }
    return null
  }, [deviceGroups])

  /** Build context menu items for a given effect */
  const buildMenuItems = useCallback((effectId: string, index: number): MenuItem[] => {
    const items: MenuItem[] = []
    const groupId = findGroupForEffect(effectId)

    // "Group with Previous" — enabled when there's a previous effect and neither is already in the same group
    if (index > 0) {
      const prevEffect = effectChain[index - 1]
      const prevGroup = findGroupForEffect(prevEffect.id)
      const alreadyGrouped = groupId !== null && groupId === prevGroup
      items.push({
        label: 'Group with Previous',
        disabled: alreadyGrouped,
        action: () => {
          const activeTrackId = getActiveTrackId()
          if (!activeTrackId) return
          useProjectStore.getState().groupEffects(activeTrackId, [prevEffect.id, effectId])
        },
        shortcut: prettyShortcut(shortcutRegistry.getEffectiveKey('group_with_previous')),
      })
    }

    // "Ungroup" — only shown when effect is in a group
    if (groupId) {
      items.push({
        label: 'Ungroup',
        action: () => {
          useProjectStore.getState().ungroupEffects(groupId)
        },
        shortcut: prettyShortcut(shortcutRegistry.getEffectiveKey('ungroup')),
      })
    }

    // Epic 3 (D3): use activeTrackId so per-track freeze state is queried correctly.
    // Empty string → isFrozen returns false (safe no-op when no active track).
    const indexIsFrozen = isFrozenAt(activeTrackId ?? '', index)
    const busy = freezeOpState !== 'idle'

    if (onFreezeUpTo && !indexIsFrozen) {
      items.push({
        label: `Freeze up to here (${index + 1} effect${index === 0 ? '' : 's'})`,
        disabled: busy,
        action: () => {
          void onFreezeUpTo(index)
        },
      })
    }
    if (onUnfreeze && indexIsFrozen) {
      items.push({
        label: 'Unfreeze',
        disabled: busy,
        action: () => {
          void onUnfreeze()
        },
      })
    }
    if (onFlatten && indexIsFrozen) {
      items.push({
        label: 'Flatten to file…',
        disabled: busy,
        action: () => {
          void onFlatten()
        },
      })
    }

    // F-0516-1: Save the right-clicked effect as a single-effect preset.
    if (onSaveAsPreset) {
      items.push({
        label: 'Save as Preset…',
        action: () => {
          onSaveAsPreset(effectId)
        },
      })
    }
    // F-0516-1: Save the entire chain (incl. mappings) as a chain preset.
    if (onSaveChainAsPreset && effectChain.length > 0) {
      items.push({
        label: 'Save Chain as Preset…',
        action: () => {
          onSaveChainAsPreset()
        },
      })
    }

    return items
  }, [effectChain, findGroupForEffect, onFreezeUpTo, onUnfreeze, onFlatten, onSaveAsPreset, onSaveChainAsPreset, isFrozenAt, freezeOpState, activeTrackId])

  const chainTimeColor = lastFrameMs < 50 ? '#4ade80' : lastFrameMs < 100 ? '#f59e0b' : '#ef4444'

  // V5 (2026-05-16): pulled the drag-target props above the empty/populated
  // branch so a future third branch (e.g. error state) silently inherits the
  // drag affordance instead of having to remember to re-wire onDragOver/Drop.
  const rootProps = {
    className: `device-chain${isDragOver ? ' device-chain--drag-over' : ''}`,
    'data-testid': 'device-chain',
    style: { height: `${height}px` },
    onDragOver: handleDragOver,
    onDragLeave: handleDragLeave,
    onDrop: handleDrop,
  } as const

  const resizeHandle = (
    <div
      className="device-chain__resize-handle"
      onPointerDown={handleResizeDown}
      onPointerMove={handleResizeMove}
      onPointerUp={handleResizeUp}
      aria-label="Resize device chain panel"
      title="Drag to resize"
    />
  )

  if (effectChain.length === 0) {
    return (
      <div {...rootProps}>
        {resizeHandle}
        <div className="device-chain__header">
          <span className="device-chain__title">Device Chain</span>
        </div>
        <div className="device-chain__empty">
          <span>{isDragOver ? 'Release to add effect' : 'Add effects from the browser (click or drag)'}</span>
        </div>
      </div>
    )
  }

  return (
    <div {...rootProps}>
      {resizeHandle}
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
          const groupId = findGroupForEffect(effect.id)
          return (
            <div
              key={effect.id}
              className={`device-chain__item${groupId ? ' device-chain__item--grouped' : ''}`}
              data-group-id={groupId ?? undefined}
            >
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
                onContextMenu={(e) => handleContextMenu(e, effect.id, index)}
              />
            </div>
          )
        })}
      </div>

      {contextMenu && (() => {
        const items = buildMenuItems(contextMenu.effectId, contextMenu.index)
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
