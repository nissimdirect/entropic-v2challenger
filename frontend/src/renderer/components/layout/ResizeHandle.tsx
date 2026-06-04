import React, { useCallback, useRef } from 'react'

export interface ResizeHandleProps {
  /** 'col' = vertical divider (drag changes width); 'row' = horizontal divider (drag changes height). */
  orientation: 'col' | 'row'
  /** Called during drag with the movement delta (px) along the resize axis since the last move. */
  onDelta: (deltaPx: number) => void
  /** Called once when the drag gesture ends (pointerup / cancel). */
  onDragEnd?: () => void
  ariaLabel: string
}

/**
 * Fat-target resize handle (PLAN §3.3, Fitts' Law).
 *
 * Visible bar is 6px; the CSS owns a 16px `pointer-events: auto` hit zone via the
 * `.creatrix-resize-handle--col/--row` classes. We never write CSS here — only class
 * names. Drag uses pointer capture so movement is tracked even when the cursor leaves
 * the thin bar, following the canonical pattern used by Slider/Knob in this repo.
 */
export default function ResizeHandle({
  orientation,
  onDelta,
  onDragEnd,
  ariaLabel,
}: ResizeHandleProps) {
  // Last pointer position along the resize axis. Ref (not state) so we don't re-render per move.
  const lastPos = useRef<number | null>(null)

  const axisCoord = useCallback(
    (e: PointerEvent | React.PointerEvent) =>
      orientation === 'col' ? e.clientX : e.clientY,
    [orientation]
  )

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      if (lastPos.current === null) return
      const pos = axisCoord(e)
      // Guard against NaN coordinates (happy-dom / synthetic events can omit them).
      if (!Number.isFinite(pos)) return
      const delta = pos - lastPos.current
      lastPos.current = pos
      if (delta !== 0) onDelta(delta)
    },
    [axisCoord, onDelta]
  )

  const endDrag = useCallback(() => {
    if (lastPos.current === null) return
    lastPos.current = null
    window.removeEventListener('pointermove', handlePointerMove)
    window.removeEventListener('pointerup', endDrag)
    window.removeEventListener('pointercancel', endDrag)
    onDragEnd?.()
  }, [handlePointerMove, onDragEnd])

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return
      e.preventDefault()
      const pos = axisCoord(e)
      lastPos.current = Number.isFinite(pos) ? pos : 0
      try {
        ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
      } catch {
        // setPointerCapture may be unavailable in some test envs — drag still works via window listeners.
      }
      window.addEventListener('pointermove', handlePointerMove)
      window.addEventListener('pointerup', endDrag)
      window.addEventListener('pointercancel', endDrag)
    },
    [axisCoord, handlePointerMove, endDrag]
  )

  return (
    <div
      className={`creatrix-resize-handle creatrix-resize-handle--${orientation}`}
      role="separator"
      aria-orientation={orientation === 'col' ? 'vertical' : 'horizontal'}
      aria-label={ariaLabel}
      tabIndex={0}
      onPointerDown={handlePointerDown}
    />
  )
}
