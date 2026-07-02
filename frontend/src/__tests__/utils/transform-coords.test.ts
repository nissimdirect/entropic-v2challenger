/**
 * transform-coords tests.
 *
 * Loop 60 (SnapGuides) — synthesis Iter 28/29 marked SnapGuides as code-verified
 * PASS but the component depends on the coordinate utilities in transform-coords.ts
 * which had ZERO test coverage. This locks the three-space coordinate math so
 * any future refactor surfaces immediately.
 *
 * Three coordinate spaces under test:
 *   DOM       — top-left of preview container, CSS pixels (mouse events)
 *   Canvas    — canvas display area, CSS pixels (after contain-fit + center)
 *   Transform — center-origin, media pixels (ClipTransform.x / y)
 */
import { describe, it, expect } from 'vitest'
import {
  computeCanvasLayout,
  domToTransform,
  transformToDom,
  mediaToDisplaySize,
  displayToMediaSize,
} from '../../renderer/utils/transform-coords'
import type { CanvasLayout } from '../../renderer/utils/transform-coords'

function fakeRect(width: number, height: number, left = 0, top = 0): DOMRect {
  return {
    width,
    height,
    left,
    top,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect
}

function fakeContainer(width: number, height: number, left = 0, top = 0): HTMLElement {
  return {
    getBoundingClientRect: () => fakeRect(width, height, left, top),
  } as unknown as HTMLElement
}

describe('computeCanvasLayout', () => {
  it('1:1 — container matches canvas → no fit, no offset', () => {
    const layout = computeCanvasLayout(fakeContainer(1920, 1080), 0, 0, 1920, 1080)
    expect(layout.canvasDisplayWidth).toBe(1920)
    expect(layout.canvasDisplayHeight).toBe(1080)
    expect(layout.canvasOffsetX).toBe(0)
    expect(layout.canvasOffsetY).toBe(0)
  })

  it('container wider than canvas (16:9 → 21:9) centers canvas horizontally', () => {
    // 2100x900 container; canvas 1920x1080. min(2100/1920, 900/1080, 1) = 0.833...
    const layout = computeCanvasLayout(fakeContainer(2100, 900), 0, 0, 1920, 1080)
    expect(layout.canvasDisplayHeight).toBeCloseTo(900, 1)
    expect(layout.canvasDisplayWidth).toBeCloseTo(1600, 1)
    expect(layout.canvasOffsetX).toBeCloseTo(250, 1) // (2100-1600)/2
    expect(layout.canvasOffsetY).toBeCloseTo(0, 1)
  })

  it('container taller than canvas centers canvas vertically', () => {
    // 1920x2000 container; canvas 1920x1080. min(1920/1920, 2000/1080, 1) = 1.0
    // → canvas stays 1920x1080, centered with vertical padding.
    const layout = computeCanvasLayout(fakeContainer(1920, 2000), 0, 0, 1920, 1080)
    expect(layout.canvasDisplayWidth).toBe(1920)
    expect(layout.canvasDisplayHeight).toBe(1080)
    expect(layout.canvasOffsetX).toBe(0)
    expect(layout.canvasOffsetY).toBe(460) // (2000-1080)/2
  })

  it('container smaller than canvas → downscales (never upscales beyond 1x)', () => {
    // 960x540 container, 1920x1080 canvas → displayScale=0.5
    const layout = computeCanvasLayout(fakeContainer(960, 540), 0, 0, 1920, 1080)
    expect(layout.canvasDisplayWidth).toBe(960)
    expect(layout.canvasDisplayHeight).toBe(540)
    expect(layout.canvasOffsetX).toBe(0)
    expect(layout.canvasOffsetY).toBe(0)
  })

  it('preserves canvas resolution and container rect on output', () => {
    const layout = computeCanvasLayout(fakeContainer(800, 600, 100, 200), 0, 0, 1920, 1080)
    expect(layout.canvasWidth).toBe(1920)
    expect(layout.canvasHeight).toBe(1080)
    expect(layout.containerRect.left).toBe(100)
    expect(layout.containerRect.top).toBe(200)
  })
})

describe('domToTransform ↔ transformToDom (round-trip)', () => {
  function layoutNonTrivial(): CanvasLayout {
    // Container 2100x900 starting at (50, 30), canvas 1920x1080.
    return computeCanvasLayout(fakeContainer(2100, 900, 50, 30), 0, 0, 1920, 1080)
  }

  it('transformToDom(0,0) places center of canvas at container center', () => {
    const layout = layoutNonTrivial()
    const dom = transformToDom(0, 0, layout)
    // Canvas center: containerOffset + canvasOffset + display/2.
    const expectedX = layout.canvasOffsetX + layout.canvasDisplayWidth / 2
    const expectedY = layout.canvasOffsetY + layout.canvasDisplayHeight / 2
    expect(dom.x).toBeCloseTo(expectedX, 3)
    expect(dom.y).toBeCloseTo(expectedY, 3)
  })

  it('round-trip: dom → transform → dom returns the same dom point', () => {
    const layout = layoutNonTrivial()
    // Mouse at 800, 400 within container (absolute, including container offset)
    const mouseX = 800
    const mouseY = 400
    const t = domToTransform(mouseX, mouseY, layout)
    const d = transformToDom(t.x, t.y, layout)
    // transformToDom returns relative to container TL (no .left offset baked in),
    // so add containerRect.left/top to recover absolute.
    expect(d.x + layout.containerRect.left).toBeCloseTo(mouseX, 3)
    expect(d.y + layout.containerRect.top).toBeCloseTo(mouseY, 3)
  })

  it('round-trip: transform → dom → transform returns the same transform point', () => {
    const layout = layoutNonTrivial()
    const tx = 120
    const ty = -80
    const d = transformToDom(tx, ty, layout)
    // domToTransform expects absolute mouse coords (relative to viewport)
    const t2 = domToTransform(d.x + layout.containerRect.left, d.y + layout.containerRect.top, layout)
    expect(t2.x).toBeCloseTo(tx, 3)
    expect(t2.y).toBeCloseTo(ty, 3)
  })

  it('transform (canvasWidth/2, canvasHeight/2) lands at canvas bottom-right corner', () => {
    const layout = computeCanvasLayout(fakeContainer(1920, 1080), 0, 0, 1920, 1080)
    const dom = transformToDom(layout.canvasWidth / 2, layout.canvasHeight / 2, layout)
    expect(dom.x).toBeCloseTo(1920, 1)
    expect(dom.y).toBeCloseTo(1080, 1)
  })

  it('transform (-canvasWidth/2, -canvasHeight/2) lands at canvas top-left corner', () => {
    const layout = computeCanvasLayout(fakeContainer(1920, 1080), 0, 0, 1920, 1080)
    const dom = transformToDom(-layout.canvasWidth / 2, -layout.canvasHeight / 2, layout)
    expect(dom.x).toBeCloseTo(0, 1)
    expect(dom.y).toBeCloseTo(0, 1)
  })
})

describe('mediaToDisplaySize / displayToMediaSize', () => {
  it('mediaToDisplaySize halves when display is half of media (downscale 0.5)', () => {
    const layout = computeCanvasLayout(fakeContainer(960, 540), 0, 0, 1920, 1080)
    const size = mediaToDisplaySize(200, 100, layout)
    expect(size.w).toBeCloseTo(100, 3)
    expect(size.h).toBeCloseTo(50, 3)
  })

  it('mediaToDisplaySize is identity when display == media (1:1)', () => {
    const layout = computeCanvasLayout(fakeContainer(1920, 1080), 0, 0, 1920, 1080)
    const size = mediaToDisplaySize(640, 360, layout)
    expect(size.w).toBeCloseTo(640, 3)
    expect(size.h).toBeCloseTo(360, 3)
  })

  it('displayToMediaSize is the exact inverse of mediaToDisplaySize', () => {
    const layout = computeCanvasLayout(fakeContainer(960, 540), 0, 0, 1920, 1080)
    const media = { w: 250, h: 175 }
    const display = mediaToDisplaySize(media.w, media.h, layout)
    const back = displayToMediaSize(display.w, display.h, layout)
    expect(back.w).toBeCloseTo(media.w, 5)
    expect(back.h).toBeCloseTo(media.h, 5)
  })

  it('separate X/Y scaling — non-square canvas (e.g. 2:1 aspect)', () => {
    // Stretched: display 1000x500 mapped to canvas 2000x500
    const layout = computeCanvasLayout(fakeContainer(1000, 500), 0, 0, 2000, 500)
    // displayScale = min(1000/2000, 500/500, 1) = 0.5 → display 1000x250, offset y = 125.
    const size = mediaToDisplaySize(2000, 500, layout)
    expect(size.w).toBeCloseTo(1000, 1)
    expect(size.h).toBeCloseTo(250, 1)
  })
})
