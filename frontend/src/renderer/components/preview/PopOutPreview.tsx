import { useRef, useEffect, useState } from 'react'

declare global {
  interface Window {
    entropicPopOut?: {
      onFrameUpdate: (callback: (dataUrl: string) => void) => void
      onClose: (callback: () => void) => void
      onPing?: (callback: () => void) => void
      getLastPingAt?: () => number
    }
  }
}

// F-0514-6: liveness is now driven by a main-process ping, not frame arrival.
// Pausing playback no longer flashes "Disconnected" because the main process
// keeps sending heartbeats whether or not new frames are produced. The window
// is grace-larger than the ~1s ping cadence to absorb GC pauses + scheduler jitter.
const DISCONNECT_THRESHOLD_MS = 3500

export default function PopOutPreview() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const lastPingRef = useRef<number>(0)
  const [disconnected, setDisconnected] = useState(false)

  useEffect(() => {
    const api = window.entropicPopOut
    if (!api) return

    const drawFrame = (dataUrl: string) => {
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

    // F-0514-6: use main-process ping as liveness signal. The first ping fires
    // synchronously from preload when did-finish-load resolves, so the initial
    // lastPingRef seed below is replaced before the interval first checks.
    const initialPing = api.getLastPingAt?.() ?? 0
    lastPingRef.current = initialPing > 0 ? initialPing : Date.now()
    setDisconnected(false)

    api.onPing?.(() => {
      lastPingRef.current = Date.now()
      setDisconnected(false)
    })

    const interval = setInterval(() => {
      if (Date.now() - lastPingRef.current > DISCONNECT_THRESHOLD_MS) {
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
