import { useRef, useEffect, useCallback } from 'react'

interface UseFrameDisplayOptions {
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  frameData: Uint8Array | null
  width: number
  height: number
}

export function useFrameDisplay({ canvasRef, frameData, width, height }: UseFrameDisplayOptions) {
  const animFrameRef = useRef<number>(0)

  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || !frameData || width === 0 || height === 0) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // frameData is expected to be RGBA pixels
    if (frameData.byteLength !== width * height * 4) return

    canvas.width = width
    canvas.height = height

    const clamped = new Uint8ClampedArray(width * height * 4)
    clamped.set(frameData)
    const imageData = new ImageData(clamped, width, height)
    ctx.putImageData(imageData, 0, 0)
  }, [canvasRef, frameData, width, height])

  useEffect(() => {
    const tick = () => {
      drawFrame()
      animFrameRef.current = requestAnimationFrame(tick)
    }
    animFrameRef.current = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(animFrameRef.current)
    }
  }, [drawFrame])

  return { drawFrame }
}
