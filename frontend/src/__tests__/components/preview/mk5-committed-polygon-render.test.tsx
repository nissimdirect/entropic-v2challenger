/**
 * MK.5 — Committed polygon render coverage.
 *
 * REGRESSION TEST for the committed-polygon visual bug: the committed-selection
 * affordance computed only a rect-shaped {x,y,w,h} and branched rect-vs-ellipse.
 * A committed POLYGON node (params.vertices, NOT cx/cy/rx/ry) fell into the
 * ellipse `else`, read undefined → NaN → rendered an invisible/broken ellipse.
 * After a lasso committed, the user saw NO outline + NO outside-dim.
 *
 * This test MOUNTS MaskSelectOverlay (the missing render coverage) and asserts:
 *   1. A committed polygon renders an SVG <polygon> whose `points` match the
 *      node's normalized vertices mapped to DOM-space via the letterbox transform.
 *   2. The outside-dim mask cutout uses a <polygon> (not a rect/ellipse).
 *   3. NO broken <ellipse> with NaN attributes is rendered for a polygon node.
 *   4. Rect/ellipse committed nodes still render their own shapes (regression).
 *
 * Letterbox geometry (matches the MK.4 / MK.5 store tests):
 *   1920×1080 frame in 800×500 container → displayScale 0.4167
 *   canvasDisplayWidth 800, canvasDisplayHeight 450, offsetX 0, offsetY 25
 *   normalized (nx, ny) → DOM (nx*800 + 0, ny*450 + 25)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { createRef } from 'react'

// Mock window.entropic before store import (store init reads it)
;(globalThis as any).window = globalThis as any
;(globalThis as any).entropic = {
  onEngineStatus: () => {},
  sendCommand: async () => ({ ok: true }),
  selectFile: async () => null,
  selectSavePath: async () => null,
  onExportProgress: () => {},
}
;(globalThis as any).window.entropic = (globalThis as any).entropic

// ResizeObserver is used by MaskSelectOverlay's useLayoutEffect — happy-dom
// does not provide it; stub a no-op observer.
;(globalThis as any).ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
}

import MaskSelectOverlay from '../../../renderer/components/preview/MaskSelectOverlay'
import { useTimelineStore } from '../../../renderer/stores/timeline'
import { useUndoStore } from '../../../renderer/stores/undo'
import type { Clip, MatteNode } from '../../../shared/types'

const CONTAINER_W = 800
const CONTAINER_H = 500
const CANVAS_DISPLAY_W = 800
const CANVAS_DISPLAY_H = 450
const OFFSET_X = 0
const OFFSET_Y = 25

/** Map a normalized vertex to expected DOM-space coords. */
function toDom(nx: number, ny: number): { x: number; y: number } {
  return {
    x: nx * CANVAS_DISPLAY_W + OFFSET_X,
    y: ny * CANVAS_DISPLAY_H + OFFSET_Y,
  }
}

/** Build a container element whose getBoundingClientRect is the 800×500 box. */
function makeContainer(): HTMLDivElement {
  const el = document.createElement('div')
  el.getBoundingClientRect = () => ({
    left: 0, top: 0, right: CONTAINER_W, bottom: CONTAINER_H,
    width: CONTAINER_W, height: CONTAINER_H,
    x: 0, y: 0, toJSON: () => ({}),
  } as DOMRect)
  document.body.appendChild(el)
  return el
}

function resetStores() {
  useTimelineStore.getState().reset()
  useUndoStore.getState().clear()
}

/** Add a track + clip with the given mask node already committed + selected. */
function setupCommittedNode(node: MatteNode): { clipId: string } {
  const tl = useTimelineStore.getState()
  const trackId = tl.addTrack('V1', '#4ade80') as string
  const clipId = `clip-${Math.random().toString(36).slice(2, 8)}`
  const clip: Clip = {
    id: clipId, assetId: 'asset-1', trackId,
    position: 0, duration: 10, inPoint: 0, outPoint: 10, speed: 1,
  }
  tl.addClip(trackId, clip)
  tl.addMatteNode(clipId, node)
  useTimelineStore.setState({ committedMaskSelection: { nodeId: node.id, clipId } })
  return { clipId }
}

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
})

beforeEach(resetStores)

