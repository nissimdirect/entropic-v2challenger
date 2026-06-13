/**
 * MK.9 — Cut / copy committed mask region to a new track above.
 *
 * Named tests (TEST PLAN, packets/masking.md MK.9):
 *   - cut region creates masked clip on new track and inverse on original
 *   - copy region leaves original untouched
 *   - cut is one undo entry restoring both clips   (HistoryPanel rows = 1, undo → deep-equal)
 *   - cut with no selection is a no-op toast       (negative)
 *   - cut at composite layer cap refused with toast (negative, 50-layer fixture)
 *   - shortcut collision check recorded
 *
 * The render math (delete-inside / delete-outside via maskRef + maskMode) is
 * proven by MK.2/MK.3's existing render tests — this suite asserts the STORE
 * COMPOSITION: track placement, matte carrying, one-undo atomicity, deep-equal
 * restoration, and the two negative guards.
 */
import { describe, it, expect, beforeEach } from 'vitest'

// Mock window.entropic before store import (same shape as mk4-matte-actions.test.ts).
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
import { useUndoStore } from '../../renderer/stores/undo'
import { useToastStore } from '../../renderer/stores/toast'
import { LIMITS } from '../../shared/limits'
import { DEFAULT_SHORTCUTS } from '../../renderer/utils/default-shortcuts'
import type { Clip, MatteNode, Track } from '../../shared/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetStores() {
  useTimelineStore.getState().reset()
  useUndoStore.getState().clear()
  useToastStore.setState({ toasts: [] })
}

function makeRectNode(overrides: Partial<MatteNode> = {}): MatteNode {
  return {
    id: `node-${Math.random().toString(36).slice(2, 8)}`,
    kind: 'rect',
    params: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 },
    op: 'add',
    invert: false,
    feather: 0,
    growShrink: 0,
    enabled: true,
    ...overrides,
  }
}

/** Set up one video track + one clip carrying a committed mask selection. */
function setupClipWithSelection(): { trackId: string; clipId: string; nodeId: string } {
  const tl = useTimelineStore.getState()
  const trackId = tl.addTrack('V1', '#4ade80') as string
  const clipId = `clip-${Math.random().toString(36).slice(2, 8)}`
  const clip: Clip = {
    id: clipId,
    assetId: 'asset-1',
    trackId,
    position: 0,
    duration: 10,
    inPoint: 0,
    outPoint: 10,
    speed: 1,
  }
  tl.addClip(trackId, clip)
  const node = makeRectNode()
  tl.addMatteNode(clipId, node)
  useTimelineStore.setState({ committedMaskSelection: { nodeId: node.id, clipId } })
  // Clear the addTrack/addClip/addMatteNode undo entries — we only want to count
  // the cut/copy op's entries in the one-undo tests.
  useUndoStore.getState().clear()
  return { trackId, clipId, nodeId: node.id }
}

function getClip(clipId: string): Clip | undefined {
  for (const track of useTimelineStore.getState().tracks) {
    const clip = track.clips.find((c) => c.id === clipId)
    if (clip) return clip
  }
  return undefined
}

function findTrackOfClip(clipId: string): Track | undefined {
  return useTimelineStore.getState().tracks.find((t) => t.clips.some((c) => c.id === clipId))
}

// ---------------------------------------------------------------------------
// cut region creates masked clip on new track and inverse on original
// ---------------------------------------------------------------------------

