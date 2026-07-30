/**
 * deviceChainView selector — F4b proof-of-pattern (grows the trackStats.ts convention).
 *
 * Composes the reactive cross-store reads DeviceChain.tsx previously called
 * inline (13 separate hook calls across 5 stores + 2 project-store custom
 * hooks). Same selector functions, same call order, same values — the
 * component destructures this instead of calling each hook itself. Local
 * component state (contextMenu, isDragOver, resizeRef, …) and imperative
 * `.getState()` reads (used inside drag/drop and menu-action handlers) are
 * NOT moved here — only the render-time reactive reads are.
 */
import { useProjectStore, useActiveEffectChain, useActiveTrackId, useActivePadEffectChain } from '../stores/project'
import { useInstrumentsStore, resolveRackNode } from '../stores/instruments'
import { useTimelineStore } from '../stores/timeline'
import { useEffectsStore } from '../stores/effects'
import { useEngineStore } from '../stores/engine'
import { useFreezeStore } from '../stores/freeze'
import { useLayoutStore } from '../stores/layout'
import type { MatteNode } from '../../shared/types'

// Stable empty array for the no-mask-nodes case (avoid re-render churn).
const EMPTY_MASK_NODES: MatteNode[] = []

export function useDeviceChainView() {
  // B4-pad-chain UI: which chain (track vs. selected rack pad) is being edited.
  const selectedRackPad = useProjectStore((s) => s.selectedRackPad)
  const activeTrackId = useActiveTrackId()
  const activeTrackType = useTimelineStore((s) => s.tracks.find((t) => t.id === activeTrackId)?.type)
  const trackEffectChain = useActiveEffectChain()
  const padEffectChain = useActivePadEffectChain()
  const isPadTarget = selectedRackPad != null && selectedRackPad.trackId === activeTrackId
  const effectChain = isPadTarget ? padEffectChain : trackEffectChain
  const padLabel = useInstrumentsStore((s) => {
    if (!isPadTarget || !selectedRackPad) return null
    const rack = s.racks[selectedRackPad.trackId]
    if (!rack) return null
    const node = resolveRackNode(rack, selectedRackPad.branchPath ?? [])
    if (!node) return null
    const idx = node.pads.findIndex((p) => p.id === selectedRackPad.padId)
    return idx === -1 ? null : `Pad ${idx + 1}`
  })
  const selectedEffectId = useProjectStore((s) => s.selectedEffectId)
  const deviceGroups = useProjectStore((s) => s.deviceGroups)
  const registry = useEffectsStore((s) => s.registry)
  const projectAssets = useProjectStore((s) => s.assets)
  const lastFrameMs = useEngineStore((s) => s.lastFrameMs) ?? 0
  const isFrozenAt = useFreezeStore((s) => s.isFrozen)
  const freezeOpState = useFreezeStore((s) => s.operationState)
  const height = useLayoutStore((s) => s.deviceChainHeight)

  // MK.3/MK.13: mask nodes + owning clip id for the active clip at the playhead.
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

  return {
    selectedRackPad,
    activeTrackId,
    activeTrackType,
    isPadTarget,
    effectChain,
    padLabel,
    selectedEffectId,
    deviceGroups,
    registry,
    projectAssets,
    lastFrameMs,
    isFrozenAt,
    freezeOpState,
    height,
    playheadTime,
    maskNodes,
    maskClipId,
  }
}
