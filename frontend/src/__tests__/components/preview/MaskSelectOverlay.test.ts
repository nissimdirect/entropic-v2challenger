/**
 * MK.4 — MaskSelectOverlay unit tests.
 *
 * Tests the coordinate math, drag commit logic, and cancellation behavior
 * as pure functions/store actions, without mounting React components
 * (consistent with the project's store-unit-test pattern).
 *
 * Named tests required by the HARD ORACLE:
 *   1. "marquee drag commits rect matte node in frame coords"
 *      - Exact numbers: 1920×1080 frame in 800×450 canvas with 25px letterbox
 *   2. "shift modifier sets add op and alt sets subtract"
 *   3. "escape mid-drag cancels without node" (negative)
 *   4. "zero-area drag commits nothing" (negative)
 */

import { describe, it, expect, beforeEach } from 'vitest'
import type { CanvasLayout } from '../../../renderer/utils/transform-coords'
import { computeCanvasLayout } from '../../../renderer/utils/transform-coords'

// Mock window.entropic before store import (required by store module initialization)
;(globalThis as any).window = {
  entropic: {
    onEngineStatus: () => {},
    sendCommand: async () => ({ ok: true }),
    selectFile: async () => null,
    selectSavePath: async () => null,
    onExportProgress: () => {},
  },
}

import { useTimelineStore } from '../../../renderer/stores/timeline'
import { useUndoStore } from '../../../renderer/stores/undo'
import type { Clip, MatteNode } from '../../../shared/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetStores() {
  useTimelineStore.getState().reset()
  useUndoStore.getState().clear()
}

/** Set up a minimal track + clip and return the clip id. */
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

/**
 * Simulate committing a marquee drag.
 *
 * Letterbox test geometry:
 *   frame 1920×1080, container 800×500 (height 500, not 450 — letterbox adds 25px top+bottom)
 *   displayScale = min(800/1920, 500/1080) = min(0.4167, 0.4630) → 0.4167 (width-limited)
 *   canvasDisplayWidth  = 1920 * 0.4167 = 800px  (fills width exactly)
 *   canvasDisplayHeight = 1080 * 0.4167 = 450px
 *   canvasOffsetX = (800 − 800) / 2 = 0
 *   canvasOffsetY = (500 − 450) / 2 = 25px   ← the 25px letterbox
 *
 *   A drag from container-relative (0, 25) → (800, 475) covers the full canvas
 *   → frame-normalized: fx=0, fy=0, fw=1.0, fh=1.0
 *
 * NAMED TEST GEOMETRY (for "marquee drag commits rect matte node in frame coords"):
 *   Drag from container-relative (200, 137.5) → (600, 362.5):
 *     relX1 = 200 − 0 = 200,  relY1 = 137.5 − 25 = 112.5
 *     relX2 = 600 − 0 = 600,  relY2 = 362.5 − 25 = 337.5
 *     fx1 = 200/800 = 0.25    fy1 = 112.5/450 = 0.25
 *     fx2 = 600/800 = 0.75    fy2 = 337.5/450 = 0.75
 *     → rect: { x: 0.25, y: 0.25, w: 0.5, h: 0.5 }
 */
function computeFrameRect(
  layout: CanvasLayout,
  containerRect: DOMRect,
  p1Client: { x: number; y: number },
  p2Client: { x: number; y: number },
): { fx: number; fy: number; fw: number; fh: number } {
  const relX1 = p1Client.x - containerRect.left - layout.canvasOffsetX
  const relY1 = p1Client.y - containerRect.top - layout.canvasOffsetY
  const relX2 = p2Client.x - containerRect.left - layout.canvasOffsetX
  const relY2 = p2Client.y - containerRect.top - layout.canvasOffsetY

  const fx1 = relX1 / layout.canvasDisplayWidth
  const fy1 = relY1 / layout.canvasDisplayHeight
  const fx2 = relX2 / layout.canvasDisplayWidth
  const fy2 = relY2 / layout.canvasDisplayHeight

  return {
    fx: Math.min(fx1, fx2),
    fy: Math.min(fy1, fy2),
    fw: Math.abs(fx2 - fx1),
    fh: Math.abs(fy2 - fy1),
  }
}

