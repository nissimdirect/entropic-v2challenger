/**
 * REPRO HARNESS (temporary) — confirms the two cross-store data-integrity bugs
 * flagged by the Epic-1 data-integrity review (TIGER 1 + TIGER 2), against the
 * REAL stores on origin/main (pre-refactor). These tests assert the *current,
 * buggy* behavior on purpose: if they pass, the bugs are real and Epic 1.5 is
 * justified. They will be INVERTED into guard tests when Epic 1.5 fixes them.
 */
import { describe, it, expect, beforeEach } from 'vitest'

;(globalThis as any).window = {
  entropic: {
    onEngineStatus: () => {},
    sendCommand: async () => ({ ok: true }),
    selectFile: async () => null,
    selectSavePath: async () => null,
    onExportProgress: () => {},
  },
}

import { useTimelineStore } from '../../renderer/stores/timeline'
import { useAutomationStore } from '../../renderer/stores/automation'
import { useUndoStore } from '../../renderer/stores/undo'
import type { Track, EffectInstance, AutomationLane } from '../../shared/types'

beforeEach(() => {
  useUndoStore.getState().clear()
  useTimelineStore.getState().reset()
  useAutomationStore.setState({ lanes: {} })
})

function fx(id: string): EffectInstance {
  return { id, effectId: 'fx.pixelsort', isEnabled: true, isFrozen: false,
    parameters: { threshold: 0.5 }, modulations: {}, mix: 1, mask: null }
}
function lane(id: string, paramPath: string): AutomationLane {
  return { id, paramPath, color: '#4ade80', isVisible: true, points: [], isTrigger: false }
}

describe('TIGER 1 — removeTrack orphans cross-store automation lanes', () => {
  it('leaves useAutomationStore.lanes[trackId] dangling after the track is deleted', () => {
    const tid = useTimelineStore.getState().addTrack('V1', '#4ade80')!
    expect(tid).toBeTruthy()
    // a real per-track automation lane lives in the automation store, keyed by trackId
    useAutomationStore.getState().addLane(tid, 'fx-A', 'threshold', '#4ade80')
    expect(useAutomationStore.getState().lanes[tid]?.length).toBe(1)

    // delete the track
    useTimelineStore.getState().removeTrack(tid)
    expect(useTimelineStore.getState().tracks.find((t) => t.id === tid)).toBeUndefined()

    // BUG: the automation store was never told — lanes[tid] is orphaned
    const orphan = useAutomationStore.getState().lanes[tid]
    expect(orphan).toBeDefined()
    expect(orphan?.length).toBe(1) // <-- proves the orphan; correct behavior would be undefined/0
  })
})

describe('TIGER 2 — duplicateTrack clones effects with NEW ids but keeps STALE paramPaths', () => {
  it('produces a copy whose automation lane points at an effect id that does not exist on the copy', () => {
    const base = useTimelineStore.getState().tracks
    const src: Track = {
      id: 'src', type: 'video', name: 'V1', color: '#4ade80',
      isMuted: false, isSoloed: false, opacity: 1, blendMode: 'normal',
      clips: [],
      effectChain: [fx('fx-X')],
      automationLanes: [lane('lane-1', 'fx-X.threshold')],
    }
    useTimelineStore.setState({ tracks: [...base, src] })

    useTimelineStore.getState().duplicateTrack('src')
    const copy = useTimelineStore.getState().tracks.find((t) => t.name === 'V1 (Copy)')
    expect(copy).toBeDefined()

    const copiedEffectId = copy!.effectChain[0].id
    const copiedLanePath = copy!.automationLanes[0].paramPath

    // the cloned effect got a fresh uuid...
    expect(copiedEffectId).not.toBe('fx-X')
    // ...but the cloned lane's paramPath STILL references the OLD effect id → dangling
    expect(copiedLanePath).toBe('fx-X.threshold')
    // proof of the bug: lane path does NOT match the copy's actual effect id
    expect(copiedLanePath.startsWith(copiedEffectId + '.')).toBe(false)
  })
})
