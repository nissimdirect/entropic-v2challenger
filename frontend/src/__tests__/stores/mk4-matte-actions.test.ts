/**
 * MK.4 — Matte node store actions + delete/fill operations.
 *
 * Named tests:
 *   - delete inside sets maskMode and is undoable
 *   - fill uses a design-spec swatch hex
 *   - addMatteNode / removeMatteNode / updateMatteNode are undoable
 *   - preview tool mode transitions
 */

import { describe, it, expect, beforeEach } from 'vitest'

// Mock window.entropic before store import
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
import type { Clip, MatteNode } from '../../shared/types'
import { CLIP_COLOR_SWATCHES } from '../../renderer/components/timeline/Clip'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetStores() {
  useTimelineStore.getState().reset()
  useUndoStore.getState().clear()
}

function setupTrackAndClip(): string {
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
  return clipId
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

function getClip(clipId: string): Clip | undefined {
  for (const track of useTimelineStore.getState().tracks) {
    const clip = track.clips.find((c) => c.id === clipId)
    if (clip) return clip
  }
  return undefined
}

// ---------------------------------------------------------------------------
// addMatteNode
// ---------------------------------------------------------------------------

describe('addMatteNode', () => {
  beforeEach(resetStores)

  it('adds a node to the clip maskStack', () => {
    const clipId = setupTrackAndClip()
    const node = makeRectNode()
    useTimelineStore.getState().addMatteNode(clipId, node)

    const clip = getClip(clipId)!
    expect(clip.maskStack).toHaveLength(1)
    expect(clip.maskStack![0].id).toBe(node.id)
  })

  it('addMatteNode is undoable', () => {
    const clipId = setupTrackAndClip()
    const node = makeRectNode()
    useTimelineStore.getState().addMatteNode(clipId, node)

    // Node present
    expect(getClip(clipId)!.maskStack).toHaveLength(1)

    // Undo
    useUndoStore.getState().undo()

    const stack = getClip(clipId)?.maskStack ?? []
    expect(stack).toHaveLength(0)
  })

  it('stacks multiple nodes in order', () => {
    const clipId = setupTrackAndClip()
    const n1 = makeRectNode({ id: 'n1' })
    const n2 = makeRectNode({ id: 'n2' })
    useTimelineStore.getState().addMatteNode(clipId, n1)
    useTimelineStore.getState().addMatteNode(clipId, n2)

    const stack = getClip(clipId)!.maskStack!
    expect(stack).toHaveLength(2)
    expect(stack[0].id).toBe('n1')
    expect(stack[1].id).toBe('n2')
  })

  it('no-ops for unknown clipId', () => {
    // Should not throw
    expect(() => useTimelineStore.getState().addMatteNode('nonexistent', makeRectNode())).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// removeMatteNode
// ---------------------------------------------------------------------------

describe('removeMatteNode', () => {
  beforeEach(resetStores)

  it('removes a node from the maskStack', () => {
    const clipId = setupTrackAndClip()
    const node = makeRectNode({ id: 'rm-test' })
    useTimelineStore.getState().addMatteNode(clipId, node)
    useTimelineStore.getState().removeMatteNode(clipId, 'rm-test')

    const stack = getClip(clipId)?.maskStack ?? []
    expect(stack).toHaveLength(0)
  })

  it('removeMatteNode is undoable', () => {
    const clipId = setupTrackAndClip()
    const node = makeRectNode({ id: 'undo-rm' })
    useTimelineStore.getState().addMatteNode(clipId, node)
    useUndoStore.getState().clear()  // clear the add undo entry

    useTimelineStore.getState().removeMatteNode(clipId, 'undo-rm')
    expect(getClip(clipId)?.maskStack ?? []).toHaveLength(0)

    useUndoStore.getState().undo()
    expect(getClip(clipId)?.maskStack ?? []).toHaveLength(1)
    expect(getClip(clipId)!.maskStack![0].id).toBe('undo-rm')
  })
})

// ---------------------------------------------------------------------------
// updateMatteNode
// ---------------------------------------------------------------------------

describe('updateMatteNode', () => {
  beforeEach(resetStores)

  it('patches a node in place', () => {
    const clipId = setupTrackAndClip()
    const node = makeRectNode({ id: 'upd-test', feather: 0 })
    useTimelineStore.getState().addMatteNode(clipId, node)

    useTimelineStore.getState().updateMatteNode(clipId, 'upd-test', { feather: 10 })

    const updated = getClip(clipId)!.maskStack!.find((n) => n.id === 'upd-test')!
    expect(updated.feather).toBe(10)
    expect(updated.id).toBe('upd-test')  // id must not change
  })

  it('updateMatteNode is undoable', () => {
    const clipId = setupTrackAndClip()
    const node = makeRectNode({ id: 'undo-upd', feather: 0 })
    useTimelineStore.getState().addMatteNode(clipId, node)
    useUndoStore.getState().clear()

    useTimelineStore.getState().updateMatteNode(clipId, 'undo-upd', { feather: 15 })
    expect(getClip(clipId)!.maskStack!.find((n) => n.id === 'undo-upd')!.feather).toBe(15)

    useUndoStore.getState().undo()
    expect(getClip(clipId)!.maskStack!.find((n) => n.id === 'undo-upd')!.feather).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// delete inside sets maskMode and is undoable
// ---------------------------------------------------------------------------

describe('delete inside sets maskMode and is undoable', () => {
  beforeEach(resetStores)

  it('setClipMaskMode("deleteInside") sets maskMode on the clip', () => {
    const clipId = setupTrackAndClip()
    useTimelineStore.getState().setClipMaskMode(clipId, 'deleteInside')

    const clip = getClip(clipId)!
    expect(clip.maskMode).toBe('deleteInside')
  })

  it('setClipMaskMode("deleteOutside") sets maskMode to deleteOutside', () => {
    const clipId = setupTrackAndClip()
    useTimelineStore.getState().setClipMaskMode(clipId, 'deleteOutside')

    expect(getClip(clipId)!.maskMode).toBe('deleteOutside')
  })

  it('setClipMaskMode is undoable', () => {
    const clipId = setupTrackAndClip()
    useTimelineStore.getState().setClipMaskMode(clipId, 'deleteInside')
    expect(getClip(clipId)!.maskMode).toBe('deleteInside')

    useUndoStore.getState().undo()
    // maskMode should revert to undefined
    expect(getClip(clipId)!.maskMode).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// fill uses a design-spec swatch hex
// ---------------------------------------------------------------------------

describe('fill uses a design-spec swatch hex', () => {
  beforeEach(resetStores)

  it('setClipMaskMode("fill") with a swatch hex records the color', () => {
    const clipId = setupTrackAndClip()
    const swatchHex = CLIP_COLOR_SWATCHES[0].hex  // '#C07A6A' (Terracotta)

    useTimelineStore.getState().setClipMaskMode(clipId, 'fill', swatchHex)

    const clip = getClip(clipId)!
    expect(clip.maskMode).toBe('fill')
    expect(clip.maskFillColor).toBe(swatchHex)
  })

  it('fill color is one of the 8 design-spec swatches', () => {
    const clipId = setupTrackAndClip()
    const swatchHexes = CLIP_COLOR_SWATCHES.map((s) => s.hex)

    // All 8 swatches are valid fill colors
    for (const hex of swatchHexes) {
      useTimelineStore.getState().setClipMaskMode(clipId, 'fill', hex)
      expect(swatchHexes).toContain(getClip(clipId)!.maskFillColor)
    }
  })

  it('fill maskMode is undoable', () => {
    const clipId = setupTrackAndClip()
    const swatchHex = CLIP_COLOR_SWATCHES[3].hex

    useTimelineStore.getState().setClipMaskMode(clipId, 'fill', swatchHex)
    expect(getClip(clipId)!.maskMode).toBe('fill')

    useUndoStore.getState().undo()
    expect(getClip(clipId)!.maskMode).toBeUndefined()
    expect(getClip(clipId)!.maskFillColor).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Preview tool mode transitions
// ---------------------------------------------------------------------------

describe('preview tool mode transitions', () => {
  beforeEach(resetStores)

  it('starts as null', () => {
    expect(useTimelineStore.getState().previewToolMode).toBeNull()
  })

  it('setPreviewToolMode("marquee-rect") sets the mode', () => {
    useTimelineStore.getState().setPreviewToolMode('marquee-rect')
    expect(useTimelineStore.getState().previewToolMode).toBe('marquee-rect')
  })

  it('setPreviewToolMode("marquee-ellipse") sets ellipse mode', () => {
    useTimelineStore.getState().setPreviewToolMode('marquee-ellipse')
    expect(useTimelineStore.getState().previewToolMode).toBe('marquee-ellipse')
  })

  it('setPreviewToolMode(null) clears the mode and resets in-progress state', () => {
    useTimelineStore.getState().setPreviewToolMode('marquee-rect')
    useTimelineStore.getState().setMarqueeInProgress({ x1: 0, y1: 0, x2: 100, y2: 100 })
    useTimelineStore.setState({ committedMaskSelection: { nodeId: 'n1', clipId: 'c1' } })

    useTimelineStore.getState().setPreviewToolMode(null)

    expect(useTimelineStore.getState().previewToolMode).toBeNull()
    expect(useTimelineStore.getState().marqueeInProgress).toBeNull()
    expect(useTimelineStore.getState().committedMaskSelection).toBeNull()
  })

  it('clearMaskSelection clears committedMaskSelection and marqueeInProgress', () => {
    useTimelineStore.getState().setMarqueeInProgress({ x1: 0, y1: 0, x2: 50, y2: 50 })
    useTimelineStore.setState({ committedMaskSelection: { nodeId: 'n1', clipId: 'c1' } })

    useTimelineStore.getState().clearMaskSelection()

    expect(useTimelineStore.getState().committedMaskSelection).toBeNull()
    expect(useTimelineStore.getState().marqueeInProgress).toBeNull()
  })
})