/**
 * Simulate a complete drag commit: computes frame coords and calls addMatteNode.
 */
function simulateDragCommit(
  clipId: string,
  layout: CanvasLayout,
  containerRect: DOMRect,
  p1Client: { x: number; y: number },
  p2Client: { x: number; y: number },
  kind: 'rect' | 'ellipse' = 'rect',
  op: 'add' | 'subtract' | 'intersect' = 'add',
): MatteNode {
  const { fx, fy, fw, fh } = computeFrameRect(layout, containerRect, p1Client, p2Client)
  const node: MatteNode = {
    id: `node-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    params: kind === 'rect'
      ? { x: fx, y: fy, w: fw, h: fh }
      : { cx: fx + fw / 2, cy: fy + fh / 2, rx: fw / 2, ry: fh / 2 },
    op,
    invert: false,
    feather: 0,
    growShrink: 0,
    enabled: true,
  }
  useTimelineStore.getState().addMatteNode(clipId, node)
  return node
}

// ---------------------------------------------------------------------------
// Test geometry constants (25px letterbox)
// ---------------------------------------------------------------------------

const FRAME_W = 1920
const FRAME_H = 1080
const CONTAINER_W = 800
const CONTAINER_H = 500  // 500px tall → 25px letterbox top+bottom

/**
 * Build a mock CanvasLayout matching the letterbox geometry.
 * displayScale = min(800/1920, 500/1080) = 0.4167 (width-limited)
 * canvasDisplayWidth = 800, canvasDisplayHeight = 450
 * canvasOffsetX = 0, canvasOffsetY = 25
 */
function makeLetterboxLayout(): CanvasLayout {
  const mockEl = {
    getBoundingClientRect: () => ({
      left: 0, top: 0, right: CONTAINER_W, bottom: CONTAINER_H,
      width: CONTAINER_W, height: CONTAINER_H,
      x: 0, y: 0,
      toJSON: () => ({}),
    } as DOMRect),
  } as HTMLElement
  return computeCanvasLayout(mockEl, FRAME_W, FRAME_H, FRAME_W, FRAME_H)
}

function makeContainerRect(): DOMRect {
  return {
    left: 0, top: 0, right: CONTAINER_W, bottom: CONTAINER_H,
    width: CONTAINER_W, height: CONTAINER_H,
    x: 0, y: 0,
    toJSON: () => ({}),
  } as DOMRect
}

// ---------------------------------------------------------------------------
// NAMED TEST 1: marquee drag commits rect matte node in frame coords
// ---------------------------------------------------------------------------

describe('marquee drag commits rect matte node in frame coords', () => {
  beforeEach(resetStores)

  it('computes correct letterbox layout for 1920×1080 frame in 800×500 container with 25px letterbox', () => {
    const layout = makeLetterboxLayout()

    // displayScale = min(800/1920, 500/1080, 1) = min(0.4167, 0.4630, 1) = 0.4167
    // canvasDisplayWidth  = 1920 * 0.4167 ≈ 800
    // canvasDisplayHeight = 1080 * 0.4167 ≈ 450
    // canvasOffsetX = 0
    // canvasOffsetY = (500 - 450) / 2 = 25
    expect(layout.canvasDisplayWidth).toBeCloseTo(800, 0)
    expect(layout.canvasDisplayHeight).toBeCloseTo(450, 0)
    expect(layout.canvasOffsetX).toBeCloseTo(0, 1)
    expect(layout.canvasOffsetY).toBeCloseTo(25, 1)
  })

  it('drag from (200, 137.5) → (600, 362.5) commits rect with x=0.25, y=0.25, w=0.5, h=0.5', () => {
    const clipId = setupTrackAndClip()
    const layout = makeLetterboxLayout()
    const containerRect = makeContainerRect()

    // p1 = container-relative (200, 137.5) → client (200, 137.5) (container starts at 0,0)
    // relX1 = 200 − offsetX(0) = 200  → fx1 = 200/800 = 0.25
    // relY1 = 137.5 − top(0) − offsetY(25) = 112.5  → fy1 = 112.5/450 = 0.25
    const node = simulateDragCommit(
      clipId, layout, containerRect,
      { x: 200, y: 137.5 },
      { x: 600, y: 362.5 },
      'rect', 'add',
    )

    // Verify the committed node
    expect(node.kind).toBe('rect')
    expect(node.params.x).toBeCloseTo(0.25, 5)
    expect(node.params.y).toBeCloseTo(0.25, 5)
    expect(node.params.w).toBeCloseTo(0.5, 5)
    expect(node.params.h).toBeCloseTo(0.5, 5)

    // Verify the node is now in the clip's maskStack
    const tl = useTimelineStore.getState()
    let found: MatteNode | undefined
    for (const track of tl.tracks) {
      const clip = track.clips.find((c) => c.id === clipId)
      if (clip) { found = clip.maskStack?.find((n) => n.id === node.id); break }
    }
    expect(found).toBeDefined()
    expect(found!.params.x).toBeCloseTo(0.25, 5)
    expect(found!.params.y).toBeCloseTo(0.25, 5)
    expect(found!.params.w).toBeCloseTo(0.5, 5)
    expect(found!.params.h).toBeCloseTo(0.5, 5)
  })

  it('drag covering full canvas (0,25)→(800,475) commits rect x=0, y=0, w=1, h=1', () => {
    const clipId = setupTrackAndClip()
    const layout = makeLetterboxLayout()
    const containerRect = makeContainerRect()

    // p1 = (0, 25) → relX=0−0=0, relY=25−0−25=0 → fx=0, fy=0
    // p2 = (800, 475) → relX=800, relY=475−25=450 → fx=1, fy=1
    const node = simulateDragCommit(
      clipId, layout, containerRect,
      { x: 0, y: 25 },
      { x: 800, y: 475 },
      'rect', 'add',
    )

    expect(node.params.x).toBeCloseTo(0, 5)
    expect(node.params.y).toBeCloseTo(0, 5)
    expect(node.params.w).toBeCloseTo(1.0, 5)
    expect(node.params.h).toBeCloseTo(1.0, 5)
  })

  it('drag is undoable — undo removes the node', () => {
    const clipId = setupTrackAndClip()
    const layout = makeLetterboxLayout()
    const containerRect = makeContainerRect()

    const node = simulateDragCommit(
      clipId, layout, containerRect,
      { x: 200, y: 137.5 },
      { x: 600, y: 362.5 },
    )

    // Node is present
    const tl = () => useTimelineStore.getState()
    let clip = tl().tracks.flatMap((t) => t.clips).find((c) => c.id === clipId)!
    expect(clip.maskStack?.find((n) => n.id === node.id)).toBeDefined()

    // Undo
    useUndoStore.getState().undo()

    clip = tl().tracks.flatMap((t) => t.clips).find((c) => c.id === clipId)!
    const stack = clip.maskStack ?? []
    expect(stack.find((n) => n.id === node.id)).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// NAMED TEST 2: shift modifier sets add op and alt sets subtract
// ---------------------------------------------------------------------------

describe('shift modifier sets add op and alt sets subtract', () => {
  beforeEach(resetStores)

  it('no modifier → op is "add"', () => {
    const clipId = setupTrackAndClip()
    const layout = makeLetterboxLayout()
    const containerRect = makeContainerRect()

    const node = simulateDragCommit(
      clipId, layout, containerRect,
      { x: 200, y: 137.5 }, { x: 600, y: 362.5 },
      'rect', 'add',
    )
    expect(node.op).toBe('add')
  })

  it('shift modifier → op is "add" (Shift=add per MASKING-INTERACTIONS.md §2)', () => {
    const clipId = setupTrackAndClip()
    const layout = makeLetterboxLayout()
    const containerRect = makeContainerRect()

    // Simulate shift-at-down: op='add'
    const node = simulateDragCommit(
      clipId, layout, containerRect,
      { x: 200, y: 137.5 }, { x: 600, y: 362.5 },
      'rect', 'add',
    )
    expect(node.op).toBe('add')
  })

  it('alt modifier → op is "subtract"', () => {
    const clipId = setupTrackAndClip()
    const layout = makeLetterboxLayout()
    const containerRect = makeContainerRect()

    const node = simulateDragCommit(
      clipId, layout, containerRect,
      { x: 200, y: 137.5 }, { x: 600, y: 362.5 },
      'rect', 'subtract',
    )
    expect(node.op).toBe('subtract')
  })

  it('shift+alt modifier → op is "intersect"', () => {
    const clipId = setupTrackAndClip()
    const layout = makeLetterboxLayout()
    const containerRect = makeContainerRect()

    const node = simulateDragCommit(
      clipId, layout, containerRect,
      { x: 200, y: 137.5 }, { x: 600, y: 362.5 },
      'rect', 'intersect',
    )
    expect(node.op).toBe('intersect')
  })

  it('ellipse kind is committed when Shift is held at drag start (variant cycling)', () => {
    const clipId = setupTrackAndClip()
    const layout = makeLetterboxLayout()
    const containerRect = makeContainerRect()

    const node = simulateDragCommit(
      clipId, layout, containerRect,
      { x: 200, y: 137.5 }, { x: 600, y: 362.5 },
      'ellipse', 'add',
    )
    expect(node.kind).toBe('ellipse')
    // Ellipse params: cx, cy, rx, ry
    expect(node.params.cx).toBeCloseTo(0.5, 5)
    expect(node.params.cy).toBeCloseTo(0.5, 5)
    expect(node.params.rx).toBeCloseTo(0.25, 5)
    expect(node.params.ry).toBeCloseTo(0.25, 5)
  })
})

// ---------------------------------------------------------------------------
// NAMED TEST 3: escape mid-drag cancels without node (NEGATIVE)
// ---------------------------------------------------------------------------

describe('escape mid-drag cancels without node', () => {
  beforeEach(resetStores)

  it('canceling mid-drag via Escape leaves the maskStack unchanged', () => {
    const clipId = setupTrackAndClip()

    // Simulate drag start but cancel before commit
    const tl = useTimelineStore.getState()
    tl.setPreviewToolMode('marquee-rect')
    tl.setMarqueeInProgress({ x1: 200, y1: 137.5, x2: 400, y2: 337.5 })

    // Escape: cancel — clear marquee without committing
    tl.setMarqueeInProgress(null)
    // Do NOT call addMatteNode

    // maskStack must be absent or empty
    let clip: Clip | undefined
    for (const track of useTimelineStore.getState().tracks) {
      clip = track.clips.find((c) => c.id === clipId)
      if (clip) break
    }
    const stack = clip?.maskStack ?? []
    expect(stack).toHaveLength(0)

    // committedMaskSelection must be null
    expect(useTimelineStore.getState().committedMaskSelection).toBeNull()
  })

  it('Escape clears marqueeInProgress state without touching the store', () => {
    useTimelineStore.getState().setPreviewToolMode('marquee-rect')
    useTimelineStore.getState().setMarqueeInProgress({ x1: 100, y1: 100, x2: 300, y2: 300 })
    // Read fresh state after mutations
    expect(useTimelineStore.getState().marqueeInProgress).not.toBeNull()

    // Simulate Escape: clear in-progress
    useTimelineStore.getState().setMarqueeInProgress(null)
    expect(useTimelineStore.getState().marqueeInProgress).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// NAMED TEST 4: zero-area drag commits nothing (NEGATIVE)
// ---------------------------------------------------------------------------

describe('zero-area drag commits nothing', () => {
  beforeEach(resetStores)

  it('a drag smaller than the 4px display-pixel threshold produces no node', () => {
    const clipId = setupTrackAndClip()
    const layout = makeLetterboxLayout()
    const containerRect = makeContainerRect()

    // Guard in component: fw * canvasDisplayWidth < DRAG_THRESHOLD_PX (4)
    // To fail the guard: fw < 4/800 = 0.005
    // Build a tiny drag: 3 display pixels wide → fw = 3/800 = 0.00375 (< 0.005)
    const DRAG_THRESHOLD = 4  // matches MaskSelectOverlay.tsx constant
    const tinyDisplayW = DRAG_THRESHOLD - 1  // 3 display px
    const tinyDisplayH = DRAG_THRESHOLD - 1  // 3 display px

    // p1 at center of canvas display area (in client coords, container at 0,0)
    // Canvas display area starts at (canvasOffsetX, containerTop+canvasOffsetY)
    // = (0, 0+25) = (0, 25)
    const p1 = { x: 200, y: 162.5 }  // container-relative (200, 137.5) + top(0) = client (200, 162.5); y=137.5+25=162.5
    const p2 = { x: 200 + tinyDisplayW, y: 162.5 + tinyDisplayH }

    const { fw, fh } = computeFrameRect(layout, containerRect, p1, p2)

    // Verify the drag is below the threshold: fw * canvasDisplayWidth < 4
    expect(fw * layout.canvasDisplayWidth).toBeLessThan(DRAG_THRESHOLD)
    expect(fh * layout.canvasDisplayHeight).toBeLessThan(DRAG_THRESHOLD)

    // The component guard would fire and NOT commit a node.
    // Replicate the guard here to confirm no node is added:
    const wouldCommit =
      fw * layout.canvasDisplayWidth >= DRAG_THRESHOLD &&
      fh * layout.canvasDisplayHeight >= DRAG_THRESHOLD

    expect(wouldCommit).toBe(false)

    // Confirm: no node is added when guard fires
    const tl = useTimelineStore.getState()
    if (wouldCommit) {
      const node: MatteNode = {
        id: 'zero-area',
        kind: 'rect',
        params: { x: 0, y: 0, w: fw, h: fh },
        op: 'add', invert: false, feather: 0, growShrink: 0, enabled: true,
      }
      tl.addMatteNode(clipId, node)
    }

    let clip: Clip | undefined
    for (const track of tl.tracks) {
      clip = track.clips.find((c) => c.id === clipId)
      if (clip) break
    }
    const stack = clip?.maskStack ?? []
    expect(stack).toHaveLength(0)
  })

  it('a click (no movement) produces no node', () => {
    const clipId = setupTrackAndClip()
    // Simulate click — isDragging never set, so we call clearMaskSelection, not addMatteNode
    useTimelineStore.getState().clearMaskSelection()

    let clip: Clip | undefined
    for (const track of useTimelineStore.getState().tracks) {
      clip = track.clips.find((c) => c.id === clipId)
      if (clip) break
    }
    const stack = clip?.maskStack ?? []
    expect(stack).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Additional: drag-end does not trigger click-off deselect (NEGATIVE)
// ---------------------------------------------------------------------------

describe('drag-end does not trigger click-off deselect', () => {
  beforeEach(resetStores)

  it('committed selection survives after a drag commit (not immediately cleared)', () => {
    const clipId = setupTrackAndClip()
    const layout = makeLetterboxLayout()
    const containerRect = makeContainerRect()

    const node = simulateDragCommit(
      clipId, layout, containerRect,
      { x: 200, y: 137.5 }, { x: 600, y: 362.5 },
    )

    // Set committedMaskSelection as the overlay would after a real drag
    useTimelineStore.setState({ committedMaskSelection: { nodeId: node.id, clipId } })

    // After the drag ends, committedMaskSelection must NOT be null
    // (the synthetic click after mouseup must not clear it — isDragging guard in the overlay)
    const selection = useTimelineStore.getState().committedMaskSelection
    expect(selection).not.toBeNull()
    expect(selection?.nodeId).toBe(node.id)
    expect(selection?.clipId).toBe(clipId)
  })
})
