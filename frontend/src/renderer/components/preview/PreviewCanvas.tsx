import { useRef, useEffect, useCallback, useState } from 'react'

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
): void {
  // Scale canvas to fit its container (contain mode) instead of using native resolution.
  // This prevents 4K images from blowing out the layout.
  const container = canvas.parentElement
  if (!container) {
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    ctx.drawImage(img, 0, 0)
    return
  }

  const containerW = container.clientWidth
  const containerH = container.clientHeight
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
  const imgRef = useRef<HTMLImageElement | null>(null)
  const fpsRef = useRef({ frames: 0, lastTime: performance.now(), display: 0 })
  const [isPopOutOpen, setIsPopOutOpen] = useState(false)

  const handlePopOut = useCallback(async () => {
    try {
      if (isPopOutOpen) {
        await window.entropic.closePopOut()
        setIsPopOutOpen(false)
      } else {
        await window.entropic.openPopOut()
        setIsPopOutOpen(true)
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

    drawBase64Frame(ctx, canvas, img)
    canvas.dataset.frameReady = 'true'

    // FPS counter (dev mode only)
    if (import.meta.env.DEV) {
      const fps = fpsRef.current
      fps.frames++
      const now = performance.now()
      if (now - fps.lastTime >= 1000) {
        fps.display = fps.frames
        fps.frames = 0
        fps.lastTime = now
      }
      ctx.save()
      ctx.font = '12px JetBrains Mono, monospace'
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)'
      ctx.fillRect(4, 4, 56, 20)
      ctx.fillStyle = '#4ade80'
      ctx.fillText(`${fps.display} fps`, 8, 18)
      ctx.restore()
    }
  }, [])

  // Decode base64 JPEG and draw to canvas when frameDataUrl changes
  useEffect(() => {
    if (!frameDataUrl) return

    if (!imgRef.current) {
      imgRef.current = new Image()
    }
    const img = imgRef.current
    img.onload = drawToCanvas
    img.src = frameDataUrl
  }, [frameDataUrl, drawToCanvas])

  return (
    <div className="preview-canvas">
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
