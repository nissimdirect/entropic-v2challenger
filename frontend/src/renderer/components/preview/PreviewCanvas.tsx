import { useRef, useEffect, useLayoutEffect, useCallback, useState } from 'react'
import { useLayoutStore } from '../../stores/layout'
import { FF } from '../../../shared/feature-flags'

export type PreviewState = 'empty' | 'loading' | 'ready' | 'error'

interface PreviewCanvasProps {
  frameDataUrl: string | null
  width: number
  height: number
  previewState: PreviewState
  renderError: string | null
  onRetry?: () => void
}

/**
 * Abstraction: frame source draws to canvas.
 * Currently decodes base64 JPEG data URLs.
 * When native C++ shared memory module is ready, swap this to read
 * raw RGBA from SharedArrayBuffer and use ctx.putImageData() instead.
 */
function drawBase64Frame(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  img: HTMLImageElement,
  containerW: number,
  containerH: number,
): void {
  const imgW = img.naturalWidth
  const imgH = img.naturalHeight

  // Fit the image inside the container (object-fit: contain logic)
  const scale = Math.min(containerW / imgW, containerH / imgH, 1) // never upscale
  const drawW = Math.round(imgW * scale)
  const drawH = Math.round(imgH * scale)

  canvas.width = drawW
  canvas.height = drawH
  if (FF.F_0512_12_PREVIEW_ASPECT) {
    // F-0512-12/13: lock CSS display size to the bitmap. The previous CSS
    // rule (max-width: 100%; max-height: 100%) capped each dimension
    // INDEPENDENTLY, which stretched the canvas to the container's aspect
    // (e.g. 970x260 ≈ 3.7:1) whenever the bitmap was set before the
    // ResizeObserver fired — see the stale-default 1920x1080 initial state
    // in the component below. With explicit pixel sizes the BoundingBoxOverlay's
    // contain-fit math aligns with what the user actually sees.
    canvas.style.width = `${drawW}px`
    canvas.style.height = `${drawH}px`
  }
  ctx.drawImage(img, 0, 0, drawW, drawH)
}

export default function PreviewCanvas({
  frameDataUrl,
  width,
  height,
  previewState,
  renderError,
  onRetry,
}: PreviewCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const fpsRef = useRef({ frames: 0, lastTime: performance.now(), display: 0 })
  const [containerSize, setContainerSize] = useState({ w: 1920, h: 1080 })
  const [isPopOutOpen, setIsPopOutOpen] = useState(false)
  const [fpsDisplay, setFpsDisplay] = useState(0)

  // Track container dimensions via ResizeObserver so drawBase64Frame never reads 0.
  // F-0512-12: measure synchronously here (useLayoutEffect) so the first paint
  // uses the real container size, not the stale {1920, 1080} default. The
  // previous useEffect ran AFTER the first paint, leaving drawBase64Frame to
  // compute canvas dimensions from a 1920x1080 fiction while the container was
  // actually ~970x260. Independent CSS max-width/max-height caps then stretched
  // the bitmap to the container's aspect ratio. useLayoutEffect is a no-cost
  // upgrade here — the body is observer registration plus a one-shot
  // getBoundingClientRect, neither of which blocks paint meaningfully.
  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    if (FF.F_0512_12_PREVIEW_ASPECT) {
      const rect = el.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) {
        setContainerSize({ w: rect.width, h: rect.height })
      }
    }
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect
      if (width > 0 && height > 0) setContainerSize({ w: width, h: height })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const handlePopOut = useCallback(async () => {
    try {
      if (isPopOutOpen) {
        await window.entropic.closePopOut()
        setIsPopOutOpen(false)
        useLayoutStore.getState().setPopOutOpen(false)
      } else {
        await window.entropic.openPopOut()
        setIsPopOutOpen(true)
        useLayoutStore.getState().setPopOutOpen(true)
        // Send current frame immediately so pop-out isn't black
        if (frameDataUrl) {
          window.entropic.sendFrameToPopOut(frameDataUrl)
        }
      }
    } catch {
      // Best-effort
    }
  }, [isPopOutOpen, frameDataUrl])

  const drawToCanvas = useCallback(() => {
    const canvas = canvasRef.current
    const img = imgRef.current
    if (!canvas || !img || !img.complete || img.naturalWidth === 0) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    drawBase64Frame(ctx, canvas, img, containerSize.w, containerSize.h)
    canvas.dataset.frameReady = 'true'

    // FPS counter (dev mode only). Rendered as a DOM overlay below — do NOT
    // draw onto the canvas bitmap, that causes sub-pixel jitter because
    // drawBase64Frame resets canvas.width/height on every frame.
    if (import.meta.env.DEV) {
      const fps = fpsRef.current
      fps.frames++
      const now = performance.now()
      if (now - fps.lastTime >= 1000) {
        if (fps.frames !== fps.display) setFpsDisplay(fps.frames)
        fps.display = fps.frames
        fps.frames = 0
        fps.lastTime = now
      }
    }
  }, [containerSize])

  // Decode base64 JPEG and draw to canvas when frameDataUrl changes
  useEffect(() => {
    if (!frameDataUrl) {
      // Clear canvas when no frame (e.g. after New Project)
      const canvas = canvasRef.current
      if (canvas) {
        const ctx = canvas.getContext('2d')
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
      }
      return
    }

    if (!imgRef.current) {
      imgRef.current = new Image()
    }
    const img = imgRef.current
    // F-0512-12: when containerSize changes after the image is already loaded,
    // the previous img.onload won't re-fire (browser caches decoded frame). We
    // need an explicit synchronous redraw so the canvas refits to the new
    // container dims — otherwise the preview stays sized for the stale
    // container until the next frame_data_url change.
    if (FF.F_0512_12_PREVIEW_ASPECT && img.complete && img.src === frameDataUrl) {
      drawToCanvas()
      return
    }
    img.onload = drawToCanvas
    img.src = frameDataUrl
  }, [frameDataUrl, drawToCanvas])

  return (
    <div className="preview-canvas" ref={containerRef}>
      <button
        className="preview-canvas__popout-btn"
        onClick={handlePopOut}
        title={isPopOutOpen ? 'Close pop-out preview' : 'Pop out preview'}
      >
        {isPopOutOpen ? '↙' : '↗'}
      </button>
      <canvas
        ref={canvasRef}
        className="preview-canvas__element"
        width={width || undefined}
        height={height || undefined}
      />
      {import.meta.env.DEV && previewState === 'ready' && (
        <div className="preview-canvas__fps">{fpsDisplay} fps</div>
      )}
      {previewState === 'empty' && (
        <div className="preview-canvas__placeholder">
          No video loaded
        </div>
      )}
      {previewState === 'loading' && (
        <div className="preview-canvas__loading">
          <div className="preview-canvas__spinner" />
          <span>Loading...</span>
        </div>
      )}
      {previewState === 'error' && (
        <div className="preview-canvas__error-overlay">
          <span className="preview-canvas__error-msg">
            {renderError ?? 'Render failed'}
          </span>
          {onRetry && (
            <button className="preview-canvas__retry-btn" onClick={onRetry}>
              Retry
            </button>
          )}
        </div>
      )}
    </div>
  )
}
