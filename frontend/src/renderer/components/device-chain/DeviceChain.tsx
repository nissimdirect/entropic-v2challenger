import { useCallback, useRef, useState } from 'react'
import { useProjectStore, useActiveEffectChain, getActiveTrackId, useActiveTrackId, useActivePadEffectChain } from '../../stores/project'
import { useInstrumentsStore, resolveRackNode } from '../../stores/instruments'
import { useTimelineStore } from '../../stores/timeline'
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
import { EFFECT_DRAG_TYPE, CREATRIX_NONCE_TYPE, SESSION_NONCE } from '../effects/EffectBrowser'
import { randomUUID } from '../../utils'
import type { EffectInstance, MatteNode, MatteRef } from '../../../shared/types'

// Stable empty array for the no-mask-nodes case (avoid re-render churn).
const EMPTY_MASK_NODES: MatteNode[] = []

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
  // B4-pad-chain UI: when a rack pad is selected, the bottom DeviceChain edits
  // THAT PAD's insert chain (Ableton drum-rack); otherwise it edits the active
  // TRACK's chain exactly as before. `selectedRackPad` is the single decision
  // point — every display + mutation below routes through `chainTarget`.
  const selectedRackPad = useProjectStore((s) => s.selectedRackPad)
  // Epic 3 (D3): read active trackId reactively so isFrozenAt queries the correct
  // per-track state. ALSO the scoping key for the pad target below — declared here
  // (above isPadTarget) so display + mutation share one active-track predicate.
  const activeTrackId = useActiveTrackId()
  // Both hooks subscribe unconditionally (rules-of-hooks); only the relevant one
  // is read into `effectChain` below. The track chain is the render/freeze/export
  // source and stays decoupled from this editor retarget.
  const trackEffectChain = useActiveEffectChain()
  const padEffectChain = useActivePadEffectChain()
  // qa-redteam Tiger fix: the pad target is ACTIVE-TRACK-SCOPED. A selected pad on
  // track A must NOT hijack the editor when track B is active (B's RackDevice may
  // even be unmounted). Only treat it as a pad target when the selection belongs
  // to the active track. Switching away → fall back to the track path; switching
  // back to A → the {A,P} selection re-targets (Ableton-correct, persists per-rack).
  // Also makes a deleted track's dangling selection a no-op (deleted ≠ active).
  const isPadTarget = selectedRackPad != null && selectedRackPad.trackId === activeTrackId
  // D2 (Epic 02): display the ACTIVE track's chain, OR the selected pad's chain.
  const effectChain = isPadTarget ? padEffectChain : trackEffectChain
  // B4-pad-chain UI: a header label so the user knows which device's chain is
  // shown (Ableton shows the device name). Reactive 1-based pad index, or null
  // when not on the pad's rack-track / the pad is gone (label hides → track title).
  const padLabel = useInstrumentsStore((s) => {
    if (!isPadTarget || !selectedRackPad) return null
    const rack = s.racks[selectedRackPad.trackId]
    if (!rack) return null
    // B5.2: resolve the nested RackNode the selected pad lives in (top rack when
    // branchPath is empty/absent → byte-identical to B4).
    const node = resolveRackNode(rack, selectedRackPad.branchPath ?? [])
    if (!node) return null
    const idx = node.pads.findIndex((p) => p.id === selectedRackPad.padId)
    return idx === -1 ? null : `Pad ${idx + 1}`
  })
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

  // B4-pad-chain UI: SINGLE resolution point for every chain mutation. When a
  // rack pad is selected ON THE ACTIVE TRACK, dispatch to the pad-scoped
  // instruments-store actions (write racks[trackId].pads[i].chain); otherwise to
  // the track-scoped project-store actions (write track.effectChain) — byte-
  // identical to before. Reads BOTH `selectedRackPad` AND the active trackId LIVE
  // from the stores so a handler always sees the current target and never edits a
  // hidden pad on a non-active track (qa-redteam Tiger): the pad path fires only
  // when sel.trackId === the active track — the SAME predicate the display uses.
  const dispatchChain = useCallback(() => {
    const sel = useProjectStore.getState().selectedRackPad
    const activeTid = getActiveTrackId()
    const inst = useInstrumentsStore.getState()
    const proj = useProjectStore.getState()
    if (sel && sel.trackId === activeTid) {
      const { trackId, padId, branchPath } = sel
      // B5.2: forward the selection's branchPath so a NESTED pad's chain is the
      // mutation target (undefined/empty → the top-rack pad, byte-identical to B4).
      return {
        add: (effect: EffectInstance) => inst.addEffectToPad(trackId, padId, effect, branchPath),
        remove: (id: string) => inst.removeEffectFromPad(trackId, padId, id, branchPath),
        reorder: (from: number, to: number) => inst.reorderPadEffect(trackId, padId, from, to, branchPath),
        updateParam: (id: string, key: string, value: number | string | boolean) =>
          inst.updatePadEffectParam(trackId, padId, id, key, value, branchPath),
        toggle: (id: string) => inst.togglePadEffect(trackId, padId, id, branchPath),
      }
    }
    // Track path: selection absent OR pointing at a non-active track → edit the
    // active track's chain (also covers the deleted-track dangling case).
    const trackId = activeTid
    return {
      add: (effect: EffectInstance) => {
        if (!trackId) return
        proj.addEffect(trackId, effect)
      },
      remove: (id: string) => {
        if (!trackId) return
        proj.removeEffect(trackId, id)
      },
      reorder: (from: number, to: number) => {
        if (!trackId) return
        proj.reorderEffect(trackId, from, to)
      },
      updateParam: (id: string, key: string, value: number | string | boolean) => {
        if (!trackId) return
        proj.updateParam(trackId, id, key, value)
      },
      toggle: (id: string) => {
        if (!trackId) return
        proj.toggleEffect(trackId, id)
      },
    }
  }, [])

  const handleToggle = useCallback((id: string) => {
    dispatchChain().toggle(id)
  }, [dispatchChain])

  const handleRemove = useCallback((id: string) => {
    dispatchChain().remove(id)
  }, [dispatchChain])

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
      const raw = e.dataTransfer.getData(EFFECT_DRAG_TYPE)
      // RT-3: cap defensively at 256 chars. Real payloads are <128 chars.
      if (!raw || raw.length > 256) return
      if (effectChain.length >= LIMITS.MAX_EFFECTS_PER_CHAIN) return

      // P3.2: resolve effectId from either new JSON payload or legacy plain string.
      // New payload: JSON {"kind":"fx","id":"builtin:<effectId>"} with nonce.
      // Legacy payload: plain string effectId (back-compat, no nonce required).
      let effectId: string
      const nonce = e.dataTransfer.getData(CREATRIX_NONCE_TYPE)
      if (nonce) {
        // Nonce present: validate it matches session nonce (qa-redteam H1).
        if (nonce !== SESSION_NONCE) return
        // Parse JSON payload (qa-redteam H2).
        try {
          const parsed = JSON.parse(raw)
          if (typeof parsed !== 'object' || parsed === null) return
          const { kind, id } = parsed as { kind: unknown; id: unknown }
          if (!['fx', 'op', 'composite', 'instruments'].includes(kind as string)) return
          if (typeof id !== 'string') return
          // Extract effectId from namespaced id: "builtin:<effectId>" or "user:<name>"
          const match = id.match(/^builtin:(.+)$/)
          if (!match) return  // user: presets not yet wired — reject gracefully
          effectId = match[1]
        } catch {
          return
        }
      } else {
        // Legacy plain-string fx drag payload (back-compat: pre-P3.2 browser).
        // No nonce = legacy source. Accept as-is with the original 64-char cap.
        if (raw.length > 64) return
        effectId = raw
      }

      const info = registry.find((r) => r.id === effectId)
      if (!info) return
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
      // B4-pad-chain UI: route the add to the selected pad's chain or the track's
      // chain via the single adapter (the no-track guard is inside the adapter).
      dispatchChain().add(instance)
    },
    [effectChain.length, registry, dispatchChain],
  )

  const handleUpdateParam = useCallback(
    (effectId: string, paramName: string, value: number | string | boolean) => {
      dispatchChain().updateParam(effectId, paramName, value)
    },
    [dispatchChain],
  )

  const handleSetMix = useCallback((effectId: string, mix: number) => {
    const trackId = getActiveTrackId()
    if (!trackId) return
    useProjectStore.getState().setMix(trackId, effectId, mix)
  }, [])

  // MK.3: mask nodes available to assign on this track's devices. Derived from
  // the active clip on the active track at the playhead. Reactive so adding a
  // matte node (MK.4+) immediately populates the DeviceCard mask row.
  const playheadTime = useTimelineStore((s) => s.playheadTime)
  const maskNodes = useTimelineStore((s) => {
    const tid = activeTrackId
    if (!tid) return EMPTY_MASK_NODES
    const track = s.tracks.find((t) => t.id === tid)
    if (!track) return EMPTY_MASK_NODES
    const clip = track.clips.find(
      (c) => playheadTime >= c.position && playheadTime < c.position + c.duration,
    )
    return clip?.maskStack && clip.maskStack.length > 0 ? clip.maskStack : EMPTY_MASK_NODES
  })

  // MK.13: clip_id of the clip that owns the mask stack above (for mask_thumbnail IPC).
  const maskClipId = useTimelineStore((s) => {
    const tid = activeTrackId
    if (!tid) return undefined
    const track = s.tracks.find((t) => t.id === tid)
    if (!track) return undefined
    const clip = track.clips.find(
      (c) => playheadTime >= c.position && playheadTime < c.position + c.duration,
    )
    return clip?.id
  })

  const handleSetMaskRef = useCallback((effectId: string, maskRef: MatteRef | null) => {
    const trackId = getActiveTrackId()
    if (!trackId) return
    useProjectStore.getState().setEffectMaskRef(trackId, effectId, maskRef)
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
        shortcut: prettyShortcut(shortcutRegistry.getEffectiveKey('freeze_up_to')),
      })
    }
    if (onUnfreeze && indexIsFrozen) {
      items.push({
        label: 'Unfreeze',
        disabled: busy,
        action: () => {
          void onUnfreeze()
        },
        shortcut: prettyShortcut(shortcutRegistry.getEffectiveKey('unfreeze_effects')),
      })
    }
    if (onFlatten && indexIsFrozen) {
      items.push({
        label: 'Flatten to file…',
        disabled: busy,
        action: () => {
          void onFlatten()
        },
        shortcut: prettyShortcut(shortcutRegistry.getEffectiveKey('flatten_to_video')),
      })
    }

    // F-0516-1: Save the right-clicked effect as a single-effect preset.
    if (onSaveAsPreset) {
      items.push({
        label: 'Save as Preset…',
        action: () => {
          onSaveAsPreset(effectId)
        },
        shortcut: prettyShortcut(shortcutRegistry.getEffectiveKey('save_effect_preset')),
      })
    }
    // F-0516-1: Save the entire chain (incl. mappings) as a chain preset.
    if (onSaveChainAsPreset && effectChain.length > 0) {
      items.push({
        label: 'Save Chain as Preset…',
        action: () => {
          onSaveChainAsPreset()
        },
        shortcut: prettyShortcut(shortcutRegistry.getEffectiveKey('save_chain_preset')),
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
          {padLabel && (
            <span className="device-chain__context" data-testid="device-chain-context">
              {padLabel}
            </span>
          )}
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
        {padLabel && (
          <span className="device-chain__context" data-testid="device-chain-context">
            {padLabel}
          </span>
        )}
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
                maskNodes={maskNodes}
                maskClipId={maskClipId}
                onSetMaskRef={handleSetMaskRef}
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
