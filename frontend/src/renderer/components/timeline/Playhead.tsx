import { useCallback, useRef } from 'react'

interface PlayheadProps {
  time: number
  zoom: number
  scrollX: number
  onSeek: (time: number) => void
}

export default function Playhead({ time, zoom, scrollX, onSeek }: PlayheadProps) {
  const isDragging = useRef(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  const xPos = time * zoom - scrollX

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      isDragging.current = true
      const target = e.currentTarget as HTMLElement
      target.setPointerCapture(e.pointerId)

      // Find the timeline lanes container for coordinate calculation
      containerRef.current = target.closest('.timeline__lanes') as HTMLDivElement
    },
    [],
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const x = e.clientX - rect.left
      const newTime = Math.max(0, (x + scrollX) / zoom)
      onSeek(newTime)
    },
    [scrollX, zoom, onSeek],
  )

  const handlePointerUp = useCallback(() => {
    isDragging.current = false
    containerRef.current = null
  }, [])

  return (
    <div className="playhead" style={{ left: `${xPos}px` }}>
      <div
        className="playhead__head"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      />
    </div>
  )
}