describe('committed polygon renders <polygon> outline + dim cutout', () => {
  it('renders an SVG <polygon> whose points match the node vertices in DOM-space', () => {
    // Normalized vertices: a quadrilateral
    const verts: number[][] = [
      [0.25, 0.25],
      [0.75, 0.25],
      [0.75, 0.75],
      [0.25, 0.75],
    ]
    const node: MatteNode = {
      id: 'poly-1',
      kind: 'polygon',
      params: { vertices: verts as unknown as number[][] },
      op: 'add', invert: false, feather: 0, growShrink: 0, enabled: true,
    }
    setupCommittedNode(node)

    // Tool mode must be lasso-polygon so the lasso render path is active
    // (this is the state immediately after a polygon lasso commits).
    useTimelineStore.getState().setPreviewToolMode('lasso-polygon')
    // setPreviewToolMode clears committedMaskSelection — re-commit the selection
    // (mirrors the real flow: commit happens AFTER mode is already set).
    useTimelineStore.setState({
      committedMaskSelection: { nodeId: node.id, clipId: 'ignored' },
    })
    // Re-resolve clipId by re-adding selection with the real clip
    const tl = useTimelineStore.getState()
    const realClipId = tl.tracks[0].clips[0].id
    useTimelineStore.setState({
      committedMaskSelection: { nodeId: node.id, clipId: realClipId },
    })

    const containerRef = createRef<HTMLDivElement>()
    const container = makeContainer()
    ;(containerRef as any).current = container

    const { container: rendered } = render(
      <MaskSelectOverlay
        containerRef={containerRef}
        canvasWidth={1920}
        canvasHeight={1080}
        clipId={realClipId}
      />
    )

    // There must be at least one <polygon> element rendered
    const polygons = rendered.querySelectorAll('polygon')
    expect(polygons.length).toBeGreaterThanOrEqual(1)

    // The OUTLINE polygon (stroke=#8F7DFF, fill=none) must match the vertices
    const outline = Array.from(polygons).find(
      (p) => p.getAttribute('stroke') === '#8F7DFF' && p.getAttribute('fill') === 'none',
    )
    expect(outline).toBeDefined()

    const expectedPoints = verts
      .map(([nx, ny]) => {
        const d = toDom(nx, ny)
        return `${d.x},${d.y}`
      })
      .join(' ')
    expect(outline!.getAttribute('points')).toBe(expectedPoints)

    // No NaN anywhere in the points
    expect(outline!.getAttribute('points')).not.toContain('NaN')
  })

  it('outside-dim mask cutout uses a <polygon> (not rect/ellipse)', () => {
    const verts: number[][] = [
      [0.30, 0.30],
      [0.70, 0.30],
      [0.50, 0.70],
    ]
    const node: MatteNode = {
      id: 'poly-2',
      kind: 'polygon',
      params: { vertices: verts as unknown as number[][] },
      op: 'add', invert: false, feather: 0, growShrink: 0, enabled: true,
    }
    setupCommittedNode(node)
    useTimelineStore.getState().setPreviewToolMode('lasso-polygon')
    const realClipId = useTimelineStore.getState().tracks[0].clips[0].id
    useTimelineStore.setState({
      committedMaskSelection: { nodeId: node.id, clipId: realClipId },
    })

    const containerRef = createRef<HTMLDivElement>()
    ;(containerRef as any).current = makeContainer()

    const { container: rendered } = render(
      <MaskSelectOverlay
        containerRef={containerRef}
        canvasWidth={1920}
        canvasHeight={1080}
        clipId={realClipId}
      />
    )

    // The committed-cutout mask must exist and contain a <polygon>
    const mask = rendered.querySelector('mask#mask-select-committed-cutout-polygon')
    expect(mask).not.toBeNull()
    const maskPolygon = mask!.querySelector('polygon')
    expect(maskPolygon).not.toBeNull()

    const expectedPoints = verts
      .map(([nx, ny]) => {
        const d = toDom(nx, ny)
        return `${d.x},${d.y}`
      })
      .join(' ')
    expect(maskPolygon!.getAttribute('points')).toBe(expectedPoints)

    // The dim rect referencing this mask must exist
    const dimRect = Array.from(rendered.querySelectorAll('rect')).find(
      (r) => r.getAttribute('mask') === 'url(#mask-select-committed-cutout-polygon)',
    )
    expect(dimRect).toBeDefined()
    expect(dimRect!.getAttribute('fill')).toBe('rgba(0,0,0,0.65)')
  })

  it('does NOT render a broken <ellipse> with NaN attributes for a polygon node', () => {
    const verts: number[][] = [
      [0.20, 0.20],
      [0.80, 0.20],
      [0.80, 0.80],
      [0.20, 0.80],
    ]
    const node: MatteNode = {
      id: 'poly-3',
      kind: 'polygon',
      params: { vertices: verts as unknown as number[][] },
      op: 'add', invert: false, feather: 0, growShrink: 0, enabled: true,
    }
    setupCommittedNode(node)
    useTimelineStore.getState().setPreviewToolMode('lasso-polygon')
    const realClipId = useTimelineStore.getState().tracks[0].clips[0].id
    useTimelineStore.setState({
      committedMaskSelection: { nodeId: node.id, clipId: realClipId },
    })

    const containerRef = createRef<HTMLDivElement>()
    ;(containerRef as any).current = makeContainer()

    const { container: rendered } = render(
      <MaskSelectOverlay
        containerRef={containerRef}
        canvasWidth={1920}
        canvasHeight={1080}
        clipId={realClipId}
      />
    )

    // No <ellipse> should render at all for a polygon-only committed selection
    const ellipses = rendered.querySelectorAll('ellipse')
    for (const e of Array.from(ellipses)) {
      for (const attr of ['cx', 'cy', 'rx', 'ry']) {
        const v = e.getAttribute(attr)
        expect(v).not.toBe('NaN')
        if (v !== null) expect(Number.isNaN(Number(v))).toBe(false)
      }
    }
  })
})

