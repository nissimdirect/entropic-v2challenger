import { useRef, useEffect, useCallback, useState } from 'react'
import { useLayoutStore } from '../../stores/layout'

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

  // Track container dimensions via ResizeObserver so drawBase64Frame never reads 0
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
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