describe('cut region creates masked clip on new track and inverse on original', () => {
  beforeEach(resetStores)

  it('lifts the region to a new track above and stamps the inverse on the original', () => {
    const { trackId, clipId, nodeId } = setupClipWithSelection()
    const tracksBefore = useTimelineStore.getState().tracks.length

    useTimelineStore.getState().cutRegionToTrack(clipId)

    const state = useTimelineStore.getState()
    // One new track was added.
    expect(state.tracks.length).toBe(tracksBefore + 1)

    // The new track sits ABOVE the source (lower index = topmost UI row).
    const srcIdx = state.tracks.findIndex((t) => t.id === trackId)
    const newTrack = state.tracks.find((t) => t.id !== trackId && t.clips.length === 1)!
    const newIdx = state.tracks.findIndex((t) => t.id === newTrack.id)
    expect(newIdx).toBeLessThan(srcIdx)
    expect(newIdx).toBe(srcIdx - 1) // directly above

    // New clip = duplicate carrying the matte, maskMode = deleteOutside (region shows).
    const lifted = newTrack.clips[0]
    expect(lifted.id).not.toBe(clipId)
    expect(lifted.assetId).toBe('asset-1')
    expect(lifted.maskMode).toBe('deleteOutside')
    expect(lifted.maskStack).toHaveLength(1)

    // The matte node is a DEEP copy — distinct id AND distinct params object (no aliasing).
    expect(lifted.maskStack![0].id).not.toBe(nodeId)
    const original = getClip(clipId)!
    expect(lifted.maskStack![0].params).not.toBe(original.maskStack![0].params)
    expect(lifted.maskStack![0].params).toEqual(original.maskStack![0].params)

    // The new track has an EMPTY effect chain (independent processing — failure mode pin).
    expect(newTrack.effectChain).toHaveLength(0)

    // The ORIGINAL gains the inverse: deleteInside (the hole).
    expect(original.maskMode).toBe('deleteInside')

    // Selection is consumed.
    expect(state.committedMaskSelection).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// copy region leaves original untouched
// ---------------------------------------------------------------------------

describe('copy region leaves original untouched', () => {
  beforeEach(resetStores)

  it('duplicates onto a new track but does NOT modify the original clip', () => {
    const { trackId, clipId } = setupClipWithSelection()
    const originalBefore = structuredClone(getClip(clipId)!)

    useTimelineStore.getState().copyRegionToTrack(clipId)

    const state = useTimelineStore.getState()
    const newTrack = state.tracks.find((t) => t.id !== trackId && t.clips.length === 1)!
    const lifted = newTrack.clips[0]
    expect(lifted.maskMode).toBe('deleteOutside')
    expect(newTrack.effectChain).toHaveLength(0)

    // Original is byte-for-byte unchanged (no maskMode stamped on copy).
    const originalAfter = getClip(clipId)!
    expect(originalAfter).toEqual(originalBefore)
    expect(originalAfter.maskMode).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// cut is one undo entry restoring both clips  (deep-equal pre-state)
// ---------------------------------------------------------------------------

describe('cut is one undo entry restoring both clips', () => {
  beforeEach(resetStores)

  it('produces exactly one HistoryPanel row and undo restores deep-equal pre-state', () => {
    const { clipId } = setupClipWithSelection()

    // Deep snapshot of the FULL pre-state (both clips: original + absence of the lifted one).
    const tracksPre = structuredClone(useTimelineStore.getState().tracks)
    const selPre = structuredClone(useTimelineStore.getState().committedMaskSelection)
    const undoDepthPre = useUndoStore.getState().past.length // 0 after setup clear

    useTimelineStore.getState().cutRegionToTrack(clipId)

    // HistoryPanel row count for THIS op = exactly 1.
    expect(useUndoStore.getState().past.length).toBe(undoDepthPre + 1)

    // Undo → deep-equal pre-state (new track removed + original's mask reverted).
    useUndoStore.getState().undo()

    const tracksPost = useTimelineStore.getState().tracks
    expect(tracksPost).toEqual(tracksPre)
    expect(useTimelineStore.getState().committedMaskSelection).toEqual(selPre)

    // And the undo stack is back to where it started (single entry popped).
    expect(useUndoStore.getState().past.length).toBe(undoDepthPre)
  })

  it('copy is also exactly one undo entry restoring deep-equal pre-state', () => {
    const { clipId } = setupClipWithSelection()
    const tracksPre = structuredClone(useTimelineStore.getState().tracks)

    useTimelineStore.getState().copyRegionToTrack(clipId)
    expect(useUndoStore.getState().past.length).toBe(1)

    useUndoStore.getState().undo()
    expect(useTimelineStore.getState().tracks).toEqual(tracksPre)
  })

  it('redo re-applies the cut deterministically', () => {
    const { clipId } = setupClipWithSelection()
    useTimelineStore.getState().cutRegionToTrack(clipId)
    const tracksAfterCut = structuredClone(useTimelineStore.getState().tracks)

    useUndoStore.getState().undo()
    useUndoStore.getState().redo()

    expect(useTimelineStore.getState().tracks).toEqual(tracksAfterCut)
  })
})

// ---------------------------------------------------------------------------
// cut with no selection is a no-op toast  (negative)
// ---------------------------------------------------------------------------

describe('cut with no selection is a no-op toast', () => {
  beforeEach(resetStores)

  it('does not mutate state and emits a warning toast', () => {
    // A clip exists but NO committed selection.
    const tl = useTimelineStore.getState()
    const trackId = tl.addTrack('V1', '#4ade80') as string
    const clip: Clip = {
      id: 'lonely', assetId: 'asset-1', trackId, position: 0, duration: 10, inPoint: 0, outPoint: 10, speed: 1,
    }
    tl.addClip(trackId, clip)
    useUndoStore.getState().clear()
    useToastStore.setState({ toasts: [] })

    const tracksPre = structuredClone(useTimelineStore.getState().tracks)

    useTimelineStore.getState().cutRegionToTrack('lonely')

    // No state change, no undo entry.
    expect(useTimelineStore.getState().tracks).toEqual(tracksPre)
    expect(useUndoStore.getState().past.length).toBe(0)
    // A warning toast was raised.
    const toasts = useToastStore.getState().toasts
    expect(toasts.length).toBeGreaterThanOrEqual(1)
    expect(toasts.some((t) => t.level === 'warning' && /select a region/i.test(t.message))).toBe(true)
  })

  it('copy with no selection is also a no-op toast', () => {
    const tl = useTimelineStore.getState()
    const trackId = tl.addTrack('V1', '#4ade80') as string
    tl.addClip(trackId, { id: 'lonely2', assetId: 'a', trackId, position: 0, duration: 5, inPoint: 0, outPoint: 5, speed: 1 })
    useUndoStore.getState().clear()
    useToastStore.setState({ toasts: [] })

    useTimelineStore.getState().copyRegionToTrack('lonely2')
    expect(useUndoStore.getState().past.length).toBe(0)
    expect(useToastStore.getState().toasts.some((t) => t.level === 'warning')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// cut at composite layer cap refused with toast  (negative, 50-layer fixture)
// ---------------------------------------------------------------------------

describe('cut at composite layer cap refused with toast', () => {
  beforeEach(resetStores)

  it('refuses with a toast when the composite-layer cap is already reached', () => {
    // Build a 50-layer fixture: one video track holding MAX_COMPOSITE_LAYERS clips,
    // the last of which carries the committed selection. countCompositeLayers counts
    // visual clips, so this is exactly at the cap.
    const tl = useTimelineStore.getState()
    const trackId = tl.addTrack('V1', '#4ade80') as string
    const cap = LIMITS.MAX_COMPOSITE_LAYERS
    let lastClipId = ''
    for (let i = 0; i < cap; i++) {
      lastClipId = `clip-${i}`
      tl.addClip(trackId, {
        id: lastClipId, assetId: 'a', trackId,
        position: i * 11, duration: 10, inPoint: 0, outPoint: 10, speed: 1,
      })
    }
    const node = makeRectNode()
    tl.addMatteNode(lastClipId, node)
    useTimelineStore.setState({ committedMaskSelection: { nodeId: node.id, clipId: lastClipId } })
    useUndoStore.getState().clear()
    useToastStore.setState({ toasts: [] })

    const tracksPre = structuredClone(useTimelineStore.getState().tracks)
    expect(useTimelineStore.getState().tracks[0].clips.length).toBe(cap)

    useTimelineStore.getState().cutRegionToTrack(lastClipId)

    // Refused: no new track, no state change, no undo entry.
    expect(useTimelineStore.getState().tracks).toEqual(tracksPre)
    expect(useUndoStore.getState().past.length).toBe(0)
    const toasts = useToastStore.getState().toasts
    expect(toasts.some((t) => t.level === 'warning' && /layer limit/i.test(t.message))).toBe(true)
  })

  it('copy at the cap is also refused (cut/copy each add exactly one layer)', () => {
    const tl = useTimelineStore.getState()
    const trackId = tl.addTrack('V1', '#4ade80') as string
    const cap = LIMITS.MAX_COMPOSITE_LAYERS
    let lastClipId = ''
    for (let i = 0; i < cap; i++) {
      lastClipId = `c-${i}`
      tl.addClip(trackId, { id: lastClipId, assetId: 'a', trackId, position: i * 11, duration: 10, inPoint: 0, outPoint: 10, speed: 1 })
    }
    const node = makeRectNode()
    tl.addMatteNode(lastClipId, node)
    useTimelineStore.setState({ committedMaskSelection: { nodeId: node.id, clipId: lastClipId } })
    useUndoStore.getState().clear()
    useToastStore.setState({ toasts: [] })

    useTimelineStore.getState().copyRegionToTrack(lastClipId)
    expect(useUndoStore.getState().past.length).toBe(0)
    expect(useToastStore.getState().toasts.some((t) => /layer limit/i.test(t.message))).toBe(true)
  })

  it('one BELOW the cap is allowed (boundary: cap-1 succeeds)', () => {
    const tl = useTimelineStore.getState()
    const trackId = tl.addTrack('V1', '#4ade80') as string
    const cap = LIMITS.MAX_COMPOSITE_LAYERS
    let lastClipId = ''
    for (let i = 0; i < cap - 1; i++) {
      lastClipId = `cb-${i}`
      tl.addClip(trackId, { id: lastClipId, assetId: 'a', trackId, position: i * 11, duration: 10, inPoint: 0, outPoint: 10, speed: 1 })
    }
    const node = makeRectNode()
    tl.addMatteNode(lastClipId, node)
    useTimelineStore.setState({ committedMaskSelection: { nodeId: node.id, clipId: lastClipId } })
    useUndoStore.getState().clear()

    useTimelineStore.getState().cutRegionToTrack(lastClipId)
    // Succeeded: exactly one undo entry, a new track exists.
    expect(useUndoStore.getState().past.length).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// shortcut collision check recorded
// ---------------------------------------------------------------------------

describe('shortcut collision check recorded', () => {
  it('Cmd+J / Cmd+Shift+J map to the new mask actions and collide with nothing pre-existing', () => {
    const byKey = (keys: string) => DEFAULT_SHORTCUTS.filter((s) => s.keys === keys)

    // Exactly one binding each, and it is the MK.9 action.
    expect(byKey('meta+j').map((s) => s.action)).toEqual(['mask_copy_to_track'])
    expect(byKey('meta+shift+j').map((s) => s.action)).toEqual(['mask_cut_to_track'])

    // The pre-existing 'j' family is a DIFFERENT key combo (bare j = transport).
    expect(byKey('j').map((s) => s.action)).toEqual(['transport_reverse'])

    // Cmd+Shift+C is automation_copy — a DISTINCT combo, NOT what we bound.
    expect(byKey('meta+shift+c').map((s) => s.action)).toEqual(['automation_copy'])
    expect(byKey('meta+shift+c').map((s) => s.action)).not.toContain('mask_cut_to_track')
  })
})
