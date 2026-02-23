import { useRef, useEffect, useCallback } from 'react'

interface PreviewCanvasProps {
  frameDataUrl: string | null
  width: number
  height: number
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
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  ctx.drawImage(img, 0, 0)
}

export default function PreviewCanvas({ frameDataUrl, width, height }: PreviewCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const fpsRef = useRef({ frames: 0, lastTime: performance.now(), display: 0 })

  const drawToCanvas = useCallback(() => {
    const canvas = canvasRef.current
    const img = imgRef.current
    if (!canvas || !img || !img.complete || img.naturalWidth === 0) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    drawBase64Frame(ctx, canvas, img)

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
      <canvas
        ref={canvasRef}
        className="preview-canvas__element"
        width={width || undefined}
        height={height || undefined}
      />
      {!frameDataUrl && (
        <div className="preview-canvas__placeholder">
          No video loaded
        </div>
      )}
    </div>
  )
}
