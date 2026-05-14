/**
 * F-0512-12 / F-0512-13 regression: preview canvas must lock its CSS display
 * size to its bitmap dimensions so the independent max-width/max-height caps
 * don't stretch the visible image to the container's aspect ratio.
 *
 * Pre-fix behavior reproduced here: containerSize defaults to {1920,1080},
 * drawBase64Frame picks a 1:1 scale, canvas bitmap ends up at source dims,
 * and the CSS rule `max-width: 100%; max-height: 100%` independently caps
 * each dimension when the real container is smaller — yielding a stretched
 * 3.7:1 display from a 16:9 source.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { setupMockEntropic, teardownMockEntropic } from '../helpers/mock-entropic'
import PreviewCanvas from '../../renderer/components/preview/PreviewCanvas'
import { FF } from '../../shared/feature-flags'

afterEach(() => {
  cleanup()
  teardownMockEntropic()
  vi.restoreAllMocks()
})

// jsdom's HTMLCanvasElement.getContext returns null by default; drawToCanvas
// early-returns when ctx is null, skipping drawBase64Frame entirely. Provide a
// minimal CanvasRenderingContext2D stub so the draw path executes end-to-end.
function patchCanvasContext() {
  const stub: Partial<CanvasRenderingContext2D> = {
    drawImage: vi.fn(),
    clearRect: vi.fn(),
  }
  HTMLCanvasElement.prototype.getContext = vi.fn(
    () => stub as CanvasRenderingContext2D,
  ) as never
}

/**
 * jsdom doesn't implement HTMLImageElement.naturalWidth/Height correctly for
 * data: URLs. We patch them so drawBase64Frame's contain-fit math has real
 * numbers to chew on. The values match a typical 720p source.
 */
function patchImageNaturalDims(naturalWidth: number, naturalHeight: number) {
  Object.defineProperty(HTMLImageElement.prototype, 'naturalWidth', {
    configurable: true,
    get() { return naturalWidth },
  })
  Object.defineProperty(HTMLImageElement.prototype, 'naturalHeight', {
    configurable: true,
    get() { return naturalHeight },
  })
  Object.defineProperty(HTMLImageElement.prototype, 'complete', {
    configurable: true,
    get() { return true },
  })
  // Fire onload synchronously when src is set so drawToCanvas runs in test.
  Object.defineProperty(HTMLImageElement.prototype, 'src', {
    configurable: true,
    set(this: HTMLImageElement, value: string) {
      this.setAttribute('src', value)
      if (this.onload) (this.onload as (ev: Event) => void)(new Event('load'))
    },
    get(this: HTMLImageElement) {
      return this.getAttribute('src') ?? ''
    },
  })
}

describe('PreviewCanvas — F-0512-12/13 aspect ratio', () => {
  it('locks canvas style.width/height to bitmap dimensions when fix is enabled', () => {
    setupMockEntropic()
    patchCanvasContext()
    patchImageNaturalDims(1280, 720)

    const { container } = render(
      <PreviewCanvas
        frameDataUrl="data:image/jpeg;base64,AAAA"
        width={1280}
        height={720}
        previewState="ready"
        renderError={null}
      />,
    )

    const canvas = container.querySelector<HTMLCanvasElement>('.preview-canvas__element')
    expect(canvas).toBeTruthy()
    if (!canvas) return

    if (FF.F_0512_12_PREVIEW_ASPECT) {
      // After draw, inline style locks display size to bitmap. Aspect must be
      // the source aspect (16:9 ≈ 1.778), not the container's.
      const styleW = parseFloat(canvas.style.width || '0')
      const styleH = parseFloat(canvas.style.height || '0')
      expect(styleW).toBeGreaterThan(0)
      expect(styleH).toBeGreaterThan(0)
      const ratio = styleW / styleH
      expect(ratio).toBeGreaterThan(1.5)
      expect(ratio).toBeLessThan(2.0)
      // Bitmap dims must equal CSS dims so BoundingBoxOverlay's contain-fit
      // math agrees with what the user sees.
      expect(styleW).toBe(canvas.width)
      expect(styleH).toBe(canvas.height)
    } else {
      // Legacy path explicitly leaves CSS sizing to global.css max-width/max-height.
      // Inline style.width/height must remain empty so the buggy stretch path
      // is re-exhibited when someone disables the flag for rollback testing.
      expect(canvas.style.width).toBe('')
      expect(canvas.style.height).toBe('')
    }
  })
})
