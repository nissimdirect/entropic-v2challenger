import { useRef } from 'react'
import { useFrameDisplay } from './useFrameDisplay'

interface PreviewCanvasProps {
  frameData: Uint8Array | null
  width: number
  height: number
}

export default function PreviewCanvas({ frameData, width, height }: PreviewCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useFrameDisplay({ canvasRef, frameData, width, height })

  return (
    <div className="preview-canvas">
      <canvas
        ref={canvasRef}
        className="preview-canvas__element"
      />
      {!frameData && (
        <div className="preview-canvas__placeholder">
          No video loaded
        </div>
      )}
    </div>
  )
}