describe('rect/ellipse committed render still works (regression)', () => {
  it('a committed rect node renders a <rect> outline, not a polygon', () => {
    const node: MatteNode = {
      id: 'rect-1',
      kind: 'rect',
      params: { x: 0.25, y: 0.25, w: 0.5, h: 0.5 },
      op: 'add', invert: false, feather: 0, growShrink: 0, enabled: true,
    }
    setupCommittedNode(node)
    // Marquee-rect tool mode active (the rect/ellipse render path)
    useTimelineStore.getState().setPreviewToolMode('marquee-rect')
    const realClipId = useTimelineStore.getState().tracks[0].clips[0].id
    useTimelineStore.setState({
      committedMaskSelection: { nodeId: node.id, clipId: realClipId },
    })

    const containerRef = createRef<HTMLDivElement>()
    ;(containerRef as any).current = makeContainer()

    const { container: rendered } = render(
      <MaskSelectOverlay
        containerRef={containerRef}
        canvasWidth={1920}
        canvasHeight={1080}
        clipId={realClipId}
      />
    )

    // A committed-cutout rect mask exists (the rect path)
    expect(rendered.querySelector('mask#mask-select-committed-cutout')).not.toBeNull()
    // No polygon committed-cutout for a rect node
    expect(rendered.querySelector('mask#mask-select-committed-cutout-polygon')).toBeNull()
  })

  it('a committed ellipse node renders an <ellipse> with finite (non-NaN) attributes', () => {
    const node: MatteNode = {
      id: 'ell-1',
      kind: 'ellipse',
      params: { cx: 0.5, cy: 0.5, rx: 0.25, ry: 0.25 },
      op: 'add', invert: false, feather: 0, growShrink: 0, enabled: true,
    }
    setupCommittedNode(node)
    useTimelineStore.getState().setPreviewToolMode('marquee-ellipse')
    const realClipId = useTimelineStore.getState().tracks[0].clips[0].id
    useTimelineStore.setState({
      committedMaskSelection: { nodeId: node.id, clipId: realClipId },
    })

    const containerRef = createRef<HTMLDivElement>()
    ;(containerRef as any).current = makeContainer()

    const { container: rendered } = render(
      <MaskSelectOverlay
        containerRef={containerRef}
        canvasWidth={1920}
        canvasHeight={1080}
        clipId={realClipId}
      />
    )

    const ellipses = rendered.querySelectorAll('ellipse')
    expect(ellipses.length).toBeGreaterThanOrEqual(1)
    // All ellipse coords must be finite (no NaN regression)
    for (const e of Array.from(ellipses)) {
      for (const attr of ['cx', 'cy', 'rx', 'ry']) {
        const v = e.getAttribute(attr)
        if (v !== null) expect(Number.isNaN(Number(v))).toBe(false)
      }
    }
    // No polygon committed-cutout for an ellipse node
    expect(rendered.querySelector('mask#mask-select-committed-cutout-polygon')).toBeNull()
  })
})
