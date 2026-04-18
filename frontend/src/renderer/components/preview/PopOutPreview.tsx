import { useRef, useEffect, useState } from 'react'

declare global {
  interface Window {
    entropicPopOut?: {
      onFrameUpdate: (callback: (dataUrl: string) => void) => void
      onClose: (callback: () => void) => void
    }
  }
}

export default function PopOutPreview() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const lastFrameTimeRef = useRef<number>(Date.now())
  const [disconnected, setDisconnected] = useState(false)

  useEffect(() => {
    const api = window.entropicPopOut
    if (!api) return

    const drawFrame = (dataUrl: string) => {
      lastFrameTimeRef.current = Date.now()
      setDisconnected(false)

      const canvas = canvasRef.current
      if (!canvas) return

      if (!imgRef.current) {
        imgRef.current = new Image()
      }
      const img = imgRef.current
      img.onload = () => {
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
        const ctx = canvas.getContext('2d')
        if (ctx) ctx.drawImage(img, 0, 0)
      }
      img.src = dataUrl
    }

    api.onFrameUpdate(drawFrame)
    api.onClose(() => {
      window.close()
    })

    const interval = setInterval(() => {
      if (Date.now() - lastFrameTimeRef.current > 2000) {
        setDisconnected(true)
      }
    }, 1000)

    return () => {
      clearInterval(interval)
    }
  }, [])

  return (
    <div className="pop-out-preview">
      <canvas ref={canvasRef} className="pop-out-preview__canvas" />
      {disconnected && (
        <div className="pop-out-preview__disconnected">Disconnected</div>
      )}
      <style>{`
        * { margin: 0; padding: 0; box-sizing: border-box; }
        .pop-out-preview {
          width: 100%;
          height: 100vh;
          background: #000;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
        }
        .pop-out-preview__canvas {
          max-width: 100%;
          max-height: 100%;
          object-fit: contain;
        }
        .pop-out-preview__disconnected {
          position: absolute;
          color: #666;
          font-family: 'JetBrains Mono', monospace;
          font-size: 14px;
        }
      `}</style>
    </div>
  )
}
